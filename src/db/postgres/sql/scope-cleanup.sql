-- Remove any un-used, non-permament, non-manually-created scopes.
DELETE FROM scope WHERE scope_id NOT IN (
	SELECT scope_id FROM scope s
		INNER JOIN profile_scope ps USING (scope_id)
	UNION All
	SELECT scope_id FROM scope s
		INNER JOIN token_scope ts USING (scope_id)
) AND NOT (is_permanent OR is_manually_added)
