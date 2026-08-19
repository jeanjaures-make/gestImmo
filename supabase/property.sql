-- =====================================================================
-- CaisseOps — Gestion immobilière : biens, locataires, quittances
--
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS `schema.sql` et
-- `subscriptions.sql`. Rejouable, comme les deux autres.
--
-- Ce module n'introduit aucun mécanisme nouveau. Il réemploie ceux qui
-- portent déjà les reçus et les bons de caisse :
--
--   • `organization_id` sur toutes les tables, et les clés étrangères
--     COMPOSITES (id, organization_id) qui rendent structurellement
--     impossible de rattacher le locataire d'une entreprise au bien d'une
--     autre — ce n'est pas une règle applicative, c'est PostgreSQL ;
--   • `audit_trigger()` sur les trois tables, sans une ligne de code
--     applicatif ;
--   • `freeze_document_number()` sur la quittance : un numéro émis ne se
--     modifie plus, ici comme sur un reçu ;
--   • `touch_updated_at()` pour les horodatages ;
--   • le RLS par rôle, avec la même échelle : émettre revient au
--     propriétaire, au gestionnaire et au comptable ; supprimer et
--     annuler au propriétaire et au gestionnaire seuls.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GARDE-FOU — les deux scripts précédents doivent être joués.
--
-- Même raison que dans `subscriptions.sql` : l'éditeur SQL de Supabase
-- joue le collage en UNE transaction, un échec annule tout, et un
-- « 42P01 » brut n'indique ni la base atteinte ni ce qui manque.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION
      'supabase/schema.sql n''a pas été joué sur cette base. Jouez-le d''abord. Base = %, rôle = %',
      current_database(), current_user;
  END IF;

  IF to_regproc('public.touch_updated_at') IS NULL THEN
    RAISE EXCEPTION
      'supabase/subscriptions.sql n''a pas été joué sur cette base : la fonction « touch_updated_at » est absente. Jouez-le avant ce script.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- ENUMS — des valeurs fermées plutôt que du texte libre, comme partout.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE property_kind AS ENUM (
    'appartement', 'villa', 'maison', 'bureau',
    'local_commercial', 'immeuble', 'terrain', 'autre'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE property_status AS ENUM ('disponible', 'occupe', 'indisponible');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rent_receipt_status AS ENUM ('draft', 'issued', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Les quatre cases du carnet de quittances, plus le mobile money — qui
-- règle aujourd'hui une bonne part des loyers sur le marché visé, et
-- qu'aucun carnet imprimé ne prévoit encore.
DO $$ BEGIN
  CREATE TYPE rent_payment_method AS ENUM (
    'especes', 'cheque', 'virement', 'depot', 'mobile_money'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- BIENS
-- =====================================================================
CREATE TABLE IF NOT EXISTS properties (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Référence choisie par l'entreprise : « APP-A3 », « VILLA-2 ». Unique
  -- chez elle, et chez elle seulement — deux agences peuvent très bien
  -- nommer chacune leur bien « LOT-1 ».
  reference       TEXT NOT NULL CHECK (length(trim(reference)) > 0),
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind            property_kind NOT NULL DEFAULT 'appartement',
  address         TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  -- Le bailleur, quand l'entreprise gère pour le compte d'un tiers. Vide
  -- lorsqu'elle est elle-même propriétaire : la quittance retombe alors
  -- sur sa raison sociale.
  owner_name      TEXT NOT NULL DEFAULT '',
  rent_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (rent_amount >= 0),
  charges_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (charges_amount >= 0),
  status          property_status NOT NULL DEFAULT 'disponible',
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Cible des clés étrangères composites ci-dessous.
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, reference)
);

CREATE INDEX IF NOT EXISTS properties_organization_idx
  ON properties (organization_id, reference);

-- =====================================================================
-- LOCATAIRES
-- =====================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
  phone            TEXT NOT NULL DEFAULT '',
  email            TEXT,
  address          TEXT NOT NULL DEFAULT '',
  lease_reference  TEXT NOT NULL DEFAULT '',
  -- Le bien occupé. Facultatif : on saisit souvent le locataire avant de
  -- lui affecter un lot, et un locataire sorti n'en occupe plus aucun.
  property_id      UUID,
  -- Le loyer du bail, qui peut différer de celui affiché sur le bien :
  -- une remise consentie, un ancien bail non réévalué. C'est celui-ci qui
  -- alimente la quittance.
  rent_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (rent_amount >= 0),
  charges_amount   NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (charges_amount >= 0),
  lease_start      DATE,
  lease_end        DATE,
  notes            TEXT NOT NULL DEFAULT '',
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, organization_id),
  -- RESTRICT et non CASCADE : supprimer un bien encore occupé effacerait
  -- son locataire sans un mot. L'application relève le 23503 et l'explique.
  FOREIGN KEY (property_id, organization_id)
    REFERENCES properties (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS tenants_organization_idx
  ON tenants (organization_id, full_name);
CREATE INDEX IF NOT EXISTS tenants_property_idx
  ON tenants (property_id);

-- =====================================================================
-- NUMÉROTATION DES QUITTANCES — QL-2026-0001
--
-- ─── Pourquoi un compteur séparé de `document_counters` ────────────────
-- Réemployer la table imposerait d'ajouter « rent_receipt » à l'ENUM
-- `document_kind`. Or `ALTER TYPE ... ADD VALUE` interdit d'UTILISER la
-- nouvelle valeur dans la même transaction — et l'éditeur SQL de Supabase
-- joue tout le collage en une seule. `document_prefix()`, qui est en
-- LANGUAGE SQL, voit son corps analysé à la création : il échouerait sur
-- « unsafe use of new value of enum type », et annulerait le script
-- entier. Ce piège nous a déjà coûté deux allers-retours sur ce projet.
--
-- Le compteur est donc distinct, mais le MÉCANISME est identique, verrou
-- compris : `ON CONFLICT DO UPDATE` verrouille la ligne, deux quittances
-- émises en même temps attendent l'une l'autre au lieu de repartir du
-- même dernier numéro.
-- =====================================================================
CREATE TABLE IF NOT EXISTS rent_receipt_counters (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year            INT NOT NULL,
  last_value      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, year)
);

ALTER TABLE rent_receipt_counters ENABLE ROW LEVEL SECURITY;
-- Aucune policy d'écriture : seule la fonction SECURITY DEFINER ci-dessous
-- y touche. La lecture reste ouverte à l'organisation, comme pour
-- `document_counters` : c'est ce qui alimente « prochain numéro ».
DROP POLICY IF EXISTS rent_receipt_counters_select ON rent_receipt_counters;
CREATE POLICY rent_receipt_counters_select ON rent_receipt_counters
  FOR SELECT USING (organization_id = (SELECT current_organization_id()));

CREATE OR REPLACE FUNCTION next_rent_receipt_number(
  p_organization UUID,
  p_year         INT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_value INT;
BEGIN
  INSERT INTO rent_receipt_counters (organization_id, year, last_value)
  VALUES (p_organization, p_year, 1)
  ON CONFLICT (organization_id, year) DO UPDATE
    SET last_value = rent_receipt_counters.last_value + 1
  RETURNING last_value INTO v_value;

  RETURN format('QL-%s-%s', p_year, lpad(v_value::text, 4, '0'));
END;
$$;

-- Révoquer PUBLIC, et non `anon, authenticated` : le droit d'exécution
-- accordé par défaut appartient à PUBLIC, dont ces deux rôles héritent.
-- Les nommer ne retirerait rien. Voir `supabase/schema.sql`.
REVOKE EXECUTE ON FUNCTION next_rent_receipt_number(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION next_rent_receipt_number(UUID, INT) TO service_role;

-- =====================================================================
-- QUITTANCES DE LOYER
--
-- ─── Pourquoi tant de colonnes recopiées ───────────────────────────────
-- `tenant_name`, `property_address`, `landlord_name`… dupliquent des
-- valeurs déjà présentes dans `tenants` et `properties`. C'est délibéré :
-- une quittance est une pièce remise, opposable, dont l'exemplaire papier
-- circule. Si le locataire est renommé ou le bien réaffecté l'an
-- prochain, la quittance de janvier ne doit pas se relire autrement que
-- l'exemplaire détenu par le locataire.
--
-- C'est le même raisonnement que `amount_in_words`, stocké et non
-- recalculé à l'affichage. Une jointure serait plus « propre » et
-- produirait, six mois plus tard, un document qui ment.
-- =====================================================================
CREATE TABLE IF NOT EXISTS rent_receipts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number            TEXT NOT NULL,
  status            rent_receipt_status NOT NULL DEFAULT 'issued',
  issued_on         DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Rattachements. Conservés pour filtrer l'historique ; ils ne
  -- commandent PAS ce qui s'imprime.
  property_id       UUID,
  tenant_id         UUID,

  -- Ce qui s'imprime, figé à l'émission.
  tenant_name       TEXT NOT NULL CHECK (length(trim(tenant_name)) > 0),
  tenant_phone      TEXT NOT NULL DEFAULT '',
  property_label    TEXT NOT NULL DEFAULT '',
  property_address  TEXT NOT NULL DEFAULT '',
  property_kind     property_kind,
  landlord_name     TEXT NOT NULL DEFAULT '',
  manager_name      TEXT NOT NULL DEFAULT '',

  -- Période couverte.
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  period_label      TEXT NOT NULL DEFAULT '',

  -- Montants. `total_amount` est stocké plutôt que calculé à la lecture :
  -- c'est la somme qui figure sur le papier, et une règle de calcul qui
  -- changerait ne doit pas réécrire les quittances déjà remises.
  rent_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (rent_amount >= 0),
  charges_amount    NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (charges_amount >= 0),
  other_fees        NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (other_fees >= 0),
  total_amount      NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  amount_in_words   TEXT NOT NULL DEFAULT '',

  payment_method    rent_payment_method NOT NULL DEFAULT 'especes',
  payment_reference TEXT NOT NULL DEFAULT '',
  paid_on           DATE,

  notes             TEXT NOT NULL DEFAULT '',

  -- Une annulation se conserve : elle ne supprime rien et ne libère aucun
  -- numéro. C'est ce qu'un contrôle attend d'un carnet à souche.
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT NOT NULL DEFAULT '',

  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (id, organization_id),
  UNIQUE (organization_id, number),
  CONSTRAINT rent_receipts_period_order CHECK (period_end >= period_start),
  FOREIGN KEY (property_id, organization_id)
    REFERENCES properties (id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, organization_id)
    REFERENCES tenants (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS rent_receipts_organization_idx
  ON rent_receipts (organization_id, issued_on DESC, number DESC);
CREATE INDEX IF NOT EXISTS rent_receipts_tenant_idx
  ON rent_receipts (tenant_id);
CREATE INDEX IF NOT EXISTS rent_receipts_property_idx
  ON rent_receipts (property_id);
CREATE INDEX IF NOT EXISTS rent_receipts_period_idx
  ON rent_receipts (organization_id, period_start);

-- ---------------------------------------------------------------------
-- Le numéro est attribué à l'insertion, jamais fourni par le client.
--
-- Le déclencheur ignore toute valeur reçue, y compris via PostgREST : le
-- formulaire n'est pas la frontière. Même geste que `receipts`.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_rent_receipt_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.number := next_rent_receipt_number(
    NEW.organization_id,
    EXTRACT(YEAR FROM NEW.issued_on)::INT
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rent_receipts_number ON rent_receipts;
CREATE TRIGGER rent_receipts_number BEFORE INSERT ON rent_receipts
  FOR EACH ROW EXECUTE FUNCTION assign_rent_receipt_number();

-- `freeze_document_number()` vient de `schema.sql` et ne connaît rien de
-- la table qu'il garde : il compare NEW.number à OLD.number, c'est tout.
DROP TRIGGER IF EXISTS rent_receipts_freeze_number ON rent_receipts;
CREATE TRIGGER rent_receipts_freeze_number BEFORE UPDATE ON rent_receipts
  FOR EACH ROW EXECUTE FUNCTION freeze_document_number();

-- ---------------------------------------------------------------------
-- Horodatage et journal d'audit — les mêmes fonctions que partout.
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties', 'tenants', 'rent_receipts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);

    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION audit_trigger()', t, t);
  END LOOP;
END $$;

-- =====================================================================
-- ROW LEVEL SECURITY
--
-- Exactement l'échelle des pièces de caisse : le comptable écrit, c'est
-- son métier ; le lecteur consulte ; la suppression reste au propriétaire
-- et au gestionnaire. Aucun rôle nouveau, aucune permission parallèle.
-- =====================================================================
ALTER TABLE properties    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_receipts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties', 'tenants', 'rent_receipts'] LOOP
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

-- ---------------------------------------------------------------------
-- Une quittance ÉMISE ne se modifie plus, et ne se supprime pas.
--
-- Le RLS raisonne par lignes et ne sait pas distinguer « corriger un
-- brouillon » de « réécrire une pièce déjà remise ». D'où ce déclencheur,
-- au même endroit et pour la même raison que `profiles_guard_columns` :
-- la policy autorise l'UPDATE, la garde décide ce qu'il peut toucher.
--
-- Seule transition permise sur une quittance émise : son annulation. Elle
-- laisse la ligne en place, avec sa date et son motif — supprimer
-- effacerait la trace, et le numéro manquerait sans explication.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_rent_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Sans session utilisateur, on est sur le chemin serveur muni de la clé
  -- de service, qui a déjà franchi ses propres gardes.
  --
  -- `RETURN NEW` seul serait un piège : sur un DELETE, `NEW` vaut NULL, et
  -- un déclencheur BEFORE qui rend NULL ANNULE l'opération — sans erreur.
  -- La suppression paraissait réussir et ne touchait aucune ligne, ce qui
  -- bloquait ensuite la suppression du bien, du locataire, puis de
  -- l'organisation entière, chaque fois par une clé étrangère dont plus
  -- rien n'expliquait l'origine.
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION
        'Une quittance émise ne se supprime pas : annulez-la, la trace doit rester.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'Une quittance annulée ne se modifie plus.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'issued' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION
      'Une quittance émise ne se corrige pas : annulez-la et émettez-en une autre.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rent_receipts_guard ON rent_receipts;
CREATE TRIGGER rent_receipts_guard BEFORE UPDATE OR DELETE ON rent_receipts
  FOR EACH ROW EXECUTE FUNCTION guard_rent_receipt();

-- ---------------------------------------------------------------------
-- Le statut d'un bien suit ses locataires, sans intervention applicative.
--
-- Poser « occupé » à la main se serait oublié un jour sur deux, et le
-- tableau des biens disponibles aurait menti. Le déclencheur relit
-- simplement s'il reste un locataire rattaché.
--
-- « indisponible » — travaux, retrait de la location — est une décision
-- humaine : elle n'est jamais écrasée.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_property_status()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids UUID[] := ARRAY[]::UUID[];
  v_id  UUID;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.property_id IS NOT NULL THEN
    v_ids := array_append(v_ids, OLD.property_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.property_id IS NOT NULL THEN
    v_ids := array_append(v_ids, NEW.property_id);
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    UPDATE properties p
       SET status = CASE
             WHEN EXISTS (SELECT 1 FROM tenants t WHERE t.property_id = p.id)
               THEN 'occupe'::property_status
             ELSE 'disponible'::property_status
           END
     WHERE p.id = v_id
       AND p.status <> 'indisponible';
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS tenants_sync_property ON tenants;
CREATE TRIGGER tenants_sync_property
  AFTER INSERT OR UPDATE OF property_id OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION sync_property_status();
