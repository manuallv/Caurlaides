const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../src/infrastructure/database/pool');
const { runMigrations } = require('../src/infrastructure/database/run-migrations');

const DEMO_PASSWORD = 'Password123!';
const EVENT_NAME = 'Mega Testa Pasakums 2026';
const EVENT_LOCATION = 'Mezaparks Liela estrada, Riga';

const PASS_CATEGORIES = [
  { name: 'All Area', description: 'Pilna pieeja visam pasakumam un backstage zonam.', quota: 90, sortOrder: 1 },
  { name: 'Artist Backstage', description: 'Pieeja skatuves aizkulisu un artistu zonai.', quota: 70, sortOrder: 2 },
  { name: 'Production', description: 'Produkcijas un tehniska personala piekluve.', quota: 130, sortOrder: 3 },
  { name: 'Media', description: 'Foto, video un mediju akreditacijas.', quota: 45, sortOrder: 4 },
  { name: 'VIP', description: 'VIP zonas, hospitality un guest service.', quota: 85, sortOrder: 5 },
  { name: 'Vendor', description: 'Tirgotaju un food court pieejas.', quota: 60, sortOrder: 6 },
  { name: 'Parking', description: 'Auto un piegazu stavesanas zonas.', quota: 95, sortOrder: 7 },
  { name: 'Night Crew', description: 'Nakts mainas uzkopes un parsledzes pieejas.', quota: 50, sortOrder: 8 },
];

const WRISTBAND_CATEGORIES = [
  { name: 'Uzbve / Nobuve', description: 'Skatuvju, teltu un zonu uzstadisanas komandas.', quota: 160, sortOrder: 1 },
  { name: 'Artists', description: 'Artisti, menedzeri un skatuves viesi.', quota: 70, sortOrder: 2 },
  { name: 'Tirgotajs', description: 'Tirdzniecibas vietas un food court komandas.', quota: 95, sortOrder: 3 },
  { name: 'VIP', description: 'VIP viesi, sponsori un ipašie partneri.', quota: 100, sortOrder: 4 },
  { name: 'Drosiba', description: 'Apsardze, piekļuves kontrole un apsaimniekosana.', quota: 75, sortOrder: 5 },
  { name: 'Tehniskais personals', description: 'Skana, gaismas, LED, video un stage management.', quota: 120, sortOrder: 6 },
  { name: 'Mediji', description: 'Preses, TV un foto komandas.', quota: 40, sortOrder: 7 },
  { name: 'Guest', description: 'Viesu saraksti, partneri un uzaicinatie.', quota: 55, sortOrder: 8 },
];

const DEMO_USERS = [
  { fullName: 'Demo Owner', email: 'owner@example.com', role: 'owner' },
  { fullName: 'Linda Admin', email: 'admin.linda@example.com', role: 'admin' },
  { fullName: 'Martins Admin', email: 'admin.martins@example.com', role: 'admin' },
  { fullName: 'Eva Staff', email: 'staff.eva@example.com', role: 'staff' },
  { fullName: 'Janis Staff', email: 'staff.janis@example.com', role: 'staff' },
  { fullName: 'Rihards Staff', email: 'staff.rihards@example.com', role: 'staff' },
];

const PROFILE_CONFIGS = [
  {
    name: 'SIA Stage Build Latvia',
    notes: 'Galvenas skatuves, delay tornu un backstage konstrukciju uzstadisana.',
    pass: { Production: 14, Parking: 8, 'Night Crew': 5 },
    wristband: { 'Uzbve / Nobuve': 24, 'Tehniskais personals': 10 },
  },
  {
    name: 'Baltic Pro Sound',
    notes: 'FOH, monitori, radio un intercom komanda.',
    pass: { Production: 16, 'All Area': 3, Parking: 4 },
    wristband: { 'Tehniskais personals': 18, 'Uzbve / Nobuve': 6 },
  },
  {
    name: 'LightLab Riga',
    notes: 'Gaismas, timecode un follow spot operators.',
    pass: { Production: 14, 'All Area': 4, Parking: 3 },
    wristband: { 'Tehniskais personals': 16, Artists: 4 },
  },
  {
    name: 'Artists Management Group',
    notes: 'Menedzeri, produkcijas koordinatori un artistu viesi.',
    pass: { 'Artist Backstage': 15, 'All Area': 5, VIP: 3 },
    wristband: { Artists: 18, Guest: 6, VIP: 4 },
  },
  {
    name: 'Food Court Partners',
    notes: 'Street food un dzērienu zonas operatori.',
    pass: { Vendor: 14, Parking: 4, Production: 3 },
    wristband: { Tirgotajs: 22, Guest: 4 },
  },
  {
    name: 'Security Force LV',
    notes: 'Perimetra, backstage un skatuves piekļuves kontrole.',
    pass: { 'All Area': 8, Production: 8, Parking: 6 },
    wristband: { Drosiba: 26, 'Tehniskais personals': 4 },
  },
  {
    name: 'Media Crew Baltics',
    notes: 'Foto, video, livestream un interviju komandas.',
    pass: { Media: 16, 'Artist Backstage': 4, VIP: 2 },
    wristband: { Mediji: 18, Guest: 3 },
  },
  {
    name: 'Sponsor Village',
    notes: 'Aktivaciju komanda, hosti un partneru viesi.',
    pass: { VIP: 12, Vendor: 4, 'All Area': 3 },
    wristband: { VIP: 16, Guest: 6 },
  },
  {
    name: 'VIP Coordination Team',
    notes: 'Lounge hosti, concierge un viesu apkalposana.',
    pass: { VIP: 14, 'All Area': 4, Parking: 2 },
    wristband: { VIP: 20, Guest: 5 },
  },
  {
    name: 'Transport and Parking Hub',
    notes: 'Shuttle, rider transports un piegazu logistika.',
    pass: { Parking: 18, Production: 6, 'Night Crew': 4 },
    wristband: { 'Uzbve / Nobuve': 10, 'Tehniskais personals': 6, Guest: 3 },
  },
  {
    name: 'Merch Zone Operators',
    notes: 'Merch telts, noliktava un POS komanda.',
    pass: { Vendor: 10, Parking: 2, Production: 2 },
    wristband: { Tirgotajs: 16, Guest: 2 },
  },
  {
    name: 'Volunteer Hub',
    notes: 'Brivpratigie, info punkts un viesu plusmas paligi.',
    pass: { 'All Area': 8, Production: 4, VIP: 1 },
    wristband: { Guest: 14, Drosiba: 3, 'Uzbve / Nobuve': 4 },
  },
];

const FIRST_NAMES = [
  'Artis', 'Linda', 'Janis', 'Eva', 'Marta', 'Roberts', 'Kristine', 'Agnese', 'Karlis', 'Anna',
  'Rihards', 'Laura', 'Mikus', 'Paula', 'Edgars', 'Diana', 'Matiss', 'Ilze', 'Tomass', 'Sabine',
  'Elvis', 'Liene', 'Kaspars', 'Ieva', 'Andris', 'Madara', 'Emils', 'Sintija', 'Markuss', 'Vita',
  'Gints', 'Signe', 'Jekabs', 'Anete', 'Ralfs', 'Kitija', 'Niks', 'Elina', 'Aivars', 'Zane',
];

const LAST_NAMES = [
  'Berzins', 'Ozols', 'Kalnins', 'Liepa', 'Vitols', 'Krumins', 'Abele', 'Sprogis', 'Lacis', 'Straume',
  'Vilks', 'Eglitis', 'Grinbergs', 'Prieditis', 'Jansons', 'Briede', 'Ziedins', 'Miezis', 'Silins', 'Cers',
  'Murnieks', 'Auzins', 'Treija', 'Rancans', 'Mikelsons', 'Kukainis', 'Bergmanis', 'Sarma', 'Salmins', 'Krastins',
];

function toSqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function sumQuotas(quotas) {
  return Object.values(quotas).reduce((sum, value) => sum + Number(value || 0), 0);
}

function buildAccessCode(index) {
  return `MTP26${String(index + 1).padStart(2, '0')}`;
}

function determineUsedCount(quota, profileIndex, categoryIndex) {
  const ratio = 0.55 + (((profileIndex + categoryIndex) % 3) * 0.1);
  return Math.max(1, Math.min(quota, Math.round(quota * ratio)));
}

function buildPhoneNumber(seed) {
  return `26${String(100000 + seed).slice(-6)}`;
}

function buildEmail(fullName, profileName, index) {
  const personSlug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^\.|\.$)/g, '');
  const companySlug = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'demo';
  return `${personSlug}.${index + 1}@${companySlug}.demo`;
}

function buildRequestRows({ type, eventId, profileId, categoryIdsByName, quotas, profileName, profileIndex, handedOutUserIds }) {
  const rows = [];
  let rowSeed = profileIndex * 100;

  Object.entries(quotas).forEach(([categoryName, quota], categoryIndex) => {
    const categoryId = categoryIdsByName[categoryName];
    const usedCount = determineUsedCount(quota, profileIndex, categoryIndex);

    for (let entryIndex = 0; entryIndex < usedCount; entryIndex += 1) {
      const firstName = FIRST_NAMES[(rowSeed + entryIndex) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(rowSeed + categoryIndex + entryIndex) % LAST_NAMES.length];
      const fullName = `${firstName} ${lastName}`;
      const createdAt = new Date(Date.UTC(2026, 4, 18 + ((profileIndex + entryIndex) % 8), 8 + (entryIndex % 10), (entryIndex * 7) % 60));
      const handedOut = entryIndex % 4 === 0;
      const handedOutAt = handedOut ? new Date(createdAt.getTime() + (45 + entryIndex) * 60000) : null;
      const handedOutByUserId = handedOut ? handedOutUserIds[(profileIndex + entryIndex) % handedOutUserIds.length] : null;

      rows.push({
        eventId,
        profileId,
        categoryId,
        fullName,
        companyName: profileName,
        phone: buildPhoneNumber(rowSeed + entryIndex),
        email: buildEmail(fullName, profileName, entryIndex),
        notes: entryIndex % 5 === 0 ? `${type === 'pass' ? 'Caurlaide' : 'Aproce'} demo ieraksts testesanai.` : null,
        status: handedOut ? 'handed_out' : 'pending',
        handedOutByUserId,
        handedOutAt: handedOutAt ? toSqlDateTime(handedOutAt) : null,
        createdAt: toSqlDateTime(createdAt),
        updatedAt: toSqlDateTime(handedOutAt || createdAt),
      });
    }

    rowSeed += 17;
  });

  return rows;
}

async function ensureUser(connection, fullName, email, passwordHash) {
  const [rows] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);

  if (rows.length) {
    return rows[0].id;
  }

  const [result] = await connection.execute(
    `
      INSERT INTO users (full_name, email, password_hash)
      VALUES (?, ?, ?)
    `,
    [fullName, email, passwordHash],
  );

  return result.insertId;
}

async function insertCategories(connection, tableName, eventId, ownerId, categories) {
  const idsByName = {};

  for (const category of categories) {
    const [result] = await connection.execute(
      `
        INSERT INTO ${tableName} (
          event_id,
          name,
          description,
          quota,
          is_active,
          sort_order,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `,
      [
        eventId,
        category.name,
        category.description,
        category.quota,
        category.sortOrder,
        ownerId,
        ownerId,
      ],
    );

    idsByName[category.name] = result.insertId;
  }

  return idsByName;
}

async function insertQuotaRows(connection, tableName, profileId, categoryField, quotas, categoryIdsByName) {
  for (const [categoryName, quota] of Object.entries(quotas)) {
    await connection.execute(
      `
        INSERT INTO ${tableName} (request_profile_id, ${categoryField}, quota)
        VALUES (?, ?, ?)
      `,
      [profileId, categoryIdsByName[categoryName], quota],
    );
  }
}

async function insertRequestRows(connection, tableName, categoryField, rows) {
  for (const row of rows) {
    await connection.execute(
      `
        INSERT INTO ${tableName} (
          event_id,
          request_profile_id,
          ${categoryField},
          full_name,
          company_name,
          phone,
          email,
          notes,
          status,
          submitted_by_user_id,
          handed_out_by_user_id,
          handed_out_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `,
      [
        row.eventId,
        row.profileId,
        row.categoryId,
        row.fullName,
        row.companyName,
        row.phone,
        row.email,
        row.notes,
        row.status,
        row.handedOutByUserId,
        row.handedOutAt,
        row.createdAt,
        row.updatedAt,
      ],
    );
  }
}

async function insertAuditLog(connection, payload) {
  await connection.execute(
    `
      INSERT INTO audit_logs (
        event_id,
        user_id,
        entity_type,
        entity_id,
        action,
        message,
        before_state,
        after_state,
        metadata,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.eventId,
      payload.userId || null,
      payload.entityType,
      payload.entityId || null,
      payload.action,
      payload.message,
      payload.beforeState ? JSON.stringify(payload.beforeState) : null,
      payload.afterState ? JSON.stringify(payload.afterState) : null,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      payload.createdAt,
    ],
  );
}

async function seedDemoData({
  closePool = false,
  runDbMigrations = false,
  logger = console,
} = {}) {
  if (runDbMigrations) {
    await runMigrations(pool);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const ownerConfig = DEMO_USERS.find((user) => user.role === 'owner');
    const ownerId = await ensureUser(connection, ownerConfig.fullName, ownerConfig.email, passwordHash);

    const otherUsers = [];
    for (const userConfig of DEMO_USERS.filter((user) => user.role !== 'owner')) {
      const userId = await ensureUser(connection, userConfig.fullName, userConfig.email, passwordHash);
      otherUsers.push({ ...userConfig, id: userId });
    }

    const [existingEvents] = await connection.execute(
      'SELECT id FROM events WHERE name = ? LIMIT 1',
      [EVENT_NAME],
    );

    if (existingEvents.length) {
      await connection.rollback();
      const result = {
        created: false,
        eventId: existingEvents[0].id,
        eventName: EVENT_NAME,
        ownerEmail: ownerConfig.email,
        password: DEMO_PASSWORD,
      };

      logger.log(`Demo event already exists: ${EVENT_NAME} (ID ${existingEvents[0].id}).`);
      return result;
    }

    const startDate = new Date(Date.UTC(2026, 4, 29, 10, 0, 0));
    const endDate = new Date(Date.UTC(2026, 4, 31, 23, 0, 0));
    const passDeadline = new Date(Date.UTC(2026, 4, 27, 18, 0, 0));
    const wristbandDeadline = new Date(Date.UTC(2026, 4, 28, 18, 0, 0));

    const [eventResult] = await connection.execute(
      `
        INSERT INTO events (
          owner_id,
          name,
          description,
          start_date,
          end_date,
          location,
          status,
          pass_request_deadline,
          wristband_request_deadline
        )
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `,
      [
        ownerId,
        EVENT_NAME,
        'Pilns demo pasakums ar daudz profiliem, caurlaizu veidiem, aprocu veidiem un testa pieteikumiem.',
        toSqlDateTime(startDate),
        toSqlDateTime(endDate),
        EVENT_LOCATION,
        toSqlDateTime(passDeadline),
        toSqlDateTime(wristbandDeadline),
      ],
    );

    const eventId = eventResult.insertId;

    await connection.execute(
      `
        INSERT INTO event_users (event_id, user_id, role, invited_by_user_id)
        VALUES (?, ?, 'owner', ?)
      `,
      [eventId, ownerId, ownerId],
    );

    for (const collaborator of otherUsers) {
      await connection.execute(
        `
          INSERT INTO event_users (event_id, user_id, role, invited_by_user_id)
          VALUES (?, ?, ?, ?)
        `,
        [eventId, collaborator.id, collaborator.role, ownerId],
      );
    }

    const passCategoryIds = await insertCategories(connection, 'pass_categories', eventId, ownerId, PASS_CATEGORIES);
    const wristbandCategoryIds = await insertCategories(
      connection,
      'wristband_categories',
      eventId,
      ownerId,
      WRISTBAND_CATEGORIES,
    );

    const handedOutUserIds = otherUsers.map((user) => user.id);
    let totalPassRequests = 0;
    let totalWristbandRequests = 0;
    const profileSummaries = [];

    for (const [index, profileConfig] of PROFILE_CONFIGS.entries()) {
      const accessCode = buildAccessCode(index);
      const accessCodeHash = await bcrypt.hash(accessCode, 12);
      const maxPeople = sumQuotas(profileConfig.pass) + sumQuotas(profileConfig.wristband);

      const [profileResult] = await connection.execute(
        `
          INSERT INTO request_profiles (
            event_id,
            name,
            public_slug,
            access_code,
            access_code_hash,
            max_people,
            notes,
            is_active,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `,
        [
          eventId,
          profileConfig.name,
          uuidv4(),
          accessCode,
          accessCodeHash,
          maxPeople,
          profileConfig.notes,
          ownerId,
          ownerId,
        ],
      );

      const profileId = profileResult.insertId;

      await insertQuotaRows(
        connection,
        'request_profile_pass_categories',
        profileId,
        'pass_category_id',
        profileConfig.pass,
        passCategoryIds,
      );
      await insertQuotaRows(
        connection,
        'request_profile_wristband_categories',
        profileId,
        'wristband_category_id',
        profileConfig.wristband,
        wristbandCategoryIds,
      );

      const passRows = buildRequestRows({
        type: 'pass',
        eventId,
        profileId,
        categoryIdsByName: passCategoryIds,
        quotas: profileConfig.pass,
        profileName: profileConfig.name,
        profileIndex: index,
        handedOutUserIds,
      });

      const wristbandRows = buildRequestRows({
        type: 'wristband',
        eventId,
        profileId,
        categoryIdsByName: wristbandCategoryIds,
        quotas: profileConfig.wristband,
        profileName: profileConfig.name,
        profileIndex: index + 10,
        handedOutUserIds,
      });

      await insertRequestRows(connection, 'pass_requests', 'pass_category_id', passRows);
      await insertRequestRows(connection, 'wristband_requests', 'wristband_category_id', wristbandRows);

      totalPassRequests += passRows.length;
      totalWristbandRequests += wristbandRows.length;
      profileSummaries.push({
        name: profileConfig.name,
        code: accessCode,
        passRequests: passRows.length,
        wristbandRequests: wristbandRows.length,
      });

      const createdAt = toSqlDateTime(new Date(Date.UTC(2026, 3, 10 + index, 9, 0, 0)));

      await insertAuditLog(connection, {
        eventId,
        userId: ownerId,
        entityType: 'request_profile',
        entityId: profileId,
        action: 'created',
        message: `Demo profils izveidots: ${profileConfig.name}`,
        afterState: {
          name: profileConfig.name,
          accessCode,
        },
        metadata: {
          seed: true,
          passQuotas: profileConfig.pass,
          wristbandQuotas: profileConfig.wristband,
        },
        createdAt,
      });
    }

    await insertAuditLog(connection, {
      eventId,
      userId: ownerId,
      entityType: 'event',
      entityId: eventId,
      action: 'created',
      message: `Demo pasakums izveidots: ${EVENT_NAME}`,
      afterState: {
        name: EVENT_NAME,
        location: EVENT_LOCATION,
      },
      metadata: {
        seed: true,
        totalProfiles: PROFILE_CONFIGS.length,
        totalPassCategories: PASS_CATEGORIES.length,
        totalWristbandCategories: WRISTBAND_CATEGORIES.length,
      },
      createdAt: toSqlDateTime(new Date(Date.UTC(2026, 3, 8, 12, 0, 0))),
    });

    for (const collaborator of otherUsers) {
      await insertAuditLog(connection, {
        eventId,
        userId: ownerId,
        entityType: 'event_user',
        entityId: collaborator.id,
        action: 'added',
        message: `Demo komandas dalibnieks pievienots: ${collaborator.fullName}`,
        afterState: {
          email: collaborator.email,
          role: collaborator.role,
        },
        metadata: {
          seed: true,
        },
        createdAt: toSqlDateTime(new Date(Date.UTC(2026, 3, 9, 10, 0, 0))),
      });
    }

    await connection.commit();

    const result = {
      created: true,
      eventId,
      eventName: EVENT_NAME,
      ownerEmail: ownerConfig.email,
      password: DEMO_PASSWORD,
      totalProfiles: PROFILE_CONFIGS.length,
      totalPassCategories: PASS_CATEGORIES.length,
      totalWristbandCategories: WRISTBAND_CATEGORIES.length,
      totalPassRequests,
      totalWristbandRequests,
      sampleProfiles: profileSummaries.slice(0, 5),
    };

    logger.log(`Demo event created: ${EVENT_NAME} (ID ${eventId})`);
    logger.log(`Owner login: ${ownerConfig.email} / ${DEMO_PASSWORD}`);
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();

    if (closePool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  seedDemoData({
    closePool: true,
    runDbMigrations: true,
    logger: console,
  }).catch(async (error) => {
    console.error(error);

    try {
      await pool.end();
    } catch (closeError) {
      // Ignore cleanup errors because the original failure is more important.
    }

    process.exit(1);
  });
}

module.exports = {
  DEMO_PASSWORD,
  DEMO_USERS,
  EVENT_NAME,
  seedDemoData,
};
