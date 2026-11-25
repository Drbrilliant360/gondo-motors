-- Private uploads are fetched through short-lived signed links, which need the file format as well as the asset id.
BEGIN;
ALTER TABLE order_documents ADD COLUMN cloud_format TEXT;
ALTER TABLE payments        ADD COLUMN proof_format TEXT;
ALTER TABLE payments        ADD COLUMN proof_filename TEXT;
COMMIT;
