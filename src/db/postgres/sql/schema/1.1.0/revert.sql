BEGIN;
	DROP TABLE redeemed_ticket CASCADE;

	DELETE FROM _meta_schema_version WHERE major = 1 AND minor = 1 AND patch = 0;
COMMIT;
