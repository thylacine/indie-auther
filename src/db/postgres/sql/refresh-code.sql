--
UPDATE token SET
	expires = $(refreshed)::timestamptz + duration,
	refreshed = $(refreshed)::timestamptz,
	refresh_expires = $(refreshed)::timestamptz + refresh_duration,
	refresh_count = refresh_count + 1
WHERE
	code_id = $(codeId)
AND
	NOT is_revoked
AND
	(refresh_expires IS NOT NULL AND refresh_expires > $(refreshed)::timestamptz)
RETURNING
	expires,
	refresh_expires,
	ARRAY(
		SELECT s.scope FROM token_scope ts INNER JOIN scope s USING (scope_id)
		WHERE ts.code_id = code_id
	) AS scopes
