const DEFAULT_EMAIL_TEMPLATES = {
  forgot_password: {
    subject: 'Password reset instructions',
    html_content: `
      <p>Hello {{userName}},</p>
      <p>You asked to reset your password for {{appName}}.</p>
      <p><a href="{{resetUrl}}">Click here to set a new password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
    text_content: 'Hello {{userName}},\n\nReset your password here: {{resetUrl}}\n\nIf you did not request this, ignore this email.',
  },
  portal_invite: {
    subject: 'Your event portal access',
    html_content: `
      <p>Hello,</p>
      <p>You have been granted access to {{eventName}}.</p>
      <p>Profile: <strong>{{profileName}}</strong></p>
      <p>Access code: <strong>{{accessCode}}</strong></p>
      <p>Direct link: <a href="{{inviteUrl}}">{{inviteUrl}}</a></p>
      <p>Wristband quota: {{wristbandSummary}}</p>
      <p>Pass quota: {{passSummary}}</p>
    `,
    text_content: 'You have been granted access to {{eventName}}.\nProfile: {{profileName}}\nCode: {{accessCode}}\nLink: {{inviteUrl}}\nWristbands: {{wristbandSummary}}\nPasses: {{passSummary}}',
  },
  test_email: {
    subject: 'Caurlaides test email',
    html_content: `
      <p>Hello,</p>
      <p>This is a test email from {{appName}}.</p>
      <p>Sent by: <strong>{{actorName}}</strong></p>
      <p>If you received this, your current provider settings are working.</p>
    `,
    text_content: 'Hello,\n\nThis is a test email from {{appName}}.\nSent by: {{actorName}}\n\nIf you received this, your current provider settings are working.',
  },
};

const EMAIL_TEMPLATE_DEFINITIONS = [
  {
    key: 'forgot_password',
    titleKey: 'system.settings.template.forgotPassword.title',
    descriptionKey: 'system.settings.template.forgotPassword.description',
    variables: ['{{appName}}', '{{userName}}', '{{resetUrl}}'],
  },
  {
    key: 'portal_invite',
    titleKey: 'system.settings.template.portalInvite.title',
    descriptionKey: 'system.settings.template.portalInvite.description',
    variables: ['{{eventName}}', '{{profileName}}', '{{accessCode}}', '{{inviteUrl}}', '{{wristbandSummary}}', '{{passSummary}}'],
  },
  {
    key: 'test_email',
    titleKey: 'system.settings.template.testEmail.title',
    descriptionKey: 'system.settings.template.testEmail.description',
    variables: ['{{appName}}', '{{actorName}}'],
  },
];

class SystemSettingsRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getSettings() {
    const [rows] = await this.pool.execute(
      `
        SELECT setting_key, setting_value
        FROM system_settings
      `,
    );

    return rows.reduce((accumulator, row) => {
      accumulator[row.setting_key] = row.setting_value;
      return accumulator;
    }, {});
  }

  async upsertSettings(settings, userId) {
    const entries = Object.entries(settings || {});

    if (!entries.length) {
      return;
    }

    const placeholders = entries.map(() => '(?, ?, ?)').join(', ');
    const values = entries.flatMap(([key, value]) => [key, value, userId || null]);

    await this.pool.execute(
      `
        INSERT INTO system_settings (setting_key, setting_value, updated_by_user_id)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          setting_value = VALUES(setting_value),
          updated_by_user_id = VALUES(updated_by_user_id)
      `,
      values,
    );
  }

  async listEmailTemplates() {
    const [rows] = await this.pool.execute(
      `
        SELECT template_key, subject, html_content, text_content, updated_at
        FROM email_templates
      `,
    );

    const templateMap = rows.reduce((accumulator, row) => {
      accumulator[row.template_key] = row;
      return accumulator;
    }, {});

    return EMAIL_TEMPLATE_DEFINITIONS.reduce((accumulator, definition) => {
      accumulator[definition.key] = {
        template_key: definition.key,
        definition,
        ...(DEFAULT_EMAIL_TEMPLATES[definition.key] || {}),
        ...(templateMap[definition.key] || {}),
      };

      return accumulator;
    }, {});
  }

  async getEmailTemplate(templateKey) {
    const templates = await this.listEmailTemplates();
    return templates[templateKey] || null;
  }

  async upsertTemplate(templateKey, payload, userId) {
    await this.pool.execute(
      `
        INSERT INTO email_templates (template_key, subject, html_content, text_content, updated_by_user_id)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          subject = VALUES(subject),
          html_content = VALUES(html_content),
          text_content = VALUES(text_content),
          updated_by_user_id = VALUES(updated_by_user_id)
      `,
      [
        templateKey,
        payload.subject,
        payload.html_content,
        payload.text_content || null,
        userId || null,
      ],
    );
  }
}

module.exports = { SystemSettingsRepository, DEFAULT_EMAIL_TEMPLATES, EMAIL_TEMPLATE_DEFINITIONS };
