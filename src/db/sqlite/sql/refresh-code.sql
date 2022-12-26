-- 
UPDATE token set
	refreshed = :refreshed,
	expires = :refreshed + duration,
	refresh_expires = :refreshed + refresh_duration,
	refresh_count = refresh_count + 1
WHERE
	code_id = :codeId
AND
	NOT is_revoked
AND
	(refresh_expires IS NOT NULL AND refresh_expires > :refreshed)
RETURNING
	expires,
	refresh_expires
