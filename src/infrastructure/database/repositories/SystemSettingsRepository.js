const { DEFAULT_LOCALE, SUPPORTED_LOCALES, normalizeLocale } = require('../../../shared/i18n');

const DEFAULT_EMAIL_TEMPLATES = {
  en: {
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
    event_member_added: {
      subject: 'You have been added to {{eventName}}',
      html_content: `
        <p>Hello {{recipientName}},</p>
        <p>You have been added to <strong>{{eventName}}</strong> in Caurlaides.</p>
        <p>Your role: <strong>{{roleLabel}}</strong></p>
        <p>Added by: {{invitedByName}}</p>
        <p><a href="{{eventUrl}}">Open event</a></p>
      `,
      text_content: 'Hello {{recipientName}},\n\nYou have been added to {{eventName}} in Caurlaides.\nRole: {{roleLabel}}\nAdded by: {{invitedByName}}\n\nOpen event: {{eventUrl}}',
    },
    profile_application_notification: {
      subject: 'New profile application for {{eventName}}',
      html_content: `
        <p>Hello {{recipientName}},</p>
        <p>A new profile application was submitted for <strong>{{eventName}}</strong>.</p>
        <p>Application ID: {{applicationId}}</p>
        <p>Profile / company: <strong>{{profileName}}</strong></p>
        <p>Email: {{contactEmail}}</p>
        <p>Phone: {{contactPhone}}</p>
        <p>Passes: {{passSummary}}</p>
        <p>Wristbands: {{wristbandSummary}}</p>
        <p>Notes: {{notes}}</p>
        <p>Submitted: {{submittedAt}}</p>
        <p><a href="{{applicationsUrl}}">Open profile applications</a></p>
      `,
      text_content: 'Hello {{recipientName}},\n\nA new profile application was submitted for {{eventName}}.\nApplication ID: {{applicationId}}\nProfile / company: {{profileName}}\nEmail: {{contactEmail}}\nPhone: {{contactPhone}}\nPasses: {{passSummary}}\nWristbands: {{wristbandSummary}}\nNotes: {{notes}}\nSubmitted: {{submittedAt}}\n\nOpen applications: {{applicationsUrl}}',
    },
    profile_application_rejected: {
      subject: 'Your profile application for {{eventName}} was not approved',
      html_content: `
        <p>Hello,</p>
        <p>Your profile application for <strong>{{eventName}}</strong> was not approved.</p>
        <p>Profile / company: <strong>{{profileName}}</strong></p>
        <p>Reason: {{rejectionReason}}</p>
        <p>If you have questions, please contact the event organizer.</p>
      `,
      text_content: 'Hello,\n\nYour profile application for {{eventName}} was not approved.\nProfile / company: {{profileName}}\nReason: {{rejectionReason}}\n\nIf you have questions, please contact the event organizer.',
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
  },
  lv: {
    forgot_password: {
      subject: 'Paroles atjaunošanas instrukcija',
      html_content: `
        <p>Sveiki, {{userName}}!</p>
        <p>Jūs pieprasījāt atjaunot paroli sistēmā {{appName}}.</p>
        <p><a href="{{resetUrl}}">Atvērt paroles atjaunošanas saiti</a></p>
        <p>Ja šo pieprasījumu neveicāt jūs, šo e-pastu var ignorēt.</p>
      `,
      text_content: 'Sveiki, {{userName}}!\n\nParoli var atjaunot šeit: {{resetUrl}}\n\nJa šo pieprasījumu neveicāt jūs, šo e-pastu var ignorēt.',
    },
    portal_invite: {
      subject: 'Piekļuve pasākuma portālam',
      html_content: `
        <p>Sveiki!</p>
        <p>Jums ir piešķirta piekļuve pasākumam {{eventName}}.</p>
        <p>Profils: <strong>{{profileName}}</strong></p>
        <p>Piekļuves kods: <strong>{{accessCode}}</strong></p>
        <p>Tiešā saite: <a href="{{inviteUrl}}">{{inviteUrl}}</a></p>
        <p>Aproču kvota: {{wristbandSummary}}</p>
        <p>Caurlaides kvota: {{passSummary}}</p>
      `,
      text_content: 'Jums ir piešķirta piekļuve pasākumam {{eventName}}.\nProfils: {{profileName}}\nKods: {{accessCode}}\nSaite: {{inviteUrl}}\nAproces: {{wristbandSummary}}\nCaurlaides: {{passSummary}}',
    },
    event_member_added: {
      subject: 'Jūs pievienoja pasākumam {{eventName}}',
      html_content: `
        <p>Sveiki, {{recipientName}}!</p>
        <p>Jūs pievienoja pasākumam <strong>{{eventName}}</strong> sistēmā Caurlaides.</p>
        <p>Jūsu loma: <strong>{{roleLabel}}</strong></p>
        <p>Pievienoja: {{invitedByName}}</p>
        <p><a href="{{eventUrl}}">Atvērt pasākumu</a></p>
      `,
      text_content: 'Sveiki, {{recipientName}}!\n\nJūs pievienoja pasākumam {{eventName}} sistēmā Caurlaides.\nLoma: {{roleLabel}}\nPievienoja: {{invitedByName}}\n\nAtvērt pasākumu: {{eventUrl}}',
    },
    profile_application_notification: {
      subject: 'Jauns profila pieteikums pasākumam {{eventName}}',
      html_content: `
        <p>Sveiki, {{recipientName}}!</p>
        <p>Pasākumam <strong>{{eventName}}</strong> ir iesniegts jauns profila pieteikums.</p>
        <p>Pieteikuma ID: {{applicationId}}</p>
        <p>Profils / uzņēmums: <strong>{{profileName}}</strong></p>
        <p>E-pasts: {{contactEmail}}</p>
        <p>Tālrunis: {{contactPhone}}</p>
        <p>Caurlaides: {{passSummary}}</p>
        <p>Aproces: {{wristbandSummary}}</p>
        <p>Piezīmes: {{notes}}</p>
        <p>Iesniegts: {{submittedAt}}</p>
        <p><a href="{{applicationsUrl}}">Atvērt profilu pieteikumus</a></p>
      `,
      text_content: 'Sveiki, {{recipientName}}!\n\nPasākumam {{eventName}} ir iesniegts jauns profila pieteikums.\nPieteikuma ID: {{applicationId}}\nProfils / uzņēmums: {{profileName}}\nE-pasts: {{contactEmail}}\nTālrunis: {{contactPhone}}\nCaurlaides: {{passSummary}}\nAproces: {{wristbandSummary}}\nPiezīmes: {{notes}}\nIesniegts: {{submittedAt}}\n\nAtvērt pieteikumus: {{applicationsUrl}}',
    },
    profile_application_rejected: {
      subject: 'Profila pieteikums pasākumam {{eventName}} nav apstiprināts',
      html_content: `
        <p>Sveiki!</p>
        <p>Jūsu profila pieteikums pasākumam <strong>{{eventName}}</strong> nav apstiprināts.</p>
        <p>Profils / uzņēmums: <strong>{{profileName}}</strong></p>
        <p>Iemesls: {{rejectionReason}}</p>
        <p>Jautājumu gadījumā, lūdzu, sazinieties ar pasākuma organizatoru.</p>
      `,
      text_content: 'Sveiki!\n\nJūsu profila pieteikums pasākumam {{eventName}} nav apstiprināts.\nProfils / uzņēmums: {{profileName}}\nIemesls: {{rejectionReason}}\n\nJautājumu gadījumā, lūdzu, sazinieties ar pasākuma organizatoru.',
    },
    test_email: {
      subject: 'Caurlaides testa e-pasts',
      html_content: `
        <p>Sveiki!</p>
        <p>Šis ir testa e-pasts no {{appName}}.</p>
        <p>Nosūtīja: <strong>{{actorName}}</strong></p>
        <p>Ja saņēmāt šo e-pastu, pašreizējie piegādātāja iestatījumi darbojas.</p>
      `,
      text_content: 'Sveiki!\n\nŠis ir testa e-pasts no {{appName}}.\nNosūtīja: {{actorName}}\n\nJa saņēmāt šo e-pastu, pašreizējie piegādātāja iestatījumi darbojas.',
    },
  },
  lt: {
    forgot_password: {
      subject: 'Slaptažodžio atkūrimo instrukcija',
      html_content: `
        <p>Sveiki, {{userName}}!</p>
        <p>Jūs paprašėte atkurti slaptažodį sistemoje {{appName}}.</p>
        <p><a href="{{resetUrl}}">Atidaryti slaptažodžio atkūrimo nuorodą</a></p>
        <p>Jei šios užklausos nepateikėte, galite ignoruoti šį laišką.</p>
      `,
      text_content: 'Sveiki, {{userName}}!\n\nSlaptažodį galite atkurti čia: {{resetUrl}}\n\nJei šios užklausos nepateikėte, galite ignoruoti šį laišką.',
    },
    portal_invite: {
      subject: 'Prieiga prie renginio portalo',
      html_content: `
        <p>Sveiki!</p>
        <p>Jums suteikta prieiga prie renginio {{eventName}}.</p>
        <p>Profilis: <strong>{{profileName}}</strong></p>
        <p>Prieigos kodas: <strong>{{accessCode}}</strong></p>
        <p>Tiesioginė nuoroda: <a href="{{inviteUrl}}">{{inviteUrl}}</a></p>
        <p>Apyrankių kvota: {{wristbandSummary}}</p>
        <p>Leidimų kvota: {{passSummary}}</p>
      `,
      text_content: 'Jums suteikta prieiga prie renginio {{eventName}}.\nProfilis: {{profileName}}\nKodas: {{accessCode}}\nNuoroda: {{inviteUrl}}\nApyrankės: {{wristbandSummary}}\nLeidimai: {{passSummary}}',
    },
    event_member_added: {
      subject: 'Jūs pridėti prie renginio {{eventName}}',
      html_content: `
        <p>Sveiki, {{recipientName}}!</p>
        <p>Jūs pridėti prie renginio <strong>{{eventName}}</strong> sistemoje Caurlaides.</p>
        <p>Jūsų rolė: <strong>{{roleLabel}}</strong></p>
        <p>Pridėjo: {{invitedByName}}</p>
        <p><a href="{{eventUrl}}">Atidaryti renginį</a></p>
      `,
      text_content: 'Sveiki, {{recipientName}}!\n\nJūs pridėti prie renginio {{eventName}} sistemoje Caurlaides.\nRolė: {{roleLabel}}\nPridėjo: {{invitedByName}}\n\nAtidaryti renginį: {{eventUrl}}',
    },
    profile_application_notification: {
      subject: 'Nauja profilio paraiška renginiui {{eventName}}',
      html_content: `
        <p>Sveiki, {{recipientName}}!</p>
        <p>Renginiui <strong>{{eventName}}</strong> pateikta nauja profilio paraiška.</p>
        <p>Paraiškos ID: {{applicationId}}</p>
        <p>Profilis / įmonė: <strong>{{profileName}}</strong></p>
        <p>El. paštas: {{contactEmail}}</p>
        <p>Telefonas: {{contactPhone}}</p>
        <p>Leidimai: {{passSummary}}</p>
        <p>Apyrankės: {{wristbandSummary}}</p>
        <p>Pastabos: {{notes}}</p>
        <p>Pateikta: {{submittedAt}}</p>
        <p><a href="{{applicationsUrl}}">Atidaryti profilių paraiškas</a></p>
      `,
      text_content: 'Sveiki, {{recipientName}}!\n\nRenginiui {{eventName}} pateikta nauja profilio paraiška.\nParaiškos ID: {{applicationId}}\nProfilis / įmonė: {{profileName}}\nEl. paštas: {{contactEmail}}\nTelefonas: {{contactPhone}}\nLeidimai: {{passSummary}}\nApyrankės: {{wristbandSummary}}\nPastabos: {{notes}}\nPateikta: {{submittedAt}}\n\nAtidaryti paraiškas: {{applicationsUrl}}',
    },
    profile_application_rejected: {
      subject: 'Profilio paraiška renginiui {{eventName}} nepatvirtinta',
      html_content: `
        <p>Sveiki!</p>
        <p>Jūsų profilio paraiška renginiui <strong>{{eventName}}</strong> nebuvo patvirtinta.</p>
        <p>Profilis / įmonė: <strong>{{profileName}}</strong></p>
        <p>Priežastis: {{rejectionReason}}</p>
        <p>Jei turite klausimų, susisiekite su renginio organizatoriumi.</p>
      `,
      text_content: 'Sveiki!\n\nJūsų profilio paraiška renginiui {{eventName}} nebuvo patvirtinta.\nProfilis / įmonė: {{profileName}}\nPriežastis: {{rejectionReason}}\n\nJei turite klausimų, susisiekite su renginio organizatoriumi.',
    },
    test_email: {
      subject: 'Caurlaides bandomasis el. laiškas',
      html_content: `
        <p>Sveiki!</p>
        <p>Tai bandomasis el. laiškas iš {{appName}}.</p>
        <p>Išsiuntė: <strong>{{actorName}}</strong></p>
        <p>Jei gavote šį laišką, dabartiniai tiekėjo nustatymai veikia.</p>
      `,
      text_content: 'Sveiki!\n\nTai bandomasis el. laiškas iš {{appName}}.\nIšsiuntė: {{actorName}}\n\nJei gavote šį laišką, dabartiniai tiekėjo nustatymai veikia.',
    },
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
    key: 'event_member_added',
    titleKey: 'system.settings.template.eventMemberAdded.title',
    descriptionKey: 'system.settings.template.eventMemberAdded.description',
    variables: ['{{recipientName}}', '{{eventName}}', '{{roleLabel}}', '{{invitedByName}}', '{{eventUrl}}'],
  },
  {
    key: 'profile_application_notification',
    titleKey: 'system.settings.template.profileApplicationNotification.title',
    descriptionKey: 'system.settings.template.profileApplicationNotification.description',
    variables: ['{{recipientName}}', '{{eventName}}', '{{applicationId}}', '{{profileName}}', '{{contactEmail}}', '{{contactPhone}}', '{{passSummary}}', '{{wristbandSummary}}', '{{notes}}', '{{submittedAt}}', '{{applicationsUrl}}'],
  },
  {
    key: 'profile_application_rejected',
    titleKey: 'system.settings.template.profileApplicationRejected.title',
    descriptionKey: 'system.settings.template.profileApplicationRejected.description',
    variables: ['{{eventName}}', '{{profileName}}', '{{contactEmail}}', '{{contactPhone}}', '{{rejectionReason}}'],
  },
  {
    key: 'test_email',
    titleKey: 'system.settings.template.testEmail.title',
    descriptionKey: 'system.settings.template.testEmail.description',
    variables: ['{{appName}}', '{{actorName}}'],
  },
];

function normalizeTemplateLocale(locale) {
  return normalizeLocale(locale) || DEFAULT_LOCALE;
}

function getDefaultEmailTemplate(templateKey, locale = DEFAULT_LOCALE) {
  const activeLocale = normalizeTemplateLocale(locale);

  return (
    DEFAULT_EMAIL_TEMPLATES[activeLocale]?.[templateKey] ||
    DEFAULT_EMAIL_TEMPLATES[DEFAULT_LOCALE]?.[templateKey] ||
    null
  );
}

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

  async listEmailTemplates(locale = DEFAULT_LOCALE) {
    const activeLocale = normalizeTemplateLocale(locale);
    const [rows] = await this.pool.execute(
      `
        SELECT template_key, locale, subject, html_content, text_content, updated_at
        FROM email_templates
      `,
    );

    const templateMap = rows.reduce((accumulator, row) => {
      const rowLocale = normalizeTemplateLocale(row.locale);
      accumulator[`${row.template_key}:${rowLocale}`] = {
        ...row,
        locale: rowLocale,
      };
      return accumulator;
    }, {});

    return EMAIL_TEMPLATE_DEFINITIONS.reduce((accumulator, definition) => {
      const templateKey = definition.key;

      accumulator[definition.key] = {
        template_key: templateKey,
        locale: activeLocale,
        definition,
        ...(getDefaultEmailTemplate(templateKey, activeLocale) || {}),
        ...(templateMap[`${templateKey}:${activeLocale}`] || {}),
      };

      return accumulator;
    }, {});
  }

  async getEmailTemplate(templateKey, locale = DEFAULT_LOCALE) {
    const templates = await this.listEmailTemplates(locale);
    return templates[templateKey] || null;
  }

  async upsertTemplate(templateKey, locale, payload, userId) {
    const activeLocale = normalizeTemplateLocale(locale);

    await this.pool.execute(
      `
        INSERT INTO email_templates (template_key, locale, subject, html_content, text_content, updated_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          subject = VALUES(subject),
          html_content = VALUES(html_content),
          text_content = VALUES(text_content),
          updated_by_user_id = VALUES(updated_by_user_id)
      `,
      [
        templateKey,
        activeLocale,
        payload.subject,
        payload.html_content,
        payload.text_content || null,
        userId || null,
      ],
    );
  }
}

module.exports = {
  SystemSettingsRepository,
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_DEFINITIONS,
  SUPPORTED_EMAIL_TEMPLATE_LOCALES: SUPPORTED_LOCALES,
  getDefaultEmailTemplate,
  normalizeTemplateLocale,
};
