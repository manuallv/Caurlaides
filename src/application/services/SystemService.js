const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');
const archiver = require('archiver');
const { AppError } = require('../../shared/errors/AppError');
const { DEFAULT_LOCALE, normalizeLocale } = require('../../shared/i18n');
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

const PLATE_SCANNER_ROOT = 'plate-scanner';
const PLATE_SCANNER_SAMPLE_INDEX = 'samples.json';
const PLATE_SCANNER_MODEL_META = 'model-meta.json';
const PLATE_SCANNER_ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const PLATE_SCANNER_ALLOWED_MODEL_EXTENSIONS = new Set([
  '.json',
  '.bin',
  '.yaml',
  '.txt',
]);

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

function sanitizeUploadFileName(fileName) {
  return path.basename(String(fileName || 'file'))
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 140);
}

function normalizePlateText(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeBoxNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(1, Math.max(0, number));
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function removeFileQuietly(filePath) {
  try {
    await fsp.rm(filePath, { force: true, recursive: true });
  } catch (error) {
    // Cleanup failures should not block the user-facing operation.
  }
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

  async getSystemSettings(actor, t, options = {}) {
    this.assertSuperAdmin(actor, t);
    const templateLocale = normalizeLocale(options.templateLocale) || DEFAULT_LOCALE;
    const settings = await this.systemSettingsRepository.getSettings();
    const templates = await this.systemSettingsRepository.listEmailTemplates(templateLocale);

    return {
      settings,
      templates,
    };
  }

  getPlateScannerPaths() {
    const rootDir = path.join(env.uploadsDir, PLATE_SCANNER_ROOT);

    return {
      rootDir,
      samplesDir: path.join(rootDir, 'samples'),
      modelDir: path.join(rootDir, 'model'),
      tmpDir: path.join(rootDir, 'tmp'),
      sampleIndexPath: path.join(rootDir, PLATE_SCANNER_SAMPLE_INDEX),
      modelMetaPath: path.join(rootDir, 'model', PLATE_SCANNER_MODEL_META),
    };
  }

  async ensurePlateScannerDirectories() {
    const paths = this.getPlateScannerPaths();

    await Promise.all([
      fsp.mkdir(paths.rootDir, { recursive: true }),
      fsp.mkdir(paths.samplesDir, { recursive: true }),
      fsp.mkdir(paths.modelDir, { recursive: true }),
      fsp.mkdir(paths.tmpDir, { recursive: true }),
    ]);

    return paths;
  }

  async readPlateScannerSamples() {
    const paths = await this.ensurePlateScannerDirectories();

    try {
      const raw = await fsp.readFile(paths.sampleIndexPath, 'utf8');
      const parsed = JSON.parse(raw);

      return Array.isArray(parsed.samples) ? parsed.samples : [];
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async writePlateScannerSamples(samples) {
    const paths = await this.ensurePlateScannerDirectories();
    const payload = {
      updatedAt: new Date().toISOString(),
      samples,
    };

    await fsp.writeFile(paths.sampleIndexPath, JSON.stringify(payload, null, 2));
  }

  async getPlateScannerModelStatus() {
    const paths = await this.ensurePlateScannerDirectories();
    const modelJsonPath = path.join(paths.modelDir, 'model.json');
    const hasModel = await pathExists(modelJsonPath);

    if (!hasModel) {
      return {
        hasModel: false,
        url: '',
        fileCount: 0,
        totalBytes: 0,
        uploadedAt: null,
      };
    }

    let files = [];
    let meta = {};

    try {
      files = await fsp.readdir(paths.modelDir, { withFileTypes: true });
    } catch (error) {
      files = [];
    }

    try {
      meta = JSON.parse(await fsp.readFile(paths.modelMetaPath, 'utf8'));
    } catch (error) {
      meta = {};
    }

    const fileStats = await Promise.all(files
      .filter((file) => file.isFile())
      .map(async (file) => {
        const stat = await fsp.stat(path.join(paths.modelDir, file.name));
        return {
          name: file.name,
          size: stat.size,
        };
      }));

    return {
      hasModel: true,
      url: `/${['uploads', PLATE_SCANNER_ROOT, 'model', 'model.json'].join('/')}`,
      fileCount: fileStats.length,
      totalBytes: fileStats.reduce((sum, file) => sum + file.size, 0),
      uploadedAt: meta.uploadedAt || null,
      uploadedBy: meta.uploadedBy || '',
      license: meta.license || '',
      source: meta.source || '',
      modelJsonName: 'model.json',
    };
  }

  async getPlateScannerSettings(actor, t) {
    this.assertSuperAdmin(actor, t);
    const [samples, model] = await Promise.all([
      this.readPlateScannerSamples(),
      this.getPlateScannerModelStatus(),
    ]);

    return {
      model,
      sampleCount: samples.length,
      recentSamples: samples
        .slice()
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 24)
        .map((sample) => ({
          ...sample,
          imageUrl: `/${['uploads', PLATE_SCANNER_ROOT, 'samples', sample.fileName].join('/')}`,
        })),
    };
  }

  async savePlateScannerSample(payload, actor, t) {
    this.assertSuperAdmin(actor, t);

    if (!payload.file || !payload.file.buffer) {
      throw new AppError(t('system.settings.plateScanner.error.imageRequired'), 422);
    }

    if (!PLATE_SCANNER_ALLOWED_IMAGE_MIMES.has(payload.file.mimetype)) {
      throw new AppError(t('system.settings.plateScanner.error.imageType'), 422);
    }

    const plate = normalizePlateText(payload.plate);

    if (!plate || plate.length < 3) {
      throw new AppError(t('system.settings.plateScanner.error.plateRequired'), 422);
    }

    const box = {
      x: normalizeBoxNumber(payload.boxX),
      y: normalizeBoxNumber(payload.boxY),
      width: normalizeBoxNumber(payload.boxWidth),
      height: normalizeBoxNumber(payload.boxHeight),
    };

    if (
      box.x === null
      || box.y === null
      || box.width === null
      || box.height === null
      || box.width <= 0.01
      || box.height <= 0.01
    ) {
      throw new AppError(t('system.settings.plateScanner.error.boxRequired'), 422);
    }

    const paths = await this.ensurePlateScannerDirectories();
    const extension = path.extname(payload.file.originalname || '').toLowerCase()
      || (payload.file.mimetype === 'image/png' ? '.png' : payload.file.mimetype === 'image/webp' ? '.webp' : '.jpg');
    const id = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    const fileName = `${id}${extension}`;
    const targetPath = path.join(paths.samplesDir, fileName);

    await fsp.writeFile(targetPath, payload.file.buffer);

    const samples = await this.readPlateScannerSamples();
    samples.push({
      id,
      fileName,
      originalName: sanitizeUploadFileName(payload.file.originalname),
      plate,
      notes: String(payload.notes || '').trim(),
      box,
      createdAt: new Date().toISOString(),
      createdByUserId: actor.id,
      createdByName: actor.full_name,
    });
    await this.writePlateScannerSamples(samples);

    return id;
  }

  async exportPlateScannerTrainingDataset(outputStream, actor, t) {
    this.assertSuperAdmin(actor, t);
    const paths = await this.ensurePlateScannerDirectories();
    const samples = await this.readPlateScannerSamples();
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(outputStream);
    archive.append([
      'path: .',
      'train: images/train',
      'val: images/train',
      'names:',
      '  0: license_plate',
      '',
    ].join('\n'), { name: 'data.yaml' });
    archive.append([
      '# Caurlaides plate scanner dataset',
      '',
      'This archive is exported in YOLO format.',
      'Each label row has: class x_center y_center width height',
      '',
      'Typical training flow outside Hostinger:',
      '1. Train with Ultralytics/YOLO using data.yaml.',
      '2. Export the trained detector to TensorFlow.js graph model.',
      '3. Upload model.json and all .bin shards back in Caurlaides system settings.',
      '',
      'Example commands:',
      'pip install ultralytics tensorflowjs',
      'yolo detect train data=data.yaml model=yolov8n.pt imgsz=416 epochs=80',
      'yolo export model=runs/detect/train/weights/best.pt format=tfjs imgsz=416',
      '',
    ].join('\n'), { name: 'README.md' });

    for (const sample of samples) {
      const sourcePath = path.join(paths.samplesDir, sample.fileName);
      const exists = await pathExists(sourcePath);

      if (!exists) {
        continue;
      }

      const extension = path.extname(sample.fileName).toLowerCase() || '.jpg';
      const baseName = sample.id.replace(/[^a-zA-Z0-9_-]/g, '-');
      const xCenter = sample.box.x + (sample.box.width / 2);
      const yCenter = sample.box.y + (sample.box.height / 2);
      const label = [
        0,
        xCenter.toFixed(6),
        yCenter.toFixed(6),
        sample.box.width.toFixed(6),
        sample.box.height.toFixed(6),
      ].join(' ');

      archive.file(sourcePath, { name: `images/train/${baseName}${extension}` });
      archive.append(`${label}\n`, { name: `labels/train/${baseName}.txt` });
      archive.append(JSON.stringify({
        id: sample.id,
        plate: sample.plate,
        notes: sample.notes,
        createdAt: sample.createdAt,
      }, null, 2), { name: `metadata/${baseName}.json` });
    }

    await archive.finalize();
  }

  async installPlateScannerModel(files, payload, actor, t) {
    this.assertSuperAdmin(actor, t);

    if (!files || !files.length) {
      throw new AppError(t('system.settings.plateScanner.error.modelRequired'), 422);
    }

    const paths = await this.ensurePlateScannerDirectories();
    const modelJsonFile = files.find((file) => sanitizeUploadFileName(file.originalname) === 'model.json');

    if (!modelJsonFile) {
      throw new AppError(t('system.settings.plateScanner.error.modelJsonRequired'), 422);
    }

    const uploadedNames = new Set(files.map((file) => sanitizeUploadFileName(file.originalname)));
    let modelJson;

    try {
      modelJson = JSON.parse(await fsp.readFile(modelJsonFile.path, 'utf8'));
    } catch (error) {
      throw new AppError(t('system.settings.plateScanner.error.modelJsonInvalid'), 422);
    }

    const manifestPaths = (modelJson.weightsManifest || [])
      .flatMap((group) => group.paths || [])
      .map(sanitizeUploadFileName);
    const missingPaths = manifestPaths.filter((fileName) => !uploadedNames.has(fileName));

    if (missingPaths.length) {
      throw new AppError(t('system.settings.plateScanner.error.modelShardsMissing', {
        files: missingPaths.slice(0, 5).join(', '),
      }), 422);
    }

    const nextModelDir = path.join(paths.rootDir, `model-next-${Date.now()}`);
    await fsp.mkdir(nextModelDir, { recursive: true });

    try {
      for (const file of files) {
        const targetName = sanitizeUploadFileName(file.originalname);
        const extension = path.extname(targetName).toLowerCase();

        if (!PLATE_SCANNER_ALLOWED_MODEL_EXTENSIONS.has(extension)) {
          continue;
        }

        await fsp.rename(file.path, path.join(nextModelDir, targetName));
      }

      const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
      await fsp.writeFile(path.join(nextModelDir, PLATE_SCANNER_MODEL_META), JSON.stringify({
        uploadedAt: new Date().toISOString(),
        uploadedBy: actor.full_name,
        uploadedByUserId: actor.id,
        source: String(payload.source || '').trim(),
        license: String(payload.license || '').trim(),
        fileCount: files.length,
        totalBytes,
      }, null, 2));

      await fsp.rm(paths.modelDir, { recursive: true, force: true });
      await fsp.rename(nextModelDir, paths.modelDir);
    } catch (error) {
      await removeFileQuietly(nextModelDir);
      throw error;
    } finally {
      await Promise.all(files.map((file) => removeFileQuietly(file.path)));
    }
  }

  async deletePlateScannerModel(actor, t) {
    this.assertSuperAdmin(actor, t);
    const paths = await this.ensurePlateScannerDirectories();

    await fsp.rm(paths.modelDir, { recursive: true, force: true });
    await fsp.mkdir(paths.modelDir, { recursive: true });
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

  async saveEmailTemplates(payload, actor, t, locale = DEFAULT_LOCALE) {
    this.assertSuperAdmin(actor, t);
    const templateLocale = normalizeLocale(locale) || DEFAULT_LOCALE;

    await this.saveEmailTemplate('forgot_password', {
      subject: payload.forgotPasswordSubject,
      htmlContent: payload.forgotPasswordHtml,
      textContent: payload.forgotPasswordText,
    }, actor, t, templateLocale);

    await this.saveEmailTemplate('portal_invite', {
      subject: payload.portalInviteSubject,
      htmlContent: payload.portalInviteHtml,
      textContent: payload.portalInviteText,
    }, actor, t, templateLocale);
  }

  async saveEmailTemplate(templateKey, payload, actor, t, locale = DEFAULT_LOCALE) {
    this.assertSuperAdmin(actor, t);
    const templateLocale = normalizeLocale(locale) || DEFAULT_LOCALE;
    const templates = await this.systemSettingsRepository.listEmailTemplates(templateLocale);

    if (!templates[templateKey]) {
      throw new AppError(t('system.settings.error.templateNotFound'), 404);
    }

    if (!String(payload.subject || '').trim() || !String(payload.htmlContent || '').trim()) {
      throw new AppError(t('system.settings.error.templateRequired'), 422);
    }

    await this.systemSettingsRepository.upsertTemplate(templateKey, templateLocale, {
      subject: String(payload.subject || '').trim(),
      html_content: payload.htmlContent,
      text_content: payload.textContent || null,
    }, actor.id);
  }

  async sendTestEmail({ recipientEmail, locale = DEFAULT_LOCALE }, actor, t) {
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
      locale,
    });
  }

  createResetToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  createTokenHash(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  async sendForgotPassword(email, t, locale = DEFAULT_LOCALE) {
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

    const templateLocale = normalizeLocale(user.preferred_locale) || normalizeLocale(locale) || DEFAULT_LOCALE;

    await this.emailService.sendTemplate('forgot_password', {
      to: user.email,
      locale: templateLocale,
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

  async sendProfileInvite({
    to,
    eventName,
    profileName,
    accessCode,
    inviteUrl,
    wristbandSummary,
    passSummary,
    locale = DEFAULT_LOCALE,
  }) {
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    return this.emailService.sendTemplate('portal_invite', {
      to,
      locale,
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
    locale = DEFAULT_LOCALE,
  }) {
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    return this.emailService.sendTemplate('event_member_added', {
      to,
      locale,
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
    locale = DEFAULT_LOCALE,
  }) {
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    return this.emailService.sendTemplate('profile_application_notification', {
      to,
      locale,
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
    locale = DEFAULT_LOCALE,
  }) {
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    return this.emailService.sendTemplate('profile_application_rejected', {
      to,
      locale,
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
