--
BEGIN;
	CREATE TABLE _meta_schema_version (
		major INTEGER NOT NULL CHECK (typeof(major) = 'integer'),
		minor INTEGER NOT NULL CHECK (typeof(minor) = 'integer'),
		patch INTEGER NOT NULL CHECK (typeof(patch) = 'integer'),
		applied INTEGER NOT NULL DEFAULT (strftime('%s', 'now')) CHECK (typeof(applied) = 'integer'),
		PRIMARY KEY (major DESC, minor DESC, patch DESC)
	) WITHOUT ROWID;
	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (0, 0, 0);
COMMIT;
