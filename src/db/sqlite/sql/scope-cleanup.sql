-- Remove any un-used, non-permanent, non-manually-created scopes.
DELETE FROM scope WHERE scope_id NOT IN (
	SELECT scope_id FROM scope s
		INNER JOIN profile_scope ps USING (scope_id)
	UNION ALL
	SELECT scope_id FROM scope s
		INNER JOIN token_scope ts USING (scope_id)
) AND NOT (is_permanent OR is_manually_added)
