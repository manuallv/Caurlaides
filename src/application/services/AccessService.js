const crypto = require('crypto');
const dayjs = require('dayjs');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { env } = require('../../config/env');
const { AppError } = require('../../shared/errors/AppError');
const { MANAGEMENT_ROLES } = require('../../shared/constants/event-roles');
const { DEFAULT_LOCALE, buildAuditMetadata, translate } = require('../../shared/i18n');
const { comparePassword, hashPassword } = require('../../infrastructure/security/password');

const PUBLIC_PORTAL_SESSION_KEY = 'publicRequestProfileId';
const PUBLIC_PORTAL_IMPORTS_KEY = 'publicRequestProfileImports';
const IMPORT_SAMPLE_HEADERS = ['Full Name', 'Phone', 'Company', 'Email', 'Notes'];

function resolveTranslate(t) {
  return typeof t === 'function' ? t : (key, params) => translate(DEFAULT_LOCALE, key, params);
}

function normalizeQuotaEntries(input = {}) {
  return Object.entries(input)
    .map(([categoryId, quota]) => ({
      categoryId: Number(categoryId),
      quota: Number(quota || 0),
    }))
    .filter((entry) => Number.isInteger(entry.categoryId) && entry.categoryId > 0 && entry.quota > 0);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase() || null;
}

function buildRequestPayload(body, fallbackCompanyName = null) {
  return {
    categoryId: Number(body.categoryId),
    fullName: body.fullName ? body.fullName.trim() : '',
    companyName: (body.companyName || fallbackCompanyName || '').trim() || null,
    phone: body.phone ? body.phone.trim() : null,
    email: body.email ? body.email.trim() : null,
    notes: body.notes ? body.notes.trim() : null,
  };
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

function buildQuotaMap(quotaUsage = []) {
  return quotaUsage.reduce((map, entry) => {
    map[entry.category_id] = Number(entry.quota || 0);
    return map;
  }, {});
}

function buildUnlimitedQuotaUsage(categories = [], requests = []) {
  const usedByCategory = requests.reduce((map, request) => {
    const categoryId = Number(request.category_id || 0);
    map[categoryId] = (map[categoryId] || 0) + 1;
    return map;
  }, {});

  return categories.map((category) => ({
    category_id: Number(category.id),
    quota: null,
    category_name: category.name,
    used_count: Number(usedByCategory[Number(category.id)] || 0),
    remaining_count: null,
    is_unlimited: true,
  }));
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
      const leftDate = new Date(left.updated_at || left.created_at || 0).getTime();
      const rightDate = new Date(right.updated_at || right.created_at || 0).getTime();
      return rightDate - leftDate;
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

function normalizeImportHeader(header = '') {
  return String(header)
    .trim()
    .toLowerCase()
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
    notes: String(normalized.notes || normalized.piezimes || '').trim(),
  };
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

function buildAdminExportRows(requests = [], typeLabel = '') {
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
    'Status': request.status || '',
    'Status Label': translate(DEFAULT_LOCALE, `statuses.${request.status}`),
    'Status Updated At': formatExportDateTime(request.status_updated_at),
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
    requestProfileRepository,
    requestRepository,
    eventService,
    auditLogService,
    systemService,
  }) {
    this.pool = pool;
    this.categoryRepository = categoryRepository;
    this.requestProfileRepository = requestProfileRepository;
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

  async getTypeManagementPage(eventId, actorId, type, filters, t) {
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, t);
    const [categories, categoryCounts, profiles, requests, summary] = await Promise.all([
      this.categoryRepository.listByEvent(eventId, type),
      this.requestRepository.listCategoryRequestCounts(eventId, type),
      this.requestProfileRepository.listByEvent(eventId),
      this.requestRepository.listAdminRequests(eventId, type, filters),
      this.requestRepository.getAdminSummary(eventId, type),
    ]);
    const categoryCountMap = categoryCounts.reduce((map, entry) => {
      map[entry.category_id] = entry;
      return map;
    }, {});

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
      requests,
      summary,
      canManage: MANAGEMENT_ROLES.includes(event.role),
      type,
    };
  }

  async exportAdminRequests(eventId, actorId, type, format, t) {
    const tx = resolveTranslate(t);
    const normalizedFormat = String(format || '').trim().toLowerCase();
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!['xlsx', 'csv', 'pdf'].includes(normalizedFormat)) {
      throw new AppError(tx('service.export.formatInvalid'), 422);
    }

    const requests = await this.requestRepository.listAdminRequests(eventId, type, {});
    const typeTitle = tx(type === 'pass' ? 'nav.passes' : 'nav.wristbands');
    const rows = buildAdminExportRows(requests, typeTitle);
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

  async getRequestProfilesPage(eventId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const passCategories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const wristbandCategories = await this.categoryRepository.listByEvent(eventId, 'wristband');
    const profiles = await this.requestProfileRepository.listByEvent(eventId);

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

    return {
      event,
      passCategories,
      wristbandCategories,
      profiles: enrichedProfiles,
    };
  }

  async createRequestProfile(eventId, actorId, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const isUnlimitedQuota = Boolean(payload.unlimitedQuota);
    const passQuotas = normalizeQuotaEntries(payload.passQuota);
    const wristbandQuotas = normalizeQuotaEntries(payload.wristbandQuota);
    const passCategories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const wristbandCategories = await this.categoryRepository.listByEvent(eventId, 'wristband');
    const validPassIds = new Set(passCategories.map((category) => Number(category.id)));
    const validWristbandIds = new Set(wristbandCategories.map((category) => Number(category.id)));
    const sanitizedPassQuotas = passQuotas.filter((entry) => validPassIds.has(Number(entry.categoryId)));
    const sanitizedWristbandQuotas = wristbandQuotas.filter(
      (entry) => validWristbandIds.has(Number(entry.categoryId)),
    );

    if (!isUnlimitedQuota && !sanitizedPassQuotas.length && !sanitizedWristbandQuotas.length) {
      throw new AppError(tx('service.requestProfile.quotaRequired'), 422);
    }

    const accessCode = await this.generateUniqueAccessCode();
    const accessCodeHash = await hashPassword(accessCode);
    const maxPeople = isUnlimitedQuota
      ? 0
      : [...sanitizedPassQuotas, ...sanitizedWristbandQuotas]
        .reduce((sum, entry) => sum + entry.quota, 0) || 1;

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const profileId = await this.requestProfileRepository.create(connection, {
        eventId,
        userId: actorId,
        name: payload.name,
        publicSlug: uuidv4(),
        accessCode,
        accessCodeHash,
        maxPeople,
        isUnlimitedQuota,
        contactEmail: normalizeEmail(payload.contactEmail),
        contactPhone: payload.contactPhone ? payload.contactPhone.trim() : null,
        notifyContactOnCreate: payload.notifyContactOnCreate,
        notes: payload.notes || null,
        isActive: payload.isActive ? 1 : 0,
      });

      await this.requestProfileRepository.replaceQuotas(
        connection,
        profileId,
        'pass',
        isUnlimitedQuota ? [] : sanitizedPassQuotas,
      );
      await this.requestProfileRepository.replaceQuotas(
        connection,
        profileId,
        'wristband',
        isUnlimitedQuota ? [] : sanitizedWristbandQuotas,
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
            name: payload.name,
            notes: payload.notes || null,
            isActive: payload.isActive ? 1 : 0,
            contactEmail: normalizeEmail(payload.contactEmail),
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

      if (this.systemService && payload.notifyContactOnCreate && normalizeEmail(payload.contactEmail)) {
        try {
          const passQuotaUsage = withRemainingQuota(await this.requestRepository.listQuotaUsage(profileId, 'pass'));
          const wristbandQuotaUsage = withRemainingQuota(
            await this.requestRepository.listQuotaUsage(profileId, 'wristband'),
          );

          await this.systemService.sendProfileInvite({
            to: normalizeEmail(payload.contactEmail),
            eventName: event.name,
            profileName: payload.name,
            accessCode: accessCode,
            inviteUrl: buildInviteUrl(accessCode),
            wristbandSummary: isUnlimitedQuota
              ? tx('requestProfiles.unlimited')
              : wristbandQuotaUsage.length
              ? wristbandQuotaUsage.map((entry) => `${entry.category_name}: ${entry.quota}`).join(', ')
              : '0',
            passSummary: isUnlimitedQuota
              ? tx('requestProfiles.unlimited')
              : passQuotaUsage.length
              ? passQuotaUsage.map((entry) => `${entry.category_name}: ${entry.quota}`).join(', ')
              : '0',
          });
        } catch (error) {
          // Do not roll back a successfully saved profile because email delivery failed.
          console.warn('Profile invite email failed:', error.message);
        }
      }

      return {
        profileId,
        accessCode,
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
    const passQuotas = normalizeQuotaEntries(payload.passQuota);
    const wristbandQuotas = normalizeQuotaEntries(payload.wristbandQuota);
    const passCategories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const wristbandCategories = await this.categoryRepository.listByEvent(eventId, 'wristband');
    const validPassIds = new Set(passCategories.map((category) => Number(category.id)));
    const validWristbandIds = new Set(wristbandCategories.map((category) => Number(category.id)));
    const sanitizedPassQuotas = passQuotas.filter((entry) => validPassIds.has(Number(entry.categoryId)));
    const sanitizedWristbandQuotas = wristbandQuotas.filter(
      (entry) => validWristbandIds.has(Number(entry.categoryId)),
    );

    if (!isUnlimitedQuota && !sanitizedPassQuotas.length && !sanitizedWristbandQuotas.length) {
      throw new AppError(tx('service.requestProfile.quotaRequired'), 422);
    }

    const maxPeople = isUnlimitedQuota
      ? 0
      : [...sanitizedPassQuotas, ...sanitizedWristbandQuotas]
        .reduce((sum, entry) => sum + entry.quota, 0) || 1;

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      await this.requestProfileRepository.update(connection, profileId, {
        userId: actorId,
        name: payload.name,
        maxPeople,
        isUnlimitedQuota,
        contactEmail: normalizeEmail(payload.contactEmail),
        contactPhone: payload.contactPhone ? payload.contactPhone.trim() : null,
        notifyContactOnCreate: payload.notifyContactOnCreate,
        notes: payload.notes || null,
        isActive: payload.isActive ? 1 : 0,
      });

      await this.requestProfileRepository.replaceQuotas(
        connection,
        profileId,
        'pass',
        isUnlimitedQuota ? [] : sanitizedPassQuotas,
      );
      await this.requestProfileRepository.replaceQuotas(
        connection,
        profileId,
        'wristband',
        isUnlimitedQuota ? [] : sanitizedWristbandQuotas,
      );

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
            name: payload.name,
            notes: payload.notes || null,
            isActive: payload.isActive ? 1 : 0,
            contactEmail: normalizeEmail(payload.contactEmail),
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

      if (this.systemService && payload.notifyContactOnCreate && normalizeEmail(payload.contactEmail)) {
        try {
          const refreshedProfile = await this.ensureRequestProfileAccessCode(
            await this.requestProfileRepository.findById(profileId),
          );
          const passQuotaUsage = withRemainingQuota(await this.requestRepository.listQuotaUsage(profileId, 'pass'));
          const wristbandQuotaUsage = withRemainingQuota(
            await this.requestRepository.listQuotaUsage(profileId, 'wristband'),
          );

          await this.systemService.sendProfileInvite({
            to: normalizeEmail(payload.contactEmail),
            eventName: event.name,
            profileName: payload.name,
            accessCode: refreshedProfile.access_code,
            inviteUrl: buildInviteUrl(refreshedProfile.access_code),
            wristbandSummary: isUnlimitedQuota
              ? tx('requestProfiles.unlimited')
              : wristbandQuotaUsage.length
              ? wristbandQuotaUsage.map((entry) => `${entry.category_name}: ${entry.quota}`).join(', ')
              : '0',
            passSummary: isUnlimitedQuota
              ? tx('requestProfiles.unlimited')
              : passQuotaUsage.length
              ? passQuotaUsage.map((entry) => `${entry.category_name}: ${entry.quota}`).join(', ')
              : '0',
          });
        } catch (error) {
          console.warn('Profile invite email failed:', error.message);
        }
      }
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

  async createAdminRequest(eventId, actorId, type, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.request.manage'), 403);
    }

    const category = await this.categoryRepository.findById(type, payload.categoryId);

    if (!category || Number(category.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.request.typeInvalid'), 422);
    }

    let profile = null;

    if (payload.requestProfileId) {
      profile = await this.requestProfileRepository.findById(payload.requestProfileId);

      if (!profile || Number(profile.event_id) !== Number(eventId)) {
        throw new AppError(tx('service.request.profileInvalid'), 422);
      }
    }

    let requestId = null;
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      requestId = await this.requestRepository.create(connection, type, {
        eventId,
        requestProfileId: payload.requestProfileId || null,
        categoryId: payload.categoryId,
        fullName: payload.fullName,
        companyName: payload.companyName,
        phone: payload.phone,
        email: payload.email,
        notes: payload.notes,
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
            name: payload.fullName,
          }),
          afterState: {
            ...payload,
            categoryName: category.name,
            profileName: profile?.name || null,
          },
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
      ...payload,
      requestProfileId: payload.requestProfileId || null,
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
    const passRequests = passRequestsRaw.map((request) => ({
      ...request,
      request_type: 'pass',
      isEditable: this.isPortalRequestEditable(profile, 'pass', request),
    }));
    const wristbandRequests = wristbandRequestsRaw.map((request) => ({
      ...request,
      request_type: 'wristband',
      isEditable: this.isPortalRequestEditable(profile, 'wristband', request),
    }));
    const passPortalOpen = this.isPortalTypeOpen(profile, 'pass');
    const wristbandPortalOpen = this.isPortalTypeOpen(profile, 'wristband');

    return {
      profile,
      passQuotaUsage,
      wristbandQuotaUsage,
      passPortalOpen,
      wristbandPortalOpen,
      canCreatePassRequests:
        passPortalOpen && passQuotaUsage.some((quota) => quota.is_unlimited || Number(quota.remaining_count) > 0),
      canCreateWristbandRequests:
        wristbandPortalOpen
        && wristbandQuotaUsage.some((quota) => quota.is_unlimited || Number(quota.remaining_count) > 0),
      passRequests,
      wristbandRequests,
      combinedRequests: buildCombinedRequests(passRequests, wristbandRequests),
    };
  }

  async createPortalRequest(session, type, body, t) {
    const tx = resolveTranslate(t);
    const portal = await this.getPublicPortal(session, tx);
    const payload = buildRequestPayload(body, portal.profile.name);

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
    await this.assertPortalRequestAllowed(portal.profile, type, payload.categoryId, requestId, tx);

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.requestRepository.update(connection, type, requestId, payload);

      await this.auditLogService.record(
        {
          eventId: portal.profile.event_id,
          userId: null,
          entityType: `${type}_request`,
          entityId: requestId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.portalRequestUpdated', {
            type: translate(DEFAULT_LOCALE, `accessType.${type}`),
            name: payload.fullName,
          }),
          beforeState: existingRequest,
          afterState: payload,
          metadata: buildAuditMetadata('audit.message.portalRequestUpdated', {
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

    if (!category) {
      throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
    }

    const worksheet = XLSX.utils.aoa_to_sheet([
      IMPORT_SAMPLE_HEADERS,
      ['Janis Berzins', '+37120000000', portal.profile.name, 'janis@example.com', ''],
      ['Anna Liepa', '+37120000001', portal.profile.name, '', ''],
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

    if (!category) {
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

    const rows = rawRows.map((row, index) => {
      const normalizedRow = normalizeImportRow(row, index, portal.profile.name);
      const errors = [];

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

      if (normalizedRow.notes && normalizedRow.notes.length > 3000) {
        errors.push(tx('validation.portal.notes', { max: 3000 }));
      }

      return {
        ...normalizedRow,
        errors,
      };
    });

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
          notes: row.notes,
        })),
      };
    }

    return {
      token: canImport ? token : null,
      categoryName: category.category_name,
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

      for (const row of importBatch.rows) {
        const requestId = await this.requestRepository.create(connection, importBatch.type, {
          eventId: portal.profile.event_id,
          requestProfileId: portal.profile.id,
          categoryId: importBatch.categoryId,
          fullName: row.fullName,
          companyName: row.companyName,
          phone: row.phone,
          email: row.email || null,
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

  isPortalRequestEditable(profile, type, request) {
    if (!request || request.status === 'handed_out') {
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
        || Number(category.is_active) !== 1
      ) {
        throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
      }

      return;
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

module.exports = { AccessService, PUBLIC_PORTAL_SESSION_KEY, PUBLIC_PORTAL_IMPORTS_KEY };
