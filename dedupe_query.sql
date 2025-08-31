INSERT INTO `trillboard-new.lead_pipeline.leads_unique` (
  email, email_hash, business_name, phone, website, address, city, state, postal_code, country,
  category, rating, review_count, place_id, google_maps_url, latitude, longitude, opening_hours,
  source, first_seen, last_seen, update_count, apify_run_ids, raw_data
)
SELECT
  LOWER(t.email) AS email,
  TO_HEX(SHA256(LOWER(t.email))) AS email_hash,
  t.business_name, t.phone, t.website, t.address, t.city, t.state, t.postal_code, t.country,
  t.category, t.rating, t.review_count, t.place_id, t.google_maps_url, t.latitude, t.longitude,
  t.opening_hours, t.source, t.scraped_at, t.scraped_at, 1, t.apify_run_id, t.raw_data
FROM `trillboard-new.lead_pipeline.leads_scraped` t
LEFT JOIN `trillboard-new.lead_pipeline.leads_unique` u
  ON u.email_hash = TO_HEX(SHA256(LOWER(t.email)))
WHERE u.email_hash IS NULL
  AND t.email IS NOT NULL
  AND TRIM(t.email) != '';