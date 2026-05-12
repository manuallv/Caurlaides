const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const dayjs = require('dayjs');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { env } = require('../../config/env');
const { AppError } = require('../../shared/errors/AppError');
const { MANAGEMENT_ROLES } = require('../../shared/constants/event-roles');
const { DEFAULT_LOCALE, buildAuditMetadata, translate } = require('../../shared/i18n');
const { comparePassword, hashPassword } = require('../../infrastructure/security/password');
const { RequestProfileApplicationRepository } = require('../../infrastructure/database/repositories/RequestProfileApplicationRepository');

const PUBLIC_PORTAL_SESSION_KEY = 'publicRequestProfileId';
const PUBLIC_PORTAL_IMPORTS_KEY = 'publicRequestProfileImports';
const REQUEST_HISTORY_LIMIT = 100;
const PASS_PRINT_BACKGROUND_MIME_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
]);
const PASS_PRINT_FIELD_DEFINITIONS = [
  { type: 'id', labelKey: 'passPrint.variables.id' },
  { type: 'vehiclePlate', labelKey: 'passPrint.variables.vehiclePlate' },
  { type: 'fullName', labelKey: 'passPrint.variables.fullName' },
  { type: 'phone', labelKey: 'passPrint.variables.phone' },
  { type: 'email', labelKey: 'passPrint.variables.email' },
  { type: 'companyName', labelKey: 'passPrint.variables.companyName' },
  { type: 'categoryName', labelKey: 'passPrint.variables.categoryName' },
  { type: 'profileName', labelKey: 'passPrint.variables.profileName' },
  { type: 'notes', labelKey: 'passPrint.variables.notes' },
  { type: 'createdAt', labelKey: 'passPrint.variables.createdAt' },
  { type: 'eventName', labelKey: 'passPrint.variables.eventName' },
  { type: 'eventLocation', labelKey: 'passPrint.variables.eventLocation' },
  { type: 'customText', labelKey: 'passPrint.variables.customText' },
];
const PASS_PRINT_FIELD_TYPE_SET = new Set(PASS_PRINT_FIELD_DEFINITIONS.map((field) => field.type));
const PASS_PRINT_ORIENTATION_SET = new Set(['portrait', 'landscape']);
const PASS_PRINT_FONT_WEIGHT_SET = new Set(['400', '600', '700', '800']);
const PASS_PRINT_TEXT_ALIGN_SET = new Set(['left', 'center', 'right']);
const PASS_PRINT_HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PASS_PRINT_PDF_FONT_REGULAR = 'NotoSans';
const PASS_PRINT_PDF_FONT_BOLD = 'NotoSans-Bold';
const PASS_PRINT_PDF_FONT_REGULAR_PATH = path.resolve(__dirname, '../../../assets/fonts/NotoSans-Regular.ttf');
const PASS_PRINT_PDF_FONT_BOLD_PATH = path.resolve(__dirname, '../../../assets/fonts/NotoSans-Bold.ttf');

function resolveTranslate(t) {
  return typeof t === 'function' ? t : (key, params) => translate(DEFAULT_LOCALE, key, params);
}

function normalizeQuotaEntries(input = {}) {
  return Object.entries(input)
    .map(([categoryId, quota]) => ({
      categoryId: Number(String(categoryId).match(/\d+$/)?.[0] || categoryId),
      quota: Number(quota || 0),
    }))
    .filter((entry) => Number.isInteger(entry.categoryId) && entry.categoryId > 0 && entry.quota > 0);
}

function normalizeQuotaEntriesForCategories(input = {}, categories = []) {
  if (Array.isArray(input)) {
    const categoriesById = [...categories].sort((left, right) => Number(left.id) - Number(right.id));

    return input
      .map((quota, index) => ({
        categoryId: Number(categoriesById[index]?.id),
        quota: Number(quota || 0),
      }))
      .filter((entry) => Number.isInteger(entry.categoryId) && entry.categoryId > 0 && entry.quota > 0);
  }

  return normalizeQuotaEntries(input);
}

function hasAssignedRequestProfileQuota(passQuotas = [], wristbandQuotas = []) {
  return passQuotas.length > 0 || wristbandQuotas.length > 0;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase() || null;
}

function formatVehiclePlate(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ') || null;
}

function normalizeVehiclePlate(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || null;
}

function resolveVehicleEntryTimestamp(request = {}) {
  const entryValue = request.last_entry_at || request.entered_at;
  return entryValue ? new Date(entryValue).getTime() : 0;
}

function resolveVehiclePresenceStatus(request = {}) {
  const lastEntryTs = resolveVehicleEntryTimestamp(request);
  const lastExitTs = request.last_exit_at ? new Date(request.last_exit_at).getTime() : 0;

  if (!lastEntryTs && !lastExitTs) {
    return 'unknown';
  }

  return lastEntryTs > lastExitTs ? 'inside' : 'outside';
}

function resolveRequestDisplayState(type, request = {}) {
  if (type !== 'pass') {
    return request.status === 'handed_out' ? 'handed_out' : 'pending';
  }

  const lastEntryTs = resolveVehicleEntryTimestamp(request);
  const lastExitTs = request.last_exit_at ? new Date(request.last_exit_at).getTime() : 0;

  if (lastEntryTs && lastEntryTs > lastExitTs) {
    return 'entered';
  }

  if (lastExitTs && lastExitTs >= lastEntryTs) {
    return 'exited';
  }

  if (request.status === 'handed_out') {
    return 'handed_out';
  }

  return 'pending';
}

function resolveRequestDisplayStatusTone(type, request = {}) {
  const displayState = resolveRequestDisplayState(type, request);

  if (displayState === 'pending') {
    return 'pending';
  }

  if (type === 'pass' && displayState === 'exited') {
    return 'completed';
  }

  return 'active';
}

function resolveRequestDisplayStatusLabelKey(type, request = {}) {
  const displayState = resolveRequestDisplayState(type, request);
  return type === 'pass'
    ? `access.passState.${displayState}`
    : `statuses.${displayState}`;
}

function resolveRequestDisplayStatusAt(type, request = {}) {
  const displayState = resolveRequestDisplayState(type, request);

  if (type !== 'pass') {
    return request.status_updated_at || request.created_at || null;
  }

  switch (displayState) {
    case 'handed_out':
      return request.handed_out_at || request.status_updated_at || request.created_at || null;
    case 'entered':
      return request.last_entry_at || request.entered_at || request.created_at || null;
    case 'exited':
      return request.last_exit_at || request.created_at || null;
    default:
      return request.status_updated_at || request.created_at || null;
  }
}

function isRequestLockedForPortal(type, request = {}) {
  const displayState = resolveRequestDisplayState(type, request);

  if (type === 'pass') {
    return displayState === 'entered';
  }

  return displayState === 'handed_out';
}

function resolvePortalDeadline(type, profile = {}) {
  const deadlineField = type === 'pass' ? 'pass_request_deadline' : 'wristband_request_deadline';
  return profile[deadlineField] || null;
}

function resolvePortalLockReason(type, request = {}, profile = {}) {
  const displayState = resolveRequestDisplayState(type, request);

  if (type === 'pass') {
    if (displayState === 'entered') {
      return {
        code: 'passEntered',
        at: resolveRequestDisplayStatusAt(type, request),
      };
    }
  }

  if (type === 'wristband' && displayState === 'handed_out') {
    return {
      code: 'wristbandHandedOut',
      at: resolveRequestDisplayStatusAt(type, request),
    };
  }

  const deadline = resolvePortalDeadline(type, profile);

  if (deadline && dayjs().isAfter(dayjs(deadline))) {
    return {
      code: 'deadline',
      at: deadline,
    };
  }

  return {
    code: null,
    at: null,
  };
}

function resolveVehicleGateScanDirection(configuredMode, currentPresence) {
  if (!['entry', 'exit'].includes(configuredMode)) {
    return 'decision';
  }

  if (currentPresence === 'inside') {
    return 'exit';
  }

  if (currentPresence === 'outside') {
    return 'entry';
  }

  return configuredMode;
}

function shouldEnforceEntryWindow(direction) {
  return direction !== 'exit';
}

function buildPassPrintTemplatePublicUrl(backgroundPath) {
  if (!backgroundPath) {
    return '';
  }

  const relativePath = normalizePassPrintUploadPath(backgroundPath);

  return relativePath ? `/uploads/${relativePath}` : '';
}

function normalizePassPrintUploadPath(backgroundPath) {
  if (!backgroundPath) {
    return '';
  }

  return String(backgroundPath)
    .replace(/^\/+/, '')
    .replace(/\\/g, '/')
    .replace(/^uploads\//, '')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

function buildPassPrintTemplateAbsolutePath(backgroundPath) {
  const relativePath = normalizePassPrintUploadPath(backgroundPath);

  if (!relativePath) {
    return '';
  }

  return path.join(env.uploadsDir, relativePath);
}

function buildLegacyPassPrintTemplateAbsolutePath(backgroundPath) {
  if (!backgroundPath) {
    return '';
  }

  return path.join(process.cwd(), 'public', String(backgroundPath).replace(/^\/+/, ''));
}

async function resolvePassPrintTemplateAbsolutePath(backgroundPath) {
  const candidates = [
    buildPassPrintTemplateAbsolutePath(backgroundPath),
    buildLegacyPassPrintTemplateAbsolutePath(backgroundPath),
  ].filter(Boolean);

  for (const candidatePath of candidates) {
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch (error) {
      // Try the next possible storage location.
    }
  }

  return '';
}

async function unlinkPassPrintTemplateFile(backgroundPath) {
  const candidates = [
    buildPassPrintTemplateAbsolutePath(backgroundPath),
    buildLegacyPassPrintTemplateAbsolutePath(backgroundPath),
  ].filter(Boolean);

  await Promise.all(candidates.map((candidatePath) => fs.unlink(candidatePath).catch(() => {})));
}

function getPassPrintVariableDefinitions(t) {
  const tx = resolveTranslate(t);

  return PASS_PRINT_FIELD_DEFINITIONS.map((field) => ({
    type: field.type,
    label: tx(field.labelKey),
  }));
}

function parsePassPrintTemplateFields(rawValue) {
  if (!rawValue) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return rawValue;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizePassPrintTemplateFields(rawFields) {
  return parsePassPrintTemplateFields(rawFields)
    .map((rawField, index) => {
      const type = String(rawField?.type || '').trim();
      const text = rawField?.text ?? rawField?.prefix ?? '';
      const x = Number(rawField?.x);
      const y = Number(rawField?.y);
      const fontSize = Number(rawField?.fontSize);
      const variableFontSize = Number(rawField?.variableFontSize ?? rawField?.fontSize);
      const prefixFontSize = Number(rawField?.prefixFontSize ?? rawField?.fontSize);
      const width = Number(rawField?.width);
      const rotation = Number(rawField?.rotation);

      if (!PASS_PRINT_FIELD_TYPE_SET.has(type)) {
        return null;
      }

      const normalizedRotation = normalizePassPrintRotation(rotation);
      const normalizedVariableFontSize = normalizePassPrintFontSize(variableFontSize, Number.isFinite(fontSize) ? fontSize : 18);

      return {
        id: rawField?.id ? String(rawField.id).trim().slice(0, 80) : `field-${index + 1}`,
        type,
        text: String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200),
        x: Number.isFinite(x) ? Math.min(Math.max(x, 0), 0.96) : 0.15,
        y: Number.isFinite(y) ? Math.min(Math.max(y, 0), 0.96) : 0.15,
        fontSize: normalizedVariableFontSize,
        variableFontSize: normalizedVariableFontSize,
        variableFontWeight: normalizePassPrintFontWeight(rawField?.variableFontWeight, '700'),
        prefixFontSize: normalizePassPrintFontSize(prefixFontSize, Number.isFinite(fontSize) ? fontSize : 18),
        prefixFontWeight: normalizePassPrintFontWeight(rawField?.prefixFontWeight, '600'),
        textAlign: normalizePassPrintTextAlign(rawField?.textAlign),
        borderEnabled: normalizePassPrintBoolean(rawField?.borderEnabled),
        borderColor: normalizePassPrintColor(rawField?.borderColor),
        width: Number.isFinite(width) ? Math.min(Math.max(width, 0.08), 0.9) : 0.24,
        rotation: normalizedRotation,
      };
    })
    .filter(Boolean);
}

function normalizePassPrintRotation(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return ((((Math.round(numericValue / 90) * 90) % 360) + 360) % 360);
}

function normalizePassPrintOrientation(value) {
  const orientation = String(value || '').trim();
  return PASS_PRINT_ORIENTATION_SET.has(orientation) ? orientation : 'portrait';
}

function normalizePassPrintFontSize(value, fallback = 18) {
  const fontSize = Number(value);
  const fallbackSize = Number(fallback);
  const safeFallback = Number.isFinite(fallbackSize) ? fallbackSize : 18;

  return Number.isFinite(fontSize)
    ? Math.min(Math.max(fontSize, 8), 96)
    : Math.min(Math.max(safeFallback, 8), 96);
}

function normalizePassPrintFontWeight(value, fallback = '700') {
  const fontWeight = String(value || '').trim();
  return PASS_PRINT_FONT_WEIGHT_SET.has(fontWeight) ? fontWeight : fallback;
}

function normalizePassPrintTextAlign(value) {
  const textAlign = String(value || '').trim();
  return PASS_PRINT_TEXT_ALIGN_SET.has(textAlign) ? textAlign : 'left';
}

function normalizePassPrintBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function normalizePassPrintColor(value, fallback = '#0f172a') {
  const color = String(value || '').trim();
  return PASS_PRINT_HEX_COLOR_PATTERN.test(color) ? color.toLowerCase() : fallback;
}

function sanitizePassPrintTemplateFields(rawFields, t) {
  const tx = resolveTranslate(t);
  const fields = normalizePassPrintTemplateFields(rawFields);

  if (!fields.length) {
    throw new AppError(tx('service.passPrint.fieldsRequired'), 422);
  }

  return fields;
}

function buildPassPrintTemplateFromEvent(event, t) {
  const tx = resolveTranslate(t);

  return {
    name: String(event.pass_print_template_name || '').trim() || tx('passPrint.defaultTemplateName'),
    backgroundPath: event.pass_print_template_background_path || '',
    backgroundUrl: buildPassPrintTemplatePublicUrl(event.pass_print_template_background_path),
    backgroundRotation: normalizePassPrintRotation(event.pass_print_template_background_rotation),
    orientation: normalizePassPrintOrientation(event.pass_print_template_orientation),
    fields: normalizePassPrintTemplateFields(event.pass_print_template_fields_json || '[]'),
    updatedAt: event.pass_print_template_updated_at || null,
  };
}

function renderPassPrintBackground(document, backgroundSource, rotation = 0) {
  const normalizedRotation = normalizePassPrintRotation(rotation);

  try {
    document.save();

    if (normalizedRotation === 90) {
      document.translate(document.page.width, 0);
      document.rotate(90, { origin: [0, 0] });
      document.image(backgroundSource, 0, 0, {
        width: document.page.height,
        height: document.page.width,
      });
    } else if (normalizedRotation === 180) {
      document.translate(document.page.width, document.page.height);
      document.rotate(180, { origin: [0, 0] });
      document.image(backgroundSource, 0, 0, {
        width: document.page.width,
        height: document.page.height,
      });
    } else if (normalizedRotation === 270) {
      document.translate(0, document.page.height);
      document.rotate(-90, { origin: [0, 0] });
      document.image(backgroundSource, 0, 0, {
        width: document.page.height,
        height: document.page.width,
      });
    } else {
      document.image(backgroundSource, 0, 0, {
        width: document.page.width,
        height: document.page.height,
      });
    }

    document.restore();
    return true;
  } catch (error) {
    try {
      document.restore();
    } catch (restoreError) {
      // Ignore restore failures after an image render error.
    }

    return false;
  }
}

function registerPassPrintPdfFonts(document) {
  try {
    document.registerFont(PASS_PRINT_PDF_FONT_REGULAR, PASS_PRINT_PDF_FONT_REGULAR_PATH);
    document.registerFont(PASS_PRINT_PDF_FONT_BOLD, PASS_PRINT_PDF_FONT_BOLD_PATH);
    return true;
  } catch (error) {
    return false;
  }
}

function getPassPrintPdfFont(weight, customFontsRegistered = false) {
  if (customFontsRegistered) {
    return Number(weight) >= 600 ? PASS_PRINT_PDF_FONT_BOLD : PASS_PRINT_PDF_FONT_REGULAR;
  }

  return Number(weight) >= 600 ? 'Helvetica-Bold' : 'Helvetica';
}

function resolvePassPrintVariableValue(type, request, event) {
  switch (type) {
    case 'id':
      return request.id || '';
    case 'vehiclePlate':
      return request.vehicle_plate || '';
    case 'fullName':
      return request.full_name || '';
    case 'phone':
      return request.phone || '';
    case 'email':
      return request.email || '';
    case 'companyName':
      return request.company_name || '';
    case 'categoryName':
      return request.category_name || '';
    case 'profileName':
      return request.profile_name || '';
    case 'notes':
      return request.notes || '';
    case 'createdAt':
      return request.created_at ? dayjs(request.created_at).format('DD.MM.YYYY HH:mm') : '';
    case 'eventName':
      return event.name || '';
    case 'eventLocation':
      return event.location || '';
    default:
      return '';
  }
}

function resolvePassPrintFieldParts(field, request, event) {
  const type = String(field?.type || '').trim();
  const prefix = String(field?.text || '');

  if (type === 'customText') {
    return {
      prefix,
      variable: '',
    };
  }

  return {
    prefix,
    variable: String(resolvePassPrintVariableValue(type, request, event) || ''),
  };
}

function renderPassPrintFieldText(document, field, request, event, textWidth, customFontsRegistered = false) {
  const parts = resolvePassPrintFieldParts(field, request, event);
  const prefixText = String(parts.prefix || '');
  const variableText = String(parts.variable || '');

  if (!prefixText && !variableText) {
    return false;
  }

  const prefixFontSize = normalizePassPrintFontSize(field.prefixFontSize ?? field.fontSize, 18);
  const variableFontSize = normalizePassPrintFontSize(field.variableFontSize ?? field.fontSize, 18);
  const prefixFontWeight = normalizePassPrintFontWeight(field.prefixFontWeight, '600');
  const variableFontWeight = normalizePassPrintFontWeight(field.variableFontWeight, '700');
  const textAlign = normalizePassPrintTextAlign(field.textAlign);

  document.font(getPassPrintPdfFont(prefixFontWeight, customFontsRegistered)).fontSize(prefixFontSize);
  const prefixWidth = prefixText ? document.widthOfString(prefixText) : 0;
  document.font(getPassPrintPdfFont(variableFontWeight, customFontsRegistered)).fontSize(variableFontSize);
  const variableWidth = variableText ? document.widthOfString(variableText) : 0;
  const totalWidth = prefixWidth + variableWidth;
  const offsetX = textAlign === 'center'
    ? Math.max(0, (textWidth - totalWidth) / 2)
    : (textAlign === 'right' ? Math.max(0, textWidth - totalWidth) : 0);
  let cursorX = offsetX;

  if (prefixText) {
    document
      .font(getPassPrintPdfFont(prefixFontWeight, customFontsRegistered))
      .fontSize(prefixFontSize)
      .fillColor('#0f172a')
      .text(prefixText, cursorX, 0, {
        lineBreak: false,
      });
    cursorX += prefixWidth;
  }

  if (variableText) {
    document
      .font(getPassPrintPdfFont(variableFontWeight, customFontsRegistered))
      .fontSize(variableFontSize)
      .fillColor('#0f172a')
      .text(variableText, cursorX, 0, {
        lineBreak: false,
      });
  }

  if (field.borderEnabled) {
    const maxFontSize = Math.max(prefixFontSize, variableFontSize);
    const borderY = Math.max(8, maxFontSize * 1.18);
    document
      .save()
      .strokeColor(normalizePassPrintColor(field.borderColor))
      .lineWidth(1.1)
      .dash(1.4, { space: 3 })
      .moveTo(0, borderY)
      .lineTo(textWidth, borderY)
      .stroke()
      .undash()
      .restore();
  }

  return true;
}

async function buildPassPrintPdfBuffer({ event, requests, template }) {
  let backgroundSource = template.backgroundBuffer || '';

  if (!backgroundSource && template.backgroundPath) {
    backgroundSource = await resolvePassPrintTemplateAbsolutePath(template.backgroundPath);
  }

  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      layout: template.orientation === 'landscape' ? 'landscape' : 'portrait',
      margin: 0,
      autoFirstPage: false,
      bufferPages: false,
    });
    const chunks = [];
    const customFontsRegistered = registerPassPrintPdfFonts(document);

    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    requests.forEach((request) => {
      document.addPage({
        size: 'A4',
        layout: template.orientation === 'landscape' ? 'landscape' : 'portrait',
        margin: 0,
      });

      if (backgroundSource) {
        const rendered = renderPassPrintBackground(document, backgroundSource, template.backgroundRotation);

        if (!rendered) {
          backgroundSource = '';
        }
      }

      template.fields.forEach((field) => {
        const x = Math.max(0, Math.min(document.page.width - 24, document.page.width * Number(field.x || 0)));
        const y = Math.max(0, Math.min(document.page.height - 24, document.page.height * Number(field.y || 0)));
        const textWidth = Math.max(48, document.page.width * Number(field.width || 0.24));
        const rotation = Number(field.rotation || 0);

        document.save();
        document.translate(x, y);

        if (rotation) {
          document.rotate(rotation, { origin: [0, 0] });
        }

        renderPassPrintFieldText(document, field, request, event, textWidth, customFontsRegistered);
        document.restore();
      });
    });

    document.end();
  });
}

function buildRequestPayload(body, fallbackCompanyName = null) {
  const vehiclePlate = formatVehiclePlate(body.vehiclePlate);

  return {
    categoryId: Number(body.categoryId),
    fullName: body.fullName ? body.fullName.trim() : '',
    companyName: (body.companyName || fallbackCompanyName || '').trim() || null,
    phone: body.phone ? body.phone.trim() : null,
    email: body.email ? body.email.trim() : null,
    vehiclePlate,
    vehiclePlateNormalized: normalizeVehiclePlate(vehiclePlate),
    notes: body.notes ? body.notes.trim() : null,
  };
}

function assertPassVehiclePlateRequired(type, vehiclePlateNormalized, t) {
  if (type === 'pass' && !vehiclePlateNormalized) {
    throw new AppError(t('validation.portal.vehiclePlateRequired'), 422);
  }
}

function withRemainingQuota(quotaUsage = []) {
  return quotaUsage.map((entry) => {
    const quota = Number(entry.quota || 0);
    const usedCount = Number(entry.used_count || 0);

    return {
      ...entry,
      quota,
      used_count: usedCount,
      remaining_count: Math.max(quota - usedCount, 0),
    };
  });
}

function buildQuotaTotals(quotaUsage = []) {
  return quotaUsage.reduce(
    (totals, entry) => {
      totals.quota += Number(entry.quota || 0);
      totals.used += Number(entry.used_count || 0);
      totals.remaining += Number(entry.remaining_count || 0);
      return totals;
    },
    {
      quota: 0,
      used: 0,
      remaining: 0,
    },
  );
}

function buildProfileCategoryStats(categories = [], profiles = [], usageKey) {
  const statsByCategory = new Map();

  categories.forEach((category) => {
    statsByCategory.set(Number(category.id), {
      categoryId: Number(category.id),
      name: category.name,
      requested: 0,
      assigned: 0,
    });
  });

  profiles.forEach((profile) => {
    const usage = Array.isArray(profile[usageKey]) ? profile[usageKey] : [];

    usage.forEach((entry) => {
      const categoryId = Number(entry.category_id || 0);

      if (!categoryId) {
        return;
      }

      if (!statsByCategory.has(categoryId)) {
        statsByCategory.set(categoryId, {
          categoryId,
          name: entry.category_name || '-',
          requested: 0,
          assigned: 0,
        });
      }

      const stat = statsByCategory.get(categoryId);
      stat.requested += Number(entry.used_count || 0);

      if (!entry.is_unlimited) {
        stat.assigned += Number(entry.quota || 0);
      }
    });
  });

  return [...statsByCategory.values()].filter((stat) => stat.requested > 0 || stat.assigned > 0);
}

function buildQuotaMap(quotaUsage = []) {
  return quotaUsage.reduce((map, entry) => {
    map[entry.category_id] = Number(entry.quota || 0);
    return map;
  }, {});
}

function buildUnlimitedQuotaUsage(categories = [], requests = []) {
  const usageByCategory = new Map();

  categories.forEach((category) => {
    usageByCategory.set(Number(category.id), {
      category_id: Number(category.id),
      quota: null,
      category_name: category.name,
      used_count: 0,
      remaining_count: null,
      is_unlimited: true,
      can_create: true,
    });
  });

  requests.forEach((request) => {
    const categoryId = Number(request.category_id || 0);

    if (!categoryId) {
      return;
    }

    if (!usageByCategory.has(categoryId)) {
      usageByCategory.set(categoryId, {
        category_id: categoryId,
        quota: null,
        category_name: request.category_name || '-',
        used_count: 0,
        remaining_count: null,
        is_unlimited: true,
        can_create: false,
      });
    }

    const entry = usageByCategory.get(categoryId);
    entry.used_count += 1;
  });

  return [...usageByCategory.values()];
}

function buildUnlimitedQuotaTotals(quotaUsage = []) {
  return {
    quota: null,
    used: quotaUsage.reduce((sum, entry) => sum + Number(entry.used_count || 0), 0),
    remaining: null,
    isUnlimited: true,
  };
}

function buildCombinedRequests(passRequests = [], wristbandRequests = []) {
  return [...passRequests, ...wristbandRequests]
    .sort((left, right) => {
      const leftDate = new Date(left.created_at || left.updated_at || 0).getTime();
      const rightDate = new Date(right.created_at || right.updated_at || 0).getTime();

      if (rightDate !== leftDate) {
        return rightDate - leftDate;
      }

      return Number(right.id || 0) - Number(left.id || 0);
    })
    .map((request) => ({
      ...request,
      requestTypeLabel: translate(DEFAULT_LOCALE, `nav.${request.request_type === 'pass' ? 'passes' : 'wristbands'}`),
    }));
}

function normalizeAccessCode(accessCode) {
  return String(accessCode || '').trim().toUpperCase();
}

function buildInviteUrl(accessCode) {
  const baseUrl = env.appUrl.replace(/\/$/, '');
  return `${baseUrl}/p/${encodeURIComponent(accessCode)}`;
}

function buildRequestProfileApplicationUrl(token) {
  const baseUrl = env.appUrl.replace(/\/$/, '');
  return `${baseUrl}/apply/${encodeURIComponent(token)}`;
}

function buildRequestProfileApplicationsAdminUrl(eventId) {
  const baseUrl = env.appUrl.replace(/\/$/, '');
  return `${baseUrl}/events/${encodeURIComponent(eventId)}/request-profiles/applications`;
}

function buildQuotaValueMap(entries = []) {
  return entries.reduce((map, entry) => {
    map[Number(entry.categoryId)] = Number(entry.quota || 0);
    return map;
  }, {});
}

function buildQuotaSummary(entries = [], categories = []) {
  const categoryMap = categories.reduce((map, category) => {
    map[Number(category.id)] = category;
    return map;
  }, {});

  return entries.map((entry) => ({
    ...entry,
    categoryName: categoryMap[Number(entry.categoryId)]?.name || `#${entry.categoryId}`,
  }));
}

function buildRequestedQuotaText(entries = [], categories = []) {
  const summary = buildQuotaSummary(entries, categories);

  if (!summary.length) {
    return '0';
  }

  return summary.map((entry) => `${entry.categoryName}: ${entry.quota}`).join(', ');
}

function buildQuotaUsageSummary(quotaUsage = []) {
  if (!quotaUsage.length) {
    return '0';
  }

  return quotaUsage
    .map((entry) => `${entry.category_name}: ${entry.quota}`)
    .join(', ');
}

function normalizeImportHeader(header = '') {
  return String(header)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, '');
}

function normalizeImportRow(rawRow = {}, index = 0, fallbackCompanyName = null) {
  const normalized = {};

  for (const [key, value] of Object.entries(rawRow)) {
    normalized[normalizeImportHeader(key)] = value;
  }

  return {
    rowNumber: index + 2,
    fullName: String(
      normalized.fullname || normalized.name || normalized.vardsuzvards || normalized.person || '',
    ).trim(),
    phone: String(normalized.phone || normalized.tel || normalized.telefons || '').trim(),
    companyName: String(
      normalized.company || normalized.companyname || normalized.uznemums || fallbackCompanyName || '',
    ).trim(),
    email: String(normalized.email || normalized.epasts || '').trim(),
    vehiclePlate: formatVehiclePlate(
      normalized.vehicleplate
      || normalized.carnumber
      || normalized.carnr
      || normalized.platenumber
      || normalized.autonumurs
      || normalized.numurzime
      || '',
    ),
    notes: String(normalized.notes || normalized.piezimes || '').trim(),
  };
}

function buildImportSampleHeaders(type) {
  return type === 'pass'
    ? ['Full Name', 'Phone', 'Company', 'Email', 'Vehicle Plate', 'Notes']
    : ['Full Name', 'Phone', 'Company', 'Email', 'Notes'];
}

function formatExportDateTime(value) {
  if (!value) {
    return '';
  }

  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

function sanitizeFileName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'export';
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? '');

  if (/[",\n;]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function buildAdminExportRows(requests = [], typeLabel = '', type = '') {
  return requests.map((request, index) => ({
    '#': index + 1,
    'ID': request.id,
    'Section': typeLabel,
    'Full Name': request.full_name || '',
    'Type': request.category_name || '',
    'Profile': request.profile_name || '',
    'Company': request.company_name || '',
    'Phone': request.phone || '',
    'Email': request.email || '',
    'Status': resolveRequestDisplayState(type, request),
    'Status Label': translate(DEFAULT_LOCALE, resolveRequestDisplayStatusLabelKey(type, request)),
    'Status Updated At': formatExportDateTime(resolveRequestDisplayStatusAt(type, request)),
    'Status Updated By': request.status_updated_by_name || '',
    'Handed Out At': formatExportDateTime(request.handed_out_at),
    'Handed Out By': request.handed_out_by_name || '',
    'Created At': formatExportDateTime(request.created_at),
    'Updated At': formatExportDateTime(request.updated_at),
    'Notes': request.notes || '',
  }));
}

function buildCsvBuffer(rows = []) {
  if (!rows.length) {
    return Buffer.from('', 'utf8');
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map((header) => escapeCsvValue(header)).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ];

  return Buffer.from(lines.join('\n'), 'utf8');
}

function buildPdfBuffer({ event, title, rows }) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 28,
      autoFirstPage: true,
      bufferPages: false,
    });
    const chunks = [];

    const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const tableStartX = document.page.margins.left;
    const tableBottomY = document.page.height - document.page.margins.bottom;
    const tableColumns = [
      { key: '#', label: '#', width: 22, align: 'center' },
      { key: 'Full Name', label: 'Name', width: 86 },
      { key: 'Type', label: 'Type', width: 60 },
      { key: 'Profile', label: 'Profile', width: 82 },
      { key: 'Company', label: 'Company', width: 62 },
      { key: 'Phone', label: 'Phone', width: 48 },
      { key: 'Email', label: 'Email', width: 88 },
      { key: 'Status Label', label: 'Status', width: 46 },
      { key: 'Status Updated At', label: 'Status at', width: 58 },
      { key: 'Handed Out At', label: 'Handed out', width: 58 },
      { key: 'Updated At', label: 'Updated', width: 58 },
      { key: 'Notes', label: 'Notes', width: 117 },
    ];
    const headerHeight = 24;
    const rowPadding = 4;
    const bodyFontSize = 7;
    const headerFontSize = 7.5;

    const drawTableHeader = (startY) => {
      let cursorX = tableStartX;

      document.save();
      document.rect(tableStartX, startY, pageWidth, headerHeight).fill('#eff4fb');
      document.restore();

      tableColumns.forEach((column) => {
        document
          .rect(cursorX, startY, column.width, headerHeight)
          .strokeColor('#d8e1ee')
          .lineWidth(0.7)
          .stroke();

        document
          .font('Helvetica-Bold')
          .fontSize(headerFontSize)
          .fillColor('#334155')
          .text(column.label, cursorX + 4, startY + 7, {
            width: column.width - 8,
            align: column.align || 'left',
            lineBreak: false,
          });

        cursorX += column.width;
      });

      return startY + headerHeight;
    };

    const getRowHeight = (row) => {
      let maxHeight = 0;

      tableColumns.forEach((column) => {
        const value = String(row[column.key] ?? '-');
        const textHeight = document.heightOfString(value, {
          width: column.width - rowPadding * 2,
          align: column.align || 'left',
        });
        maxHeight = Math.max(maxHeight, textHeight);
      });

      return Math.max(20, maxHeight + rowPadding * 2);
    };

    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    document.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(title);
    document.moveDown(0.15);
    document.font('Helvetica').fontSize(9).fillColor('#475569');
    document.text(`Event: ${event.name}`);
    document.text(`Location: ${event.location || '-'}`);
    document.text(`Dates: ${formatExportDateTime(event.start_date)} - ${formatExportDateTime(event.end_date)}`);
    document.text(`Total requests: ${rows.length}`);
    document.text(`Exported at: ${formatExportDateTime(new Date())}`);
    document.moveDown(0.45);

    let cursorY = drawTableHeader(document.y);

    if (!rows.length) {
      document
        .rect(tableStartX, cursorY, pageWidth, 28)
        .strokeColor('#d8e1ee')
        .lineWidth(0.7)
        .stroke();

      document
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#64748b')
        .text('No requests found.', tableStartX, cursorY + 9, {
          width: pageWidth,
          align: 'center',
        });
    }

    rows.forEach((row, index) => {
      const rowHeight = getRowHeight(row);

      if (cursorY + rowHeight > tableBottomY) {
        document.addPage();
        cursorY = drawTableHeader(document.page.margins.top);
      }

      let cursorX = tableStartX;

      if (index % 2 === 0) {
        document.save();
        document.rect(tableStartX, cursorY, pageWidth, rowHeight).fill('#fbfdff');
        document.restore();
      }

      tableColumns.forEach((column) => {
        const value = String(row[column.key] ?? '-');

        document
          .rect(cursorX, cursorY, column.width, rowHeight)
          .strokeColor('#d8e1ee')
          .lineWidth(0.55)
          .stroke();

        document
          .font(column.key === '#' ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bodyFontSize)
          .fillColor('#334155')
          .text(value, cursorX + rowPadding, cursorY + rowPadding, {
            width: column.width - rowPadding * 2,
            align: column.align || 'left',
          });

        cursorX += column.width;
      });

      cursorY += rowHeight;
    });

    document.end();
  });
}

class AccessService {
  constructor({
    pool,
    categoryRepository,
    eventRepository,
    requestProfileRepository,
    requestProfileApplicationRepository,
    requestRepository,
    eventService,
    auditLogService,
    systemService,
  }) {
    this.pool = pool;
    this.categoryRepository = categoryRepository;
    this.eventRepository = eventRepository;
    this.requestProfileRepository = requestProfileRepository;
    this.requestProfileApplicationRepository = requestProfileApplicationRepository
      || new RequestProfileApplicationRepository(pool);
    this.requestRepository = requestRepository;
    this.eventService = eventService;
    this.auditLogService = auditLogService;
    this.systemService = systemService;
  }

  getPublicProfileSession(session) {
    return Number(session[PUBLIC_PORTAL_SESSION_KEY] || 0);
  }

  setPublicProfileSession(session, profileId) {
    session[PUBLIC_PORTAL_SESSION_KEY] = Number(profileId);
  }

  getPublicImportSession(session) {
    if (!session[PUBLIC_PORTAL_IMPORTS_KEY]) {
      session[PUBLIC_PORTAL_IMPORTS_KEY] = {};
    }

    return session[PUBLIC_PORTAL_IMPORTS_KEY];
  }

  generateAccessCode() {
    return crypto.randomBytes(4).toString('hex').slice(0, 8).toUpperCase();
  }

  async generateUniqueAccessCode() {
    for (let index = 0; index < 12; index += 1) {
      const accessCode = normalizeAccessCode(this.generateAccessCode());
      const existingProfile = await this.requestProfileRepository.findByAccessCode(accessCode);

      if (!existingProfile) {
        return accessCode;
      }
    }

    throw new Error('Unable to generate a unique access code');
  }

  async ensureRequestProfileAccessCode(profile) {
    if (profile.access_code) {
      return profile;
    }

    const accessCode = await this.generateUniqueAccessCode();
    const accessCodeHash = await hashPassword(accessCode);
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.requestProfileRepository.updateAccessCode(connection, profile.id, {
        accessCode,
        accessCodeHash,
        userId: null,
      });
      await connection.commit();

      return {
        ...profile,
        access_code: accessCode,
        access_code_hash: accessCodeHash,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deliverRequestProfileInvite(event, profile, tx) {
    if (!this.systemService) {
      throw new AppError(tx('service.requestProfile.inviteEmailUnavailable'), 422);
    }

    if (!profile) {
      throw new AppError(tx('service.requestProfile.notFound'), 404);
    }

    const contactEmail = normalizeEmail(profile.contact_email);

    if (!contactEmail) {
      throw new AppError(tx('service.requestProfile.contactEmailRequired'), 422);
    }

    const refreshedProfile = await this.ensureRequestProfileAccessCode(profile);
    const isUnlimitedQuota = Number(refreshedProfile.is_unlimited_quota) === 1;
    const [passQuotaUsage, wristbandQuotaUsage] = await Promise.all([
      this.requestRepository.listQuotaUsage(refreshedProfile.id, 'pass').then(withRemainingQuota),
      this.requestRepository.listQuotaUsage(refreshedProfile.id, 'wristband').then(withRemainingQuota),
    ]);

    const delivery = await this.systemService.sendProfileInvite({
      to: contactEmail,
      eventName: event.name,
      profileName: refreshedProfile.name,
      accessCode: refreshedProfile.access_code,
      inviteUrl: buildInviteUrl(refreshedProfile.access_code),
      wristbandSummary: isUnlimitedQuota
        ? tx('requestProfiles.unlimited')
        : buildQuotaUsageSummary(wristbandQuotaUsage),
      passSummary: isUnlimitedQuota
        ? tx('requestProfiles.unlimited')
        : buildQuotaUsageSummary(passQuotaUsage),
    });

    return {
      accessCode: refreshedProfile.access_code,
      email: contactEmail,
      delivery,
    };
  }

  async sendRequestProfileInvite(eventId, profileId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const profile = await this.requestProfileRepository.findById(profileId);

    if (!profile || Number(profile.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.requestProfile.notFound'), 404);
    }

    try {
      return await this.deliverRequestProfileInvite(event, profile, tx);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.warn('Profile invite email failed:', error.message);
      throw new AppError(tx('service.requestProfile.inviteEmailFailed'), 422);
    }
  }

  async generateUniqueRequestProfileApplicationToken() {
    for (let index = 0; index < 12; index += 1) {
      const token = uuidv4();
      const existingEvent = await this.eventRepository.findByRequestProfileApplicationToken(token);

      if (!existingEvent) {
        return token;
      }
    }

    throw new Error('Unable to generate a unique request profile application token');
  }

  async ensureRequestProfileApplicationToken(event) {
    if (event.request_profile_application_token) {
      return event.request_profile_application_token;
    }

    const token = await this.generateUniqueRequestProfileApplicationToken();
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.eventRepository.updateRequestProfileApplicationToken(connection, event.id, token);
      await connection.commit();
      event.request_profile_application_token = token;
      return token;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async normalizeProfileApplicationQuotas(eventId, payload, t) {
    const tx = resolveTranslate(t);
    const [passCategories, wristbandCategories] = await Promise.all([
      this.categoryRepository.listByEvent(eventId, 'pass'),
      this.categoryRepository.listByEvent(eventId, 'wristband'),
    ]);
    const activePassCategories = passCategories.filter((category) => Number(category.is_active) === 1);
    const activeWristbandCategories = wristbandCategories.filter((category) => Number(category.is_active) === 1);
    const passQuotas = normalizeQuotaEntriesForCategories(payload.passQuota, activePassCategories);
    const wristbandQuotas = normalizeQuotaEntriesForCategories(payload.wristbandQuota, activeWristbandCategories);
    const validPassIds = new Set(activePassCategories.map((category) => Number(category.id)));
    const validWristbandIds = new Set(activeWristbandCategories.map((category) => Number(category.id)));
    const sanitizedPassQuotas = passQuotas.filter((entry) => validPassIds.has(Number(entry.categoryId)));
    const sanitizedWristbandQuotas = wristbandQuotas.filter(
      (entry) => validWristbandIds.has(Number(entry.categoryId)),
    );

    if (!hasAssignedRequestProfileQuota(sanitizedPassQuotas, sanitizedWristbandQuotas)) {
      throw new AppError(tx('service.requestProfileApplication.quotaRequired'), 422);
    }

    return {
      passCategories,
      wristbandCategories,
      activePassCategories,
      activeWristbandCategories,
      passQuotas: sanitizedPassQuotas,
      wristbandQuotas: sanitizedWristbandQuotas,
    };
  }

  async assertRequestProfileIdentityAvailable(eventId, payload, t) {
    const tx = resolveTranslate(t);
    const profileName = String(payload.profileName || payload.name || '').trim();
    const contactEmail = normalizeEmail(payload.contactEmail);

    if (!profileName || !contactEmail) {
      return;
    }

    const duplicateProfile = await this.requestProfileRepository.findByEventIdentity(eventId, {
      name: profileName,
      contactEmail,
      excludeProfileId: payload.excludeProfileId,
    });

    if (duplicateProfile) {
      throw new AppError(tx(payload.messageKey || 'service.requestProfile.duplicate'), 409);
    }

    if (payload.includeApplications === false) {
      return;
    }

    const duplicateApplication = await this.requestProfileApplicationRepository.findDuplicateByIdentity(eventId, {
      profileName,
      contactEmail,
      statuses: payload.applicationStatuses || ['pending', 'approved'],
      excludeId: payload.excludeApplicationId,
    });

    if (duplicateApplication) {
      throw new AppError(tx(payload.applicationMessageKey || 'service.requestProfileApplication.duplicate'), 409);
    }
  }

  async getTypeManagementPage(eventId, actorId, type, filters, t) {
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, t);
    const pageSize = 50;
    const requestedPage = Math.max(Number(filters?.page) || 1, 1);
    const [categories, overview, profiles, totalFilteredRequests] = await Promise.all([
      this.categoryRepository.listByEvent(eventId, type),
      this.requestRepository.getAdminOverview(eventId, type),
      this.requestProfileRepository.listOptionsByEvent(eventId),
      this.requestRepository.countAdminRequests(eventId, type, filters),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalFilteredRequests / pageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    const offset = (currentPage - 1) * pageSize;
    const requests = await this.requestRepository.listAdminRequests(eventId, type, filters, {
      limit: pageSize,
      offset,
    });
    const categoryCountMap = overview.categoryCounts.reduce((map, entry) => {
      map[entry.category_id] = entry;
      return map;
    }, {});
    const normalizedFilters = {
      ...(filters || {}),
      page: currentPage,
    };

    return {
      event,
      categories: categories.map((category) => ({
        ...category,
        total_requests: Number(categoryCountMap[Number(category.id)]?.total_requests || 0),
        handed_out_requests: Number(categoryCountMap[Number(category.id)]?.handed_out_requests || 0),
      })),
      profiles: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
      })),
      requests: requests.map((request) => ({
        ...request,
        display_status: resolveRequestDisplayState(type, request),
        display_status_label_key: resolveRequestDisplayStatusLabelKey(type, request),
        display_status_tone: resolveRequestDisplayStatusTone(type, request),
        display_status_at: resolveRequestDisplayStatusAt(type, request),
      })),
      summary: overview.summary,
      canManage: MANAGEMENT_ROLES.includes(event.role),
      filters: normalizedFilters,
      pagination: {
        currentPage,
        pageSize,
        totalItems: totalFilteredRequests,
        totalPages,
        startItem: totalFilteredRequests ? offset + 1 : 0,
        endItem: totalFilteredRequests ? offset + requests.length : 0,
        hasPrev: currentPage > 1,
        hasNext: currentPage < totalPages,
      },
      type,
    };
  }

  async exportAdminRequests(eventId, actorId, type, format, filters, t) {
    const tx = resolveTranslate(t);
    const normalizedFormat = String(format || '').trim().toLowerCase();
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!['xlsx', 'csv', 'pdf'].includes(normalizedFormat)) {
      throw new AppError(tx('service.export.formatInvalid'), 422);
    }

    const requests = await this.requestRepository.listAdminRequests(eventId, type, filters || {});
    const typeTitle = tx(type === 'pass' ? 'nav.passes' : 'nav.wristbands');
    const rows = buildAdminExportRows(requests, typeTitle, type);
    const timestamp = dayjs().format('YYYYMMDD-HHmm');
    const baseFileName = sanitizeFileName(`${event.name}-${typeTitle}-${timestamp}`);

    if (normalizedFormat === 'csv') {
      return {
        buffer: buildCsvBuffer(rows),
        filename: `${baseFileName}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    if (normalizedFormat === 'xlsx') {
      const infoSheet = XLSX.utils.json_to_sheet([
        {
          event_name: event.name,
          access_type: typeTitle,
          location: event.location || '',
          start_date: formatExportDateTime(event.start_date),
          end_date: formatExportDateTime(event.end_date),
          total_requests: rows.length,
          exported_at: formatExportDateTime(new Date()),
        },
      ]);
      const requestSheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, infoSheet, 'Info');
      XLSX.utils.book_append_sheet(workbook, requestSheet, 'Requests');

      return {
        buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
        filename: `${baseFileName}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    return {
      buffer: await buildPdfBuffer({
        event,
        title: `${event.name} - ${typeTitle}`,
        rows,
      }),
      filename: `${baseFileName}.pdf`,
      contentType: 'application/pdf',
    };
  }

  async getPassPrintPage(eventId, actorId, t) {
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, t);
    const [categories, overview] = await Promise.all([
      this.categoryRepository.listByEvent(eventId, 'pass'),
      this.requestRepository.getAdminOverview(eventId, 'pass'),
    ]);
    const categoryCountMap = overview.categoryCounts.reduce((map, entry) => {
      map[entry.category_id] = entry;
      return map;
    }, {});

    return {
      event,
      canManage: MANAGEMENT_ROLES.includes(event.role),
      template: buildPassPrintTemplateFromEvent(event, t),
      variableDefinitions: getPassPrintVariableDefinitions(t),
      summary: overview.summary,
      categories: categories.map((category) => ({
        ...category,
        total_requests: Number(categoryCountMap[Number(category.id)]?.total_requests || 0),
      })),
    };
  }

  async savePassPrintTemplate(eventId, actorId, payload, backgroundImage, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.event.editRequiresManager'), 403);
    }

    const templateFields = sanitizePassPrintTemplateFields(payload.templateFields, tx);
    const templateName = String(payload.templateName || '').trim().slice(0, 160) || tx('passPrint.defaultTemplateName');
    const backgroundRotation = normalizePassPrintRotation(payload.backgroundRotation);
    const orientation = normalizePassPrintOrientation(payload.templateOrientation);
    const removeBackground = Boolean(payload.removeBackground);
    let backgroundPath = removeBackground ? '' : (event.pass_print_template_background_path || '');
    let replacedBackgroundPath = '';

    if (backgroundImage?.buffer?.length) {
      const fileExtension = PASS_PRINT_BACKGROUND_MIME_TYPES.get(backgroundImage.mimetype);

      if (!fileExtension) {
        throw new AppError(tx('service.passPrint.backgroundInvalid'), 422);
      }

      const relativePath = path.posix.join(
        'uploads',
        'pass-print-templates',
        `event-${eventId}`,
        `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${fileExtension}`,
      );
      const absolutePath = buildPassPrintTemplateAbsolutePath(relativePath);

      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, backgroundImage.buffer);
      replacedBackgroundPath = event.pass_print_template_background_path || '';
      backgroundPath = relativePath;
    } else if (removeBackground) {
      replacedBackgroundPath = event.pass_print_template_background_path || '';
      backgroundPath = '';
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.eventRepository.updatePassPrintTemplate(connection, eventId, {
        name: templateName,
        backgroundPath: backgroundPath || null,
        backgroundRotation,
        orientation,
        fieldsJson: JSON.stringify(templateFields),
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'event',
          entityId: eventId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.passPrintTemplateUpdated', {
            name: event.name,
          }),
          beforeState: {
            passPrintTemplateName: event.pass_print_template_name || null,
            hasPassPrintBackground: Boolean(event.pass_print_template_background_path),
            passPrintFieldCount: parsePassPrintTemplateFields(event.pass_print_template_fields_json).length,
          },
          afterState: {
            passPrintTemplateName: templateName,
            hasPassPrintBackground: Boolean(backgroundPath),
            passPrintFieldCount: templateFields.length,
          },
          metadata: buildAuditMetadata('audit.message.passPrintTemplateUpdated', {
            name: event.name,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();

      if (backgroundPath && backgroundPath !== event.pass_print_template_background_path) {
        await unlinkPassPrintTemplateFile(backgroundPath);
      }

      throw error;
    } finally {
      connection.release();
    }

    if (replacedBackgroundPath && replacedBackgroundPath !== backgroundPath) {
      await unlinkPassPrintTemplateFile(replacedBackgroundPath);
    }

    return {
      event: await this.eventService.getEventAccessOrFail(eventId, actorId, tx),
      template: {
        name: templateName,
        backgroundPath,
        backgroundUrl: buildPassPrintTemplatePublicUrl(backgroundPath),
        backgroundRotation,
        orientation,
        fields: templateFields,
      },
    };
  }

  async previewPassPrintPdf(eventId, actorId, payload, backgroundImage, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.event.editRequiresManager'), 403);
    }

    const templateFields = sanitizePassPrintTemplateFields(payload.templateFields, tx);
    const backgroundRotation = normalizePassPrintRotation(payload.backgroundRotation);
    const orientation = normalizePassPrintOrientation(payload.templateOrientation);
    const removeBackground = Boolean(payload.removeBackground);
    let backgroundPath = removeBackground ? '' : (event.pass_print_template_background_path || '');
    let backgroundBuffer = null;

    if (backgroundImage?.buffer?.length) {
      const fileExtension = PASS_PRINT_BACKGROUND_MIME_TYPES.get(backgroundImage.mimetype);

      if (!fileExtension) {
        throw new AppError(tx('service.passPrint.backgroundInvalid'), 422);
      }

      backgroundBuffer = backgroundImage.buffer;
      backgroundPath = '';
    }

    const requests = await this.requestRepository.listAdminRequests(
      eventId,
      'pass',
      { sort: 'newest' },
      { limit: 1, randomOrder: true },
    );

    if (!requests.length) {
      throw new AppError(tx('service.passPrint.noRequests'), 422);
    }

    const request = requests[0];
    const timestamp = dayjs().format('YYYYMMDD-HHmm');
    const baseFileName = sanitizeFileName(`${event.name}-preview-${request.id}-${timestamp}`);

    return {
      buffer: await buildPassPrintPdfBuffer({
        event,
        requests: [request],
        template: {
          backgroundPath,
          backgroundBuffer,
          backgroundRotation,
          orientation,
          fields: templateFields,
        },
      }),
      filename: `${baseFileName}.pdf`,
      contentType: 'application/pdf',
    };
  }

  async exportPassPrintPdf(eventId, actorId, filters, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);
    const categories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const categoryId = filters.categoryId ? Number(filters.categoryId) : null;
    const selectedCategory = categoryId
      ? categories.find((category) => Number(category.id) === categoryId)
      : null;

    if (categoryId && !selectedCategory) {
      throw new AppError(tx('service.passPrint.categoryInvalid'), 404);
    }

    const template = buildPassPrintTemplateFromEvent(event, tx);

    if (!template.fields.length) {
      throw new AppError(tx('service.passPrint.templateMissing'), 422);
    }

    const requests = await this.requestRepository.listAdminRequests(eventId, 'pass', {
      categoryId: selectedCategory ? Number(selectedCategory.id) : null,
      sort: 'newest',
    });

    if (!requests.length) {
      throw new AppError(tx('service.passPrint.noRequests'), 422);
    }

    const timestamp = dayjs().format('YYYYMMDD-HHmm');
    const categoryLabel = selectedCategory ? selectedCategory.name : tx('passPrint.printAllTypes');
    const baseFileName = sanitizeFileName(`${event.name}-${categoryLabel}-${timestamp}`);

    return {
      buffer: await buildPassPrintPdfBuffer({
        event,
        requests,
        template,
      }),
      filename: `${baseFileName}.pdf`,
      contentType: 'application/pdf',
    };
  }

  async printSelectedPassRequests(eventId, actorId, requestIds, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.event.editRequiresManager'), 403);
    }

    const normalizedIds = [...new Set((requestIds || []).map((requestId) => Number(requestId)).filter((requestId) => Number.isInteger(requestId) && requestId > 0))];

    if (!normalizedIds.length) {
      throw new AppError(tx('service.passPrint.noSelectedRequests'), 422);
    }

    const template = buildPassPrintTemplateFromEvent(event, tx);

    if (!template.fields.length) {
      throw new AppError(tx('service.passPrint.templateMissing'), 422);
    }

    const requests = await this.requestRepository.findByIds('pass', normalizedIds);
    const requestsById = new Map(requests.map((request) => [Number(request.id), request]));
    const orderedRequests = normalizedIds.map((requestId) => requestsById.get(Number(requestId))).filter(Boolean);

    if (orderedRequests.length !== normalizedIds.length) {
      throw new AppError(tx('service.passPrint.requestsMissing'), 404);
    }

    if (orderedRequests.some((request) => Number(request.event_id) !== Number(eventId))) {
      throw new AppError(tx('service.passPrint.requestsMissing'), 404);
    }

    const timestamp = dayjs().format('YYYYMMDD-HHmm');
    const baseFileName = sanitizeFileName(`${event.name}-selected-passes-${timestamp}`);
    const buffer = await buildPassPrintPdfBuffer({
      event,
      requests: orderedRequests,
      template,
    });

    const requestIdsToMark = orderedRequests
      .filter((request) => resolveRequestDisplayState('pass', request) !== 'handed_out')
      .map((request) => Number(request.id));

    if (requestIdsToMark.length) {
      const connection = await this.pool.getConnection();

      try {
        await connection.beginTransaction();
        await this.requestRepository.setStatuses(connection, 'pass', requestIdsToMark, {
          status: 'handed_out',
          userId: actorId,
        });

        for (const request of orderedRequests.filter((entry) => requestIdsToMark.includes(Number(entry.id)))) {
          await this.auditLogService.record(
            {
              eventId,
              userId: actorId,
              entityType: 'pass_request',
              entityId: request.id,
              action: 'status_updated',
              message: translate(DEFAULT_LOCALE, 'audit.message.requestStatusUpdated', {
                type: translate(DEFAULT_LOCALE, 'accessType.pass'),
                name: request.full_name,
                status: translate(DEFAULT_LOCALE, 'statuses.handed_out'),
              }),
              beforeState: request,
              afterState: {
                status: 'handed_out',
                statusUpdatedAt: new Date().toISOString(),
                statusUpdatedByUserId: actorId,
              },
              metadata: buildAuditMetadata('audit.message.requestStatusUpdated', {
                type: tx('accessType.pass'),
                name: request.full_name,
                status: tx('statuses.handed_out'),
              }),
            },
            connection,
          );
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }

    const updatedRequests = requestIdsToMark.length
      ? await Promise.all(requestIdsToMark.map((requestId) => this.requestRepository.findById('pass', requestId)))
      : [];
    const summary = await this.requestRepository.getAdminSummary(eventId, 'pass');

    return {
      event,
      updatedRequests: updatedRequests.filter(Boolean),
      summary,
      file: {
        buffer,
        filename: `${baseFileName}.pdf`,
        contentType: 'application/pdf',
      },
    };
  }

  async getRequestHistory(eventId, actorId, type, requestId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (type !== 'pass') {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    const request = await this.requestRepository.findById(type, requestId);

    if (!request || Number(request.event_id) !== Number(event.id)) {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    const movements = await this.requestRepository.listPassVehicleMovements(requestId, REQUEST_HISTORY_LIMIT);

    return {
      event,
      request,
      movements,
      historyLimit: REQUEST_HISTORY_LIMIT,
    };
  }

  async getRequestProfilesPage(eventId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const applicationToken = await this.ensureRequestProfileApplicationToken(event);
    const passCategories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const wristbandCategories = await this.categoryRepository.listByEvent(eventId, 'wristband');
    const [profiles, pendingApplicationCount] = await Promise.all([
      this.requestProfileRepository.listByEvent(eventId),
      this.requestProfileApplicationRepository.countPendingByEvent(eventId),
    ]);

    const enrichedProfiles = await Promise.all(
      profiles.map(async (rawProfile) => {
        const profile = await this.ensureRequestProfileAccessCode(rawProfile);
        const isUnlimitedQuota = Boolean(profile.is_unlimited_quota);
        let passQuotaUsage = [];
        let wristbandQuotaUsage = [];
        let passTotals;
        let wristbandTotals;

        if (isUnlimitedQuota) {
          const [passRequests, wristbandRequests] = await Promise.all([
            this.requestRepository.listProfileRequests(profile.id, 'pass'),
            this.requestRepository.listProfileRequests(profile.id, 'wristband'),
          ]);

          passQuotaUsage = buildUnlimitedQuotaUsage(
            passCategories.filter((category) => Number(category.is_active) === 1),
            passRequests,
          );
          wristbandQuotaUsage = buildUnlimitedQuotaUsage(
            wristbandCategories.filter((category) => Number(category.is_active) === 1),
            wristbandRequests,
          );
          passTotals = buildUnlimitedQuotaTotals(passQuotaUsage);
          wristbandTotals = buildUnlimitedQuotaTotals(wristbandQuotaUsage);
        } else {
          [passQuotaUsage, wristbandQuotaUsage] = await Promise.all([
            this.requestRepository.listQuotaUsage(profile.id, 'pass').then(withRemainingQuota),
            this.requestRepository.listQuotaUsage(profile.id, 'wristband').then(withRemainingQuota),
          ]);
          passTotals = buildQuotaTotals(passQuotaUsage);
          wristbandTotals = buildQuotaTotals(wristbandQuotaUsage);
        }

        return {
          ...profile,
          invite_url: buildInviteUrl(profile.access_code),
          passQuotaUsage,
          wristbandQuotaUsage,
          passTotals,
          wristbandTotals,
          passQuotaMap: buildQuotaMap(passQuotaUsage),
          wristbandQuotaMap: buildQuotaMap(wristbandQuotaUsage),
        };
      }),
    );
    const profileCategoryStats = {
      pass: buildProfileCategoryStats(passCategories, enrichedProfiles, 'passQuotaUsage'),
      wristband: buildProfileCategoryStats(wristbandCategories, enrichedProfiles, 'wristbandQuotaUsage'),
    };

    return {
      event,
      passCategories,
      wristbandCategories,
      profiles: enrichedProfiles,
      profileCategoryStats,
      profileApplicationUrl: buildRequestProfileApplicationUrl(applicationToken),
      pendingApplicationCount,
    };
  }

  async getRequestProfileApplicationsPage(eventId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const applicationToken = await this.ensureRequestProfileApplicationToken(event);
    const [passCategories, wristbandCategories, applications, pendingApplicationCount] = await Promise.all([
      this.categoryRepository.listByEvent(eventId, 'pass'),
      this.categoryRepository.listByEvent(eventId, 'wristband'),
      this.requestProfileApplicationRepository.listByEvent(eventId),
      this.requestProfileApplicationRepository.countPendingByEvent(eventId),
    ]);

    return {
      event,
      passCategories,
      wristbandCategories,
      profileApplicationUrl: buildRequestProfileApplicationUrl(applicationToken),
      profileApplications: applications.map((application) => ({
        ...application,
        requestedPassQuotaMap: buildQuotaValueMap(application.requested_pass_quota),
        requestedWristbandQuotaMap: buildQuotaValueMap(application.requested_wristband_quota),
        requestedPassSummary: buildQuotaSummary(application.requested_pass_quota, passCategories),
        requestedWristbandSummary: buildQuotaSummary(application.requested_wristband_quota, wristbandCategories),
      })),
      pendingApplicationCount,
    };
  }

  async getRequestProfileApplicationForm(token, t) {
    const tx = resolveTranslate(t);
    const normalizedToken = String(token || '').trim();

    if (!normalizedToken) {
      throw new AppError(tx('service.requestProfileApplication.linkInvalid'), 404);
    }

    const event = await this.eventRepository.findByRequestProfileApplicationToken(normalizedToken);

    if (!event) {
      throw new AppError(tx('service.requestProfileApplication.linkInvalid'), 404);
    }

    const [passCategories, wristbandCategories] = await Promise.all([
      this.categoryRepository.listByEvent(event.id, 'pass'),
      this.categoryRepository.listByEvent(event.id, 'wristband'),
    ]);

    return {
      event,
      token: normalizedToken,
      passCategories: passCategories.filter((category) => Number(category.is_active) === 1),
      wristbandCategories: wristbandCategories.filter((category) => Number(category.is_active) === 1),
    };
  }

  async submitRequestProfileApplication(token, payload, t) {
    const tx = resolveTranslate(t);
    const form = await this.getRequestProfileApplicationForm(token, tx);
    const profileName = String(payload.profileName || '').trim();
    const contactEmail = normalizeEmail(payload.contactEmail);
    const contactPhone = String(payload.contactPhone || '').trim();
    const notes = String(payload.notes || '').trim();
    const {
      passCategories,
      wristbandCategories,
      passQuotas,
      wristbandQuotas,
    } = await this.normalizeProfileApplicationQuotas(
      form.event.id,
      payload,
      tx,
    );

    if (!profileName || !contactEmail || !contactPhone) {
      throw new AppError(tx('service.requestProfileApplication.contactRequired'), 422);
    }

    await this.assertRequestProfileIdentityAvailable(form.event.id, {
      profileName,
      contactEmail,
      messageKey: 'service.requestProfileApplication.duplicate',
      applicationMessageKey: 'service.requestProfileApplication.duplicate',
    }, tx);

    const applicationId = await this.requestProfileApplicationRepository.create({
      eventId: form.event.id,
      profileName,
      contactEmail,
      contactPhone,
      notes: notes || null,
      passQuotas,
      wristbandQuotas,
    });

    await this.notifyManagersAboutRequestProfileApplication(form.event, {
      applicationId,
      profileName,
      contactEmail,
      contactPhone,
      notes,
      passQuotas,
      wristbandQuotas,
      passCategories,
      wristbandCategories,
    });

    return form;
  }

  async notifyManagersAboutRequestProfileApplication(event, application) {
    if (!this.systemService) {
      return;
    }

    try {
      const recipients = await this.eventRepository.listManagementEmailRecipients(event.id);
      const uniqueRecipients = Array.from(
        recipients.reduce((map, recipient) => {
          const email = normalizeEmail(recipient.email);

          if (email && !map.has(email)) {
            map.set(email, {
              ...recipient,
              email,
            });
          }

          return map;
        }, new Map()).values(),
      );

      if (!uniqueRecipients.length) {
        return;
      }

      const passSummary = buildRequestedQuotaText(application.passQuotas, application.passCategories);
      const wristbandSummary = buildRequestedQuotaText(application.wristbandQuotas, application.wristbandCategories);
      const applicationsUrl = buildRequestProfileApplicationsAdminUrl(event.id);
      const notes = String(application.notes || '').trim() || '-';
      const submittedAt = dayjs().format('YYYY-MM-DD HH:mm');
      const results = await Promise.allSettled(
        uniqueRecipients.map((recipient) => this.systemService.sendProfileApplicationNotification({
          to: recipient.email,
          recipientName: recipient.full_name || 'Admin',
          eventName: event.name,
          applicationId: application.applicationId,
          profileName: application.profileName,
          contactEmail: application.contactEmail,
          contactPhone: application.contactPhone,
          passSummary,
          wristbandSummary,
          notes,
          submittedAt,
          applicationsUrl,
        })),
      );
      const failedCount = results.filter((result) => result.status === 'rejected').length;

      if (failedCount) {
        console.warn(`Profile application notification failed for ${failedCount} recipient(s).`);
      }
    } catch (error) {
      console.warn('Profile application notification failed:', error.message);
    }
  }

  async approveRequestProfileApplication(eventId, applicationId, actorId, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const application = await this.requestProfileApplicationRepository.findById(applicationId);

    if (!application || Number(application.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.requestProfileApplication.notFound'), 404);
    }

    if (application.status !== 'pending') {
      throw new AppError(tx('service.requestProfileApplication.alreadyReviewed'), 409);
    }

    const {
      passCategories,
      wristbandCategories,
      passQuotas,
      wristbandQuotas,
    } = await this.normalizeProfileApplicationQuotas(eventId, payload, tx);
    const accessCode = await this.generateUniqueAccessCode();
    const accessCodeHash = await hashPassword(accessCode);
    const maxPeople = [...passQuotas, ...wristbandQuotas].reduce((sum, entry) => sum + entry.quota, 0) || 1;
    const hasEditedNotes = Object.prototype.hasOwnProperty.call(payload, 'notes') && payload.notes !== undefined;
    const profileName = String(payload.profileName || application.profile_name || '').trim();
    const contactEmail = normalizeEmail(payload.contactEmail || application.contact_email);
    const contactPhone = String(payload.contactPhone || application.contact_phone || '').trim();
    const notes = String(hasEditedNotes ? payload.notes || '' : application.notes || '').trim();

    if (!profileName || !contactEmail || !contactPhone) {
      throw new AppError(tx('service.requestProfileApplication.contactRequired'), 422);
    }

    await this.assertRequestProfileIdentityAvailable(eventId, {
      profileName,
      contactEmail,
      excludeApplicationId: applicationId,
      applicationStatuses: ['approved'],
      messageKey: 'service.requestProfile.duplicate',
      applicationMessageKey: 'service.requestProfile.duplicate',
    }, tx);

    const connection = await this.pool.getConnection();
    let profileId;

    try {
      await connection.beginTransaction();

      profileId = await this.requestProfileRepository.create(connection, {
        eventId,
        userId: actorId,
        name: profileName,
        publicSlug: uuidv4(),
        accessCode,
        accessCodeHash,
        maxPeople,
        isUnlimitedQuota: false,
        contactEmail,
        contactPhone,
        notifyContactOnCreate: true,
        notes: notes || null,
        isActive: 1,
      });

      await this.requestProfileRepository.replaceQuotas(connection, profileId, 'pass', passQuotas);
      await this.requestProfileRepository.replaceQuotas(connection, profileId, 'wristband', wristbandQuotas);

      const affectedRows = await this.requestProfileApplicationRepository.approve(connection, applicationId, {
        profileId,
        userId: actorId,
        profileName,
        contactEmail,
        contactPhone,
        notes: notes || null,
        passQuotas,
        wristbandQuotas,
      });

      if (!affectedRows) {
        throw new AppError(tx('service.requestProfileApplication.alreadyReviewed'), 409);
      }

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'request_profile',
          entityId: profileId,
          action: 'created',
          message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileApplicationApproved', {
            name: profileName,
          }),
          afterState: {
            applicationId: Number(applicationId),
            name: profileName,
            contactEmail,
            contactPhone,
            passQuotas,
            wristbandQuotas,
          },
          metadata: buildAuditMetadata('audit.message.requestProfileApplicationApproved', {
            name: profileName,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    let inviteEmail = null;

    if (contactEmail) {
      try {
        const profile = await this.requestProfileRepository.findById(profileId);
        inviteEmail = await this.deliverRequestProfileInvite(event, profile, tx);
      } catch (error) {
        console.warn('Profile invite email failed:', error.message);
        inviteEmail = {
          sent: false,
          error: tx('service.requestProfile.inviteEmailFailed'),
        };
      }
    }

    return {
      profileId,
      accessCode,
      inviteEmail,
    };
  }

  async rejectRequestProfileApplication(eventId, applicationId, actorId, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const application = await this.requestProfileApplicationRepository.findById(applicationId);

    if (!application || Number(application.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.requestProfileApplication.notFound'), 404);
    }

    if (application.status !== 'pending') {
      throw new AppError(tx('service.requestProfileApplication.alreadyReviewed'), 409);
    }

    const affectedRows = await this.requestProfileApplicationRepository.reject(applicationId, {
      userId: actorId,
      reason: String(payload.reason || '').trim() || null,
    });

    if (!affectedRows) {
      throw new AppError(tx('service.requestProfileApplication.alreadyReviewed'), 409);
    }

    await this.notifyApplicantAboutRequestProfileRejection(event, application, {
      reason: String(payload.reason || '').trim() || null,
      t: tx,
    });

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'request_profile_application',
      entityId: applicationId,
      action: 'updated',
      message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileApplicationRejected', {
        name: application.profile_name,
      }),
      beforeState: application,
      afterState: {
        status: 'rejected',
        reason: String(payload.reason || '').trim() || null,
      },
      metadata: buildAuditMetadata('audit.message.requestProfileApplicationRejected', {
        name: application.profile_name,
      }),
    });
  }

  async notifyApplicantAboutRequestProfileRejection(event, application, payload = {}) {
    if (!this.systemService) {
      return;
    }

    const contactEmail = normalizeEmail(application.contact_email);

    if (!contactEmail) {
      return;
    }

    try {
      await this.systemService.sendProfileApplicationRejected({
        to: contactEmail,
        eventName: event.name,
        profileName: String(application.profile_name || '').trim(),
        contactEmail,
        contactPhone: String(application.contact_phone || '').trim() || '-',
        rejectionReason: payload.reason || payload.t('requestProfileApplications.rejectionReasonDefault'),
      });
    } catch (error) {
      console.warn('Profile application rejection email failed:', error.message);
    }
  }

  async createRequestProfile(eventId, actorId, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const isUnlimitedQuota = Boolean(payload.unlimitedQuota);
    const passCategories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const wristbandCategories = await this.categoryRepository.listByEvent(eventId, 'wristband');
    const passQuotas = normalizeQuotaEntriesForCategories(payload.passQuota, passCategories);
    const wristbandQuotas = normalizeQuotaEntriesForCategories(
      payload.wristbandQuota,
      wristbandCategories,
    );
    const validPassIds = new Set(passCategories.map((category) => Number(category.id)));
    const validWristbandIds = new Set(wristbandCategories.map((category) => Number(category.id)));
    const sanitizedPassQuotas = passQuotas.filter((entry) => validPassIds.has(Number(entry.categoryId)));
    const sanitizedWristbandQuotas = wristbandQuotas.filter(
      (entry) => validWristbandIds.has(Number(entry.categoryId)),
    );

    if (!isUnlimitedQuota && !hasAssignedRequestProfileQuota(sanitizedPassQuotas, sanitizedWristbandQuotas)) {
      throw new AppError(tx('service.requestProfile.quotaRequired'), 422);
    }

    const profileName = String(payload.name || '').trim();
    const contactEmail = normalizeEmail(payload.contactEmail);

    await this.assertRequestProfileIdentityAvailable(eventId, {
      name: profileName,
      contactEmail,
      messageKey: 'service.requestProfile.duplicate',
      applicationMessageKey: 'service.requestProfile.duplicate',
    }, tx);

    const accessCode = await this.generateUniqueAccessCode();
    const accessCodeHash = await hashPassword(accessCode);
    const maxPeople = isUnlimitedQuota
      ? 0
      : [...sanitizedPassQuotas, ...sanitizedWristbandQuotas]
        .reduce((sum, entry) => sum + entry.quota, 0) || 1;

    let inviteEmail = null;
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const profileId = await this.requestProfileRepository.create(connection, {
        eventId,
        userId: actorId,
        name: profileName,
        publicSlug: uuidv4(),
        accessCode,
        accessCodeHash,
        maxPeople,
        isUnlimitedQuota,
        contactEmail,
        contactPhone: payload.contactPhone ? payload.contactPhone.trim() : null,
        notifyContactOnCreate: payload.notifyContactOnCreate,
        notes: payload.notes || null,
        isActive: payload.isActive ? 1 : 0,
      });

      await this.requestProfileRepository.replaceQuotas(
        connection,
        profileId,
        'pass',
        sanitizedPassQuotas,
      );
      await this.requestProfileRepository.replaceQuotas(
        connection,
        profileId,
        'wristband',
        sanitizedWristbandQuotas,
      );

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'request_profile',
          entityId: profileId,
          action: 'created',
          message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileCreated', { name: payload.name }),
          afterState: {
            name: profileName,
            notes: payload.notes || null,
            isActive: payload.isActive ? 1 : 0,
            contactEmail,
            contactPhone: payload.contactPhone ? payload.contactPhone.trim() : null,
            notifyContactOnCreate: payload.notifyContactOnCreate ? 1 : 0,
            isUnlimitedQuota: isUnlimitedQuota ? 1 : 0,
            passQuotas: sanitizedPassQuotas,
            wristbandQuotas: sanitizedWristbandQuotas,
          },
          metadata: buildAuditMetadata('audit.message.requestProfileCreated', {
            name: payload.name,
          }),
        },
        connection,
      );

      await connection.commit();

      if (payload.notifyContactOnCreate && normalizeEmail(payload.contactEmail)) {
        try {
          const profile = await this.requestProfileRepository.findById(profileId);
          inviteEmail = await this.deliverRequestProfileInvite(event, profile, tx);
        } catch (error) {
          // Do not roll back a successfully saved profile because email delivery failed.
          console.warn('Profile invite email failed:', error.message);
          inviteEmail = {
            sent: false,
            error: tx('service.requestProfile.inviteEmailFailed'),
          };
        }
      }

      return {
        profileId,
        accessCode,
        inviteEmail,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateRequestProfile(eventId, profileId, actorId, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const existingProfile = await this.requestProfileRepository.findById(profileId);

    if (!existingProfile || Number(existingProfile.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.requestProfile.notFound'), 404);
    }

    const isUnlimitedQuota = Boolean(payload.unlimitedQuota);
    const passCategories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const wristbandCategories = await this.categoryRepository.listByEvent(eventId, 'wristband');
    const passQuotas = normalizeQuotaEntriesForCategories(payload.passQuota, passCategories);
    const wristbandQuotas = normalizeQuotaEntriesForCategories(
      payload.wristbandQuota,
      wristbandCategories,
    );
    const validPassIds = new Set(passCategories.map((category) => Number(category.id)));
    const validWristbandIds = new Set(wristbandCategories.map((category) => Number(category.id)));
    const sanitizedPassQuotas = passQuotas.filter((entry) => validPassIds.has(Number(entry.categoryId)));
    const sanitizedWristbandQuotas = wristbandQuotas.filter(
      (entry) => validWristbandIds.has(Number(entry.categoryId)),
    );

    if (!isUnlimitedQuota && !hasAssignedRequestProfileQuota(sanitizedPassQuotas, sanitizedWristbandQuotas)) {
      throw new AppError(tx('service.requestProfile.quotaRequired'), 422);
    }

    const profileName = String(payload.name || '').trim();
    const contactEmail = normalizeEmail(payload.contactEmail);

    await this.assertRequestProfileIdentityAvailable(eventId, {
      name: profileName,
      contactEmail,
      excludeProfileId: profileId,
      includeApplications: false,
      messageKey: 'service.requestProfile.duplicate',
    }, tx);

    const maxPeople = isUnlimitedQuota
      ? 0
      : [...sanitizedPassQuotas, ...sanitizedWristbandQuotas]
        .reduce((sum, entry) => sum + entry.quota, 0) || 1;

    let inviteEmail = null;
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      await this.requestProfileRepository.update(connection, profileId, {
        userId: actorId,
        name: profileName,
        maxPeople,
        isUnlimitedQuota,
        contactEmail,
        contactPhone: payload.contactPhone ? payload.contactPhone.trim() : null,
        notifyContactOnCreate: payload.notifyContactOnCreate,
        notes: payload.notes || null,
        isActive: payload.isActive ? 1 : 0,
      });

      if (!isUnlimitedQuota) {
        await this.requestProfileRepository.replaceQuotas(
          connection,
          profileId,
          'pass',
          sanitizedPassQuotas,
        );
        await this.requestProfileRepository.replaceQuotas(
          connection,
          profileId,
          'wristband',
          sanitizedWristbandQuotas,
        );
      }

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'request_profile',
          entityId: profileId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileUpdated', { name: payload.name }),
          beforeState: existingProfile,
          afterState: {
            name: profileName,
            notes: payload.notes || null,
            isActive: payload.isActive ? 1 : 0,
            contactEmail,
            contactPhone: payload.contactPhone ? payload.contactPhone.trim() : null,
            notifyContactOnCreate: payload.notifyContactOnCreate ? 1 : 0,
            isUnlimitedQuota: isUnlimitedQuota ? 1 : 0,
            passQuotas: sanitizedPassQuotas,
            wristbandQuotas: sanitizedWristbandQuotas,
          },
          metadata: buildAuditMetadata('audit.message.requestProfileUpdated', {
            name: payload.name,
          }),
        },
        connection,
      );

      await connection.commit();

      if (payload.notifyContactOnCreate && normalizeEmail(payload.contactEmail)) {
        try {
          const profile = await this.requestProfileRepository.findById(profileId);
          inviteEmail = await this.deliverRequestProfileInvite(event, profile, tx);
        } catch (error) {
          console.warn('Profile invite email failed:', error.message);
          inviteEmail = {
            sent: false,
            error: tx('service.requestProfile.inviteEmailFailed'),
          };
        }
      }

      return {
        profileId,
        inviteEmail,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteRequestProfile(eventId, profileId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const existingProfile = await this.requestProfileRepository.findById(profileId);

    if (!existingProfile || Number(existingProfile.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.requestProfile.notFound'), 404);
    }

    await this.requestProfileRepository.delete(profileId, actorId);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'request_profile',
      entityId: profileId,
      action: 'deleted',
      message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileDeleted', { name: existingProfile.name }),
      beforeState: existingProfile,
      metadata: buildAuditMetadata('audit.message.requestProfileDeleted', {
        name: existingProfile.name,
      }),
    });
  }

  async regenerateRequestProfileCode(eventId, profileId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const existingProfile = await this.requestProfileRepository.findById(profileId);

    if (!existingProfile || Number(existingProfile.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.requestProfile.notFound'), 404);
    }

    const accessCode = await this.generateUniqueAccessCode();
    const accessCodeHash = await hashPassword(accessCode);
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      await this.requestProfileRepository.updateAccessCode(connection, profileId, {
        accessCode,
        accessCodeHash,
        userId: actorId,
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'request_profile',
          entityId: profileId,
          action: 'code_regenerated',
          message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileCodeRegenerated', {
            name: existingProfile.name,
          }),
          metadata: buildAuditMetadata('audit.message.requestProfileCodeRegenerated', {
            name: existingProfile.name,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return accessCode;
  }

  async updateRequestStatus(eventId, requestId, actorId, type, status, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);
    const existingRequest = await this.requestRepository.findById(type, requestId);

    if (!existingRequest || Number(existingRequest.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    await this.requestRepository.setStatus(type, requestId, {
      status,
      userId: actorId,
    });

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: `${type}_request`,
      entityId: requestId,
      action: 'status_updated',
      message: translate(DEFAULT_LOCALE, 'audit.message.requestStatusUpdated', {
        type: translate(DEFAULT_LOCALE, `accessType.${type}`),
        name: existingRequest.full_name,
        status: translate(DEFAULT_LOCALE, `statuses.${status}`),
      }),
      beforeState: existingRequest,
      afterState: {
        status,
        statusUpdatedAt: new Date().toISOString(),
        statusUpdatedByUserId: actorId,
      },
      metadata: buildAuditMetadata('audit.message.requestStatusUpdated', {
        type: tx(`accessType.${type}`),
        name: existingRequest.full_name,
        status: tx(`statuses.${status}`),
      }),
    });

    const request = await this.requestRepository.findById(type, requestId);
    const summary = await this.requestRepository.getAdminSummary(eventId, type);

    return {
      event,
      request,
      summary,
    };
  }

  async registerPassRequestMovement(eventId, requestId, actorId, direction, t) {
    const tx = resolveTranslate(t);
    await this.eventService.getEventAccessOrFail(eventId, actorId, tx);
    const existingRequest = await this.requestRepository.findById('pass', requestId);
    const normalizedDirection = direction === 'exit' ? 'exit' : 'entry';

    if (!existingRequest || Number(existingRequest.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    const vehiclePlate = formatVehiclePlate(existingRequest.vehicle_plate);
    const vehiclePlateNormalized = normalizeVehiclePlate(vehiclePlate);

    if (!vehiclePlateNormalized) {
      throw new AppError(tx('validation.portal.vehiclePlateLength', { min: 2, max: 20 }), 422);
    }

    const entryWindowDecision = await this.getPassCategoryEntryWindowDecision(
      existingRequest.category_id,
      normalizedDirection,
      tx,
    );

    if (!entryWindowDecision.allowed) {
      throw new AppError(entryWindowDecision.message, 409);
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.requestRepository.registerPassVehicleMovement(connection, existingRequest.id, {
        eventId: Number(eventId),
        vehiclePlate,
        vehiclePlateNormalized,
        gateName: null,
        source: 'admin-table',
        metadata: null,
        direction: normalizedDirection,
        statusUpdatedByUserId: actorId,
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'pass_request',
          entityId: existingRequest.id,
          action: 'updated',
          message: translate(
            DEFAULT_LOCALE,
            normalizedDirection === 'exit' ? 'audit.message.vehicleExitRegistered' : 'audit.message.vehicleEntryRegistered',
            {
              plate: vehiclePlate,
              name: existingRequest.full_name,
            },
          ),
          beforeState: {
            enteredAt: existingRequest.entered_at || null,
            lastEntryAt: existingRequest.last_entry_at || null,
            lastExitAt: existingRequest.last_exit_at || null,
          },
          afterState: {
            plate: vehiclePlate,
            direction: normalizedDirection,
            source: 'admin-table',
          },
          metadata: buildAuditMetadata(
            normalizedDirection === 'exit' ? 'audit.message.vehicleExitRegistered' : 'audit.message.vehicleEntryRegistered',
            {
              plate: vehiclePlate,
              name: existingRequest.full_name,
            },
          ),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const request = await this.requestRepository.findById('pass', existingRequest.id);

    return {
      eventId: Number(eventId),
      request,
      direction: normalizedDirection,
      currentPresence: resolveVehiclePresenceStatus(request),
      performedAt: normalizedDirection === 'exit' ? request.last_exit_at : request.last_entry_at,
    };
  }

  async createAdminRequest(eventId, actorId, type, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);
    const normalizedPayload = {
      ...buildRequestPayload(payload),
      requestProfileId: payload.requestProfileId ? Number(payload.requestProfileId) : null,
    };

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.request.manage'), 403);
    }

    const category = await this.categoryRepository.findById(type, normalizedPayload.categoryId);

    if (!category || Number(category.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.request.typeInvalid'), 422);
    }

    let profile = null;

    if (normalizedPayload.requestProfileId) {
      profile = await this.requestProfileRepository.findById(normalizedPayload.requestProfileId);

      if (!profile || Number(profile.event_id) !== Number(eventId)) {
        throw new AppError(tx('service.request.profileInvalid'), 422);
      }
    }

    assertPassVehiclePlateRequired(type, normalizedPayload.vehiclePlateNormalized, tx);
    await this.assertVehiclePlateAvailable(eventId, type, normalizedPayload.vehiclePlateNormalized, null, tx);

    let requestId = null;
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      requestId = await this.requestRepository.create(connection, type, {
        eventId,
        requestProfileId: normalizedPayload.requestProfileId || null,
        categoryId: normalizedPayload.categoryId,
        fullName: normalizedPayload.fullName,
        companyName: normalizedPayload.companyName,
        phone: normalizedPayload.phone,
        email: normalizedPayload.email,
        vehiclePlate: normalizedPayload.vehiclePlate,
        vehiclePlateNormalized: normalizedPayload.vehiclePlateNormalized,
        notes: normalizedPayload.notes,
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: `${type}_request`,
          entityId: requestId,
          action: 'created',
          message: translate(DEFAULT_LOCALE, 'audit.message.portalRequestCreated', {
            type: translate(DEFAULT_LOCALE, `accessType.${type}`),
            name: normalizedPayload.fullName,
          }),
          afterState: {
            ...normalizedPayload,
            categoryName: category.name,
            profileName: profile?.name || null,
          },
          metadata: buildAuditMetadata('audit.message.portalRequestCreated', {
            type: tx(`accessType.${type}`),
            name: normalizedPayload.fullName,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [request, summary] = await Promise.all([
      this.requestRepository.findById(type, requestId),
      this.requestRepository.getAdminSummary(eventId, type),
    ]);

    return {
      event,
      request,
      summary,
    };
  }

  async updateAdminRequest(eventId, requestId, actorId, type, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);
    const normalizedPayload = {
      ...buildRequestPayload(payload),
      requestProfileId: payload.requestProfileId ? Number(payload.requestProfileId) : null,
    };

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.request.manage'), 403);
    }

    const existingRequest = await this.requestRepository.findById(type, requestId);

    if (!existingRequest || Number(existingRequest.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    const category = await this.categoryRepository.findById(type, normalizedPayload.categoryId);

    if (!category || Number(category.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.request.typeInvalid'), 422);
    }

    let profile = null;

    if (normalizedPayload.requestProfileId) {
      profile = await this.requestProfileRepository.findById(normalizedPayload.requestProfileId);

      if (!profile || Number(profile.event_id) !== Number(eventId)) {
        throw new AppError(tx('service.request.profileInvalid'), 422);
      }
    }

    assertPassVehiclePlateRequired(type, normalizedPayload.vehiclePlateNormalized, tx);
    await this.assertVehiclePlateAvailable(
      eventId,
      type,
      normalizedPayload.vehiclePlateNormalized,
      requestId,
      tx,
    );

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.requestRepository.update(connection, type, requestId, normalizedPayload);

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: `${type}_request`,
          entityId: requestId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.portalRequestUpdated', {
            type: translate(DEFAULT_LOCALE, `accessType.${type}`),
            name: normalizedPayload.fullName,
          }),
          beforeState: existingRequest,
          afterState: {
            ...normalizedPayload,
            categoryName: category.name,
            profileName: profile?.name || null,
          },
          metadata: buildAuditMetadata('audit.message.portalRequestUpdated', {
            type: tx(`accessType.${type}`),
            name: normalizedPayload.fullName,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [request, summary] = await Promise.all([
      this.requestRepository.findById(type, requestId),
      this.requestRepository.getAdminSummary(eventId, type),
    ]);

    return {
      event,
      request,
      summary,
    };
  }

  async getVehicleCheckPage(actorId, eventId, t) {
    const tx = resolveTranslate(t);
    const selectedEvent = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);
    const recentMovements = await this.requestRepository.listRecentPassVehicleMovements(selectedEvent.id, 20);

    return {
      selectedEvent,
      recentMovements: recentMovements.map((movement) => ({
        ...movement,
        presence_status: resolveVehiclePresenceStatus(movement),
      })),
    };
  }

  async getPublicVehicleCheckPage(publicToken, t) {
    const tx = resolveTranslate(t);
    const selectedEvent = await this.eventService.getPublicVehicleCheckEventOrFail(publicToken, tx);
    const recentMovements = await this.requestRepository.listRecentPassVehicleMovements(selectedEvent.id, 20);

    return {
      selectedEvent,
      recentMovements: recentMovements.map((movement) => ({
        ...movement,
        presence_status: resolveVehiclePresenceStatus(movement),
      })),
    };
  }

  async getPortalLoginPage() {
    return {
      portalUrl: '/p',
    };
  }

  async authorizePublicProfile(accessCode, session, t) {
    const tx = resolveTranslate(t);
    const normalizedCode = normalizeAccessCode(accessCode);
    let matchedProfile = null;

    if (!normalizedCode) {
      throw new AppError(tx('service.portal.codeInvalid'), 422);
    }

    matchedProfile = await this.requestProfileRepository.findActivePortalByAccessCode(normalizedCode);

    if (!matchedProfile) {
      const profiles = await this.requestProfileRepository.listActivePortals();

      for (const profile of profiles) {
        const isValid = await comparePassword(normalizedCode, profile.access_code_hash);

        if (isValid) {
          matchedProfile = profile;
          break;
        }
      }
    }

    if (!matchedProfile) {
      throw new AppError(tx('service.portal.codeInvalid'), 422);
    }

    this.setPublicProfileSession(session, matchedProfile.id);
    delete session[PUBLIC_PORTAL_IMPORTS_KEY];

    return matchedProfile;
  }

  async clearPublicProfileAccess(session) {
    delete session[PUBLIC_PORTAL_SESSION_KEY];
    delete session[PUBLIC_PORTAL_IMPORTS_KEY];
  }

  async getPortalProfileOrFail(session, t) {
    const tx = resolveTranslate(t);
    const profileId = this.getPublicProfileSession(session);

    if (profileId <= 0) {
      throw new AppError(tx('service.portal.loginRequired'), 403);
    }

    const profile = await this.requestProfileRepository.findPortalById(profileId);

    if (!profile || !profile.is_active) {
      delete session[PUBLIC_PORTAL_SESSION_KEY];
      throw new AppError(tx('service.portal.accessDenied'), 404);
    }

    return profile;
  }

  async getPublicPortal(session, t) {
    const tx = resolveTranslate(t);
    const profile = await this.getPortalProfileOrFail(session, tx);
    const isUnlimitedQuota = Boolean(profile.is_unlimited_quota);
    const [
      passRequestsRaw,
      wristbandRequestsRaw,
      passCategories,
      wristbandCategories,
      passQuotaUsageRaw,
      wristbandQuotaUsageRaw,
    ] = await Promise.all([
      this.requestRepository.listProfileRequests(profile.id, 'pass'),
      this.requestRepository.listProfileRequests(profile.id, 'wristband'),
      isUnlimitedQuota ? this.categoryRepository.listByEvent(profile.event_id, 'pass') : Promise.resolve([]),
      isUnlimitedQuota ? this.categoryRepository.listByEvent(profile.event_id, 'wristband') : Promise.resolve([]),
      isUnlimitedQuota ? Promise.resolve([]) : this.requestRepository.listQuotaUsage(profile.id, 'pass'),
      isUnlimitedQuota ? Promise.resolve([]) : this.requestRepository.listQuotaUsage(profile.id, 'wristband'),
    ]);
    const passQuotaUsage = isUnlimitedQuota
      ? buildUnlimitedQuotaUsage(
        passCategories.filter((category) => Number(category.is_active) === 1),
        passRequestsRaw,
      )
      : withRemainingQuota(passQuotaUsageRaw);
    const wristbandQuotaUsage = isUnlimitedQuota
      ? buildUnlimitedQuotaUsage(
        wristbandCategories.filter((category) => Number(category.is_active) === 1),
        wristbandRequestsRaw,
      )
      : withRemainingQuota(wristbandQuotaUsageRaw);
    const passRequests = passRequestsRaw.map((request) => {
      const isEditable = this.isPortalRequestEditable(profile, 'pass', request);
      const lockInfo = isEditable
        ? { code: null, at: null }
        : resolvePortalLockReason('pass', request, profile);

      return {
        ...request,
        request_type: 'pass',
        display_status: resolveRequestDisplayState('pass', request),
        display_status_label_key: resolveRequestDisplayStatusLabelKey('pass', request),
        display_status_tone: resolveRequestDisplayStatusTone('pass', request),
        display_status_at: resolveRequestDisplayStatusAt('pass', request),
        portal_lock_reason_code: lockInfo.code,
        portal_lock_reason_at: lockInfo.at,
        isEditable,
      };
    });
    const wristbandRequests = wristbandRequestsRaw.map((request) => {
      const isEditable = this.isPortalRequestEditable(profile, 'wristband', request);
      const lockInfo = isEditable
        ? { code: null, at: null }
        : resolvePortalLockReason('wristband', request, profile);

      return {
        ...request,
        request_type: 'wristband',
        display_status: resolveRequestDisplayState('wristband', request),
        display_status_label_key: resolveRequestDisplayStatusLabelKey('wristband', request),
        display_status_tone: resolveRequestDisplayStatusTone('wristband', request),
        display_status_at: resolveRequestDisplayStatusAt('wristband', request),
        portal_lock_reason_code: lockInfo.code,
        portal_lock_reason_at: lockInfo.at,
        isEditable,
      };
    });
    const passPortalOpen = this.isPortalTypeOpen(profile, 'pass');
    const wristbandPortalOpen = this.isPortalTypeOpen(profile, 'wristband');

    return {
      profile: {
        ...profile,
        invite_url: profile.access_code ? buildInviteUrl(profile.access_code) : null,
      },
      passQuotaUsage,
      wristbandQuotaUsage,
      passPortalOpen,
      wristbandPortalOpen,
      canCreatePassRequests:
        passPortalOpen
        && passQuotaUsage.some(
          (quota) => quota.can_create !== false && (quota.is_unlimited || Number(quota.remaining_count) > 0),
        ),
      canCreateWristbandRequests:
        wristbandPortalOpen
        && wristbandQuotaUsage.some(
          (quota) => quota.can_create !== false && (quota.is_unlimited || Number(quota.remaining_count) > 0),
        ),
      passRequests,
      wristbandRequests,
      combinedRequests: buildCombinedRequests(passRequests, wristbandRequests),
    };
  }

  async createPortalRequest(session, type, body, t) {
    const tx = resolveTranslate(t);
    const portal = await this.getPublicPortal(session, tx);
    const payload = buildRequestPayload(body, portal.profile.name);

    assertPassVehiclePlateRequired(type, payload.vehiclePlateNormalized, tx);
    await this.assertVehiclePlateAvailable(
      portal.profile.event_id,
      type,
      payload.vehiclePlateNormalized,
      null,
      tx,
    );
    await this.assertPortalRequestAllowed(portal.profile, type, payload.categoryId, null, tx);

    let requestId = null;
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      requestId = await this.requestRepository.create(connection, type, {
        eventId: portal.profile.event_id,
        requestProfileId: portal.profile.id,
        ...payload,
      });

      await this.auditLogService.record(
        {
          eventId: portal.profile.event_id,
          userId: null,
          entityType: `${type}_request`,
          entityId: requestId,
          action: 'created',
          message: translate(DEFAULT_LOCALE, 'audit.message.portalRequestCreated', {
            type: translate(DEFAULT_LOCALE, `accessType.${type}`),
            name: payload.fullName,
          }),
          afterState: payload,
          metadata: buildAuditMetadata('audit.message.portalRequestCreated', {
            type: tx(`accessType.${type}`),
            name: payload.fullName,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [request, summary] = await Promise.all([
      this.requestRepository.findById(type, requestId),
      this.requestRepository.getAdminSummary(portal.profile.event_id, type),
    ]);

    return {
      eventId: portal.profile.event_id,
      request,
      summary,
    };
  }

  async updatePortalRequest(session, type, requestId, body, t) {
    const tx = resolveTranslate(t);
    const portal = await this.getPublicPortal(session, tx);
    const existingRequest = await this.requestRepository.findById(type, requestId);

    if (!existingRequest || Number(existingRequest.request_profile_id) !== Number(portal.profile.id)) {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    if (!this.isPortalRequestEditable(portal.profile, type, existingRequest)) {
      throw new AppError(tx('service.portal.requestLocked'), 409);
    }

    const payload = buildRequestPayload(body, portal.profile.name);
    const normalizedPayload = {
      ...payload,
      requestProfileId: portal.profile.id,
    };
    assertPassVehiclePlateRequired(type, normalizedPayload.vehiclePlateNormalized, tx);
    await this.assertVehiclePlateAvailable(
      portal.profile.event_id,
      type,
      normalizedPayload.vehiclePlateNormalized,
      requestId,
      tx,
    );
    await this.assertPortalRequestAllowed(portal.profile, type, normalizedPayload.categoryId, requestId, tx);

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.requestRepository.update(connection, type, requestId, normalizedPayload);

      await this.auditLogService.record(
        {
          eventId: portal.profile.event_id,
          userId: null,
          entityType: `${type}_request`,
          entityId: requestId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.portalRequestUpdated', {
            type: translate(DEFAULT_LOCALE, `accessType.${type}`),
            name: normalizedPayload.fullName,
          }),
          beforeState: existingRequest,
          afterState: normalizedPayload,
          metadata: buildAuditMetadata('audit.message.portalRequestUpdated', {
            type: tx(`accessType.${type}`),
            name: normalizedPayload.fullName,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [request, summary] = await Promise.all([
      this.requestRepository.findById(type, requestId),
      this.requestRepository.getAdminSummary(portal.profile.event_id, type),
    ]);

    return {
      eventId: portal.profile.event_id,
      request,
      summary,
    };
  }

  async deletePortalRequest(session, type, requestId, t) {
    const tx = resolveTranslate(t);
    const portal = await this.getPublicPortal(session, tx);
    const existingRequest = await this.requestRepository.findById(type, requestId);

    if (!existingRequest || Number(existingRequest.request_profile_id) !== Number(portal.profile.id)) {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    if (!this.isPortalRequestEditable(portal.profile, type, existingRequest)) {
      throw new AppError(tx('service.portal.requestLocked'), 409);
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.requestRepository.softDelete(connection, type, requestId, null);

      await this.auditLogService.record(
        {
          eventId: portal.profile.event_id,
          userId: null,
          entityType: `${type}_request`,
          entityId: requestId,
          action: 'deleted',
          message: translate(DEFAULT_LOCALE, 'audit.message.portalRequestDeleted', {
            type: translate(DEFAULT_LOCALE, `accessType.${type}`),
            name: existingRequest.full_name,
          }),
          beforeState: existingRequest,
          metadata: buildAuditMetadata('audit.message.portalRequestDeleted', {
            type: tx(`accessType.${type}`),
            name: existingRequest.full_name,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const summary = await this.requestRepository.getAdminSummary(portal.profile.event_id, type);

    return {
      eventId: portal.profile.event_id,
      requestId: Number(requestId),
      type,
      summary,
    };
  }

  async buildImportTemplate(session, type, categoryId, t) {
    const tx = resolveTranslate(t);
    this.assertSupportedPortalType(type, tx);
    const portal = await this.getPublicPortal(session, tx);
    const category = (type === 'pass' ? portal.passQuotaUsage : portal.wristbandQuotaUsage)
      .find((entry) => Number(entry.category_id) === Number(categoryId));

    if (!category || category.can_create === false) {
      throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
    }

    const worksheet = XLSX.utils.aoa_to_sheet([
      buildImportSampleHeaders(type),
      type === 'pass'
        ? ['Janis Berzins', '+37120000000', portal.profile.name, 'janis@example.com', 'AB-1234', '']
        : ['Janis Berzins', '+37120000000', portal.profile.name, 'janis@example.com', ''],
      type === 'pass'
        ? ['Anna Liepa', '+37120000001', portal.profile.name, '', 'CD-5678', '']
        : ['Anna Liepa', '+37120000001', portal.profile.name, '', ''],
    ]);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      filename: `${type}-${category.category_name}-template.xlsx`
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, '-'),
    };
  }

  async previewPortalImport(session, type, categoryId, file, t) {
    const tx = resolveTranslate(t);
    this.assertSupportedPortalType(type, tx);
    const portal = await this.getPublicPortal(session, tx);

    if (!file || !file.buffer) {
      throw new AppError(tx('service.portal.importFileRequired'), 422);
    }

    const quotaUsage = type === 'pass' ? portal.passQuotaUsage : portal.wristbandQuotaUsage;
    const category = quotaUsage.find((entry) => Number(entry.category_id) === Number(categoryId));

    if (!category || category.can_create === false) {
      throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new AppError(tx('service.portal.importEmpty'), 422);
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
      blankrows: false,
    });

    if (!rawRows.length) {
      throw new AppError(tx('service.portal.importEmpty'), 422);
    }

    const seenVehiclePlates = new Set();
    const rows = rawRows.map((row, index) => {
      const normalizedRow = normalizeImportRow(row, index, portal.profile.name);
      const errors = [];
      const normalizedVehiclePlate = normalizeVehiclePlate(normalizedRow.vehiclePlate);

      if (!normalizedRow.fullName || normalizedRow.fullName.length < 2 || normalizedRow.fullName.length > 160) {
        errors.push(tx('validation.portal.fullName', { min: 2, max: 160 }));
      }

      if (!normalizedRow.phone || normalizedRow.phone.length < 3 || normalizedRow.phone.length > 40) {
        errors.push(tx('validation.portal.phoneLength', { min: 3, max: 40 }));
      }

      if (
        !normalizedRow.companyName ||
        normalizedRow.companyName.length < 2 ||
        normalizedRow.companyName.length > 160
      ) {
        errors.push(tx('validation.portal.companyNameLength', { min: 2, max: 160 }));
      }

      if (normalizedRow.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRow.email)) {
        errors.push(tx('validation.portal.email'));
      }

      if (normalizedRow.vehiclePlate && (normalizedRow.vehiclePlate.length < 2 || normalizedRow.vehiclePlate.length > 20)) {
        errors.push(tx('validation.portal.vehiclePlateLength', { min: 2, max: 20 }));
      }

      if (type === 'pass' && !normalizedVehiclePlate) {
        errors.push(tx('validation.portal.vehiclePlateRequired'));
      }

      if (type === 'pass' && normalizedVehiclePlate) {
        if (seenVehiclePlates.has(normalizedVehiclePlate)) {
          errors.push(tx('service.vehicleEntry.duplicatePlate'));
        } else {
          seenVehiclePlates.add(normalizedVehiclePlate);
        }
      }

      if (normalizedRow.notes && normalizedRow.notes.length > 3000) {
        errors.push(tx('validation.portal.notes', { max: 3000 }));
      }

      return {
        ...normalizedRow,
        vehiclePlateNormalized: normalizedVehiclePlate,
        errors,
      };
    });

    if (type === 'pass') {
      for (const row of rows) {
        if (row.errors.length || !row.vehiclePlateNormalized) {
          continue;
        }

        // Prevent ambiguous scanner matches before the user confirms import.
        const existingRequests = await this.requestRepository.listPassesByVehiclePlate(
          portal.profile.event_id,
          row.vehiclePlateNormalized,
        );

        if (existingRequests.length) {
          row.errors.push(tx('service.vehicleEntry.duplicatePlate'));
        }
      }
    }

    const validRows = rows.filter((row) => row.errors.length === 0);
    const overallErrors = [];

    if (!this.isPortalTypeOpen(portal.profile, type)) {
      overallErrors.push(tx('service.portal.deadlinePassed'));
    }

    if (!category.is_unlimited && validRows.length > Number(category.remaining_count || 0)) {
      overallErrors.push(
        tx('service.portal.importQuotaExceeded', { remaining: Number(category.remaining_count || 0) }),
      );
    }

    const canImport = overallErrors.length === 0 && rows.every((row) => row.errors.length === 0);
    const token = crypto.randomBytes(12).toString('hex');

    if (canImport) {
      this.getPublicImportSession(session)[token] = {
        profileId: portal.profile.id,
        type,
        categoryId: Number(categoryId),
        rows: validRows.map((row) => ({
          fullName: row.fullName,
          phone: row.phone,
          companyName: row.companyName,
          email: row.email,
          vehiclePlate: row.vehiclePlate,
          notes: row.notes,
        })),
      };
    }

    return {
      token: canImport ? token : null,
      categoryName: category.category_name,
      type,
      rows,
      totalRows: rows.length,
      validRows: validRows.length,
      canImport,
      overallErrors,
    };
  }

  async commitPortalImport(session, token, t) {
    const tx = resolveTranslate(t);
    const portal = await this.getPublicPortal(session, tx);
    const importSession = this.getPublicImportSession(session);
    const importBatch = importSession[token];

    if (!importBatch || Number(importBatch.profileId) !== Number(portal.profile.id)) {
      throw new AppError(tx('service.portal.importExpired'), 409);
    }

    this.assertSupportedPortalType(importBatch.type, tx);
    await this.assertPortalTypeOpenOrFail(portal.profile, importBatch.type, tx);

    if (portal.profile.is_unlimited_quota) {
      const category = await this.categoryRepository.findById(importBatch.type, importBatch.categoryId);

      if (
        !category
        || Number(category.event_id) !== Number(portal.profile.event_id)
        || Number(category.is_active) !== 1
      ) {
        throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
      }
    } else {
      const quotaUsage = await this.requestRepository.listQuotaUsage(portal.profile.id, importBatch.type);
      const targetQuota = quotaUsage.find(
        (entry) => Number(entry.category_id) === Number(importBatch.categoryId),
      );

      if (!targetQuota) {
        throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
      }

      const usedCount = await this.requestRepository.countUsedQuota(
        portal.profile.id,
        importBatch.type,
        importBatch.categoryId,
      );
      const remainingCount = Number(targetQuota.quota || 0) - usedCount;

      if (importBatch.rows.length > remainingCount) {
        throw new AppError(
          tx('service.portal.importQuotaExceeded', { remaining: Math.max(remainingCount, 0) }),
          409,
        );
      }
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const seenVehiclePlates = new Set();

      for (const row of importBatch.rows) {
        const normalizedVehiclePlate = normalizeVehiclePlate(row.vehiclePlate);

        assertPassVehiclePlateRequired(importBatch.type, normalizedVehiclePlate, tx);

        if (normalizedVehiclePlate) {
          if (seenVehiclePlates.has(normalizedVehiclePlate)) {
            throw new AppError(tx('service.vehicleEntry.duplicatePlate'), 409);
          }

          seenVehiclePlates.add(normalizedVehiclePlate);
        }

        await this.assertVehiclePlateAvailable(
          portal.profile.event_id,
          importBatch.type,
          normalizedVehiclePlate,
          null,
          tx,
        );

        const requestId = await this.requestRepository.create(connection, importBatch.type, {
          eventId: portal.profile.event_id,
          requestProfileId: portal.profile.id,
          categoryId: importBatch.categoryId,
          fullName: row.fullName,
          companyName: row.companyName,
          phone: row.phone,
          email: row.email || null,
          vehiclePlate: row.vehiclePlate || null,
          vehiclePlateNormalized: normalizeVehiclePlate(row.vehiclePlate),
          notes: row.notes || null,
        });

        await this.auditLogService.record(
          {
            eventId: portal.profile.event_id,
            userId: null,
            entityType: `${importBatch.type}_request`,
            entityId: requestId,
            action: 'created',
            message: translate(DEFAULT_LOCALE, 'audit.message.portalImportRequestCreated', {
              type: translate(DEFAULT_LOCALE, `accessType.${importBatch.type}`),
              name: row.fullName,
            }),
            afterState: {
              categoryId: importBatch.categoryId,
              ...row,
            },
            metadata: buildAuditMetadata('audit.message.portalImportRequestCreated', {
              type: tx(`accessType.${importBatch.type}`),
              name: row.fullName,
            }),
          },
          connection,
        );
      }

      await connection.commit();
      delete importSession[token];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return {
      eventId: portal.profile.event_id,
      importedCount: importBatch.rows.length,
    };
  }

  async registerVehicleEntry(payload, t, options = {}) {
    const tx = resolveTranslate(t);
    const eventId = Number(payload.eventId);
    const vehiclePlate = formatVehiclePlate(payload.vehiclePlate);
    const vehiclePlateNormalized = normalizeVehiclePlate(payload.vehiclePlate);
    const direction = payload.direction === 'exit' ? 'exit' : 'entry';
    const gateName = String(payload.gateName || '').trim() || null;
    const source = String(payload.source || '').trim() || null;
    const metadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? payload.metadata
      : null;

    if (!vehiclePlateNormalized) {
      throw new AppError(tx('validation.portal.vehiclePlateLength', { min: 2, max: 20 }), 422);
    }

    if (options.actorId) {
      await this.eventService.getEventAccessOrFail(eventId, options.actorId, tx);
    }

    const matches = await this.requestRepository.listPassesByVehiclePlate(eventId, vehiclePlateNormalized);

    if (!matches.length) {
      throw new AppError(tx('service.vehicleEntry.notFound'), 404);
    }

    if (matches.length > 1) {
      throw new AppError(tx('service.vehicleEntry.multipleMatches'), 409);
    }

    const existingRequest = matches[0];
    const alreadyEntered = Boolean(existingRequest.entered_at);

    const entryWindowDecision = await this.getPassCategoryEntryWindowDecision(
      existingRequest.category_id,
      direction,
      tx,
    );

    if (!entryWindowDecision.allowed) {
      throw new AppError(entryWindowDecision.message, 409);
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.requestRepository.registerPassVehicleMovement(connection, existingRequest.id, {
        eventId,
        vehiclePlate: existingRequest.vehicle_plate || vehiclePlate,
        vehiclePlateNormalized,
        gateName,
        source,
        metadata,
        direction,
        statusUpdatedByUserId: options.actorId || null,
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: options.actorId || null,
          entityType: 'pass_request',
          entityId: existingRequest.id,
          action: 'updated',
          message: translate(
            DEFAULT_LOCALE,
            direction === 'exit' ? 'audit.message.vehicleExitRegistered' : 'audit.message.vehicleEntryRegistered',
            {
              plate: existingRequest.vehicle_plate || vehiclePlate,
              name: existingRequest.full_name,
            },
          ),
          beforeState: {
            enteredAt: existingRequest.entered_at || null,
            lastEntryAt: existingRequest.last_entry_at || null,
            lastExitAt: existingRequest.last_exit_at || null,
          },
          afterState: {
            plate: existingRequest.vehicle_plate || vehiclePlate,
            direction,
            gateName,
            source,
            alreadyEntered,
            lockedByEntry: true,
          },
          metadata: buildAuditMetadata(
            direction === 'exit' ? 'audit.message.vehicleExitRegistered' : 'audit.message.vehicleEntryRegistered',
            {
              plate: existingRequest.vehicle_plate || vehiclePlate,
              name: existingRequest.full_name,
            },
          ),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const request = await this.requestRepository.findById('pass', existingRequest.id);
    const currentPresence = resolveVehiclePresenceStatus(request);

    return {
      eventId,
      request,
      direction,
      alreadyEntered,
      currentPresence,
      performedAt: direction === 'exit' ? request.last_exit_at : request.last_entry_at,
    };
  }

  async registerVehicleCheck(actorId, payload, t) {
    return this.registerVehicleEntry(
      {
        ...payload,
        source: payload.source || 'check-page',
      },
      t,
      { actorId },
    );
  }

  async checkVehicleAccess(payload, t, options = {}) {
    const tx = resolveTranslate(t);
    const eventId = Number(payload.eventId);
    const direction = payload.direction === 'exit' ? 'exit' : payload.direction === 'entry' ? 'entry' : 'check';
    const vehiclePlate = formatVehiclePlate(payload.vehiclePlate);
    const vehiclePlateNormalized = normalizeVehiclePlate(payload.vehiclePlate);

    if (!vehiclePlateNormalized) {
      throw new AppError(tx('validation.portal.vehiclePlateLength', { min: 2, max: 20 }), 422);
    }

    if (options.actorId) {
      await this.eventService.getEventAccessOrFail(eventId, options.actorId, tx);
    }

    const matches = await this.requestRepository.listPassesByVehiclePlate(eventId, vehiclePlateNormalized);

    if (!matches.length) {
      return {
        eventId,
        allowed: false,
        decision: 'denied',
        reason: 'not_found',
        checkedPlate: vehiclePlate,
        message: tx('service.vehicleEntry.notFound'),
        request: null,
        currentPresence: 'unknown',
      };
    }

    if (matches.length > 1) {
      return {
        eventId,
        allowed: false,
        decision: 'denied',
        reason: 'multiple_matches',
        checkedPlate: vehiclePlate,
        message: tx('service.vehicleEntry.multipleMatches'),
        request: null,
        currentPresence: 'unknown',
      };
    }

    const request = await this.requestRepository.findById('pass', matches[0].id);

    const entryWindowDecision = await this.getPassCategoryEntryWindowDecision(
      request?.category_id,
      direction,
      tx,
    );

    if (!entryWindowDecision.allowed) {
      return {
        eventId,
        allowed: false,
        decision: 'denied',
        reason: 'outside_entry_window',
        checkedPlate: request?.vehicle_plate || vehiclePlate,
        message: entryWindowDecision.message,
        request,
        currentPresence: resolveVehiclePresenceStatus(request),
      };
    }

    return {
      eventId,
      allowed: true,
      decision: 'success',
      reason: null,
      checkedPlate: request?.vehicle_plate || vehiclePlate,
      message: tx('service.vehicleEntry.allowed'),
      request,
      currentPresence: resolveVehiclePresenceStatus(request),
    };
  }

  async processVehicleGateDecision(apiToken, payload, t, options = {}) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getVehicleGateApiEventOrFail(apiToken, tx);
    this.eventService.assertVehicleGateApiAuthorized(event, options.providedApiKey, tx);
    const configuredMode = ['entry', 'exit'].includes(event.vehicle_gate_api_mode)
      ? event.vehicle_gate_api_mode
      : 'decision';
    const isDecisionMode = configuredMode === 'decision';
    const isToggleMode = configuredMode === 'entry';
    const isCameraDirectedMode = configuredMode === 'exit';
    const explicitDirection = payload.direction === 'entry' || payload.direction === 'exit'
      ? payload.direction
      : null;
    const requestedMode = isCameraDirectedMode
      ? (explicitDirection || configuredMode)
      : configuredMode;

    if (isDecisionMode) {
      const decisionResult = await this.checkVehicleAccess(
        {
          eventId: Number(event.id),
          vehiclePlate: payload.vehiclePlate,
          direction: 'check',
        },
        tx,
      );

      return {
        ...decisionResult,
        eventId: Number(event.id),
        movement: {
          mode: 'decision',
          configuredMode,
          direction: null,
          recorded: false,
          deduplicated: false,
          performedAt: null,
          autoSwitched: false,
          explicitDirection: false,
        },
      };
    }

    const vehiclePlate = formatVehiclePlate(payload.vehiclePlate);
    const vehiclePlateNormalized = normalizeVehiclePlate(payload.vehiclePlate);

    if (!vehiclePlateNormalized) {
      throw new AppError(tx('validation.portal.vehiclePlateLength', { min: 2, max: 20 }), 422);
    }

    if (isCameraDirectedMode && !explicitDirection) {
      return {
        eventId: Number(event.id),
        allowed: false,
        decision: 'denied',
        reason: 'direction_required',
        checkedPlate: vehiclePlate,
        message: tx('service.vehicleEntry.directionRequired'),
        request: null,
        currentPresence: 'unknown',
        movement: {
          mode: configuredMode,
          configuredMode,
          direction: null,
          recorded: false,
          deduplicated: false,
          performedAt: null,
          autoSwitched: false,
          explicitDirection: false,
        },
      };
    }

    const matches = await this.requestRepository.listPassesByVehiclePlate(Number(event.id), vehiclePlateNormalized);

    if (!matches.length) {
      return {
        eventId: Number(event.id),
        allowed: false,
        decision: 'denied',
        reason: 'not_found',
        checkedPlate: vehiclePlate,
        message: tx('service.vehicleEntry.notFound'),
        request: null,
        currentPresence: 'unknown',
        movement: {
          mode: requestedMode,
          configuredMode,
          direction: requestedMode === 'decision' ? null : requestedMode,
          recorded: false,
          deduplicated: false,
          performedAt: null,
          autoSwitched: false,
          explicitDirection: Boolean(explicitDirection),
        },
      };
    }

    if (matches.length > 1) {
      return {
        eventId: Number(event.id),
        allowed: false,
        decision: 'denied',
        reason: 'multiple_matches',
        checkedPlate: vehiclePlate,
        message: tx('service.vehicleEntry.multipleMatches'),
        request: null,
        currentPresence: 'unknown',
        movement: {
          mode: requestedMode,
          configuredMode,
          direction: requestedMode === 'decision' ? null : requestedMode,
          recorded: false,
          deduplicated: false,
          performedAt: null,
          autoSwitched: false,
          explicitDirection: Boolean(explicitDirection),
        },
      };
    }

    const request = await this.requestRepository.findById('pass', matches[0].id);

    const initialPresence = resolveVehiclePresenceStatus(request);
    const resolvedDirection = isCameraDirectedMode
      ? explicitDirection
      : resolveVehicleGateScanDirection(configuredMode, initialPresence);
    const autoSwitched = isToggleMode
      && resolvedDirection !== configuredMode;
    const entryWindowDecision = await this.getPassCategoryEntryWindowDecision(
      request?.category_id,
      resolvedDirection,
      tx,
    );

    if (!entryWindowDecision.allowed) {
      return {
        eventId: Number(event.id),
        allowed: false,
        decision: 'denied',
        reason: 'outside_entry_window',
        checkedPlate: request?.vehicle_plate || vehiclePlate,
        message: entryWindowDecision.message,
        request,
        currentPresence: initialPresence,
        movement: {
          mode: requestedMode,
          configuredMode,
          direction: resolvedDirection,
          recorded: false,
          deduplicated: false,
          performedAt: null,
          autoSwitched,
          explicitDirection: Boolean(explicitDirection),
        },
      };
    }

    const decisionResult = {
      eventId: Number(event.id),
      allowed: true,
      decision: 'success',
      reason: null,
      checkedPlate: request?.vehicle_plate || vehiclePlate,
      message: tx('service.vehicleEntry.allowed'),
      request,
      currentPresence: initialPresence,
    };
    const shouldRecordMovement = decisionResult.allowed && ['entry', 'exit'].includes(resolvedDirection);

    if (!shouldRecordMovement || !decisionResult.request) {
      return {
        ...decisionResult,
        eventId: Number(event.id),
        movement: {
          mode: requestedMode,
          configuredMode,
          direction: resolvedDirection === 'decision' ? null : resolvedDirection,
          recorded: false,
          deduplicated: false,
          performedAt: null,
          autoSwitched,
          explicitDirection: Boolean(explicitDirection),
        },
      };
    }

    const latestMovement = await this.requestRepository.findLatestPassVehicleMovement(decisionResult.request.id);
    const dedupeSeconds = Math.max(0, Number(event.vehicle_gate_api_dedupe_seconds || 180));
    const latestMovementTs = latestMovement?.created_at ? new Date(latestMovement.created_at).getTime() : 0;
    const shouldDeduplicate = Boolean(
      latestMovement
      && latestMovement.direction === resolvedDirection
      && dedupeSeconds > 0
      && latestMovementTs > 0
      && (Date.now() - latestMovementTs) < dedupeSeconds * 1000
    );

    if (shouldDeduplicate) {
      return {
        ...decisionResult,
        eventId: Number(event.id),
        movement: {
          mode: requestedMode,
          configuredMode,
          direction: resolvedDirection,
          recorded: false,
          deduplicated: true,
          performedAt: latestMovement.created_at || null,
          autoSwitched,
          explicitDirection: Boolean(explicitDirection),
        },
      };
    }

    const entryResult = await this.registerVehicleEntry(
      {
        eventId: Number(event.id),
        vehiclePlate: decisionResult.checkedPlate,
        direction: resolvedDirection,
        gateName: payload.gateName,
        source: payload.source || 'external-gate-api',
        metadata: payload.metadata,
      },
      tx,
    );

    return {
      ...decisionResult,
      eventId: Number(event.id),
      request: entryResult.request,
      currentPresence: entryResult.currentPresence,
      movement: {
        mode: requestedMode,
        configuredMode,
        direction: resolvedDirection,
        recorded: true,
        deduplicated: false,
        performedAt: entryResult.performedAt || null,
        autoSwitched,
        explicitDirection: Boolean(explicitDirection),
      },
    };
  }

  async registerPublicVehicleCheck(publicToken, payload, t) {
    const event = await this.eventService.getPublicVehicleCheckEventOrFail(publicToken, t);

    return this.registerVehicleEntry(
      {
        eventId: Number(event.id),
        vehiclePlate: payload.vehiclePlate,
        direction: payload.direction,
        gateName: payload.gateName,
        source: 'public-check-link',
      },
      t,
    );
  }

  async checkPublicVehicleAccess(publicToken, payload, t) {
    const event = await this.eventService.getPublicVehicleCheckEventOrFail(publicToken, t);

    return this.checkVehicleAccess(
      {
        eventId: Number(event.id),
        vehiclePlate: payload.vehiclePlate,
        direction: payload.direction,
      },
      t,
    );
  }

  async getPassCategoryEntryWindowDecision(categoryId, direction, t) {
    const tx = resolveTranslate(t);

    if (!categoryId || !shouldEnforceEntryWindow(direction)) {
      return {
        allowed: true,
        windows: [],
      };
    }

    const entryWindows = await this.categoryRepository.listPassEntryWindowsByCategoryIds([categoryId]);

    if (!entryWindows.length) {
      return {
        allowed: true,
        windows: [],
      };
    }

    const now = dayjs();
    const isInsideAllowedWindow = entryWindows.some((entryWindow) => {
      const startAt = dayjs(entryWindow.start_at);
      const endAt = dayjs(entryWindow.end_at);

      return startAt.isValid()
        && endAt.isValid()
        && !now.isBefore(startAt)
        && !now.isAfter(endAt);
    });

    if (isInsideAllowedWindow) {
      return {
        allowed: true,
        windows: entryWindows,
      };
    }

    return {
      allowed: false,
      windows: entryWindows,
      message: tx('service.vehicleEntry.outsideEntryWindow'),
    };
  }

  isPortalRequestEditable(profile, type, request) {
    if (!request) {
      return false;
    }

    if (isRequestLockedForPortal(type, request)) {
      return false;
    }

    if (!this.isPortalTypeOpen(profile, type)) {
      return false;
    }

    return true;
  }

  isPortalTypeOpen(profile, type) {
    const deadlineField = type === 'pass' ? 'pass_request_deadline' : 'wristband_request_deadline';
    const deadline = profile[deadlineField];

    if (!deadline) {
      return true;
    }

    return !dayjs().isAfter(dayjs(deadline));
  }

  async assertPortalRequestAllowed(profile, type, categoryId, excludeRequestId, t) {
    const tx = resolveTranslate(t);
    await this.assertPortalTypeOpenOrFail(profile, type, tx);

    if (profile.is_unlimited_quota) {
      const category = await this.categoryRepository.findById(type, categoryId);

      if (
        !category
        || Number(category.event_id) !== Number(profile.event_id)
      ) {
        throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
      }

      if (Number(category.is_active) === 1) {
        return;
      }

      if (excludeRequestId) {
        const existingRequest = await this.requestRepository.findById(type, excludeRequestId);

        if (
          existingRequest
          && Number(existingRequest.request_profile_id) === Number(profile.id)
          && Number(existingRequest.category_id) === Number(categoryId)
        ) {
          return;
        }
      }

      throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
    }

    const quotaUsage = await this.requestRepository.listQuotaUsage(profile.id, type);
    const targetQuota = quotaUsage.find((quota) => Number(quota.category_id) === Number(categoryId));

    if (!targetQuota) {
      throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
    }

    const usedCount = await this.requestRepository.countUsedQuota(
      profile.id,
      type,
      categoryId,
      excludeRequestId,
    );

    if (usedCount >= Number(targetQuota.quota || 0)) {
      throw new AppError(tx('service.portal.quotaReached'), 409);
    }
  }

  async assertVehiclePlateAvailable(eventId, type, vehiclePlateNormalized, excludeRequestId, t) {
    const tx = resolveTranslate(t);

    if (type !== 'pass' || !vehiclePlateNormalized) {
      return;
    }

    const matches = await this.requestRepository.listPassesByVehiclePlate(eventId, vehiclePlateNormalized);
    const conflictingRequest = matches.find(
      (request) => Number(request.id) !== Number(excludeRequestId || 0),
    );

    if (conflictingRequest) {
      throw new AppError(tx('service.vehicleEntry.duplicatePlate'), 409);
    }
  }

  async restoreAuditEntity(eventId, auditId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const entry = await this.auditLogService.findById(auditId);

    if (!entry || Number(entry.event_id) !== Number(eventId) || entry.action !== 'deleted') {
      throw new AppError(tx('audit.restoreNotAvailable'), 404);
    }

    switch (entry.entity_type) {
      case 'event':
        await this.eventService.restoreEvent(eventId, actorId, tx);
        break;
      case 'pass_category':
        await this.categoryRepository.restore('pass', entry.entity_id);
        break;
      case 'wristband_category':
        await this.categoryRepository.restore('wristband', entry.entity_id);
        break;
      case 'request_profile':
        await this.requestProfileRepository.restore(entry.entity_id);
        break;
      case 'pass_request':
        await this.requestRepository.restore('pass', entry.entity_id);
        break;
      case 'wristband_request':
        await this.requestRepository.restore('wristband', entry.entity_id);
        break;
      default:
        throw new AppError(tx('audit.restoreNotAvailable'), 422);
    }

    if (entry.entity_type !== 'event') {
      await this.auditLogService.record({
        eventId,
        userId: actorId,
        entityType: entry.entity_type,
        entityId: entry.entity_id,
        action: 'restored',
        message: translate(DEFAULT_LOCALE, 'audit.message.entityRestored', {
          entity: translate(DEFAULT_LOCALE, `audit.entity.${entry.entity_type}`),
        }),
        afterState: entry.before_state || null,
        metadata: buildAuditMetadata('audit.message.entityRestored', {
          entity: tx(`audit.entity.${entry.entity_type}`),
        }),
      });
    }

    return event;
  }

  async assertPortalTypeOpenOrFail(profile, type, t) {
    const tx = resolveTranslate(t);

    if (!this.isPortalTypeOpen(profile, type)) {
      throw new AppError(tx('service.portal.deadlinePassed'), 409);
    }
  }

  assertSupportedPortalType(type, t) {
    const tx = resolveTranslate(t);

    if (!['pass', 'wristband'].includes(type)) {
      throw new AppError(tx('validation.accessType.type'), 422);
    }
  }
}

module.exports = {
  AccessService,
  PUBLIC_PORTAL_SESSION_KEY,
  PUBLIC_PORTAL_IMPORTS_KEY,
  resolveRequestDisplayState,
  resolveRequestDisplayStatusTone,
  resolveRequestDisplayStatusLabelKey,
  resolveRequestDisplayStatusAt,
  resolveVehiclePresenceStatus,
};
