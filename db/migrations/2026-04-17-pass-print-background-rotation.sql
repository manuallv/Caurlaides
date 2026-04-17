ALTER TABLE events
  ADD COLUMN IF NOT EXISTS pass_print_template_background_rotation SMALLINT NOT NULL DEFAULT 0
  AFTER pass_print_template_background_path;
