-- =====================================================================
-- ImmoOps — Schéma V2 : plateforme multi-tenant par organisation
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- Si vous aviez déjà exécuté la V1 (modèle owner_id), lancez d'abord
-- `supabase/reset.sql` — la V1 et la V2 sont incompatibles.
--
-- Principes structurants :
--   1. `organization_id` sur TOUTES les tables métier.
--   2. Les clés étrangères composites (id, organization_id) rendent
--      structurellement impossible de rattacher une ligne d'une
--      organisation à une ligne d'une autre — ce n'est pas une règle
--      applicative, c'est une contrainte PostgreSQL.
--   3. RLS activé partout, avec des droits d'écriture par rôle.
--   4. Tout écrit métier est journalisé dans `audit_logs` par trigger.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- ENUMS — des valeurs fermées plutôt que du texte libre.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'manager', 'accountant', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE apartment_status AS ENUM ('vacant', 'occupied', 'maintenance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lease_status AS ENUM ('draft', 'active', 'ended', 'terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'partial', 'late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'resolved', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_owner_type AS ENUM ('organization', 'building', 'apartment', 'tenant', 'lease', 'expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_visibility AS ENUM ('private', 'organization');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE expense_category AS ENUM ('maintenance', 'taxes', 'insurance', 'utilities', 'management', 'works', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- TABLES
-- =====================================================================

-- --------------------------------------------------------------- ORGS
CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  slug       TEXT NOT NULL UNIQUE,
  logo_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  firstname       TEXT NOT NULL DEFAULT '',
  lastname        TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'viewer',
  avatar          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_organization_id_idx ON profiles (organization_id);

-- ---------------------------------------------------------- BUILDINGS
CREATE TABLE IF NOT EXISTS buildings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'France',
  photo           TEXT,
  -- Alimente le KPI « valeur estimée du patrimoine » et le rendement locatif.
  estimated_value NUMERIC(14, 2) CHECK (estimated_value IS NULL OR estimated_value >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Cible des clés étrangères composites : voir le commentaire d'en-tête.
  UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS buildings_organization_id_idx ON buildings (organization_id);

-- --------------------------------------------------------- APARTMENTS
CREATE TABLE IF NOT EXISTS apartments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  building_id     UUID NOT NULL,
  number          TEXT NOT NULL,
  floor           TEXT,
  surface         NUMERIC(10, 2) CHECK (surface IS NULL OR surface > 0),
  type            TEXT,
  status          apartment_status NOT NULL DEFAULT 'vacant',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  -- Un logement ne peut pointer que vers un immeuble de SA propre organisation.
  FOREIGN KEY (building_id, organization_id)
    REFERENCES buildings (id, organization_id) ON DELETE CASCADE,
  -- Contrainte métier : numéro unique par immeuble.
  UNIQUE (building_id, number)
);

CREATE INDEX IF NOT EXISTS apartments_organization_id_idx ON apartments (organization_id);
CREATE INDEX IF NOT EXISTS apartments_building_id_idx ON apartments (building_id);

-- ------------------------------------------------------------ TENANTS
CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  firstname       TEXT NOT NULL,
  lastname        TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  identity_number TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS tenants_organization_id_idx ON tenants (organization_id);

-- Un locataire peut disposer d'un compte pour accéder à son espace privé.
-- Le lien est porté par `profiles` et non par `tenants` : un locataire sans
-- compte reste parfaitement gérable, c'est le cas le plus courant.
--
-- Choix volontaire : PAS de valeur 'tenant' ajoutée à l'enum `user_role`.
-- `ALTER TYPE ... ADD VALUE` ne peut pas être suivi d'un usage de la
-- nouvelle valeur dans la même transaction — ce script deviendrait
-- non rejouable. La présence de `tenant_id` suffit à distinguer un
-- locataire d'un membre du personnel.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID UNIQUE REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS profiles_tenant_id_idx ON profiles (tenant_id);

-- ------------------------------------------------------------- LEASES
CREATE TABLE IF NOT EXISTS leases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL,
  apartment_id    UUID NOT NULL,
  rent            NUMERIC(12, 2) NOT NULL CHECK (rent >= 0),
  charges         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (charges >= 0),
  deposit         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  status          lease_status NOT NULL DEFAULT 'active',
  start_date      DATE NOT NULL,
  end_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (tenant_id, organization_id)
    REFERENCES tenants (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (apartment_id, organization_id)
    REFERENCES apartments (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT leases_dates_check CHECK (end_date IS NULL OR end_date > start_date)
);

CREATE INDEX IF NOT EXISTS leases_organization_id_idx ON leases (organization_id);
CREATE INDEX IF NOT EXISTS leases_tenant_id_idx ON leases (tenant_id);
CREATE INDEX IF NOT EXISTS leases_apartment_id_idx ON leases (apartment_id);

-- Contrainte métier : un seul bail actif par logement.
CREATE UNIQUE INDEX IF NOT EXISTS leases_one_active_per_apartment
  ON leases (apartment_id) WHERE status = 'active';

-- ------------------------------------------------------ RENT PAYMENTS
CREATE TABLE IF NOT EXISTS rent_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lease_id        UUID NOT NULL,
  -- Toujours normalisé au 1er du mois par un trigger : une échéance = un mois.
  month           DATE NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  amount_paid     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status          payment_status NOT NULL DEFAULT 'pending',
  payment_date    DATE,
  method          TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (lease_id, organization_id)
    REFERENCES leases (id, organization_id) ON DELETE CASCADE,
  UNIQUE (lease_id, month)
);

CREATE INDEX IF NOT EXISTS rent_payments_organization_id_idx ON rent_payments (organization_id);
CREATE INDEX IF NOT EXISTS rent_payments_lease_id_idx ON rent_payments (lease_id);
CREATE INDEX IF NOT EXISTS rent_payments_month_idx ON rent_payments (organization_id, month);

-- ----------------------------------------------------------- EXPENSES
CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  building_id     UUID NOT NULL,
  category        expense_category NOT NULL DEFAULT 'other',
  label           TEXT NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_path    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (building_id, organization_id)
    REFERENCES buildings (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS expenses_organization_id_idx ON expenses (organization_id);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (organization_id, expense_date);

-- -------------------------------------------------------- MAINTENANCE
CREATE TABLE IF NOT EXISTS maintenance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  building_id     UUID NOT NULL,
  apartment_id    UUID,
  title           TEXT NOT NULL,
  description     TEXT,
  priority        maintenance_priority NOT NULL DEFAULT 'medium',
  status          maintenance_status NOT NULL DEFAULT 'open',
  assigned_to     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (building_id, organization_id)
    REFERENCES buildings (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (apartment_id, organization_id)
    REFERENCES apartments (id, organization_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS maintenance_organization_id_idx ON maintenance (organization_id);
CREATE INDEX IF NOT EXISTS maintenance_open_idx
  ON maintenance (organization_id) WHERE status IN ('open', 'in_progress');

-- ---------------------------------------------------------- DOCUMENTS
CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_type      document_owner_type NOT NULL,
  owner_id        UUID NOT NULL,
  file_name       TEXT NOT NULL,
  storage_path    TEXT NOT NULL UNIQUE,
  mime_type       TEXT,
  size_bytes      BIGINT,
  visibility      document_visibility NOT NULL DEFAULT 'organization',
  uploaded_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_organization_id_idx ON documents (organization_id);
CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents (organization_id, owner_type, owner_id);

-- --------------------------------------------------------- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id        UUID,
  actor_email     TEXT,
  action          TEXT NOT NULL,
  entity          TEXT NOT NULL,
  entity_id       UUID,
  before_data     JSONB,
  after_data      JSONB,
  -- Liste des colonnes réellement modifiées : permet de filtrer et
  -- d'afficher un diff sans recalculer côté client.
  changed_fields  TEXT[],
  ip              TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_organization_idx
  ON audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs (organization_id, entity, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
  ON audit_logs (organization_id, actor_id, created_at DESC);

-- ------------------------------------------------------- LOGIN EVENTS
CREATE TABLE IF NOT EXISTS login_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID,
  email      TEXT,
  success    BOOLEAN NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS login_events_user_idx ON login_events (user_id, created_at DESC);

-- =====================================================================
-- FONCTIONS D'AIDE (SECURITY DEFINER pour éviter la récursion RLS)
-- =====================================================================

CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Vrai si le rôle courant fait partie de la liste passée.
CREATE OR REPLACE FUNCTION has_role(VARIADIC allowed user_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT current_user_role() = ANY(allowed);
$$;

-- ---------------------------------------------------------------------
-- Périmètre LOCATAIRE
--
-- Ces fonctions sont SECURITY DEFINER et renvoient des tableaux d'ids.
-- Écrire les policies avec des sous-requêtes sur `leases` déclencherait
-- l'évaluation en cascade du RLS de chaque table traversée : coûteux, et
-- source de récursion dès qu'une policy en référence une autre.
--
-- ⚠️ Elles renvoient un TABLEAU, pas un ensemble de lignes. On écrit donc
--    `x = ANY (tenant_lease_ids())`  ← comparaison à un tableau
--    et non
--    `x = ANY (SELECT tenant_lease_ids())`  ← sous-requête d'une ligne
-- La seconde forme demande à PostgreSQL de comparer un `uuid` à un
-- `uuid[]` et échoue à la création de la policy :
--   42883 — l'opérateur n'existe pas : uuid = uuid[]
-- Pour parcourir le tableau ligne à ligne, il faut `unnest()` explicite.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$;

-- Membre du personnel = rattaché à une organisation SANS être locataire.
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT current_organization_id() IS NOT NULL
     AND current_tenant_id() IS NULL;
$$;

CREATE OR REPLACE FUNCTION tenant_lease_ids()
RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(l.id), '{}')
  FROM leases l
  WHERE l.tenant_id = current_tenant_id();
$$;

CREATE OR REPLACE FUNCTION tenant_apartment_ids()
RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT l.apartment_id), '{}')
  FROM leases l
  WHERE l.tenant_id = current_tenant_id();
$$;

CREATE OR REPLACE FUNCTION tenant_building_ids()
RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT a.building_id), '{}')
  FROM apartments a
  WHERE a.id = ANY(tenant_apartment_ids());
$$;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Normalise une échéance sur le 1er du mois : `UNIQUE (lease_id, month)`
-- n'a de sens que si toutes les dates d'un même mois sont identiques.
CREATE OR REPLACE FUNCTION normalize_payment_month()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.month := date_trunc('month', NEW.month)::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rent_payments_normalize_month ON rent_payments;
CREATE TRIGGER rent_payments_normalize_month
  BEFORE INSERT OR UPDATE OF month ON rent_payments
  FOR EACH ROW EXECUTE FUNCTION normalize_payment_month();

-- Le statut du logement suit le cycle de vie du bail : c'est la règle
-- « clôturer un bail remet le logement en Libre », appliquée en base
-- pour qu'aucun chemin applicatif ne puisse l'oublier.
CREATE OR REPLACE FUNCTION sync_apartment_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE apartments SET status = 'occupied' WHERE id = NEW.apartment_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status <> 'active' THEN
    UPDATE apartments SET status = 'vacant'
    WHERE id = NEW.apartment_id
      AND status = 'occupied'
      AND NOT EXISTS (
        SELECT 1 FROM leases
        WHERE apartment_id = NEW.apartment_id
          AND status = 'active'
          AND id <> NEW.id
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leases_sync_apartment_status ON leases;
CREATE TRIGGER leases_sync_apartment_status
  AFTER INSERT OR UPDATE OF status ON leases
  FOR EACH ROW EXECUTE FUNCTION sync_apartment_status();

-- Journal d'audit générique : qui, quoi, quand, avant/après, d'où.
--
-- L'IP et le navigateur sont lus dans `request.headers`, que PostgREST
-- publie dans la transaction courante. Les capter ici plutôt que de les
-- faire transiter par l'application garantit qu'aucun chemin d'écriture ne
-- puisse les omettre — y compris un accès direct à l'API REST.
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org     UUID;
  v_id      UUID;
  v_before  JSONB;
  v_after   JSONB;
  v_changed TEXT[];
  v_headers JSONB;
  v_claims  JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org := OLD.organization_id;
    v_id  := OLD.id;
  ELSE
    v_org := NEW.organization_id;
    v_id  := NEW.id;
  END IF;

  -- Suppression de l'organisation elle-même : ses lignes métier partent en
  -- cascade, chacune déclenchant ce trigger. Or `audit_logs.organization_id`
  -- référence une organisation qui n'existe déjà plus dans la transaction —
  -- l'insertion échouerait en 23503 et ferait échouer TOUTE la suppression.
  -- Une organisation devenait ainsi indestructible, ce qui interdit la
  -- clôture d'un compte comme l'effacement demandé par un client.
  --
  -- Journaliser n'aurait de toute façon aucun sens ici : le journal est
  -- lui-même cloisonné par organisation, il disparaît avec elle.
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_after  := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key ORDER BY key) INTO v_changed
    FROM jsonb_each(v_after)
    WHERE v_before -> key IS DISTINCT FROM value;

    -- Un UPDATE qui ne change rien (revalidation, réécriture identique)
    -- ne mérite pas une ligne de journal.
    IF v_changed IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  v_claims  := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;

  INSERT INTO audit_logs (
    organization_id, actor_id, actor_email, action, entity, entity_id,
    before_data, after_data, changed_fields, ip, user_agent
  ) VALUES (
    v_org,
    auth.uid(),
    v_claims ->> 'email',
    TG_OP,
    TG_TABLE_NAME,
    v_id,
    v_before,
    v_after,
    v_changed,
    COALESCE(
      split_part(v_headers ->> 'x-forwarded-for', ',', 1),
      v_headers ->> 'x-real-ip'
    ),
    v_headers ->> 'user-agent'
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'buildings', 'apartments', 'tenants', 'leases',
    'rent_payments', 'expenses', 'maintenance', 'documents'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION audit_trigger()', t, t
    );
  END LOOP;
END $$;

-- =====================================================================
-- RPC
-- =====================================================================

-- Crée l'organisation ET le profil owner en une transaction.
-- SECURITY DEFINER : c'est le seul chemin d'écriture dans `organizations`,
-- il n'existe donc aucune policy INSERT ouverte sur cette table.
CREATE OR REPLACE FUNCTION create_organization(
  org_name   TEXT,
  first_name TEXT DEFAULT '',
  last_name  TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_org_id    UUID;
  v_base_slug TEXT;
  v_slug      TEXT;
  v_suffix    INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise.';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Cet utilisateur appartient déjà à une organisation.';
  END IF;

  v_base_slug := trim(BOTH '-' FROM regexp_replace(lower(org_name), '[^a-z0-9]+', '-', 'g'));
  IF v_base_slug = '' THEN v_base_slug := 'organisation'; END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  INSERT INTO organizations (name, slug) VALUES (org_name, v_slug)
  RETURNING id INTO v_org_id;

  INSERT INTO profiles (id, organization_id, firstname, lastname, email, role)
  VALUES (
    v_uid,
    v_org_id,
    COALESCE(first_name, ''),
    COALESCE(last_name, ''),
    (SELECT email FROM auth.users WHERE id = v_uid),
    'owner'
  );

  RETURN v_org_id;
END;
$$;

-- Génère les échéances de loyer d'un bail, sans doublon.
CREATE OR REPLACE FUNCTION generate_rent_schedule(
  p_lease_id UUID,
  p_months   INT DEFAULT 12
)
RETURNS INT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_lease   leases%ROWTYPE;
  v_month   DATE;
  v_created INT := 0;
  i         INT;
BEGIN
  -- RLS s'applique (SECURITY INVOKER) : un bail d'une autre organisation
  -- est simplement introuvable.
  SELECT * INTO v_lease FROM leases WHERE id = p_lease_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bail introuvable.';
  END IF;

  FOR i IN 0 .. (p_months - 1) LOOP
    v_month := (date_trunc('month', v_lease.start_date) + (i || ' month')::interval)::date;
    EXIT WHEN v_lease.end_date IS NOT NULL AND v_month > v_lease.end_date;

    INSERT INTO rent_payments (organization_id, lease_id, month, amount, status)
    VALUES (v_lease.organization_id, v_lease.id, v_month,
            v_lease.rent + v_lease.charges, 'pending')
    ON CONFLICT (lease_id, month) DO NOTHING;

    IF FOUND THEN v_created := v_created + 1; END IF;
  END LOOP;

  RETURN v_created;
END;
$$;

-- Recherche globale sur tout le parc, en une seule requête.
--
-- SECURITY INVOKER : le RLS de chaque table s'applique, la fonction ne peut
-- donc jamais révéler une ligne d'une autre organisation.
CREATE OR REPLACE FUNCTION global_search(q TEXT, max_results INT DEFAULT 20)
RETURNS TABLE (
  entity   TEXT,
  id       UUID,
  title    TEXT,
  subtitle TEXT,
  href     TEXT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH needle AS (SELECT '%' || btrim(q) || '%' AS pattern)
  SELECT * FROM (
    SELECT 'building'::text, b.id, b.name,
           b.address || ', ' || b.city, '/buildings'::text
    FROM buildings b, needle n
    WHERE btrim(q) <> ''
      AND (b.name ILIKE n.pattern OR b.address ILIKE n.pattern OR b.city ILIKE n.pattern)

    UNION ALL
    SELECT 'apartment', a.id, 'Logement ' || a.number,
           COALESCE(bl.name, '') || COALESCE(' · ' || a.type, ''), '/apartments'
    FROM apartments a
    LEFT JOIN buildings bl ON bl.id = a.building_id, needle n
    WHERE btrim(q) <> ''
      AND (a.number ILIKE n.pattern OR a.type ILIKE n.pattern OR bl.name ILIKE n.pattern)

    UNION ALL
    SELECT 'tenant', t.id, t.firstname || ' ' || t.lastname,
           COALESCE(t.email, t.phone, ''), '/tenants'
    FROM tenants t, needle n
    WHERE btrim(q) <> ''
      AND (t.firstname ILIKE n.pattern OR t.lastname ILIKE n.pattern
           OR t.email ILIKE n.pattern OR t.phone ILIKE n.pattern
           OR t.identity_number ILIKE n.pattern)

    UNION ALL
    SELECT 'lease', l.id,
           'Bail ' || COALESCE(t.firstname || ' ' || t.lastname, ''),
           COALESCE('Logement ' || a.number, '') , '/leases'
    FROM leases l
    LEFT JOIN tenants t ON t.id = l.tenant_id
    LEFT JOIN apartments a ON a.id = l.apartment_id, needle n
    WHERE btrim(q) <> ''
      AND (t.firstname ILIKE n.pattern OR t.lastname ILIKE n.pattern
           OR a.number ILIKE n.pattern)

    UNION ALL
    SELECT 'expense', e.id, e.label,
           COALESCE(bl.name, ''), '/expenses'
    FROM expenses e
    LEFT JOIN buildings bl ON bl.id = e.building_id, needle n
    WHERE btrim(q) <> '' AND (e.label ILIKE n.pattern OR bl.name ILIKE n.pattern)

    UNION ALL
    SELECT 'maintenance', m.id, m.title,
           COALESCE(bl.name, ''), '/maintenance'
    FROM maintenance m
    LEFT JOIN buildings bl ON bl.id = m.building_id, needle n
    WHERE btrim(q) <> ''
      AND (m.title ILIKE n.pattern OR m.description ILIKE n.pattern
           OR bl.name ILIKE n.pattern)

    UNION ALL
    SELECT 'document', d.id, d.file_name,
           d.owner_type::text, '/documents'
    FROM documents d, needle n
    WHERE btrim(q) <> '' AND d.file_name ILIKE n.pattern
  ) AS results(entity, id, title, subtitle, href)
  LIMIT GREATEST(max_results, 1);
$$;

-- Journalise une tentative de connexion, y compris échouée (aucune session
-- n'existe alors : d'où le SECURITY DEFINER et l'accès anon).
CREATE OR REPLACE FUNCTION record_login_event(
  p_email      TEXT,
  p_success    BOOLEAN,
  p_ip         TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO login_events (user_id, email, success, ip, user_agent)
  VALUES (
    (SELECT id FROM auth.users WHERE email = lower(p_email)),
    lower(p_email), p_success, p_ip, p_user_agent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_login_event(TEXT, BOOLEAN, TEXT, TEXT) TO anon, authenticated;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_events   ENABLE ROW LEVEL SECURITY;

-- ORGANIZATIONS -------------------------------------------------------
DROP POLICY IF EXISTS organizations_select ON organizations;
CREATE POLICY organizations_select ON organizations
  FOR SELECT USING (id = (SELECT current_organization_id()));

DROP POLICY IF EXISTS organizations_update ON organizations;
CREATE POLICY organizations_update ON organizations
  FOR UPDATE USING (
    id = (SELECT current_organization_id())
    AND (SELECT is_staff())
    AND (SELECT has_role('owner'))
  );
-- Pas de policy INSERT : passer par create_organization().

-- PROFILES ------------------------------------------------------------
-- Un locataire ne voit que sa propre fiche : l'annuaire du personnel ne
-- le regarde pas.
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (
    id = (SELECT auth.uid())
    OR (
      organization_id = (SELECT current_organization_id())
      AND (SELECT is_staff())
    )
  );

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles
  FOR UPDATE USING (
    organization_id = (SELECT current_organization_id())
    AND (id = (SELECT auth.uid()) OR (SELECT has_role('owner')))
  );

-- Le RLS ne sait pas restreindre des COLONNES, seulement des lignes.
--
-- La policy ci-dessus autorise chacun à modifier sa propre ligne — ce qu'on
-- veut, pour qu'il corrige son nom. Mais « sa propre ligne » comprend
-- `role` et `tenant_id` : un locataire pouvait donc exécuter
--
--   UPDATE profiles SET role = 'owner', tenant_id = NULL WHERE id = auth.uid()
--
-- et devenir propriétaire de l'organisation qui l'héberge. Vérifié contre
-- la vraie base : les deux écritures passaient. Rien dans l'application ne
-- proposait ce geste, mais l'API PostgREST est publique — le formulaire
-- n'est pas la frontière.
--
-- D'où ce déclencheur : les colonnes sensibles sont figées, sauf pour un
-- propriétaire modifiant le rôle de QUELQU'UN D'AUTRE. Sans session
-- utilisateur (`auth.uid()` nul), on est sur le chemin serveur muni de la
-- clé service_role — ouverture d'un espace locataire, invitation — qui a
-- déjà franchi ses propres gardes applicatives.
CREATE OR REPLACE FUNCTION guard_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION
      'Un profil ne change ni d''identifiant ni d''organisation.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION
      'Le rattachement à une fiche locataire ne se modifie pas ainsi.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF actor = OLD.id THEN
      RAISE EXCEPTION 'On ne modifie pas son propre rôle.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT has_role('owner') THEN
      RAISE EXCEPTION 'Seul un propriétaire modifie les rôles.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_columns ON profiles;
CREATE TRIGGER profiles_guard_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_columns();

-- Retirer un COLLABORATEUR est un acte d'administration : réservé au
-- propriétaire. Fermer l'espace d'un LOCATAIRE relève de la gestion
-- courante du parc : le gestionnaire doit pouvoir le faire, sans pour
-- autant toucher aux comptes de l'équipe.
DROP POLICY IF EXISTS profiles_delete ON profiles;
CREATE POLICY profiles_delete ON profiles
  FOR DELETE USING (
    organization_id = (SELECT current_organization_id())
    AND (SELECT is_staff())
    AND id <> (SELECT auth.uid())
    AND (
      (SELECT has_role('owner'))
      OR (tenant_id IS NOT NULL AND (SELECT has_role('manager')))
    )
  );

-- TABLES MÉTIER -------------------------------------------------------
-- Lecture : tout membre de l'organisation (viewer inclus).
-- Écriture : owner et manager.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'buildings', 'apartments', 'tenants', 'leases', 'expenses',
    'maintenance', 'documents'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT
       USING (organization_id = (SELECT current_organization_id())
              AND (SELECT is_staff()))', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_write ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON %I FOR ALL
       USING (organization_id = (SELECT current_organization_id())
              AND (SELECT is_staff())
              AND (SELECT has_role(''owner'', ''manager'')))
       WITH CHECK (organization_id = (SELECT current_organization_id())
              AND (SELECT is_staff())
              AND (SELECT has_role(''owner'', ''manager'')))', t, t);
  END LOOP;
END $$;

-- RENT PAYMENTS : le comptable écrit aussi.
DROP POLICY IF EXISTS rent_payments_select ON rent_payments;
CREATE POLICY rent_payments_select ON rent_payments
  FOR SELECT USING (
    organization_id = (SELECT current_organization_id())
    AND (SELECT is_staff())
  );

-- `is_staff()` autant que le rôle : le rôle seul laisserait un compte
-- locataire promu « comptable » écrire dans la caisse. Les deux périmètres
-- doivent rester disjoints quelle que soit la valeur de `role`.
DROP POLICY IF EXISTS rent_payments_write ON rent_payments;
CREATE POLICY rent_payments_write ON rent_payments
  FOR ALL
  USING (
    organization_id = (SELECT current_organization_id())
    AND (SELECT is_staff())
    AND (SELECT has_role('owner', 'manager', 'accountant'))
  )
  WITH CHECK (
    organization_id = (SELECT current_organization_id())
    AND (SELECT is_staff())
    AND (SELECT has_role('owner', 'manager', 'accountant'))
  );

-- AUDIT LOGS : lecture seule, réservée au pilotage.
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (
    organization_id = (SELECT current_organization_id())
    AND (SELECT is_staff())
    AND (SELECT has_role('owner', 'manager'))
  );
-- Aucune policy d'écriture : seul le trigger SECURITY DEFINER insère.

-- LOGIN EVENTS : chacun voit son propre historique de connexion.
DROP POLICY IF EXISTS login_events_select ON login_events;
CREATE POLICY login_events_select ON login_events
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- =====================================================================
-- PÉRIMÈTRE LOCATAIRE
--
-- Un locataire connecté ne voit QUE ce qui le concerne. Il ne peut pas
-- atteindre les autres locataires, les dépenses, le journal d'audit, ni
-- l'annuaire du personnel. Ces policies s'ajoutent aux précédentes : en
-- RLS, plusieurs policies permissives se combinent par OU, et celles du
-- personnel exigent `is_staff()`, donc les deux périmètres sont disjoints.
-- =====================================================================

DROP POLICY IF EXISTS tenants_self_select ON tenants;
CREATE POLICY tenants_self_select ON tenants
  FOR SELECT USING (id = (SELECT current_tenant_id()));

-- Son identité et ses coordonnées lui appartiennent : il peut les corriger.
--
-- `organization_id` est épinglé dans le WITH CHECK : sans cela, un locataire
-- déplaçait sa propre fiche vers une autre organisation, qui héritait d'un
-- dossier qu'elle n'a jamais créé.
DROP POLICY IF EXISTS tenants_self_update ON tenants;
CREATE POLICY tenants_self_update ON tenants
  FOR UPDATE
  USING (id = (SELECT current_tenant_id()))
  WITH CHECK (
    id = (SELECT current_tenant_id())
    AND organization_id = (SELECT current_organization_id())
  );

DROP POLICY IF EXISTS leases_tenant_select ON leases;
CREATE POLICY leases_tenant_select ON leases
  FOR SELECT USING (tenant_id = (SELECT current_tenant_id()));

DROP POLICY IF EXISTS rent_payments_tenant_select ON rent_payments;
CREATE POLICY rent_payments_tenant_select ON rent_payments
  FOR SELECT USING (lease_id = ANY (tenant_lease_ids()));

DROP POLICY IF EXISTS apartments_tenant_select ON apartments;
CREATE POLICY apartments_tenant_select ON apartments
  FOR SELECT USING (id = ANY (tenant_apartment_ids()));

DROP POLICY IF EXISTS buildings_tenant_select ON buildings;
CREATE POLICY buildings_tenant_select ON buildings
  FOR SELECT USING (id = ANY (tenant_building_ids()));

-- Documents : uniquement ceux rattachés à sa fiche ou à ses baux. Les
-- pièces de l'organisation ou d'un immeuble ne lui sont pas destinées.
DROP POLICY IF EXISTS documents_tenant_select ON documents;
CREATE POLICY documents_tenant_select ON documents
  FOR SELECT USING (
    (owner_type = 'tenant' AND owner_id = (SELECT current_tenant_id()))
    OR (owner_type = 'lease' AND owner_id = ANY (tenant_lease_ids()))
  );

-- Interventions : il suit celles de son logement et peut en déclarer.
DROP POLICY IF EXISTS maintenance_tenant_select ON maintenance;
CREATE POLICY maintenance_tenant_select ON maintenance
  FOR SELECT USING (apartment_id = ANY (tenant_apartment_ids()));

DROP POLICY IF EXISTS maintenance_tenant_insert ON maintenance;
CREATE POLICY maintenance_tenant_insert ON maintenance
  FOR INSERT
  WITH CHECK (
    (SELECT current_tenant_id()) IS NOT NULL
    AND apartment_id = ANY (tenant_apartment_ids())
    AND building_id = ANY (tenant_building_ids())
    AND organization_id = (SELECT current_organization_id())
    -- Une déclaration entre toujours en file d'attente : le locataire ne
    -- décide ni de la priorité affichée ni de la clôture.
    AND status = 'open'
  );

-- Pas de policy UPDATE/DELETE pour le locataire sur `maintenance` :
-- une fois déclaré, l'incident appartient au suivi du gestionnaire.

-- =====================================================================
-- STORAGE — bucket privé, cloisonné par organisation
-- Convention de chemin : <organization_id>/<owner_type>/<owner_id>/<fichier>
-- Les téléchargements passent par des URLs signées temporaires.
--
-- Les fonctions sont qualifiées `public.` ici, contrairement au reste du
-- fichier : ces policies s'évaluent dans les sessions de l'API Storage,
-- dont le `search_path` ne contient pas nécessairement `public`. Sans
-- qualification, la policy se crée mais échoue à l'exécution — et un
-- locataire ne peut plus télécharger sa quittance.
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Le personnel lit tout le dossier de son organisation.
DROP POLICY IF EXISTS documents_storage_select ON storage.objects;
CREATE POLICY documents_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_organization_id())::text
    AND (SELECT public.is_staff())
  );

-- Le locataire ne lit que les objets rangés sous sa propre fiche ou sous
-- l'un de ses baux — la convention de chemin
-- <organization_id>/<owner_type>/<owner_id>/<fichier> rend ce contrôle
-- possible sans jointure.
DROP POLICY IF EXISTS documents_storage_tenant_select ON storage.objects;
CREATE POLICY documents_storage_tenant_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_organization_id())::text
    AND (
      (
        (storage.foldername(name))[2] = 'tenant'
        AND (storage.foldername(name))[3] = (SELECT public.current_tenant_id())::text
      )
      OR (
        (storage.foldername(name))[2] = 'lease'
        AND (storage.foldername(name))[3] = ANY (
          SELECT unnest(public.tenant_lease_ids())::text
        )
      )
    )
  );

DROP POLICY IF EXISTS documents_storage_write ON storage.objects;
CREATE POLICY documents_storage_write ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_organization_id())::text
    AND (SELECT public.has_role('owner', 'manager'))
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_organization_id())::text
    AND (SELECT public.has_role('owner', 'manager'))
  );

-- =====================================================================
-- NOTIFICATIONS
--
-- Une notification vise TOUJOURS un profil précis, jamais « le personnel »
-- en bloc : sans destinataire nommé, `read_at` n'aurait pas de sens et
-- « lu par l'un » deviendrait « lu par tous ». Prévenir l'équipe consiste
-- donc à écrire une ligne par membre concerné — leur nombre est petit.
--
-- Aucune policy d'écriture : les notifications naissent de triggers
-- SECURITY DEFINER. Personne ne peut s'en fabriquer ni en effacer chez un
-- autre, et aucun chemin applicatif ne peut oublier d'en émettre.
-- =====================================================================
DO $$ BEGIN
  CREATE TYPE notification_kind AS ENUM (
    'incident_declared', 'incident_updated',
    'payment_recorded', 'payment_declared', 'payment_declaration_reviewed',
    'lease_created'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind            notification_kind NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  -- Chemin applicatif à ouvrir au clic : la notification mène à l'écran
  -- qui permet d'agir, sinon elle n'est qu'un bruit de plus.
  href            TEXT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON notifications (recipient_id, created_at DESC);
-- Sert le compteur du badge, interrogé à chaque rendu de la navigation.
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (recipient_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (recipient_id = (SELECT auth.uid()));

-- Marquer comme lu est le seul écrit permis au destinataire. `WITH CHECK`
-- l'empêche de réattribuer la ligne à quelqu'un d'autre au passage.
DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE
  USING (recipient_id = (SELECT auth.uid()))
  WITH CHECK (recipient_id = (SELECT auth.uid()));

-- ------------------------------------------------------- ÉMISSION
CREATE OR REPLACE FUNCTION notify_staff(
  p_org   UUID,
  p_kind  notification_kind,
  p_title TEXT,
  p_body  TEXT,
  p_href  TEXT
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO notifications (organization_id, recipient_id, kind, title, body, href)
  SELECT p_org, p.id, p_kind, p_title, p_body, p_href
  FROM profiles p
  WHERE p.organization_id = p_org
    AND p.tenant_id IS NULL
    AND p.role IN ('owner', 'manager');
$$;

-- Sans compte portail, le locataire n'a pas de profil : la requête ne
-- renvoie rien et l'émission est un non-événement. C'est voulu.
CREATE OR REPLACE FUNCTION notify_tenant(
  p_org    UUID,
  p_tenant UUID,
  p_kind   notification_kind,
  p_title  TEXT,
  p_body   TEXT,
  p_href   TEXT
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO notifications (organization_id, recipient_id, kind, title, body, href)
  SELECT p_org, p.id, p_kind, p_title, p_body, p_href
  FROM profiles p
  WHERE p.tenant_id = p_tenant
    AND p.organization_id = p_org;
$$;

-- Locataire titulaire du bail actif d'un logement, s'il en existe un.
CREATE OR REPLACE FUNCTION apartment_active_tenant(p_apartment UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.tenant_id FROM leases l
  WHERE l.apartment_id = p_apartment AND l.status = 'active'
  LIMIT 1;
$$;

-- ------------------------------------------------------- DÉCLENCHEURS
CREATE OR REPLACE FUNCTION notify_maintenance_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID;
BEGIN
  -- Déclaré depuis le portail : c'est l'équipe qu'il faut alerter.
  IF current_tenant_id() IS NOT NULL THEN
    PERFORM notify_staff(
      NEW.organization_id, 'incident_declared',
      'Incident déclaré par un locataire', NEW.title, '/maintenance'
    );
  ELSIF NEW.apartment_id IS NOT NULL THEN
    v_tenant := apartment_active_tenant(NEW.apartment_id);
    IF v_tenant IS NOT NULL THEN
      PERFORM notify_tenant(
        NEW.organization_id, v_tenant, 'incident_updated',
        'Une intervention est prévue dans votre logement',
        NEW.title, '/portal/incidents'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_notify_created ON maintenance;
CREATE TRIGGER maintenance_notify_created
  AFTER INSERT ON maintenance
  FOR EACH ROW EXECUTE FUNCTION notify_maintenance_created();

CREATE OR REPLACE FUNCTION notify_maintenance_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.apartment_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_tenant := apartment_active_tenant(NEW.apartment_id);
  IF v_tenant IS NULL THEN RETURN NEW; END IF;

  PERFORM notify_tenant(
    NEW.organization_id, v_tenant, 'incident_updated',
    CASE NEW.status
      WHEN 'in_progress' THEN 'Intervention en cours'
      WHEN 'resolved'    THEN 'Intervention résolue'
      WHEN 'cancelled'   THEN 'Intervention annulée'
      ELSE 'Intervention mise à jour'
    END,
    NEW.title, '/portal/incidents'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_notify_status ON maintenance;
CREATE TRIGGER maintenance_notify_status
  AFTER UPDATE OF status ON maintenance
  FOR EACH ROW EXECUTE FUNCTION notify_maintenance_status();

CREATE OR REPLACE FUNCTION notify_payment_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status IS NOT DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT l.tenant_id INTO v_tenant FROM leases l WHERE l.id = NEW.lease_id;
  IF v_tenant IS NULL THEN RETURN NEW; END IF;

  PERFORM notify_tenant(
    NEW.organization_id, v_tenant, 'payment_recorded',
    'Loyer encaissé',
    'Votre quittance de ' || to_char(NEW.month, 'MM/YYYY') || ' est disponible.',
    '/portal/payments'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rent_payments_notify_paid ON rent_payments;
CREATE TRIGGER rent_payments_notify_paid
  AFTER UPDATE OF status ON rent_payments
  FOR EACH ROW EXECUTE FUNCTION notify_payment_paid();

CREATE OR REPLACE FUNCTION notify_lease_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;

  PERFORM notify_tenant(
    NEW.organization_id, NEW.tenant_id, 'lease_created',
    'Votre bail est disponible',
    'Retrouvez le détail de votre bail dans votre espace.', '/portal/lease'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leases_notify_created ON leases;
CREATE TRIGGER leases_notify_created
  AFTER INSERT ON leases
  FOR EACH ROW EXECUTE FUNCTION notify_lease_created();

-- =====================================================================
-- DÉCLARATIONS DE PAIEMENT
--
-- Tant qu'aucun prestataire de paiement n'est raccordé, le locataire
-- signale un règlement effectué hors ligne (virement, espèces, mobile
-- money). Une déclaration n'est PAS un encaissement : elle ne touche pas
-- `rent_payments` tant qu'un gestionnaire ne l'a pas validée. La comptable
-- garde donc la main sur ce qui entre en caisse.
-- =====================================================================
DO $$ BEGIN
  CREATE TYPE payment_declaration_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payment_declarations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rent_payment_id UUID NOT NULL,
  tenant_id       UUID NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  paid_on         DATE NOT NULL,
  method          TEXT NOT NULL,
  reference       TEXT,
  status          payment_declaration_status NOT NULL DEFAULT 'pending',
  reviewed_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (rent_payment_id, organization_id)
    REFERENCES rent_payments (id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, organization_id)
    REFERENCES tenants (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS payment_declarations_organization_idx
  ON payment_declarations (organization_id, created_at DESC);

-- Une seule déclaration en attente par échéance : sans cela, un double
-- envoi créerait deux demandes et un encaissement compté deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS payment_declarations_one_pending
  ON payment_declarations (rent_payment_id) WHERE status = 'pending';

ALTER TABLE payment_declarations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_declarations_staff_select ON payment_declarations;
CREATE POLICY payment_declarations_staff_select ON payment_declarations
  FOR SELECT USING (
    organization_id = (SELECT current_organization_id())
    AND (SELECT is_staff())
  );

DROP POLICY IF EXISTS payment_declarations_staff_write ON payment_declarations;
CREATE POLICY payment_declarations_staff_write ON payment_declarations
  FOR ALL
  USING (
    organization_id = (SELECT current_organization_id())
    AND (SELECT is_staff())
    AND (SELECT has_role('owner', 'manager', 'accountant'))
  )
  WITH CHECK (
    organization_id = (SELECT current_organization_id())
    AND (SELECT is_staff())
    AND (SELECT has_role('owner', 'manager', 'accountant'))
  );

DROP POLICY IF EXISTS payment_declarations_tenant_select ON payment_declarations;
CREATE POLICY payment_declarations_tenant_select ON payment_declarations
  FOR SELECT USING (tenant_id = (SELECT current_tenant_id()));

-- Le locataire déclare pour lui-même, sur ses propres échéances, et ne
-- choisit pas le statut : `status = 'pending'` est verrouillé ici, pas
-- seulement dans le formulaire.
DROP POLICY IF EXISTS payment_declarations_tenant_insert ON payment_declarations;
CREATE POLICY payment_declarations_tenant_insert ON payment_declarations
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND organization_id = (SELECT current_organization_id())
    AND rent_payment_id IN (
      SELECT rp.id FROM rent_payments rp
      WHERE rp.lease_id = ANY (tenant_lease_ids())
    )
    AND status = 'pending'
    AND reviewed_by IS NULL
  );

-- Pas d'UPDATE/DELETE côté locataire : une déclaration engagée se corrige
-- en en parlant à son gestionnaire, pas en la réécrivant.

-- Journalise les déclarations comme le reste du métier.
DROP TRIGGER IF EXISTS payment_declarations_audit ON payment_declarations;
CREATE TRIGGER payment_declarations_audit
  AFTER INSERT OR UPDATE OR DELETE ON payment_declarations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE OR REPLACE FUNCTION notify_payment_declared()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  SELECT t.firstname || ' ' || t.lastname INTO v_name
  FROM tenants t WHERE t.id = NEW.tenant_id;

  PERFORM notify_staff(
    NEW.organization_id, 'payment_declared',
    'Paiement déclaré par un locataire',
    COALESCE(v_name, 'Un locataire') || ' déclare avoir réglé '
      || to_char(NEW.amount, 'FM999G999G999') || ' F CFA.',
    '/payments'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_declarations_notify ON payment_declarations;
CREATE TRIGGER payment_declarations_notify
  AFTER INSERT ON payment_declarations
  FOR EACH ROW EXECUTE FUNCTION notify_payment_declared();

/**
 * Statuer sur une déclaration, et n'encaisser qu'en cas d'acceptation.
 *
 * SECURITY INVOKER : le RLS reste seul juge du droit d'écrire — la
 * fonction ne crée aucun privilège, elle rend l'opération atomique. Sans
 * elle, un plantage entre « déclaration acceptée » et « échéance mise à
 * jour » laisserait un encaissement fantôme.
 */
CREATE OR REPLACE FUNCTION review_payment_declaration(
  p_id     UUID,
  p_accept BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_decl   payment_declarations%ROWTYPE;
  v_pay    rent_payments%ROWTYPE;
  v_paid   NUMERIC(12, 2);
  v_status payment_status;
BEGIN
  SELECT * INTO v_decl FROM payment_declarations WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Déclaration introuvable.';
  END IF;
  IF v_decl.status <> 'pending' THEN
    RAISE EXCEPTION 'Cette déclaration a déjà été traitée.';
  END IF;

  UPDATE payment_declarations
  SET status      = CASE
        WHEN p_accept THEN 'accepted'::payment_declaration_status
        ELSE 'rejected'::payment_declaration_status
      END,
      reviewed_by = auth.uid(),
      reviewed_at = NOW()
  WHERE id = p_id;

  IF p_accept THEN
    SELECT * INTO v_pay FROM rent_payments WHERE id = v_decl.rent_payment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Échéance introuvable.';
    END IF;

    v_paid := v_pay.amount_paid + v_decl.amount;
    v_status := CASE
      WHEN v_paid >= v_pay.amount THEN 'paid'::payment_status
      ELSE 'partial'::payment_status
    END;

    UPDATE rent_payments
    SET amount_paid  = v_paid,
        status       = v_status,
        payment_date = v_decl.paid_on,
        method       = COALESCE(v_pay.method, v_decl.method)
    WHERE id = v_pay.id;
  END IF;

  -- Une acceptation qui solde l'échéance déclenche déjà « Loyer encaissé »
  -- par le trigger de `rent_payments` : le dire deux fois n'informerait
  -- personne mieux. On ne notifie donc que les cas qu'il ne couvre pas.
  IF NOT p_accept THEN
    PERFORM notify_tenant(
      v_decl.organization_id, v_decl.tenant_id, 'payment_declaration_reviewed',
      'Paiement non confirmé',
      'Votre gestionnaire n''a pas retrouvé ce règlement. Contactez-le.',
      '/portal/payments'
    );
  ELSIF v_status <> 'paid' THEN
    PERFORM notify_tenant(
      v_decl.organization_id, v_decl.tenant_id, 'payment_declaration_reviewed',
      'Paiement partiel enregistré',
      'Votre règlement a été enregistré. Il reste un solde à régler.',
      '/portal/payments'
    );
  END IF;
END;
$$;

-- =====================================================================
-- LIMITATION DE DÉBIT PARTAGÉE
--
-- Un compteur en mémoire vit dans le processus : sur Vercel, chaque
-- instance a le sien et la limite réelle vaut N fois la limite demandée.
-- Le compteur est donc porté par la base, seule ressource partagée par
-- toutes les instances.
--
-- Aucune policy : la table est inaccessible aux clients. Seule la
-- fonction SECURITY DEFINER ci-dessous y touche, et elle n'expose que le
-- verdict — jamais l'état des autres appelants.
-- =====================================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INT NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_key       TEXT,
  p_limit     INT,
  p_window_ms INT
)
RETURNS TABLE (allowed BOOLEAN, remaining INT, retry_after_seconds INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- clock_timestamp() et non NOW() : NOW() est figé sur le début de la
  -- transaction, ce qui décalerait la fenêtre.
  v_now    TIMESTAMPTZ := clock_timestamp();
  v_window INTERVAL := make_interval(secs => GREATEST(p_window_ms, 1000) / 1000.0);
  v_count  INT;
  v_reset  TIMESTAMPTZ;
BEGIN
  -- Incrément atomique : ON CONFLICT DO UPDATE verrouille la ligne, deux
  -- requêtes concurrentes ne peuvent pas lire la même valeur.
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_now + v_window)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
          WHEN rate_limits.reset_at <= v_now THEN 1
          ELSE rate_limits.count + 1
        END,
        reset_at = CASE
          WHEN rate_limits.reset_at <= v_now THEN v_now + v_window
          ELSE rate_limits.reset_at
        END
  RETURNING rate_limits.count, rate_limits.reset_at INTO v_count, v_reset;

  -- Purge amortie : une fois sur cent, on nettoie les fenêtres écoulées
  -- plutôt que d'imposer une tâche planifiée.
  IF random() < 0.01 THEN
    DELETE FROM rate_limits WHERE reset_at < v_now - INTERVAL '1 hour';
  END IF;

  RETURN QUERY SELECT
    v_count <= p_limit,
    GREATEST(p_limit - v_count, 0),
    CASE
      WHEN v_count <= p_limit THEN 0
      ELSE CEIL(EXTRACT(EPOCH FROM (v_reset - v_now)))::INT
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION consume_rate_limit(TEXT, INT, INT) TO anon, authenticated;

-- =====================================================================
-- LOGOS D'ORGANISATION
--
-- Bucket public, à la différence de `documents`. Un logo s'affiche sur
-- chaque écran et dans les quittances : le servir par URL signée
-- obligerait à en régénérer une à chaque rendu, pour protéger une image
-- que l'organisation expose de toute façon à ses locataires.
--
-- Public en LECTURE seulement. L'écriture reste réservée au propriétaire
-- de l'organisation, et la convention de chemin `<organization_id>/…`
-- l'empêche de déposer quoi que ce soit sous une autre.
-- =====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos', 'logos', true, 1048576,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

DROP POLICY IF EXISTS logos_read ON storage.objects;
CREATE POLICY logos_read ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

DROP POLICY IF EXISTS logos_write ON storage.objects;
CREATE POLICY logos_write ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (SELECT public.current_organization_id())::text
    AND (SELECT public.has_role('owner'))
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (SELECT public.current_organization_id())::text
    AND (SELECT public.has_role('owner'))
  );
