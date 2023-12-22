--
UPDATE redeemed_ticket SET
	published = (strftime('%s', 'now'))
WHERE
	subject = :subject
AND
	resource = :resource
AND
	iss = :iss
AND
	ticket = :ticket
