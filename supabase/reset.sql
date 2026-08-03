-- =====================================================================
-- ImmoOps — RESET DESTRUCTIF
--
-- ⚠️  Ce script SUPPRIME toutes les tables ImmoOps et leurs données.
--     Il n'a de sens que dans un seul cas : vous aviez exécuté le schéma
--     V1 (modèle `owner_id`) et vous passez à la V2 multi-tenant, sans
--     données de production à conserver.
--
--     Les comptes utilisateurs (auth.users) ne sont PAS touchés.
--     Les fichiers déjà déposés dans le bucket `documents` ne sont PAS
--     supprimés — videz-le depuis le dashboard Supabase si nécessaire.
--
-- Exécutez ensuite `supabase/schema.sql`.
-- =====================================================================

DROP TABLE IF EXISTS rate_limits           CASCADE;
DROP TABLE IF EXISTS notifications         CASCADE;
DROP TABLE IF EXISTS payment_declarations  CASCADE;
DROP TABLE IF EXISTS audit_logs     CASCADE;
DROP TABLE IF EXISTS login_events   CASCADE;
DROP TABLE IF EXISTS documents      CASCADE;
DROP TABLE IF EXISTS maintenance    CASCADE;
DROP TABLE IF EXISTS expenses       CASCADE;
DROP TABLE IF EXISTS rent_payments  CASCADE;
DROP TABLE IF EXISTS leases         CASCADE;
DROP TABLE IF EXISTS apartments     CASCADE;
DROP TABLE IF EXISTS tenants        CASCADE;
DROP TABLE IF EXISTS buildings      CASCADE;
DROP TABLE IF EXISTS profiles       CASCADE;
DROP TABLE IF EXISTS organizations  CASCADE;

DROP FUNCTION IF EXISTS consume_rate_limit(TEXT, INT, INT)           CASCADE;
DROP FUNCTION IF EXISTS review_payment_declaration(UUID, BOOLEAN)    CASCADE;
DROP FUNCTION IF EXISTS notify_payment_declared()                    CASCADE;
DROP FUNCTION IF EXISTS notify_lease_created()                       CASCADE;
DROP FUNCTION IF EXISTS notify_payment_paid()                        CASCADE;
DROP FUNCTION IF EXISTS notify_maintenance_status()                  CASCADE;
DROP FUNCTION IF EXISTS notify_maintenance_created()                 CASCADE;
DROP FUNCTION IF EXISTS apartment_active_tenant(UUID)                CASCADE;
-- Sans signature : nommer `notification_kind` ici ferait échouer le script
-- sur une base où le type n'a jamais existé — `IF EXISTS` ne protège pas
-- d'un type d'argument introuvable. PostgreSQL 10+ accepte le nom seul
-- lorsqu'il est sans ambiguïté.
DROP FUNCTION IF EXISTS notify_tenant                                CASCADE;
DROP FUNCTION IF EXISTS notify_staff                                 CASCADE;
DROP FUNCTION IF EXISTS global_search(TEXT, INT)                     CASCADE;
DROP FUNCTION IF EXISTS create_organization(TEXT, TEXT, TEXT)        CASCADE;
DROP FUNCTION IF EXISTS generate_rent_schedule(UUID, INT)            CASCADE;
DROP FUNCTION IF EXISTS record_login_event(TEXT, BOOLEAN, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS tenant_building_ids()                        CASCADE;
DROP FUNCTION IF EXISTS tenant_apartment_ids()                       CASCADE;
DROP FUNCTION IF EXISTS tenant_lease_ids()                           CASCADE;
DROP FUNCTION IF EXISTS is_staff()                                   CASCADE;
DROP FUNCTION IF EXISTS current_tenant_id()                          CASCADE;
DROP FUNCTION IF EXISTS current_organization_id()                    CASCADE;
DROP FUNCTION IF EXISTS current_user_role()                          CASCADE;
DROP FUNCTION IF EXISTS has_role(user_role[])                        CASCADE;
DROP FUNCTION IF EXISTS audit_trigger()                              CASCADE;
DROP FUNCTION IF EXISTS sync_apartment_status()                      CASCADE;
DROP FUNCTION IF EXISTS normalize_payment_month()                    CASCADE;

DROP TYPE IF EXISTS user_role            CASCADE;
DROP TYPE IF EXISTS apartment_status     CASCADE;
DROP TYPE IF EXISTS lease_status         CASCADE;
DROP TYPE IF EXISTS payment_status       CASCADE;
DROP TYPE IF EXISTS maintenance_priority CASCADE;
DROP TYPE IF EXISTS maintenance_status   CASCADE;
DROP TYPE IF EXISTS document_owner_type  CASCADE;
DROP TYPE IF EXISTS document_visibility  CASCADE;
DROP TYPE IF EXISTS expense_category     CASCADE;
DROP TYPE IF EXISTS notification_kind    CASCADE;
DROP TYPE IF EXISTS payment_declaration_status CASCADE;

-- Policies storage de la V1 / V2 (les tables ci-dessus ne les couvrent pas).
DROP POLICY IF EXISTS documents_owner_all             ON storage.objects;
DROP POLICY IF EXISTS documents_storage_select        ON storage.objects;
DROP POLICY IF EXISTS documents_storage_tenant_select ON storage.objects;
DROP POLICY IF EXISTS documents_storage_write         ON storage.objects;
DROP POLICY IF EXISTS logos_read                       ON storage.objects;
DROP POLICY IF EXISTS logos_write                      ON storage.objects;
