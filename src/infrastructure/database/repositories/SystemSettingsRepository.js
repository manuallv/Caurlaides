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
};

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

    return {
      forgot_password: templateMap.forgot_password || {
        template_key: 'forgot_password',
        ...DEFAULT_EMAIL_TEMPLATES.forgot_password,
      },
      portal_invite: templateMap.portal_invite || {
        template_key: 'portal_invite',
        ...DEFAULT_EMAIL_TEMPLATES.portal_invite,
      },
    };
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

module.exports = { SystemSettingsRepository, DEFAULT_EMAIL_TEMPLATES };
