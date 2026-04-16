document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('[data-mobile-sidebar]');
  const sidebarToggles = document.querySelectorAll('[data-mobile-sidebar-toggle]');
  const sidebarClosers = document.querySelectorAll('[data-mobile-sidebar-close], [data-mobile-sidebar-overlay]');
  const menuButton = document.querySelector('[data-mobile-menu-toggle]');
  const menuPanel = document.querySelector('[data-mobile-menu]');
  const eventRoom = document.body.dataset.eventRoom;
  let activePortalTab = 'all';
  let activePortalWorkspaceView = 'table';
  let activePortalRequestType = 'pass';
  let activePortalRequestMode = 'create';
  let activePortalImportType = 'pass';
  let activeAccessView = window.location.hash === '#types' ? 'types' : 'requests';
  let accessFullscreen = false;
  let refreshInProgress = false;
  let liveFilterTimer = null;
  let activeRefreshController = null;
  let suppressSocketRefreshUntil = 0;
  let portalTableSearchQuery = '';
  let portalTableSortField = 'updated';
  let portalTableSortDirection = 'desc';
  const escapeSelector = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
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
        credentials: 'same-origin',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Live refresh failed with status ${response.status}`);
      }

      const html = await response.text();
      const nextDocument = new DOMParser().parseFromString(html, 'text/html');
      let replacedSections = 0;

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

      if (focusedState) {
        const replacementInput = document.querySelector(`[name="${escapeSelector(focusedState.name)}"]`);

        if (replacementInput && typeof replacementInput.focus === 'function') {
          replacementInput.focus();

          if (
            typeof replacementInput.setSelectionRange === 'function'
            && focusedState.selectionStart !== null
            && focusedState.selectionEnd !== null
          ) {
            replacementInput.setSelectionRange(focusedState.selectionStart, focusedState.selectionEnd);
          } else if ('value' in replacementInput) {
            replacementInput.value = focusedState.value;
          }
        }
      }

      window.dispatchEvent(new CustomEvent('codex:live-sections-refreshed'));
    } finally {
      if (activeRefreshController === controller) {
        activeRefreshController = null;
      }
    }
  };

  const submitLiveForm = async (form) => {
    const formData = new FormData(form);
    const body = new URLSearchParams();

    formData.forEach((value, key) => {
      body.append(key, value);
    });

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
      && form.matches('[data-request-status-form], [data-access-request-form]')
    ) {
      const handled = applyAccessRequestUpsert(payload.liveRequestUpsert);
      suppressSocketRefreshUntil = Date.now() + 1800;

      if (handled) {
        return;
      }
    }

    await refreshLiveSections();
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

  const getRequestProfileElements = () => ({
    searchInput: document.querySelector('[data-request-profile-search]'),
    rows: [...document.querySelectorAll('[data-request-profile-row]')],
    emptyRows: [...document.querySelectorAll('[data-request-profile-empty-row]')],
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

  const initializeRequestProfileUI = () => {
    const {
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

    filterRequestProfileRows();
  };

  const initializeSystemEmailSettings = () => {
    const providerSelect = document.querySelector('[data-system-email-provider-select]');
    const panels = [...document.querySelectorAll('[data-system-email-provider-panel]')];

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
        if (portalTableSortField === 'updated') {
          const leftValue = Number(left.dataset.sortUpdated || 0);
          const rightValue = Number(right.dataset.sortUpdated || 0);

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

  const getAccessElements = () => ({
    workspace: document.querySelector('[data-access-workspace]'),
    viewTabs: [...document.querySelectorAll('[data-access-view-tab]')],
    viewPanels: [...document.querySelectorAll('[data-access-view-panel]')],
    fullscreenToggles: [...document.querySelectorAll('[data-access-fullscreen-toggle]')],
    fullscreenLabels: [...document.querySelectorAll('[data-access-fullscreen-label]')],
    filterForm: document.querySelector('[data-live-filter-form]'),
    exportModal: document.querySelector('[data-access-export-modal]'),
    table: document.querySelector('[data-access-requests-table]'),
    tableBody: document.querySelector('[data-access-requests-body]'),
    tableScroll: document.querySelector('[data-access-table-scroll]'),
    emptyState: document.querySelector('[data-access-empty-state]'),
    filteredCountNodes: [...document.querySelectorAll('[data-access-filtered-count-label]')],
    typeForm: document.querySelector('[data-access-type-form]'),
    typeFormTitle: document.querySelector('[data-access-type-form-title]'),
    typeFormMethodHolder: document.querySelector('[data-access-type-method-holder]'),
    typeSubmitLabel: document.querySelector('[data-access-type-submit-label]'),
    requestModal: document.querySelector('[data-access-request-modal]'),
    requestForm: document.querySelector('[data-access-request-form]'),
    requestTitle: document.querySelector('[data-access-request-modal-title]'),
    requestEyebrow: document.querySelector('[data-access-request-modal-eyebrow]'),
    requestMethodHolder: document.querySelector('[data-access-request-method-holder]'),
    requestSubmitLabel: document.querySelector('[data-access-request-submit-label]'),
    requestProfile: document.querySelector('[data-access-request-profile]'),
    requestCategory: document.querySelector('[data-access-request-category]'),
    typeTotalNodes: [...document.querySelectorAll('[data-access-type-total]')],
    typeHandedNodes: [...document.querySelectorAll('[data-access-type-handed]')],
  });

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
      requestCreateAction: workspace.dataset.accessRequestCreateAction,
      requestCreateTitle: workspace.dataset.accessRequestCreateTitle,
      requestEditTitle: workspace.dataset.accessRequestEditTitle,
      requestCreateSubmit: workspace.dataset.accessRequestCreateSubmit,
      requestSaveSubmit: workspace.dataset.accessRequestSaveSubmit,
      eventId: workspace.dataset.accessEventId,
      pageType: workspace.dataset.accessPageType,
      singularLabel: workspace.dataset.accessSingularLabel,
      editLabel: workspace.dataset.accessEditLabel,
      notSet: workspace.dataset.accessNotSet,
      statusPendingLabel: workspace.dataset.accessStatusPendingLabel,
      statusHandedOutLabel: workspace.dataset.accessStatusHandedOutLabel,
      filteredCountTemplate: workspace.dataset.accessFilteredCountTemplate,
    };
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

  const setAccessFullscreen = (enabled) => {
    const elements = getAccessElements();
    const ui = getAccessUi();

    if (!elements.workspace) {
      return;
    }

    accessFullscreen = enabled;
    elements.workspace.classList.toggle('access-admin-shell-fullscreen', enabled);
    document.body.classList.toggle('is-access-fullscreen', enabled);

    elements.fullscreenLabels.forEach((label) => {
      label.textContent = enabled
        ? (ui.fullscreenExit || 'Exit fullscreen')
        : (ui.fullscreenEnter || 'Fullscreen');
    });
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

    const methodInput = document.createElement('input');
    methodInput.type = 'hidden';
    methodInput.name = '_method';
    methodInput.value = 'PUT';
    elements.typeFormMethodHolder.appendChild(methodInput);

    elements.typeForm.elements.name.value = trigger.dataset.typeName || '';
    elements.typeForm.elements.description.value = trigger.dataset.typeDescription || '';
    elements.typeForm.elements.quota.value = trigger.dataset.typeQuota || '';
    elements.typeForm.elements.sortOrder.value = trigger.dataset.typeSortOrder || '0';

    if (elements.typeForm.elements.isActive) {
      elements.typeForm.elements.isActive.checked = trigger.dataset.typeIsActive === '1';
    }

    setAccessView('types');
    elements.typeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const initializeAccessUI = () => {
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
    updateAccessFilteredCount();
    updateAccessTypeUsageMetrics();
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

  const updateAccessFilteredCount = () => {
    const { tableBody, filteredCountNodes } = getAccessElements();

    if (!filteredCountNodes.length) {
      return;
    }

    const visibleCount = tableBody
      ? [...tableBody.querySelectorAll('[data-request-row-id]')].filter((row) => row.style.display !== 'none').length
      : 0;

    filteredCountNodes.forEach((node) => {
      node.textContent = formatAccessFilteredCount(visibleCount);
    });
  };

  const updateAccessTypeUsageMetrics = () => {
    const { tableBody, typeTotalNodes, typeHandedNodes } = getAccessElements();

    if (!tableBody || (!typeTotalNodes.length && !typeHandedNodes.length)) {
      return;
    }

    const counts = {};

    [...tableBody.querySelectorAll('[data-request-row-id]')].forEach((row) => {
      const categoryId = String(row.dataset.requestCategoryId || '');

      if (!categoryId) {
        return;
      }

      if (!counts[categoryId]) {
        counts[categoryId] = { total: 0, handed: 0 };
      }

      counts[categoryId].total += 1;

      if (row.dataset.requestStatus === 'handed_out') {
        counts[categoryId].handed += 1;
      }
    });

    typeTotalNodes.forEach((node) => {
      const categoryId = String(node.dataset.accessTypeTotal || '');
      node.textContent = String(counts[categoryId]?.total || 0);
    });

    typeHandedNodes.forEach((node) => {
      const categoryId = String(node.dataset.accessTypeHanded || '');
      node.textContent = String(counts[categoryId]?.handed || 0);
    });
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
      };
    }

    return {
      query: String(filterForm.elements.q?.value || '').trim().toLowerCase(),
      profileId: String(filterForm.elements.profileId?.value || ''),
      categoryId: String(filterForm.elements.categoryId?.value || ''),
      status: String(filterForm.elements.status?.value || ''),
      company: String(filterForm.elements.company?.value || '').trim().toLowerCase(),
      sort: String(filterForm.elements.sort?.value || 'newest'),
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
      const haystack = [
        request.fullName,
        request.companyName,
        request.phone,
        request.email,
        request.notes,
        request.profileName,
        request.categoryName,
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(filters.query)) {
        return false;
      }
    }

    return true;
  };

  const buildAccessRequestRow = (request = {}) => {
    const ui = getAccessUi();
    const row = document.createElement('tr');
    const notSet = ui.notSet || '-';
    const buttonToneClass = request.nextStatusTone === 'primary'
      ? 'access-mini-button--primary'
      : 'access-mini-button--secondary';
    const statusToneClass = request.statusTone === 'active' ? 'status-active' : 'status-pending';

    row.dataset.requestRowId = request.id;
    row.dataset.requestStatus = request.status || '';
    row.dataset.requestCreatedTs = request.createdAtTs || 0;
    row.dataset.requestCategoryId = request.categoryId || '';

    row.innerHTML = `
      <td>
        <div class="access-person-cell">
          <div class="access-person-cell__title">
            <img src="/public/design-assets/icons/feather/users.svg" alt="" />
            <span>${escapeHtml(request.fullName || '')}</span>
          </div>
          <p class="access-person-cell__meta">${escapeHtml(request.notes || request.email || '')}</p>
        </div>
      </td>
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
        </div>
      </td>
      <td>
        <div class="access-data-stack">
          <strong data-request-updated-primary>${escapeHtml(request.createdAtLabel || '')}</strong>
          <span data-request-updated-by>&nbsp;</span>
        </div>
      </td>
      <td>
        <div class="access-row-actions">
          <button
            type="button"
            class="access-mini-button access-mini-button--secondary"
            data-access-edit-request
            data-request-id="${escapeHtml(request.id)}"
            data-request-profile-id="${escapeHtml(request.requestProfileId || '')}"
            data-request-category-id="${escapeHtml(request.categoryId || '')}"
            data-request-full-name="${escapeHtml(request.fullName || '')}"
            data-request-company-name="${escapeHtml(request.companyName || '')}"
            data-request-phone="${escapeHtml(request.phone || '')}"
            data-request-email="${escapeHtml(request.email || '')}"
            data-request-notes="${escapeHtml(request.notes || '')}"
          >${escapeHtml(ui.editLabel || 'Edit')}</button>

          <form action="/events/${escapeHtml(ui.eventId || '')}/${escapeHtml(ui.pageType || '')}/requests/${escapeHtml(request.id)}/status?_method=PUT" method="POST" class="access-status-form" data-live-form data-request-status-form>
            <input type="hidden" name="_csrf" value="${escapeHtml(document.querySelector('[data-access-request-form] input[name=\"_csrf\"]')?.value || '')}" />
            <input type="hidden" name="status" value="${escapeHtml(request.nextStatus || 'pending')}" data-request-status-input />
            <button type="submit" class="access-mini-button ${buttonToneClass}" data-request-status-button>${escapeHtml(request.nextStatusLabel || '')}</button>
          </form>
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

    const normalizedRequest = {
      ...request,
      type: requestType,
    };
    const existingRow = document.querySelector(`[data-request-row-id="${escapeSelector(request.id)}"]`);
    const matchesFilters = matchesAccessRequestFilters(normalizedRequest);

    if (!elements.tableBody) {
      return false;
    }

    if (!matchesFilters) {
      if (existingRow) {
        existingRow.remove();
        if (!elements.tableBody.querySelector('[data-request-row-id]')) {
          return false;
        }
        updateAccessFilteredCount();
        updateAccessTypeUsageMetrics();
        return true;
      }

      updateAccessFilteredCount();
      updateAccessTypeUsageMetrics();
      return true;
    }

    const nextRow = buildAccessRequestRow(normalizedRequest);

    if (existingRow) {
      existingRow.replaceWith(nextRow);
      updateAccessFilteredCount();
      updateAccessTypeUsageMetrics();
      return true;
    }

    if (!elements.table) {
      return false;
    }

    insertAccessRowSorted(nextRow);
    updateAccessFilteredCount();
    updateAccessTypeUsageMetrics();
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

    const row = document.querySelector(`[data-request-row-id="${escapeSelector(requestId)}"]`);

    if (!row) {
      return false;
    }

    row.remove();

    if (!elements.tableBody?.querySelector('[data-request-row-id]')) {
      return false;
    }

    updateAccessFilteredCount();
    updateAccessTypeUsageMetrics();
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

    closeAccessExportModal();

    const eventId = document.body.dataset.eventRoom;
    const accessType = window.location.pathname.includes('/wristbands') ? 'wristband' : 'pass';
    const isEdit = Boolean(trigger?.dataset.requestId);

    requestForm.reset();
    requestForm.action = isEdit
      ? `/events/${eventId}/${accessType}/requests/${trigger.dataset.requestId}`
      : (ui.requestCreateAction || `/events/${eventId}/${accessType}/requests`);

    if (requestMethodHolder) {
      requestMethodHolder.innerHTML = '';
    }

    if (isEdit && requestMethodHolder) {
      const methodInput = document.createElement('input');
      methodInput.type = 'hidden';
      methodInput.name = '_method';
      methodInput.value = 'PUT';
      requestMethodHolder.appendChild(methodInput);
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

    requestForm.elements.fullName.value = trigger?.dataset.requestFullName || '';
    requestForm.elements.companyName.value = trigger?.dataset.requestCompanyName || '';
    requestForm.elements.phone.value = trigger?.dataset.requestPhone || '';
    requestForm.elements.email.value = trigger?.dataset.requestEmail || '';
    requestForm.elements.notes.value = trigger?.dataset.requestNotes || '';

    if (requestCategory) {
      requestCategory.value = trigger?.dataset.requestCategoryId || '';
    }

    if (requestProfile) {
      requestProfile.value = trigger?.dataset.requestProfileId || '';
    }

    requestModal.classList.add('is-open');
    document.body.classList.add('portal-modal-open');
  };

  const openAccessExportModal = () => {
    const { exportModal } = getAccessElements();

    if (!exportModal) {
      return;
    }

    closeAccessRequestModal();
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
    importPreviewForm: document.querySelector('[data-portal-import-preview-form]'),
    importTypeInput: document.querySelector('[data-portal-import-type]'),
    importCategory: document.querySelector('[data-portal-import-category]'),
    importFileInput: document.querySelector('[data-portal-import-file]'),
    importTemplateLink: document.querySelector('[data-portal-template-link]'),
    importPreview: document.querySelector('[data-portal-import-preview]'),
    importConfirmButton: document.querySelector('[data-portal-import-confirm]'),
    tableRows: [...document.querySelectorAll('[data-request-row]')],
    tabButtons: [...document.querySelectorAll('[data-portal-tab]')],
    sortSelect: document.querySelector('[data-portal-table-sort]'),
    sortDirectionLabel: document.querySelector('[data-portal-sort-direction-label]'),
  });

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

  const setPortalTab = (tab) => {
    activePortalTab = tab;
    const { tabButtons } = getPortalElements();

    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === tab;
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

  const fillCategoryOptions = (select, type, currentCategoryId = null) => {
    if (!select) {
      return;
    }

    const state = getPortalState();

    if (!state) {
      return;
    }

    const source = type === 'pass' ? state.passQuotaUsage || [] : state.wristbandQuotaUsage || [];
    const eligible = source.filter(
      (entry) => entry.is_unlimited
        || Number(entry.remaining_count) > 0
        || Number(entry.category_id) === Number(currentCategoryId),
    );

    select.innerHTML = '';

    eligible.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.category_id;
      option.textContent = entry.is_unlimited
        ? `${entry.category_name} (${entry.used_count}/∞)`
        : `${entry.category_name} (${entry.used_count}/${entry.quota})`;
      option.selected = Number(entry.category_id) === Number(currentCategoryId);
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
    elements.requestForm.action = `/p/${type}`;
    elements.requestSubmitLabel.textContent = mode === 'edit'
      ? (ui.saveRequest || 'Save request')
      : (ui.addRequest || 'Add request');
    elements.requestMethodHolder.innerHTML = '';

    if (mode === 'edit' && request) {
      elements.requestForm.action = `/p/${type}/${request.id}?_method=PUT`;
      const methodInput = document.createElement('input');
      methodInput.type = 'hidden';
      methodInput.name = '_method';
      methodInput.value = 'PUT';
      elements.requestMethodHolder.appendChild(methodInput);
      elements.requestForm.fullName.value = request.fullName;
      elements.requestForm.companyName.value = request.companyName;
      elements.requestForm.phone.value = request.phone;
      elements.requestForm.email.value = request.email;
      elements.requestForm.notes.value = request.notes;
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
    elements.importPreview.classList.add('hidden');
    elements.importPreview.innerHTML = '';
    elements.importConfirmButton.classList.add('hidden');
    elements.importConfirmButton.dataset.token = '';
    fillCategoryOptions(elements.importCategory, type);
    updateImportTemplateLink();
    setPortalWorkspaceView('import');
  };

  const renderImportPreview = (preview) => {
    const elements = getPortalElements();

    if (!elements.importPreview) {
      return;
    }

    const ui = getPortalUi();
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

    const searchInput = document.querySelector('[data-portal-table-search]');

    if (searchInput) {
      searchInput.value = portalTableSearchQuery;
    }

    syncPortalSortControls();
    setPortalTab(activePortalTab);
    setPortalWorkspaceView(activePortalWorkspaceView);
    updateImportTemplateLink();
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
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSidebar();
      setAccessFullscreen(false);
      setPortalWorkspaceView('table');
      closeAccessRequestModal();
      closeAccessExportModal();
    }
  });

  if (menuButton && menuPanel) {
    menuButton.addEventListener('click', () => {
      menuPanel.classList.toggle('hidden');
    });
  }

  document.addEventListener('click', async (event) => {
    const sortDirectionTrigger = event.target.closest('[data-portal-sort-direction]');

    if (sortDirectionTrigger) {
      portalTableSortDirection = portalTableSortDirection === 'asc' ? 'desc' : 'asc';
      syncPortalSortControls();
      filterPortalRows();
      return;
    }

    const copyTrigger = event.target.closest('[data-copy-text]');

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

    const accessViewTrigger = event.target.closest('[data-access-view-tab]');

    if (accessViewTrigger) {
      setAccessView(accessViewTrigger.dataset.accessViewTab || 'requests');
      return;
    }

    const accessEditTypeTrigger = event.target.closest('[data-access-edit-type]');

    if (accessEditTypeTrigger) {
      populateAccessTypeForm(accessEditTypeTrigger);
      return;
    }

    const accessTypeResetTrigger = event.target.closest('[data-access-type-reset]');

    if (accessTypeResetTrigger) {
      resetAccessTypeForm();
      return;
    }

    const accessFullscreenTrigger = event.target.closest('[data-access-fullscreen-toggle]');

    if (accessFullscreenTrigger) {
      setAccessFullscreen(!accessFullscreen);
      return;
    }

    const accessEditRequestTrigger = event.target.closest('[data-access-edit-request]');

    if (accessEditRequestTrigger) {
      openAccessRequestModal(accessEditRequestTrigger);
      return;
    }

    const accessCreateRequestTrigger = event.target.closest('[data-access-create-request]');

    if (accessCreateRequestTrigger) {
      openAccessRequestModal();
      return;
    }

    const accessExportTrigger = event.target.closest('[data-access-export-open]');

    if (accessExportTrigger) {
      openAccessExportModal();
      return;
    }

    const accessRequestCloseTrigger = event.target.closest('[data-access-request-close]');

    if (accessRequestCloseTrigger) {
      closeAccessRequestModal();
      return;
    }

    const accessExportCloseTrigger = event.target.closest('[data-access-export-close]');

    if (accessExportCloseTrigger) {
      closeAccessExportModal();
      return;
    }

    const liveFilterResetTrigger = event.target.closest('[data-live-filter-reset]');

    if (liveFilterResetTrigger) {
      window.clearTimeout(liveFilterTimer);
      const resetUrl = liveFilterResetTrigger.dataset.filterResetUrl || window.location.pathname;
      window.history.replaceState({}, '', `${resetUrl}#requests`);
      activeAccessView = 'requests';

      try {
        await refreshLiveSections(`${window.location.origin}${resetUrl}`, { abortPrevious: true });
      } catch (error) {
        window.location.href = resetUrl;
      }

      return;
    }

    const closeTrigger = event.target.closest('[data-portal-back-to-table]');

    if (closeTrigger) {
      setPortalWorkspaceView('table');
      return;
    }

    const tabTrigger = event.target.closest('[data-portal-tab], [data-portal-set-tab]');

    if (tabTrigger) {
      const tab = tabTrigger.dataset.tab || 'all';
      setPortalTab(tab);
      setPortalWorkspaceView('table');
      return;
    }

    const createTrigger = event.target.closest('[data-portal-open-request-panel]');

    if (createTrigger) {
      openRequestPanel({
        type: createTrigger.dataset.requestType,
      });
      return;
    }

    const editTrigger = event.target.closest('[data-portal-edit-request]');

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
          notes: editTrigger.dataset.notes,
        },
      });
      return;
    }

    const importTrigger = event.target.closest('[data-portal-open-import-panel]');

    if (importTrigger) {
      openImportPanel(importTrigger.dataset.requestType);
      return;
    }

    const importConfirm = event.target.closest('[data-portal-import-confirm]');

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

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-portal-table-sort]')) {
      portalTableSortField = event.target.value || 'updated';
      filterPortalRows();
      return;
    }

    if (event.target.matches('[data-portal-import-category]')) {
      updateImportTemplateLink();
    }

    const liveFilterForm = event.target.closest('[data-live-filter-form]');

    if (liveFilterForm && event.target.matches('select, input')) {
      submitLiveFilterForm(liveFilterForm);
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-request-profile-search]')) {
      filterRequestProfileRows();
    }

    if (event.target.matches('[data-portal-table-search]')) {
      portalTableSearchQuery = event.target.value;
      filterPortalRows();
    }

    const liveFilterForm = event.target.closest('[data-live-filter-form]');

    if (liveFilterForm && event.target.matches('input[type="search"], input[type="text"], input:not([type])')) {
      submitLiveFilterForm(liveFilterForm, { delay: 260 });
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;

    if (form.dataset.confirmMessage && !window.confirm(form.dataset.confirmMessage)) {
      event.preventDefault();
      return;
    }

    if (form.matches('[data-live-filter-form]')) {
      event.preventDefault();
      await submitLiveFilterForm(form);

      return;
    }

    if (form.matches('[data-portal-import-preview-form]')) {
      event.preventDefault();

      try {
        const csrfValue = form.querySelector('input[name="_csrf"]')?.value || '';
        const response = await fetch('/p/import/preview', {
          method: 'POST',
          body: new FormData(form),
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
      }

      return;
    }

    if (form.matches('[data-live-form]')) {
      event.preventDefault();

      try {
        await submitLiveForm(form);
        if (form.matches('[data-access-request-form]')) {
          closeAccessRequestModal();
        }
        if (form.matches('[data-portal-request-form]')) {
          setPortalWorkspaceView('table');
        }
        resetAccessTypeForm();
      } catch (error) {
        showLiveNotice(error.message, 'error');
      }
    }
  });

  if (window.io && eventRoom) {
    const socket = window.io();

    socket.emit('event:join', eventRoom);

    socket.on('access:request-upsert', (payload) => {
      const handled = applyAccessRequestUpsert(payload);

      if (handled) {
        suppressSocketRefreshUntil = Date.now() + 1800;
      }
    });

    socket.on('access:request-delete', (payload) => {
      const handled = applyAccessRequestDelete(payload);

      if (handled) {
        suppressSocketRefreshUntil = Date.now() + 1800;
      }
    });

    socket.on('dashboard:refresh', async () => {
      if (Date.now() < suppressSocketRefreshUntil) {
        return;
      }

      if (refreshInProgress) {
        return;
      }

      refreshInProgress = true;

      try {
        await refreshLiveSections();
      } catch (error) {
        window.location.reload();
      } finally {
        refreshInProgress = false;
      }
    });

    window.addEventListener('beforeunload', () => {
      socket.emit('event:leave', eventRoom);
    });
  }

  window.addEventListener('codex:live-sections-refreshed', () => {
    closeAccessRequestModal();
    closeAccessExportModal();
    initializeAccessUI();
    initializePortalUI();
    initializeRequestProfileUI();
    initializeSystemEmailSettings();
  });

  initializeAccessUI();
  initializePortalUI();
  initializeRequestProfileUI();
  initializeSystemEmailSettings();
});
