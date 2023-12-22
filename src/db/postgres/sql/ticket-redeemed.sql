--
INSERT INTO redeemed_ticket
	(subject, resource, iss, token, ticket)
VALUES
	($(subject), $(resource), $(iss), $(token), $(ticket))
