-- return whether a scope is currently in use, either a profile setting or on a token
SELECT EXISTS (
	SELECT 1 FROM scope s
		INNER JOIN profile_scope ps USING (scope_id)
		WHERE s.scope = :scope
	UNION All
	SELECT 1 FROM scope s
		INNER JOIN token_scope ts USING (scope_id)
		WHERE s.scope = :scope
	UNION All
	SELECT 1 FROM scope s
		WHERE s.scope = :scope AND s.is_permanent
) AS in_use
