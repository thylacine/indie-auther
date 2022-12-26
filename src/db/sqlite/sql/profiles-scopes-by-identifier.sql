--
SELECT p.profile, s.*
	FROM profile p
		INNER JOIN authentication a USING (identifier_id)
		FULL JOIN profile_scope ps USING (profile_id)
		FULL JOIN scope s USING (scope_id)
	WHERE a.identifier = :identifier
UNION ALL SELECT NULL AS profile, *
	FROM scope
	WHERE is_manually_added OR is_permanent
