--
DELETE FROM token_scope
WHERE code_id = :codeId AND scope_id = (SELECT scope_id FROM scope WHERE scope = :scope)
