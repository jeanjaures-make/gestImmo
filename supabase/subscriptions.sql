-- =====================================================================
-- CaisseOps — Abonnements, plans et paiements
--
-- À exécuter dans l'éditeur SQL de Supabase, après `schema.sql`.
--
-- Principes :
--   1. Les plans sont en base — jamais codés en dur dans le frontend.
--   2. L'abonnement appartient à l'ORGANISATION, pas à l'utilisateur.
--   3. Le prix vient de la table `plans`, jamais du navigateur.
--   4. Le webhook est idempotent : un même événement reçu deux fois ne
--      active pas deux abonnements.
--   5. RLS activé partout, comme le reste du schéma.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GARDE-FOU — ce script suppose `schema.sql` déjà joué sur CETTE base.
--
-- Sans lui, la première référence à `organizations` échoue sur un
-- « 42P01 : la relation organizations n'existe pas » qui ne dit ni
-- pourquoi, ni sur quelle base, ni avec quel search_path. L'éditeur SQL
-- de Supabase joue le collage en UNE transaction : l'échec annule tout,
-- y compris ce qui semblait avoir réussi avant.
--
-- Causes déjà rencontrées : une branche de base sélectionnée dans le
-- tableau de bord (copie fraîche, sans schema.sql), un autre projet que
-- celui de l'application, ou un `search_path` sans `public`.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION
      'supabase/schema.sql n''a pas été joué sur cette base : la table « organizations » est absente. Jouez-le d''abord, puis relancez ce script. Base = %, rôle = %, search_path = %, tables publiques = %',
      current_database(),
      current_user,
      current_setting('search_path'),
      (SELECT count(*) FROM pg_tables WHERE schemaname = 'public');
  END IF;

  -- `organizations` existe, mais ce script la nomme sans schéma —
  -- comme tout le reste du fichier. Si `public` manque au search_path
  -- de la session, la résolution échoue quand même, et l'erreur brute
  -- accuse la table plutôt que le réglage.
  IF to_regclass('organizations') IS NULL THEN
    RAISE EXCEPTION
      '« public » est absent du search_path de cette session : la table « organizations » existe mais reste introuvable sans schéma. Lancez d''abord SET search_path = public; dans le même onglet, puis relancez ce script. search_path = %',
      current_setting('search_path');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE billing_interval AS ENUM ('month');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('pending', 'active', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- PLANS — la source de vérité pour les prix et les limites.
-- =====================================================================
CREATE TABLE IF NOT EXISTS plans (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   TEXT NOT NULL CHECK (length(trim(name)) > 0),
  slug                   TEXT NOT NULL UNIQUE,
  description            TEXT NOT NULL DEFAULT '',
  price                  NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
  currency               TEXT NOT NULL DEFAULT 'XOF',
  billing_interval       billing_interval NOT NULL DEFAULT 'month',
  duration_days          INT NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  document_limit         INT,  -- NULL = illimité
  user_limit             INT,  -- NULL = illimité
  is_unlimited_documents BOOLEAN NOT NULL DEFAULT false,
  is_unlimited_users     BOOLEAN NOT NULL DEFAULT false,
  is_launch_offer        BOOLEAN NOT NULL DEFAULT false,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Le journal d'audit consultable est une fonctionnalité d'offre, pas un
-- mécanisme technique : les écritures continuent d'être tracées pour
-- tout le monde, y compris sur Starter. Seule la consultation dépend du
-- plan — de sorte qu'une montée en gamme révèle l'historique déjà
-- constitué, au lieu de repartir d'une page vide.
--
-- Colonne plutôt que liste de slugs dans le code : le marketing peut
-- ouvrir l'audit à Starter par un UPDATE, sans redéploiement.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS has_audit_log BOOLEAN NOT NULL DEFAULT true;

UPDATE plans SET has_audit_log = false WHERE slug = 'starter';

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Les plans sont lisibles par tout utilisateur authentifié : il faut
-- bien qu'ils s'affichent sur /subscribe. Aucun écriture depuis le
-- client : l'administrateur les gère en SQL.
DROP POLICY IF EXISTS plans_select ON plans;
CREATE POLICY plans_select ON plans
  FOR SELECT USING (is_active = true);

-- ---------------------------------------------------------------------
-- Plans officiels CaisseOps.
-- Idempotent : ON CONFLICT DO NOTHING pour ne pas dupliquer.
-- ---------------------------------------------------------------------
INSERT INTO plans (
  slug, name, description, price, currency, billing_interval,
  duration_days, document_limit, user_limit,
  is_unlimited_documents, is_unlimited_users, is_launch_offer, is_active
) VALUES
  (
    'starter', 'Starter',
    'Pour démarrer : jusqu''à 100 pièces par mois, 1 utilisateur.',
    3000, 'XOF', 'month', 30, 100, 1, false, false, false, true
  ),
  (
    'business', 'Business',
    'Pour les équipes : jusqu''à 1 000 pièces par mois, 5 utilisateurs, rôles et journal d''audit.',
    6000, 'XOF', 'month', 30, 1000, 5, false, false, false, true
  ),
  (
    'unlimited', 'Illimité',
    'Offre de lancement : pièces illimitées, utilisateurs illimités, accompagnement à la reprise de données.',
    10000, 'XOF', 'month', 30, NULL, NULL, true, true, true, true
  )
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- SUBSCRIPTIONS — l'abonnement actif d'une organisation.
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id         UUID NOT NULL REFERENCES plans(id),
  status          subscription_status NOT NULL DEFAULT 'pending',
  started_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_organization_idx
  ON subscriptions (organization_id, created_at DESC);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Une organisation ne voit que ses abonnements. L'écriture se fait via
-- le client admin (webhook) ou par le propriétaire (création pending).
DROP POLICY IF EXISTS subscriptions_select ON subscriptions;
CREATE POLICY subscriptions_select ON subscriptions
  FOR SELECT USING (organization_id = (SELECT current_organization_id()));

DROP POLICY IF EXISTS subscriptions_insert ON subscriptions;
CREATE POLICY subscriptions_insert ON subscriptions
  FOR INSERT WITH CHECK (
    organization_id = (SELECT current_organization_id())
    AND (SELECT has_role('owner'))
  );

-- L'UPDATE est réservé au client admin (webhook) : pas de policy
-- applicative. Le webhook contourne le RLS via createAdminClient().

-- =====================================================================
-- PAYMENTS — une transaction chez le fournisseur, du pending au paid.
-- =====================================================================
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  plan_id         UUID NOT NULL REFERENCES plans(id),
  -- L'identifiant de la transaction CHEZ LE FOURNISSEUR, et notre clé
  -- d'idempotence. Il porte d'abord notre référence interne — la colonne
  -- est NOT NULL et l'identifiant du fournisseur n'existe qu'après
  -- l'appel — puis celui-ci le remplace.
  transaction_id  TEXT NOT NULL UNIQUE,
  amount          NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'XOF',
  provider        TEXT NOT NULL DEFAULT 'chariow',
  payment_method  TEXT,
  status          payment_status NOT NULL DEFAULT 'pending',
  paid_at         TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_organization_idx
  ON payments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_transaction_idx
  ON payments (transaction_id);
CREATE INDEX IF NOT EXISTS payments_subscription_idx
  ON payments (subscription_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments
  FOR SELECT USING (organization_id = (SELECT current_organization_id()));

DROP POLICY IF EXISTS payments_insert ON payments;
CREATE POLICY payments_insert ON payments
  FOR INSERT WITH CHECK (
    organization_id = (SELECT current_organization_id())
    AND (SELECT has_role('owner'))
  );

-- L'UPDATE est réservé au client admin (webhook).

-- =====================================================================
-- PAYMENT_EVENTS — journal brut des notifications du fournisseur.
--
-- Idempotence : si le même payload arrive deux fois, on l'enregistre
-- mais on ne rejoue pas l'activation. La présence de l'événement est
-- la preuve qu'il a été traité.
-- =====================================================================
CREATE TABLE IF NOT EXISTS payment_events (
  id             BIGSERIAL PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  event_type     TEXT NOT NULL DEFAULT 'notification',
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_events_transaction_idx
  ON payment_events (transaction_id, created_at DESC);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
-- Aucune policy : inaccessible aux clients. Seul le client admin écrit.

-- =====================================================================
-- GARDE DE PÉRIMÈTRE — un identifiant d'organisation n'est pas un droit.
--
-- Les trois fonctions qui suivent prennent un `organization_id` en
-- paramètre et sont SECURITY DEFINER : le RLS ne s'y applique donc PAS.
-- Rien n'obligeait l'appelant à demander SA propre organisation. Un
-- client authentifié pouvait lire le plan, le tarif et l'échéance d'une
-- entreprise concurrente, son nombre d'utilisateurs et son volume de
-- pièces émises — s'il en connaissait l'UUID, ce qu'un ancien
-- collaborateur retient sans effort.
--
-- Le paramètre reste : le serveur en a besoin, lui qui agit hors session.
-- Mais il n'est libre que pour `service_role`. Sous une session, il doit
-- désigner l'organisation de l'appelant, sans quoi la fonction refuse —
-- bruyamment. Rendre zéro serait pire que le mal : un « 0 pièce émise »
-- se confondrait avec un quota intact, et une lecture illégitime
-- passerait pour une réponse normale.
--
-- Le rôle se lit dans les revendications du jeton, et non dans
-- `current_user` : à l'intérieur d'une fonction SECURITY DEFINER, celui-ci
-- désigne le PROPRIÉTAIRE de la fonction, jamais l'appelant.
-- =====================================================================
CREATE OR REPLACE FUNCTION assert_own_organization(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) = 'service_role' THEN
    RETURN;
  END IF;

  IF p_org_id IS DISTINCT FROM current_organization_id() THEN
    RAISE EXCEPTION 'Organisation hors périmètre.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION assert_own_organization(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION assert_own_organization(UUID) TO authenticated, service_role;

-- =====================================================================
-- FONCTION — abonnement actif d'une organisation.
--
-- Retourne l'abonnement non expiré le plus récent, avec le plan joint.
-- SECURITY DEFINER pour éviter la récursion RLS (plans est lisible par
-- les authentifiés, mais la fonction est appelée par le client admin
-- lors du webhook, qui n'a pas de session utilisateur).
-- =====================================================================
-- DROP avant CREATE : PostgreSQL refuse de remplacer une fonction dont
-- le type de retour change, et ce script doit rester rejouable sur une
-- base où la version précédente existe déjà.
DROP FUNCTION IF EXISTS get_active_subscription(UUID);

CREATE FUNCTION get_active_subscription(p_org_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_id UUID,
  plan_slug TEXT,
  plan_name TEXT,
  price NUMERIC(14, 2),
  currency TEXT,
  document_limit INT,
  user_limit INT,
  is_unlimited_documents BOOLEAN,
  is_unlimited_users BOOLEAN,
  is_launch_offer BOOLEAN,
  has_audit_log BOOLEAN,
  status subscription_status,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_own_organization(p_org_id);

  RETURN QUERY
  SELECT s.id, p.id, p.slug, p.name, p.price, p.currency,
         p.document_limit, p.user_limit,
         p.is_unlimited_documents, p.is_unlimited_users, p.is_launch_offer,
         p.has_audit_log,
         s.status, s.expires_at
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_org_id
    AND s.status = 'active'
    AND s.expires_at > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

-- `anon` n'a jamais eu de raison de lire un abonnement, et le GRANT
-- nominatif ne suffisait pas à l'en écarter : le droit par défaut de
-- PUBLIC subsistait derrière lui.
REVOKE EXECUTE ON FUNCTION get_active_subscription(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_active_subscription(UUID) TO authenticated, service_role;

-- =====================================================================
-- FONCTION — compte des pièces émises sur la période en cours.
--
-- La période est celle de l'abonnement actif : du started_at au
-- expires_at. Si l'abonnement n'a pas de started_at (cas théorique),
-- on retombe sur le mois courant.
-- =====================================================================
CREATE OR REPLACE FUNCTION count_documents_this_period(p_org_id UUID)
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_started TIMESTAMPTZ;
  v_expires TIMESTAMPTZ;
  v_count   INT := 0;
  v_sub     RECORD;
BEGIN
  PERFORM assert_own_organization(p_org_id);

  SELECT s.started_at, s.expires_at
    INTO v_started, v_expires
  FROM subscriptions s
  WHERE s.organization_id = p_org_id
    AND s.status = 'active'
    AND s.expires_at > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Si started_at est nul, on prend le début du mois courant.
  v_started := COALESCE(v_started, date_trunc('month', NOW()));

  SELECT
    (SELECT COUNT(*) FROM receipts      WHERE organization_id = p_org_id AND created_at >= v_started AND created_at < v_expires)
  + (SELECT COUNT(*) FROM cash_vouchers WHERE organization_id = p_org_id AND created_at >= v_started AND created_at < v_expires)
  + (SELECT COUNT(*) FROM delivery_notes WHERE organization_id = p_org_id AND created_at >= v_started AND created_at < v_expires)
  INTO v_count;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION count_documents_this_period(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION count_documents_this_period(UUID) TO authenticated, service_role;

-- =====================================================================
-- FONCTION — compte des utilisateurs d'une organisation.
-- =====================================================================
CREATE OR REPLACE FUNCTION count_users(p_org_id UUID)
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_own_organization(p_org_id);
  RETURN (SELECT COUNT(*)::INT FROM profiles WHERE organization_id = p_org_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION count_users(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION count_users(UUID) TO authenticated, service_role;

-- =====================================================================
-- TRIGGER — updated_at automatique sur subscriptions et payments.
-- =====================================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_touch ON subscriptions;
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS payments_touch ON payments;
CREATE TRIGGER payments_touch BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =====================================================================
-- CONFIRMATION D'UN PAIEMENT — le seul chemin qui active un abonnement.
--
-- ─── Pourquoi en SQL et non dans la route ──────────────────────────────
-- L'ancienne version enchaînait, côté Node : lire le paiement, vérifier
-- qu'il n'était pas déjà réglé, l'écrire, chercher l'abonnement en cours,
-- calculer la date, écrire. Six allers-retours, aucune transaction. Deux
-- notifications arrivant ensemble — ce que Moneroo fait, puisqu'il rejoue
-- jusqu'à trois fois — franchissaient toutes deux le contrôle avant que
-- l'une ait écrit : deux activations, soixante jours vendus pour trente.
--
-- Ici, `FOR UPDATE` verrouille la ligne de paiement le temps de la
-- transaction. La deuxième notification attend, relit `status = 'paid'`
-- et repart sans rien faire. L'idempotence n'est plus une intention mais
-- une propriété de la base.
--
-- ─── Ce que la fonction corrige aussi ──────────────────────────────────
-- Un renouvellement laissait DEUX abonnements actifs : le nouveau portait
-- la date prolongée, l'ancien restait « actif » avec la sienne. Rien ne
-- le voyait, parce que la lecture prend le plus récent — mais l'export,
-- le décompte et l'inspection de la table, eux, voyaient double.
-- L'ancien est désormais clos explicitement.
--
-- ─── Report des jours restants ─────────────────────────────────────────
-- On repart de la plus lointaine des deux dates : maintenant, ou
-- l'échéance en cours. Payer le 15 quand on est couvert jusqu'au 20
-- reporte donc au 20 du mois suivant, jamais au 15 : les jours déjà
-- réglés ne se perdent pas.
-- =====================================================================
CREATE OR REPLACE FUNCTION confirm_payment(
  p_transaction_id TEXT,
  p_method         TEXT DEFAULT NULL
)
RETURNS TABLE (
  outcome         TEXT,
  subscription_id UUID,
  expires_at      TIMESTAMPTZ
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment  RECORD;
  v_duration INT;
  v_base     TIMESTAMPTZ;
  v_expires  TIMESTAMPTZ;
  v_sub      UUID;
BEGIN
  SELECT p.* INTO v_payment
  FROM payments p
  WHERE p.transaction_id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Déjà traité : on ressort la période en place, sans la prolonger.
  IF v_payment.status = 'paid' THEN
    SELECT s.id, s.expires_at INTO v_sub, v_expires
    FROM subscriptions s WHERE s.id = v_payment.subscription_id;
    RETURN QUERY SELECT 'already_paid'::TEXT, v_sub, v_expires;
    RETURN;
  END IF;

  SELECT pl.duration_days INTO v_duration
  FROM plans pl WHERE pl.id = v_payment.plan_id;
  v_duration := COALESCE(v_duration, 30);

  -- La plus lointaine échéance encore valable de l'organisation.
  SELECT MAX(s.expires_at) INTO v_base
  FROM subscriptions s
  WHERE s.organization_id = v_payment.organization_id
    AND s.status = 'active'
    AND s.expires_at > NOW();

  v_base := GREATEST(COALESCE(v_base, NOW()), NOW());
  v_expires := v_base + (v_duration || ' days')::INTERVAL;

  UPDATE payments
     SET status = 'paid',
         paid_at = NOW(),
         payment_method = COALESCE(p_method, payment_method)
   WHERE id = v_payment.id;

  -- Clore l'abonnement précédent : sa durée a été reportée sur le
  -- nouveau, le laisser « actif » ferait compter deux fois.
  UPDATE subscriptions
     SET status = 'cancelled', cancelled_at = NOW()
   WHERE organization_id = v_payment.organization_id
     AND status = 'active'
     AND id IS DISTINCT FROM v_payment.subscription_id;

  UPDATE subscriptions
     SET status = 'active',
         started_at = NOW(),
         expires_at = v_expires
   WHERE id = v_payment.subscription_id
  RETURNING id INTO v_sub;

  RETURN QUERY SELECT 'activated'::TEXT, v_sub, v_expires;
END;
$$;

-- Seule la clé de service appelle cette fonction, depuis le webhook.
REVOKE EXECUTE ON FUNCTION confirm_payment(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION confirm_payment(TEXT, TEXT) TO service_role;

-- =====================================================================
-- ÉCHEC D'UN PAIEMENT — refus, annulation, montant divergent.
--
-- L'abonnement en attente est clos en même temps : sans cela il traînait
-- jusqu'au balayage quotidien, et l'écran d'abonnement montrait pendant
-- des heures une souscription qui n'aboutirait jamais.
-- =====================================================================
CREATE OR REPLACE FUNCTION fail_payment(
  p_transaction_id TEXT,
  p_status         payment_status DEFAULT 'failed'
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub UUID;
BEGIN
  UPDATE payments
     SET status = p_status
   WHERE transaction_id = p_transaction_id
     AND status = 'pending'
  RETURNING subscription_id INTO v_sub;

  IF v_sub IS NOT NULL THEN
    UPDATE subscriptions
       SET status = 'cancelled', cancelled_at = NOW()
     WHERE id = v_sub AND status = 'pending';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION fail_payment(TEXT, payment_status) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fail_payment(TEXT, payment_status) TO service_role;

-- =====================================================================
-- INSCRIPTION SUBORDONNÉE AU PAIEMENT
--
-- Jusqu'ici, l'organisation et le compte Supabase Auth naissaient à
-- l'inscription — avant tout paiement. Un visiteur obtenait donc un
-- compte pleinement utilisable (tableau de bord, réglages, équipe) sans
-- avoir jamais payé ; seule l'émission de pièces restait bloquée par le
-- quota. C'est un compte gratuit déguisé en essai bloqué.
--
-- Principe : AUCUNE ligne dans `organizations` ou `profiles` n'existe
-- avant que Moneroo ait confirmé l'encaissement. Ce que l'inscription
-- produit avant paiement, c'est une INTENTION — une simple déclaration
-- d'intérêt, sans le moindre pouvoir d'accès.
--
-- ─── Pourquoi aucun mot de passe n'est jamais stocké ────────────────────
-- Le compte réel ne peut naître qu'à la confirmation du webhook — un
-- événement serveur, asynchrone, qui ne connaît rien du navigateur qui a
-- payé. Demander un mot de passe AVANT paiement obligerait à le
-- conserver quelque part en attendant : chiffré ou non, c'est un risque
-- que rien n'oblige à prendre. La solution déjà en place ailleurs dans ce
-- schéma — l'invitation d'un collaborateur — s'y prête exactement :
-- `generateLink(type:'invite')` crée le compte SANS mot de passe, et la
-- personne en choisit un après coup, sur un écran qu'elle atteint via un
-- lien à usage unique. Le paiement confirmé ouvre ce même chemin.
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE signup_intent_status AS ENUM
    ('pending', 'paid', 'active', 'failed', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS signup_intents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT NOT NULL,
  org_name        TEXT NOT NULL,
  plan_id         UUID NOT NULL REFERENCES plans(id),
  status          signup_intent_status NOT NULL DEFAULT 'pending',
  -- Posés uniquement une fois le compte réellement provisionné.
  user_id         UUID,
  organization_id UUID REFERENCES organizations(id),
  -- Verrou à usage unique : la session ne s'ouvre qu'une fois par
  -- intention, même si le lien de retour est ouvert deux fois (onglet
  -- dupliqué, bouton Précédent, historique du navigateur).
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Une seule intention ouverte par adresse : sans cette contrainte, deux
-- inscriptions concurrentes pour le même e-mail atteindraient toutes deux
-- le paiement, et la seconde à confirmer se heurterait à un compte
-- Supabase Auth déjà créé par la première — silencieusement, côté webhook.
CREATE UNIQUE INDEX IF NOT EXISTS signup_intents_open_email_idx
  ON signup_intents (lower(email))
  WHERE status IN ('pending', 'paid');

CREATE INDEX IF NOT EXISTS signup_intents_created_idx
  ON signup_intents (created_at);

ALTER TABLE signup_intents ENABLE ROW LEVEL SECURITY;
-- Aucune policy : avant paiement, personne n'a de session pour en
-- réclamer une — et après, la lecture passe par `/api/signup/status`
-- (client admin, réponse réduite à un statut). Même posture que
-- `payment_events` : une table que seul le service_role touche.

DROP TRIGGER IF EXISTS signup_intents_touch ON signup_intents;
CREATE TRIGGER signup_intents_touch BEFORE UPDATE ON signup_intents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------
-- PAYMENTS — une transaction peut désormais précéder l'organisation.
--
-- `organization_id` n'est plus NOT NULL : à la création d'une intention,
-- aucune organisation n'existe. `intent_id` porte le lien ; il reste NULL
-- pour tout paiement du flux existant (changement de plan par un
-- propriétaire déjà connecté), qui continue de fonctionner sans aucune
-- modification.
-- ---------------------------------------------------------------------
ALTER TABLE payments ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS intent_id UUID REFERENCES signup_intents(id);

CREATE INDEX IF NOT EXISTS payments_intent_idx ON payments (intent_id);

-- =====================================================================
-- CONFIRMATION D'UN PAIEMENT D'INSCRIPTION.
--
-- Même verrou que `confirm_payment` (`FOR UPDATE`, le temps d'une seule
-- transaction implicite) : deux notifications Moneroo simultanées pour la
-- même transaction ne peuvent pas toutes deux obtenir 'confirmed'. Celle
-- qui perd la course voit le paiement déjà 'paid' et repart sans agir —
-- c'est ce qui empêche un webhook rejoué de produire un second compte.
--
-- Cette fonction ne crée ni compte ni organisation : le SQL ne peut pas
-- créer un utilisateur Supabase Auth (c'est l'API d'administration, côté
-- Node, qui s'en charge). Elle se contente de faire passer le PAIEMENT à
-- 'paid' et l'INTENTION à 'paid', puis rend au serveur ce qu'il faut pour
-- provisionner le compte à l'étape suivante.
-- =====================================================================
CREATE OR REPLACE FUNCTION confirm_signup_payment(
  p_transaction_id TEXT,
  p_method         TEXT DEFAULT NULL
)
RETURNS TABLE (
  outcome         TEXT,   -- unknown | already_active | already_paid | confirmed
  intent_id       UUID,
  email           TEXT,
  org_name        TEXT,
  plan_id         UUID,
  organization_id UUID
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment RECORD;
  v_intent  RECORD;
BEGIN
  SELECT p.* INTO v_payment
  FROM payments p
  WHERE p.transaction_id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.intent_id IS NULL THEN
    -- `intent_id IS NULL` : ce n'est pas un paiement d'inscription — le
    -- webhook doit continuer sur le chemin `confirm_payment` existant.
    RETURN QUERY SELECT 'unknown'::TEXT, NULL::UUID, NULL::TEXT,
      NULL::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  SELECT * INTO v_intent FROM signup_intents WHERE id = v_payment.intent_id
  FOR UPDATE;

  IF v_intent.status = 'active' THEN
    RETURN QUERY SELECT 'already_active'::TEXT, v_intent.id, v_intent.email,
      v_intent.org_name, v_intent.plan_id, v_intent.organization_id;
    RETURN;
  END IF;

  IF v_payment.status = 'paid' THEN
    -- Payé, mais le provisionnement n'a pas (encore) fini — crash entre
    -- les deux étapes Node, ou une autre livraison est en train de le
    -- faire. Le serveur retente le provisionnement ; c'est sans risque,
    -- `provision_signup_intent` vérifie lui aussi son propre statut.
    RETURN QUERY SELECT 'already_paid'::TEXT, v_intent.id, v_intent.email,
      v_intent.org_name, v_intent.plan_id, v_intent.organization_id;
    RETURN;
  END IF;

  UPDATE payments SET status = 'paid', paid_at = NOW(),
         payment_method = COALESCE(p_method, payment_method)
   WHERE id = v_payment.id;

  UPDATE signup_intents SET status = 'paid' WHERE id = v_intent.id;

  RETURN QUERY SELECT 'confirmed'::TEXT, v_intent.id, v_intent.email,
    v_intent.org_name, v_intent.plan_id, NULL::UUID;
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_signup_payment(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION confirm_signup_payment(TEXT, TEXT) TO service_role;

-- =====================================================================
-- PROVISIONNEMENT — organisation, profil propriétaire, abonnement actif.
--
-- Appelée par le serveur juste après avoir obtenu `p_user_id` via
-- `admin.auth.admin.generateLink({type:'invite'})` — c'est ce seul appel,
-- côté Node, qui crée le compte Supabase Auth ; cette fonction fait tout
-- le reste dans UNE transaction, pour qu'il n'existe jamais d'état
-- intermédiaire où l'un existerait sans l'autre.
--
-- Verrouille l'intention à son tour : si deux livraisons du webhook ont
-- chacune obtenu 'confirmed' puis 'already_paid' (fenêtre théorique,
-- fermée en pratique par le verrou de `confirm_signup_payment`), seule
-- la première ici fait le travail ; la seconde trouve `status <> 'paid'`
-- et ne recrée rien.
-- =====================================================================
CREATE OR REPLACE FUNCTION provision_signup_intent(
  p_intent_id UUID,
  p_user_id   UUID
)
RETURNS TABLE (
  outcome         TEXT,  -- provisioned | already_active | not_paid
  organization_id UUID,
  expires_at      TIMESTAMPTZ
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_intent   RECORD;
  v_org_id   UUID;
  v_duration INT;
  v_expires  TIMESTAMPTZ;
  v_base     TEXT;
  v_slug     TEXT;
  v_suffix   INT := 0;
BEGIN
  SELECT * INTO v_intent FROM signup_intents WHERE id = p_intent_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_paid'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_intent.status = 'active' THEN
    RETURN QUERY SELECT 'already_active'::TEXT, v_intent.organization_id, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_intent.status <> 'paid' THEN
    RETURN QUERY SELECT 'not_paid'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Même génération de slug que `create_organization`.
  v_base := trim(BOTH '-' FROM regexp_replace(lower(v_intent.org_name), '[^a-z0-9]+', '-', 'g'));
  IF v_base = '' THEN v_base := 'organisation'; END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix;
  END LOOP;

  INSERT INTO organizations (name, slug) VALUES (v_intent.org_name, v_slug)
  RETURNING id INTO v_org_id;

  INSERT INTO profiles (id, organization_id, firstname, lastname, email, role)
  VALUES (p_user_id, v_org_id, '', '', v_intent.email, 'owner');

  SELECT duration_days INTO v_duration FROM plans WHERE id = v_intent.plan_id;
  v_duration := COALESCE(v_duration, 30);
  v_expires := NOW() + (v_duration || ' days')::INTERVAL;

  INSERT INTO subscriptions (organization_id, plan_id, status, started_at, expires_at)
  VALUES (v_org_id, v_intent.plan_id, 'active', NOW(), v_expires);

  -- Le tout premier paiement de l'organisation lui est rattaché a
  -- posteriori : sans organisation à sa création, il n'avait pu l'être
  -- avant. Les renouvellements suivants, eux, en portent une dès le départ.
  UPDATE payments SET organization_id = v_org_id WHERE intent_id = p_intent_id;

  UPDATE signup_intents
     SET status = 'active', user_id = p_user_id, organization_id = v_org_id
   WHERE id = p_intent_id;

  RETURN QUERY SELECT 'provisioned'::TEXT, v_org_id, v_expires;
END;
$$;

REVOKE EXECUTE ON FUNCTION provision_signup_intent(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION provision_signup_intent(UUID, UUID) TO service_role;

-- =====================================================================
-- ÉCHEC D'UN PAIEMENT D'INSCRIPTION — refus, annulation.
--
-- Ne régresse jamais une intention déjà 'active' : une notification
-- d'échec arrivant en retard, après qu'une autre déjà réussie a fait
-- naître le compte, ne doit pas le remettre en cause.
-- =====================================================================
CREATE OR REPLACE FUNCTION fail_signup_intent(
  p_transaction_id TEXT,
  p_status         payment_status DEFAULT 'failed'
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_intent_id UUID;
BEGIN
  UPDATE payments
     SET status = p_status
   WHERE transaction_id = p_transaction_id
     AND status = 'pending'
  RETURNING intent_id INTO v_intent_id;

  IF v_intent_id IS NOT NULL THEN
    -- Le CASE doit être casté explicitement. Sans cela PostgreSQL rend
    -- du TEXT, refuse de l'affecter à une colonne ENUM, et fait échouer
    -- la fonction ENTIÈRE — l'écriture du paiement comprise, puisque
    -- tout se joue dans une seule transaction. Un paiement refusé
    -- restait alors « en attente » des deux côtés, et le balayage
    -- quotidien tombait avec, lui qui appelle cette même fonction.
    UPDATE signup_intents
       SET status = (CASE p_status
                       WHEN 'cancelled' THEN 'cancelled'
                       WHEN 'expired'   THEN 'expired'
                       ELSE 'failed'
                     END)::signup_intent_status
     WHERE id = v_intent_id
       AND status NOT IN ('active');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION fail_signup_intent(TEXT, payment_status) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fail_signup_intent(TEXT, payment_status) TO service_role;

-- =====================================================================
-- CLAIM — ouvre la session, une seule fois par intention.
--
-- `claimed_at` est posé de façon atomique par l'UPDATE lui-même (clause
-- WHERE incluse) : deux requêtes de réclamation simultanées pour la même
-- intention ne peuvent pas toutes deux réussir. La première gagne, pose
-- le verrou ; la seconde ne touche aucune ligne et repart bredouille.
-- =====================================================================
CREATE OR REPLACE FUNCTION claim_signup_intent(p_intent_id UUID)
RETURNS TABLE (claimed BOOLEAN, email TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT;
BEGIN
  UPDATE signup_intents
     SET claimed_at = NOW()
   WHERE id = p_intent_id
     AND status = 'active'
     AND claimed_at IS NULL
  RETURNING signup_intents.email INTO v_email;

  IF v_email IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT true, v_email;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_signup_intent(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION claim_signup_intent(UUID) TO service_role;

-- =====================================================================
-- STATUT PUBLIC D'UNE INTENTION — lu par /api/signup/status.
--
-- Ne rend qu'un statut : ni l'e-mail, ni le nom de l'entreprise, ni aucun
-- identifiant. La page qui l'interroge n'a pas de session ; le `ref` de
-- l'URL est la seule chose qui la relie à sa propre inscription, et il ne
-- doit pas suffire à apprendre quoi que ce soit sur celle d'un autre.
-- =====================================================================
CREATE OR REPLACE FUNCTION signup_intent_status(p_intent_id UUID)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status::TEXT FROM signup_intents WHERE id = p_intent_id;
$$;

REVOKE EXECUTE ON FUNCTION signup_intent_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION signup_intent_status(UUID) TO service_role;

-- =====================================================================
-- BALAYAGE — remet les statuts en accord avec l'horloge.
--
-- Aucune lecture de l'application ne dépend de cette fonction : partout
-- la validité se juge sur `expires_at > NOW()`, jamais sur la colonne
-- `status`. Un abonnement échu cesse donc d'ouvrir des droits à la
-- seconde près, balayage ou pas.
--
-- Ce que la fonction corrige, c'est l'écart entre la base et sa propre
-- description : une ligne « active » dont la date est passée se lit mal,
-- fausse un export, et induit en erreur qui inspecte la table.
--
-- Elle abandonne aussi les tentatives de paiement restées en plan. Un
-- clic sur « Commencer » suivi d'une fermeture d'onglet laisse un
-- abonnement `pending` et un paiement `pending` que rien ne viendra
-- jamais confirmer : au bout de 24 heures, la fenêtre de paiement de
-- paiement du fournisseur est close, la tentative est perdue pour de bon.
--
-- SECURITY DEFINER, sans droit d'exécution pour `authenticated` : seule
-- la clé de service peut l'appeler.
--
-- ─── Les intentions d'inscription abandonnées ──────────────────────────
-- Même délai (24 h) et même geste : une intention jamais payée, ou payée
-- puis jamais provisionnée (crash entre les deux étapes), passe à
-- `expired` plutôt que de rester indéfiniment `pending`/`paid`. Le
-- paiement associé suit, via `fail_signup_intent`.
--
-- ─── DROP, et une seule définition ─────────────────────────────────────
-- La fonction rend une colonne de plus qu'avant. `CREATE OR REPLACE` ne
-- sait pas changer un type de retour : il faut DROP d'abord. Et cette
-- définition doit rester la SEULE du fichier — en écrire une seconde,
-- plus haut, rendait le script non rejouable : au second passage, elle
-- tentait de ramener la fonction à son ancienne forme, et PostgreSQL
-- refusait (42P13), annulant tout le reste avec elle.
-- =====================================================================
DROP FUNCTION IF EXISTS sweep_subscriptions();

CREATE FUNCTION sweep_subscriptions()
RETURNS TABLE (expired INT, abandoned INT, expired_intents INT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_expired   INT;
  v_abandoned INT;
  v_intents   INT;
  v_tx        TEXT;
BEGIN
  WITH done AS (
    UPDATE subscriptions
       SET status = 'expired'
     WHERE status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_expired FROM done;

  UPDATE payments
     SET status = 'expired'
   WHERE status = 'pending'
     AND intent_id IS NULL
     AND created_at < NOW() - INTERVAL '24 hours';

  WITH done AS (
    UPDATE subscriptions
       SET status = 'cancelled', cancelled_at = NOW()
     WHERE status = 'pending'
       AND created_at < NOW() - INTERVAL '24 hours'
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_abandoned FROM done;

  v_intents := 0;
  FOR v_tx IN
    SELECT p.transaction_id
    FROM signup_intents si
    JOIN payments p ON p.intent_id = si.id
    WHERE si.status IN ('pending', 'paid')
      AND si.created_at < NOW() - INTERVAL '24 hours'
  LOOP
    PERFORM fail_signup_intent(v_tx, 'expired');
    v_intents := v_intents + 1;
  END LOOP;

  UPDATE signup_intents
     SET status = 'expired'
   WHERE status IN ('pending', 'paid')
     AND created_at < NOW() - INTERVAL '24 hours';

  RETURN QUERY SELECT v_expired, v_abandoned, v_intents;
END;
$$;

REVOKE EXECUTE ON FUNCTION sweep_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION sweep_subscriptions() TO service_role;
