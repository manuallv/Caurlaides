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

  const refreshLiveSections = async (targetUrl = window.location.href) => {
    const currentSections = [...document.querySelectorAll('[data-live-section]')];

    if (!currentSections.length) {
      window.location.href = targetUrl;
      return;
    }

    const response = await fetch(targetUrl, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'same-origin',
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

    window.dispatchEvent(new CustomEvent('codex:live-sections-refreshed'));
  };

  const submitLiveForm = async (form) => {
    const response = await fetch(form.action, {
      method: (form.method || 'POST').toUpperCase(),
      body: new FormData(form),
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

  const getRequestProfileState = () => {
    const stateNode = document.getElementById('request-profile-state');

    if (!stateNode) {
      return null;
    }

    try {
      return JSON.parse(stateNode.textContent);
    } catch (error) {
      return null;
    }
  };

  const getRequestProfileElements = () => ({
    app: document.querySelector('[data-request-profile-app]'),
    form: document.getElementById('request-profile-form'),
    methodHolder: document.querySelector('[data-request-profile-method-holder]'),
    title: document.querySelector('[data-request-profile-title]'),
    description: document.querySelector('[data-request-profile-description]'),
    submitLabel: document.querySelector('[data-request-profile-submit-label]'),
    resetButton: document.querySelector('[data-request-profile-reset]'),
    activeInput: document.querySelector('[data-request-profile-active]'),
    statusChip: document.querySelector('[data-request-profile-status]'),
    meta: document.querySelector('[data-request-profile-meta]'),
    codeInput: document.querySelector('[data-request-profile-code]'),
    inviteInput: document.querySelector('[data-request-profile-invite-link]'),
    copyCurrentButton: document.querySelector('[data-request-profile-copy-current]'),
    regenerateForm: document.querySelector('[data-request-profile-regenerate-form]'),
    deleteForm: document.querySelector('[data-request-profile-delete-form]'),
    searchInput: document.querySelector('[data-request-profile-search]'),
    rows: [...document.querySelectorAll('[data-request-profile-row]')],
    emptyRows: [...document.querySelectorAll('[data-request-profile-empty-row]')],
  });

  const getRequestProfileUi = () => getRequestProfileState()?.ui || {};

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

  const fillRequestProfileQuotaInputs = (prefix, quotaMap = {}) => {
    const { form } = getRequestProfileElements();

    if (!form) {
      return;
    }

    form.querySelectorAll(`input[name^="${prefix}Quota["]`).forEach((input) => {
      const match = input.name.match(/\[(\d+)\]/);
      const categoryId = match ? match[1] : null;
      input.value = categoryId ? Number(quotaMap[categoryId] || 0) : 0;
    });
  };

  const resetRequestProfileForm = () => {
    const state = getRequestProfileState();
    const elements = getRequestProfileElements();
    const ui = getRequestProfileUi();

    if (!elements.form || !state) {
      return;
    }

    elements.form.reset();
    elements.form.action = state.createAction;
    elements.methodHolder.innerHTML = '';
    elements.title.textContent = ui.createTitle || 'Add new profile';
    elements.description.textContent = ui.createDescription || '';
    elements.submitLabel.textContent = ui.createButton || 'Create profile';
    elements.statusChip.textContent = ui.activeStatus || 'Active';
    elements.statusChip.className = 'status-active request-profile-editor__status';
    elements.activeInput.checked = true;
    elements.meta.classList.add('hidden');
    elements.codeInput.value = '';
    elements.inviteInput.value = '';
    elements.copyCurrentButton.dataset.copyText = '';
    elements.resetButton.classList.add('hidden');
    elements.regenerateForm.classList.add('hidden');
    elements.deleteForm.classList.add('hidden');
    fillRequestProfileQuotaInputs('pass');
    fillRequestProfileQuotaInputs('wristband');
  };

  const populateRequestProfileForm = (profileId) => {
    const state = getRequestProfileState();
    const elements = getRequestProfileElements();
    const ui = getRequestProfileUi();

    if (!state || !elements.form) {
      return;
    }

    const profile = (state.profiles || []).find((entry) => Number(entry.id) === Number(profileId));

    if (!profile) {
      return;
    }

    resetRequestProfileForm();
    elements.form.action = `${state.createAction}/${profile.id}`;
    elements.title.textContent = ui.editTitle || 'Edit profile';
    elements.description.textContent = ui.editDescription || '';
    elements.submitLabel.textContent = ui.saveButton || 'Save profile';
    elements.form.elements.name.value = profile.name || '';
    elements.form.elements.notes.value = profile.notes || '';
    elements.activeInput.checked = Boolean(profile.isActive);
    elements.statusChip.textContent = profile.isActive
      ? (ui.activeStatus || 'Active')
      : (ui.inactiveStatus || 'Inactive');
    elements.statusChip.className = `request-profile-editor__status ${profile.isActive ? 'status-active' : 'status-archived'}`;
    elements.meta.classList.remove('hidden');
    elements.codeInput.value = profile.accessCode || '';
    elements.inviteInput.value = profile.inviteUrl || '';
    elements.copyCurrentButton.dataset.copyText = profile.inviteUrl || '';
    elements.resetButton.classList.remove('hidden');
    elements.regenerateForm.classList.remove('hidden');
    elements.regenerateForm.action = `${state.createAction}/${profile.id}/regenerate-code`;
    elements.deleteForm.classList.remove('hidden');
    elements.deleteForm.action = `${state.createAction}/${profile.id}`;
    fillRequestProfileQuotaInputs('pass', profile.passQuotaMap);
    fillRequestProfileQuotaInputs('wristband', profile.wristbandQuotaMap);

    const methodInput = document.createElement('input');
    methodInput.type = 'hidden';
    methodInput.name = '_method';
    methodInput.value = 'PUT';
    elements.methodHolder.innerHTML = '';
    elements.methodHolder.appendChild(methodInput);
    elements.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const elements = getRequestProfileElements();

    if (!elements.app) {
      return;
    }

    resetRequestProfileForm();
    filterRequestProfileRows();
  };

  const getAccessElements = () => ({
    workspace: document.querySelector('[data-access-workspace]'),
    viewTabs: [...document.querySelectorAll('[data-access-view-tab]')],
    viewPanels: [...document.querySelectorAll('[data-access-view-panel]')],
    fullscreenToggles: [...document.querySelectorAll('[data-access-fullscreen-toggle]')],
    fullscreenLabels: [...document.querySelectorAll('[data-access-fullscreen-label]')],
    typeForm: document.querySelector('[data-access-type-form]'),
    typeFormTitle: document.querySelector('[data-access-type-form-title]'),
    typeFormMethodHolder: document.querySelector('[data-access-type-method-holder]'),
    typeSubmitLabel: document.querySelector('[data-access-type-submit-label]'),
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
  });

  const setPortalTab = (tab) => {
    activePortalTab = tab;
    const { tableRows, tabButtons } = getPortalElements();

    tableRows.forEach((row) => {
      const rowType = row.dataset.requestType;
      row.style.display = tab === 'all' || rowType === tab ? '' : 'none';
    });

    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === tab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
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
      (entry) => Number(entry.remaining_count) > 0 || Number(entry.category_id) === Number(currentCategoryId),
    );

    select.innerHTML = '';

    eligible.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.category_id;
      option.textContent = `${entry.category_name} (${entry.used_count}/${entry.quota})`;
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
    }
  });

  if (menuButton && menuPanel) {
    menuButton.addEventListener('click', () => {
      menuPanel.classList.toggle('hidden');
    });
  }

  document.addEventListener('click', async (event) => {
    const copyTrigger = event.target.closest('[data-copy-text]');

    if (copyTrigger) {
      try {
        const copied = await copyTextToClipboard(copyTrigger.dataset.copyText || '');

        if (!copied) {
          return;
        }

        showLiveNotice(
          copyTrigger.dataset.copySuccessMessage || getRequestProfileUi().copySuccess || 'Copied',
          'success',
        );
      } catch (error) {
        showLiveNotice(error.message || 'Copy failed', 'error');
      }
      return;
    }

    const requestProfileEditTrigger = event.target.closest('[data-request-profile-edit]');

    if (requestProfileEditTrigger) {
      populateRequestProfileForm(requestProfileEditTrigger.dataset.profileId);
      return;
    }

    const requestProfileResetTrigger = event.target.closest('[data-request-profile-reset]');

    if (requestProfileResetTrigger) {
      resetRequestProfileForm();
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

    const liveFilterResetTrigger = event.target.closest('[data-live-filter-reset]');

    if (liveFilterResetTrigger) {
      const resetUrl = liveFilterResetTrigger.dataset.filterResetUrl || window.location.pathname;
      window.history.replaceState({}, '', `${resetUrl}#requests`);
      activeAccessView = 'requests';

      try {
        await refreshLiveSections(`${window.location.origin}${resetUrl}`);
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
    if (event.target.matches('[data-portal-import-category]')) {
      updateImportTemplateLink();
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-request-profile-search]')) {
      filterRequestProfileRows();
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;

    if (form.matches('[data-live-filter-form]')) {
      event.preventDefault();

      const searchParams = new URLSearchParams(new FormData(form));
      const targetUrl = `${form.action}?${searchParams.toString()}`;

      try {
        activeAccessView = 'requests';
        window.history.replaceState({}, '', `${targetUrl}#requests`);
        await refreshLiveSections(targetUrl);
      } catch (error) {
        window.location.href = targetUrl;
      }

      return;
    }

    if (form.matches('[data-portal-import-preview-form]')) {
      event.preventDefault();

      try {
        const response = await fetch('/p/import/preview', {
          method: 'POST',
          body: new FormData(form),
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
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

    socket.on('dashboard:refresh', async () => {
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
    initializeAccessUI();
    initializePortalUI();
    initializeRequestProfileUI();
  });

  initializeAccessUI();
  initializePortalUI();
  initializeRequestProfileUI();
});
