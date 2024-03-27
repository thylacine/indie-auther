BEGIN;

	ALTER TABLE authentication ADD COLUMN otp_key CHECK (typeof(otp_key) IN ('text', 'null'));

	-- Update schema version
	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 2, 0);

COMMIT;
