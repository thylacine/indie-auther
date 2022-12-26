--
INSERT INTO almanac
	(event, epoch)
VALUES
	(:event, :epoch)
ON CONFLICT (event) DO UPDATE
SET
	epoch = :epoch

