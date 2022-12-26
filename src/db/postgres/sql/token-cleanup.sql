-- Remove tokens no longer in use.
-- only clean after code has expired
WITH
cleanable_codes AS (
	SELECT t.code_id, t.is_token, t.is_revoked, t.expires, t.refresh_expires FROM token t
		WHERE t.created < (now() - $(codeLifespanSeconds)::text::interval)
)
DELETE FROM token WHERE code_id IN (
	SELECT code_id FROM cleanable_codes
	WHERE
		NOT is_token -- profile-only redemptions
	OR (
		is_token AND (
			is_revoked -- revoked
			OR (
				expires < now() AND (
					-- expired and unrefreshable
					refresh_expires IS NULL
					OR
					-- expired and refresh expired
					(refresh_expires IS NOT NULL AND refresh_expires < now())
				)
			)
		)
	)
)
