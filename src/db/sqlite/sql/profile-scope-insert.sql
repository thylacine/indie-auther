--
INSERT INTO profile_scope (profile_id, scope_id)
	SELECT p.profile_id, s.scope_id FROM profile p, scope s
	WHERE p.profile = :profile AND s.scope = :scope
ON CONFLICT (profile_id, scope_id) DO NOTHING
