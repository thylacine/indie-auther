-- remove an inpermanent scope
DELETE FROM scope
	WHERE scope = $(scope) AND is_permanent = false
