--
DELETE FROM token_scope
WHERE (code_id, scope_id) IN (
	SELECT code_id, scope_id FROM token_scope ts
		INNER JOIN scope s USING (scope_id)
		WHERE scope = ANY($(removeScopes)) AND code_id = $(codeId)
)
