--
INSERT INTO almanac
	(event, date)
VALUES
	($(event), $(date))
ON CONFLICT (event) DO UPDATE
SET
	date = $(date)

