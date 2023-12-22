BEGIN;

	CREATE TABLE redeemed_ticket (
		ticket_id INTEGER NOT NULL PRIMARY KEY CHECK (typeof(ticket_id) = 'integer'),
		created INTEGER NOT NULL DEFAULT (strftime('%s', 'now')) CHECK (typeof(created) = 'integer'),
		subject TEXT NOT NULL CHECK (typeof(subject) = 'text'),
		resource TEXT NOT NULL CHECK (typeof(resource) = 'text'),
		iss TEXT CHECK (typeof(iss) = 'text'),
		token TEXT NOT NULL  CHECK (typeof(token) = 'text'),
		ticket TEXT NOT NULL CHECK (typeof(ticket) = 'text'),
		published INTEGER CHECK (typeof(published) IN ('integer', 'null'))
	);
	CREATE INDEX redeemed_ticket_created_idx ON redeemed_ticket(created);
	CREATE INDEX redeemed_ticket_published_idx ON redeemed_ticket(published) WHERE published IS NOT NULL;
	CREATE INDEX redeemed_ticket_ref_idx ON redeemed_ticket(subject, resource, iss, ticket);

	-- Update schema version
	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 1, 0);

COMMIT;
