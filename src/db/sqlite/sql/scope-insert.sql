-- Insert an externally-provided scope, or ignore.
INSERT INTO scope
	(scope)
VALUES (:scope)
ON CONFLICT (scope) DO NOTHING
