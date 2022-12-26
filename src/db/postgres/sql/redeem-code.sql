--
INSERT INTO token (
	created,
	code_id,
	is_token,
	client_id,
	profile_id,
	duration,
	expires,
	refresh_duration,
	refresh_expires,
	resource,
	profile_data
) SELECT
	$(created)::timestamptz,
	$(codeId),
	$(isToken),
	$(clientId),
	p.profile_id,
	$(lifespanSeconds)::text::interval,
	CASE WHEN $(lifespanSeconds) IS NULL THEN NULL ELSE $(created)::timestamptz + $(lifespanSeconds)::text::interval END,
	$(refreshLifespanSeconds)::text::interval,
	CASE WHEN $(refreshLifespanSeconds) IS NULL THEN NULL ELSE $(created)::timestamptz + $(refreshLifespanSeconds)::text::interval END,
	$(resource),
	$(profileData)
FROM profile p INNER JOIN authentication a USING (identifier_id)
WHERE p.profile = $(profile) AND a.identifier = $(identifier)
ON CONFLICT (code_id) DO UPDATE -- repeated redemption attempt invalidates existing token
	SET is_revoked = true
RETURNING *
