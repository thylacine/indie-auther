--
INSERT INTO profile (profile, identifier_id)
	SELECT :profile, identifier_id FROM authentication WHERE identifier = :identifier

