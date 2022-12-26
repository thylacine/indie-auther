--
DELETE FROM profile_scope
WHERE profile_id IN(
	SELECT profile_id FROM profile WHERE profile = :profile
)
