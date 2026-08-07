-- =====================================================================
-- CaisseOps — Schéma : reçus, bons de caisse et bons de sortie
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- Si vous aviez exécuté un schéma antérieur (gestion immobilière),
-- lancez d'abord `supabase/reset.sql` : les deux sont incompatibles.
--
-- Principes structurants :
--   1. `organization_id` sur TOUTES les tables métier.
--   2. Les clés étrangères composites (id, organization_id) rendent
--      structurellement impossible de rattacher une ligne d'une
--      organisation à une ligne d'une autre — ce n'est pas une règle
--      applicative, c'est une contrainte PostgreSQL.
--   3. RLS activé partout, avec des droits d'écriture par rôle.
--   4. Tout écrit métier est journalisé dans `audit_logs` par trigger.
--   5. L'en-tête imprimé (logo, raison sociale, activités, coordonnées)
--      appartient à l'organisation : chaque entreprise imprime le sien.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- ENUMS — des valeurs fermées plutôt que du texte libre.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'manager', 'accountant', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sens du mouvement d'un bon de caisse : de l'argent entre, ou il sort.
DO $$ BEGIN
  CREATE TYPE cash_direction AS ENUM ('entree', 'sortie');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mode de règlement : espèces en main, ou dépôt (banque, mobile money).
DO $$ BEGIN
  CREATE TYPE cash_settlement AS ENUM ('cash', 'depot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Le mouvement est-il imputé à une personne ou à l'entreprise ?
DO $$ BEGIN
  CREATE TYPE cash_account AS ENUM ('personal', 'company');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Les trois pièces émises. Sert de clé de numérotation.
DO $$ BEGIN
  CREATE TYPE document_kind AS ENUM ('receipt', 'cash_voucher', 'delivery_note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- TABLES
-- =====================================================================

-- --------------------------------------------------------------- ORGS
--
-- Les colonnes d'en-tête décrivent l'entreprise telle qu'elle apparaît
-- en haut de ses pièces imprimées. Toutes sont facultatives : une
-- organisation qui vient de s'inscrire imprime déjà, avec son seul nom,
-- et complète ensuite.
CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  slug       TEXT NOT NULL UNIQUE,
  logo_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizations
  -- « S.A.R.L. », « S.A. », « Entreprise individuelle »… imprimé à côté du nom.
  ADD COLUMN IF NOT EXISTS legal_form  TEXT,
  -- Sous-titre de la raison sociale : « Société de travaux industriels… ».
  ADD COLUMN IF NOT EXISTS trade_name  TEXT,
  -- Accroche commerciale : « Votre domaine, notre expertise. »
  ADD COLUMN IF NOT EXISTS tagline     TEXT,
  -- Domaines d'activité, un par puce dans l'en-tête.
  ADD COLUMN IF NOT EXISTS activities  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS address     TEXT,
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS phone_alt   TEXT,
  ADD COLUMN IF NOT EXISTS email       TEXT,
  ADD COLUMN IF NOT EXISTS email_alt   TEXT,
  ADD COLUMN IF NOT EXISTS website     TEXT;

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

-- ------------------------------------------------------------ RECEIPTS
--
-- Le reçu : la pièce la plus simple. On a reçu une somme de quelqu'un,
-- pour quelque chose, et on lui en laisse la trace.
--
-- `amount_in_words` est stocké et non recalculé à l'affichage : c'est la
-- mention qui fait foi sur le papier. Recalculée plus tard par une autre
-- version du convertisseur, une pièce déjà remise pourrait se relire
-- différemment de l'exemplaire détenu par le client.
CREATE TABLE IF NOT EXISTS receipts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number          TEXT NOT NULL,
  issued_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  -- « Reçu de M./Mme »
  payer           TEXT NOT NULL CHECK (length(trim(payer)) > 0),
  -- Le montant du cadre « BPF » (bon pour francs).
  amount          NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  amount_in_words TEXT NOT NULL DEFAULT '',
  -- « Article(s) » : l'objet du règlement.
  articles        TEXT NOT NULL DEFAULT '',
  advance         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (advance >= 0),
  balance         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  -- « Reçu établi par »
  issued_by       TEXT NOT NULL DEFAULT '',
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, number)
);

CREATE INDEX IF NOT EXISTS receipts_organization_idx
  ON receipts (organization_id, issued_on DESC);

-- ------------------------------------------------------- CASH VOUCHERS
--
-- Le bon de caisse : une entrée ou une sortie d'argent, avec l'ordre qui
-- l'a autorisée et l'imputation (compte personnel ou compte entreprise).
CREATE TABLE IF NOT EXISTS cash_vouchers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number          TEXT NOT NULL,
  issued_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  direction       cash_direction NOT NULL DEFAULT 'sortie',
  amount          NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  amount_in_words TEXT NOT NULL DEFAULT '',
  -- « REÇU de Mr ou Mme »
  counterparty    TEXT NOT NULL CHECK (length(trim(counterparty)) > 0),
  -- « Motif »
  reason          TEXT NOT NULL DEFAULT '',
  advance         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (advance >= 0),
  balance         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  -- « ORDRE DONNÉ PAR »
  ordered_by      TEXT NOT NULL DEFAULT '',
  settlement      cash_settlement NOT NULL DEFAULT 'cash',
  -- Référence du dépôt : n'a de sens que si settlement = 'depot'.
  deposit_ref     TEXT,
  account         cash_account NOT NULL DEFAULT 'company',
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, number),
  -- Une référence de dépôt sans dépôt est une donnée orpheline : elle
  -- s'imprimerait à côté d'une case « CASH » cochée.
  CONSTRAINT cash_vouchers_deposit_ref_requires_depot
    CHECK (settlement = 'depot' OR deposit_ref IS NULL)
);

CREATE INDEX IF NOT EXISTS cash_vouchers_organization_idx
  ON cash_vouchers (organization_id, issued_on DESC);

-- ------------------------------------------------------ DELIVERY NOTES
--
-- Le bon de sortie : ce qui quitte le magasin, en quelle quantité et
-- pour quelle destination. Les articles vivent dans une table de lignes
-- plutôt que dans un tableau JSON : on veut pouvoir les compter, les
-- exporter et les retrouver.
CREATE TABLE IF NOT EXISTS delivery_notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number          TEXT NOT NULL,
  issued_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  -- « NOM ÉMETTEUR »
  issuer          TEXT NOT NULL CHECK (length(trim(issuer)) > 0),
  service         TEXT NOT NULL DEFAULT '',
  -- « NOTA » : mention de pied, « Exemplaire chauffeur » par défaut.
  nota            TEXT NOT NULL DEFAULT '',
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, number)
);

CREATE INDEX IF NOT EXISTS delivery_notes_organization_idx
  ON delivery_notes (organization_id, issued_on DESC);

CREATE TABLE IF NOT EXISTS delivery_note_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  delivery_note_id UUID NOT NULL,
  -- Rang d'affichage : l'ordre de saisie est celui du papier.
  position         INT NOT NULL DEFAULT 0,
  designation      TEXT NOT NULL CHECK (length(trim(designation)) > 0),
  quantity         TEXT NOT NULL DEFAULT '',
  destination      TEXT NOT NULL DEFAULT '',
  observations     TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  -- La clé composite interdit qu'une ligne d'une organisation soit
  -- rattachée au bon d'une autre.
  FOREIGN KEY (delivery_note_id, organization_id)
    REFERENCES delivery_notes (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS delivery_note_lines_note_idx
  ON delivery_note_lines (delivery_note_id, position);

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

-- ---------------------------------------------------- DOCUMENT NUMBERS
--
-- Un compteur par organisation, par nature de pièce et par année.
--
-- Une séquence PostgreSQL ne conviendrait pas : elle est globale, alors
-- que chaque entreprise attend « BC-2026-0001 » pour sa première pièce
-- de l'année, sans savoir que d'autres entreprises utilisent le produit.
CREATE TABLE IF NOT EXISTS document_counters (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            document_kind NOT NULL,
  year            INT NOT NULL,
  last_value      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, kind, year)
);

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

CREATE OR REPLACE FUNCTION has_role(VARIADIC allowed user_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT current_user_role() = ANY(allowed);
$$;

-- Toute personne rattachée à une organisation. Le produit n'a plus qu'un
-- seul public — le personnel de l'entreprise — mais la fonction reste :
-- les policies l'appellent, et une future ouverture à des tiers en
-- lecture n'aurait qu'à la redéfinir.
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT current_organization_id() IS NOT NULL;
$$;

-- =====================================================================
-- NUMÉROTATION
-- =====================================================================

-- Préfixe imprimé devant le numéro, par nature de pièce.
CREATE OR REPLACE FUNCTION document_prefix(p_kind document_kind)
RETURNS TEXT
LANGUAGE SQL IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'receipt'       THEN 'REC'
    WHEN 'cash_voucher'  THEN 'BC'
    WHEN 'delivery_note' THEN 'BS'
  END;
$$;

/**
 * Attribue le numéro suivant, sans trou ni doublon.
 *
 * `ON CONFLICT DO UPDATE` verrouille la ligne du compteur : deux
 * saisies simultanées attendent l'une l'autre au lieu de repartir toutes
 * deux du même dernier numéro. C'est ce que ne garantirait pas un
 * `SELECT max(number) + 1`, courant et faux dès le second poste de
 * saisie.
 */
CREATE OR REPLACE FUNCTION next_document_number(
  p_organization UUID,
  p_kind         document_kind,
  p_year         INT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_value INT;
BEGIN
  INSERT INTO document_counters (organization_id, kind, year, last_value)
  VALUES (p_organization, p_kind, p_year, 1)
  ON CONFLICT (organization_id, kind, year) DO UPDATE
    SET last_value = document_counters.last_value + 1
  RETURNING last_value INTO v_value;

  RETURN format('%s-%s-%s',
                document_prefix(p_kind),
                p_year,
                lpad(v_value::text, 4, '0'));
END;
$$;

/**
 * Remplit le numéro à l'insertion.
 *
 * Le numéro n'est pas demandé au formulaire : le faire saisir revient à
 * laisser deux postes émettre le même. Le déclencheur ignore d'ailleurs
 * toute valeur fournie par le client, y compris via l'API PostgREST.
 */
CREATE OR REPLACE FUNCTION assign_document_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.number := next_document_number(
    NEW.organization_id,
    TG_ARGV[0]::document_kind,
    EXTRACT(YEAR FROM NEW.issued_on)::INT
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receipts_number ON receipts;
CREATE TRIGGER receipts_number BEFORE INSERT ON receipts
  FOR EACH ROW EXECUTE FUNCTION assign_document_number('receipt');

DROP TRIGGER IF EXISTS cash_vouchers_number ON cash_vouchers;
CREATE TRIGGER cash_vouchers_number BEFORE INSERT ON cash_vouchers
  FOR EACH ROW EXECUTE FUNCTION assign_document_number('cash_voucher');

DROP TRIGGER IF EXISTS delivery_notes_number ON delivery_notes;
CREATE TRIGGER delivery_notes_number BEFORE INSERT ON delivery_notes
  FOR EACH ROW EXECUTE FUNCTION assign_document_number('delivery_note');

/**
 * Le numéro est définitif.
 *
 * Une pièce remise à un tiers porte son numéro ; le modifier ensuite
 * ferait diverger l'exemplaire papier et la base, et casserait la
 * continuité de la numérotation que réclame tout contrôle comptable.
 */
CREATE OR REPLACE FUNCTION freeze_document_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.number IS DISTINCT FROM OLD.number THEN
    RAISE EXCEPTION 'Le numéro d''une pièce émise ne se modifie pas.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['receipts', 'cash_vouchers', 'delivery_notes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_freeze_number ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_freeze_number BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION freeze_document_number()', t, t);
  END LOOP;
END $$;

-- =====================================================================
-- AUDIT
-- =====================================================================
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

  -- L'organisation vient d'être supprimée en cascade : journaliser
  -- échouerait sur la clé étrangère et annulerait la suppression.
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_after  := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key ORDER BY key) INTO v_changed
    FROM jsonb_each(v_after)
    WHERE v_before -> key IS DISTINCT FROM value;

    -- Un UPDATE qui ne change rien ne mérite pas une ligne de journal.
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
    'receipts', 'cash_vouchers', 'delivery_notes', 'delivery_note_lines'
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

/**
 * Crée l'organisation et le profil « owner » dans la même transaction.
 *
 * Il n'existe donc pas d'état intermédiaire où un compte authentifié
 * serait rattaché à rien : l'onboarding ne peut pas s'interrompre à
 * mi-chemin et laisser un utilisateur bloqué.
 */
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

/**
 * Recherche globale sur les trois pièces.
 *
 * Le RLS s'applique — la fonction n'est pas SECURITY DEFINER : chacun ne
 * trouve que les pièces de son organisation.
 */
CREATE OR REPLACE FUNCTION global_search(q TEXT, max_results INT DEFAULT 20)
RETURNS TABLE (
  entity   TEXT,
  id       UUID,
  title    TEXT,
  subtitle TEXT,
  href     TEXT
)
LANGUAGE SQL STABLE SET search_path = public AS $$
  WITH needle AS (SELECT '%' || btrim(q) || '%' AS pattern)
  SELECT * FROM (
    SELECT 'receipt', r.id, r.number, r.payer, '/receipts'
    FROM receipts r, needle n
    WHERE btrim(q) <> ''
      AND (r.number ILIKE n.pattern
           OR r.payer ILIKE n.pattern
           OR r.articles ILIKE n.pattern)

    UNION ALL
    SELECT 'cash_voucher', c.id, c.number, c.counterparty, '/cash-vouchers'
    FROM cash_vouchers c, needle n
    WHERE btrim(q) <> ''
      AND (c.number ILIKE n.pattern
           OR c.counterparty ILIKE n.pattern
           OR c.reason ILIKE n.pattern)

    UNION ALL
    SELECT 'delivery_note', d.id, d.number, d.issuer, '/delivery-notes'
    FROM delivery_notes d, needle n
    WHERE btrim(q) <> ''
      AND (d.number ILIKE n.pattern
           OR d.issuer ILIKE n.pattern
           OR d.service ILIKE n.pattern)
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
ALTER TABLE organizations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_vouchers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_counters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_events        ENABLE ROW LEVEL SECURITY;

-- ORGANIZATIONS -------------------------------------------------------
DROP POLICY IF EXISTS organizations_select ON organizations;
CREATE POLICY organizations_select ON organizations
  FOR SELECT USING (id = (SELECT current_organization_id()));

DROP POLICY IF EXISTS organizations_update ON organizations;
CREATE POLICY organizations_update ON organizations
  FOR UPDATE USING (
    id = (SELECT current_organization_id())
    AND (SELECT has_role('owner'))
  );
-- Pas de policy INSERT : passer par create_organization().

-- PROFILES ------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (organization_id = (SELECT current_organization_id()));

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
-- `role` : un lecteur pouvait donc exécuter
--
--   UPDATE profiles SET role = 'owner' WHERE id = auth.uid()
--
-- et devenir propriétaire de l'organisation. Rien dans l'application ne
-- proposait ce geste, mais l'API PostgREST est publique — le formulaire
-- n'est pas la frontière.
--
-- D'où ce déclencheur : les colonnes sensibles sont figées, sauf pour un
-- propriétaire modifiant le rôle de QUELQU'UN D'AUTRE. Sans session
-- utilisateur (`auth.uid()` nul), on est sur le chemin serveur muni de la
-- clé service_role — invitation d'un collaborateur — qui a déjà franchi
-- ses propres gardes applicatives.
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
CREATE TRIGGER profiles_guard_columns BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_columns();

DROP POLICY IF EXISTS profiles_delete ON profiles;
CREATE POLICY profiles_delete ON profiles
  FOR DELETE USING (
    organization_id = (SELECT current_organization_id())
    AND (SELECT has_role('owner'))
    AND id <> (SELECT auth.uid())
  );

-- PIÈCES DE CAISSE ----------------------------------------------------
--
-- Le comptable écrit : c'est son métier. Le lecteur consulte.
-- La suppression, elle, reste au propriétaire et au gestionnaire : une
-- pièce détruite laisse un trou dans la numérotation, et ce geste doit
-- rester rare et tracé.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'receipts', 'cash_vouchers', 'delivery_notes', 'delivery_note_lines'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT
       USING (organization_id = (SELECT current_organization_id()))', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insert ON %I FOR INSERT
       WITH CHECK (organization_id = (SELECT current_organization_id())
              AND (SELECT has_role(''owner'', ''manager'', ''accountant'')))', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update ON %I FOR UPDATE
       USING (organization_id = (SELECT current_organization_id())
              AND (SELECT has_role(''owner'', ''manager'', ''accountant'')))
       WITH CHECK (organization_id = (SELECT current_organization_id())
              AND (SELECT has_role(''owner'', ''manager'', ''accountant'')))', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete ON %I FOR DELETE
       USING (organization_id = (SELECT current_organization_id())
              AND (SELECT has_role(''owner'', ''manager'')))', t, t);
  END LOOP;
END $$;

-- COMPTEURS -----------------------------------------------------------
-- Lecture seule, et seulement les siens : c'est ce qui alimente
-- l'indicateur « prochain numéro ». L'écriture passe exclusivement par
-- next_document_number(), qui est SECURITY DEFINER.
DROP POLICY IF EXISTS document_counters_select ON document_counters;
CREATE POLICY document_counters_select ON document_counters
  FOR SELECT USING (organization_id = (SELECT current_organization_id()));

-- JOURNAL -------------------------------------------------------------
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (
    organization_id = (SELECT current_organization_id())
    AND (SELECT has_role('owner', 'manager'))
  );
-- Pas d'INSERT, UPDATE ni DELETE : seul le trigger SECURITY DEFINER écrit.

DROP POLICY IF EXISTS login_events_select ON login_events;
CREATE POLICY login_events_select ON login_events
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- =====================================================================
-- STORAGE — logos d'organisation
--
-- Bucket public : le logo s'imprime dans l'en-tête de chaque pièce et
-- s'affiche dans la barre latérale. Une URL signée expirerait au milieu
-- d'un aperçu resté ouvert, et le logo disparaîtrait à l'impression.
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
