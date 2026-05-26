const { DEFAULT_LOCALE, SUPPORTED_LOCALES, normalizeLocale } = require('../../../shared/i18n');

function renderEmailRows(rows = []) {
  return rows
    .map(({ label, value }, index) => `
      <div style="${index < rows.length - 1 ? 'margin-bottom:18px;' : ''}">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">
          ${label}
        </div>
        <div style="font-size:16px;color:#111827;font-weight:600;margin-top:4px;line-height:1.6;">
          ${value}
        </div>
      </div>`)
    .join('');
}

function renderEmailHtml({
  eyebrow,
  title,
  greeting,
  paragraphs = [],
  rows = [],
  button,
  footer,
  tone = 'neutral',
}) {
  const bodyParagraphs = [
    greeting ? `<p style="font-size:16px;color:#111827;margin-bottom:20px;">${greeting}</p>` : '',
    ...paragraphs.map((paragraph) => `<p style="font-size:15px;line-height:1.7;color:#4b5563;">${paragraph}</p>`),
  ].filter(Boolean).join('\n                ');

  const infoBackground = tone === 'danger' ? '#fef2f2' : '#f9fafb';
  const infoBorder = tone === 'danger' ? '#fecaca' : '#e5e7eb';
  const rowBlock = rows.length ? `
    <div style="background:${infoBackground};border:1px solid ${infoBorder};border-radius:16px;padding:24px;margin:30px 0;">
      ${renderEmailRows(rows)}
    </div>` : '';

  const buttonBlock = button ? `
    <div style="text-align:center;margin:34px 0 24px;">
      <a href="${button.url}"
         style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:15px;font-weight:600;">
        ${button.label}
      </a>
    </div>

    <div style="background:#f9fafb;border-radius:12px;padding:14px 16px;">
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
        ${button.manualLabel}
      </p>

      <a href="${button.url}" style="word-break:break-all;color:#2563eb;font-size:14px;text-decoration:none;">
        ${button.url}
      </a>
    </div>` : '';

  const footerBlock = footer
    ? `<p style="margin-top:28px;font-size:14px;color:#6b7280;line-height:1.6;margin-bottom:0;">${footer}</p>`
    : '';

  return `
<div style="background:#f3f4f6;padding:40px 20px;font-family:Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:20px;padding:40px;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(0,0,0,0.05);">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="margin:18px 0 10px;font-size:30px;color:#111827;">
        ${title}
      </h1>
      <p style="margin:0;color:#6b7280;font-size:15px;">
        ${eyebrow}
      </p>
    </div>

    ${bodyParagraphs}
    ${rowBlock}
    ${buttonBlock}
    ${footerBlock}
  </div>
</div>
  `;
}

function renderEmailText(lines = []) {
  return lines.join('\n');
}

const DEFAULT_EMAIL_TEMPLATES = {
  en: {
    forgot_password: {
      subject: 'Password reset instructions',
      html_content: renderEmailHtml({
        eyebrow: 'Account security',
        title: 'Reset your password',
        greeting: 'Hello, {{userName}}!',
        paragraphs: ['You requested a password reset for {{appName}}. Open the secure link below to create a new password.'],
        button: { label: 'Open password reset link', url: '{{resetUrl}}', manualLabel: 'Or open this link manually:' },
        footer: 'If you did not request this, you can ignore this email.',
      }),
      text_content: renderEmailText([
        'Hello, {{userName}}!',
        '',
        'You requested a password reset for {{appName}}.',
        'Open the secure link to create a new password: {{resetUrl}}',
        '',
        'If you did not request this, you can ignore this email.',
      ]),
    },
    portal_invite: {
      subject: 'Your event portal access',
      html_content: renderEmailHtml({
        eyebrow: 'Event portal',
        title: 'You have access to {{eventName}}',
        greeting: 'Hello!',
        paragraphs: ['Use the link and access code below to open your event profile and submit wristband or vehicle pass details.'],
        rows: [
          { label: 'Profile', value: '{{profileName}}' },
          { label: 'Access code', value: '{{accessCode}}' },
          { label: 'Wristband quota', value: '{{wristbandSummary}}' },
          { label: 'Pass quota', value: '{{passSummary}}' },
        ],
        button: { label: 'Open portal', url: '{{inviteUrl}}', manualLabel: 'Or use this link manually:' },
        footer: 'The portal link is intended only for the assigned profile contact.',
      }),
      text_content: renderEmailText([
        'Hello!',
        '',
        'You have access to {{eventName}}.',
        'Profile: {{profileName}}',
        'Access code: {{accessCode}}',
        'Link: {{inviteUrl}}',
        'Wristbands: {{wristbandSummary}}',
        'Passes: {{passSummary}}',
      ]),
    },
    event_member_added: {
      subject: 'You have been added to {{eventName}}',
      html_content: renderEmailHtml({
        eyebrow: 'Event team',
        title: 'You are now in the event team',
        greeting: 'Hello, {{recipientName}}!',
        paragraphs: ['{{invitedByName}} added you to <strong>{{eventName}}</strong> in Caurlaides.'],
        rows: [
          { label: 'Role', value: '{{roleLabel}}' },
          { label: 'Event', value: '{{eventName}}' },
        ],
        button: { label: 'Open event', url: '{{eventUrl}}', manualLabel: 'Or open this link manually:' },
        footer: 'If this access was unexpected, please contact the event organizer.',
      }),
      text_content: renderEmailText([
        'Hello, {{recipientName}}!',
        '',
        '{{invitedByName}} added you to {{eventName}} in Caurlaides.',
        'Role: {{roleLabel}}',
        '',
        'Open event: {{eventUrl}}',
      ]),
    },
    profile_application_notification: {
      subject: 'New profile application for {{eventName}}',
      html_content: renderEmailHtml({
        eyebrow: 'New application',
        title: 'A profile application was submitted',
        greeting: 'Hello, {{recipientName}}!',
        paragraphs: ['A new public profile application was submitted for <strong>{{eventName}}</strong>. Review the details and approve or reject it in the admin panel.'],
        rows: [
          { label: 'Application ID', value: '{{applicationId}}' },
          { label: 'Profile / company', value: '{{profileName}}' },
          { label: 'Email', value: '{{contactEmail}}' },
          { label: 'Phone', value: '{{contactPhone}}' },
          { label: 'Passes', value: '{{passSummary}}' },
          { label: 'Wristbands', value: '{{wristbandSummary}}' },
          { label: 'Notes', value: '{{notes}}' },
          { label: 'Submitted', value: '{{submittedAt}}' },
        ],
        button: { label: 'Open profile applications', url: '{{applicationsUrl}}', manualLabel: 'Or open this link manually:' },
      }),
      text_content: renderEmailText([
        'Hello, {{recipientName}}!',
        '',
        'A new public profile application was submitted for {{eventName}}.',
        'Application ID: {{applicationId}}',
        'Profile / company: {{profileName}}',
        'Email: {{contactEmail}}',
        'Phone: {{contactPhone}}',
        'Passes: {{passSummary}}',
        'Wristbands: {{wristbandSummary}}',
        'Notes: {{notes}}',
        'Submitted: {{submittedAt}}',
        '',
        'Open applications: {{applicationsUrl}}',
      ]),
    },
    profile_application_rejected: {
      subject: 'Your profile application for {{eventName}} was not approved',
      html_content: renderEmailHtml({
        eyebrow: 'Application status',
        title: 'Application not approved',
        greeting: 'Hello!',
        paragraphs: ['Your profile application for <strong>{{eventName}}</strong> was not approved.'],
        rows: [
          { label: 'Profile / company', value: '{{profileName}}' },
          { label: 'Email', value: '{{contactEmail}}' },
          { label: 'Phone', value: '{{contactPhone}}' },
          { label: 'Reason', value: '{{rejectionReason}}' },
        ],
        tone: 'danger',
        footer: 'If you have questions, please contact the event organizer.',
      }),
      text_content: renderEmailText([
        'Hello!',
        '',
        'Your profile application for {{eventName}} was not approved.',
        'Profile / company: {{profileName}}',
        'Email: {{contactEmail}}',
        'Phone: {{contactPhone}}',
        'Reason: {{rejectionReason}}',
        '',
        'If you have questions, please contact the event organizer.',
      ]),
    },
    test_email: {
      subject: 'Caurlaides test email',
      html_content: renderEmailHtml({
        eyebrow: 'Email test',
        title: 'Email settings are working',
        greeting: 'Hello!',
        paragraphs: ['This is a test email from {{appName}}.'],
        rows: [
          { label: 'Sent by', value: '{{actorName}}' },
        ],
        footer: 'If you received this email, the current provider settings are working.',
      }),
      text_content: renderEmailText([
        'Hello!',
        '',
        'This is a test email from {{appName}}.',
        'Sent by: {{actorName}}',
        '',
        'If you received this email, the current provider settings are working.',
      ]),
    },
  },
  lv: {
    forgot_password: {
      subject: 'Paroles atjaunošanas instrukcija',
      html_content: renderEmailHtml({
        eyebrow: 'Konta drošība',
        title: 'Atjaunojiet paroli',
        greeting: 'Sveiki, {{userName}}!',
        paragraphs: ['Jūs pieprasījāt atjaunot paroli sistēmā {{appName}}. Atveriet drošo saiti zemāk, lai izveidotu jaunu paroli.'],
        button: { label: 'Atvērt paroles atjaunošanas saiti', url: '{{resetUrl}}', manualLabel: 'Vai atveriet šo saiti manuāli:' },
        footer: 'Ja šo pieprasījumu neveicāt jūs, šo e-pastu var ignorēt.',
      }),
      text_content: renderEmailText([
        'Sveiki, {{userName}}!',
        '',
        'Jūs pieprasījāt atjaunot paroli sistēmā {{appName}}.',
        'Atveriet drošo saiti, lai izveidotu jaunu paroli: {{resetUrl}}',
        '',
        'Ja šo pieprasījumu neveicāt jūs, šo e-pastu var ignorēt.',
      ]),
    },
    portal_invite: {
      subject: 'Piekļuve pasākuma portālam',
      html_content: renderEmailHtml({
        eyebrow: 'Pasākuma portāls',
        title: 'Jums ir piekļuve pasākumam {{eventName}}',
        greeting: 'Sveiki!',
        paragraphs: ['Izmantojiet zemāk esošo saiti un piekļuves kodu, lai atvērtu savu pasākuma profilu un iesniegtu aproču vai auto caurlaižu datus.'],
        rows: [
          { label: 'Profils', value: '{{profileName}}' },
          { label: 'Piekļuves kods', value: '{{accessCode}}' },
          { label: 'Aproču kvota', value: '{{wristbandSummary}}' },
          { label: 'Caurlaides kvota', value: '{{passSummary}}' },
        ],
        button: { label: 'Atvērt portālu', url: '{{inviteUrl}}', manualLabel: 'Vai izmantojiet šo saiti manuāli:' },
        footer: 'Portāla saite paredzēta tikai piešķirtā profila kontaktpersonai.',
      }),
      text_content: renderEmailText([
        'Sveiki!',
        '',
        'Jums ir piekļuve pasākumam {{eventName}}.',
        'Profils: {{profileName}}',
        'Piekļuves kods: {{accessCode}}',
        'Saite: {{inviteUrl}}',
        'Aproces: {{wristbandSummary}}',
        'Caurlaides: {{passSummary}}',
      ]),
    },
    event_member_added: {
      subject: 'Jūs pievienoja pasākumam {{eventName}}',
      html_content: renderEmailHtml({
        eyebrow: 'Pasākuma komanda',
        title: 'Jūs esat pievienots pasākuma komandai',
        greeting: 'Sveiki, {{recipientName}}!',
        paragraphs: ['{{invitedByName}} pievienoja jūs pasākumam <strong>{{eventName}}</strong> sistēmā Caurlaides.'],
        rows: [
          { label: 'Loma', value: '{{roleLabel}}' },
          { label: 'Pasākums', value: '{{eventName}}' },
        ],
        button: { label: 'Atvērt pasākumu', url: '{{eventUrl}}', manualLabel: 'Vai atveriet šo saiti manuāli:' },
        footer: 'Ja šī piekļuve nav gaidīta, lūdzu, sazinieties ar pasākuma organizatoru.',
      }),
      text_content: renderEmailText([
        'Sveiki, {{recipientName}}!',
        '',
        '{{invitedByName}} pievienoja jūs pasākumam {{eventName}} sistēmā Caurlaides.',
        'Loma: {{roleLabel}}',
        '',
        'Atvērt pasākumu: {{eventUrl}}',
      ]),
    },
    profile_application_notification: {
      subject: 'Jauns profila pieteikums pasākumam {{eventName}}',
      html_content: renderEmailHtml({
        eyebrow: 'Jauns pieteikums',
        title: 'Iesniegts profila pieteikums',
        greeting: 'Sveiki, {{recipientName}}!',
        paragraphs: ['Pasākumam <strong>{{eventName}}</strong> ir iesniegts jauns publiskais profila pieteikums. Pārskatiet informāciju un apstipriniet vai noraidiet to admin panelī.'],
        rows: [
          { label: 'Pieteikuma ID', value: '{{applicationId}}' },
          { label: 'Profils / uzņēmums', value: '{{profileName}}' },
          { label: 'E-pasts', value: '{{contactEmail}}' },
          { label: 'Tālrunis', value: '{{contactPhone}}' },
          { label: 'Caurlaides', value: '{{passSummary}}' },
          { label: 'Aproces', value: '{{wristbandSummary}}' },
          { label: 'Piezīmes', value: '{{notes}}' },
          { label: 'Iesniegts', value: '{{submittedAt}}' },
        ],
        button: { label: 'Atvērt profilu pieteikumus', url: '{{applicationsUrl}}', manualLabel: 'Vai atveriet šo saiti manuāli:' },
      }),
      text_content: renderEmailText([
        'Sveiki, {{recipientName}}!',
        '',
        'Pasākumam {{eventName}} ir iesniegts jauns publiskais profila pieteikums.',
        'Pieteikuma ID: {{applicationId}}',
        'Profils / uzņēmums: {{profileName}}',
        'E-pasts: {{contactEmail}}',
        'Tālrunis: {{contactPhone}}',
        'Caurlaides: {{passSummary}}',
        'Aproces: {{wristbandSummary}}',
        'Piezīmes: {{notes}}',
        'Iesniegts: {{submittedAt}}',
        '',
        'Atvērt pieteikumus: {{applicationsUrl}}',
      ]),
    },
    profile_application_rejected: {
      subject: 'Profila pieteikums pasākumam {{eventName}} nav apstiprināts',
      html_content: renderEmailHtml({
        eyebrow: 'Pieteikuma statuss',
        title: 'Pieteikums nav apstiprināts',
        greeting: 'Sveiki!',
        paragraphs: ['Jūsu profila pieteikums pasākumam <strong>{{eventName}}</strong> nav apstiprināts.'],
        rows: [
          { label: 'Profils / uzņēmums', value: '{{profileName}}' },
          { label: 'E-pasts', value: '{{contactEmail}}' },
          { label: 'Tālrunis', value: '{{contactPhone}}' },
          { label: 'Iemesls', value: '{{rejectionReason}}' },
        ],
        tone: 'danger',
        footer: 'Jautājumu gadījumā, lūdzu, sazinieties ar pasākuma organizatoru.',
      }),
      text_content: renderEmailText([
        'Sveiki!',
        '',
        'Jūsu profila pieteikums pasākumam {{eventName}} nav apstiprināts.',
        'Profils / uzņēmums: {{profileName}}',
        'E-pasts: {{contactEmail}}',
        'Tālrunis: {{contactPhone}}',
        'Iemesls: {{rejectionReason}}',
        '',
        'Jautājumu gadījumā, lūdzu, sazinieties ar pasākuma organizatoru.',
      ]),
    },
    test_email: {
      subject: 'Caurlaides testa e-pasts',
      html_content: renderEmailHtml({
        eyebrow: 'E-pasta tests',
        title: 'E-pasta iestatījumi darbojas',
        greeting: 'Sveiki!',
        paragraphs: ['Šis ir testa e-pasts no {{appName}}.'],
        rows: [
          { label: 'Nosūtīja', value: '{{actorName}}' },
        ],
        footer: 'Ja saņēmāt šo e-pastu, pašreizējie piegādātāja iestatījumi darbojas.',
      }),
      text_content: renderEmailText([
        'Sveiki!',
        '',
        'Šis ir testa e-pasts no {{appName}}.',
        'Nosūtīja: {{actorName}}',
        '',
        'Ja saņēmāt šo e-pastu, pašreizējie piegādātāja iestatījumi darbojas.',
      ]),
    },
  },
  lt: {
    forgot_password: {
      subject: 'Slaptažodžio atkūrimo instrukcija',
      html_content: renderEmailHtml({
        eyebrow: 'Paskyros saugumas',
        title: 'Atkurkite slaptažodį',
        greeting: 'Sveiki, {{userName}}!',
        paragraphs: ['Paprašėte atkurti slaptažodį sistemoje {{appName}}. Atidarykite saugią nuorodą žemiau ir susikurkite naują slaptažodį.'],
        button: { label: 'Atidaryti slaptažodžio atkūrimo nuorodą', url: '{{resetUrl}}', manualLabel: 'Arba atidarykite šią nuorodą rankiniu būdu:' },
        footer: 'Jei šios užklausos neteikėte, galite ignoruoti šį laišką.',
      }),
      text_content: renderEmailText([
        'Sveiki, {{userName}}!',
        '',
        'Paprašėte atkurti slaptažodį sistemoje {{appName}}.',
        'Atidarykite saugią nuorodą ir susikurkite naują slaptažodį: {{resetUrl}}',
        '',
        'Jei šios užklausos neteikėte, galite ignoruoti šį laišką.',
      ]),
    },
    portal_invite: {
      subject: 'Prieiga prie renginio portalo',
      html_content: renderEmailHtml({
        eyebrow: 'Renginio portalas',
        title: 'Turite prieigą prie renginio {{eventName}}',
        greeting: 'Sveiki!',
        paragraphs: ['Naudokite žemiau esančią nuorodą ir prieigos kodą, kad atidarytumėte savo renginio profilį ir pateiktumėte apyrankių arba automobilio leidimų duomenis.'],
        rows: [
          { label: 'Profilis', value: '{{profileName}}' },
          { label: 'Prieigos kodas', value: '{{accessCode}}' },
          { label: 'Apyrankių kvota', value: '{{wristbandSummary}}' },
          { label: 'Leidimų kvota', value: '{{passSummary}}' },
        ],
        button: { label: 'Atidaryti portalą', url: '{{inviteUrl}}', manualLabel: 'Arba naudokite šią nuorodą rankiniu būdu:' },
        footer: 'Portalo nuoroda skirta tik priskirto profilio kontaktiniam asmeniui.',
      }),
      text_content: renderEmailText([
        'Sveiki!',
        '',
        'Turite prieigą prie renginio {{eventName}}.',
        'Profilis: {{profileName}}',
        'Prieigos kodas: {{accessCode}}',
        'Nuoroda: {{inviteUrl}}',
        'Apyrankės: {{wristbandSummary}}',
        'Leidimai: {{passSummary}}',
      ]),
    },
    event_member_added: {
      subject: 'Jūs pridėti prie renginio {{eventName}}',
      html_content: renderEmailHtml({
        eyebrow: 'Renginio komanda',
        title: 'Buvote pridėti prie renginio komandos',
        greeting: 'Sveiki, {{recipientName}}!',
        paragraphs: ['{{invitedByName}} pridėjo jus prie renginio <strong>{{eventName}}</strong> sistemoje Caurlaides.'],
        rows: [
          { label: 'Rolė', value: '{{roleLabel}}' },
          { label: 'Renginys', value: '{{eventName}}' },
        ],
        button: { label: 'Atidaryti renginį', url: '{{eventUrl}}', manualLabel: 'Arba atidarykite šią nuorodą rankiniu būdu:' },
        footer: 'Jei ši prieiga buvo netikėta, susisiekite su renginio organizatoriumi.',
      }),
      text_content: renderEmailText([
        'Sveiki, {{recipientName}}!',
        '',
        '{{invitedByName}} pridėjo jus prie renginio {{eventName}} sistemoje Caurlaides.',
        'Rolė: {{roleLabel}}',
        '',
        'Atidaryti renginį: {{eventUrl}}',
      ]),
    },
    profile_application_notification: {
      subject: 'Nauja profilio paraiška renginiui {{eventName}}',
      html_content: renderEmailHtml({
        eyebrow: 'Nauja paraiška',
        title: 'Pateikta profilio paraiška',
        greeting: 'Sveiki, {{recipientName}}!',
        paragraphs: ['Renginiui <strong>{{eventName}}</strong> pateikta nauja vieša profilio paraiška. Peržiūrėkite informaciją ir patvirtinkite arba atmeskite ją administratoriaus skydelyje.'],
        rows: [
          { label: 'Paraiškos ID', value: '{{applicationId}}' },
          { label: 'Profilis / įmonė', value: '{{profileName}}' },
          { label: 'El. paštas', value: '{{contactEmail}}' },
          { label: 'Telefonas', value: '{{contactPhone}}' },
          { label: 'Leidimai', value: '{{passSummary}}' },
          { label: 'Apyrankės', value: '{{wristbandSummary}}' },
          { label: 'Pastabos', value: '{{notes}}' },
          { label: 'Pateikta', value: '{{submittedAt}}' },
        ],
        button: { label: 'Atidaryti profilių paraiškas', url: '{{applicationsUrl}}', manualLabel: 'Arba atidarykite šią nuorodą rankiniu būdu:' },
      }),
      text_content: renderEmailText([
        'Sveiki, {{recipientName}}!',
        '',
        'Renginiui {{eventName}} pateikta nauja vieša profilio paraiška.',
        'Paraiškos ID: {{applicationId}}',
        'Profilis / įmonė: {{profileName}}',
        'El. paštas: {{contactEmail}}',
        'Telefonas: {{contactPhone}}',
        'Leidimai: {{passSummary}}',
        'Apyrankės: {{wristbandSummary}}',
        'Pastabos: {{notes}}',
        'Pateikta: {{submittedAt}}',
        '',
        'Atidaryti paraiškas: {{applicationsUrl}}',
      ]),
    },
    profile_application_rejected: {
      subject: 'Profilio paraiška renginiui {{eventName}} nepatvirtinta',
      html_content: renderEmailHtml({
        eyebrow: 'Paraiškos būsena',
        title: 'Paraiška nepatvirtinta',
        greeting: 'Sveiki!',
        paragraphs: ['Jūsų profilio paraiška renginiui <strong>{{eventName}}</strong> nebuvo patvirtinta.'],
        rows: [
          { label: 'Profilis / įmonė', value: '{{profileName}}' },
          { label: 'El. paštas', value: '{{contactEmail}}' },
          { label: 'Telefonas', value: '{{contactPhone}}' },
          { label: 'Priežastis', value: '{{rejectionReason}}' },
        ],
        tone: 'danger',
        footer: 'Jei turite klausimų, susisiekite su renginio organizatoriumi.',
      }),
      text_content: renderEmailText([
        'Sveiki!',
        '',
        'Jūsų profilio paraiška renginiui {{eventName}} nebuvo patvirtinta.',
        'Profilis / įmonė: {{profileName}}',
        'El. paštas: {{contactEmail}}',
        'Telefonas: {{contactPhone}}',
        'Priežastis: {{rejectionReason}}',
        '',
        'Jei turite klausimų, susisiekite su renginio organizatoriumi.',
      ]),
    },
    test_email: {
      subject: 'Caurlaides bandomasis el. laiškas',
      html_content: renderEmailHtml({
        eyebrow: 'El. pašto testas',
        title: 'El. pašto nustatymai veikia',
        greeting: 'Sveiki!',
        paragraphs: ['Tai bandomasis el. laiškas iš {{appName}}.'],
        rows: [
          { label: 'Išsiuntė', value: '{{actorName}}' },
        ],
        footer: 'Jei gavote šį laišką, dabartiniai tiekėjo nustatymai veikia.',
      }),
      text_content: renderEmailText([
        'Sveiki!',
        '',
        'Tai bandomasis el. laiškas iš {{appName}}.',
        'Išsiuntė: {{actorName}}',
        '',
        'Jei gavote šį laišką, dabartiniai tiekėjo nustatymai veikia.',
      ]),
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
