ALTER TABLE events
  ADD COLUMN IF NOT EXISTS pass_print_template_orientation VARCHAR(20) NOT NULL DEFAULT 'portrait'
  AFTER pass_print_template_background_rotation;
