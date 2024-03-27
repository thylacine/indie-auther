--
SELECT
	created,
	last_authentication,
	identifier,
	credential,
	otp_key
FROM authentication
WHERE identifier = :identifier
