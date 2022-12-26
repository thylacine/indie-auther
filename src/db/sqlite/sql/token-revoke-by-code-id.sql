--
UPDATE token SET
	is_revoked = true,
	refresh_expires = NULL
WHERE code_id = :codeId
