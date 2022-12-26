--
SELECT 
	t.code_id,
	p.profile,
	t.created,
	t.expires,
	t.refresh_expires,
	t.refreshed,
	t.duration,
	t.refresh_duration,
	t.refresh_count,
	t.is_revoked,
	t.is_token,
	t.client_id,
	t.resource,
	t.profile_data,
	a.identifier,
	ARRAY(
		SELECT s.scope FROM token_scope ts INNER JOIN scope s USING (scope_id)
		WHERE ts.code_id = t.code_id
	) AS scopes
FROM token t
	INNER JOIN profile p USING (profile_id)
	INNER JOIN authentication a USING (identifier_id)
	WHERE a.identifier = $(identifier)
	ORDER BY GREATEST(t.created, t.refreshed) DESC
