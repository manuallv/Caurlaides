document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('[data-mobile-sidebar]');
  const sidebarToggles = document.querySelectorAll('[data-mobile-sidebar-toggle]');
  const sidebarClosers = document.querySelectorAll('[data-mobile-sidebar-close], [data-mobile-sidebar-overlay]');
  const menuButton = document.querySelector('[data-mobile-menu-toggle]');
  const menuPanel = document.querySelector('[data-mobile-menu]');
  const eventRoom = document.body.dataset.eventRoom;
  const resolveInitialEventDashboardTab = () => {
    const hash = window.location.hash;

    if (hash === '#check-link' || hash === '#public-link' || hash === '#vehicle-check-link') {
      return 'link';
    }

    if (hash === '#api') {
      return 'api';
    }

    return 'summary';
  };
  let activePortalTab = 'all';
  let activePortalWorkspaceView = 'table';
  let activePortalRequestType = 'pass';
  let activePortalRequestMode = 'create';
  let activePortalImportType = 'pass';
  let activeEventDashboardTab = resolveInitialEventDashboardTab();
  let activeAccessView = window.location.hash === '#types' ? 'types' : 'requests';
  let accessFullscreen = false;
  let selectedAccessPrintRequestIds = new Set();
  let selectedAccessWristbandRequestIds = new Set();
  let refreshInProgress = false;
  let pendingLiveRefresh = false;
  let liveFilterTimer = null;
  let activeRefreshController = null;
  let memberSearchTimer = null;
  let memberSearchController = null;
  let suppressSocketRefreshUntil = 0;
  let portalTableSearchQuery = '';
  let portalTableSortField = 'created';
  let portalTableSortDirection = 'desc';
  const escapeSelector = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
  };

  const normalizeVehiclePlateSearch = (value) => String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .toLowerCase();

  const isAbortError = (error) => (
    error?.name === 'AbortError'
    || String(error?.message || '').toLowerCase().includes('aborted')
  );

  const findClosestTarget = (target, selector) => {
    let current = target instanceof Element ? target : target?.parentElement || null;

    while (current) {
      if (typeof current.matches === 'function' && current.matches(selector)) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  };

  const closeSidebar = () => {
    if (!sidebar) {
      return;
    }

    sidebar.classList.remove('is-open');
    document.body.classList.remove('is-sidebar-open');
  };

  const openSidebar = () => {
    if (!sidebar) {
      return;
    }

    sidebar.classList.add('is-open');
    document.body.classList.add('is-sidebar-open');
  };

  const worldnicHeader = document.querySelector('.worldnic-header');
  const compactHeaderMedia = window.matchMedia('(max-width: 1023px)');
  let compactHeaderTicking = false;

  const syncCompactHeader = () => {
    if (!worldnicHeader) {
      return;
    }

    const shouldCompact = compactHeaderMedia.matches && window.scrollY > 44;
    worldnicHeader.classList.toggle('is-compact', shouldCompact);
  };

  const requestCompactHeaderSync = () => {
    if (compactHeaderTicking) {
      return;
    }

    compactHeaderTicking = true;
    window.requestAnimationFrame(() => {
      syncCompactHeader();
      compactHeaderTicking = false;
    });
  };

  const showLiveNotice = (message, type = 'success') => {
    if (!message) {
      return;
    }

    let noticeRoot = document.querySelector('[data-live-notice-root]');

    if (!noticeRoot) {
      noticeRoot = document.createElement('div');
      noticeRoot.dataset.liveNoticeRoot = 'true';
      noticeRoot.style.position = 'fixed';
      noticeRoot.style.top = '20px';
      noticeRoot.style.right = '20px';
      noticeRoot.style.zIndex = '9999';
      noticeRoot.style.display = 'grid';
      noticeRoot.style.gap = '10px';
      noticeRoot.style.maxWidth = '360px';
      document.body.appendChild(noticeRoot);
    }

    const notice = document.createElement('div');
    notice.textContent = message;
    notice.style.padding = '12px 14px';
    notice.style.borderRadius = '14px';
    notice.style.boxShadow = '0 18px 36px rgba(15, 23, 42, 0.16)';
    notice.style.fontSize = '14px';
    notice.style.fontWeight = '600';
    notice.style.lineHeight = '1.5';
    notice.style.background = type === 'error' ? '#fff1f2' : '#ecfdf3';
    notice.style.color = type === 'error' ? '#be123c' : '#166534';
    notice.style.border = `1px solid ${type === 'error' ? '#fecdd3' : '#bbf7d0'}`;
    noticeRoot.appendChild(notice);

    window.setTimeout(() => {
      notice.remove();
    }, 4200);
  };

  const getMemberSearchElements = () => {
    const form = document.querySelector('[data-member-add-form]');

    return {
      form,
      input: form?.querySelector('[data-member-email-search]') || null,
      panel: form?.querySelector('[data-member-search-panel]') || null,
      status: form?.querySelector('[data-member-search-status]') || null,
      results: form?.querySelector('[data-member-search-results]') || null,
    };
  };

  const closeMemberSearchPanel = () => {
    const { panel, status, results } = getMemberSearchElements();

    panel?.classList.add('hidden');

    if (status) {
      status.textContent = '';
    }

    if (results) {
      results.innerHTML = '';
    }
  };

  const setMemberSearchStatus = (message = '') => {
    const { panel, status, results } = getMemberSearchElements();

    if (!panel || !status || !results) {
      return;
    }

    panel.classList.remove('hidden');
    status.textContent = message;
    results.innerHTML = '';
  };

  const renderMemberSearchResults = (users = []) => {
    const { panel, status, results } = getMemberSearchElements();

    if (!panel || !status || !results) {
      return;
    }

    panel.classList.remove('hidden');
    status.textContent = '';
    results.innerHTML = users.map((user) => `
      <button
        type="button"
        class="member-user-picker__option"
        data-member-search-option
        data-member-email="${escapeHtml(user.email || '')}"
      >
        <strong>${escapeHtml(user.fullName || user.email || '')}</strong>
        <span>${escapeHtml([user.email, user.phone].filter(Boolean).join(' · '))}</span>
      </button>
    `).join('');
  };

  const searchMembersForInvitation = async (query) => {
    const { form } = getMemberSearchElements();
    const searchUrl = form?.dataset.memberSearchUrl || '';

    if (!form || !searchUrl) {
      return;
    }

    const normalizedQuery = String(query || '').trim();

    if (normalizedQuery.length < 2) {
      closeMemberSearchPanel();
      return;
    }

    window.clearTimeout(memberSearchTimer);
    memberSearchTimer = window.setTimeout(async () => {
      if (memberSearchController) {
        memberSearchController.abort();
      }

      memberSearchController = new AbortController();
      setMemberSearchStatus(form.dataset.memberSearchLoading || 'Searching users...');

      try {
        const url = new URL(searchUrl, window.location.origin);
        url.searchParams.set('q', normalizedQuery);

        const response = await fetch(url.toString(), {
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'same-origin',
          cache: 'no-store',
          signal: memberSearchController.signal,
        });

        if (!response.ok) {
          throw new Error('Member search failed.');
        }

        const payload = await response.json();
        const users = Array.isArray(payload.users) ? payload.users : [];

        if (!users.length) {
          setMemberSearchStatus(form.dataset.memberSearchEmpty || 'No registered active users found.');
          return;
        }

        renderMemberSearchResults(users);
      } catch (error) {
        if (!isAbortError(error)) {
          closeMemberSearchPanel();
        }
      }
    }, 220);
  };

  const selectMemberSearchOption = (option) => {
    const { input } = getMemberSearchElements();

    if (!option || !input) {
      return;
    }

    input.value = option.dataset.memberEmail || '';
    input.focus();
    closeMemberSearchPanel();
  };

  const captureLiveScrollState = () => {
    const scrollingElement = document.scrollingElement || document.documentElement;
    const accessTableScroll = document.querySelector('[data-access-table-scroll]');

    return {
      windowX: window.scrollX,
      windowY: window.scrollY,
      documentLeft: scrollingElement?.scrollLeft || 0,
      documentTop: scrollingElement?.scrollTop || 0,
      accessTableLeft: accessTableScroll?.scrollLeft ?? null,
      accessTableTop: accessTableScroll?.scrollTop ?? null,
    };
  };

  const restoreLiveScrollState = (state) => {
    if (!state) {
      return;
    }

    const scrollingElement = document.scrollingElement || document.documentElement;
    const accessTableScroll = document.querySelector('[data-access-table-scroll]');

    if (scrollingElement) {
      scrollingElement.scrollLeft = state.documentLeft || 0;
      scrollingElement.scrollTop = state.documentTop || 0;
    }

    window.scrollTo(state.windowX || 0, state.windowY || 0);

    if (accessTableScroll && state.accessTableTop !== null) {
      accessTableScroll.scrollLeft = state.accessTableLeft || 0;
      accessTableScroll.scrollTop = state.accessTableTop || 0;
    }
  };

  const refreshLiveSections = async (targetUrl = window.location.href, options = {}) => {
    const { abortPrevious = false } = options;
    const currentSections = [...document.querySelectorAll('[data-live-section]')];

    if (!currentSections.length) {
      window.location.href = targetUrl;
      return;
    }

    if (abortPrevious && activeRefreshController) {
      activeRefreshController.abort();
    }

    const controller = new AbortController();
    activeRefreshController = controller;
    const activeElement = document.activeElement;
    const scrollState = captureLiveScrollState();
    const focusedState = activeElement && activeElement.name
      ? {
          name: activeElement.name,
          value: activeElement.value,
          selectionStart: typeof activeElement.selectionStart === 'number' ? activeElement.selectionStart : null,
          selectionEnd: typeof activeElement.selectionEnd === 'number' ? activeElement.selectionEnd : null,
        }
      : null;

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Live refresh failed with status ${response.status}`);
      }

      const html = await response.text();
      const nextDocument = new DOMParser().parseFromString(html, 'text/html');
      let replacedSections = 0;
      const latestActiveElement = document.activeElement;
      const restoreFocusedState = focusedState && latestActiveElement?.name === focusedState.name
        ? {
            ...focusedState,
            value: latestActiveElement.value,
            selectionStart: typeof latestActiveElement.selectionStart === 'number'
              ? latestActiveElement.selectionStart
              : focusedState.selectionStart,
            selectionEnd: typeof latestActiveElement.selectionEnd === 'number'
              ? latestActiveElement.selectionEnd
              : focusedState.selectionEnd,
          }
        : focusedState;

      currentSections.forEach((section) => {
        const sectionName = section.dataset.liveSection;
        const nextSection = nextDocument.querySelector(`[data-live-section="${sectionName}"]`);

        if (!nextSection) {
          return;
        }

        section.replaceWith(nextSection);
        replacedSections += 1;
      });

      if (!replacedSections) {
        window.location.href = targetUrl;
        return;
      }

      if (restoreFocusedState) {
        const replacementInput = document.querySelector(`[name="${escapeSelector(restoreFocusedState.name)}"]`);

        if (replacementInput && typeof replacementInput.focus === 'function') {
          if ('value' in replacementInput) {
            replacementInput.value = restoreFocusedState.value;
          }

          try {
            replacementInput.focus({ preventScroll: true });
          } catch (error) {
            replacementInput.focus();
          }

          if (
            typeof replacementInput.setSelectionRange === 'function'
            && restoreFocusedState.selectionStart !== null
            && restoreFocusedState.selectionEnd !== null
          ) {
            replacementInput.setSelectionRange(restoreFocusedState.selectionStart, restoreFocusedState.selectionEnd);
          }
        }
      }

      restoreLiveScrollState(scrollState);
      window.dispatchEvent(new CustomEvent('codex:live-sections-refreshed'));
      window.requestAnimationFrame(() => {
        restoreLiveScrollState(scrollState);
      });
    } finally {
      if (activeRefreshController === controller) {
        activeRefreshController = null;
      }
    }
  };

  const triggerSocketLiveRefresh = async () => {
    if (getPassPrintElements().app) {
      return;
    }

    if (refreshInProgress) {
      pendingLiveRefresh = true;
      return;
    }

    refreshInProgress = true;

    try {
      do {
        pendingLiveRefresh = false;
        await refreshLiveSections(window.location.href, { abortPrevious: true });
      } while (pendingLiveRefresh);
    } catch (error) {
      window.location.reload();
    } finally {
      refreshInProgress = false;
    }
  };

  const setLiveSubmitterState = (submitter, isLoading) => {
    if (!(submitter instanceof HTMLElement)) {
      return;
    }

    submitter.classList.toggle('is-loading', isLoading);
    submitter.setAttribute('aria-busy', isLoading ? 'true' : 'false');

    if ('disabled' in submitter) {
      submitter.disabled = isLoading;
    }
  };

  const submitLiveForm = async (form, submitter = null) => {
    const formData = new FormData(form);
    const body = new URLSearchParams();

    formData.forEach((value, key) => {
      body.append(key, value);
    });

    setLiveSubmitterState(submitter, true);

    try {
      const response = await fetch(form.action, {
        method: (form.method || 'POST').toUpperCase(),
        body,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
      });

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok) {
        throw new Error(payload?.error || payload?.errors?.[0] || 'Request failed');
      }

      if (payload?.redirectTo) {
        window.location.href = payload.redirectTo;
        return;
      }

      if (payload?.message) {
        showLiveNotice(payload.message, 'success');
      }

      if (
        payload?.liveRequestUpsert
        && form.matches('[data-request-status-form], [data-access-request-form], [data-request-movement-form]')
      ) {
        const handled = applyAccessRequestUpsert(payload.liveRequestUpsert);
        suppressSocketRefreshUntil = Date.now() + 1800;

        if (handled) {
          return;
        }
      }

      try {
        await refreshLiveSections();
      } catch (error) {
        if (!isAbortError(error)) {
          throw error;
        }
      }
    } finally {
      setLiveSubmitterState(submitter, false);
    }
  };

  const getPortalState = () => {
    const stateNode = document.getElementById('portal-state');

    if (!stateNode) {
      return null;
    }

    try {
      return JSON.parse(stateNode.textContent);
    } catch (error) {
      return null;
    }
  };

  const getPortalUi = () => getPortalState()?.ui || {};

  const getPortalProfileId = () => document.querySelector('[data-portal-app]')?.dataset.portalProfileId || 'guest';

  const getPortalCategoryPreferenceKey = (type) => {
    if (!['pass', 'wristband'].includes(type)) {
      return null;
    }

    return `caurlaides.portal.category.${getPortalProfileId()}.${type}`;
  };

  const getPortalPreferredCategoryId = (type) => {
    const key = getPortalCategoryPreferenceKey(type);

    if (!key) {
      return '';
    }

    try {
      return window.localStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  };

  const setPortalPreferredCategoryId = (type, categoryId) => {
    const key = getPortalCategoryPreferenceKey(type);

    if (!key || !categoryId) {
      return;
    }

    try {
      window.localStorage.setItem(key, String(categoryId));
    } catch (error) {
      // Browser privacy settings can block localStorage; the form still works normally.
    }
  };

  const rememberPortalCategorySelection = (select) => {
    if (!select || !select.value) {
      return;
    }

    const type = select.dataset.portalCategoryType
      || (select.matches('[data-portal-import-category]') ? activePortalImportType : activePortalRequestType);

    setPortalPreferredCategoryId(type, select.value);
  };

  const getPortalWorkspaceCopy = () => {
    const app = document.querySelector('[data-portal-app]');

    if (!app) {
      return {};
    }

    return {
      tableTitle: app.dataset.portalTableTitle || 'All submitted requests',
      tableDescription: app.dataset.portalTableDescription || '',
      requestDescription: app.dataset.portalRequestDescription || '',
      importDescription: app.dataset.portalImportDescription || '',
    };
  };

  const getPortalAvailability = () => {
    const app = document.querySelector('[data-portal-app]');

    return {
      hasPassAccess: app?.dataset.portalHasPassAccess === 'true',
      hasWristbandAccess: app?.dataset.portalHasWristbandAccess === 'true',
    };
  };

  const getEventDashboardElements = () => ({
    app: document.querySelector('[data-event-dashboard-app]'),
    tabButtons: [...document.querySelectorAll('[data-event-dashboard-tab]')],
    panels: [...document.querySelectorAll('[data-event-dashboard-panel]')],
    vehicleGateApiPreview: document.querySelector('[data-vehicle-gate-api-preview]'),
    vehicleGateApiModeInput: document.querySelector('[data-vehicle-gate-api-mode-input]'),
    vehicleGateApiModeHelperTitle: document.querySelector('[data-vehicle-gate-api-mode-helper-title]'),
    vehicleGateApiModeHelperBody: document.querySelector('[data-vehicle-gate-api-mode-helper-body]'),
    vehicleGateApiRequestExample: document.querySelector('[data-vehicle-gate-api-request-example]'),
    vehicleGateApiSuccessExample: document.querySelector('[data-vehicle-gate-api-success-example]'),
    vehicleGateApiDeniedExample: document.querySelector('[data-vehicle-gate-api-denied-example]'),
  });

  const setEventDashboardTab = (tab, { updateHash = true } = {}) => {
    const elements = getEventDashboardElements();

    if (!elements.app) {
      return;
    }

    const availableTabs = elements.tabButtons
      .map((button) => button.dataset.eventDashboardTab)
      .filter(Boolean);
    const nextTab = availableTabs.includes(tab)
      ? tab
      : availableTabs.includes('summary')
        ? 'summary'
        : availableTabs[0] || 'summary';

    activeEventDashboardTab = nextTab;

    elements.tabButtons.forEach((button) => {
      const isActive = button.dataset.eventDashboardTab === nextTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    elements.panels.forEach((panel) => {
      const isActive = panel.dataset.eventDashboardPanel === nextTab;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
    });

    if (updateHash) {
      const nextHash = nextTab === 'api'
        ? '#api'
        : nextTab === 'link'
          ? '#check-link'
          : '';
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  };

  const buildVehicleGateApiExamples = (mode, previewRoot) => {
    const resolvedMode = ['entry', 'exit'].includes(mode) ? mode : 'decision';
    const resolvedDirection = resolvedMode === 'decision' ? null : 'entry';
    const currentPresence = resolvedDirection === 'exit' ? 'outside' : resolvedDirection === 'entry' ? 'inside' : 'unknown';
    const allowedMessage = previewRoot?.dataset.vehicleGateApiAllowedMessage || 'Allowed';
    const notFoundMessage = previewRoot?.dataset.vehicleGateApiNotFoundMessage || 'Vehicle not found';

    return {
      request: {
        plate: 'AB-1234',
        normalized_plate: 'AB1234',
        seen_at: '2026-04-17T12:30:00+03:00',
        camera_name: 'Gate A',
        ...(resolvedMode === 'exit' ? { direction: 'entry' } : {}),
        confidence: 0.98,
        vehicle_confidence: 0.97,
      },
      success: {
        success: true,
        decision: 'success',
        allowed: true,
        reason: null,
        message: allowedMessage,
        checkedPlate: 'AB-1234',
        currentPresence,
        movement: {
          mode: resolvedMode,
          configuredMode: resolvedMode,
          direction: resolvedDirection,
          recorded: resolvedDirection !== null,
          deduplicated: false,
          autoSwitched: false,
          explicitDirection: resolvedMode === 'exit',
        },
        request: {
          id: 128,
          fullName: 'Janis Berzins',
          companyName: 'Acme Logistics',
          categoryName: 'VIP Parking',
          profileName: 'Partners',
          vehiclePlate: 'AB-1234',
          createdAt: '2026-04-17T09:30:00.000Z',
          enteredAt: null,
          lastEntryAt: '2026-04-17T11:00:00.000Z',
          lastExitAt: '2026-04-17T11:35:00.000Z',
        },
      },
      denied: {
        success: true,
        decision: 'denied',
        allowed: false,
        reason: 'not_found',
        message: notFoundMessage,
        checkedPlate: 'ZZ-9999',
        currentPresence: 'unknown',
        movement: {
          mode: resolvedMode,
          configuredMode: resolvedMode,
          direction: resolvedDirection,
          recorded: false,
          deduplicated: false,
          autoSwitched: false,
          explicitDirection: resolvedMode === 'exit',
        },
        request: null,
      },
    };
  };

  const syncVehicleGateApiPreview = () => {
    const {
      vehicleGateApiPreview,
      vehicleGateApiModeInput,
      vehicleGateApiModeHelperTitle,
      vehicleGateApiModeHelperBody,
      vehicleGateApiRequestExample,
      vehicleGateApiSuccessExample,
      vehicleGateApiDeniedExample,
    } = getEventDashboardElements();

    if (!vehicleGateApiPreview || !vehicleGateApiModeInput) {
      return;
    }

    const mode = ['entry', 'exit'].includes(vehicleGateApiModeInput.value)
      ? vehicleGateApiModeInput.value
      : 'decision';
    const labelMap = {
      decision: vehicleGateApiPreview.dataset.vehicleGateApiModeDecisionLabel || 'Check only',
      entry: vehicleGateApiPreview.dataset.vehicleGateApiModeEntryLabel || 'Entry and exit toggle mode',
      exit: vehicleGateApiPreview.dataset.vehicleGateApiModeExitLabel || 'Two cameras for entry and exit',
    };
    const hintMap = {
      decision: vehicleGateApiPreview.dataset.vehicleGateApiModeDecisionHint || '',
      entry: vehicleGateApiPreview.dataset.vehicleGateApiModeEntryHint || '',
      exit: vehicleGateApiPreview.dataset.vehicleGateApiModeExitHint || '',
    };
    const examples = buildVehicleGateApiExamples(mode, vehicleGateApiPreview);

    if (vehicleGateApiModeHelperTitle) {
      vehicleGateApiModeHelperTitle.textContent = labelMap[mode] || labelMap.decision;
    }

    if (vehicleGateApiModeHelperBody) {
      vehicleGateApiModeHelperBody.textContent = hintMap[mode] || hintMap.decision;
    }

    if (vehicleGateApiRequestExample) {
      vehicleGateApiRequestExample.textContent = JSON.stringify(examples.request, null, 2);
    }

    if (vehicleGateApiSuccessExample) {
      vehicleGateApiSuccessExample.textContent = JSON.stringify(examples.success, null, 2);
    }

    if (vehicleGateApiDeniedExample) {
      vehicleGateApiDeniedExample.textContent = JSON.stringify(examples.denied, null, 2);
    }
  };

  const getCheckElements = () => ({
    app: document.querySelector('[data-check-app]'),
    form: document.querySelector('[data-check-form]'),
    formCard: document.querySelector('.check-form-card'),
    formStatus: document.querySelector('[data-check-form-status]'),
    formStatusLabel: document.querySelector('[data-check-form-status-label]'),
    formStatusPlate: document.querySelector('[data-check-form-status-plate]'),
    feedback: document.querySelector('[data-check-feedback]'),
    vehiclePlateInput: document.querySelector('[data-check-vehicle-plate]'),
    gateNameInput: document.querySelector('[data-check-gate-name]'),
    submitButtons: [...document.querySelectorAll('[data-check-submit-button]')],
    scannerOpenButton: document.querySelector('[data-check-scanner-open]'),
    scannerModal: document.querySelector('[data-check-scanner-modal]'),
    scannerVideo: document.querySelector('[data-check-scanner-video]'),
    scannerCanvas: document.querySelector('[data-check-scanner-canvas]'),
    scannerFrame: document.querySelector('[data-check-scanner-frame]'),
    scannerCandidate: document.querySelector('[data-check-scanner-candidate]'),
    scannerStatus: document.querySelector('[data-check-scanner-status]'),
    resultCard: document.querySelector('[data-check-result-card]'),
    resultEmpty: document.querySelector('[data-check-result-empty]'),
    resultContent: document.querySelector('[data-check-result-content]'),
    resultStatus: document.querySelector('[data-check-result-status]'),
    resultTitle: document.querySelector('[data-check-result-title]'),
    resultPlate: document.querySelector('[data-check-result-plate]'),
    resultMessage: document.querySelector('[data-check-result-message]'),
    resultPerson: document.querySelector('[data-check-result-person]'),
    resultCompany: document.querySelector('[data-check-result-company]'),
    resultType: document.querySelector('[data-check-result-type]'),
    resultPresence: document.querySelector('[data-check-result-presence]'),
    resultPerformedAt: document.querySelector('[data-check-result-performed-at]'),
    resultNote: document.querySelector('[data-check-result-note]'),
    recentList: document.querySelector('[data-check-recent-list]'),
    recentEmpty: document.querySelector('[data-check-recent-empty]'),
  });

  const getCheckUi = () => {
    const app = getCheckElements().app;

    if (!app) {
      return {};
    }

    return {
      resultHint: app.dataset.checkResultHint || 'Enter a number plate and choose whether the vehicle is entering or exiting.',
      recentEmptyLabel: app.dataset.checkRecentEmptyLabel || 'No vehicle movements registered yet for this event.',
      notSet: app.dataset.checkNotSet || '-',
      scannerLoadingLabel: app.dataset.checkScannerLoadingLabel || 'Preparing camera and OCR...',
      scannerAimLabel: app.dataset.checkScannerAimLabel || 'Aim the plate inside the frame.',
      scannerScanningLabel: app.dataset.checkScannerScanningLabel || 'Reading the plate...',
      scannerFoundLabel: app.dataset.checkScannerFoundLabel || 'Number found: {plate}',
      scannerNotFoundLabel: app.dataset.checkScannerNotFoundLabel || 'No clear number yet.',
      scannerErrorLabel: app.dataset.checkScannerErrorLabel || 'Could not start the camera scanner.',
      scannerUnsupportedLabel: app.dataset.checkScannerUnsupportedLabel || 'Camera access is not available in this browser.',
    };
  };

  let checkFeedbackTimer = null;
  let checkInputToneTimer = null;
  let checkFormCardToneTimer = null;
  let checkScannerScriptPromise = null;
  let checkScannerTfScriptPromise = null;
  let checkScannerDetectorModelPromise = null;
  let checkScannerDetectorModel = null;
  let checkScannerDetectorAvailable = null;
  let checkScannerDetectorInFlight = false;
  let checkScannerDetectorLastRunAt = 0;
  let checkScannerLastDetectedBox = null;
  let checkScannerLastDetectedBoxAt = 0;
  let checkScannerWorkerPromise = null;
  let checkScannerStream = null;
  let checkScannerTimer = null;
  let checkScannerActive = false;
  let checkScannerRecognizing = false;
  let checkScannerLastCandidate = '';
  let checkScannerStableCount = 0;
  let checkScannerCandidateScores = new Map();
  const checkScannerLetterCorrections = {
    0: 'O',
    1: 'I',
    2: 'Z',
    4: 'A',
    5: 'S',
    6: 'G',
    7: 'T',
    8: 'B',
  };
  const checkScannerDigitCorrections = {
    A: '4',
    B: '8',
    D: '0',
    G: '6',
    I: '1',
    L: '1',
    O: '0',
    Q: '0',
    S: '5',
    T: '7',
    Z: '2',
  };
  const checkScannerCropProfiles = [
    { width: 0.84, height: 0.24, top: 0.38, weight: 4 },
    { width: 0.92, height: 0.31, top: 0.345, weight: 2.5 },
    { width: 0.76, height: 0.2, top: 0.405, weight: 2 },
  ];

  const setCheckFormLoading = (isLoading) => {
    const { submitButtons } = getCheckElements();

    submitButtons.forEach((button) => {
      button.disabled = isLoading;
      button.classList.toggle('is-disabled', isLoading);
    });
  };

  const setCheckFeedback = (message = '', tone = 'neutral') => {
    const { feedback } = getCheckElements();

    if (!feedback) {
      return;
    }

    window.clearTimeout(checkFeedbackTimer);
    feedback.hidden = !message;
    feedback.textContent = message;
    feedback.classList.remove('is-success', 'is-error');

    if (!message) {
      return;
    }

    if (tone === 'success' || tone === 'error') {
      feedback.classList.add(`is-${tone}`);
    }

    checkFeedbackTimer = window.setTimeout(() => {
      feedback.hidden = true;
      feedback.textContent = '';
      feedback.classList.remove('is-success', 'is-error');
    }, 2600);
  };

  const formatCheckScannerLabel = (template, params = {}) => String(template || '').replace(/\{(\w+)\}/g, (match, key) => (
    params[key] === undefined || params[key] === null ? match : String(params[key])
  ));

  const setCheckScannerStatus = (message = '') => {
    const { scannerStatus } = getCheckElements();

    if (scannerStatus) {
      scannerStatus.textContent = message;
    }
  };

  const setCheckScannerCandidate = (plate = '', isFound = false) => {
    const { scannerFrame, scannerCandidate } = getCheckElements();

    if (scannerCandidate) {
      scannerCandidate.textContent = plate;
    }

    if (scannerFrame) {
      scannerFrame.classList.toggle('is-found', Boolean(isFound));
    }
  };

  const loadCheckScannerLibrary = () => {
    if (window.Tesseract?.createWorker) {
      return Promise.resolve();
    }

    if (!checkScannerScriptPromise) {
      checkScannerScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/public/vendor/tesseract/tesseract.min.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(getCheckUi().scannerErrorLabel));
        document.head.appendChild(script);
      });
    }

    return checkScannerScriptPromise;
  };

  const getCheckScannerWorker = async () => {
    await loadCheckScannerLibrary();

    if (!checkScannerWorkerPromise) {
      checkScannerWorkerPromise = window.Tesseract.createWorker('eng', 1, {
        workerPath: '/public/vendor/tesseract/worker.min.js',
        corePath: '/public/vendor/tesseract-core',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        logger: (progress) => {
          if (!checkScannerActive || !progress?.status) {
            return;
          }

          const percent = Number(progress.progress || 0);

          if (percent > 0 && percent < 1) {
            setCheckScannerStatus(`${getCheckUi().scannerLoadingLabel} ${Math.round(percent * 100)}%`);
          }
        },
      }).then(async (worker) => {
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
          tessedit_pageseg_mode: window.Tesseract?.PSM?.SINGLE_LINE || '7',
          preserve_interword_spaces: '0',
          user_defined_dpi: '300',
        });

        return worker;
      });
    }

    return checkScannerWorkerPromise;
  };

  const loadCheckScannerDetectorLibrary = () => {
    if (window.tf?.loadGraphModel) {
      return Promise.resolve();
    }

    if (!checkScannerTfScriptPromise) {
      checkScannerTfScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/public/vendor/tfjs/tf.min.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(getCheckUi().scannerErrorLabel));
        document.head.appendChild(script);
      });
    }

    return checkScannerTfScriptPromise;
  };

  const loadCheckScannerDetectorModel = () => {
    if (checkScannerDetectorAvailable === false) {
      return Promise.resolve(null);
    }

    if (checkScannerDetectorModel) {
      return Promise.resolve(checkScannerDetectorModel);
    }

    if (!checkScannerDetectorModelPromise) {
      checkScannerDetectorModelPromise = (async () => {
        const modelUrl = '/uploads/plate-scanner/model/model.json';
        const response = await fetch(modelUrl, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        }).catch(() => null);

        if (!response?.ok) {
          checkScannerDetectorAvailable = false;
          return null;
        }

        await response.text();
        await loadCheckScannerDetectorLibrary();
        const model = await window.tf.loadGraphModel(modelUrl);
        checkScannerDetectorModel = model;
        checkScannerDetectorAvailable = true;
        return model;
      })().catch(() => {
        checkScannerDetectorAvailable = false;
        checkScannerDetectorModel = null;
        return null;
      });
    }

    return checkScannerDetectorModelPromise;
  };

  const warmCheckScannerDetectorModel = () => {
    loadCheckScannerDetectorModel();
  };

  const getReadyCheckScannerDetectorModel = () => {
    warmCheckScannerDetectorModel();
    return checkScannerDetectorModel;
  };

  const calculateCheckScannerIou = (left, right) => {
    const x1 = Math.max(left.x1, right.x1);
    const y1 = Math.max(left.y1, right.y1);
    const x2 = Math.min(left.x2, right.x2);
    const y2 = Math.min(left.y2, right.y2);
    const width = Math.max(0, x2 - x1);
    const height = Math.max(0, y2 - y1);
    const intersection = width * height;
    const leftArea = Math.max(0, left.x2 - left.x1) * Math.max(0, left.y2 - left.y1);
    const rightArea = Math.max(0, right.x2 - right.x1) * Math.max(0, right.y2 - right.y1);
    const union = leftArea + rightArea - intersection;

    return union > 0 ? intersection / union : 0;
  };

  const suppressCheckScannerBoxes = (boxes, threshold = 0.24) => {
    const selected = [];

    boxes
      .filter((box) => box.score >= 0.32)
      .sort((left, right) => right.score - left.score)
      .forEach((box) => {
        if (selected.every((existing) => calculateCheckScannerIou(existing, box) < threshold)) {
          selected.push(box);
        }
      });

    return selected;
  };

  const setCheckScannerDetectedBox = (box = null) => {
    const { scannerFrame, scannerVideo } = getCheckElements();

    if (!scannerFrame || !scannerVideo || !box) {
      if (scannerFrame) {
        scannerFrame.classList.remove('is-detected');
        scannerFrame.style.left = '';
        scannerFrame.style.top = '';
        scannerFrame.style.width = '';
        scannerFrame.style.height = '';
        scannerFrame.style.right = '';
      }
      return;
    }

    const viewport = scannerFrame.parentElement;

    if (!viewport) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const scale = Math.max(
      viewportRect.width / scannerVideo.videoWidth,
      viewportRect.height / scannerVideo.videoHeight,
    );
    const displayWidth = scannerVideo.videoWidth * scale;
    const displayHeight = scannerVideo.videoHeight * scale;
    const offsetX = (viewportRect.width - displayWidth) / 2;
    const offsetY = (viewportRect.height - displayHeight) / 2;
    const left = offsetX + (box.x1 * scale);
    const top = offsetY + (box.y1 * scale);
    const width = Math.max(44, (box.x2 - box.x1) * scale);
    const height = Math.max(24, (box.y2 - box.y1) * scale);

    scannerFrame.classList.add('is-detected');
    scannerFrame.style.right = 'auto';
    scannerFrame.style.left = `${clampCheckScannerValue(left, 0, viewportRect.width - 12)}px`;
    scannerFrame.style.top = `${clampCheckScannerValue(top, 0, viewportRect.height - 12)}px`;
    scannerFrame.style.width = `${clampCheckScannerValue(width, 44, viewportRect.width)}px`;
    scannerFrame.style.height = `${clampCheckScannerValue(height, 24, viewportRect.height)}px`;
  };

  const detectCheckScannerPlateBox = async () => {
    const { scannerVideo } = getCheckElements();

    if (!scannerVideo?.videoWidth || !scannerVideo?.videoHeight) {
      return null;
    }

    const model = getReadyCheckScannerDetectorModel();

    if (!model || !window.tf) {
      return null;
    }

    const inputSize = 416;
    const inputCanvas = createCheckScannerCanvas(inputSize, inputSize);
    const inputContext = inputCanvas.getContext('2d', { willReadFrequently: true });
    inputContext.drawImage(scannerVideo, 0, 0, inputSize, inputSize);

    let output = null;
    let transposed = null;

    try {
      const input = window.tf.tidy(() => window.tf.browser
        .fromPixels(inputCanvas)
        .toFloat()
        .div(255)
        .expandDims(0));
      const rawOutput = await model.executeAsync?.(input) || model.execute(input);

      input.dispose();
      output = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;

      if (!output?.shape || output.shape.length < 3) {
        if (Array.isArray(rawOutput)) {
          rawOutput.forEach((tensor) => tensor?.dispose?.());
        } else {
          rawOutput?.dispose?.();
        }
        return null;
      }

      transposed = output.shape[1] <= 8
        ? output.transpose([0, 2, 1])
        : output;

      const rows = (await transposed.array())[0] || [];
      const boxes = rows
        .map((row) => {
          const score = Math.max(...row.slice(4).map(Number));

          if (!Number.isFinite(score)) {
            return null;
          }

          const cx = Number(row[0]);
          const cy = Number(row[1]);
          const width = Number(row[2]);
          const height = Number(row[3]);

          return {
            x1: clampCheckScannerValue((cx - (width / 2)) * scannerVideo.videoWidth / inputSize, 0, scannerVideo.videoWidth),
            y1: clampCheckScannerValue((cy - (height / 2)) * scannerVideo.videoHeight / inputSize, 0, scannerVideo.videoHeight),
            x2: clampCheckScannerValue((cx + (width / 2)) * scannerVideo.videoWidth / inputSize, 0, scannerVideo.videoWidth),
            y2: clampCheckScannerValue((cy + (height / 2)) * scannerVideo.videoHeight / inputSize, 0, scannerVideo.videoHeight),
            score,
          };
        })
        .filter((box) => box && box.x2 - box.x1 > 16 && box.y2 - box.y1 > 8);

      return suppressCheckScannerBoxes(boxes)[0] || null;
    } finally {
      if (transposed && transposed !== output) {
        transposed.dispose();
      }
      output?.dispose?.();
    }
  };

  const queueCheckScannerPlateDetection = () => {
    const now = Date.now();

    warmCheckScannerDetectorModel();

    if (
      checkScannerDetectorInFlight
      || !checkScannerDetectorModel
      || now - checkScannerDetectorLastRunAt < 1400
    ) {
      return;
    }

    checkScannerDetectorInFlight = true;
    checkScannerDetectorLastRunAt = now;

    window.setTimeout(async () => {
      try {
        const detectedBox = await detectCheckScannerPlateBox();

        if (detectedBox && checkScannerActive) {
          checkScannerLastDetectedBox = detectedBox;
          checkScannerLastDetectedBoxAt = Date.now();
        }
      } catch (error) {
        checkScannerLastDetectedBox = null;
        checkScannerLastDetectedBoxAt = 0;
      } finally {
        checkScannerDetectorInFlight = false;
      }
    }, 0);
  };

  const normalizeScannedPlateCandidate = (value = '') => String(value || '')
    .toUpperCase()
    .replace(/[|]/g, 'I')
    .replace(/[^A-Z0-9]/g, '');

  const mapCheckScannerLetter = (character) => (
    /[A-Z]/.test(character) ? character : checkScannerLetterCorrections[character] || ''
  );

  const mapCheckScannerDigit = (character) => (
    /\d/.test(character) ? character : checkScannerDigitCorrections[character] || ''
  );

  const scoreScannedPlateParts = (rawToken, prefixLength, letters, digits) => {
    let score = 0;

    score += prefixLength === 2 ? 6 : 1;
    score += digits.length >= 3 && digits.length <= 4 ? 5 : 1;
    score += /^[A-Z]/.test(rawToken) ? 1.2 : 0;
    score += /\d$/.test(rawToken) ? 1.2 : 0;
    score += [...rawToken.slice(0, prefixLength)].filter((character) => /[A-Z]/.test(character)).length * 0.8;
    score += [...rawToken.slice(prefixLength)].filter((character) => /\d/.test(character)).length * 0.8;

    if (/^[A-Z]{2}\d{3,4}$/.test(`${letters}${digits}`)) {
      score += 4;
    }

    return score;
  };

  const buildScannedPlateCandidateFromToken = (rawToken = '') => {
    const token = normalizeScannedPlateCandidate(rawToken);

    if (token.length < 4 || token.length > 8) {
      return null;
    }

    const candidates = [];

    for (let prefixLength = 1; prefixLength <= 3; prefixLength += 1) {
      const digitLength = token.length - prefixLength;

      if (digitLength < 2 || digitLength > 5) {
        continue;
      }

      const rawLetters = token.slice(0, prefixLength);
      const rawDigits = token.slice(prefixLength);
      const letters = [...rawLetters].map(mapCheckScannerLetter).join('');
      const digits = [...rawDigits].map(mapCheckScannerDigit).join('');

      if (!/^[A-Z]{1,3}$/.test(letters) || !/^\d{2,5}$/.test(digits)) {
        continue;
      }

      candidates.push({
        plate: `${letters}-${digits}`,
        score: scoreScannedPlateParts(token, prefixLength, letters, digits),
      });
    }

    return candidates.sort((left, right) => right.score - left.score)[0] || null;
  };

  const extractScannedPlate = (text = '') => {
    const rawText = String(text || '').toUpperCase();
    const compact = normalizeScannedPlateCandidate(rawText);
    const tokens = [
      ...rawText.split(/[^A-Z0-9]+/i),
      compact,
    ]
      .map(normalizeScannedPlateCandidate)
      .filter((token, index, items) => token.length >= 4 && items.indexOf(token) === index);
    const tokenWindows = [];

    tokens.forEach((token) => {
      if (token.length <= 8) {
        tokenWindows.push(token);
        return;
      }

      for (let start = 0; start <= token.length - 4; start += 1) {
        for (let length = 4; length <= 8 && start + length <= token.length; length += 1) {
          tokenWindows.push(token.slice(start, start + length));
        }
      }
    });

    return tokenWindows
      .map(buildScannedPlateCandidateFromToken)
      .filter(Boolean)
      .sort((left, right) => right.score - left.score)[0] || null;
  };

  const createCheckScannerCanvas = (width, height) => {
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;
    return canvas;
  };

  const clampCheckScannerValue = (value, min, max) => Math.max(min, Math.min(max, value));

  const getCheckScannerSourceCropFromViewportRect = (viewportCrop, padXRatio = 0, padYRatio = 0) => {
    const { scannerVideo } = getCheckElements();
    const viewport = scannerVideo?.parentElement;

    if (!scannerVideo?.videoWidth || !scannerVideo?.videoHeight || !viewport) {
      return null;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const videoWidth = scannerVideo.videoWidth;
    const videoHeight = scannerVideo.videoHeight;
    const scale = Math.max(
      viewportRect.width / videoWidth,
      viewportRect.height / videoHeight,
    );
    const displayWidth = videoWidth * scale;
    const displayHeight = videoHeight * scale;
    const offsetX = (viewportRect.width - displayWidth) / 2;
    const offsetY = (viewportRect.height - displayHeight) / 2;
    const sourceLeft = (viewportCrop.left - offsetX) / scale;
    const sourceTop = (viewportCrop.top - offsetY) / scale;
    const sourceWidth = viewportCrop.width / scale;
    const sourceHeight = viewportCrop.height / scale;
    const padX = sourceWidth * padXRatio;
    const padY = sourceHeight * padYRatio;
    const x1 = Math.round(clampCheckScannerValue(sourceLeft - padX, 0, videoWidth - 2));
    const y1 = Math.round(clampCheckScannerValue(sourceTop - padY, 0, videoHeight - 2));
    const x2 = Math.round(clampCheckScannerValue(sourceLeft + sourceWidth + padX, x1 + 2, videoWidth));
    const y2 = Math.round(clampCheckScannerValue(sourceTop + sourceHeight + padY, y1 + 2, videoHeight));

    if (x2 - x1 < 16 || y2 - y1 < 8) {
      return null;
    }

    return { x1, y1, x2, y2 };
  };

  const applyCheckScannerPreprocessing = (sourceCanvas, mode = 'contrast') => {
    const canvas = createCheckScannerCanvas(sourceCanvas.width, sourceCanvas.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });

    context.drawImage(sourceCanvas, 0, 0);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    const grayscaleValues = [];

    for (let index = 0; index < data.length; index += 4) {
      const grayscale = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
      grayscaleValues.push(grayscale);
    }

    const average = grayscaleValues.reduce((sum, value) => sum + value, 0) / Math.max(grayscaleValues.length, 1);
    const threshold = mode === 'binary-light'
      ? average + 12
      : mode === 'binary-dark'
        ? average - 18
        : average;

    for (let pixelIndex = 0, grayIndex = 0; pixelIndex < data.length; pixelIndex += 4, grayIndex += 1) {
      const grayscale = grayscaleValues[grayIndex] || 0;
      let value = grayscale;

      if (mode === 'binary-light' || mode === 'binary-dark') {
        value = grayscale > threshold ? 255 : 0;
      } else {
        value = clampCheckScannerValue(((grayscale - average) * 2.15) + 150, 0, 255);
      }

      data[pixelIndex] = value;
      data[pixelIndex + 1] = value;
      data[pixelIndex + 2] = value;
    }

    context.putImageData(imageData, 0, 0);
    return canvas;
  };

  const buildCheckScannerFramesFromSourceCrop = (
    sourceCrop,
    weight = 6,
    targetWidth = 1120,
    modes = ['contrast', 'binary-light', 'binary-dark'],
  ) => {
    const { scannerVideo } = getCheckElements();

    if (!scannerVideo || !sourceCrop) {
      return [];
    }

    const sourceX = sourceCrop.x1;
    const sourceY = sourceCrop.y1;
    const cropWidth = sourceCrop.x2 - sourceCrop.x1;
    const cropHeight = sourceCrop.y2 - sourceCrop.y1;
    const targetHeight = Math.max(180, Math.round((targetWidth * cropHeight) / cropWidth));
    const baseCanvas = createCheckScannerCanvas(targetWidth, targetHeight);
    const baseContext = baseCanvas.getContext('2d', { willReadFrequently: true });

    baseContext.drawImage(scannerVideo, sourceX, sourceY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);

    return modes.map((mode, index) => ({
      canvas: applyCheckScannerPreprocessing(baseCanvas, mode),
      weight: weight - (index * 0.5),
    }));
  };

  const buildCheckScannerFramesFromBox = (box, weight = 8) => {
    const { scannerVideo } = getCheckElements();

    if (!scannerVideo || !scannerVideo.videoWidth || !scannerVideo.videoHeight) {
      return [];
    }

    const videoWidth = scannerVideo.videoWidth;
    const videoHeight = scannerVideo.videoHeight;
    const boxWidth = Math.max(1, box.x2 - box.x1);
    const boxHeight = Math.max(1, box.y2 - box.y1);
    const padX = boxWidth * 0.24;
    const padY = boxHeight * 0.52;
    const sourceCrop = {
      x1: Math.round(clampCheckScannerValue(box.x1 - padX, 0, videoWidth - 2)),
      y1: Math.round(clampCheckScannerValue(box.y1 - padY, 0, videoHeight - 2)),
      x2: Math.round(clampCheckScannerValue(box.x2 + padX, 0, videoWidth)),
      y2: Math.round(clampCheckScannerValue(box.y2 + padY, 0, videoHeight)),
    };

    sourceCrop.x2 = Math.max(sourceCrop.x1 + 2, sourceCrop.x2);
    sourceCrop.y2 = Math.max(sourceCrop.y1 + 2, sourceCrop.y2);

    return buildCheckScannerFramesFromSourceCrop(sourceCrop, weight + 2, 1180);
  };

  const buildCheckScannerFramesFromViewportCrop = (
    viewportCrop,
    weight = 6,
    options = {},
  ) => {
    const sourceCrop = getCheckScannerSourceCropFromViewportRect(
      viewportCrop,
      options.padXRatio || 0,
      options.padYRatio || 0,
    );

    return buildCheckScannerFramesFromSourceCrop(
      sourceCrop,
      weight,
      options.targetWidth || 1120,
      options.modes || ['contrast', 'binary-light'],
    );
  };

  const buildCheckScannerFramesFromVisibleTarget = () => {
    const { scannerFrame, scannerVideo } = getCheckElements();
    const viewport = scannerVideo?.parentElement;

    if (!scannerFrame || !viewport) {
      return [];
    }

    const viewportRect = viewport.getBoundingClientRect();
    const frameRect = scannerFrame.getBoundingClientRect();
    const base = {
      left: frameRect.left - viewportRect.left,
      top: frameRect.top - viewportRect.top,
      width: frameRect.width,
      height: frameRect.height,
    };
    const variants = [
      {
        crop: base,
        weight: 8.5,
        options: {
          padXRatio: 0.04,
          padYRatio: 0.14,
          targetWidth: 1200,
          modes: ['contrast', 'binary-light', 'binary-dark'],
        },
      },
      {
        crop: {
          left: base.left + (base.width * 0.08),
          top: base.top + (base.height * 0.05),
          width: base.width * 0.84,
          height: base.height * 0.72,
        },
        weight: 7,
        options: {
          padXRatio: 0.06,
          padYRatio: 0.12,
          targetWidth: 1080,
          modes: ['contrast', 'binary-light'],
        },
      },
      {
        crop: {
          left: base.left + (base.width * 0.1),
          top: base.top + (base.height * 0.48),
          width: base.width * 0.8,
          height: base.height * 0.78,
        },
        weight: 5.5,
        options: {
          padXRatio: 0.08,
          padYRatio: 0.12,
          targetWidth: 980,
          modes: ['contrast'],
        },
      },
    ];

    return variants.flatMap((variant) => buildCheckScannerFramesFromViewportCrop(
      variant.crop,
      variant.weight,
      variant.options,
    ));
  };

  const captureCheckScannerFrames = async () => {
    const { scannerVideo, scannerCanvas } = getCheckElements();

    if (!scannerVideo || !scannerCanvas || !scannerVideo.videoWidth || !scannerVideo.videoHeight) {
      return [];
    }

    const frames = [];

    queueCheckScannerPlateDetection();

    const detectedBox = checkScannerLastDetectedBox
      && Date.now() - checkScannerLastDetectedBoxAt < 3500
      ? checkScannerLastDetectedBox
      : null;

    if (detectedBox) {
      setCheckScannerDetectedBox(detectedBox);
      frames.push(...buildCheckScannerFramesFromBox(detectedBox, 9));
    } else {
      setCheckScannerDetectedBox(null);
    }

    frames.push(...buildCheckScannerFramesFromVisibleTarget());

    const viewport = scannerVideo.parentElement;
    const viewportRect = viewport?.getBoundingClientRect();

    if (!viewportRect) {
      return frames;
    }

    checkScannerCropProfiles.forEach((profile, profileIndex) => {
      const cropWidth = viewportRect.width * profile.width;
      const cropHeight = viewportRect.height * profile.height;
      const viewportCrop = {
        left: (viewportRect.width - cropWidth) / 2,
        top: clampCheckScannerValue(viewportRect.height * profile.top, 0, viewportRect.height - cropHeight),
        width: cropWidth,
        height: cropHeight,
      };

      frames.push(...buildCheckScannerFramesFromViewportCrop(
        viewportCrop,
        profile.weight + 1,
        {
          padXRatio: 0.04,
          padYRatio: profileIndex === 0 ? 0.18 : 0.12,
          targetWidth: profileIndex === 0 ? 1100 : 980,
          modes: profileIndex === 0 ? ['contrast', 'binary-light'] : ['contrast'],
        },
      ));
    });

    return frames;
  };

  const closeCheckScanner = () => {
    const { scannerModal, scannerVideo } = getCheckElements();

    checkScannerActive = false;
    checkScannerRecognizing = false;
    window.clearTimeout(checkScannerTimer);
    checkScannerTimer = null;
    checkScannerCandidateScores = new Map();
    checkScannerLastCandidate = '';
    checkScannerStableCount = 0;
    checkScannerDetectorInFlight = false;
    checkScannerLastDetectedBox = null;
    checkScannerLastDetectedBoxAt = 0;

    if (checkScannerStream) {
      checkScannerStream.getTracks().forEach((track) => track.stop());
      checkScannerStream = null;
    }

    if (scannerVideo) {
      scannerVideo.pause();
      scannerVideo.srcObject = null;
    }

    if (scannerModal) {
      scannerModal.classList.add('hidden');
      scannerModal.setAttribute('aria-hidden', 'true');
    }

    document.body.classList.remove('is-check-scanner-open');
    setCheckScannerDetectedBox(null);
    setCheckScannerCandidate('', false);
  };

  const completeCheckScanner = (plate) => {
    const { vehiclePlateInput } = getCheckElements();
    const ui = getCheckUi();

    checkScannerActive = false;
    window.clearTimeout(checkScannerTimer);
    setCheckScannerCandidate(plate, true);
    setCheckScannerStatus(formatCheckScannerLabel(ui.scannerFoundLabel, { plate }));

    if (vehiclePlateInput) {
      vehiclePlateInput.value = plate;
      vehiclePlateInput.dispatchEvent(new Event('input', { bubbles: true }));
      vehiclePlateInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    window.setTimeout(() => {
      closeCheckScanner();
      vehiclePlateInput?.focus?.();
      vehiclePlateInput?.select?.();
      pulseCheckVehicleInput('success');
    }, 620);
  };

  const scheduleCheckScannerScan = (delay = 620) => {
    window.clearTimeout(checkScannerTimer);

    if (checkScannerActive) {
      checkScannerTimer = window.setTimeout(runCheckScannerScan, delay);
    }
  };

  const decayCheckScannerScores = () => {
    checkScannerCandidateScores.forEach((score, plate) => {
      const nextScore = score * 0.64;

      if (nextScore < 4) {
        checkScannerCandidateScores.delete(plate);
      } else {
        checkScannerCandidateScores.set(plate, nextScore);
      }
    });
  };

  const addCheckScannerCandidateScore = (candidate, confidence = 0, frameWeight = 0) => {
    const plate = candidate?.plate || '';

    if (!plate) {
      return 0;
    }

    const normalizedConfidence = clampCheckScannerValue(Number(confidence || 0), 0, 100);
    const nextScore = (checkScannerCandidateScores.get(plate) || 0)
      + Number(candidate.score || 0)
      + Number(frameWeight || 0)
      + (normalizedConfidence / 18);

    checkScannerCandidateScores.set(plate, nextScore);
    return nextScore;
  };

  const getBestCheckScannerCandidate = () => [...checkScannerCandidateScores.entries()]
    .sort((left, right) => right[1] - left[1])[0] || null;

  async function runCheckScannerScan() {
    if (!checkScannerActive || checkScannerRecognizing) {
      return;
    }

    const ui = getCheckUi();
    const frameCanvases = (await captureCheckScannerFrames()).slice(0, 6);

    if (!frameCanvases.length) {
      scheduleCheckScannerScan(320);
      return;
    }

    checkScannerRecognizing = true;
    setCheckScannerStatus(ui.scannerScanningLabel);

    try {
      const worker = await getCheckScannerWorker();
      const frameHits = new Map();

      for (const frame of frameCanvases) {
        if (!checkScannerActive) {
          return;
        }

        const result = await worker.recognize(frame.canvas);
        const data = result?.data || {};
        const candidate = extractScannedPlate([
          data.text || '',
          ...(data.words || []).map((word) => word.text || ''),
        ].join(' '));

        if (!candidate?.plate) {
          continue;
        }

        addCheckScannerCandidateScore(candidate, data.confidence, frame.weight);
        frameHits.set(candidate.plate, (frameHits.get(candidate.plate) || 0) + 1);
      }

      const bestCandidate = getBestCheckScannerCandidate();

      if (bestCandidate) {
        const [plate, score] = bestCandidate;
        const hits = frameHits.get(plate) || 0;

        checkScannerStableCount = plate === checkScannerLastCandidate ? checkScannerStableCount + 1 : 1;
        checkScannerLastCandidate = plate;
        setCheckScannerCandidate(plate, true);
        setCheckScannerStatus(formatCheckScannerLabel(ui.scannerFoundLabel, { plate }));

        if (
          (hits >= 2 && score >= 34)
          || (checkScannerStableCount >= 2 && score >= 42)
          || score >= 58
        ) {
          completeCheckScanner(plate);
          return;
        }
      } else {
        decayCheckScannerScores();
        checkScannerStableCount = 0;
        checkScannerLastCandidate = '';
        setCheckScannerCandidate('', false);
        setCheckScannerStatus(ui.scannerNotFoundLabel);
      }
    } catch (error) {
      checkScannerStableCount = 0;
      setCheckScannerCandidate('', false);
      setCheckScannerStatus(error?.message || ui.scannerErrorLabel);
    } finally {
      checkScannerRecognizing = false;
      scheduleCheckScannerScan(720);
    }
  }

  const openCheckScanner = async () => {
    const {
      scannerModal,
      scannerVideo,
      scannerOpenButton,
    } = getCheckElements();
    const ui = getCheckUi();

    if (!scannerModal || !scannerVideo) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCheckFeedback(ui.scannerUnsupportedLabel, 'error');
      scannerOpenButton?.setAttribute('disabled', 'disabled');
      return;
    }

    closeCheckScanner();
    checkScannerActive = true;
    checkScannerStableCount = 0;
    checkScannerLastCandidate = '';
    setCheckScannerCandidate('', false);
    setCheckScannerStatus(ui.scannerLoadingLabel);
    scannerModal.classList.remove('hidden');
    scannerModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-check-scanner-open');

    try {
      checkScannerStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      scannerVideo.srcObject = checkScannerStream;
      await scannerVideo.play();
      await getCheckScannerWorker();
      setCheckScannerStatus(ui.scannerAimLabel);
      scheduleCheckScannerScan(420);
      window.setTimeout(warmCheckScannerDetectorModel, 1200);
    } catch (error) {
      closeCheckScanner();
      setCheckFeedback(error?.message || ui.scannerErrorLabel, 'error');
    }
  };

  const pulseCheckVehicleInput = (tone = 'success') => {
    const { vehiclePlateInput } = getCheckElements();

    if (!vehiclePlateInput) {
      return;
    }

    window.clearTimeout(checkInputToneTimer);
    vehiclePlateInput.classList.remove('is-check-success', 'is-check-error');
    vehiclePlateInput.classList.add(tone === 'error' ? 'is-check-error' : 'is-check-success');

    checkInputToneTimer = window.setTimeout(() => {
      vehiclePlateInput.classList.remove('is-check-success', 'is-check-error');
    }, 1200);
  };

  const pulseCheckFormCard = (tone = 'success') => {
    const { formCard } = getCheckElements();

    if (!formCard) {
      return;
    }

    window.clearTimeout(checkFormCardToneTimer);
    formCard.classList.remove('is-check-success', 'is-check-error');
    formCard.classList.add(tone === 'error' ? 'is-check-error' : 'is-check-success');

    checkFormCardToneTimer = window.setTimeout(() => {
      formCard.classList.remove('is-check-success', 'is-check-error');
    }, 1300);
  };

  const renderCheckRecentItems = (items = []) => items.map((item) => {
    const detailParts = [
      item.companyName,
      item.categoryName,
      item.gateName,
    ].filter(Boolean);

    return `
      <div class="check-recent-item">
        <div>
          <p>${escapeHtml(item.vehiclePlate || '')} · ${escapeHtml(item.fullName || '')}</p>
          <span>${escapeHtml(item.directionLabel || '')} · ${escapeHtml(item.createdAtLabel || '')}</span>
          ${detailParts.length ? `<small>${escapeHtml(detailParts.join(' · '))}</small>` : ''}
        </div>

        <span class="check-recent-pill ${item.direction === 'exit' ? 'is-exit' : 'is-entry'}">
            ${escapeHtml(item.directionLabel || '')}
        </span>
      </div>
    `;
  }).join('');

  const renderCheckResult = (result) => {
    const {
      resultCard,
      resultEmpty,
      resultContent,
      formStatus,
      formStatusLabel,
      formStatusPlate,
      resultStatus,
      resultTitle,
      resultPlate,
      resultMessage,
      resultPerson,
      resultCompany,
      resultType,
      resultPresence,
      resultPerformedAt,
      resultNote,
    } = getCheckElements();
    const ui = getCheckUi();

    if (!resultCard || !resultEmpty || !resultContent || !result) {
      return;
    }

    resultCard.classList.remove('is-entry', 'is-exit', 'is-check', 'is-denied');
    resultCard.classList.add(
      result.allowed === false
        ? 'is-denied'
        : result.direction === 'exit'
        ? 'is-exit'
        : result.direction === 'check'
          ? 'is-check'
          : 'is-entry',
    );
    resultEmpty.classList.add('hidden');
    resultContent.classList.remove('hidden');

    if (formStatus) {
      formStatus.classList.remove('hidden', 'is-denied');
      formStatus.classList.toggle('is-denied', result.allowed === false);
    }

    if (formStatusLabel) {
      formStatusLabel.textContent = result.statusLabel || result.directionTitle || '';
    }

    if (formStatusPlate) {
      formStatusPlate.textContent = result.request?.vehiclePlate || result.checkedPlate || '';
    }

    if (resultStatus) {
      resultStatus.textContent = result.statusLabel || result.directionTitle || '';
    }

    if (resultTitle) {
      resultTitle.textContent = result.directionTitle || '';
    }

    if (resultPlate) {
      resultPlate.textContent = result.request?.vehiclePlate || result.checkedPlate || '';
    }

    if (resultMessage) {
      resultMessage.textContent = result.message || '';
      resultMessage.classList.toggle('hidden', !result.message);
    }

    if (resultPerson) {
      resultPerson.textContent = result.request?.fullName || ui.notSet;
    }

    if (resultCompany) {
      resultCompany.textContent = result.request?.companyName || ui.notSet;
    }

    if (resultType) {
      resultType.textContent = result.request?.categoryName || ui.notSet;
    }

    if (resultPresence) {
      resultPresence.textContent = result.currentPresenceLabel || ui.notSet;
    }

    if (resultPerformedAt) {
      resultPerformedAt.textContent = result.performedAtLabel || ui.notSet;
    }

    if (resultNote) {
      resultNote.textContent = result.alreadyEnteredMessage || '';
      resultNote.classList.toggle('hidden', !result.alreadyEnteredMessage);
    }
  };

  const renderCheckRecentMovements = (items = []) => {
    const { recentList, recentEmpty } = getCheckElements();
    const ui = getCheckUi();

    if (recentList) {
      recentList.innerHTML = items.length ? renderCheckRecentItems(items) : '';
      recentList.classList.toggle('hidden', !items.length);
    }

    if (recentEmpty) {
      recentEmpty.textContent = ui.recentEmptyLabel || recentEmpty.textContent;
      recentEmpty.classList.toggle('hidden', Boolean(items.length));
    }
  };

  const submitCheckForm = async (form, submitter = null) => {
    const { vehiclePlateInput } = getCheckElements();
    const direction = submitter?.value === 'exit'
      ? 'exit'
      : submitter?.value === 'entry'
        ? 'entry'
        : 'check';
    const formData = new FormData(form);
    const body = new URLSearchParams();
    const csrfValue = form.querySelector('input[name="_csrf"]')?.value || '';

    formData.forEach((value, key) => {
      body.append(key, value);
    });
    body.set('direction', direction);
    setCheckFormLoading(true);
    setCheckFeedback('');

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'CSRF-Token': csrfValue,
        },
        credentials: 'same-origin',
      });

      let payload = null;

      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || payload?.errors?.[0] || 'Request failed.');
      }

      renderCheckResult(payload.result || null);
      renderCheckRecentMovements(payload.recentMovements || []);
      const isAllowed = payload?.allowed !== false && payload?.result?.allowed !== false;
      setCheckFeedback(payload.message || '', isAllowed ? 'success' : 'error');
      pulseCheckVehicleInput(isAllowed ? 'success' : 'error');
      pulseCheckFormCard(isAllowed ? 'success' : 'error');

      if (vehiclePlateInput) {
        if (isAllowed) {
          vehiclePlateInput.value = '';
          vehiclePlateInput.focus();
        } else {
          vehiclePlateInput.focus();
          vehiclePlateInput.select();
        }
      }
    } catch (error) {
      setCheckFeedback(error.message || 'Request failed.', 'error');
      pulseCheckVehicleInput('error');
      pulseCheckFormCard('error');
      vehiclePlateInput?.focus?.();
      vehiclePlateInput?.select?.();
    } finally {
      setCheckFormLoading(false);
    }
  };

  const initializeCheckUI = () => {
    const {
      app,
      resultContent,
      resultEmpty,
      recentList,
      recentEmpty,
      scannerOpenButton,
    } = getCheckElements();
    const ui = getCheckUi();

    if (!app) {
      return;
    }

    if (resultEmpty && !resultContent?.classList.contains('hidden')) {
      resultEmpty.classList.add('hidden');
    } else if (resultEmpty && resultContent?.classList.contains('hidden')) {
      resultEmpty.classList.remove('hidden');
    }

    if (recentEmpty && recentList) {
      recentEmpty.classList.toggle('hidden', !recentList.classList.contains('hidden') && recentList.children.length > 0);
    }

    if (scannerOpenButton && !navigator.mediaDevices?.getUserMedia) {
      scannerOpenButton.disabled = true;
      scannerOpenButton.title = ui.scannerUnsupportedLabel;
      scannerOpenButton.setAttribute('aria-label', ui.scannerUnsupportedLabel);
    }
  };

  const initializePlateScannerSettings = () => {
    const form = document.querySelector('[data-plate-scanner-sample-form]');

    if (!form || form.dataset.plateScannerInitialized === 'true') {
      return;
    }

    form.dataset.plateScannerInitialized = 'true';

    const fileInput = form.querySelector('[data-plate-scanner-image-input]');
    const annotator = form.querySelector('[data-plate-scanner-annotator]');
    const image = form.querySelector('[data-plate-scanner-image-preview]');
    const box = form.querySelector('[data-plate-scanner-box]');
    const boxInputs = {
      x: form.querySelector('[data-plate-box-x]'),
      y: form.querySelector('[data-plate-box-y]'),
      width: form.querySelector('[data-plate-box-width]'),
      height: form.querySelector('[data-plate-box-height]'),
    };
    let previewUrl = '';
    let dragStart = null;

    const setBoxInputs = (nextBox = null) => {
      Object.values(boxInputs).forEach((input) => {
        if (input) {
          input.value = '';
        }
      });

      if (!nextBox) {
        annotator?.classList.remove('has-box');
        return;
      }

      boxInputs.x.value = nextBox.x.toFixed(6);
      boxInputs.y.value = nextBox.y.toFixed(6);
      boxInputs.width.value = nextBox.width.toFixed(6);
      boxInputs.height.value = nextBox.height.toFixed(6);
      annotator?.classList.add('has-box');
    };

    const getAnnotatorPoint = (event) => {
      if (!annotator || !image?.src) {
        return null;
      }

      const imageRect = image.getBoundingClientRect();

      if (!imageRect.width || !imageRect.height) {
        return null;
      }

      return {
        x: clampCheckScannerValue((event.clientX - imageRect.left) / imageRect.width, 0, 1),
        y: clampCheckScannerValue((event.clientY - imageRect.top) / imageRect.height, 0, 1),
      };
    };

    const renderAnnotationBox = (nextBox = null) => {
      if (!box || !annotator || !image || !nextBox) {
        setBoxInputs(null);
        return;
      }

      const annotatorRect = annotator.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const left = (imageRect.left - annotatorRect.left) + (nextBox.x * imageRect.width);
      const top = (imageRect.top - annotatorRect.top) + (nextBox.y * imageRect.height);

      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${nextBox.width * imageRect.width}px`;
      box.style.height = `${nextBox.height * imageRect.height}px`;
      setBoxInputs(nextBox);
    };

    const handleDragMove = (event) => {
      if (!dragStart) {
        return;
      }

      const point = getAnnotatorPoint(event);

      if (!point) {
        return;
      }

      const nextBox = {
        x: Math.min(dragStart.x, point.x),
        y: Math.min(dragStart.y, point.y),
        width: Math.abs(point.x - dragStart.x),
        height: Math.abs(point.y - dragStart.y),
      };

      renderAnnotationBox(nextBox);
    };

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = '';
      }

      setBoxInputs(null);

      if (!file || !image || !annotator) {
        annotator?.classList.add('is-empty');
        return;
      }

      previewUrl = URL.createObjectURL(file);
      image.src = previewUrl;
      image.onload = () => {
        annotator.classList.remove('is-empty');
      };
    });

    annotator?.addEventListener('pointerdown', (event) => {
      if (!image?.src || annotator.classList.contains('is-empty')) {
        return;
      }

      event.preventDefault();
      dragStart = getAnnotatorPoint(event);
      annotator.setPointerCapture?.(event.pointerId);
    });

    annotator?.addEventListener('pointermove', handleDragMove);

    const endDrag = (event) => {
      if (!dragStart) {
        return;
      }

      handleDragMove(event);
      dragStart = null;
      annotator.releasePointerCapture?.(event.pointerId);

      if (Number(boxInputs.width?.value || 0) < 0.01 || Number(boxInputs.height?.value || 0) < 0.01) {
        setBoxInputs(null);
      }
    };

    annotator?.addEventListener('pointerup', endDrag);
    annotator?.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', () => {
      if (boxInputs.width?.value) {
        renderAnnotationBox({
          x: Number(boxInputs.x.value),
          y: Number(boxInputs.y.value),
          width: Number(boxInputs.width.value),
          height: Number(boxInputs.height.value),
        });
      }
    });

    form.addEventListener('submit', (event) => {
      if (!boxInputs.width?.value || !boxInputs.height?.value) {
        event.preventDefault();
        annotator?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        annotator?.classList.add('is-error');
        window.setTimeout(() => annotator?.classList.remove('is-error'), 1200);
      }
    });
  };

  const getPassPrintElements = () => {
    const app = document.querySelector('[data-pass-print-app]');
    const stateScriptId = app?.dataset.passPrintStateScript || 'pass-print-state';

    return {
      app,
      stateScript: document.getElementById(stateScriptId),
      tabs: [...document.querySelectorAll('[data-pass-print-tab]')],
      panels: [...document.querySelectorAll('[data-pass-print-panel]')],
      form: document.querySelector('[data-pass-print-form]'),
      importForm: document.querySelector('[data-pass-print-import-form]'),
      fieldsInput: document.querySelector('[data-pass-print-fields-input]'),
      backgroundRotationInput: document.querySelector('[data-pass-print-background-rotation-input]'),
      templateOrientationInput: document.querySelector('[data-pass-print-template-orientation]'),
      templateTextColorInput: document.querySelector('[data-pass-print-template-text-color]'),
      orientationLabel: document.querySelector('[data-pass-print-orientation-label]'),
      page: document.querySelector('[data-pass-print-page]'),
      backgroundLayer: document.querySelector('[data-pass-print-background-layer]'),
      fieldLayer: document.querySelector('[data-pass-print-field-layer]'),
      emptyState: document.querySelector('[data-pass-print-empty-state]'),
      addButtons: [...document.querySelectorAll('[data-pass-print-add-field]')],
      inspectorTitle: document.querySelector('[data-pass-print-inspector-title]'),
      fieldType: document.querySelector('[data-pass-print-field-type]'),
      fieldText: document.querySelector('[data-pass-print-field-text]'),
      fieldVariableFontSize: document.querySelector('[data-pass-print-field-variable-font-size]'),
      fieldVariableFontWeight: document.querySelector('[data-pass-print-field-variable-font-weight]'),
      fieldPrefixFontSize: document.querySelector('[data-pass-print-field-prefix-font-size]'),
      fieldPrefixFontWeight: document.querySelector('[data-pass-print-field-prefix-font-weight]'),
      fieldTextAlign: document.querySelector('[data-pass-print-field-text-align]'),
      fieldBorderEnabled: document.querySelector('[data-pass-print-field-border-enabled]'),
      fieldBorderColor: document.querySelector('[data-pass-print-field-border-color]'),
      fieldWidth: document.querySelector('[data-pass-print-field-width]'),
      positionX: document.querySelector('[data-pass-print-field-position-x]'),
      positionY: document.querySelector('[data-pass-print-field-position-y]'),
      rotationValue: document.querySelector('[data-pass-print-field-rotation]'),
      removeFieldButton: document.querySelector('[data-pass-print-remove-field]'),
      rotateFieldButton: document.querySelector('[data-pass-print-rotate-field]'),
      backgroundInput: document.querySelector('[data-pass-print-background-input]'),
      removeBackgroundInput: document.querySelector('[data-pass-print-remove-background]'),
      removeBackgroundButton: document.querySelector('[data-pass-print-remove-background-button]'),
      rotateBackgroundButton: document.querySelector('[data-pass-print-rotate-background]'),
      backgroundRotationValue: document.querySelector('[data-pass-print-background-rotation-value]'),
      fullscreenTarget: document.querySelector('[data-pass-print-fullscreen-target]'),
      fullscreenToggles: [...document.querySelectorAll('[data-pass-print-fullscreen-toggle]')],
      previewModal: document.querySelector('[data-pass-print-preview-modal]'),
      previewFrame: document.querySelector('[data-pass-print-preview-frame]'),
      previewLoading: document.querySelector('[data-pass-print-preview-loading]'),
      previewError: document.querySelector('[data-pass-print-preview-error]'),
      previewRequestId: document.querySelector('[data-pass-print-preview-request-id]'),
    };
  };

  let passPrintEditorState = {
    canManage: false,
    fields: [],
    variables: [],
    selectedId: '',
    selectedIds: [],
    activeTab: 'editor',
    currentBackgroundUrl: '',
    currentBackgroundRotation: 0,
    backgroundRotation: 0,
    orientation: 'portrait',
    textColor: '#0f172a',
    uploadedBackgroundUrl: '',
    previewObjectUrl: '',
    drag: null,
    fullscreen: false,
  };

  const normalizePassPrintQuarterTurn = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return ((((Math.round(numericValue / 90) * 90) % 360) + 360) % 360);
  };

  const normalizePassPrintOrientation = (value) => (
    value === 'landscape' ? 'landscape' : 'portrait'
  );

  const normalizePassPrintTextAlign = (value) => (
    ['left', 'center', 'right'].includes(value) ? value : 'left'
  );

  const normalizePassPrintFontWeight = (value, fallback = '700') => {
    const fontWeight = String(value || '').trim();
    return ['400', '600', '700', '800'].includes(fontWeight) ? fontWeight : fallback;
  };

  const normalizePassPrintFontSize = (value, fallback = 18) => {
    const fontSize = Number(value);
    return Number.isFinite(fontSize) ? Math.min(Math.max(fontSize, 8), 96) : fallback;
  };

  const normalizePassPrintColor = (value, fallback = '#0f172a') => {
    const color = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
  };

  const getPassPrintPageDimensions = (orientation) => (
    normalizePassPrintOrientation(orientation) === 'landscape'
      ? { width: 297, height: 210 }
      : { width: 210, height: 297 }
  );

  const getPassPrintBackgroundFrame = (rotation, orientation = 'portrait') => {
    const normalizedRotation = normalizePassPrintQuarterTurn(rotation);
    const pageDimensions = getPassPrintPageDimensions(orientation);

    switch (normalizedRotation) {
      case 90:
        return {
          left: '100%',
          top: '0%',
          width: `${(pageDimensions.height / pageDimensions.width) * 100}%`,
          height: `${(pageDimensions.width / pageDimensions.height) * 100}%`,
          rotation: '90deg',
        };
      case 180:
        return {
          left: '100%',
          top: '100%',
          width: '100%',
          height: '100%',
          rotation: '180deg',
        };
      case 270:
        return {
          left: '0%',
          top: '100%',
          width: `${(pageDimensions.height / pageDimensions.width) * 100}%`,
          height: `${(pageDimensions.width / pageDimensions.height) * 100}%`,
          rotation: '270deg',
        };
      default:
        return {
          left: '0%',
          top: '0%',
          width: '100%',
          height: '100%',
          rotation: '0deg',
        };
    }
  };

  const parsePassPrintState = () => {
    const { app, stateScript } = getPassPrintElements();

    if (!app || !stateScript) {
      return null;
    }

    try {
      const parsed = JSON.parse(stateScript.textContent || '{}');

      return {
        canManage: app.dataset.passPrintCanManage === 'true' && Boolean(parsed.canManage),
        fields: Array.isArray(parsed.template?.fields) ? parsed.template.fields : [],
        variables: Array.isArray(parsed.variables) ? parsed.variables : [],
        currentBackgroundUrl: parsed.template?.backgroundUrl || '',
        backgroundRotation: normalizePassPrintQuarterTurn(parsed.template?.backgroundRotation),
        orientation: normalizePassPrintOrientation(parsed.template?.orientation),
        textColor: normalizePassPrintColor(
          parsed.template?.textColor || parsed.template?.fields?.find((field) => field?.textColor)?.textColor,
        ),
        activeTab: 'editor',
      };
    } catch (error) {
      return null;
    }
  };

  const getPassPrintVariableLabel = (type) => (
    passPrintEditorState.variables.find((variable) => variable.type === type)?.label || type || ''
  );

  const getPassPrintFieldPreviewHtml = (field) => {
    const text = String(field?.text || '');
    const variableLabel = getPassPrintVariableLabel(field?.type);
    const prefixFontSize = normalizePassPrintFontSize(field?.prefixFontSize ?? field?.fontSize, 18);
    const variableFontSize = normalizePassPrintFontSize(field?.variableFontSize ?? field?.fontSize, 18);
    const prefixFontWeight = normalizePassPrintFontWeight(field?.prefixFontWeight, '600');
    const variableFontWeight = normalizePassPrintFontWeight(field?.variableFontWeight, '700');
    const prefixStyle = `font-size:${prefixFontSize}px;font-weight:${prefixFontWeight};`;
    const variableStyle = `font-size:${variableFontSize}px;font-weight:${variableFontWeight};`;

    if (field?.type === 'customText') {
      return `<span class="pass-print-field__prefix${text ? '' : ' is-placeholder'}" style="${prefixStyle}">${escapeHtml(text || variableLabel)}</span>`;
    }

    return `${text ? `<span class="pass-print-field__prefix" style="${prefixStyle}">${escapeHtml(text)}</span>` : ''}<span class="pass-print-field__variable" style="${variableStyle}">${escapeHtml(variableLabel)}</span>`;
  };

  const getPassPrintSelectedIds = () => {
    const availableIds = new Set(passPrintEditorState.fields.map((field) => String(field.id || '')));
    const selectedIds = Array.isArray(passPrintEditorState.selectedIds)
      ? passPrintEditorState.selectedIds
      : [];
    const normalizedIds = [...new Set(
      [...selectedIds, passPrintEditorState.selectedId]
        .map((id) => String(id || ''))
        .filter((id) => id && availableIds.has(id)),
    )];

    if (normalizedIds.length) {
      return normalizedIds;
    }

    return passPrintEditorState.selectedId && availableIds.has(passPrintEditorState.selectedId)
      ? [passPrintEditorState.selectedId]
      : [];
  };

  const syncPassPrintFieldsInput = () => {
    const { fieldsInput, backgroundRotationInput } = getPassPrintElements();

    if (!fieldsInput) {
      return;
    }

    fieldsInput.value = JSON.stringify(
      passPrintEditorState.fields.map((field) => ({
        id: field.id,
        type: field.type,
        text: String(field.text || ''),
        x: Number(field.x || 0),
        y: Number(field.y || 0),
        fontSize: normalizePassPrintFontSize(field.variableFontSize ?? field.fontSize, 18),
        variableFontSize: normalizePassPrintFontSize(field.variableFontSize ?? field.fontSize, 18),
        variableFontWeight: normalizePassPrintFontWeight(field.variableFontWeight, '700'),
        prefixFontSize: normalizePassPrintFontSize(field.prefixFontSize ?? field.fontSize, 18),
        prefixFontWeight: normalizePassPrintFontWeight(field.prefixFontWeight, '600'),
        textColor: normalizePassPrintColor(field.textColor || passPrintEditorState.textColor),
        textAlign: normalizePassPrintTextAlign(field.textAlign),
        borderEnabled: Boolean(field.borderEnabled),
        borderColor: normalizePassPrintColor(field.borderColor),
        width: Number(field.width || 0.24),
        rotation: Number(field.rotation || 0),
      })),
    );

    if (backgroundRotationInput) {
      backgroundRotationInput.value = String(normalizePassPrintQuarterTurn(passPrintEditorState.backgroundRotation));
    }
  };

  const syncPassPrintTemplateControls = () => {
    const { templateTextColorInput } = getPassPrintElements();

    if (templateTextColorInput) {
      templateTextColorInput.disabled = !passPrintEditorState.canManage;
      templateTextColorInput.value = normalizePassPrintColor(passPrintEditorState.textColor);
    }
  };

  const syncPassPrintPageOrientation = () => {
    const { app, page, templateOrientationInput, orientationLabel } = getPassPrintElements();
    const orientation = normalizePassPrintOrientation(passPrintEditorState.orientation);

    passPrintEditorState.orientation = orientation;

    if (page) {
      page.classList.toggle('pass-print-page--portrait', orientation === 'portrait');
      page.classList.toggle('pass-print-page--landscape', orientation === 'landscape');
    }

    if (templateOrientationInput) {
      templateOrientationInput.value = orientation;
    }

    if (orientationLabel) {
      const portraitLabel = app?.dataset.passPrintPortraitLabel || 'Vertical pass';
      const landscapeLabel = app?.dataset.passPrintLandscapeLabel || 'Horizontal pass';
      orientationLabel.textContent = orientation === 'landscape' ? landscapeLabel : portraitLabel;
    }
  };

  const setPassPrintTab = (tabName = 'editor') => {
    const { tabs, panels } = getPassPrintElements();
    const nextTab = tabName === 'print' ? 'print' : 'editor';

    if (nextTab !== 'editor' && passPrintEditorState.fullscreen) {
      setPassPrintFullscreen(false);
    }

    passPrintEditorState.activeTab = nextTab;

    tabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.passPrintTab === nextTab);
    });

    panels.forEach((panel) => {
      const isActive = panel.dataset.passPrintPanel === nextTab;
      panel.classList.toggle('hidden', !isActive);
    });
  };

  const setPassPrintFullscreen = (enabled) => {
    const { app, fullscreenTarget, fullscreenToggles } = getPassPrintElements();

    if (!fullscreenTarget) {
      return;
    }

    const isEnabled = Boolean(enabled);
    const enterLabel = app?.dataset.passPrintFullscreenLabel || 'Fullscreen';
    const exitLabel = app?.dataset.passPrintExitFullscreenLabel || 'Exit fullscreen';
    const label = isEnabled ? exitLabel : enterLabel;

    passPrintEditorState.fullscreen = isEnabled;
    fullscreenTarget.classList.toggle('is-fullscreen', isEnabled);
    document.body.classList.toggle('is-pass-print-fullscreen', isEnabled);

    fullscreenToggles.forEach((toggle) => {
      toggle.classList.toggle('is-active', isEnabled);
      toggle.setAttribute('aria-label', label);
      toggle.setAttribute('title', label);
    });
  };

  const syncPassPrintBackgroundPreview = () => {
    const {
      app,
      page,
      backgroundLayer,
      removeBackgroundInput,
      rotateBackgroundButton,
      backgroundRotationValue,
      removeBackgroundButton,
    } = getPassPrintElements();

    if (!page || !backgroundLayer) {
      return;
    }

    const hasCurrentBackground = Boolean(passPrintEditorState.currentBackgroundUrl);
    const hasUploadedBackground = Boolean(passPrintEditorState.uploadedBackgroundUrl);
    const removeMarked = removeBackgroundInput?.value === '1' && hasCurrentBackground && !hasUploadedBackground;
    const backgroundUrl = removeBackgroundInput?.value === '1'
      ? ''
      : passPrintEditorState.uploadedBackgroundUrl || passPrintEditorState.currentBackgroundUrl;
    const rotation = normalizePassPrintQuarterTurn(passPrintEditorState.backgroundRotation);
    const frame = getPassPrintBackgroundFrame(rotation, passPrintEditorState.orientation);

    syncPassPrintPageOrientation();
    page.classList.toggle('has-background', Boolean(backgroundUrl));
    backgroundLayer.classList.toggle('is-active', Boolean(backgroundUrl));
    backgroundLayer.style.backgroundImage = backgroundUrl ? `url("${backgroundUrl.replace(/"/g, '\\"')}")` : '';
    backgroundLayer.style.setProperty('--pass-print-background-rotation', frame.rotation);
    backgroundLayer.style.setProperty('--pass-print-background-left', frame.left);
    backgroundLayer.style.setProperty('--pass-print-background-top', frame.top);
    backgroundLayer.style.setProperty('--pass-print-background-width', frame.width);
    backgroundLayer.style.setProperty('--pass-print-background-height', frame.height);

    if (backgroundRotationValue) {
      backgroundRotationValue.textContent = `${rotation}°`;
    }

    if (rotateBackgroundButton) {
      rotateBackgroundButton.disabled = !passPrintEditorState.canManage || !backgroundUrl;
    }

    if (removeBackgroundButton) {
      const removeLabel = app?.dataset.passPrintRemoveBackgroundLabel || 'Remove current background';
      const restoreLabel = app?.dataset.passPrintRestoreBackgroundLabel || 'Restore background';
      const canRemoveBackground = hasCurrentBackground || hasUploadedBackground;
      const labelNode = removeBackgroundButton.querySelector('[data-pass-print-remove-background-label]');

      if (labelNode) {
        labelNode.textContent = removeMarked ? restoreLabel : removeLabel;
      } else {
        removeBackgroundButton.textContent = removeMarked ? restoreLabel : removeLabel;
      }
      removeBackgroundButton.disabled = !passPrintEditorState.canManage || !canRemoveBackground;
      removeBackgroundButton.classList.toggle('btn-danger', !removeMarked && canRemoveBackground);
      removeBackgroundButton.classList.toggle('btn-secondary', removeMarked || !canRemoveBackground);
    }

    syncPassPrintFieldsInput();
  };

  const renderPassPrintFields = () => {
    const { fieldLayer, emptyState } = getPassPrintElements();

    if (!fieldLayer) {
      return;
    }

    const selectedIds = new Set(getPassPrintSelectedIds());

    fieldLayer.innerHTML = passPrintEditorState.fields.map((field) => `
      <button
        type="button"
        class="pass-print-field${selectedIds.has(String(field.id || '')) ? ' is-active' : ''}${String(field.id || '') === passPrintEditorState.selectedId ? ' is-primary' : ''}"
        data-pass-print-field-id="${escapeHtml(field.id || '')}"
        style="left:${Number(field.x || 0) * 100}%;top:${Number(field.y || 0) * 100}%;width:${Number(field.width || 0.24) * 100}%;--pass-print-rotation:${Number(field.rotation || 0)}deg;--pass-print-text-align:${normalizePassPrintTextAlign(field.textAlign)};--pass-print-text-color:${normalizePassPrintColor(field.textColor || passPrintEditorState.textColor)};--pass-print-border-color:${normalizePassPrintColor(field.borderColor)};"
      >
        <span class="pass-print-field__content${field.borderEnabled ? ' has-bottom-border' : ''}">${getPassPrintFieldPreviewHtml(field)}</span>
        <span class="pass-print-field__resize" data-pass-print-field-resize="${escapeHtml(field.id || '')}"></span>
      </button>
    `).join('');

    if (emptyState) {
      emptyState.classList.toggle('hidden', passPrintEditorState.fields.length > 0);
    }
  };

  const syncPassPrintInspector = () => {
    const {
      app,
      inspectorTitle,
      fieldType,
      fieldText,
      fieldVariableFontSize,
      fieldVariableFontWeight,
      fieldPrefixFontSize,
      fieldPrefixFontWeight,
      fieldTextAlign,
      fieldBorderEnabled,
      fieldBorderColor,
      fieldWidth,
      positionX,
      positionY,
      rotationValue,
      removeFieldButton,
      rotateFieldButton,
    } = getPassPrintElements();

    if (!app) {
      return;
    }

    const selectedField = passPrintEditorState.fields.find((field) => field.id === passPrintEditorState.selectedId) || null;
    const hasSelection = Boolean(selectedField);
    const canEdit = passPrintEditorState.canManage && hasSelection;

    if (inspectorTitle) {
      inspectorTitle.textContent = hasSelection
        ? getPassPrintVariableLabel(selectedField.type)
        : (app.dataset.passPrintNoSelection || 'Select a field');
    }

    if (fieldType) {
      fieldType.disabled = !canEdit;

      if (hasSelection) {
        fieldType.value = selectedField.type;
      }
    }

    if (fieldText) {
      fieldText.disabled = !canEdit;
      fieldText.value = hasSelection ? String(selectedField.text || '') : '';
    }

    if (fieldVariableFontSize) {
      fieldVariableFontSize.disabled = !canEdit;
      fieldVariableFontSize.value = hasSelection
        ? normalizePassPrintFontSize(selectedField.variableFontSize ?? selectedField.fontSize, 18)
        : '';
    }

    if (fieldVariableFontWeight) {
      fieldVariableFontWeight.disabled = !canEdit;
      fieldVariableFontWeight.value = hasSelection ? normalizePassPrintFontWeight(selectedField.variableFontWeight, '700') : '700';
    }

    if (fieldPrefixFontSize) {
      fieldPrefixFontSize.disabled = !canEdit;
      fieldPrefixFontSize.value = hasSelection
        ? normalizePassPrintFontSize(selectedField.prefixFontSize ?? selectedField.fontSize, 18)
        : '';
    }

    if (fieldPrefixFontWeight) {
      fieldPrefixFontWeight.disabled = !canEdit;
      fieldPrefixFontWeight.value = hasSelection ? normalizePassPrintFontWeight(selectedField.prefixFontWeight, '600') : '600';
    }

    if (fieldTextAlign) {
      fieldTextAlign.disabled = !canEdit;
      fieldTextAlign.value = hasSelection ? normalizePassPrintTextAlign(selectedField.textAlign) : 'left';
    }

    if (fieldBorderEnabled) {
      fieldBorderEnabled.disabled = !canEdit;
      fieldBorderEnabled.checked = hasSelection ? Boolean(selectedField.borderEnabled) : false;
    }

    if (fieldBorderColor) {
      fieldBorderColor.disabled = !canEdit || !Boolean(selectedField?.borderEnabled);
      fieldBorderColor.value = hasSelection ? normalizePassPrintColor(selectedField.borderColor) : '#0f172a';
    }

    if (fieldWidth) {
      fieldWidth.disabled = !canEdit;
      fieldWidth.value = hasSelection ? Math.round(Number(selectedField.width || 0.24) * 100) : '';
    }

    if (positionX) {
      positionX.textContent = hasSelection ? `${Math.round(Number(selectedField.x || 0) * 100)}%` : '0%';
    }

    if (positionY) {
      positionY.textContent = hasSelection ? `${Math.round(Number(selectedField.y || 0) * 100)}%` : '0%';
    }

    if (rotationValue) {
      rotationValue.textContent = hasSelection ? `${Number(selectedField.rotation || 0)}°` : '0°';
    }

    if (removeFieldButton) {
      removeFieldButton.disabled = !canEdit;
    }

    if (rotateFieldButton) {
      rotateFieldButton.disabled = !canEdit;
    }
  };

  const selectPassPrintField = (fieldId = '', options = {}) => {
    const normalizedFieldId = String(fieldId || '');
    const currentSelectedIds = getPassPrintSelectedIds();

    if (!passPrintEditorState.fields.some((field) => String(field.id || '') === normalizedFieldId)) {
      passPrintEditorState.selectedId = '';
      passPrintEditorState.selectedIds = [];
    } else if (options.toggle) {
      const isSelected = currentSelectedIds.includes(normalizedFieldId);
      const nextSelectedIds = isSelected
        ? currentSelectedIds.filter((id) => id !== normalizedFieldId)
        : [...currentSelectedIds, normalizedFieldId];

      passPrintEditorState.selectedIds = nextSelectedIds;
      passPrintEditorState.selectedId = isSelected
        ? (passPrintEditorState.selectedId === normalizedFieldId ? nextSelectedIds[nextSelectedIds.length - 1] || '' : passPrintEditorState.selectedId)
        : normalizedFieldId;
    } else if (options.preserveGroup && currentSelectedIds.includes(normalizedFieldId)) {
      passPrintEditorState.selectedId = normalizedFieldId;
      passPrintEditorState.selectedIds = currentSelectedIds;
    } else {
      passPrintEditorState.selectedId = normalizedFieldId;
      passPrintEditorState.selectedIds = [normalizedFieldId];
    }

    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
  };

  const upsertSelectedPassPrintField = (patch = {}) => {
    if (!passPrintEditorState.selectedId) {
      return;
    }

    passPrintEditorState.fields = passPrintEditorState.fields.map((field) => (
      field.id === passPrintEditorState.selectedId
        ? { ...field, ...patch }
        : field
    ));

    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
  };

  const addPassPrintField = (type) => {
    if (!passPrintEditorState.canManage) {
      return;
    }

    const nextIndex = passPrintEditorState.fields.length;
    const field = {
      id: `field-${Date.now()}-${nextIndex}`,
      type,
      text: '',
      x: Math.min(0.18 + (nextIndex % 4) * 0.08, 0.78),
      y: Math.min(0.12 + Math.floor(nextIndex / 4) * 0.07, 0.88),
      fontSize: 18,
      variableFontSize: 18,
      variableFontWeight: '700',
      prefixFontSize: 18,
      prefixFontWeight: '600',
      textColor: normalizePassPrintColor(passPrintEditorState.textColor),
      textAlign: 'left',
      borderEnabled: false,
      borderColor: '#0f172a',
      width: 0.24,
      rotation: 0,
    };

    passPrintEditorState.fields.push(field);
    passPrintEditorState.selectedId = field.id;
    passPrintEditorState.selectedIds = [field.id];
    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
  };

  const removeSelectedPassPrintField = () => {
    const selectedIds = getPassPrintSelectedIds();

    if (!passPrintEditorState.canManage || !selectedIds.length) {
      return;
    }

    const selectedIdSet = new Set(selectedIds);
    passPrintEditorState.fields = passPrintEditorState.fields.filter(
      (field) => !selectedIdSet.has(String(field.id || '')),
    );
    passPrintEditorState.selectedId = passPrintEditorState.fields[0]?.id || '';
    passPrintEditorState.selectedIds = passPrintEditorState.selectedId ? [passPrintEditorState.selectedId] : [];
    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
  };

  const moveSelectedPassPrintFields = (deltaX = 0, deltaY = 0) => {
    const selectedIds = getPassPrintSelectedIds();

    if (!passPrintEditorState.canManage || !selectedIds.length) {
      return;
    }

    const selectedIdSet = new Set(selectedIds);
    const selectedFields = passPrintEditorState.fields
      .filter((field) => selectedIdSet.has(String(field.id || '')))
      .map((field) => ({
        id: String(field.id || ''),
        x: Number(field.x || 0),
        y: Number(field.y || 0),
      }));

    if (!selectedFields.length) {
      return;
    }

    const maxPosition = 0.96;
    const minDeltaX = Math.max(...selectedFields.map((field) => -field.x));
    const maxDeltaX = Math.min(...selectedFields.map((field) => maxPosition - field.x));
    const minDeltaY = Math.max(...selectedFields.map((field) => -field.y));
    const maxDeltaY = Math.min(...selectedFields.map((field) => maxPosition - field.y));
    const clampedDeltaX = Math.min(Math.max(deltaX, minDeltaX), maxDeltaX);
    const clampedDeltaY = Math.min(Math.max(deltaY, minDeltaY), maxDeltaY);
    const nextPositions = new Map(selectedFields.map((field) => [
      field.id,
      {
        x: field.x + clampedDeltaX,
        y: field.y + clampedDeltaY,
      },
    ]));

    passPrintEditorState.fields = passPrintEditorState.fields.map((field) => {
      const nextPosition = nextPositions.get(String(field.id || ''));

      return nextPosition
        ? { ...field, x: nextPosition.x, y: nextPosition.y }
        : field;
    });

    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
  };

  const isPassPrintEditingShortcutTarget = (target) => {
    const element = target instanceof Element ? target : target?.parentElement || null;

    if (!element) {
      return false;
    }

    return Boolean(
      element.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')
        || element.isContentEditable,
    );
  };

  const startPassPrintFieldDrag = (pointerEvent, fieldId) => {
    const { page } = getPassPrintElements();
    const selectedField = passPrintEditorState.fields.find((field) => field.id === fieldId);

    if (!page || !selectedField || !passPrintEditorState.canManage) {
      return;
    }

    pointerEvent.preventDefault();

    const rect = page.getBoundingClientRect();
    const selectedIds = getPassPrintSelectedIds();
    const dragFieldIds = selectedIds.includes(fieldId) ? selectedIds : [fieldId];
    const dragFieldIdSet = new Set(dragFieldIds);

    passPrintEditorState.drag = {
      fieldId,
      pointerId: pointerEvent.pointerId,
      mode: 'move',
      pointerStartX: (pointerEvent.clientX - rect.left) / rect.width,
      pointerStartY: (pointerEvent.clientY - rect.top) / rect.height,
      fields: passPrintEditorState.fields
        .filter((field) => dragFieldIdSet.has(String(field.id || '')))
        .map((field) => ({
          id: String(field.id || ''),
          x: Number(field.x || 0),
          y: Number(field.y || 0),
        })),
    };
  };

  const startPassPrintFieldResize = (pointerEvent, fieldId) => {
    const { page } = getPassPrintElements();
    const selectedField = passPrintEditorState.fields.find((field) => field.id === fieldId);

    if (!page || !selectedField || !passPrintEditorState.canManage) {
      return;
    }

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();

    const rect = page.getBoundingClientRect();

    passPrintEditorState.drag = {
      fieldId,
      pointerId: pointerEvent.pointerId,
      mode: 'resize',
      originX: rect.left + rect.width * Number(selectedField.x || 0),
      originY: rect.top + rect.height * Number(selectedField.y || 0),
      rotation: normalizePassPrintQuarterTurn(selectedField.rotation),
    };
  };

  const movePassPrintFieldDrag = (pointerEvent) => {
    const { page } = getPassPrintElements();
    const dragState = passPrintEditorState.drag;

    if (!page || !dragState) {
      return;
    }

    const rect = page.getBoundingClientRect();

    if (dragState.mode === 'resize') {
      const rotation = normalizePassPrintQuarterTurn(dragState.rotation);
      const width = (() => {
        if (rotation === 90) {
          return (pointerEvent.clientY - dragState.originY) / rect.height;
        }

        if (rotation === 180) {
          return (dragState.originX - pointerEvent.clientX) / rect.width;
        }

        if (rotation === 270) {
          return (dragState.originY - pointerEvent.clientY) / rect.height;
        }

        return (pointerEvent.clientX - dragState.originX) / rect.width;
      })();

      upsertSelectedPassPrintField({
        width: Math.min(Math.max(width, 0.08), 0.9),
      });
      return;
    }

    const dragFields = Array.isArray(dragState.fields) && dragState.fields.length
      ? dragState.fields
      : [{ id: dragState.fieldId, x: 0, y: 0 }];
    const maxPosition = 0.96;
    const pointerX = (pointerEvent.clientX - rect.left) / rect.width;
    const pointerY = (pointerEvent.clientY - rect.top) / rect.height;
    const deltaX = pointerX - Number(dragState.pointerStartX || 0);
    const deltaY = pointerY - Number(dragState.pointerStartY || 0);
    const minDeltaX = Math.max(...dragFields.map((field) => -Number(field.x || 0)));
    const maxDeltaX = Math.min(...dragFields.map((field) => maxPosition - Number(field.x || 0)));
    const minDeltaY = Math.max(...dragFields.map((field) => -Number(field.y || 0)));
    const maxDeltaY = Math.min(...dragFields.map((field) => maxPosition - Number(field.y || 0)));
    const clampedDeltaX = Math.min(Math.max(deltaX, minDeltaX), maxDeltaX);
    const clampedDeltaY = Math.min(Math.max(deltaY, minDeltaY), maxDeltaY);
    const nextPositions = new Map(dragFields.map((field) => [
      field.id,
      {
        x: Number(field.x || 0) + clampedDeltaX,
        y: Number(field.y || 0) + clampedDeltaY,
      },
    ]));

    passPrintEditorState.fields = passPrintEditorState.fields.map((field) => {
      const nextPosition = nextPositions.get(String(field.id || ''));

      return nextPosition
        ? { ...field, x: nextPosition.x, y: nextPosition.y }
        : field;
    });

    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
  };

  const stopPassPrintFieldDrag = () => {
    passPrintEditorState.drag = null;
  };

  const handlePassPrintBackgroundChange = (file) => {
    const { backgroundInput, removeBackgroundInput } = getPassPrintElements();

    if (!file) {
      passPrintEditorState.uploadedBackgroundUrl = '';

      if (backgroundInput) {
        backgroundInput.value = '';
      }

      syncPassPrintBackgroundPreview();
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      passPrintEditorState.uploadedBackgroundUrl = String(reader.result || '');

      if (removeBackgroundInput) {
        removeBackgroundInput.value = '0';
      }

      syncPassPrintBackgroundPreview();
    };

    reader.readAsDataURL(file);
  };

  const initializePassPrintUI = () => {
    const nextState = parsePassPrintState();

    if (!nextState) {
      passPrintEditorState = {
        canManage: false,
        fields: [],
        variables: [],
        selectedId: '',
        selectedIds: [],
        currentBackgroundUrl: '',
        backgroundRotation: 0,
        orientation: 'portrait',
        textColor: '#0f172a',
        uploadedBackgroundUrl: '',
        drag: null,
        fullscreen: false,
      };
      return;
    }

    passPrintEditorState = {
      canManage: nextState.canManage,
      fields: nextState.fields.map((field) => ({
        id: String(field.id || ''),
        type: field.type,
        text: String(field.text || ''),
        x: Number(field.x || 0),
        y: Number(field.y || 0),
        fontSize: normalizePassPrintFontSize(field.variableFontSize ?? field.fontSize, 18),
        variableFontSize: normalizePassPrintFontSize(field.variableFontSize ?? field.fontSize, 18),
        variableFontWeight: normalizePassPrintFontWeight(field.variableFontWeight, '700'),
        prefixFontSize: normalizePassPrintFontSize(field.prefixFontSize ?? field.fontSize, 18),
        prefixFontWeight: normalizePassPrintFontWeight(field.prefixFontWeight, '600'),
        textAlign: normalizePassPrintTextAlign(field.textAlign),
        borderEnabled: Boolean(field.borderEnabled),
        borderColor: normalizePassPrintColor(field.borderColor),
        textColor: normalizePassPrintColor(field.textColor || nextState.textColor),
        width: Number(field.width || 0.24),
        rotation: Number(field.rotation || 0),
      })),
      variables: nextState.variables,
      selectedId: String(nextState.fields[0]?.id || ''),
      selectedIds: nextState.fields[0]?.id ? [String(nextState.fields[0].id)] : [],
      activeTab: nextState.activeTab || 'editor',
      currentBackgroundUrl: nextState.currentBackgroundUrl || '',
      currentBackgroundRotation: normalizePassPrintQuarterTurn(nextState.backgroundRotation),
      backgroundRotation: normalizePassPrintQuarterTurn(nextState.backgroundRotation),
      orientation: normalizePassPrintOrientation(nextState.orientation),
      textColor: normalizePassPrintColor(nextState.textColor),
      uploadedBackgroundUrl: '',
      drag: null,
      fullscreen: false,
    };

    setPassPrintTab(passPrintEditorState.activeTab);
    syncPassPrintTemplateControls();
    syncPassPrintBackgroundPreview();
    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
  };

  const submitPassPrintForm = async (form) => {
    syncPassPrintFieldsInput();

    const csrfValue = form.querySelector('input[name="_csrf"]')?.value || '';
    const formData = new FormData(form);

    try {
      const response = await fetch(form.action, {
        method: (form.method || 'POST').toUpperCase(),
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'CSRF-Token': csrfValue,
        },
        credentials: 'same-origin',
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok) {
        throw new Error(payload?.error || payload?.errors?.[0] || 'Request failed');
      }

      if (payload?.message) {
        showLiveNotice(payload.message, 'success');
      }

      window.location.href = payload?.redirectTo || response.url || window.location.href;
    } catch (error) {
      showLiveNotice(error.message || 'Request failed', 'error');
    }
  };

  const submitPassPrintImportForm = async (form) => {
    const csrfValue = form.querySelector('input[name="_csrf"]')?.value || '';
    const formData = new FormData(form);

    try {
      const response = await fetch(form.action, {
        method: (form.method || 'POST').toUpperCase(),
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'CSRF-Token': csrfValue,
        },
        credentials: 'same-origin',
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok) {
        throw new Error(payload?.error || payload?.errors?.[0] || 'Request failed');
      }

      if (payload?.message) {
        showLiveNotice(payload.message, 'success');
      }

      window.location.href = payload?.redirectTo || response.url || window.location.href;
    } catch (error) {
      showLiveNotice(error.message || 'Request failed', 'error');
    }
  };

  const closePassPrintPreviewModal = () => {
    const { previewModal, previewFrame, previewLoading, previewError } = getPassPrintElements();

    if (previewModal) {
      previewModal.classList.remove('is-open');
    }

    if (previewFrame) {
      previewFrame.src = '';
      previewFrame.classList.add('hidden');
    }

    if (previewLoading) {
      previewLoading.classList.add('hidden');
    }

    if (previewError) {
      previewError.textContent = '';
      previewError.classList.add('hidden');
    }

    if (passPrintEditorState.previewObjectUrl) {
      window.URL.revokeObjectURL(passPrintEditorState.previewObjectUrl);
      passPrintEditorState.previewObjectUrl = '';
    }

    document.body.classList.remove('portal-modal-open');
  };

  const openPassPrintPreviewModal = () => {
    const { previewModal, previewFrame, previewLoading, previewError } = getPassPrintElements();

    if (!previewModal) {
      return;
    }

    if (previewFrame) {
      previewFrame.src = '';
      previewFrame.classList.add('hidden');
    }

    if (previewError) {
      previewError.textContent = '';
      previewError.classList.add('hidden');
    }

    if (previewLoading) {
      previewLoading.classList.remove('hidden');
    }

    previewModal.classList.add('is-open');
    document.body.classList.add('portal-modal-open');
  };

  const showPassPrintPreviewError = (message) => {
    const { previewFrame, previewLoading, previewError } = getPassPrintElements();

    if (previewFrame) {
      previewFrame.src = '';
      previewFrame.classList.add('hidden');
    }

    if (previewLoading) {
      previewLoading.classList.add('hidden');
    }

    if (previewError) {
      previewError.textContent = message || 'Preview failed';
      previewError.classList.remove('hidden');
    }
  };

  const submitPassPrintPreview = async (trigger) => {
    const { form, previewFrame, previewLoading, previewError, previewRequestId } = getPassPrintElements();
    const previewUrl = trigger?.dataset.passPrintPreviewUrl || '';

    if (!form || !previewUrl) {
      return;
    }

    syncPassPrintFieldsInput();
    openPassPrintPreviewModal();

    if (passPrintEditorState.previewObjectUrl) {
      window.URL.revokeObjectURL(passPrintEditorState.previewObjectUrl);
      passPrintEditorState.previewObjectUrl = '';
    }

    trigger.disabled = true;

    try {
      const csrfValue = form.querySelector('input[name="_csrf"]')?.value || '';
      const formData = new FormData(form);
      const requestId = String(previewRequestId?.value || '').trim();

      if (requestId) {
        formData.set('previewRequestId', requestId);
      }

      const response = await fetch(previewUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'CSRF-Token': csrfValue,
        },
        credentials: 'same-origin',
      });
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        const payload = contentType.includes('application/json') ? await response.json() : null;
        throw new Error(payload?.error || 'Preview failed');
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      passPrintEditorState.previewObjectUrl = objectUrl;

      if (previewError) {
        previewError.textContent = '';
        previewError.classList.add('hidden');
      }

      if (previewLoading) {
        previewLoading.classList.add('hidden');
      }

      if (previewFrame) {
        previewFrame.src = `${objectUrl}#view=FitH`;
        previewFrame.classList.remove('hidden');
      }
    } catch (error) {
      showPassPrintPreviewError(error.message || 'Preview failed');
    } finally {
      trigger.disabled = false;
    }
  };

  const copyTextToClipboard = async (value) => {
    const text = String(value || '').trim();

    if (!text) {
      return false;
    }

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', 'readonly');
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
    return true;
  };

  let activeTooltipTrigger = null;
  let tooltipNode = null;
  const tooltipTriggerSelector = '[data-tooltip], button[aria-label], a[aria-label], button[title], a[title]';

  const getTooltipNode = () => {
    if (!tooltipNode) {
      tooltipNode = document.createElement('div');
      tooltipNode.className = 'app-tooltip';
      tooltipNode.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltipNode);
    }

    return tooltipNode;
  };

  const positionTooltip = (trigger) => {
    if (!trigger || !tooltipNode) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltipNode.getBoundingClientRect();
    const viewportPadding = 10;
    const gap = 9;
    const placement = triggerRect.top > tooltipRect.height + gap + viewportPadding ? 'top' : 'bottom';
    const centeredLeft = triggerRect.left + (triggerRect.width / 2);
    const minLeft = viewportPadding + (tooltipRect.width / 2);
    const maxLeft = window.innerWidth - viewportPadding - (tooltipRect.width / 2);
    const left = Math.min(Math.max(centeredLeft, minLeft), maxLeft);
    const top = placement === 'top'
      ? triggerRect.top - tooltipRect.height - gap
      : triggerRect.bottom + gap;

    tooltipNode.dataset.placement = placement;
    tooltipNode.style.left = `${left}px`;
    tooltipNode.style.top = `${Math.max(viewportPadding, top)}px`;
  };

  const getTooltipText = (trigger) => {
    if (!trigger) {
      return '';
    }

    const titleText = String(trigger.getAttribute('title') || '').trim();

    if (titleText) {
      trigger.dataset.nativeTitle = titleText;
      trigger.removeAttribute('title');
    }

    const tooltipText = String(trigger.dataset.tooltip || '').trim();
    const ariaText = String(trigger.getAttribute('aria-label') || '').trim();
    const text = tooltipText || ariaText || titleText;

    if (text && !tooltipText) {
      trigger.dataset.tooltip = text;
    }

    return text;
  };

  const showTooltip = (trigger) => {
    const text = getTooltipText(trigger);

    if (!text) {
      return;
    }

    activeTooltipTrigger = trigger;
    const node = getTooltipNode();
    node.textContent = text;
    node.classList.remove('is-visible');
    positionTooltip(trigger);
    window.requestAnimationFrame(() => {
      positionTooltip(trigger);
      node.classList.add('is-visible');
    });
  };

  const hideTooltip = (trigger = null) => {
    if (trigger && activeTooltipTrigger !== trigger) {
      return;
    }

    activeTooltipTrigger = null;
    tooltipNode?.classList.remove('is-visible');
  };

  const parseContentDispositionFilename = (headerValue = '') => {
    if (!headerValue) {
      return '';
    }

    const utfMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);

    if (utfMatch?.[1]) {
      try {
        return decodeURIComponent(utfMatch[1]);
      } catch (error) {
        return utfMatch[1];
      }
    }

    const plainMatch = headerValue.match(/filename=\"?([^\";]+)\"?/i);
    return plainMatch?.[1] || '';
  };

  const downloadBlobResponse = async (response, fallbackUrl = '') => {
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    const contentDisposition = response.headers.get('content-disposition') || '';
    const fallbackFileName = fallbackUrl.split('/').pop()?.split('?')[0] || 'export';

    downloadLink.href = objectUrl;
    downloadLink.download = parseContentDispositionFilename(contentDisposition) || fallbackFileName;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    window.setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 1000);
  };

  const triggerAccessExportDownload = async (url) => {
    if (!url) {
      return;
    }

    const response = await fetch(url, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const payload = await response.json();
        throw new Error(payload?.error || 'Export failed');
      }

      const message = await response.text();
      throw new Error(message || 'Export failed');
    }

    await downloadBlobResponse(response, url);
  };

  const buildAccessExportUrl = (url) => {
    if (!url) {
      return '';
    }

    const exportUrl = new URL(url, window.location.origin);
    const activeParams = new URLSearchParams(window.location.search);
    const format = exportUrl.searchParams.get('format') || '';

    exportUrl.search = '';

    activeParams.forEach((value, key) => {
      if (key === 'format' || key === 'page' || value === '') {
        return;
      }

      exportUrl.searchParams.append(key, value);
    });

    if (format) {
      exportUrl.searchParams.set('format', format);
    }

    return exportUrl.toString();
  };

  const getRequestProfileElements = () => ({
    form: document.querySelector('[data-request-profile-form]'),
    forms: [...document.querySelectorAll('[data-request-profile-form]')],
    searchInput: document.querySelector('[data-request-profile-search]'),
    rows: [...document.querySelectorAll('[data-request-profile-row]')],
    emptyRows: [...document.querySelectorAll('[data-request-profile-empty-row]')],
    statisticsModal: document.querySelector('[data-request-profile-statistics-modal]'),
    qrModal: document.querySelector('[data-request-profile-qr-modal]'),
    qrTitle: document.querySelector('[data-request-profile-qr-title]'),
    qrCode: document.querySelector('[data-request-profile-qr-code]'),
    qrImage: document.querySelector('[data-request-profile-qr-image]'),
    qrLink: document.querySelector('[data-request-profile-qr-link]'),
    qrCopy: document.querySelector('[data-request-profile-qr-copy]'),
    qrDataScript: document.querySelector('[data-request-profile-qr-data]'),
    unlimitedToggle: document.querySelector('[data-request-profile-unlimited-toggle]'),
    quotaPanels: [...document.querySelectorAll('[data-request-profile-quotas]')],
    quotaInputs: [...document.querySelectorAll('[data-request-profile-quota-input]')],
    unlimitedNotes: [...document.querySelectorAll('[data-request-profile-unlimited-note]')],
  });

  const updateRequestProfileEmptyState = () => {
    const { rows, emptyRows, searchInput } = getRequestProfileElements();

    if (!emptyRows.length) {
      return;
    }

    emptyRows.forEach((row) => {
      row.classList.add('hidden');
    });

    if (!rows.length) {
      emptyRows[0]?.classList.remove('hidden');
      return;
    }

    const visibleRows = rows.filter((row) => row.style.display !== 'none');

    if (!visibleRows.length && searchInput?.value.trim()) {
      emptyRows[1]?.classList.remove('hidden');
    }
  };

  const filterRequestProfileRows = () => {
    const { rows, searchInput } = getRequestProfileElements();
    const query = String(searchInput?.value || '').trim().toLowerCase();

    rows.forEach((row) => {
      const haystack = row.dataset.searchIndex || '';
      row.style.display = !query || haystack.includes(query) ? '' : 'none';
    });

    updateRequestProfileEmptyState();
  };

  const getRequestProfileApplicationElements = () => ({
    searchInput: document.querySelector('[data-request-profile-application-search]'),
    list: document.querySelector('[data-request-profile-application-list]'),
    emptyState: document.querySelector('[data-request-profile-application-search-empty]'),
    cards: [...document.querySelectorAll('[data-request-profile-application-card]')],
  });

  const filterRequestProfileApplications = () => {
    const {
      searchInput,
      list,
      emptyState,
      cards,
    } = getRequestProfileApplicationElements();

    if (!searchInput || !cards.length) {
      return;
    }

    const query = String(searchInput.value || '').trim().toLowerCase();
    let visibleCount = 0;

    cards.forEach((card) => {
      const haystack = card.dataset.searchIndex || '';
      const isVisible = !query || haystack.includes(query);

      card.classList.toggle('hidden', !isVisible);

      if (isVisible) {
        visibleCount += 1;
      }
    });

    const hasSearchWithoutResults = Boolean(query) && visibleCount === 0;
    list?.classList.toggle('hidden', hasSearchWithoutResults);
    emptyState?.classList.toggle('hidden', !hasSearchWithoutResults);
  };

  const openRequestProfileQrModal = (trigger) => {
    const {
      qrModal,
      qrTitle,
      qrCode,
      qrImage,
      qrLink,
      qrCopy,
      qrDataScript,
    } = getRequestProfileElements();

    if (!qrModal || !trigger) {
      return;
    }

    const profileId = String(trigger.dataset.requestProfileId || '').trim();
    let qrData = {};

    if (profileId && qrDataScript?.textContent) {
      try {
        qrData = JSON.parse(qrDataScript.textContent || '{}')?.[profileId] || {};
      } catch (error) {
        qrData = {};
      }
    }

    const profileName = String(qrData.name || trigger.dataset.requestProfileName || '').trim();
    const inviteUrl = String(qrData.inviteUrl || trigger.dataset.requestProfileInviteUrl || '').trim();
    const qrSrc = String(qrData.qrSrc || trigger.dataset.requestProfileQrSrc || '').trim();

    if (qrTitle) {
      qrTitle.textContent = profileName || qrTitle.textContent;
    }

    if (qrImage) {
      qrImage.src = qrSrc;
      qrImage.hidden = !qrSrc;
    }

    qrCode?.classList.toggle('hidden', !qrSrc);

    if (qrLink) {
      qrLink.href = inviteUrl || '#';
      qrLink.textContent = inviteUrl;
    }

    if (qrCopy) {
      qrCopy.dataset.copyText = inviteUrl;
      qrCopy.disabled = !inviteUrl;
    }

    qrModal.classList.add('is-open');
    document.body.classList.add('portal-modal-open');
  };

  const closeRequestProfileQrModal = () => {
    const { qrModal } = getRequestProfileElements();

    if (!qrModal) {
      return;
    }

    qrModal.classList.remove('is-open');
    document.body.classList.remove('portal-modal-open');
  };

  const openRequestProfileStatisticsModal = () => {
    const { statisticsModal } = getRequestProfileElements();

    if (!statisticsModal) {
      return;
    }

    statisticsModal.classList.add('is-open');
    document.body.classList.add('portal-modal-open');
  };

  const closeRequestProfileStatisticsModal = () => {
    const { statisticsModal } = getRequestProfileElements();

    if (!statisticsModal) {
      return;
    }

    statisticsModal.classList.remove('is-open');
    document.body.classList.remove('portal-modal-open');
  };

  const initializeRequestProfileUI = () => {
    const {
      form,
      forms,
      unlimitedToggle,
      quotaPanels,
      quotaInputs,
      unlimitedNotes,
    } = getRequestProfileElements();

    const syncUnlimitedQuotaMode = () => {
      const isUnlimited = Boolean(unlimitedToggle?.checked);

      quotaPanels.forEach((panel) => {
        panel.classList.toggle('hidden', isUnlimited);
      });

      unlimitedNotes.forEach((note) => {
        note.classList.toggle('hidden', !isUnlimited);
      });

      quotaInputs.forEach((input) => {
        input.disabled = isUnlimited;
      });
    };

    if (unlimitedToggle) {
      unlimitedToggle.onchange = syncUnlimitedQuotaMode;
      syncUnlimitedQuotaMode();
    }

    forms.forEach((profileForm) => {
      profileForm.onsubmit = (event) => {
        const isUnlimited = profileForm === form && Boolean(unlimitedToggle?.checked);

        if (isUnlimited) {
          return;
        }

        const formData = new FormData(profileForm);
        const hasPassQuota = [...formData.entries()].some(([key, value]) => (
          key.startsWith('passQuota[') && Number(value || 0) > 0
        ));
        const hasWristbandQuota = [...formData.entries()].some(([key, value]) => (
          key.startsWith('wristbandQuota[') && Number(value || 0) > 0
        ));
        const hasQuota = hasPassQuota || hasWristbandQuota;

        if (hasQuota) {
          return;
        }

        event.preventDefault();
        showLiveNotice(
          profileForm.dataset.requestProfileQuotaRequiredMessage || 'Assign at least one pass or wristband quota before saving the profile.',
          'error',
        );
        profileForm.querySelector('[data-request-profile-quota-input]')?.focus();
      };
    });

    filterRequestProfileRows();
    filterRequestProfileApplications();
  };

  const initializeSystemEmailSettings = () => {
    const providerSelect = document.querySelector('[data-system-email-provider-select]');
    const panels = [...document.querySelectorAll('[data-system-email-provider-panel]')];
    const smtpPortInput = document.querySelector('[data-system-smtp-port-input]');
    const smtpSecureInput = document.querySelector('[data-system-smtp-secure-input]');

    if (!providerSelect || !panels.length) {
      return;
    }

    const syncPanels = () => {
      const activeProvider = providerSelect.value || 'smtp';

      panels.forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.systemEmailProviderPanel !== activeProvider);
      });
    };

    syncPanels();
    providerSelect.onchange = syncPanels;

    const syncSmtpSecure = () => {
      if (!smtpPortInput || !smtpSecureInput) {
        return;
      }

      const port = Number(String(smtpPortInput.value || '').trim());

      if (port === 465) {
        smtpSecureInput.checked = true;
      }

      if ([25, 587, 2525].includes(port)) {
        smtpSecureInput.checked = false;
      }
    };

    syncSmtpSecure();
    smtpPortInput?.addEventListener('input', syncSmtpSecure);
    smtpPortInput?.addEventListener('change', syncSmtpSecure);
  };

  const initializeSystemTemplateTabs = () => {
    const root = document.querySelector('[data-system-template-tabs]');

    if (!root) {
      return;
    }

    const tabs = [...root.querySelectorAll('[data-system-template-tab]')];
    const panels = [...root.querySelectorAll('[data-system-template-panel]')];

    const activateTemplate = (templateKey) => {
      tabs.forEach((tab) => {
        const isActive = tab.dataset.systemTemplateTab === templateKey;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      panels.forEach((panel) => {
        panel.classList.toggle('is-active', panel.dataset.systemTemplatePanel === templateKey);
      });

      const url = new URL(window.location.href);
      url.searchParams.set('template', templateKey);
      window.history.replaceState({}, '', url.toString());
    };

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => activateTemplate(tab.dataset.systemTemplateTab));
    });
  };

  const systemTemplatePreviewSamples = {
    appName: 'Caurlaides',
    userName: 'Jānis Bērziņš',
    resetUrl: 'https://caurlaides.pasakums.lv/reset-password/paraugs',
    eventName: 'Rīgas maratons',
    profileName: 'Baltic Pro Sound',
    accessCode: 'A1B2C3D4',
    inviteUrl: 'https://caurlaides.pasakums.lv/p/A1B2C3D4',
    wristbandSummary: '50 aproces',
    passSummary: '12 caurlaides',
    recipientName: 'Sandija Martinsone',
    roleLabel: 'Admins',
    invitedByName: 'Artis Vilks',
    eventUrl: 'https://caurlaides.pasakums.lv/events/5',
    applicationId: '1042',
    contactEmail: 'info@example.lv',
    contactPhone: '+371 20000000',
    notes: 'Nepieciešama piekļuve organizatoriem.',
    submittedAt: '25.05.2026 14:30',
    applicationsUrl: 'https://caurlaides.pasakums.lv/events/5/request-profiles/applications',
    rejectionReason: 'Kvota šim profilam jau ir aizpildīta.',
  };

  const interpolateSystemTemplatePreview = (content = '') => String(content || '').replace(/\{\{(\w+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(systemTemplatePreviewSamples, key)
      ? String(systemTemplatePreviewSamples[key])
      : match
  ));

  const buildSystemTemplatePreviewDocument = (html = '') => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base target="_blank" />
    <style>
      body {
        margin: 0;
        padding: 24px;
        background: #f6f8fb;
        color: #0f172a;
        font-family: Arial, Helvetica, sans-serif;
        line-height: 1.55;
      }
      .email-preview-shell {
        max-width: 680px;
        margin: 0 auto;
        padding: 28px;
        border: 1px solid #dfe7f2;
        border-radius: 14px;
        background: #ffffff;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      }
      p { margin: 0 0 14px; }
      a { color: #0074ff; font-weight: 700; }
      strong { color: #0f172a; }
    </style>
  </head>
  <body>
    <div class="email-preview-shell">
      ${html}
    </div>
  </body>
</html>`;

  const closeSystemTemplatePreview = () => {
    const modal = document.querySelector('[data-system-template-preview-modal]');
    const frame = document.querySelector('[data-system-template-preview-frame]');

    modal?.classList.remove('is-open');
    modal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('portal-modal-open');

    if (frame) {
      frame.srcdoc = '';
    }
  };

  const openSystemTemplatePreview = (trigger) => {
    const form = trigger?.closest('form');
    const panel = trigger?.closest('[data-system-template-panel]');
    const modal = document.querySelector('[data-system-template-preview-modal]');
    const title = document.querySelector('[data-system-template-preview-title]');
    const subjectNode = document.querySelector('[data-system-template-preview-subject]');
    const frame = document.querySelector('[data-system-template-preview-frame]');

    if (!form || !modal || !subjectNode || !frame) {
      return;
    }

    const subject = interpolateSystemTemplatePreview(form.querySelector('[name="subject"]')?.value || '');
    const html = interpolateSystemTemplatePreview(form.querySelector('[name="htmlContent"]')?.value || '');
    const panelTitle = panel?.querySelector('.system-template-panel__head h2')?.textContent?.trim();

    if (title && panelTitle) {
      title.textContent = panelTitle;
    }

    subjectNode.textContent = subject;
    frame.srcdoc = buildSystemTemplatePreviewDocument(html);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('portal-modal-open');
  };

  const filterPortalRows = () => {
    const table = document.querySelector('[data-portal-table]');
    const tbody = table?.querySelector('tbody');
    const rows = tbody ? [...tbody.querySelectorAll('[data-request-row]')] : [];
    const searchInput = document.querySelector('[data-portal-table-search]');
    const query = String(searchInput?.value || portalTableSearchQuery || '').trim().toLowerCase();
    const sortKey = `sort${portalTableSortField.charAt(0).toUpperCase()}${portalTableSortField.slice(1)}`;

    if (tbody && rows.length) {
      const directionMultiplier = portalTableSortDirection === 'asc' ? 1 : -1;
      const sortedRows = [...rows].sort((left, right) => {
        if (portalTableSortField === 'updated' || portalTableSortField === 'created') {
          const leftValue = Number(left.dataset[sortKey] || 0);
          const rightValue = Number(right.dataset[sortKey] || 0);

          if (leftValue === rightValue) {
            return 0;
          }

          return (leftValue - rightValue) * directionMultiplier;
        }

        const leftValue = String(left.dataset[sortKey] || '').trim();
        const rightValue = String(right.dataset[sortKey] || '').trim();
        return leftValue.localeCompare(rightValue, undefined, {
          numeric: true,
          sensitivity: 'base',
        }) * directionMultiplier;
      });

      sortedRows.forEach((row) => {
        tbody.appendChild(row);
      });
    }

    rows.forEach((row) => {
      const rowType = row.dataset.requestType;
      const matchesTab = activePortalTab === 'all' || rowType === activePortalTab;
      const matchesSearch = !query || String(row.dataset.requestSearch || '').includes(query);
      row.style.display = matchesTab && matchesSearch ? '' : 'none';
    });
  };

  const getAccessElements = () => {
    const workspace = document.querySelector('[data-access-workspace]');
    const exportModal = document.querySelector('[data-access-export-modal]');
    const historyModal = document.querySelector('[data-access-history-modal]');
    const requestModal = document.querySelector('[data-access-request-modal]');
    const printReceiveModal = document.querySelector('[data-access-print-receive-modal]');
    const wristbandReceiveModal = document.querySelector('[data-access-wristband-receive-modal]');
    const typeForm = document.querySelector('[data-access-type-form]');

    return {
      workspace,
      viewTabs: [...document.querySelectorAll('[data-access-view-tab]')],
      viewPanels: [...document.querySelectorAll('[data-access-view-panel]')],
      fullscreenToggles: [...document.querySelectorAll('[data-access-fullscreen-toggle]')],
      fullscreenLabels: [...document.querySelectorAll('[data-access-fullscreen-label]')],
      printSelectedButton: document.querySelector('[data-access-print-selected]'),
      printSelectedLabel: document.querySelector('[data-access-print-selected-button-label]'),
      printReceiveModal,
      printReceiveForm: printReceiveModal?.querySelector('[data-access-print-receive-form]') || null,
      printReceiveTitle: printReceiveModal?.querySelector('[data-access-print-receive-title]') || null,
      printReceiveCount: printReceiveModal?.querySelector('[data-access-print-receive-count]') || null,
      printRecipientInput: printReceiveModal?.querySelector('[data-access-print-recipient-input]') || null,
      wristbandSelectedButton: document.querySelector('[data-access-wristband-selected]'),
      wristbandSelectedLabel: document.querySelector('[data-access-wristband-selected-button-label]'),
      wristbandReceiveModal,
      wristbandReceiveForm: wristbandReceiveModal?.querySelector('[data-access-wristband-receive-form]') || null,
      wristbandReceiveTitle: wristbandReceiveModal?.querySelector('[data-access-wristband-receive-title]') || null,
      wristbandReceiveCount: wristbandReceiveModal?.querySelector('[data-access-wristband-receive-count]') || null,
      wristbandRecipientInput: wristbandReceiveModal?.querySelector('[data-access-wristband-recipient-input]') || null,
      filterForm: document.querySelector('[data-live-filter-form]'),
      profileFilter: document.querySelector('[data-access-profile-filter]'),
      profileFilterTrigger: document.querySelector('[data-access-profile-filter-trigger]'),
      profileFilterLabel: document.querySelector('[data-access-profile-filter-label]'),
      profileFilterPanel: document.querySelector('[data-access-profile-filter-panel]'),
      profileFilterSearch: document.querySelector('[data-access-profile-filter-search]'),
      profileFilterEmpty: document.querySelector('[data-access-profile-filter-empty]'),
      profileFilterOptions: [...document.querySelectorAll('[data-access-profile-filter-option]')],
      profileFilterValue: document.querySelector('[data-access-profile-filter-value]'),
      exportModal,
      historyModal,
      historyTitle: historyModal?.querySelector('[data-access-history-title]') || null,
      historyEyebrow: historyModal?.querySelector('[data-access-history-eyebrow]') || null,
      historyMeta: historyModal?.querySelector('[data-access-history-meta]') || null,
      historySummary: historyModal?.querySelector('[data-access-history-summary]') || null,
      historyLoading: historyModal?.querySelector('[data-access-history-loading]') || null,
      historyEmpty: historyModal?.querySelector('[data-access-history-empty]') || null,
      historyList: historyModal?.querySelector('[data-access-history-list]') || null,
      table: document.querySelector('[data-access-requests-table]'),
      tableBody: document.querySelector('[data-access-requests-body]'),
      tableScroll: document.querySelector('[data-access-table-scroll]'),
      emptyState: document.querySelector('[data-access-empty-state]'),
      filteredCountNodes: [...document.querySelectorAll('[data-access-filtered-count-label]')],
      typeForm,
      typeFormTitle: document.querySelector('[data-access-type-form-title]'),
      typeFormMethodHolder: typeForm?.querySelector('[data-access-type-method-holder]') || null,
      typeSubmitLabel: typeForm?.querySelector('[data-access-type-submit-label]') || null,
      requestModal,
      requestForm: requestModal?.querySelector('[data-access-request-form]') || null,
      requestTitle: requestModal?.querySelector('[data-access-request-modal-title]') || null,
      requestEyebrow: requestModal?.querySelector('[data-access-request-modal-eyebrow]') || null,
      requestMethodHolder: requestModal?.querySelector('[data-access-request-method-holder]') || null,
      requestSubmitLabel: requestModal?.querySelector('[data-access-request-submit-label]') || null,
      requestProfile: requestModal?.querySelector('[data-access-request-profile]') || null,
      requestProfileSearch: requestModal?.querySelector('[data-access-request-profile-search]') || null,
      requestProfileEmpty: requestModal?.querySelector('[data-access-request-profile-empty]') || null,
      requestCategory: requestModal?.querySelector('[data-access-request-category]') || null,
      entryWindowsList: document.querySelector('[data-access-entry-windows-list]'),
      entryWindowsEmpty: document.querySelector('[data-access-entry-windows-empty]'),
      entryWindowTemplate: document.querySelector('[data-access-entry-window-template]'),
      typeTotalNodes: [...document.querySelectorAll('[data-access-type-total]')],
      typeHandedNodes: [...document.querySelectorAll('[data-access-type-handed]')],
    };
  };

  const getAccessUi = () => {
    const workspace = getAccessElements().workspace;

    if (!workspace) {
      return {};
    }

    return {
      createAction: workspace.dataset.accessCreateAction,
      createTitle: workspace.dataset.accessCreateTitle,
      editTitle: workspace.dataset.accessEditTitle,
      createSubmit: workspace.dataset.accessCreateSubmit,
      saveSubmit: workspace.dataset.accessSaveSubmit,
      fullscreenEnter: workspace.dataset.accessFullscreenEnter,
      fullscreenExit: workspace.dataset.accessFullscreenExit,
      printSelectedUrl: workspace.dataset.accessPrintSelectedAction,
      printToggleLabel: workspace.dataset.accessPrintToggleLabel,
      printSelectedToggleLabel: workspace.dataset.accessPrintSelectedToggleLabel,
      printSelectedLabel: workspace.dataset.accessPrintSelectedLabel,
      printSelectedCountTemplate: workspace.dataset.accessPrintSelectedCountTemplate,
      printSelectedSuccess: workspace.dataset.accessPrintSelectedSuccess,
      printModalTitle: workspace.dataset.accessPrintModalTitle,
      printModalCountTemplate: workspace.dataset.accessPrintModalCountTemplate,
      wristbandSelectedUrl: workspace.dataset.accessWristbandSelectedAction,
      wristbandToggleLabel: workspace.dataset.accessWristbandToggleLabel,
      wristbandSelectedToggleLabel: workspace.dataset.accessWristbandSelectedToggleLabel,
      wristbandReceivedLabel: workspace.dataset.accessWristbandReceivedLabel,
      wristbandSelectedLabel: workspace.dataset.accessWristbandSelectedLabel,
      wristbandSelectedCountTemplate: workspace.dataset.accessWristbandSelectedCountTemplate,
      wristbandSelectedSuccess: workspace.dataset.accessWristbandSelectedSuccess,
      wristbandModalTitle: workspace.dataset.accessWristbandModalTitle,
      wristbandModalCountTemplate: workspace.dataset.accessWristbandModalCountTemplate,
      wristbandRecipientTemplate: workspace.dataset.accessWristbandRecipientTemplate,
      canManage: workspace.dataset.accessCanManage === 'true',
      requestCreateAction: workspace.dataset.accessRequestCreateAction,
      requestCreateTitle: workspace.dataset.accessRequestCreateTitle,
      requestEditTitle: workspace.dataset.accessRequestEditTitle,
      requestCreateSubmit: workspace.dataset.accessRequestCreateSubmit,
      requestSaveSubmit: workspace.dataset.accessRequestSaveSubmit,
      historyTitle: workspace.dataset.accessHistoryTitle,
      historyLoading: workspace.dataset.accessHistoryLoading,
      historyEmpty: workspace.dataset.accessHistoryEmpty,
      historyError: workspace.dataset.accessHistoryError,
      historyGateLabel: workspace.dataset.accessHistoryGateLabel,
      historySourceLabel: workspace.dataset.accessHistorySourceLabel,
      historyLimitTemplate: workspace.dataset.accessHistoryLimitTemplate,
      historyTimeLabel: workspace.dataset.accessHistoryTimeLabel,
      historyEventLabel: workspace.dataset.accessHistoryEventLabel,
      historyActorLabel: workspace.dataset.accessHistoryActorLabel,
      historyDirectionLabel: workspace.dataset.accessHistoryDirectionLabel,
      historyOriginLabel: workspace.dataset.accessHistoryOriginLabel,
      historyLocationLabel: workspace.dataset.accessHistoryLocationLabel,
      historyDetailsLabel: workspace.dataset.accessHistoryDetailsLabel,
      historySeenAtLabel: workspace.dataset.accessHistorySeenAtLabel,
      historyConfidenceLabel: workspace.dataset.accessHistoryConfidenceLabel,
      historyVehicleConfidenceLabel: workspace.dataset.accessHistoryVehicleConfidenceLabel,
      historyButtonLabel: workspace.dataset.accessHistoryButtonLabel,
      historyCompanyLabel: workspace.dataset.accessHistoryCompanyLabel,
      historyTypeLabel: workspace.dataset.accessHistoryTypeLabel,
      historyProfileLabel: workspace.dataset.accessHistoryProfileLabel,
      historyRegisteredLabel: workspace.dataset.accessHistoryRegisteredLabel,
      historyEntryLabel: workspace.dataset.accessHistoryEntryLabel,
      historyLastEntryLabel: workspace.dataset.accessHistoryLastEntryLabel,
      historyLastExitLabel: workspace.dataset.accessHistoryLastExitLabel,
      actionsLabel: workspace.dataset.accessActionsLabel,
      eventId: workspace.dataset.accessEventId,
      pageType: workspace.dataset.accessPageType,
      singularLabel: workspace.dataset.accessSingularLabel,
      editLabel: workspace.dataset.accessEditLabel,
      cancelLabel: workspace.dataset.accessCancelLabel,
      notSet: workspace.dataset.accessNotSet,
      statusPendingLabel: workspace.dataset.accessStatusPendingLabel,
      statusHandedOutLabel: workspace.dataset.accessStatusHandedOutLabel,
      markPendingLabel: workspace.dataset.accessMarkPendingLabel,
      markHandedOutLabel: workspace.dataset.accessMarkHandedOutLabel,
      statusSectionLabel: workspace.dataset.accessStatusSectionLabel,
      filteredCountTemplate: workspace.dataset.accessFilteredCountTemplate,
      vehiclePlateLabel: workspace.dataset.accessVehiclePlateLabel,
      passNumberLabel: workspace.dataset.accessPassNumberLabel,
      entryAtLabel: workspace.dataset.accessEntryAtLabel,
      entryButtonLabel: workspace.dataset.accessEntryButtonLabel,
      exitButtonLabel: workspace.dataset.accessExitButtonLabel,
    };
  };

  const getNamedFormField = (form, name) => {
    if (!form?.elements) {
      return null;
    }

    if (typeof form.elements.namedItem === 'function') {
      return form.elements.namedItem(name);
    }

    return form.elements[name] || null;
  };

  const setNamedFormFieldValue = (form, name, value = '') => {
    const field = getNamedFormField(form, name);

    if (!field || !('value' in field)) {
      return;
    }

    field.value = value;
  };

  const setAccessView = (view, { updateHash = true } = {}) => {
    const elements = getAccessElements();

    if (!elements.workspace) {
      return;
    }

    activeAccessView = view;

    elements.viewTabs.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.accessViewTab === view);
    });

    elements.viewPanels.forEach((panel) => {
      panel.classList.toggle('is-hidden', panel.dataset.accessViewPanel !== view);
    });

    if (updateHash) {
      const hash = view === 'types' ? '#types' : '#requests';
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
  };

  const isAccessBrowserFullscreenActive = () => {
    const { workspace } = getAccessElements();

    if (!workspace || typeof document === 'undefined') {
      return false;
    }

    return document.fullscreenElement === workspace;
  };

  const setAccessFullscreen = (enabled) => {
    const elements = getAccessElements();
    const ui = getAccessUi();

    if (!elements.workspace) {
      return;
    }

    accessFullscreen = enabled;
    elements.workspace.classList.toggle('access-admin-shell-fullscreen', enabled);
    document.body.classList.toggle('is-access-fullscreen', enabled);

    elements.fullscreenToggles.forEach((toggle) => {
      toggle.classList.toggle('is-active', enabled);
      toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    });

    elements.fullscreenLabels.forEach((label) => {
      label.textContent = enabled
        ? (ui.fullscreenExit || 'Exit fullscreen')
        : (ui.fullscreenEnter || 'Fullscreen');
    });
  };

  const syncAccessFullscreenFromBrowser = () => {
    const isActive = isAccessBrowserFullscreenActive();

    if (isActive !== accessFullscreen) {
      setAccessFullscreen(isActive);
    }
  };

  const toggleAccessFullscreen = async () => {
    const { workspace } = getAccessElements();

    if (!workspace) {
      return;
    }

    if (typeof document !== 'undefined' && document.fullscreenEnabled && typeof workspace.requestFullscreen === 'function') {
      try {
        if (document.fullscreenElement === workspace) {
          await document.exitFullscreen();
          return;
        }

        if (!document.fullscreenElement) {
          await workspace.requestFullscreen();
          return;
        }
      } catch (error) {
        // Fall back to layout fullscreen below if the browser blocks the API.
      }
    }

    setAccessFullscreen(!accessFullscreen);
  };

  const syncAccessPrintSelection = () => {
    const elements = getAccessElements();
    const ui = getAccessUi();
    const selectedCount = selectedAccessPrintRequestIds.size;
    const isVisible = ui.pageType === 'pass' && ui.canManage && selectedCount > 0;
    const selectLabel = ui.printToggleLabel || 'Select for print';
    const deselectLabel = ui.printSelectedToggleLabel || 'Remove from print';

    document.querySelectorAll('[data-access-print-toggle]').forEach((button) => {
      const requestId = String(button.dataset.requestId || '');
      const isSelected = selectedAccessPrintRequestIds.has(requestId);

      button.classList.toggle('table-icon-button--danger', isSelected);
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      button.setAttribute('title', isSelected ? deselectLabel : selectLabel);
      button.setAttribute('aria-label', isSelected ? deselectLabel : selectLabel);
    });

    if (elements.printSelectedButton) {
      elements.printSelectedButton.hidden = !isVisible;
      elements.printSelectedButton.disabled = !isVisible;
    }

    if (elements.printSelectedLabel) {
      const template = ui.printSelectedCountTemplate || ui.printSelectedLabel || 'Print selected';
      elements.printSelectedLabel.textContent = template.replace('__COUNT__', selectedCount);
    }
  };

  const clearAccessPrintSelection = () => {
    selectedAccessPrintRequestIds = new Set();
    syncAccessPrintSelection();
  };

  const toggleAccessPrintSelection = (trigger) => {
    const ui = getAccessUi();

    if (ui.pageType !== 'pass' || !ui.canManage) {
      return;
    }

    const requestId = String(trigger?.dataset.requestId || trigger?.closest('[data-request-row-id]')?.dataset.requestRowId || '');

    if (!requestId) {
      return;
    }

    if (selectedAccessPrintRequestIds.has(requestId)) {
      selectedAccessPrintRequestIds.delete(requestId);
    } else {
      selectedAccessPrintRequestIds.add(requestId);
    }

    syncAccessPrintSelection();
  };

  const getSelectedAccessPrintIds = () => [...document.querySelectorAll('[data-access-requests-body] [data-request-row-id]')]
    .map((row) => String(row.dataset.requestRowId || ''))
    .filter((requestId) => selectedAccessPrintRequestIds.has(requestId))
    .map((requestId) => Number(requestId))
    .filter((requestId) => Number.isInteger(requestId) && requestId > 0);

  const closeAccessPrintReceiveModal = () => {
    const { printReceiveModal, printReceiveForm } = getAccessElements();

    if (!printReceiveModal) {
      return;
    }

    printReceiveModal.classList.remove('is-open');
    document.body.classList.remove('portal-modal-open');

    if (printReceiveForm) {
      printReceiveForm.reset();
    }
  };

  const openAccessPrintReceiveModal = () => {
    const {
      printReceiveModal,
      printReceiveTitle,
      printReceiveCount,
      printRecipientInput,
    } = getAccessElements();
    const ui = getAccessUi();
    const requestIds = getSelectedAccessPrintIds();

    if (!printReceiveModal || !requestIds.length) {
      return;
    }

    closeAccessHistoryModal();
    closeAccessRequestModal();
    closeAccessWristbandReceiveModal();
    closeAccessExportModal();

    if (printReceiveTitle) {
      printReceiveTitle.textContent = ui.printModalTitle || ui.printSelectedLabel || 'Print selected passes';
    }

    if (printReceiveCount) {
      const template = ui.printModalCountTemplate || ui.printSelectedCountTemplate || '__COUNT__ selected';
      printReceiveCount.textContent = template.replace('__COUNT__', requestIds.length);
    }

    printReceiveModal.classList.add('is-open');
    document.body.classList.add('portal-modal-open');
    window.setTimeout(() => printRecipientInput?.focus(), 50);
  };

  const submitSelectedAccessPrintRequests = async (trigger) => {
    const ui = getAccessUi();
    const elements = getAccessElements();
    const requestIds = getSelectedAccessPrintIds();
    const recipientName = String(elements.printRecipientInput?.value || '').trim();

    if (!requestIds.length || !ui.printSelectedUrl || !recipientName) {
      return;
    }

    const csrfValue = elements.printReceiveForm?.querySelector('input[name="_csrf"]')?.value
      || document.querySelector('[data-access-request-form] input[name="_csrf"]')?.value
      || '';
    const printWindow = window.open('', '_blank', 'noopener');

    setLiveSubmitterState(trigger, true);

    try {
      const response = await fetch(ui.printSelectedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'CSRF-Token': csrfValue,
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          _csrf: csrfValue,
          requestIds,
          recipientName,
        }),
      });
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        const payload = contentType.includes('application/json')
          ? await response.json()
          : null;
        throw new Error(payload?.error || 'Print failed');
      }

      const fileBlob = await response.blob();
      const objectUrl = window.URL.createObjectURL(fileBlob);

      if (printWindow) {
        printWindow.location.href = objectUrl;
      } else {
        window.open(objectUrl, '_blank', 'noopener');
      }

      window.setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
      }, 60_000);

      clearAccessPrintSelection();
      closeAccessPrintReceiveModal();
      await triggerSocketLiveRefresh();
      showLiveNotice(ui.printSelectedSuccess || 'PDF opened for printing.', 'success');
    } catch (error) {
      if (printWindow) {
        printWindow.close();
      }

      if (isAbortError(error)) {
        return;
      }

      showLiveNotice(error.message, 'error');
    } finally {
      setLiveSubmitterState(trigger, false);
    }
  };

  const getSelectedAccessWristbandIds = () => [...document.querySelectorAll('[data-access-requests-body] [data-request-row-id]')]
    .filter((row) => row.dataset.requestRawStatus !== 'handed_out')
    .map((row) => String(row.dataset.requestRowId || ''))
    .filter((requestId) => selectedAccessWristbandRequestIds.has(requestId))
    .map((requestId) => Number(requestId))
    .filter((requestId) => Number.isInteger(requestId) && requestId > 0);

  const formatWristbandRecipientLabel = (recipientName) => {
    const ui = getAccessUi();
    const normalizedName = String(recipientName || '').trim();

    if (!normalizedName) {
      return '\u00A0';
    }

    return (ui.wristbandRecipientTemplate || 'Received by: __NAME__')
      .replace('__NAME__', normalizedName);
  };

  const syncAccessWristbandSelection = () => {
    const elements = getAccessElements();
    const ui = getAccessUi();

    document.querySelectorAll('[data-access-wristband-toggle]').forEach((button) => {
      const requestId = String(button.dataset.requestId || '');
      const row = button.closest('[data-request-row-id]');
      const isReceived = row?.dataset.requestRawStatus === 'handed_out' || button.dataset.wristbandReceived === 'true';

      if (isReceived && requestId) {
        selectedAccessWristbandRequestIds.delete(requestId);
      }
    });

    const selectedCount = selectedAccessWristbandRequestIds.size;
    const isVisible = ui.pageType === 'wristband' && ui.canManage && selectedCount > 0;
    const selectLabel = ui.wristbandToggleLabel || 'Select wristband';
    const deselectLabel = ui.wristbandSelectedToggleLabel || 'Remove wristband';
    const receivedLabel = ui.wristbandReceivedLabel || ui.statusHandedOutLabel || 'Received';

    document.querySelectorAll('[data-access-wristband-toggle]').forEach((button) => {
      const requestId = String(button.dataset.requestId || '');
      const row = button.closest('[data-request-row-id]');
      const isReceived = row?.dataset.requestRawStatus === 'handed_out' || button.dataset.wristbandReceived === 'true';
      const isSelected = !isReceived && selectedAccessWristbandRequestIds.has(requestId);
      const label = isReceived ? receivedLabel : (isSelected ? deselectLabel : selectLabel);

      button.classList.toggle('is-selected', isSelected);
      button.classList.toggle('is-received', isReceived);
      button.dataset.wristbandReceived = isReceived ? 'true' : 'false';
      button.setAttribute('aria-pressed', isSelected || isReceived ? 'true' : 'false');
      button.setAttribute('aria-disabled', isReceived ? 'true' : 'false');
      button.setAttribute('title', label);
      button.setAttribute('aria-label', label);
    });

    if (elements.wristbandSelectedButton) {
      elements.wristbandSelectedButton.hidden = !isVisible;
      elements.wristbandSelectedButton.disabled = !isVisible;
    }

    if (elements.wristbandSelectedLabel) {
      const template = ui.wristbandSelectedCountTemplate || ui.wristbandSelectedLabel || 'Receive selected';
      elements.wristbandSelectedLabel.textContent = template.replace('__COUNT__', selectedCount);
    }
  };

  const clearAccessWristbandSelection = () => {
    selectedAccessWristbandRequestIds = new Set();
    syncAccessWristbandSelection();
  };

  const toggleAccessWristbandSelection = (trigger) => {
    const ui = getAccessUi();

    if (ui.pageType !== 'wristband' || !ui.canManage) {
      return;
    }

    const row = trigger?.closest('[data-request-row-id]');

    if (row?.dataset.requestRawStatus === 'handed_out' || trigger?.dataset.wristbandReceived === 'true') {
      return;
    }

    const requestId = String(trigger?.dataset.requestId || row?.dataset.requestRowId || '');

    if (!requestId) {
      return;
    }

    if (selectedAccessWristbandRequestIds.has(requestId)) {
      selectedAccessWristbandRequestIds.delete(requestId);
    } else {
      selectedAccessWristbandRequestIds.add(requestId);
    }

    syncAccessWristbandSelection();
  };

  const closeAccessWristbandReceiveModal = () => {
    const { wristbandReceiveModal, wristbandReceiveForm } = getAccessElements();

    if (!wristbandReceiveModal) {
      return;
    }

    wristbandReceiveModal.classList.remove('is-open');
    document.body.classList.remove('portal-modal-open');

    if (wristbandReceiveForm) {
      wristbandReceiveForm.reset();
    }
  };

  const openAccessWristbandReceiveModal = () => {
    const {
      wristbandReceiveModal,
      wristbandReceiveTitle,
      wristbandReceiveCount,
      wristbandRecipientInput,
    } = getAccessElements();
    const ui = getAccessUi();
    const requestIds = getSelectedAccessWristbandIds();

    if (!wristbandReceiveModal || !requestIds.length) {
      return;
    }

    closeAccessHistoryModal();
    closeAccessRequestModal();
    closeAccessPrintReceiveModal();
    closeAccessExportModal();

    if (wristbandReceiveTitle) {
      wristbandReceiveTitle.textContent = ui.wristbandModalTitle || ui.wristbandSelectedLabel || 'Receive wristbands';
    }

    if (wristbandReceiveCount) {
      const template = ui.wristbandModalCountTemplate || ui.wristbandSelectedCountTemplate || '__COUNT__ selected';
      wristbandReceiveCount.textContent = template.replace('__COUNT__', requestIds.length);
    }

    wristbandReceiveModal.classList.add('is-open');
    document.body.classList.add('portal-modal-open');
    window.setTimeout(() => wristbandRecipientInput?.focus(), 50);
  };

  const submitSelectedAccessWristbands = async (trigger) => {
    const elements = getAccessElements();
    const ui = getAccessUi();
    const requestIds = getSelectedAccessWristbandIds();
    const recipientName = String(elements.wristbandRecipientInput?.value || '').trim();

    if (!requestIds.length || !ui.wristbandSelectedUrl || !recipientName) {
      return;
    }

    const csrfValue = elements.wristbandReceiveForm?.querySelector('input[name="_csrf"]')?.value
      || document.querySelector('[data-access-request-form] input[name="_csrf"]')?.value
      || '';

    setLiveSubmitterState(trigger, true);

    try {
      const response = await fetch(ui.wristbandSelectedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'CSRF-Token': csrfValue,
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          _csrf: csrfValue,
          requestIds,
          recipientName,
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok) {
        throw new Error(payload?.error || payload?.errors?.[0] || 'Request failed');
      }

      const upserts = Array.isArray(payload?.liveRequestUpserts)
        ? payload.liveRequestUpserts
        : (payload?.liveRequestUpsert ? [payload.liveRequestUpsert] : []);
      const handled = upserts.length > 0 && upserts.every((liveRequestUpsert) => applyAccessRequestUpsert(liveRequestUpsert));

      suppressSocketRefreshUntil = Date.now() + 1800;
      clearAccessWristbandSelection();
      closeAccessWristbandReceiveModal();

      if (!handled) {
        await refreshLiveSections();
      }

      showLiveNotice(payload?.message || ui.wristbandSelectedSuccess || 'Wristbands updated.', 'success');
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      showLiveNotice(error.message, 'error');
    } finally {
      setLiveSubmitterState(trigger, false);
    }
  };

  const resetAccessTypeForm = () => {
    const elements = getAccessElements();
    const ui = getAccessUi();

    if (!elements.typeForm) {
      return;
    }

    elements.typeForm.reset();
    elements.typeForm.action = ui.createAction || elements.typeForm.action;
    elements.typeFormMethodHolder.innerHTML = '';
    elements.typeFormTitle.textContent = ui.createTitle || 'Add type';
    elements.typeSubmitLabel.textContent = ui.createSubmit || 'Add type';

    if (elements.typeForm.elements.isActive) {
      elements.typeForm.elements.isActive.checked = true;
    }

    if (elements.typeForm.elements.sortOrder) {
      elements.typeForm.elements.sortOrder.value = '0';
    }

    setAccessEntryWindows([], { ensureBlank: true });
  };

  const populateAccessTypeForm = (trigger) => {
    const elements = getAccessElements();
    const ui = getAccessUi();

    if (!elements.typeForm || !trigger) {
      return;
    }

    elements.typeForm.action = `${ui.createAction}/${trigger.dataset.typeId}?_method=PUT`;
    elements.typeFormTitle.textContent = ui.editTitle || 'Edit type';
    elements.typeSubmitLabel.textContent = ui.saveSubmit || 'Save type';
    elements.typeFormMethodHolder.innerHTML = '';

    elements.typeForm.elements.name.value = trigger.dataset.typeName || '';
    elements.typeForm.elements.description.value = trigger.dataset.typeDescription || '';
    elements.typeForm.elements.quota.value = trigger.dataset.typeQuota || '';
    elements.typeForm.elements.sortOrder.value = trigger.dataset.typeSortOrder || '0';

    if (elements.typeForm.elements.isActive) {
      elements.typeForm.elements.isActive.checked = trigger.dataset.typeIsActive === '1';
    }

    let entryWindows = [];

    try {
      entryWindows = JSON.parse(trigger.dataset.typeEntryWindows || '[]');
    } catch (error) {
      entryWindows = [];
    }

    setAccessEntryWindows(entryWindows, { ensureBlank: true });

    setAccessView('types');
    elements.typeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleAccessEntryWindowsEmptyState = () => {
    const { entryWindowsList, entryWindowsEmpty } = getAccessElements();
    const hasRows = Boolean(entryWindowsList?.querySelector('[data-access-entry-window-row]'));

    if (entryWindowsEmpty) {
      entryWindowsEmpty.classList.toggle('hidden', hasRows);
    }
  };

  const reindexAccessEntryWindowRows = () => {
    const { entryWindowsList } = getAccessElements();
    const rows = entryWindowsList
      ? [...entryWindowsList.querySelectorAll('[data-access-entry-window-row]')]
      : [];

    rows.forEach((row, index) => {
      const startInput = row.querySelector('[data-access-entry-window-start]');
      const endInput = row.querySelector('[data-access-entry-window-end]');

      if (startInput) {
        startInput.name = `entryWindows[${index}][startAt]`;
      }

      if (endInput) {
        endInput.name = `entryWindows[${index}][endAt]`;
      }
    });

    toggleAccessEntryWindowsEmptyState();
  };

  const addAccessEntryWindowRow = (values = {}, { focusStart = false } = {}) => {
    const { entryWindowsList, entryWindowTemplate } = getAccessElements();

    if (!entryWindowsList || !entryWindowTemplate?.content) {
      return null;
    }

    const fragment = entryWindowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('[data-access-entry-window-row]');
    const startInput = row?.querySelector('[data-access-entry-window-start]');
    const endInput = row?.querySelector('[data-access-entry-window-end]');

    if (startInput) {
      startInput.value = values.startAt || '';
    }

    if (endInput) {
      endInput.value = values.endAt || '';
    }

    entryWindowsList.appendChild(fragment);
    reindexAccessEntryWindowRows();

    if (focusStart && startInput) {
      window.requestAnimationFrame(() => startInput.focus());
    }

    return row || null;
  };

  const setAccessEntryWindows = (entryWindows = [], { ensureBlank = false } = {}) => {
    const { entryWindowsList } = getAccessElements();

    if (!entryWindowsList) {
      return;
    }

    entryWindowsList.innerHTML = '';
    const normalizedWindows = Array.isArray(entryWindows) ? entryWindows : [];

    if (normalizedWindows.length) {
      normalizedWindows.forEach((entryWindow) => {
        addAccessEntryWindowRow(entryWindow);
      });
      return;
    }

    if (ensureBlank) {
      addAccessEntryWindowRow();
      return;
    }

    toggleAccessEntryWindowsEmptyState();
  };

  const getAccessModalRoot = () => {
    let modalRoot = document.querySelector('[data-access-modal-root]');

    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.dataset.accessModalRoot = 'true';
      document.body.appendChild(modalRoot);
    }

    return modalRoot;
  };

  const mountAccessModalsToRoot = () => {
    const workspace = document.querySelector('[data-access-workspace]');

    if (!workspace) {
      return;
    }

    const modalRoot = getAccessModalRoot();
    [
      '[data-access-history-modal]',
      '[data-access-request-modal]',
      '[data-access-print-receive-modal]',
      '[data-access-wristband-receive-modal]',
      '[data-access-export-modal]',
    ].forEach((selector) => {
      const modal = document.querySelector(selector);

      if (modal && modal.parentElement !== modalRoot) {
        modalRoot.appendChild(modal);
      }
    });
  };

  const initializeAccessUI = () => {
    mountAccessModalsToRoot();

    const elements = getAccessElements();

    if (!elements.workspace) {
      return;
    }

    const hashView = window.location.hash === '#types' ? 'types' : 'requests';

    if (!['requests', 'types'].includes(activeAccessView)) {
      activeAccessView = hashView;
    }

    setAccessView(activeAccessView || hashView, { updateHash: false });
    setAccessFullscreen(accessFullscreen);
    document.removeEventListener('fullscreenchange', syncAccessFullscreenFromBrowser);
    document.addEventListener('fullscreenchange', syncAccessFullscreenFromBrowser);
    syncAccessPrintSelection();
    syncAccessWristbandSelection();
    if (elements.entryWindowsList && !elements.entryWindowsList.children.length) {
      setAccessEntryWindows([], { ensureBlank: true });
    }
    syncAccessTypeUsageMetrics();
    syncAccessProfileFilterSelection();
    closeAccessProfileFilter();

    if (isAccessServerPaginationEnabled()) {
      const pageRowCount = elements.tableBody
        ? elements.tableBody.querySelectorAll('[data-request-row-id]').length
        : 0;
      syncAccessEmptyState(pageRowCount);
      updateAccessFilteredCount();
      syncAccessFilterUrl();
      return;
    }

    applyAccessFilters();
  };

  const updateAccessSummary = (summary = {}) => {
    const totalNode = document.querySelector('[data-access-summary-total]');
    const pendingNode = document.querySelector('[data-access-summary-pending]');
    const handedOutNode = document.querySelector('[data-access-summary-handed-out]');

    if (totalNode && typeof summary.totalRequests !== 'undefined') {
      totalNode.textContent = summary.totalRequests;
    }

    if (pendingNode && typeof summary.pendingRequests !== 'undefined') {
      pendingNode.textContent = summary.pendingRequests;
    }

    if (handedOutNode && typeof summary.handedOutRequests !== 'undefined') {
      handedOutNode.textContent = summary.handedOutRequests;
    }
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const formatAccessFilteredCount = (count) => {
    const ui = getAccessUi();
    const template = ui.filteredCountTemplate || '__COUNT__ records';
    return template.replace('__COUNT__', count);
  };

  const isAccessServerPaginationEnabled = () => {
    const { workspace } = getAccessElements();
    return workspace?.dataset.accessPaginationEnabled === 'true';
  };

  const setAccessFilterPage = (page = 1) => {
    const { filterForm } = getAccessElements();
    const pageField = filterForm?.elements?.page;

    if (!pageField || !('value' in pageField)) {
      return;
    }

    pageField.value = String(Math.max(Number(page) || 1, 1));
  };

  const closeAccessProfileFilter = ({ restoreFocus = false } = {}) => {
    const {
      profileFilter,
      profileFilterTrigger,
      profileFilterPanel,
      profileFilterSearch,
      profileFilterOptions,
      profileFilterEmpty,
    } = getAccessElements();

    if (!profileFilter || !profileFilterTrigger || !profileFilterPanel) {
      return;
    }

    profileFilter.classList.remove('is-open');
    profileFilterPanel.hidden = true;
    profileFilterTrigger.setAttribute('aria-expanded', 'false');

    if (profileFilterSearch) {
      profileFilterSearch.value = '';
    }

    profileFilterOptions.forEach((option) => {
      option.hidden = false;
    });

    if (profileFilterEmpty) {
      profileFilterEmpty.classList.add('hidden');
    }

    if (restoreFocus) {
      profileFilterTrigger.focus();
    }
  };

  const filterAccessProfileOptions = () => {
    const { profileFilterSearch, profileFilterOptions, profileFilterEmpty } = getAccessElements();

    if (!profileFilterSearch || !profileFilterOptions.length) {
      return null;
    }

    const normalizedQuery = String(profileFilterSearch.value || '').trim().toLowerCase();
    let firstVisibleOption = null;
    let visibleCount = 0;

    profileFilterOptions.forEach((option) => {
      const searchIndex = String(
        option.dataset.profileSearch || option.dataset.profileName || option.textContent || '',
      ).trim().toLowerCase();
      const matches = !normalizedQuery || searchIndex.includes(normalizedQuery);

      option.hidden = !matches;

      if (matches) {
        visibleCount += 1;

        if (!firstVisibleOption) {
          firstVisibleOption = option;
        }
      }
    });

    if (profileFilterEmpty) {
      profileFilterEmpty.classList.toggle('hidden', visibleCount > 0);
    }

    return firstVisibleOption;
  };

  const syncAccessProfileFilterSelection = () => {
    const {
      profileFilter,
      profileFilterLabel,
      profileFilterSearch,
      profileFilterValue,
      profileFilterOptions,
      profileFilterEmpty,
    } = getAccessElements();

    if (!profileFilter || !profileFilterLabel || !profileFilterValue) {
      return;
    }

    const selectedId = String(profileFilterValue.value || '');
    const defaultLabel = profileFilter.dataset.accessProfileFilterDefaultLabel || '';
    const selectedOption = profileFilterOptions.find((option) => String(option.dataset.profileId || '') === selectedId);

    profileFilterLabel.textContent = selectedOption?.dataset.profileName || defaultLabel;

    profileFilterOptions.forEach((option) => {
      const isSelected = String(option.dataset.profileId || '') === selectedId;
      option.classList.toggle('is-selected', isSelected);
      option.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      option.hidden = false;
    });

    if (profileFilterSearch) {
      profileFilterSearch.value = '';
    }

    if (profileFilterEmpty) {
      profileFilterEmpty.classList.add('hidden');
    }
  };

  const filterAccessRequestProfileOptions = () => {
    const { requestProfile, requestProfileSearch, requestProfileEmpty } = getAccessElements();

    if (!requestProfile) {
      return;
    }

    const query = String(requestProfileSearch?.value || '').trim().toLowerCase();
    let visibleProfileCount = 0;

    [...requestProfile.options].forEach((option) => {
      const isDefaultOption = !option.value;
      const searchIndex = String(option.dataset.profileSearch || option.textContent || '').trim().toLowerCase();
      const matches = isDefaultOption || !query || searchIndex.includes(query);

      option.hidden = !matches;

      if (!isDefaultOption && matches) {
        visibleProfileCount += 1;
      }
    });

    if (requestProfileEmpty) {
      requestProfileEmpty.classList.toggle('hidden', !query || visibleProfileCount > 0);
    }
  };

  const resetAccessRequestProfileSearch = () => {
    const { requestProfileSearch, requestProfileEmpty } = getAccessElements();

    if (requestProfileSearch) {
      requestProfileSearch.value = '';
    }

    if (requestProfileEmpty) {
      requestProfileEmpty.classList.add('hidden');
    }

    filterAccessRequestProfileOptions();
  };

  const applyAccessProfileFilterSelection = async (option) => {
    const { filterForm, workspace, profileFilterValue } = getAccessElements();

    if (!option || !profileFilterValue) {
      return;
    }

    profileFilterValue.value = option.dataset.profileId || '';
    syncAccessProfileFilterSelection();
    closeAccessProfileFilter();

    if (!filterForm || !workspace) {
      return;
    }

    activeAccessView = 'requests';

    if (isAccessServerPaginationEnabled()) {
      setAccessFilterPage(1);
      await submitLiveFilterForm(filterForm);
    } else {
      syncAccessFilterUrl();
      applyAccessFilters();
    }
  };

  const openAccessProfileFilter = () => {
    const {
      profileFilter,
      profileFilterTrigger,
      profileFilterPanel,
      profileFilterSearch,
    } = getAccessElements();

    if (!profileFilter || !profileFilterTrigger || !profileFilterPanel) {
      return;
    }

    profileFilter.classList.add('is-open');
    profileFilterPanel.hidden = false;
    profileFilterTrigger.setAttribute('aria-expanded', 'true');
    filterAccessProfileOptions();

    if (profileFilterSearch) {
      window.requestAnimationFrame(() => {
        profileFilterSearch.focus();
      });
    }
  };

  const toggleAccessProfileFilter = () => {
    const { profileFilter } = getAccessElements();

    if (!profileFilter) {
      return;
    }

    if (profileFilter.classList.contains('is-open')) {
      closeAccessProfileFilter({ restoreFocus: true });
      return;
    }

    openAccessProfileFilter();
  };

  const updateAccessFilteredCount = () => {
    const { tableBody, filteredCountNodes, workspace } = getAccessElements();

    if (!filteredCountNodes.length) {
      return;
    }

    const visibleCount = tableBody
      ? [...tableBody.querySelectorAll('[data-request-row-id]')].filter((row) => row.style.display !== 'none').length
      : 0;
    const nextCount = isAccessServerPaginationEnabled()
      ? Number(workspace?.dataset.accessFilteredCountValue || 0)
      : visibleCount;

    filteredCountNodes.forEach((node) => {
      node.textContent = formatAccessFilteredCount(nextCount);
    });
  };

  const syncAccessTypeUsageMetrics = () => {
    const { typeTotalNodes, typeHandedNodes } = getAccessElements();

    if (!typeTotalNodes.length && !typeHandedNodes.length) {
      return;
    }

    typeTotalNodes.forEach((node) => {
      node.textContent = String(Number(node.dataset.accessTypeTotalValue || 0));
    });

    typeHandedNodes.forEach((node) => {
      node.textContent = String(Number(node.dataset.accessTypeHandedValue || 0));
    });
  };

  const changeAccessTypeUsageNodeValue = (selector, datasetKey, categoryId, delta) => {
    if (!categoryId || !delta) {
      return;
    }

    const node = document.querySelector(`${selector}="${escapeSelector(categoryId)}"]`);

    if (!node) {
      return;
    }

    const nextValue = Math.max(Number(node.dataset[datasetKey] || 0) + delta, 0);
    node.dataset[datasetKey] = String(nextValue);
    node.textContent = String(nextValue);
  };

  const hasActiveAccessFilters = () => {
    const filters = getAccessFilterState();

    return Boolean(
      filters.query
      || filters.profileId
      || filters.categoryId
      || filters.status
      || filters.company
    );
  };

  const snapshotAccessRequestFromRow = (row) => {
    if (!row) {
      return null;
    }

    const categoryId = String(row.dataset.requestCategoryId || '');

    if (!categoryId) {
      return null;
    }

    return {
      categoryId,
      status: String(row.dataset.requestStatus || ''),
    };
  };

  const snapshotAccessRequest = (request = {}) => {
    const categoryId = String(request.categoryId || '');

    if (!categoryId) {
      return null;
    }

    return {
      categoryId,
      status: String(request.status || ''),
    };
  };

  const updateAccessTypeUsageMetrics = (previousRequest = null, nextRequest = null) => {
    const normalize = (request) => {
      if (!request || !request.categoryId) {
        return null;
      }

      return {
        categoryId: String(request.categoryId),
        status: String(request.status || ''),
      };
    };

    const previous = normalize(previousRequest);
    const next = normalize(nextRequest);

    if (previous) {
      changeAccessTypeUsageNodeValue('[data-access-type-total', 'accessTypeTotalValue', previous.categoryId, -1);

      if (previous.status === 'handed_out') {
        changeAccessTypeUsageNodeValue('[data-access-type-handed', 'accessTypeHandedValue', previous.categoryId, -1);
      }
    }

    if (next) {
      changeAccessTypeUsageNodeValue('[data-access-type-total', 'accessTypeTotalValue', next.categoryId, 1);

      if (next.status === 'handed_out') {
        changeAccessTypeUsageNodeValue('[data-access-type-handed', 'accessTypeHandedValue', next.categoryId, 1);
      }
    }
  };

  const getAccessFilterState = () => {
    const { filterForm } = getAccessElements();

    if (!filterForm) {
      return {
        query: '',
        profileId: '',
        categoryId: '',
        status: '',
        company: '',
        sort: 'newest',
        page: 1,
      };
    }

    return {
      query: String(filterForm.elements.q?.value || '').trim().toLowerCase(),
      profileId: String(filterForm.elements.profileId?.value || ''),
      categoryId: String(filterForm.elements.categoryId?.value || ''),
      status: String(filterForm.elements.status?.value || ''),
      company: String(filterForm.elements.company?.value || '').trim().toLowerCase(),
      sort: String(filterForm.elements.sort?.value || 'newest'),
      page: Math.max(Number(filterForm.elements.page?.value) || 1, 1),
    };
  };

  const matchesAccessRequestFilters = (request = {}) => {
    const ui = getAccessUi();
    const filters = getAccessFilterState();

    if (!request || request.type !== ui.pageType) {
      return false;
    }

    if (filters.profileId && String(request.requestProfileId || '') !== filters.profileId) {
      return false;
    }

    if (filters.categoryId && String(request.categoryId || '') !== filters.categoryId) {
      return false;
    }

    if (filters.status && String(request.status || '') !== filters.status) {
      return false;
    }

    if (filters.company && !String(request.companyName || '').toLowerCase().includes(filters.company)) {
      return false;
    }

    if (filters.query) {
      const normalizedVehiclePlateQuery = normalizeVehiclePlateSearch(filters.query);
      const normalizedRequestPlate = normalizeVehiclePlateSearch(request.vehiclePlate);
      const haystack = [
        request.fullName,
        request.id,
        request.companyName,
        request.phone,
        request.email,
        request.vehiclePlate,
        request.notes,
        request.profileName,
        request.categoryName,
      ]
        .join(' ')
        .toLowerCase();

      if (
        !haystack.includes(filters.query)
        && (!normalizedVehiclePlateQuery || !normalizedRequestPlate.includes(normalizedVehiclePlateQuery))
      ) {
        return false;
      }
    }

    return true;
  };

  const readAccessRequestFromRow = (row) => {
    const ui = getAccessUi();

    if (!row) {
      return null;
    }

    return {
      type: ui.pageType,
      id: row.dataset.requestRowId || '',
      requestProfileId: row.dataset.requestProfileId || '',
      categoryId: row.dataset.requestCategoryId || '',
      status: row.dataset.requestStatus || '',
      companyName: row.dataset.requestCompanyName || '',
      fullName: row.dataset.requestFullName || '',
      phone: row.dataset.requestPhone || '',
      email: row.dataset.requestEmail || '',
      vehiclePlate: row.dataset.requestVehiclePlate || '',
      notes: row.dataset.requestNotes || '',
      profileName: row.dataset.requestProfileName || '',
      categoryName: row.dataset.requestCategoryName || '',
      createdAtTs: Number(row.dataset.requestCreatedTs || 0),
    };
  };

  const syncAccessEmptyState = (visibleCount) => {
    const { tableScroll, emptyState } = getAccessElements();

    if (tableScroll) {
      tableScroll.hidden = visibleCount === 0;
    }

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  };

  const syncAccessFilterUrl = () => {
    const { filterForm } = getAccessElements();

    if (!filterForm) {
      return;
    }

    const params = new URLSearchParams();
    const setParam = (name, value, defaultValue = '') => {
      const normalizedValue = String(value || '').trim();

      if (!normalizedValue || normalizedValue === defaultValue) {
        return;
      }

      params.set(name, normalizedValue);
    };

    setParam('q', filterForm.elements.q?.value);
    setParam('profileId', filterForm.elements.profileId?.value);
    setParam('categoryId', filterForm.elements.categoryId?.value);
    setParam('status', filterForm.elements.status?.value);
    setParam('company', filterForm.elements.company?.value);
    setParam('sort', filterForm.elements.sort?.value, 'newest');
    setParam('page', filterForm.elements.page?.value, '1');

    const hash = activeAccessView === 'types' ? '#types' : '#requests';

    const nextUrl = params.toString()
      ? `${filterForm.action}?${params.toString()}`
      : filterForm.action;

    window.history.replaceState({}, '', `${nextUrl}${hash}`);
  };

  const applyAccessFilters = () => {
    const { tableBody } = getAccessElements();

    if (!tableBody) {
      syncAccessEmptyState(0);
      updateAccessFilteredCount();
      return;
    }

    const sortDirection = getAccessFilterState().sort;
    const rows = [...tableBody.querySelectorAll('[data-request-row-id]')];
    const visibleRows = [];
    const hiddenRows = [];

    rows.forEach((row) => {
      const matches = matchesAccessRequestFilters(readAccessRequestFromRow(row));

      row.style.display = matches ? '' : 'none';
      (matches ? visibleRows : hiddenRows).push(row);
    });

    visibleRows.sort((leftRow, rightRow) => {
      const leftCreatedTs = Number(leftRow.dataset.requestCreatedTs || 0);
      const rightCreatedTs = Number(rightRow.dataset.requestCreatedTs || 0);

      return sortDirection === 'oldest'
        ? leftCreatedTs - rightCreatedTs
        : rightCreatedTs - leftCreatedTs;
    });

    [...visibleRows, ...hiddenRows].forEach((row) => {
      tableBody.appendChild(row);
    });

    syncAccessEmptyState(visibleRows.length);
    updateAccessFilteredCount();
  };

  const closeAccessActionMenus = ({ except = null } = {}) => {
    document.querySelectorAll('[data-access-actions-menu]').forEach((menu) => {
      const isActiveMenu = Boolean(except && menu === except);
      const panel = menu.querySelector('[data-access-actions-panel]');
      const toggle = menu.querySelector('[data-access-actions-toggle]');

      menu.classList.toggle('is-open', isActiveMenu);

      if (panel) {
        panel.hidden = !isActiveMenu;
      }

      if (toggle) {
        toggle.setAttribute('aria-expanded', isActiveMenu ? 'true' : 'false');
      }
    });
  };

  const toggleAccessActionMenu = (trigger) => {
    const menu = trigger?.closest('[data-access-actions-menu]');

    if (!menu) {
      closeAccessActionMenus();
      return;
    }

    if (menu.classList.contains('is-open')) {
      closeAccessActionMenus();
      return;
    }

    closeAccessActionMenus({ except: menu });
  };

  const buildPassIssuedQuickAction = ({
    request = {},
    ui = {},
    csrfValue = '',
  } = {}) => {
    const issuedLabel = ui.statusHandedOutLabel || 'Issued';
    const rawStatus = request.rawStatus || request.status || 'pending';
    const isIssued = rawStatus === 'handed_out';
    const nextStatus = isIssued ? 'pending' : 'handed_out';
    const actionLabel = isIssued
      ? (ui.markPendingLabel || ui.statusPendingLabel || 'Mark as pending')
      : (ui.markHandedOutLabel || issuedLabel);

    return `
      <form action="/events/${escapeHtml(ui.eventId || '')}/pass/requests/${escapeHtml(request.id)}/status?_method=PUT" method="POST" class="access-status-form" data-live-form data-request-status-form>
        <input type="hidden" name="_csrf" value="${csrfValue}" />
        <input type="hidden" name="status" value="${escapeHtml(nextStatus)}" data-request-status-input />
        <button
          type="submit"
          class="table-icon-button ${isIssued ? 'table-icon-button--danger access-issued-quick-button is-returning' : 'table-icon-button--success access-issued-quick-button'}"
          data-request-status-button
          title="${escapeHtml(actionLabel)}"
          aria-label="${escapeHtml(actionLabel)}"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5.5 10.3 8.5 13.2 14.5 7.2"></path>
            <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"></path>
          </svg>
        </button>
      </form>
    `;
  };

  const buildPassActionsMenu = ({
    request = {},
    ui = {},
    csrfValue = '',
    hasVehicleMovement = false,
    issuedButtonToneClass = '',
    entryButtonToneClass = '',
    exitButtonToneClass = '',
  } = {}) => `
    <div class="access-actions-menu" data-access-actions-menu>
      <button
        type="button"
        class="table-icon-button access-actions-menu__trigger"
        data-access-actions-toggle
        title="${escapeHtml(ui.actionsLabel || 'Actions')}"
        aria-label="${escapeHtml(ui.actionsLabel || 'Actions')}"
        aria-expanded="false"
        aria-haspopup="true"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="4" cy="10" r="1.6"></circle>
          <circle cx="10" cy="10" r="1.6"></circle>
          <circle cx="16" cy="10" r="1.6"></circle>
        </svg>
      </button>

      <div class="access-actions-menu__panel" data-access-actions-panel hidden>
        <button
          type="button"
          class="access-actions-menu__action"
          data-access-history-open
          data-request-id="${escapeHtml(request.id)}"
          data-request-history-url="/events/${escapeHtml(ui.eventId || '')}/pass/requests/${escapeHtml(request.id)}/history"
          data-request-full-name="${escapeHtml(request.fullName || '')}"
          data-request-vehicle-plate="${escapeHtml(request.vehiclePlate || '')}"
          title="${escapeHtml(ui.historyButtonLabel || 'View vehicle history')}"
          aria-label="${escapeHtml(ui.historyButtonLabel || 'View vehicle history')}"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 4.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"></path>
            <path d="M10 7v3l2 1.5"></path>
          </svg>
          <span>${escapeHtml(ui.historyButtonLabel || 'View vehicle history')}</span>
        </button>

        <button
          type="button"
          class="access-actions-menu__action"
          data-access-edit-request
          data-request-id="${escapeHtml(request.id)}"
          data-request-profile-id="${escapeHtml(request.requestProfileId || '')}"
          data-request-category-id="${escapeHtml(request.categoryId || '')}"
          data-request-full-name="${escapeHtml(request.fullName || '')}"
          data-request-company-name="${escapeHtml(request.companyName || '')}"
          data-request-phone="${escapeHtml(request.phone || '')}"
          data-request-email="${escapeHtml(request.email || '')}"
          data-request-vehicle-plate="${escapeHtml(request.vehiclePlate || '')}"
          data-request-notes="${escapeHtml(request.notes || '')}"
          title="${escapeHtml(ui.editLabel || 'Edit')}"
          aria-label="${escapeHtml(ui.editLabel || 'Edit')}"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5"></path>
          </svg>
          <span>${escapeHtml(ui.editLabel || 'Edit')}</span>
        </button>

        <p class="access-actions-menu__section-title">${escapeHtml(ui.statusSectionLabel || 'Status')}</p>

        <form action="/events/${escapeHtml(ui.eventId || '')}/pass/requests/${escapeHtml(request.id)}/status?_method=PUT" method="POST" class="access-status-form" data-live-form data-request-status-form>
          <input type="hidden" name="_csrf" value="${csrfValue}" />
          <input type="hidden" name="status" value="${(request.rawStatus || request.status || 'pending') === 'handed_out' ? 'pending' : 'handed_out'}" data-request-status-input />
          <button type="submit" class="access-actions-menu__action access-actions-menu__action--status ${(request.rawStatus || request.status || 'pending') === 'handed_out' ? 'is-danger' : ''}" data-request-status-button>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5.5 10.3 8.5 13.2 14.5 7.2"></path>
              <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"></path>
            </svg>
            <span>${escapeHtml((request.rawStatus || request.status || 'pending') === 'handed_out'
              ? (ui.markPendingLabel || ui.statusPendingLabel || 'Mark as pending')
              : (ui.statusHandedOutLabel || 'Issued'))}</span>
          </button>
        </form>

        ${hasVehicleMovement ? `
          <form action="/events/${escapeHtml(ui.eventId || '')}/pass/requests/${escapeHtml(request.id)}/movement" method="POST" class="access-status-form" data-live-form data-request-movement-form>
            <input type="hidden" name="_csrf" value="${csrfValue}" />
            <input type="hidden" name="direction" value="entry" />
            <button type="submit" class="access-actions-menu__action access-actions-menu__action--status ${entryButtonToneClass === 'access-mini-button--primary' ? 'is-active' : ''}">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M3.5 10h11"></path>
                <path d="M11 6.2 14.8 10 11 13.8"></path>
              </svg>
              <span>${escapeHtml(ui.entryButtonLabel || 'Enter')}</span>
            </button>
          </form>
          <form action="/events/${escapeHtml(ui.eventId || '')}/pass/requests/${escapeHtml(request.id)}/movement" method="POST" class="access-status-form" data-live-form data-request-movement-form>
            <input type="hidden" name="_csrf" value="${csrfValue}" />
            <input type="hidden" name="direction" value="exit" />
            <button type="submit" class="access-actions-menu__action access-actions-menu__action--status ${exitButtonToneClass === 'access-mini-button--primary' ? 'is-active' : ''}">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M16.5 10h-11"></path>
                <path d="M9 6.2 5.2 10 9 13.8"></path>
              </svg>
              <span>${escapeHtml(ui.exitButtonLabel || 'Exit')}</span>
            </button>
          </form>
        ` : ''}
      </div>
    </div>
  `;

  const buildAccessRequestRow = (request = {}) => {
    const ui = getAccessUi();
    const row = document.createElement('tr');
    const notSet = ui.notSet || '-';
    const isPass = ui.pageType === 'pass';
    const rawStatus = request.rawStatus || request.status || 'pending';
    const displayStatus = request.displayStatus || request.status || 'pending';
    const hasVehicleMovement = isPass && Boolean(request.vehiclePlate);
    const issuedButtonToneClass = rawStatus === 'handed_out'
      ? 'access-mini-button--primary'
      : 'access-mini-button--secondary';
    const entryButtonToneClass = displayStatus === 'entered'
      ? 'access-mini-button--primary'
      : 'access-mini-button--secondary';
    const exitButtonToneClass = displayStatus === 'exited'
      ? 'access-mini-button--primary'
      : 'access-mini-button--secondary';
    const isWristbandReceived = !isPass && rawStatus === 'handed_out';
    const isWristbandSelected = !isWristbandReceived && selectedAccessWristbandRequestIds.has(String(request.id || ''));
    const wristbandToggleLabel = isWristbandReceived
      ? (ui.wristbandReceivedLabel || ui.statusHandedOutLabel || 'Received')
      : isWristbandSelected
        ? (ui.wristbandSelectedToggleLabel || 'Remove wristband')
        : (ui.wristbandToggleLabel || 'Select wristband');
    const statusToneClass = request.statusTone === 'completed'
      ? 'status-completed'
      : request.statusTone === 'active'
        ? 'status-active'
        : 'status-pending';
    const personMeta = escapeHtml(request.notes || request.email || request.phone || '');
    const secondaryUpdatedLabel = request.lastExitAtLabel && Number(request.lastExitAtTs || 0) >= Number(request.lastEntryAtTs || 0)
      ? `${escapeHtml(ui.exitButtonLabel || 'Exited')}: ${escapeHtml(request.lastExitAtLabel)}`
      : request.lastEntryAtLabel
        ? `${escapeHtml(ui.entryAtLabel || 'Entered')}: ${escapeHtml(request.lastEntryAtLabel)}`
        : request.enteredAtLabel
          ? `${escapeHtml(ui.entryAtLabel || 'Entered')}: ${escapeHtml(request.enteredAtLabel)}`
          : '&nbsp;';
    const csrfValue = escapeHtml(document.querySelector('[data-access-request-form] input[name="_csrf"]')?.value || '');

    row.dataset.requestRowId = request.id;
    row.dataset.requestStatus = displayStatus;
    row.dataset.requestRawStatus = rawStatus;
    row.dataset.requestCreatedTs = request.createdAtTs || 0;
    row.dataset.requestCategoryId = request.categoryId || '';
    row.dataset.requestProfileId = request.requestProfileId || '';
    row.dataset.requestFullName = request.fullName || '';
    row.dataset.requestCompanyName = request.companyName || '';
    row.dataset.requestPhone = request.phone || '';
    row.dataset.requestEmail = request.email || '';
    row.dataset.requestVehiclePlate = request.vehiclePlate || '';
    row.dataset.requestNotes = request.notes || '';
    row.dataset.requestProfileName = request.profileName || '';
    row.dataset.requestCategoryName = request.categoryName || '';

    row.innerHTML = `
      <td>
        <div class="access-person-cell">
          <div class="access-person-cell__title">
            <img src="/public/design-assets/icons/feather/users.svg" alt="" />
            <span>${escapeHtml(request.fullName || '')}</span>
          </div>
          <p class="access-person-cell__meta">${personMeta || '&nbsp;'}</p>
        </div>
      </td>
      ${isPass ? `
        <td>
          <div class="access-data-stack">
            <strong>${escapeHtml(request.vehiclePlate || notSet)}</strong>
            <span class="access-pass-number">${escapeHtml(ui.passNumberLabel || 'Pass no.')}: ${escapeHtml(request.id || '')}</span>
          </div>
        </td>
      ` : ''}
      <td>
        <div class="access-data-stack">
          <strong>${escapeHtml(request.categoryName || '')}</strong>
          <span>${escapeHtml(ui.singularLabel || '')}</span>
        </div>
      </td>
      <td>
        <div class="access-data-stack">
          <strong>${escapeHtml(request.companyName || notSet)}</strong>
          <span>${escapeHtml(request.profileName || notSet)}</span>
        </div>
      </td>
      <td>
        <div class="access-data-stack">
          <strong>${escapeHtml(request.phone || notSet)}</strong>
          <span>${escapeHtml(request.email || notSet)}</span>
        </div>
      </td>
      <td>
        <div class="access-data-stack">
          <span class="${statusToneClass}" data-request-status-badge>${escapeHtml(request.statusLabel || '')}</span>
          <span class="access-status-time" data-request-status-time>${escapeHtml(request.statusUpdatedAtLabel || '\u00A0')}</span>
          ${!isPass ? `<span class="access-status-recipient" data-request-recipient-name>${escapeHtml(formatWristbandRecipientLabel(request.handedOutRecipientName || ''))}</span>` : ''}
        </div>
      </td>
      <td>
        <div class="access-data-stack">
          <strong data-request-updated-primary>${escapeHtml(request.createdAtLabel || '')}</strong>
          <span data-request-updated-by>${secondaryUpdatedLabel}</span>
        </div>
      </td>
      <td>
        <div class="access-row-actions ${isPass ? 'access-row-actions--menu' : ''}">
          ${isPass ? `
            ${ui.canManage ? `
            <button
              type="button"
              class="table-icon-button access-print-toggle ${selectedAccessPrintRequestIds.has(String(request.id || '')) ? 'table-icon-button--danger is-selected' : ''}"
              data-access-print-toggle
              data-request-id="${escapeHtml(request.id)}"
              aria-pressed="${selectedAccessPrintRequestIds.has(String(request.id || '')) ? 'true' : 'false'}"
              title="${escapeHtml(selectedAccessPrintRequestIds.has(String(request.id || '')) ? (ui.printSelectedToggleLabel || 'Remove from print') : (ui.printToggleLabel || 'Select for print'))}"
              aria-label="${escapeHtml(selectedAccessPrintRequestIds.has(String(request.id || '')) ? (ui.printSelectedToggleLabel || 'Remove from print') : (ui.printToggleLabel || 'Select for print'))}"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9V3h12v6"></path>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <path d="M6 14h12v7H6z"></path>
              </svg>
            </button>` : ''}
            ${buildPassIssuedQuickAction({ request, ui, csrfValue })}
            ${buildPassActionsMenu({
            request,
            ui,
            csrfValue,
            hasVehicleMovement,
            issuedButtonToneClass,
            entryButtonToneClass,
            exitButtonToneClass,
          })}
          ` : `
          <button
            type="button"
            class="table-icon-button"
            data-access-edit-request
            data-request-id="${escapeHtml(request.id)}"
            data-request-profile-id="${escapeHtml(request.requestProfileId || '')}"
            data-request-category-id="${escapeHtml(request.categoryId || '')}"
            data-request-full-name="${escapeHtml(request.fullName || '')}"
            data-request-company-name="${escapeHtml(request.companyName || '')}"
            data-request-phone="${escapeHtml(request.phone || '')}"
            data-request-email="${escapeHtml(request.email || '')}"
            data-request-vehicle-plate="${escapeHtml(request.vehiclePlate || '')}"
            data-request-notes="${escapeHtml(request.notes || '')}"
            title="${escapeHtml(ui.editLabel || 'Edit')}"
            aria-label="${escapeHtml(ui.editLabel || 'Edit')}"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5"></path>
            </svg>
          </button>
          <form action="/events/${escapeHtml(ui.eventId || '')}/wristband/requests/${escapeHtml(request.id)}/status?_method=PUT" method="POST" class="access-status-form" data-live-form data-request-status-form>
            <input type="hidden" name="_csrf" value="${csrfValue}" />
            <input type="hidden" name="status" value="${isWristbandReceived ? 'pending' : 'handed_out'}" data-request-status-input />
            ${isWristbandReceived ? '' : `<input type="hidden" name="recipientName" value="${escapeHtml(request.fullName || '')}" />`}
            <button
              type="submit"
              class="access-mini-button access-wristband-quick-button ${isWristbandReceived ? 'access-mini-button--secondary is-returning' : 'access-mini-button--primary'}"
              data-request-status-button
              title="${escapeHtml(isWristbandReceived ? (ui.markPendingLabel || 'Mark as pending') : (ui.markHandedOutLabel || 'Mark as received'))}"
              aria-label="${escapeHtml(isWristbandReceived ? (ui.markPendingLabel || 'Mark as pending') : (ui.markHandedOutLabel || 'Mark as received'))}"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5.5 10.3 8.5 13.2 14.5 7.2"></path>
                <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"></path>
              </svg>
              <span>${escapeHtml(isWristbandReceived ? (ui.cancelLabel || 'Cancel') : (ui.statusHandedOutLabel || 'Received'))}</span>
            </button>
          </form>
          <button
            type="button"
            class="table-icon-button access-wristband-toggle ${isWristbandSelected ? 'is-selected' : ''} ${isWristbandReceived ? 'is-received' : ''}"
            data-access-wristband-toggle
            data-request-id="${escapeHtml(request.id)}"
            data-wristband-received="${isWristbandReceived ? 'true' : 'false'}"
            aria-pressed="${isWristbandSelected || isWristbandReceived ? 'true' : 'false'}"
            aria-disabled="${isWristbandReceived ? 'true' : 'false'}"
            title="${escapeHtml(wristbandToggleLabel)}"
            aria-label="${escapeHtml(wristbandToggleLabel)}"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5.5 10.3 8.5 13.2 14.5 7.2"></path>
              <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"></path>
            </svg>
          </button>
          `}
        </div>
      </td>
    `;

    return row;
  };

  const insertAccessRowSorted = (row) => {
    const { tableBody } = getAccessElements();

    if (!tableBody) {
      return false;
    }

    const rowCreatedTs = Number(row.dataset.requestCreatedTs || 0);
    const sortDirection = getAccessFilterState().sort;
    const rows = [...tableBody.querySelectorAll('[data-request-row-id]')];

    if (!rows.length) {
      tableBody.appendChild(row);
      return true;
    }

    const targetIndex = rows.findIndex((currentRow) => {
      const currentCreatedTs = Number(currentRow.dataset.requestCreatedTs || 0);
      return sortDirection === 'oldest'
        ? rowCreatedTs < currentCreatedTs
        : rowCreatedTs > currentCreatedTs;
    });

    if (targetIndex === -1) {
      tableBody.appendChild(row);
      return true;
    }

    tableBody.insertBefore(row, rows[targetIndex]);
    return true;
  };

  const applyAccessRequestUpsert = (payload = {}) => {
    const { request, summary, requestType } = payload;
    const elements = getAccessElements();
    const ui = getAccessUi();

    if (!elements.workspace || requestType !== ui.pageType || !request) {
      return false;
    }

    updateAccessSummary(summary || {});

    if (isAccessServerPaginationEnabled()) {
      return false;
    }

    const normalizedRequest = {
      ...request,
      type: requestType,
    };
    const existingRow = document.querySelector(`[data-request-row-id="${escapeSelector(request.id)}"]`);
    const previousRequest = snapshotAccessRequestFromRow(existingRow);
    const matchesFilters = matchesAccessRequestFilters(normalizedRequest);

    if (!elements.tableBody) {
      return false;
    }

    if (!matchesFilters) {
      if (previousRequest) {
        updateAccessTypeUsageMetrics(previousRequest, snapshotAccessRequest(normalizedRequest));
      }

      if (existingRow) {
        existingRow.remove();
        selectedAccessPrintRequestIds.delete(String(request.id));
        selectedAccessWristbandRequestIds.delete(String(request.id));
        syncAccessPrintSelection();
        syncAccessWristbandSelection();
        applyAccessFilters();
        return true;
      }

      applyAccessFilters();
      return true;
    }

    const nextRow = buildAccessRequestRow(normalizedRequest);

    if (previousRequest || !hasActiveAccessFilters()) {
      updateAccessTypeUsageMetrics(previousRequest, snapshotAccessRequest(normalizedRequest));
    }

    if (existingRow) {
      existingRow.replaceWith(nextRow);
      syncAccessPrintSelection();
      syncAccessWristbandSelection();
      applyAccessFilters();
      return true;
    }

    if (!elements.table) {
      return false;
    }

    insertAccessRowSorted(nextRow);
    syncAccessPrintSelection();
    syncAccessWristbandSelection();
    applyAccessFilters();
    return true;
  };

  const applyAccessRequestDelete = (payload = {}) => {
    const { requestId, requestType, summary } = payload;
    const elements = getAccessElements();
    const ui = getAccessUi();

    if (!elements.workspace || requestType !== ui.pageType) {
      return false;
    }

    updateAccessSummary(summary || {});

    if (isAccessServerPaginationEnabled()) {
      return false;
    }

    const row = document.querySelector(`[data-request-row-id="${escapeSelector(requestId)}"]`);

    if (!row) {
      return false;
    }

    updateAccessTypeUsageMetrics(snapshotAccessRequestFromRow(row), null);

    row.remove();
    selectedAccessPrintRequestIds.delete(String(requestId));
    selectedAccessWristbandRequestIds.delete(String(requestId));
    syncAccessPrintSelection();
    syncAccessWristbandSelection();
    applyAccessFilters();
    return true;
  };

  const closeAccessRequestModal = () => {
    const { requestModal, requestForm, requestMethodHolder, requestTitle, requestEyebrow, requestSubmitLabel } = getAccessElements();
    const ui = getAccessUi();

    if (!requestModal || !requestForm) {
      return;
    }

    requestModal.classList.remove('is-open');
    document.body.classList.remove('portal-modal-open');
    requestForm.reset();
    resetAccessRequestProfileSearch();
    requestForm.action = ui.requestCreateAction || '';

    if (requestMethodHolder) {
      requestMethodHolder.innerHTML = '';
    }

    if (requestTitle) {
      requestTitle.textContent = ui.requestCreateTitle || 'Add request';
    }

    if (requestEyebrow) {
      requestEyebrow.textContent = ui.requestCreateTitle || 'Add request';
    }

    if (requestSubmitLabel) {
      requestSubmitLabel.textContent = ui.requestCreateSubmit || 'Save';
    }
  };

  const closeAccessExportModal = () => {
    const { exportModal } = getAccessElements();

    if (!exportModal) {
      return;
    }

    exportModal.classList.remove('is-open');
    document.body.classList.remove('portal-modal-open');
  };

  const closeAccessHistoryModal = () => {
    const {
      historyModal,
      historyTitle,
      historyEyebrow,
      historyMeta,
      historySummary,
      historyLoading,
      historyEmpty,
      historyList,
    } = getAccessElements();
    const ui = getAccessUi();

    if (!historyModal) {
      return;
    }

    historyModal.classList.remove('is-open');
    document.body.classList.remove('portal-modal-open');

    if (historyTitle) {
      historyTitle.textContent = ui.historyTitle || 'Vehicle history';
    }

    if (historyEyebrow) {
      historyEyebrow.textContent = ui.historyTitle || 'Vehicle history';
    }

    if (historyMeta) {
      historyMeta.textContent = '';
    }

    if (historySummary) {
      historySummary.innerHTML = '';
      historySummary.hidden = true;
    }

    if (historyLoading) {
      historyLoading.textContent = ui.historyLoading || 'Loading history...';
      historyLoading.hidden = false;
    }

    if (historyEmpty) {
      historyEmpty.textContent = ui.historyEmpty || 'No vehicle history has been recorded for this pass yet.';
      historyEmpty.hidden = true;
    }

    if (historyList) {
      historyList.innerHTML = '';
    }
  };

  const renderAccessHistorySummary = (request = {}) => {
    const ui = getAccessUi();
    const notSet = ui.notSet || '-';
    const entries = [
      [ui.vehiclePlateLabel || 'Vehicle plate', request.vehiclePlate || notSet],
      [ui.historyCompanyLabel || 'Company', request.companyName || notSet],
      [ui.historyTypeLabel || 'Pass type', request.categoryName || notSet],
      [ui.historyProfileLabel || 'Profile', request.profileName || notSet],
      [ui.historyRegisteredLabel || 'Registered', request.createdAtLabel || notSet],
      [ui.historyEntryLabel || 'Entered', request.enteredAtLabel || notSet],
      [ui.historyLastEntryLabel || 'Last entry', request.lastEntryAtLabel || notSet],
      [ui.historyLastExitLabel || 'Last exit', request.lastExitAtLabel || notSet],
    ];

    return entries.map(([label, value]) => `
      <div class="access-history-summary__item">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join('');
  };

  const buildAccessHistoryMeta = (vehiclePlate = '', limit = 0) => {
    const ui = getAccessUi();
    const parts = [];

    if (vehiclePlate) {
      parts.push(vehiclePlate);
    }

    if (limit > 0 && ui.historyLimitTemplate) {
      parts.push(ui.historyLimitTemplate.replace('__COUNT__', String(limit)));
    }

    return parts.join(' · ');
  };

  const renderAccessHistoryItems = (items = []) => {
    const ui = getAccessUi();
    const notSet = ui.notSet || '-';

    if (!items.length) {
      return '';
    }

    const renderCell = (primary, secondary = '') => `
      <div class="access-history-cell">
        <strong>${escapeHtml(primary || notSet)}</strong>
        ${secondary ? `<span>${escapeHtml(secondary)}</span>` : ''}
      </div>
    `;

    const rows = items.map((item) => {
      const detailChips = Array.isArray(item.detailChips) ? item.detailChips.filter(Boolean) : [];

      return `
        <tr>
          <td>${renderCell(item.createdAtLabel || notSet)}</td>
          <td>
            <span class="portal-type-pill access-history-pill ${item.eventToneClass || 'is-pass'}">${escapeHtml(item.eventLabel || '')}</span>
          </td>
          <td>${renderCell(item.actorLabel || notSet)}</td>
          <td>${renderCell(item.sourceLabel || notSet)}</td>
          <td>
            <div class="access-history-cell">
              <strong>${escapeHtml(item.detailsPrimary || notSet)}</strong>
            </div>
            ${detailChips.length
              ? `<div class="access-history-chip-list">${detailChips.map((label) => `<span class="access-history-chip">${escapeHtml(label)}</span>`).join('')}</div>`
              : `<span class="access-history-empty">${escapeHtml(notSet)}</span>`}
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="access-history-table-wrap">
        <table class="access-history-table">
          <thead>
            <tr>
              <th>${escapeHtml(ui.historyTimeLabel || 'Time')}</th>
              <th>${escapeHtml(ui.historyEventLabel || 'Event')}</th>
              <th>${escapeHtml(ui.historyActorLabel || 'Actor')}</th>
              <th>${escapeHtml(ui.historyOriginLabel || 'Origin')}</th>
              <th>${escapeHtml(ui.historyDetailsLabel || 'Details')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  };

  const openAccessHistoryModal = async (trigger) => {
    const {
      historyModal,
      historyTitle,
      historyEyebrow,
      historyMeta,
      historySummary,
      historyLoading,
      historyEmpty,
      historyList,
    } = getAccessElements();
    const ui = getAccessUi();

    if (!historyModal || !trigger?.dataset.requestHistoryUrl) {
      return;
    }

    closeAccessRequestModal();
    closeAccessExportModal();
    closeAccessPrintReceiveModal();
    closeAccessWristbandReceiveModal();
    closeAccessHistoryModal();

    if (historyTitle) {
      historyTitle.textContent = trigger.dataset.requestFullName || ui.historyTitle || 'Vehicle history';
    }

    if (historyEyebrow) {
      historyEyebrow.textContent = ui.historyTitle || 'Vehicle history';
    }

    if (historyMeta) {
      historyMeta.textContent = trigger.dataset.requestVehiclePlate || '';
    }

    historyModal.classList.add('is-open');
    document.body.classList.add('portal-modal-open');

    try {
      const response = await fetch(trigger.dataset.requestHistoryUrl, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        throw new Error(payload?.error || ui.historyError || 'Could not load vehicle history.');
      }

      if (historyTitle) {
        historyTitle.textContent = payload.request?.fullName || ui.historyTitle || 'Vehicle history';
      }

      if (historyMeta) {
        historyMeta.textContent = buildAccessHistoryMeta(payload.request?.vehiclePlate || '', payload.historyLimit || 0);
      }

      if (historySummary) {
        historySummary.innerHTML = renderAccessHistorySummary(payload.request || {});
        historySummary.hidden = false;
      }

      if (historyLoading) {
        historyLoading.hidden = true;
      }

      if (!payload.historyEntries?.length) {
        if (historyEmpty) {
          historyEmpty.hidden = false;
        }
        return;
      }

      if (historyList) {
        historyList.innerHTML = renderAccessHistoryItems(payload.historyEntries);
      }
    } catch (error) {
      if (historyLoading) {
        historyLoading.hidden = true;
      }

      if (historyEmpty) {
        historyEmpty.hidden = false;
        historyEmpty.textContent = error.message || ui.historyError || 'Could not load vehicle history.';
      }
    }
  };

  const openAccessRequestModal = (trigger = null) => {
    const {
      requestModal,
      requestForm,
      requestCategory,
      requestProfile,
      requestMethodHolder,
      requestTitle,
      requestEyebrow,
      requestSubmitLabel,
    } = getAccessElements();
    const workspace = getAccessElements().workspace;
    const ui = getAccessUi();

    if (!requestModal || !requestForm || !workspace) {
      return;
    }

    closeAccessHistoryModal();
    closeAccessExportModal();
    closeAccessPrintReceiveModal();
    closeAccessWristbandReceiveModal();

    const eventId = ui.eventId || document.body.dataset.eventRoom || '';
    const accessType = ui.pageType || (window.location.pathname.includes('/wristbands') ? 'wristband' : 'pass');
    const isEdit = Boolean(trigger?.dataset.requestId);

    requestForm.reset();
    resetAccessRequestProfileSearch();
    requestForm.action = isEdit
      ? `/events/${eventId}/${accessType}/requests/${trigger.dataset.requestId}?_method=PUT`
      : (ui.requestCreateAction || `/events/${eventId}/${accessType}/requests`);

    if (requestMethodHolder) {
      requestMethodHolder.innerHTML = '';
    }

    if (requestTitle) {
      requestTitle.textContent = isEdit
        ? (ui.requestEditTitle || 'Edit request')
        : (ui.requestCreateTitle || 'Add request');
    }

    if (requestEyebrow) {
      requestEyebrow.textContent = isEdit
        ? (ui.requestEditTitle || 'Edit request')
        : (ui.requestCreateTitle || 'Add request');
    }

    if (requestSubmitLabel) {
      requestSubmitLabel.textContent = isEdit
        ? (ui.requestSaveSubmit || 'Save')
        : (ui.requestCreateSubmit || 'Save');
    }

    setNamedFormFieldValue(requestForm, 'fullName', trigger?.dataset.requestFullName || '');
    setNamedFormFieldValue(requestForm, 'companyName', trigger?.dataset.requestCompanyName || '');
    setNamedFormFieldValue(requestForm, 'phone', trigger?.dataset.requestPhone || '');
    setNamedFormFieldValue(requestForm, 'email', trigger?.dataset.requestEmail || '');
    setNamedFormFieldValue(requestForm, 'vehiclePlate', trigger?.dataset.requestVehiclePlate || '');
    setNamedFormFieldValue(requestForm, 'notes', trigger?.dataset.requestNotes || '');

    if (requestCategory) {
      requestCategory.value = trigger?.dataset.requestCategoryId || '';

      if (!requestCategory.value && requestCategory.options.length) {
        requestCategory.selectedIndex = 0;
      }
    }

    if (requestProfile) {
      requestProfile.value = trigger?.dataset.requestProfileId || '';
    }

    filterAccessRequestProfileOptions();

    requestModal.classList.add('is-open');
    document.body.classList.add('portal-modal-open');
  };

  const openAccessExportModal = () => {
    const { exportModal } = getAccessElements();

    if (!exportModal) {
      return;
    }

    exportModal.querySelectorAll('[data-access-export-download]').forEach((link) => {
      if (!link.dataset.exportBaseHref) {
        link.dataset.exportBaseHref = link.getAttribute('href') || '';
      }

      const nextHref = buildAccessExportUrl(link.dataset.exportBaseHref);

      if (nextHref) {
        link.setAttribute('href', nextHref);
      }
    });

    closeAccessHistoryModal();
    closeAccessRequestModal();
    closeAccessPrintReceiveModal();
    closeAccessWristbandReceiveModal();
    exportModal.classList.add('is-open');
    document.body.classList.add('portal-modal-open');
  };

  const submitLiveFilterForm = async (form, { delay = 0 } = {}) => {
    window.clearTimeout(liveFilterTimer);

    const run = async () => {
      const searchParams = new URLSearchParams(new FormData(form));
      const targetUrl = `${form.action}?${searchParams.toString()}`;

      try {
        activeAccessView = 'requests';
        window.history.replaceState({}, '', `${targetUrl}#requests`);
        await refreshLiveSections(targetUrl, { abortPrevious: true });
        syncAccessFilterUrl();
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }

        window.location.href = targetUrl;
      }
    };

    if (delay > 0) {
      liveFilterTimer = window.setTimeout(run, delay);
      return;
    }

    await run();
  };

  const getPortalElements = () => ({
    app: document.querySelector('[data-portal-app]'),
    workspaceTitle: document.querySelector('[data-portal-workspace-title]'),
    workspaceDescription: document.querySelector('[data-portal-workspace-description]'),
    viewPanels: [...document.querySelectorAll('[data-portal-view-panel]')],
    backButtons: [...document.querySelectorAll('[data-portal-back-to-table]')],
    requestForm: document.querySelector('[data-portal-request-form]'),
    requestSubmitLabel: document.querySelector('[data-portal-request-submit-label]'),
    requestCategorySelect: document.querySelector('[data-portal-category-select]'),
    requestMethodHolder: document.querySelector('[data-portal-method-holder]'),
    requestPassOnlyFields: [...document.querySelectorAll('[data-portal-pass-only-field]')],
    importPreviewForm: document.querySelector('[data-portal-import-preview-form]'),
    importTypeInput: document.querySelector('[data-portal-import-type]'),
    importCategory: document.querySelector('[data-portal-import-category]'),
    importFileInput: document.querySelector('[data-portal-import-file]'),
    importTemplateLink: document.querySelector('[data-portal-template-link]'),
    importPreviewSubmitButton: document.querySelector('[data-portal-import-preview-submit]'),
    importPreviewLoader: document.querySelector('[data-portal-import-preview-loader]'),
    importPreview: document.querySelector('[data-portal-import-preview]'),
    importConfirmButton: document.querySelector('[data-portal-import-confirm]'),
    tableRows: [...document.querySelectorAll('[data-request-row]')],
    tabButtons: [...document.querySelectorAll('[data-portal-tab]')],
    sortSelect: document.querySelector('[data-portal-table-sort]'),
    sortDirectionLabel: document.querySelector('[data-portal-sort-direction-label]'),
    summaryCards: [...document.querySelectorAll('[data-portal-summary-card]')],
  });

  const syncPortalRequestFormLayout = (type) => {
    const { requestForm, requestPassOnlyFields } = getPortalElements();
    const isPass = type === 'pass';

    requestPassOnlyFields.forEach((field) => {
      field.classList.toggle('hidden', !isPass);
    });

    if (requestForm?.elements.vehiclePlate) {
      requestForm.elements.vehiclePlate.disabled = !isPass;
      requestForm.elements.vehiclePlate.required = isPass;
      requestForm.elements.vehiclePlate.setAttribute('aria-required', isPass ? 'true' : 'false');

      if (!isPass) {
        requestForm.elements.vehiclePlate.value = '';
      }
    }
  };

  const syncPortalSortControls = () => {
    const { sortSelect, sortDirectionLabel } = getPortalElements();
    const ui = getPortalUi();

    if (sortSelect) {
      sortSelect.value = portalTableSortField;
    }

    if (sortDirectionLabel) {
      sortDirectionLabel.textContent = portalTableSortDirection === 'asc'
        ? (ui.sortDirectionAsc || 'Ascending')
        : (ui.sortDirectionDesc || 'Newest first');
    }
  };

  const setPortalSummaryCardState = (card, expanded) => {
    const { app } = getPortalElements();
    const toggle = card?.querySelector('[data-portal-summary-toggle]');
    const content = card?.querySelector('[data-portal-summary-content]');
    const isMobile = window.innerWidth <= 767;
    const expandLabel = app?.dataset.portalSummaryExpandLabel || 'Show details';
    const collapseLabel = app?.dataset.portalSummaryCollapseLabel || 'Hide details';

    if (!card || !toggle || !content) {
      return;
    }

    if (!isMobile) {
      card.dataset.expanded = 'true';
      card.classList.add('is-expanded');
      card.classList.remove('is-collapsed');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', collapseLabel);
      content.hidden = false;
      return;
    }

    card.dataset.expanded = expanded ? 'true' : 'false';
    card.classList.toggle('is-expanded', expanded);
    card.classList.toggle('is-collapsed', !expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? collapseLabel : expandLabel);
    content.hidden = !expanded;
  };

  const syncPortalSummaryCards = () => {
    const { summaryCards } = getPortalElements();
    const isMobile = window.innerWidth <= 767;

    summaryCards.forEach((card) => {
      const expanded = !isMobile || card.dataset.expanded === 'true';
      setPortalSummaryCardState(card, expanded);
    });
  };

  const togglePortalSummaryCard = (card) => {
    const { summaryCards } = getPortalElements();
    const isMobile = window.innerWidth <= 767;

    if (!card || !isMobile) {
      return;
    }

    const willExpand = card.dataset.expanded !== 'true';

    summaryCards.forEach((summaryCard) => {
      setPortalSummaryCardState(summaryCard, summaryCard === card ? willExpand : false);
    });
  };

  const setPortalTab = (tab) => {
    const { tabButtons } = getPortalElements();
    const availableTabs = tabButtons.map((button) => button.dataset.tab).filter(Boolean);
    const nextTab = availableTabs.includes(tab)
      ? tab
      : availableTabs.includes('all')
        ? 'all'
        : availableTabs[0] || 'all';

    activePortalTab = nextTab;

    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === nextTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    filterPortalRows();
  };

  const syncPortalWorkspaceHeader = () => {
    const elements = getPortalElements();
    const ui = getPortalUi();
    const copy = getPortalWorkspaceCopy();

    if (!elements.workspaceTitle || !elements.workspaceDescription) {
      return;
    }

    if (activePortalWorkspaceView === 'request') {
      elements.workspaceTitle.textContent = activePortalRequestMode === 'edit'
        ? (ui.editRequestTitle || 'Edit request')
        : activePortalRequestMode === 'copy'
          ? (ui.copyRequestTitle || 'Copy request')
          : activePortalRequestType === 'pass'
            ? (ui.addPassTitle || 'Add pass')
            : (ui.addWristbandTitle || 'Add wristband');
      elements.workspaceDescription.textContent = copy.requestDescription || '';
      return;
    }

    if (activePortalWorkspaceView === 'import') {
      elements.workspaceTitle.textContent = activePortalImportType === 'pass'
        ? (ui.importPassTitle || 'Import passes from Excel')
        : (ui.importWristbandTitle || 'Import wristbands from Excel');
      elements.workspaceDescription.textContent = copy.importDescription || '';
      return;
    }

    elements.workspaceTitle.textContent = copy.tableTitle || 'All submitted requests';
    elements.workspaceDescription.textContent = copy.tableDescription || '';
  };

  const setPortalWorkspaceView = (view) => {
    activePortalWorkspaceView = view;
    const elements = getPortalElements();

    elements.viewPanels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.portalViewPanel === view);
    });

    elements.backButtons.forEach((button) => {
      button.classList.toggle('hidden', view === 'table');
    });

    syncPortalWorkspaceHeader();
  };

  const fillCategoryOptions = (select, type, currentCategoryId = null, options = {}) => {
    if (!select) {
      return;
    }

    const state = getPortalState();

    if (!state) {
      return;
    }

    const source = type === 'pass' ? state.passQuotaUsage || [] : state.wristbandQuotaUsage || [];
    const includeCurrentCategory = options.includeCurrentCategory !== false;
    const eligible = source.filter(
      (entry) => (
        entry.can_create !== false
        || (includeCurrentCategory && Number(entry.category_id) === Number(currentCategoryId))
      ) && (
        entry.is_unlimited
        || Number(entry.remaining_count) > 0
        || (includeCurrentCategory && Number(entry.category_id) === Number(currentCategoryId))
      ),
    );
    const explicitCategoryId = currentCategoryId ? String(currentCategoryId) : '';
    const preferredCategoryId = explicitCategoryId || getPortalPreferredCategoryId(type);
    const selectedCategoryId = eligible.some(
      (entry) => Number(entry.category_id) === Number(preferredCategoryId),
    ) ? preferredCategoryId : '';

    select.innerHTML = '';
    select.dataset.portalCategoryType = type;

    eligible.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.category_id;
      option.textContent = entry.is_unlimited
        ? `${entry.category_name} (${entry.used_count}/∞)`
        : `${entry.category_name} (${entry.used_count}/${entry.quota})`;
      option.selected = selectedCategoryId
        ? Number(entry.category_id) === Number(selectedCategoryId)
        : false;
      select.appendChild(option);
    });

    if (!eligible.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = getPortalUi().noAvailableCategories || 'No available categories';
      option.disabled = true;
      option.selected = true;
      select.appendChild(option);
    }
  };

  const openRequestPanel = ({ type, mode = 'create', request = null }) => {
    const elements = getPortalElements();

    if (!elements.requestForm) {
      return;
    }

    const ui = getPortalUi();
    activePortalRequestType = type;
    activePortalRequestMode = mode;
    elements.requestForm.reset();
    syncPortalRequestFormLayout(type);
    elements.requestForm.action = `/p/${type}`;
    if (elements.requestSubmitLabel) {
      elements.requestSubmitLabel.textContent = mode === 'edit'
        ? (ui.saveRequest || 'Save request')
        : (ui.addRequest || 'Add request');
    }

    if (elements.requestMethodHolder) {
      elements.requestMethodHolder.innerHTML = '';
    }

    if (request && (mode === 'edit' || mode === 'copy')) {
      setNamedFormFieldValue(elements.requestForm, 'fullName', request.fullName || '');
      setNamedFormFieldValue(elements.requestForm, 'companyName', request.companyName || '');
      setNamedFormFieldValue(elements.requestForm, 'phone', request.phone || '');
      setNamedFormFieldValue(elements.requestForm, 'email', request.email || '');
      setNamedFormFieldValue(elements.requestForm, 'vehiclePlate', mode === 'copy' ? '' : (request.vehiclePlate || ''));
      setNamedFormFieldValue(elements.requestForm, 'notes', request.notes || '');
    }

    if (mode === 'edit' && request) {
      elements.requestForm.action = `/p/${type}/${request.id}?_method=PUT`;
      fillCategoryOptions(elements.requestCategorySelect, type, request.categoryId);
    } else if (mode === 'copy' && request) {
      fillCategoryOptions(elements.requestCategorySelect, type, request.categoryId);
    } else {
      fillCategoryOptions(elements.requestCategorySelect, type);
    }

    elements.requestForm.dataset.requestType = type;
    setPortalWorkspaceView('request');
  };

  const updateImportTemplateLink = () => {
    const elements = getPortalElements();

    if (!elements.importTypeInput || !elements.importCategory || !elements.importTemplateLink) {
      return;
    }

    const type = elements.importTypeInput.value;
    const categoryId = elements.importCategory.value;
    elements.importTemplateLink.href = `/p/import/template?type=${encodeURIComponent(type)}&categoryId=${encodeURIComponent(categoryId)}`;
  };

  const openImportPanel = (type) => {
    const elements = getPortalElements();

    if (!elements.importPreviewForm) {
      return;
    }

    activePortalImportType = type;
    elements.importPreviewForm.reset();
    elements.importTypeInput.value = type;
    if (elements.importPreviewLoader) {
      elements.importPreviewLoader.classList.add('hidden');
      elements.importPreviewLoader.hidden = true;
    }
    elements.importPreview.classList.add('hidden');
    elements.importPreview.innerHTML = '';
    elements.importConfirmButton.classList.add('hidden');
    elements.importConfirmButton.dataset.token = '';
    elements.importConfirmButton.disabled = false;
    fillCategoryOptions(elements.importCategory, type);
    updateImportTemplateLink();
    setPortalWorkspaceView('import');
  };

  const setPortalImportPreviewLoading = (isLoading) => {
    const {
      importPreviewLoader,
      importPreview,
      importConfirmButton,
      importCategory,
      importFileInput,
      importPreviewSubmitButton,
    } = getPortalElements();

    if (importPreviewLoader) {
      importPreviewLoader.classList.toggle('hidden', !isLoading);
      importPreviewLoader.hidden = !isLoading;
    }

    if (importPreview && isLoading) {
      importPreview.classList.add('hidden');
      importPreview.innerHTML = '';
    }

    if (importConfirmButton) {
      if (isLoading) {
        importConfirmButton.classList.add('hidden');
        importConfirmButton.dataset.token = '';
      }

      importConfirmButton.disabled = isLoading;
    }

    if (importCategory) {
      importCategory.disabled = isLoading;
    }

    if (importFileInput) {
      importFileInput.disabled = isLoading;
    }

    setLiveSubmitterState(importPreviewSubmitButton, isLoading);
  };

  const renderImportPreview = (preview) => {
    const elements = getPortalElements();

    if (!elements.importPreview) {
      return;
    }

    const ui = getPortalUi();
    const showVehiclePlate = preview.type === 'pass' || (preview.rows || []).some((row) => row.vehiclePlate);
    const overallErrors = (preview.overallErrors || [])
      .map((message) => `<li>${message}</li>`)
      .join('');

    const rows = (preview.rows || [])
      .map((row) => `
        <tr>
          <td>${row.rowNumber}</td>
          <td>${row.fullName || '-'}</td>
          <td>${row.phone || '-'}</td>
          <td>${row.companyName || '-'}</td>
          <td>${row.email || '-'}</td>
          ${showVehiclePlate ? `<td>${row.vehiclePlate || '-'}</td>` : ''}
          <td class="portal-preview-validation ${row.errors?.length ? '' : 'is-ok'}">${(row.errors || []).join('<br>') || (ui.previewOk || 'OK')}</td>
        </tr>
      `)
      .join('');

    elements.importPreview.innerHTML = `
      <div class="portal-preview-wrap">
        <div class="portal-preview-summary">
          <p><strong>${ui.previewRows || 'Rows'}:</strong> ${preview.totalRows}</p>
          <p><strong>${ui.previewValidRows || 'Valid rows'}:</strong> ${preview.validRows}</p>
          ${overallErrors ? `<ul class="portal-preview-errors">${overallErrors}</ul>` : ''}
        </div>
        <div class="portal-preview-table-wrap">
          <table class="portal-preview-table">
            <thead>
              <tr>
                <th>${ui.previewRowColumn || 'Row'}</th>
                <th>${ui.previewNameColumn || 'Name'}</th>
                <th>${ui.previewPhoneColumn || 'Phone'}</th>
                <th>${ui.previewCompanyColumn || 'Company'}</th>
                <th>${ui.previewEmailColumn || 'Email'}</th>
                ${showVehiclePlate ? `<th>${ui.previewVehiclePlateColumn || 'Vehicle Plate'}</th>` : ''}
                <th>${ui.previewValidationColumn || 'Validation'}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
    elements.importPreview.classList.remove('hidden');
    elements.importConfirmButton.classList.toggle('hidden', !preview.canImport);
    elements.importConfirmButton.dataset.token = preview.token || '';
  };

  const initializePortalUI = () => {
    if (!document.querySelector('[data-portal-app]')) {
      return;
    }

    const availability = getPortalAvailability();

    if (!availability.hasPassAccess && availability.hasWristbandAccess) {
      activePortalRequestType = 'wristband';
      activePortalImportType = 'wristband';
    }

    if (!availability.hasWristbandAccess && availability.hasPassAccess) {
      activePortalRequestType = 'pass';
      activePortalImportType = 'pass';
    }

    const searchInput = document.querySelector('[data-portal-table-search]');

    if (searchInput) {
      searchInput.value = portalTableSearchQuery;
    }

    syncPortalSortControls();
    syncPortalSummaryCards();
    syncPortalRequestFormLayout(activePortalRequestType);
    setPortalTab(activePortalTab);
    setPortalWorkspaceView(activePortalWorkspaceView);
    updateImportTemplateLink();
  };

  const initializeEventDashboardTabs = () => {
    const { app, tabButtons } = getEventDashboardElements();

    if (!app || !tabButtons.length) {
      return;
    }

    setEventDashboardTab(activeEventDashboardTab, {
      updateHash: activeEventDashboardTab === 'api',
    });
    syncVehicleGateApiPreview();
  };

  sidebarToggles.forEach((toggle) => {
    toggle.addEventListener('click', openSidebar);
  });

  sidebarClosers.forEach((closer) => {
    closer.addEventListener('click', closeSidebar);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      closeSidebar();
    }

    syncCompactHeader();
    syncPortalSummaryCards();
  });

  if (worldnicHeader) {
    syncCompactHeader();
    window.addEventListener('scroll', requestCompactHeaderSync, { passive: true });
  }

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('[data-access-profile-filter-search]')) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAccessProfileFilter({ restoreFocus: true });
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const firstVisibleOption = filterAccessProfileOptions();

        if (firstVisibleOption) {
          applyAccessProfileFilterSelection(firstVisibleOption);
        }
      }

      return;
    }

    if (
      (event.key === 'Backspace' || event.key === 'Delete')
      && passPrintEditorState.activeTab === 'editor'
      && passPrintEditorState.canManage
      && passPrintEditorState.selectedId
      && !event.metaKey
      && !event.ctrlKey
      && !event.altKey
      && !isPassPrintEditingShortcutTarget(event.target)
    ) {
      event.preventDefault();
      removeSelectedPassPrintField();
      return;
    }

    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      && passPrintEditorState.activeTab === 'editor'
      && passPrintEditorState.canManage
      && getPassPrintSelectedIds().length
      && !event.metaKey
      && !event.ctrlKey
      && !event.altKey
      && !isPassPrintEditingShortcutTarget(event.target)
    ) {
      event.preventDefault();

      const step = event.shiftKey ? 0.02 : 0.005;

      if (event.key === 'ArrowUp') {
        moveSelectedPassPrintFields(0, -step);
      } else if (event.key === 'ArrowDown') {
        moveSelectedPassPrintFields(0, step);
      } else if (event.key === 'ArrowLeft') {
        moveSelectedPassPrintFields(-step, 0);
      } else if (event.key === 'ArrowRight') {
        moveSelectedPassPrintFields(step, 0);
      }

      return;
    }

    if (event.key === 'Escape') {
      hideTooltip();
      closeCheckScanner();
      closeAccessActionMenus();
      closeAccessProfileFilter();
      closeSidebar();
      setAccessFullscreen(false);
      setPortalWorkspaceView('table');
      closeAccessHistoryModal();
      closeAccessRequestModal();
      closeAccessExportModal();
      closeRequestProfileStatisticsModal();
      closeRequestProfileQrModal();
      closePassPrintPreviewModal();
      setPassPrintFullscreen(false);
    }
  });

  document.addEventListener('pointerover', (event) => {
    const trigger = findClosestTarget(event.target, tooltipTriggerSelector);

    if (trigger && activeTooltipTrigger !== trigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener('pointerout', (event) => {
    const trigger = findClosestTarget(event.target, tooltipTriggerSelector);
    const nextTarget = event.relatedTarget;
    const isMovingWithinTrigger = nextTarget instanceof Node && trigger?.contains(nextTarget);

    if (trigger && !isMovingWithinTrigger) {
      hideTooltip(trigger);
    }
  });

  document.addEventListener('focusin', (event) => {
    const trigger = findClosestTarget(event.target, tooltipTriggerSelector);

    if (trigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener('focusout', (event) => {
    const trigger = findClosestTarget(event.target, tooltipTriggerSelector);

    if (trigger) {
      hideTooltip(trigger);
    }
  });

  document.addEventListener('pointerdown', () => {
    hideTooltip();
  });

  window.addEventListener('scroll', () => {
    if (activeTooltipTrigger) {
      positionTooltip(activeTooltipTrigger);
    }
  }, true);

  window.addEventListener('resize', () => {
    if (activeTooltipTrigger) {
      positionTooltip(activeTooltipTrigger);
    }
  });

  if (menuButton && menuPanel) {
    menuButton.addEventListener('click', () => {
      menuPanel.classList.toggle('hidden');
    });
  }

  document.addEventListener('click', async (event) => {
    const closest = (selector) => findClosestTarget(event.target, selector);
    const memberSearchOption = closest('[data-member-search-option]');
    const memberSearchPanel = closest('[data-member-search-panel]');
    const memberSearchInput = closest('[data-member-email-search]');
    const systemTemplatePreviewTrigger = closest('[data-system-template-preview]');
    const systemTemplatePreviewCloseTrigger = closest('[data-system-template-preview-close]');
    const accessActionMenuTrigger = closest('[data-access-actions-toggle]');
    const accessActionMenu = closest('[data-access-actions-menu]');
    const accessProfileFilter = closest('[data-access-profile-filter]');
    const accessProfileFilterTrigger = closest('[data-access-profile-filter-trigger]');
    const accessProfileFilterOption = closest('[data-access-profile-filter-option]');
    const dashboardEventSummary = closest('[data-dashboard-event-summary]');
    const checkScannerOpenTrigger = closest('[data-check-scanner-open]');
    const checkScannerCloseTrigger = closest('[data-check-scanner-close]');

    if (checkScannerOpenTrigger) {
      event.preventDefault();
      await openCheckScanner();
      return;
    }

    if (checkScannerCloseTrigger) {
      event.preventDefault();
      closeCheckScanner();
      return;
    }

    if (systemTemplatePreviewTrigger) {
      event.preventDefault();
      openSystemTemplatePreview(systemTemplatePreviewTrigger);
      return;
    }

    if (systemTemplatePreviewCloseTrigger) {
      event.preventDefault();
      closeSystemTemplatePreview();
      return;
    }

    if (memberSearchOption) {
      event.preventDefault();
      selectMemberSearchOption(memberSearchOption);
      return;
    }

    if (!memberSearchPanel && !memberSearchInput) {
      closeMemberSearchPanel();
    }

    if (dashboardEventSummary) {
      const dashboardEventCard = dashboardEventSummary.closest('[data-dashboard-event-card]');

      if (dashboardEventCard?.dataset.dashboardEventPinned === 'true' && dashboardEventCard.open) {
        event.preventDefault();
        return;
      }
    }

    if (!accessActionMenu) {
      closeAccessActionMenus();
    }

    if (!accessProfileFilter) {
      closeAccessProfileFilter();
    }

    if (accessActionMenuTrigger) {
      event.preventDefault();
      toggleAccessActionMenu(accessActionMenuTrigger);
      return;
    }

    if (accessProfileFilterTrigger) {
      event.preventDefault();
      toggleAccessProfileFilter();
      return;
    }

    if (accessProfileFilterOption) {
      event.preventDefault();
      await applyAccessProfileFilterSelection(accessProfileFilterOption);
      return;
    }

    const eventDashboardTabTrigger = closest('[data-event-dashboard-tab]');

    if (eventDashboardTabTrigger) {
      setEventDashboardTab(eventDashboardTabTrigger.dataset.eventDashboardTab || 'summary');
      return;
    }

    const passPrintTabTrigger = closest('[data-pass-print-tab]');

    if (passPrintTabTrigger) {
      setPassPrintTab(passPrintTabTrigger.dataset.passPrintTab || 'editor');
      return;
    }

    const passPrintPreviewCloseTrigger = closest('[data-pass-print-preview-close]');

    if (passPrintPreviewCloseTrigger) {
      closePassPrintPreviewModal();
      return;
    }

    const passPrintPreviewTrigger = closest('[data-pass-print-preview]');

    if (passPrintPreviewTrigger) {
      await submitPassPrintPreview(passPrintPreviewTrigger);
      return;
    }

    const passPrintPreviewRefreshTrigger = closest('[data-pass-print-preview-refresh]');

    if (passPrintPreviewRefreshTrigger) {
      await submitPassPrintPreview(passPrintPreviewRefreshTrigger);
      return;
    }

    const passPrintFullscreenTrigger = closest('[data-pass-print-fullscreen-toggle]');

    if (passPrintFullscreenTrigger) {
      setPassPrintFullscreen(!passPrintEditorState.fullscreen);
      return;
    }

    const passPrintAddTrigger = closest('[data-pass-print-add-field]');

    if (passPrintAddTrigger) {
      addPassPrintField(passPrintAddTrigger.dataset.passPrintAddField || '');
      return;
    }

    const passPrintRemoveTrigger = closest('[data-pass-print-remove-field]');

    if (passPrintRemoveTrigger) {
      removeSelectedPassPrintField();
      return;
    }

    const passPrintRotateTrigger = closest('[data-pass-print-rotate-field]');

    if (passPrintRotateTrigger) {
      const selectedField = passPrintEditorState.fields.find((field) => field.id === passPrintEditorState.selectedId);

      if (selectedField) {
        upsertSelectedPassPrintField({
          rotation: (Number(selectedField.rotation || 0) + 90) % 360,
        });
      }
      return;
    }

    const passPrintRotateBackgroundTrigger = closest('[data-pass-print-rotate-background]');

    if (passPrintRotateBackgroundTrigger) {
      passPrintEditorState.backgroundRotation = (normalizePassPrintQuarterTurn(passPrintEditorState.backgroundRotation) + 90) % 360;
      syncPassPrintBackgroundPreview();
      return;
    }

    const passPrintRemoveBackgroundTrigger = closest('[data-pass-print-remove-background-button]');

    if (passPrintRemoveBackgroundTrigger) {
      const { backgroundInput, removeBackgroundInput } = getPassPrintElements();
      const hasUploadedBackground = Boolean(passPrintEditorState.uploadedBackgroundUrl);
      const hasCurrentBackground = Boolean(passPrintEditorState.currentBackgroundUrl);

      if (hasUploadedBackground) {
        passPrintEditorState.uploadedBackgroundUrl = '';
        passPrintEditorState.backgroundRotation = hasCurrentBackground
          ? passPrintEditorState.currentBackgroundRotation
          : 0;

        if (backgroundInput) {
          backgroundInput.value = '';
        }

        if (removeBackgroundInput) {
          removeBackgroundInput.value = '0';
        }
      } else if (hasCurrentBackground && removeBackgroundInput) {
        removeBackgroundInput.value = removeBackgroundInput.value === '1' ? '0' : '1';
      }

      syncPassPrintBackgroundPreview();
      return;
    }

    const passPrintFieldTrigger = closest('[data-pass-print-field-id]');

    if (passPrintFieldTrigger) {
      if (event.metaKey || event.ctrlKey) {
        return;
      }

      selectPassPrintField(passPrintFieldTrigger.dataset.passPrintFieldId || '', { preserveGroup: true });
      return;
    }

    const sortDirectionTrigger = closest('[data-portal-sort-direction]');

    if (sortDirectionTrigger) {
      portalTableSortDirection = portalTableSortDirection === 'asc' ? 'desc' : 'asc';
      syncPortalSortControls();
      filterPortalRows();
      return;
    }

    const portalSummaryToggle = closest('[data-portal-summary-toggle]');

    if (portalSummaryToggle) {
      togglePortalSummaryCard(portalSummaryToggle.closest('[data-portal-summary-card]'));
      return;
    }

    const requestProfileQrOpenTrigger = closest('[data-request-profile-qr-open]');

    if (requestProfileQrOpenTrigger) {
      event.preventDefault();
      openRequestProfileQrModal(requestProfileQrOpenTrigger);
      return;
    }

    const requestProfileQrCloseTrigger = closest('[data-request-profile-qr-close]');

    if (requestProfileQrCloseTrigger) {
      event.preventDefault();
      closeRequestProfileQrModal();
      return;
    }

    const requestProfileStatisticsOpenTrigger = closest('[data-request-profile-statistics-open]');

    if (requestProfileStatisticsOpenTrigger) {
      event.preventDefault();
      openRequestProfileStatisticsModal();
      return;
    }

    const requestProfileStatisticsCloseTrigger = closest('[data-request-profile-statistics-close]');

    if (requestProfileStatisticsCloseTrigger) {
      event.preventDefault();
      closeRequestProfileStatisticsModal();
      return;
    }

    const copyTrigger = closest('[data-copy-text]');

    if (copyTrigger) {
      try {
        const copied = await copyTextToClipboard(copyTrigger.dataset.copyText || '');

        if (!copied) {
          return;
        }

        showLiveNotice(
          copyTrigger.dataset.copySuccessMessage || 'Copied',
          'success',
        );
      } catch (error) {
        showLiveNotice(error.message || 'Copy failed', 'error');
      }
      return;
    }

    const accessViewTrigger = closest('[data-access-view-tab]');

    if (accessViewTrigger) {
      setAccessView(accessViewTrigger.dataset.accessViewTab || 'requests');
      return;
    }

    const accessEditTypeTrigger = closest('[data-access-edit-type]');

    if (accessEditTypeTrigger) {
      populateAccessTypeForm(accessEditTypeTrigger);
      return;
    }

    const accessTypeResetTrigger = closest('[data-access-type-reset]');

    if (accessTypeResetTrigger) {
      resetAccessTypeForm();
      return;
    }

    const accessEntryWindowAddTrigger = closest('[data-access-entry-window-add]');

    if (accessEntryWindowAddTrigger) {
      addAccessEntryWindowRow({}, { focusStart: true });
      return;
    }

    const accessEntryWindowRemoveTrigger = closest('[data-access-entry-window-remove]');

    if (accessEntryWindowRemoveTrigger) {
      accessEntryWindowRemoveTrigger.closest('[data-access-entry-window-row]')?.remove();
      reindexAccessEntryWindowRows();
      return;
    }

    const accessFullscreenTrigger = closest('[data-access-fullscreen-toggle]');

    if (accessFullscreenTrigger) {
      await toggleAccessFullscreen();
      return;
    }

    const accessPrintToggleTrigger = closest('[data-access-print-toggle]');

    if (accessPrintToggleTrigger) {
      toggleAccessPrintSelection(accessPrintToggleTrigger);
      return;
    }

    const accessPrintSelectedTrigger = closest('[data-access-print-selected]');

    if (accessPrintSelectedTrigger) {
      openAccessPrintReceiveModal();
      return;
    }

    const accessWristbandToggleTrigger = closest('[data-access-wristband-toggle]');

    if (accessWristbandToggleTrigger) {
      toggleAccessWristbandSelection(accessWristbandToggleTrigger);
      return;
    }

    const accessWristbandSelectedTrigger = closest('[data-access-wristband-selected]');

    if (accessWristbandSelectedTrigger) {
      openAccessWristbandReceiveModal();
      return;
    }

    const accessEditRequestTrigger = closest('[data-access-edit-request]');

    if (accessEditRequestTrigger) {
      closeAccessActionMenus();
      openAccessRequestModal(accessEditRequestTrigger);
      return;
    }

    const accessHistoryTrigger = closest('[data-access-history-open]');

    if (accessHistoryTrigger) {
      closeAccessActionMenus();
      await openAccessHistoryModal(accessHistoryTrigger);
      return;
    }

    const accessCreateRequestTrigger = closest('[data-access-create-request]');

    if (accessCreateRequestTrigger) {
      closeAccessActionMenus();
      openAccessRequestModal();
      return;
    }

    const accessActionsSubmitTrigger = closest('[data-access-actions-panel] [type="submit"]');

    if (accessActionsSubmitTrigger) {
      closeAccessActionMenus();
      return;
    }

    const accessExportDownloadTrigger = closest('[data-access-export-download]');

    if (accessExportDownloadTrigger) {
      event.preventDefault();

      try {
        const exportUrl = buildAccessExportUrl(
          accessExportDownloadTrigger.dataset.exportBaseHref || accessExportDownloadTrigger.href,
        );
        await triggerAccessExportDownload(exportUrl);
        closeAccessExportModal();
      } catch (error) {
        showLiveNotice(error.message || 'Export failed', 'error');
      }
      return;
    }

    const accessExportTrigger = closest('[data-access-export-open]');

    if (accessExportTrigger) {
      openAccessExportModal();
      return;
    }

    const accessRequestCloseTrigger = closest('[data-access-request-close]');

    if (accessRequestCloseTrigger) {
      closeAccessRequestModal();
      return;
    }

    const accessHistoryCloseTrigger = closest('[data-access-history-close]');

    if (accessHistoryCloseTrigger) {
      closeAccessHistoryModal();
      return;
    }

    const accessExportCloseTrigger = closest('[data-access-export-close]');

    if (accessExportCloseTrigger) {
      closeAccessExportModal();
      return;
    }

    const accessWristbandReceiveCloseTrigger = closest('[data-access-wristband-receive-close]');

    if (accessWristbandReceiveCloseTrigger) {
      closeAccessWristbandReceiveModal();
      return;
    }

    const accessPrintReceiveCloseTrigger = closest('[data-access-print-receive-close]');

    if (accessPrintReceiveCloseTrigger) {
      closeAccessPrintReceiveModal();
      return;
    }

    const liveFilterResetTrigger = closest('[data-live-filter-reset]');

    if (liveFilterResetTrigger) {
      window.clearTimeout(liveFilterTimer);
      const resetUrl = liveFilterResetTrigger.dataset.filterResetUrl || window.location.pathname;
      const accessFilterForm = liveFilterResetTrigger.closest('[data-live-filter-form]');

      if (accessFilterForm && getAccessElements().workspace) {
        accessFilterForm.reset();

        if (accessFilterForm.elements.q) {
          accessFilterForm.elements.q.value = '';
        }

        if (accessFilterForm.elements.profileId) {
          accessFilterForm.elements.profileId.value = '';
        }

        if (accessFilterForm.elements.categoryId) {
          accessFilterForm.elements.categoryId.value = '';
        }

        if (accessFilterForm.elements.status) {
          accessFilterForm.elements.status.value = '';
        }

        if (accessFilterForm.elements.company) {
          accessFilterForm.elements.company.value = '';
        }

        if (accessFilterForm.elements.sort) {
          accessFilterForm.elements.sort.value = 'newest';
        }

        activeAccessView = 'requests';
        syncAccessProfileFilterSelection();
        closeAccessProfileFilter();

        if (isAccessServerPaginationEnabled()) {
          setAccessFilterPage(1);

          try {
            await submitLiveFilterForm(accessFilterForm);
          } catch (error) {
            window.location.href = resetUrl;
          }
        } else {
          window.history.replaceState({}, '', `${resetUrl}#requests`);
          applyAccessFilters();
        }
      } else {
        window.history.replaceState({}, '', `${resetUrl}#requests`);
        activeAccessView = 'requests';

        try {
          await refreshLiveSections(`${window.location.origin}${resetUrl}`, { abortPrevious: true });
        } catch (error) {
          window.location.href = resetUrl;
        }
      }

      return;
    }

    const accessPageTrigger = closest('[data-access-page-go]');

    if (accessPageTrigger) {
      const { filterForm } = getAccessElements();

      if (filterForm && !accessPageTrigger.hasAttribute('disabled')) {
        setAccessFilterPage(accessPageTrigger.dataset.accessPageGo || 1);
        await submitLiveFilterForm(filterForm);
      }

      return;
    }

    const closeTrigger = closest('[data-portal-back-to-table]');

    if (closeTrigger) {
      setPortalWorkspaceView('table');
      return;
    }

    const tabTrigger = closest('[data-portal-tab], [data-portal-set-tab]');

    if (tabTrigger) {
      const tab = tabTrigger.dataset.tab || 'all';
      setPortalTab(tab);
      setPortalWorkspaceView('table');
      return;
    }

    const createTrigger = closest('[data-portal-open-request-panel]');

    if (createTrigger) {
      openRequestPanel({
        type: createTrigger.dataset.requestType,
      });
      return;
    }

    const portalCopyTrigger = closest('[data-portal-copy-request]');

    if (portalCopyTrigger) {
      openRequestPanel({
        type: portalCopyTrigger.dataset.requestType,
        mode: 'copy',
        request: {
          categoryId: portalCopyTrigger.dataset.categoryId,
          fullName: portalCopyTrigger.dataset.fullName,
          companyName: portalCopyTrigger.dataset.companyName,
          phone: portalCopyTrigger.dataset.phone,
          email: portalCopyTrigger.dataset.email,
          vehiclePlate: '',
          notes: portalCopyTrigger.dataset.notes,
        },
      });
      return;
    }

    const editTrigger = closest('[data-portal-edit-request]');

    if (editTrigger) {
      openRequestPanel({
        type: editTrigger.dataset.requestType,
        mode: 'edit',
        request: {
          id: editTrigger.dataset.requestId,
          categoryId: editTrigger.dataset.categoryId,
          fullName: editTrigger.dataset.fullName,
          companyName: editTrigger.dataset.companyName,
          phone: editTrigger.dataset.phone,
          email: editTrigger.dataset.email,
          vehiclePlate: editTrigger.dataset.vehiclePlate,
          notes: editTrigger.dataset.notes,
        },
      });
      return;
    }

    const importTrigger = closest('[data-portal-open-import-panel]');

    if (importTrigger) {
      openImportPanel(importTrigger.dataset.requestType);
      return;
    }

    const importConfirm = closest('[data-portal-import-confirm]');

    if (importConfirm) {
      event.preventDefault();

      try {
        const csrfValue = document.querySelector('[data-portal-import-preview-form] input[name="_csrf"]')?.value || '';
        const response = await fetch('/p/import/commit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            _csrf: csrfValue,
            token: importConfirm.dataset.token,
          }),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || 'Import failed');
        }

        setPortalWorkspaceView('table');
        showLiveNotice(payload.message, 'success');
        await refreshLiveSections();
      } catch (error) {
        showLiveNotice(error.message, 'error');
      }
    }
  });

  document.addEventListener('pointerdown', (event) => {
    const passPrintResizeTrigger = event.target.closest('[data-pass-print-field-resize]');

    if (passPrintResizeTrigger) {
      const fieldId = passPrintResizeTrigger.dataset.passPrintFieldResize || '';

      selectPassPrintField(fieldId);
      startPassPrintFieldResize(event, fieldId);
      return;
    }

    const passPrintFieldTrigger = event.target.closest('[data-pass-print-field-id]');

    if (!passPrintFieldTrigger) {
      return;
    }

    const fieldId = passPrintFieldTrigger.dataset.passPrintFieldId || '';
    const isMultiSelectToggle = event.metaKey || event.ctrlKey;

    if (isMultiSelectToggle) {
      event.preventDefault();
      selectPassPrintField(fieldId, { toggle: true });
      return;
    }

    selectPassPrintField(fieldId, { preserveGroup: true });
    startPassPrintFieldDrag(event, fieldId);
  });

  document.addEventListener('contextmenu', (event) => {
    if ((event.metaKey || event.ctrlKey) && findClosestTarget(event.target, '[data-pass-print-field-id]')) {
      event.preventDefault();
    }
  });

  window.addEventListener('pointermove', (event) => {
    if (!passPrintEditorState.drag || passPrintEditorState.drag.pointerId !== event.pointerId) {
      return;
    }

    movePassPrintFieldDrag(event);
  });

  window.addEventListener('pointerup', (event) => {
    if (passPrintEditorState.drag && passPrintEditorState.drag.pointerId !== event.pointerId) {
      return;
    }

    stopPassPrintFieldDrag();
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-member-notification-toggle]')) {
      event.target.closest('form')?.requestSubmit();
      return;
    }

    if (event.target.matches('[data-pass-print-field-type]')) {
      upsertSelectedPassPrintField({
        type: event.target.value || 'vehiclePlate',
      });
      return;
    }

    if (event.target.matches('[data-pass-print-template-orientation]')) {
      passPrintEditorState.orientation = normalizePassPrintOrientation(event.target.value);
      syncPassPrintBackgroundPreview();
      return;
    }

    if (event.target.matches('[data-pass-print-field-variable-font-weight]')) {
      upsertSelectedPassPrintField({
        variableFontWeight: normalizePassPrintFontWeight(event.target.value, '700'),
      });
      return;
    }

    if (event.target.matches('[data-pass-print-field-prefix-font-weight]')) {
      upsertSelectedPassPrintField({
        prefixFontWeight: normalizePassPrintFontWeight(event.target.value, '600'),
      });
      return;
    }

    if (event.target.matches('[data-pass-print-field-text-align]')) {
      upsertSelectedPassPrintField({
        textAlign: normalizePassPrintTextAlign(event.target.value),
      });
      return;
    }

    if (event.target.matches('[data-pass-print-field-border-enabled]')) {
      upsertSelectedPassPrintField({
        borderEnabled: event.target.checked,
      });
      return;
    }

    if (event.target.matches('[data-pass-print-background-input]')) {
      handlePassPrintBackgroundChange(event.target.files?.[0] || null);
      return;
    }

    if (event.target.matches('[data-portal-table-sort]')) {
      portalTableSortField = event.target.value || 'created';
      filterPortalRows();
      return;
    }

    if (event.target.matches('[data-vehicle-gate-api-mode-input]')) {
      syncVehicleGateApiPreview();
      return;
    }

    if (event.target.matches('[data-portal-category-select], [data-portal-import-category]')) {
      rememberPortalCategorySelection(event.target);
    }

    if (event.target.matches('[data-portal-import-category]')) {
      updateImportTemplateLink();
    }

    const liveFilterForm = event.target.closest('[data-live-filter-form]');

    if (
      liveFilterForm
      && getAccessElements().workspace
      && event.target.matches('select, input')
      && !event.target.closest('[data-access-profile-filter]')
    ) {
      activeAccessView = 'requests';

      if (isAccessServerPaginationEnabled()) {
        setAccessFilterPage(1);
        submitLiveFilterForm(liveFilterForm);
      } else {
        syncAccessFilterUrl();
        applyAccessFilters();
      }
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-pass-print-template-text-color]')) {
      passPrintEditorState.textColor = normalizePassPrintColor(event.target.value);
      passPrintEditorState.fields = passPrintEditorState.fields.map((field) => ({
        ...field,
        textColor: passPrintEditorState.textColor,
      }));
      renderPassPrintFields();
      syncPassPrintFieldsInput();
      return;
    }

    if (event.target.matches('[data-pass-print-field-variable-font-size]')) {
      upsertSelectedPassPrintField({
        fontSize: normalizePassPrintFontSize(event.target.value, 18),
        variableFontSize: normalizePassPrintFontSize(event.target.value, 18),
      });
      return;
    }

    if (event.target.matches('[data-pass-print-field-prefix-font-size]')) {
      upsertSelectedPassPrintField({
        prefixFontSize: normalizePassPrintFontSize(event.target.value, 18),
      });
      return;
    }

    if (event.target.matches('[data-pass-print-field-border-color]')) {
      upsertSelectedPassPrintField({
        borderColor: normalizePassPrintColor(event.target.value),
      });
      return;
    }

    if (event.target.matches('[data-pass-print-field-text]')) {
      upsertSelectedPassPrintField({
        text: event.target.value,
      });
      return;
    }

    if (event.target.matches('[data-pass-print-field-width]')) {
      upsertSelectedPassPrintField({
        width: Math.min(Math.max(Number(event.target.value || 24) / 100, 0.08), 0.9),
      });
      return;
    }

    if (event.target.matches('[data-member-email-search]')) {
      searchMembersForInvitation(event.target.value);
      return;
    }

    if (event.target.matches('[data-request-profile-search]')) {
      filterRequestProfileRows();
    }

    if (event.target.matches('[data-request-profile-application-search]')) {
      filterRequestProfileApplications();
    }

    if (event.target.matches('[data-portal-table-search]')) {
      portalTableSearchQuery = event.target.value;
      filterPortalRows();
    }

    if (event.target.matches('[data-check-vehicle-plate], [data-check-gate-name]')) {
      setCheckFeedback('');
    }

    if (event.target.matches('[data-access-profile-filter-search]')) {
      filterAccessProfileOptions();
      return;
    }

    if (event.target.matches('[data-access-request-profile-search]')) {
      filterAccessRequestProfileOptions();
      return;
    }

    const liveFilterForm = event.target.closest('[data-live-filter-form]');

    if (
      liveFilterForm
      && getAccessElements().workspace
      && event.target.matches('input[type="search"], input[type="text"], input:not([type])')
      && !event.target.closest('[data-access-profile-filter]')
    ) {
      window.clearTimeout(liveFilterTimer);

      if (isAccessServerPaginationEnabled()) {
        if (activeRefreshController) {
          activeRefreshController.abort();
        }

        activeAccessView = 'requests';
        setAccessFilterPage(1);
        submitLiveFilterForm(liveFilterForm, { delay: 420 });
      } else {
        liveFilterTimer = window.setTimeout(() => {
          activeAccessView = 'requests';
          syncAccessFilterUrl();
          applyAccessFilters();
        }, 180);
      }
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;

    if (form.dataset.confirmMessage && !window.confirm(form.dataset.confirmMessage)) {
      event.preventDefault();
      return;
    }

    if (form.matches('[data-check-form]')) {
      event.preventDefault();
      await submitCheckForm(form, event.submitter);
      return;
    }

    if (form.matches('[data-pass-print-form]')) {
      event.preventDefault();
      await submitPassPrintForm(form);
      return;
    }

    if (form.matches('[data-pass-print-import-form]')) {
      event.preventDefault();
      await submitPassPrintImportForm(form);
      return;
    }

    if (form.matches('[data-access-print-receive-form]')) {
      event.preventDefault();
      await submitSelectedAccessPrintRequests(event.submitter);
      return;
    }

    if (form.matches('[data-access-wristband-receive-form]')) {
      event.preventDefault();
      await submitSelectedAccessWristbands(event.submitter);
      return;
    }

    if (form.matches('[data-live-filter-form]')) {
      event.preventDefault();
      if (getAccessElements().workspace) {
        activeAccessView = 'requests';

        if (isAccessServerPaginationEnabled()) {
          await submitLiveFilterForm(form);
        } else {
          syncAccessFilterUrl();
          applyAccessFilters();
        }
      }

      return;
    }

    if (form.matches('[data-portal-import-preview-form]')) {
      event.preventDefault();
      const csrfValue = form.querySelector('input[name="_csrf"]')?.value || '';
      const formData = new FormData(form);
      rememberPortalCategorySelection(form.querySelector('[data-portal-import-category]'));
      setPortalImportPreviewLoading(true);

      try {
        const response = await fetch('/p/import/preview', {
          method: 'POST',
          body: formData,
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'CSRF-Token': csrfValue,
          },
          credentials: 'same-origin',
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || payload?.errors?.[0] || 'Preview failed');
        }

        renderImportPreview(payload.preview);
      } catch (error) {
        showLiveNotice(error.message, 'error');
      } finally {
        setPortalImportPreviewLoading(false);
      }

      return;
    }

    if (form.matches('[data-live-form]')) {
      event.preventDefault();

      try {
        if (form.matches('[data-portal-request-form]')) {
          rememberPortalCategorySelection(form.querySelector('[data-portal-category-select]'));
        }

        await submitLiveForm(form, event.submitter);
        if (form.matches('[data-access-request-form]')) {
          closeAccessRequestModal();
        }
        if (form.matches('[data-portal-request-form]')) {
          setPortalWorkspaceView('table');
        }
        resetAccessTypeForm();
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        showLiveNotice(error.message, 'error');
      }
    }
  });

  if (window.io && eventRoom) {
    const socket = window.io();

    socket.emit('event:join', eventRoom);

    socket.on('access:request-upsert', async (payload) => {
      const handled = applyAccessRequestUpsert(payload);
      const isPortalPage = Boolean(getPortalElements().app);
      const isAccessAdminPage = Boolean(getAccessElements().workspace);

      if (handled) {
        suppressSocketRefreshUntil = Date.now() + 1800;
        return;
      }

      if (isPortalPage || isAccessAdminPage) {
        await triggerSocketLiveRefresh();
      }
    });

    socket.on('access:request-delete', async (payload) => {
      const handled = applyAccessRequestDelete(payload);
      const isPortalPage = Boolean(getPortalElements().app);
      const isAccessAdminPage = Boolean(getAccessElements().workspace);

      if (handled) {
        suppressSocketRefreshUntil = Date.now() + 1800;
        return;
      }

      if (isPortalPage || isAccessAdminPage) {
        await triggerSocketLiveRefresh();
      }
    });

    socket.on('dashboard:refresh', async () => {
      if (Date.now() < suppressSocketRefreshUntil) {
        return;
      }

      await triggerSocketLiveRefresh();
    });

    window.addEventListener('beforeunload', () => {
      socket.emit('event:leave', eventRoom);
    });
  }

  window.addEventListener('codex:live-sections-refreshed', () => {
    closeAccessHistoryModal();
    closeAccessRequestModal();
    closeAccessPrintReceiveModal();
    closeAccessWristbandReceiveModal();
    closeAccessExportModal();
    closeRequestProfileStatisticsModal();
    initializeEventDashboardTabs();
    initializeAccessUI();
    initializeCheckUI();
    initializePassPrintUI();
    initializePortalUI();
    initializeRequestProfileUI();
    initializeSystemEmailSettings();
    initializeSystemTemplateTabs();
    initializePlateScannerSettings();
  });

  initializeEventDashboardTabs();
  initializeAccessUI();
  initializeCheckUI();
  initializePassPrintUI();
  initializePortalUI();
  initializeRequestProfileUI();
  initializeSystemEmailSettings();
  initializeSystemTemplateTabs();
  initializePlateScannerSettings();
});
