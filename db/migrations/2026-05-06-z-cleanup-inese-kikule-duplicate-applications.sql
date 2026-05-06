CREATE TEMPORARY TABLE tmp_duplicate_inese_kikule_applications AS
SELECT rpa.id
FROM request_profile_applications rpa
INNER JOIN (
  SELECT
    event_id,
    REPLACE(REPLACE(LOWER(TRIM(COALESCE(profile_name, ''))), 'ķ', 'k'), 'ī', 'i') AS profile_name_key,
    LOWER(TRIM(contact_email)) AS contact_email_key,
    MIN(id) AS keep_id,
    COUNT(*) AS duplicate_count
  FROM request_profile_applications
  WHERE event_id = 4
    AND status = 'pending'
    AND (
      REPLACE(REPLACE(LOWER(TRIM(COALESCE(profile_name, ''))), 'ķ', 'k'), 'ī', 'i') IN (
        'inese kikule',
        'ineses kikule',
        'inses kikule'
      )
      OR REPLACE(REPLACE(LOWER(TRIM(COALESCE(profile_name, ''))), 'ķ', 'k'), 'ī', 'i') LIKE 'ines%kikul%'
    )
  GROUP BY
    event_id,
    REPLACE(REPLACE(LOWER(TRIM(COALESCE(profile_name, ''))), 'ķ', 'k'), 'ī', 'i'),
    LOWER(TRIM(contact_email))
  HAVING COUNT(*) > 1
) duplicate_group
  ON duplicate_group.event_id = rpa.event_id
  AND duplicate_group.profile_name_key = REPLACE(REPLACE(LOWER(TRIM(COALESCE(rpa.profile_name, ''))), 'ķ', 'k'), 'ī', 'i')
  AND duplicate_group.contact_email_key = LOWER(TRIM(rpa.contact_email))
  AND duplicate_group.keep_id <> rpa.id
WHERE rpa.event_id = 4
  AND rpa.status = 'pending';

DELETE FROM request_profile_applications
WHERE id IN (
  SELECT id FROM tmp_duplicate_inese_kikule_applications
);

DROP TEMPORARY TABLE tmp_duplicate_inese_kikule_applications;
