--
SELECT s.scope FROM token_scope ts
	INNER JOIN scope s USING (scope_id)
	WHERE ts.code_id = :codeId
