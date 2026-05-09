INSERT INTO request_profile_pass_categories (request_profile_id, pass_category_id, quota)
SELECT
  rp.id,
  pr.pass_category_id,
  GREATEST(COUNT(pr.id), 1) AS quota
FROM request_profiles rp
INNER JOIN pass_requests pr
  ON pr.request_profile_id = rp.id
INNER JOIN pass_categories pc
  ON pc.id = pr.pass_category_id
LEFT JOIN request_profile_pass_categories existing_quota
  ON existing_quota.request_profile_id = rp.id
 AND existing_quota.pass_category_id = pr.pass_category_id
WHERE rp.access_code = 'E6D30190'
  AND rp.deleted_at IS NULL
  AND pr.deleted_at IS NULL
  AND pc.deleted_at IS NULL
  AND existing_quota.request_profile_id IS NULL
GROUP BY rp.id, pr.pass_category_id;

INSERT INTO request_profile_wristband_categories (request_profile_id, wristband_category_id, quota)
SELECT
  rp.id,
  wr.wristband_category_id,
  GREATEST(COUNT(wr.id), 1) AS quota
FROM request_profiles rp
INNER JOIN wristband_requests wr
  ON wr.request_profile_id = rp.id
INNER JOIN wristband_categories wc
  ON wc.id = wr.wristband_category_id
LEFT JOIN request_profile_wristband_categories existing_quota
  ON existing_quota.request_profile_id = rp.id
 AND existing_quota.wristband_category_id = wr.wristband_category_id
WHERE rp.access_code = 'E6D30190'
  AND rp.deleted_at IS NULL
  AND wr.deleted_at IS NULL
  AND wc.deleted_at IS NULL
  AND existing_quota.request_profile_id IS NULL
GROUP BY rp.id, wr.wristband_category_id;
