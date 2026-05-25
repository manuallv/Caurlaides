const crypto = require('crypto');
const { AppError } = require('../../shared/errors/AppError');
const { hashPassword } = require('../../infrastructure/security/password');
const { env } = require('../../config/env');

const BACKUP_SENSITIVE_FIELDS = new Set([
  'access_code_hash',
]);

const BACKUP_SOURCE_OPTIONS = [
  'request_profiles',
  'request_profile_pass_categories',
  'request_profile_wristband_categories',
  'request_profile_applications',
  'pass_requests',
  'wristband_requests',
];

function formatBackupValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function humanizeBackupField(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildBackupTitle(backup) {
  const snapshot = backup.snapshot || {};

  return (
    snapshot.full_name ||
    snapshot.profile_name ||
    snapshot.name ||
    snapshot.contact_email ||
    snapshot.email ||
    snapshot.vehicle_plate ||
    snapshot.access_code ||
    `${backup.source_table} #${backup.source_key}`
  );
}

function decorateBackup(backup) {
  const snapshot = backup.snapshot || {};
  const details = Object.entries(snapshot)
    .filter(([key]) => !BACKUP_SENSITIVE_FIELDS.has(key))
    .map(([key, value]) => ({
      key,
      label: humanizeBackupField(key),
      value: formatBackupValue(value),
    }));

  return {
    ...backup,
    title: buildBackupTitle(backup),
    details,
  };
}

class SystemService {
  constructor({
    userRepository,
    eventRepository,
    requestProfileRepository,
    requestRepository,
    requestDataBackupRepository,
    systemSettingsRepository,
    passwordResetTokenRepository,
    emailService,
  }) {
    this.userRepository = userRepository;
    this.eventRepository = eventRepository;
    this.requestProfileRepository = requestProfileRepository;
    this.requestRepository = requestRepository;
    this.requestDataBackupRepository = requestDataBackupRepository;
    this.systemSettingsRepository = systemSettingsRepository;
    this.passwordResetTokenRepository = passwordResetTokenRepository;
    this.emailService = emailService;
  }

  isSuperAdmin(user) {
    return Boolean(user && String(user.email || '').trim().toLowerCase() === env.superAdminEmail);
  }

  assertSuperAdmin(user, t) {
    if (!this.isSuperAdmin(user)) {
      throw new AppError(t('service.auth.superAdminOnly'), 403);
    }
  }

  async listUsers(actor, t) {
    this.assertSuperAdmin(actor, t);
    return this.userRepository.listAllWithStats();
  }

  async getUser(userId, actor, t) {
    this.assertSuperAdmin(actor, t);
    if (!userId) {
      return null;
    }

    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError(t('service.system.userNotFound'), 404);
    }

    return user;
  }

  async saveUser({ userId, fullName, email, phone, password, isActive }, actor, t) {
    this.assertSuperAdmin(actor, t);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const existingByEmail = await this.userRepository.findByEmail(normalizedEmail);

    if (existingByEmail && Number(existingByEmail.id) !== Number(userId || 0)) {
      throw new AppError(t('service.auth.userExists'), 409);
    }

    if (!userId) {
      if (!password || password.length < 8) {
        throw new AppError(t('validation.auth.passwordLength', { min: 8 }), 422);
      }

      const passwordHash = await hashPassword(password);
      return this.userRepository.create({
        fullName,
        email: normalizedEmail,
        phone: phone || null,
        passwordHash,
        isActive: isActive ? 1 : 0,
      });
    }

    await this.userRepository.updateByAdmin(userId, {
      fullName,
      email: normalizedEmail,
      phone: phone || null,
      isActive: isActive ? 1 : 0,
    });

    if (password) {
      const passwordHash = await hashPassword(password);
      await this.userRepository.updatePassword(userId, passwordHash);
    }

    return Number(userId);
  }

  async deleteUser(userId, actor, t) {
    this.assertSuperAdmin(actor, t);

    if (Number(actor.id) === Number(userId)) {
      throw new AppError(t('service.system.cannotDeleteSelf'), 422);
    }

    await this.userRepository.softDelete(userId, actor.id);
  }

  async getSystemSettings(actor, t) {
    this.assertSuperAdmin(actor, t);
    const settings = await this.systemSettingsRepository.getSettings();
    const templates = await this.systemSettingsRepository.listEmailTemplates();

    return {
      settings,
      templates,
    };
  }

  getBackupSourceOptions(actor, t) {
    this.assertSuperAdmin(actor, t);
    return BACKUP_SOURCE_OPTIONS;
  }

  async listRequestDataBackups(filters, actor, t) {
    this.assertSuperAdmin(actor, t);
    const backups = await this.requestDataBackupRepository.list({
      sourceTable: filters.sourceTable,
      eventId: filters.eventId,
      query: String(filters.query || '').trim(),
      limit: 200,
    });

    return backups.map(decorateBackup);
  }

  async restoreRequestDataBackup(backupId, actor, t) {
    this.assertSuperAdmin(actor, t);
    const backup = await this.requestDataBackupRepository.restore(backupId);

    if (!backup) {
      throw new AppError(t('system.backups.notFound'), 404);
    }

    return decorateBackup(backup);
  }

  async saveEmailSettings(payload, actor, t) {
    this.assertSuperAdmin(actor, t);

    await this.systemSettingsRepository.upsertSettings({
      email_provider: payload.emailProvider || 'smtp',
      smtp_host: payload.smtpHost || '',
      smtp_port: payload.smtpPort || '',
      smtp_secure: payload.smtpSecure ? 'true' : 'false',
      smtp_user: payload.smtpUser || '',
      smtp_pass: payload.smtpPass || '',
      smtp_from_email: payload.smtpFromEmail || '',
      smtp_from_name: payload.smtpFromName || '',
      resend_api_key: payload.resendApiKey || '',
      resend_from_email: payload.resendFromEmail || '',
      resend_from_name: payload.resendFromName || '',
    }, actor.id);
  }

  async saveEmailTemplates(payload, actor, t) {
    this.assertSuperAdmin(actor, t);

    await this.saveEmailTemplate('forgot_password', {
      subject: payload.forgotPasswordSubject,
      htmlContent: payload.forgotPasswordHtml,
      textContent: payload.forgotPasswordText,
    }, actor, t);

    await this.saveEmailTemplate('portal_invite', {
      subject: payload.portalInviteSubject,
      htmlContent: payload.portalInviteHtml,
      textContent: payload.portalInviteText,
    }, actor, t);
  }

  async saveEmailTemplate(templateKey, payload, actor, t) {
    this.assertSuperAdmin(actor, t);
    const templates = await this.systemSettingsRepository.listEmailTemplates();

    if (!templates[templateKey]) {
      throw new AppError(t('system.settings.error.templateNotFound'), 404);
    }

    if (!String(payload.subject || '').trim() || !String(payload.htmlContent || '').trim()) {
      throw new AppError(t('system.settings.error.templateRequired'), 422);
    }

    await this.systemSettingsRepository.upsertTemplate(templateKey, {
      subject: String(payload.subject || '').trim(),
      html_content: payload.htmlContent,
      text_content: payload.textContent || null,
    }, actor.id);
  }

  async sendTestEmail({ recipientEmail }, actor, t) {
    this.assertSuperAdmin(actor, t);

    if (!recipientEmail) {
      throw new AppError(t('validation.auth.email'), 422);
    }

    const config = await this.emailService.getConfig();

    if (config.provider === 'resend' && (!config.resend.apiKey || !config.resend.fromEmail)) {
      throw new AppError(t('system.settings.error.resendIncomplete'), 422);
    }

    if (config.provider !== 'resend' && (!config.smtp.host || !config.smtp.fromEmail)) {
      throw new AppError(t('system.settings.error.smtpIncomplete'), 422);
    }

    return this.emailService.sendTestMessage({
      to: recipientEmail,
      actorName: actor.full_name,
    });
  }

  createResetToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  createTokenHash(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  async sendForgotPassword(email, t) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      return;
    }

    const token = this.createResetToken();
    const tokenHash = this.createTokenHash(token);
    const expiresAt = new Date(Date.now() + (1000 * 60 * 60 * 2));

    await this.passwordResetTokenRepository.invalidateForUser(user.id);
    await this.passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await this.emailService.sendTemplate('forgot_password', {
      to: user.email,
      variables: {
        appName: 'Caurlaides',
        userName: user.full_name,
        resetUrl: `${env.appUrl.replace(/\/$/, '')}/reset-password/${token}`,
      },
    });
  }

  async resetPassword(token, password, t) {
    if (!password || password.length < 8) {
      throw new AppError(t('validation.auth.passwordLength', { min: 8 }), 422);
    }

    const tokenHash = this.createTokenHash(token);
    const resetToken = await this.passwordResetTokenRepository.findActiveByTokenHash(tokenHash);

    if (!resetToken) {
      throw new AppError(t('service.auth.resetTokenInvalid'), 404);
    }

    const passwordHash = await hashPassword(password);
    await this.userRepository.updatePassword(resetToken.user_id, passwordHash);
    await this.passwordResetTokenRepository.markUsed(resetToken.id);
  }

  async sendProfileInvite({ to, eventName, profileName, accessCode, inviteUrl, wristbandSummary, passSummary }) {
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    return this.emailService.sendTemplate('portal_invite', {
      to,
      requireDelivery: true,
      variables: {
        eventName,
        profileName,
        accessCode,
        inviteUrl,
        wristbandSummary,
        passSummary,
      },
    });
  }

  async sendEventMemberNotification({
    to,
    recipientName,
    eventName,
    roleLabel,
    invitedByName,
    eventUrl,
  }) {
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    return this.emailService.sendTemplate('event_member_added', {
      to,
      variables: {
        recipientName,
        eventName,
        roleLabel,
        invitedByName,
        eventUrl,
      },
    });
  }

  async sendProfileApplicationNotification({
    to,
    recipientName,
    eventName,
    applicationId,
    profileName,
    contactEmail,
    contactPhone,
    passSummary,
    wristbandSummary,
    notes,
    submittedAt,
    applicationsUrl,
  }) {
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    return this.emailService.sendTemplate('profile_application_notification', {
      to,
      requireDelivery: true,
      variables: {
        recipientName,
        eventName,
        applicationId,
        profileName,
        contactEmail,
        contactPhone,
        passSummary,
        wristbandSummary,
        notes,
        submittedAt,
        applicationsUrl,
      },
    });
  }

  async sendProfileApplicationRejected({
    to,
    eventName,
    profileName,
    contactEmail,
    contactPhone,
    rejectionReason,
  }) {
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    return this.emailService.sendTemplate('profile_application_rejected', {
      to,
      requireDelivery: true,
      variables: {
        eventName,
        profileName,
        contactEmail,
        contactPhone,
        rejectionReason,
      },
    });
  }
}

module.exports = { SystemService };
