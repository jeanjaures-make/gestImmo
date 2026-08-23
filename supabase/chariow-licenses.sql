-- Licence Chariow liée à l'organisation et au plan local.
CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  chariow_license_id TEXT,
  chariow_product_id TEXT NOT NULL,
  license_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending_activation','active','expired','revoked','cancelled')),
  plan_id UUID NOT NULL REFERENCES plans(id),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, license_key)
);
CREATE INDEX IF NOT EXISTS licenses_org_idx ON licenses (organization_id, created_at DESC);
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS licenses_select ON licenses;
CREATE POLICY licenses_select ON licenses FOR SELECT USING (organization_id = (SELECT current_organization_id()));
DROP TRIGGER IF EXISTS licenses_touch ON licenses;
CREATE TRIGGER licenses_touch BEFORE UPDATE ON licenses FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_event_id_idx ON payment_events(event_id) WHERE event_id IS NOT NULL;
