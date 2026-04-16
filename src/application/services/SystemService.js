const crypto = require('crypto');
const { AppError } = require('../../shared/errors/AppError');
const { hashPassword } = require('../../infrastructure/security/password');
const { env } = require('../../config/env');

class SystemService {
  constructor({
    userRepository,
    eventRepository,
    requestProfileRepository,
    requestRepository,
    systemSettingsRepository,
    passwordResetTokenRepository,
    emailService,
  }) {
    this.userRepository = userRepository;
    this.eventRepository = eventRepository;
    this.requestProfileRepository = requestProfileRepository;
    this.requestRepository = requestRepository;
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

    await this.systemSettingsRepository.upsertTemplate('forgot_password', {
      subject: payload.forgotPasswordSubject,
      html_content: payload.forgotPasswordHtml,
      text_content: payload.forgotPasswordText,
    }, actor.id);

    await this.systemSettingsRepository.upsertTemplate('portal_invite', {
      subject: payload.portalInviteSubject,
      html_content: payload.portalInviteHtml,
      text_content: payload.portalInviteText,
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
      return;
    }

    await this.emailService.sendTemplate('portal_invite', {
      to,
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
}

module.exports = { SystemService };
