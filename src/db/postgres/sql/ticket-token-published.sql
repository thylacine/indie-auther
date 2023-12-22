--
UPDATE redeemed_ticket SET
	published = now()
WHERE
	subject = $(subject)
AND
	resource = $(resource)
AND
	iss = $(iss)
AND
	ticket = $(ticket)
