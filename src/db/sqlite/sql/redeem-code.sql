--
INSERT INTO token (
	code_id,
	created,
	is_token,
	client_id,
	profile_id,
	expires,
	duration,
	refresh_expires,
	refresh_duration
)
	SELECT
		:codeId,
		:created,
		:isToken,
		:clientId,
		p.profile_id,
		CASE WHEN :lifespanSeconds IS NULL THEN NULL ELSE :created + :lifespanSeconds END,
		:lifespanSeconds,
		CASE WHEN :refreshLifespanSeconds IS NULL THEN NULL ELSE :created + :refreshLifespanSeconds END,
		:refreshLifespanSeconds
	FROM profile p INNER JOIN authentication a USING (identifier_id)
		WHERE p.profile = :profile AND a.identifier = :identifier
ON CONFLICT (code_id) DO UPDATE
	SET is_revoked = true
RETURNING is_revoked
