BEGIN;

	CREATE TABLE almanac (
		event TEXT NOT NULL PRIMARY KEY,
		date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '-infinity'::timestamptz
	);
	COMMENT ON TABLE almanac IS $docstring$
Notable events for service administration.
	$docstring$;

	CREATE TABLE authentication (
		identifier_id BIGINT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		last_authentication TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '-infinity'::timestamptz,
		identifier TEXT NOT NULL UNIQUE,
		credential TEXT
	);
	COMMENT ON TABLE authentication IS $docstring$
Users and their credentials.
	$docstring$;

	CREATE TABLE resource (
		resource_id UUID NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(), -- few insertions, v4 preferred over v1
		description TEXT NOT NULL DEFAULT '',
		created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		secret TEXT NOT NULL CHECK(length(secret) > 0)
	);
	COMMENT ON TABLE resource IS $docstring$
External resource servers and their credentials.
	$docstring$;

	CREATE TABLE profile (
		profile_id BIGINT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		identifier_id BIGINT NOT NULL REFERENCES authentication(identifier_id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		profile TEXT NOT NULL,
		CONSTRAINT unique_identifier_id_profile UNIQUE (identifier_id, profile)
	);
	CREATE INDEX profile_identifier_id_idx ON profile(identifier_id);
	CREATE INDEX profile_profile_idx ON profile(profile);
	COMMENT ON TABLE profile IS $docstring$
Profile URIs and the users they are associated with.
$docstring$;

	CREATE TABLE scope (
		scope_id BIGINT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		scope TEXT NOT NULL UNIQUE,
		description TEXT NOT NULL DEFAULT '',
		application TEXT NOT NULL DEFAULT '',
		is_permanent BOOLEAN NOT NULL DEFAULT false,
		is_manually_added BOOLEAN NOT NULL DEFAULT false
	);
	COMMENT ON TABLE scope IS $docstring$
All and any scopes encountered.
$docstring$;
	COMMENT ON COLUMN scope.is_permanent IS $docstring$
Prevents deletion of scope, set on seeded scope rows.
$docstring$;
	COMMENT ON COLUMN scope.is_manually_added IS $docstring$
Prevents deletion of scope when no longer referenced, set on user-added scopes.
User can still delete manually.
$docstring$;
	CREATE INDEX scope_garbage_collectable_idx ON scope(scope_id) WHERE NOT (is_permanent OR is_manually_added);
	COMMENT ON INDEX scope_garbage_collectable_idx IS $docstring$
Shadow the primary index with a partial to help GC cleanup of client-provided scopes.
$docstring$;
	CREATE INDEX scope_is_permanent_idx ON scope(scope_id) WHERE is_permanent;
	CREATE INDEX scope_is_manual_idx ON scope(scope_id) WHERE is_manually_added;

	CREATE TABLE profile_scope (
		profile_id BIGINT NOT NULL REFERENCES profile(profile_id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		scope_id BIGINT NOT NULL REFERENCES scope(scope_id) ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		PRIMARY KEY (profile_id, scope_id)
	);
	COMMENT ON TABLE profile_scope IS $docstring$
Convenience bindings of available scopes for a profile.
$docstring$;
	CREATE INDEX profile_scope_scope_id_idx ON profile_scope(scope_id);

	CREATE TABLE token (
		code_id UUID NOT NULL PRIMARY KEY,
		profile_id BIGINT NOT NULL REFERENCES profile(profile_id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		expires TIMESTAMP WITH TIME ZONE,
		refresh_expires TIMESTAMP WITH TIME ZONE,
		refreshed TIMESTAMP WITH TIME ZONE,
		duration INTERVAL,
		CONSTRAINT expires_needs_duration CHECK (expires IS NULL OR duration IS NOT NULL),
		refresh_duration INTERVAL,
		CONSTRAINT refresh_expires_needs_refresh_duration CHECK (refresh_expires IS NULL OR refresh_duration IS NOT NULL),
		refresh_count BIGINT NOT NULL DEFAULT 0,
		is_revoked BOOLEAN NOT NULL DEFAULT false,
		is_token BOOLEAN NOT NULL,
		client_id TEXT NOT NULL,
		resource TEXT,
		profile_data JSONB
	);
	CREATE INDEX token_profile_id_idx ON token(profile_id);
	CREATE INDEX token_created_idx ON token(created);
	CREATE INDEX token_expires_idx ON token(expires);
	CREATE INDEX token_refresh_expires_idx ON token(refresh_expires);
	CREATE INDEX token_is_revoked_idx ON token(is_revoked) WHERE is_revoked;
	COMMENT ON TABLE token IS $docstring$
Redeemed codes and their current states.
$docstring$;
	COMMENT ON COLUMN token.is_token IS $docstring$
Whether code was redeemed for a token, or only a profile.
We track non-token redemptions to prevent re-redemption while
code is still valid.
$docstring$;
	COMMENT ON COLUMN token.resource IS $docstring$
Tokens granted by ticket redemption are associated with a
resource url for which they are valid.
$docstring$;
	COMMENT ON INDEX token_is_revoked_idx IS $docstring$
A partial index on revoked tokens, to ease cleanup query.
$docstring$;

	CREATE TABLE token_scope (
		code_id UUID NOT NULL REFERENCES token(code_id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		scope_id BIGINT NOT NULL REFERENCES scope(scope_id) ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		PRIMARY KEY (code_id, scope_id)
	);
	COMMENT ON TABLE token_scope IS $docstring$
Scopes associated with a token.
$docstring$;
	CREATE INDEX token_scope_scope_id_idx ON token_scope(scope_id);

	-- Update schema version
	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 0, 0);

	-- Seed scope data
	INSERT INTO scope (scope, description, application, is_permanent) VALUES
		('profile', 'Access detailed profile information, including name, image, and url.', 'IndieAuth', true),
		('email', 'Include email address with detailed profile information.', 'IndieAuth', true),
		('create', 'Create new items.', 'MicroPub', true),
		('draft', 'All created items are drafts.', 'MicroPub', true),
		('update', 'Edit existing items.', 'MicroPub', true),
		('delete', 'Remove items.', 'MicroPub', true),
		('media', 'Allow file uploads.', 'MicroPub', true),
		('read', 'Read access to channels.', 'MicroSub', true),
		('follow', 'Management of following list.', 'MicroSub', true),
		('mute', 'Management of user muting.', 'MicroSub', true),
		('block', 'Management of user blocking.', 'MicroSub', true),
		('channels', 'Management of channels.', 'MicroSub', true)
	;

COMMIT;
