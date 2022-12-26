--
SELECT date
FROM almanac
WHERE event = $(event)
FOR UPDATE

