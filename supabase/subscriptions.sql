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
  provider        TEXT NOT NULL DEFAULT 'moneroo',
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
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
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
$$;

GRANT EXECUTE ON FUNCTION get_active_subscription(UUID) TO anon, authenticated;

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

GRANT EXECUTE ON FUNCTION count_documents_this_period(UUID) TO authenticated;

-- =====================================================================
-- FONCTION — compte des utilisateurs d'une organisation.
-- =====================================================================
CREATE OR REPLACE FUNCTION count_users(p_org_id UUID)
RETURNS INT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT FROM profiles WHERE organization_id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION count_users(UUID) TO authenticated;

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
-- =====================================================================
CREATE OR REPLACE FUNCTION sweep_subscriptions()
RETURNS TABLE (expired INT, abandoned INT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_expired   INT;
  v_abandoned INT;
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

  -- Le paiement suit l'abonnement : laisser l'un « en attente » quand
  -- l'autre est abandonné rendrait le journal incohérent.
  UPDATE payments
     SET status = 'expired'
   WHERE status = 'pending'
     AND created_at < NOW() - INTERVAL '24 hours';

  WITH done AS (
    UPDATE subscriptions
       SET status = 'cancelled', cancelled_at = NOW()
     WHERE status = 'pending'
       AND created_at < NOW() - INTERVAL '24 hours'
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_abandoned FROM done;

  RETURN QUERY SELECT v_expired, v_abandoned;
END;
$$;

REVOKE EXECUTE ON FUNCTION sweep_subscriptions() FROM anon, authenticated;

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
REVOKE EXECUTE ON FUNCTION confirm_payment(TEXT, TEXT) FROM anon, authenticated;

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

REVOKE EXECUTE ON FUNCTION fail_payment(TEXT, payment_status) FROM anon, authenticated;
