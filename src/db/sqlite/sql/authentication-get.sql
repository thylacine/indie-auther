--
SELECT
	created,
	last_authentication,
	identifier,
	credential
FROM authentication
WHERE identifier = :identifier
