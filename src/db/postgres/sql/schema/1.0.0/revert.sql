BEGIN;
	DROP TABLE authentication CASCADE;
	DROP TABLE profile CASCADE;
	DROP TABLE token CASCADE;
	DROP TABLE scope CASCADE;
	DROP TABLE profile_scope CASCADE;

	DELETE FROM _meta_schema_version WHERE major = 1 AND minor = 0 AND patch = 0;
COMMIT;
