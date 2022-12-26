--
INSERT INTO scope (
	scope,
	description,
	application,
	is_manually_added
) VALUES (
	:scope,
	CASE WHEN :application IS NULL THEN '' ELSE :application END,
	CASE WHEN :description IS NULL THEN '' ELSE :description END,
	COALESCE(:manuallyAdded, false)
) ON CONFLICT (scope) DO UPDATE
SET
	application = COALESCE(:application, EXCLUDED.application),
	description = COALESCE(:description, EXCLUDED.description),
	is_manually_added = EXCLUDED.is_manually_added OR COALESCE(:manuallyAdded, false)
