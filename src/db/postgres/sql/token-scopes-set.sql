--
INSERT INTO token_scope (code_id, scope_id)
	SELECT $(codeId), scope_id FROM scope WHERE scope = ANY ($(scopes))

