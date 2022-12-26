--
INSERT INTO resource
	(resource_id, secret, description)
VALUES	(:resourceId, :secret, :description)
ON CONFLICT (resource_id) DO UPDATE
SET
	secret = COALESCE(EXCLUDED.secret, resource.secret),
	description = COALESCE(EXCLUDED.description, resource.description)
RETURNING *
