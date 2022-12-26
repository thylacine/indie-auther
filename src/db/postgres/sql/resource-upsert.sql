--
INSERT INTO resource
	(resource_id, secret, description)
VALUES
	(COALESCE($(resourceId)::UUID, uuid_generate_v4()), $(secret), $(description))
ON CONFLICT (resource_id) DO UPDATE
SET
	secret = COALESCE(EXCLUDED.secret, resource.secret),
	description = COALESCE(EXCLUDED.description, resource.description)
RETURNING *
