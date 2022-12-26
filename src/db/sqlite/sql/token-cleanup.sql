-- Remove tokens no longer in use.
WITH
-- reduce verbosity of using epoch timestamps
times AS (
	SELECT
		(strftime('%s', 'now') - :codeLifespanSeconds) AS code_valid_offset,
		strftime('%s', 'now') AS now
),
-- only clean after code has expired
cleanable_codes AS (
	SELECT t.code_id, t.is_token, t.is_revoked, t.expires, t.refresh_expires FROM token t, times
		WHERE t.created < times.code_valid_offset
)
DELETE FROM token WHERE code_id IN (
	SELECT code_id FROM cleanable_codes c, times
	WHERE
		NOT c.is_token -- profile-only redemption
	OR (
		c.is_token AND (
			c.is_revoked -- revoked
			OR (
				c.expires < times.now AND (
					-- expired and unrefreshable
					refresh_expires IS NULL
					OR
					-- expired and refresh expired
					(refresh_expires IS NOT NULL AND refresh_expires < times.now)
				)
			)
		)
	)
)