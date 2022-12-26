-- Insert an externally-provided scope, or ignore.
INSERT INTO scope
	(scope)
SELECT
	unnest(${scopes})
ON CONFLICT (scope) DO NOTHING
