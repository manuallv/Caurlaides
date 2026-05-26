ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS locale VARCHAR(8) NOT NULL DEFAULT 'lv' AFTER template_key;

UPDATE email_templates
SET locale = 'lv'
WHERE locale IS NULL OR locale = '';

ALTER TABLE email_templates
  MODIFY locale VARCHAR(8) NOT NULL DEFAULT 'lv';

ALTER TABLE email_templates
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (template_key, locale);
