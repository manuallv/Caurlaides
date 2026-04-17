ALTER TABLE events
  ADD COLUMN IF NOT EXISTS pass_print_template_name VARCHAR(160) NULL AFTER vehicle_gate_api_dedupe_seconds,
  ADD COLUMN IF NOT EXISTS pass_print_template_background_path VARCHAR(255) NULL AFTER pass_print_template_name,
  ADD COLUMN IF NOT EXISTS pass_print_template_fields_json LONGTEXT NULL AFTER pass_print_template_background_path,
  ADD COLUMN IF NOT EXISTS pass_print_template_updated_at DATETIME NULL AFTER pass_print_template_fields_json;
