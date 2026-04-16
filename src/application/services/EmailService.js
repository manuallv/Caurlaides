const nodemailer = require('nodemailer');
const { env } = require('../../config/env');

function interpolateTemplate(content = '', variables = {}) {
  return String(content).replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return String(variables[key] ?? '');
    }

    return '';
  });
}

class EmailService {
  constructor(systemSettingsRepository) {
    this.systemSettingsRepository = systemSettingsRepository;
  }

  buildSmtpTransport(config) {
    return nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? {
        user: config.smtp.user,
        pass: config.smtp.pass,
      } : undefined,
    });
  }

  formatFromAddress(name, email) {
    return name ? `${name} <${email}>` : email;
  }

  async sendResendEmail(config, { to, subject, html, text }) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.formatFromAddress(config.resend.fromName, config.resend.fromEmail),
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`Resend error: ${payload}`);
    }

    return { sent: true, provider: 'resend' };
  }

  async getConfig() {
    const settings = await this.systemSettingsRepository.getSettings();

    return {
      provider: settings.email_provider || 'smtp',
      smtp: {
        host: settings.smtp_host || '',
        port: Number(settings.smtp_port || 587),
        secure: settings.smtp_secure === 'true',
        user: settings.smtp_user || '',
        pass: settings.smtp_pass || '',
        fromEmail: settings.smtp_from_email || '',
        fromName: settings.smtp_from_name || env.appUrl,
      },
      resend: {
        apiKey: settings.resend_api_key || '',
        fromEmail: settings.resend_from_email || '',
        fromName: settings.resend_from_name || env.appUrl,
      },
    };
  }

  async sendTemplate(templateKey, { to, variables }) {
    if (!to) {
      return { skipped: true };
    }

    const config = await this.getConfig();
    const template = await this.systemSettingsRepository.getEmailTemplate(templateKey);

    if (!template) {
      return { skipped: true };
    }

    const subject = interpolateTemplate(template.subject, variables);
    const html = interpolateTemplate(template.html_content, variables);
    const text = interpolateTemplate(template.text_content || '', variables);

    if (config.provider === 'resend' && config.resend.apiKey && config.resend.fromEmail) {
      return this.sendResendEmail(config, {
        to,
        subject,
        html,
        text,
      });
    }

    if (!config.smtp.host || !config.smtp.fromEmail) {
      return { skipped: true };
    }

    const transporter = this.buildSmtpTransport(config);

    await transporter.sendMail({
      from: this.formatFromAddress(config.smtp.fromName, config.smtp.fromEmail),
      to,
      subject,
      html,
      text,
    });

    return { sent: true, provider: 'smtp' };
  }

  async sendTestMessage({ to, actorName }) {
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    const config = await this.getConfig();
    const subject = 'Caurlaides test email';
    const html = `
      <p>Hello,</p>
      <p>This is a test email from Caurlaides.</p>
      <p>Sent by: <strong>${actorName || 'System admin'}</strong></p>
      <p>If you received this, your current provider settings are working.</p>
    `;
    const text = `Hello,\n\nThis is a test email from Caurlaides.\nSent by: ${actorName || 'System admin'}\n\nIf you received this, your current provider settings are working.`;

    if (config.provider === 'resend') {
      if (!config.resend.apiKey || !config.resend.fromEmail) {
        throw new Error('Resend is not fully configured.');
      }

      return this.sendResendEmail(config, { to, subject, html, text });
    }

    if (!config.smtp.host || !config.smtp.fromEmail) {
      throw new Error('SMTP is not fully configured.');
    }

    const transporter = this.buildSmtpTransport(config);
    await transporter.verify();
    await transporter.sendMail({
      from: this.formatFromAddress(config.smtp.fromName, config.smtp.fromEmail),
      to,
      subject,
      html,
      text,
    });

    return { sent: true, provider: 'smtp' };
  }
}

module.exports = { EmailService, interpolateTemplate };
