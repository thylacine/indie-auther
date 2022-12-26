-- Revoke the refresh-token for a token
UPDATE token SET
	refresh_expires = NULL,
	refresh_duration = NULL
WHERE code_id = $(codeId)
