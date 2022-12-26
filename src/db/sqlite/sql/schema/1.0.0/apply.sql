BEGIN;

	CREATE TABLE almanac (
		event TEXT NOT NULL PRIMARY KEY CHECK (typeof(event) = 'text'),
		epoch INTEGER NOT NULL DEFAULT 0 CHECK (typeof(epoch) = 'integer')
	);

	CREATE TABLE authentication (
		identifier_id INTEGER NOT NULL PRIMARY KEY,
		created INTEGER NOT NULL DEFAULT (strftime('%s', 'now')) CHECK (typeof(created) = 'integer'),
		last_authentication INTEGER NOT NULL DEFAULT 0 CHECK (typeof(last_authentication) = 'integer'),
		identifier TEXT NOT NULL UNIQUE CHECK (typeof(identifier) = 'text'),
		credential TEXT CHECK (typeof(credential) IN ('text', 'null'))
	);

	CREATE TABLE resource (
		resource_id TEXT NOT NULL PRIMARY KEY CHECK (typeof(resource_id) = 'text'),
		description TEXT NOT NULL DEFAULT '' CHECK (typeof(description) = 'text'),
		created INTEGER NOT NULL DEFAULT (strftime('%s', 'now')) CHECK (typeof(created) = 'integer'),
		secret TEXT NOT NULL CHECK (typeof(secret) = 'text')
	);

	CREATE TABLE profile (
		profile_id INTEGER NOT NULL PRIMARY KEY,
		identifier_id INTEGER NOT NULL REFERENCES authentication(identifier_id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		profile TEXT NOT NULL CHECK (typeof(profile) = 'text'),
		UNIQUE (identifier_id, profile) ON CONFLICT IGNORE
	);
	CREATE INDEX profile_identifier_id_idx ON profile(identifier_id);
	CREATE INDEX profile_profile_idx ON profile(profile);

	CREATE TABLE scope (
		scope_id INTEGER NOT NULL PRIMARY KEY,
		scope TEXT NOT NULL UNIQUE CHECK (typeof(scope) = 'text'),
		description TEXT NOT NULL ON CONFLICT REPLACE DEFAULT '' CHECK (typeof(description) = 'text'),
		application TEXT NOT NULL ON CONFLICT REPLACE DEFAULT '' CHECK (typeof(application) = 'text'),
		is_permanent INTEGER NOT NULL DEFAULT 0 CHECK (typeof(is_permanent) = 'integer' AND is_permanent IN (0, 1)),
		is_manually_added INTEGER NOT NULL DEFAULT 0 CHECK (typeof(is_manually_added) = 'integer' AND is_manually_added IN (0, 1))
	);

	CREATE TABLE profile_scope (
		profile_id INTEGER NOT NULL REFERENCES profile(profile_id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		scope_id INTEGER NOT NULL REFERENCES scope(scope_id) ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		PRIMARY KEY (profile_id, scope_id)
	);
	CREATE INDEX profile_scope_scope_id_idx ON profile_scope(scope_id);

	CREATE TABLE token (
		code_id TEXT NOT NULL PRIMARY KEY CHECK (typeof(code_id) = 'text'),
		profile_id INTEGER NOT NULL REFERENCES profile (profile_id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		created INTEGER NOT NULL DEFAULT (strftime('%s', 'now')) CHECK (typeof(created) = 'integer'),
		expires INTEGER CHECK (typeof(expires) IN ('integer', 'null')),
		refresh_expires INTEGER CHECK (typeof(refresh_expires) IN ('integer', 'null')),
		refreshed INTEGER CHECK (typeof(refreshed) IN ('integer', 'null')),
		duration INTEGER CHECK (typeof(duration) IN ('integer', 'null')),
		refresh_duration INTEGER CHECK (typeof(refresh_duration) IN ('integer', 'null')),
		refresh_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(refresh_count) = 'integer'),
		is_revoked INTEGER NOT NULL DEFAULT 0 CHECK (typeof(is_revoked) = 'integer' AND is_revoked IN (0, 1)),
		is_token INTEGER NOT NULL CHECK (typeof(is_token) = 'integer' AND is_token IN (0, 1)),
		client_id TEXT NOT NULL CHECK (typeof(client_id) = 'text'),
		resource TEXT CHECK (typeof(resource) IN ('integer', 'null')),
		profile_data TEXT,
		CONSTRAINT expires_needs_duration CHECK (expires IS NULL OR duration IS NOT NULL),
		CONSTRAINT refresh_expires_needs_refresh_duration CHECK (refresh_expires IS NULL OR refresh_duration IS NOT NULL)
	);
	CREATE INDEX token_profile_id_idx ON token(profile_id);
	CREATE INDEX token_created_idx ON token(created);
	CREATE INDEX token_expires_idx ON token(expires) WHERE expires IS NOT NULL;
	CREATE INDEX token_refresh_expires_idx ON token(refresh_expires) WHERE refresh_expires IS NOT NULL;

	CREATE TABLE token_scope (
		code_id TEXT NOT NULL REFERENCES token(code_id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		scope_id INTEGER NOT NULL REFERENCES scope(scope_id) ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		PRIMARY KEY (code_id, scope_id)
	);
	CREATE INDEX token_scope_scope_id_idx ON token_scope(scope_id);

	-- Update schema version
	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 0, 0);

	-- Seed scope data
	INSERT INTO scope (scope, description, application, is_permanent) VALUES
		('profile', 'Access detailed profile information, including name, image, and url.', 'IndieAuth', 1),
		('email', 'Include email address with detailed profile information.', 'IndieAuth', 1),
		('create', 'Create new items.', 'MicroPub', 1),
		('draft', 'All created items are drafts.', 'MicroPub', 1),
		('update', 'Edit existing items.', 'MicroPub', 1),
		('delete', 'Remove items.', 'MicroPub', 1),
		('media', 'Allow file uploads.', 'MicroPub', 1),
		('read', 'Read access to channels.', 'MicroSub', 1),
		('follow', 'Management of following list.', 'MicroSub', 1),
		('mute', 'Management of user muting.', 'MicroSub', 1),
		('block', 'Management of user blocking.', 'MicroSub', 1),
		('channels', 'Management of channels.', 'MicroSub', 1)
	;

COMMIT;
