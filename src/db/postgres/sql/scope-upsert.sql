--
-- N.B. weirdness with postgres empty string null equivalence and coalesce
INSERT INTO scope (
	scope, application, description, is_manually_added
) VALUES (
	$(scope),
	CASE WHEN $(application) IS NULL THEN '' ELSE $(application) END,
	CASE WHEN $(description) IS NULL THEN '' ELSE $(description) END,
	COALESCE($(manuallyAdded), false)
) ON CONFLICT (scope) DO UPDATE
SET
	application = CASE WHEN $(application) IS NULL THEN EXCLUDED.application ELSE $(application) END,
	description = CASE WHEN $(description) IS NULL THEN EXCLUDED.description ELSE $(description) END,
	is_manually_added = EXCLUDED.is_manually_added OR COALESCE($(manuallyAdded), false)
