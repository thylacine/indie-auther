BEGIN;
	DROP TABLE authentication;
	DROP TABLE profile;
	DROP TABLE token;
	DROP TABLE scope;
	DROP TABLE profile_scope;

	DELETE FROM _meta_schema_version WHERE major = 1 AND minor = 0 AND patch = 0;
COMMIT;