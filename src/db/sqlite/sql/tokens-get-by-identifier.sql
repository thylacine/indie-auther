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
	t.profile_data,
	a.identifier
FROM token t
	INNER JOIN profile p USING (profile_id)
	INNER JOIN authentication a USING (identifier_id)
WHERE a.identifier = :identifier
ORDER BY max(t.created, COALESCE(t.refreshed, 0)) DESC
