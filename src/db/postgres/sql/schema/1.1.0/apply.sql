BEGIN;

	CREATE TABLE redeemed_ticket (
		ticket_id BIGINT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
		created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		subject TEXT NOT NULL,
		resource TEXT NOT NULL,
		iss TEXT,
		token TEXT NOT NULL,
		ticket TEXT NOT NULL,
		published TIMESTAMP WITH TIME ZONE
	);
	COMMENT ON TABLE redeemed_ticket IS $docstring$
Tickets which have been redeemed for tokens and published.
	$docstring$;
	CREATE INDEX redeemed_ticket_created_idx ON redeemed_ticket(created);
	CREATE INDEX redeemed_ticket_published_idx ON redeemed_ticket(published) WHERE published IS NOT NULL;
	CREATE INDEX redeemed_ticket_ref_idx ON redeemed_ticket(subject, resource, iss, ticket);

	-- Update schema version
	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 1, 0);

COMMIT;
