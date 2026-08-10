-- =====================================================================
-- CaisseOps — Abonnements, plans et paiements CinetPay (Sandbox)
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
-- PAYMENTS — une transaction CinetPay, du pending au paid.
-- =====================================================================
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  plan_id         UUID NOT NULL REFERENCES plans(id),
  -- L'identifiant unique côté CinetPay : notre clé d'idempotence.
  transaction_id  TEXT NOT NULL UNIQUE,
  amount          NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'XOF',
  provider        TEXT NOT NULL DEFAULT 'cinetpay',
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
-- PAYMENT_EVENTS — journal brut des notifications CinetPay.
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
CREATE OR REPLACE FUNCTION get_active_subscription(p_org_id UUID)
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
  status subscription_status,
  expires_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, p.id, p.slug, p.name, p.price, p.currency,
         p.document_limit, p.user_limit,
         p.is_unlimited_documents, p.is_unlimited_users, p.is_launch_offer,
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
