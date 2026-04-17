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

  const getCheckElements = () => ({
    app: document.querySelector('[data-check-app]'),
    form: document.querySelector('[data-check-form]'),
    feedback: document.querySelector('[data-check-feedback]'),
    vehiclePlateInput: document.querySelector('[data-check-vehicle-plate]'),
    gateNameInput: document.querySelector('[data-check-gate-name]'),
    submitButtons: [...document.querySelectorAll('[data-check-submit-button]')],
    resultCard: document.querySelector('[data-check-result-card]'),
    resultEmpty: document.querySelector('[data-check-result-empty]'),
    resultContent: document.querySelector('[data-check-result-content]'),
    resultTitle: document.querySelector('[data-check-result-title]'),
    resultPlate: document.querySelector('[data-check-result-plate]'),
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
    };
  };

  let checkFeedbackTimer = null;
  let checkInputToneTimer = null;

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

  const renderCheckRecentItems = (items = []) => items.map((item) => {
    const detailParts = [
      item.companyName,
      item.categoryName,
      item.gateName,
    ].filter(Boolean);

    return `
      <div class="rounded-2xl border border-slate-200 px-4 py-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-900">${escapeHtml(item.vehiclePlate || '')} · ${escapeHtml(item.fullName || '')}</p>
            <p class="mt-1 text-xs text-slate-500">${escapeHtml(item.directionLabel || '')} · ${escapeHtml(item.createdAtLabel || '')}</p>
            ${detailParts.length ? `<p class="mt-2 text-xs text-slate-500">${escapeHtml(detailParts.join(' · '))}</p>` : ''}
          </div>

          <span class="portal-type-pill ${item.direction === 'exit' ? 'is-wristband' : 'is-pass'}">
            ${escapeHtml(item.directionLabel || '')}
          </span>
        </div>
      </div>
    `;
  }).join('');

  const renderCheckResult = (result) => {
    const {
      resultCard,
      resultEmpty,
      resultContent,
      resultTitle,
      resultPlate,
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

    resultCard.classList.remove('is-entry', 'is-exit', 'is-check');
    resultCard.classList.add(
      result.direction === 'exit'
        ? 'is-exit'
        : result.direction === 'check'
          ? 'is-check'
          : 'is-entry',
    );
    resultEmpty.classList.add('hidden');
    resultContent.classList.remove('hidden');

    if (resultTitle) {
      resultTitle.textContent = result.directionTitle || '';
    }

    if (resultPlate) {
      resultPlate.textContent = result.request?.vehiclePlate || result.checkedPlate || '';
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
      vehiclePlateInput?.focus?.();
      vehiclePlateInput?.select?.();
    } finally {
      setCheckFormLoading(false);
    }
  };

  const initializeCheckUI = () => {
    const { app, resultContent, resultEmpty, recentList, recentEmpty } = getCheckElements();
    const ui = getCheckUi();

    if (!app) {
      return;
    }

    if (resultEmpty && !resultContent?.classList.contains('hidden')) {
      resultEmpty.classList.add('hidden');
    } else if (resultEmpty && resultContent?.classList.contains('hidden')) {
      resultEmpty.textContent = ui.resultHint || resultEmpty.textContent;
    }

    if (recentEmpty && recentList) {
      recentEmpty.classList.toggle('hidden', !recentList.classList.contains('hidden') && recentList.children.length > 0);
    }
  };

  const getPassPrintElements = () => {
    const app = document.querySelector('[data-pass-print-app]');
    const stateScriptId = app?.dataset.passPrintStateScript || 'pass-print-state';

    return {
      app,
      stateScript: document.getElementById(stateScriptId),
      form: document.querySelector('[data-pass-print-form]'),
      fieldsInput: document.querySelector('[data-pass-print-fields-input]'),
      page: document.querySelector('[data-pass-print-page]'),
      fieldLayer: document.querySelector('[data-pass-print-field-layer]'),
      emptyState: document.querySelector('[data-pass-print-empty-state]'),
      addButtons: [...document.querySelectorAll('[data-pass-print-add-field]')],
      inspectorTitle: document.querySelector('[data-pass-print-inspector-title]'),
      fieldType: document.querySelector('[data-pass-print-field-type]'),
      fieldFontSize: document.querySelector('[data-pass-print-field-font-size]'),
      positionX: document.querySelector('[data-pass-print-field-position-x]'),
      positionY: document.querySelector('[data-pass-print-field-position-y]'),
      removeFieldButton: document.querySelector('[data-pass-print-remove-field]'),
      backgroundInput: document.querySelector('[data-pass-print-background-input]'),
      removeBackgroundInput: document.querySelector('[data-pass-print-remove-background]'),
    };
  };

  let passPrintEditorState = {
    canManage: false,
    fields: [],
    variables: [],
    selectedId: '',
    currentBackgroundUrl: '',
    uploadedBackgroundUrl: '',
    drag: null,
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
      };
    } catch (error) {
      return null;
    }
  };

  const getPassPrintVariableLabel = (type) => (
    passPrintEditorState.variables.find((variable) => variable.type === type)?.label || type || ''
  );

  const syncPassPrintFieldsInput = () => {
    const { fieldsInput } = getPassPrintElements();

    if (!fieldsInput) {
      return;
    }

    fieldsInput.value = JSON.stringify(
      passPrintEditorState.fields.map((field) => ({
        id: field.id,
        type: field.type,
        x: Number(field.x || 0),
        y: Number(field.y || 0),
        fontSize: Number(field.fontSize || 18),
      })),
    );
  };

  const syncPassPrintBackgroundPreview = () => {
    const { page, removeBackgroundInput } = getPassPrintElements();

    if (!page) {
      return;
    }

    const backgroundUrl = removeBackgroundInput?.checked
      ? ''
      : passPrintEditorState.uploadedBackgroundUrl || passPrintEditorState.currentBackgroundUrl;

    page.classList.toggle('has-background', Boolean(backgroundUrl));
    page.style.backgroundImage = backgroundUrl ? `url("${backgroundUrl.replace(/"/g, '\\"')}")` : '';
  };

  const renderPassPrintFields = () => {
    const { fieldLayer, emptyState } = getPassPrintElements();

    if (!fieldLayer) {
      return;
    }

    fieldLayer.innerHTML = passPrintEditorState.fields.map((field) => `
      <button
        type="button"
        class="pass-print-field${field.id === passPrintEditorState.selectedId ? ' is-active' : ''}"
        data-pass-print-field-id="${escapeHtml(field.id || '')}"
        style="left:${Number(field.x || 0) * 100}%;top:${Number(field.y || 0) * 100}%;font-size:${Number(field.fontSize || 18)}px;"
      >
        <span>${escapeHtml(getPassPrintVariableLabel(field.type))}</span>
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
      fieldFontSize,
      positionX,
      positionY,
      removeFieldButton,
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

    if (fieldFontSize) {
      fieldFontSize.disabled = !canEdit;
      fieldFontSize.value = hasSelection ? Number(selectedField.fontSize || 18) : '';
    }

    if (positionX) {
      positionX.textContent = hasSelection ? `${Math.round(Number(selectedField.x || 0) * 100)}%` : '0%';
    }

    if (positionY) {
      positionY.textContent = hasSelection ? `${Math.round(Number(selectedField.y || 0) * 100)}%` : '0%';
    }

    if (removeFieldButton) {
      removeFieldButton.disabled = !canEdit;
    }
  };

  const selectPassPrintField = (fieldId = '') => {
    if (!passPrintEditorState.fields.some((field) => field.id === fieldId)) {
      passPrintEditorState.selectedId = '';
    } else {
      passPrintEditorState.selectedId = fieldId;
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
      x: Math.min(0.18 + (nextIndex % 4) * 0.08, 0.78),
      y: Math.min(0.12 + Math.floor(nextIndex / 4) * 0.07, 0.88),
      fontSize: 18,
    };

    passPrintEditorState.fields.push(field);
    passPrintEditorState.selectedId = field.id;
    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
  };

  const removeSelectedPassPrintField = () => {
    if (!passPrintEditorState.canManage || !passPrintEditorState.selectedId) {
      return;
    }

    passPrintEditorState.fields = passPrintEditorState.fields.filter(
      (field) => field.id !== passPrintEditorState.selectedId,
    );
    passPrintEditorState.selectedId = passPrintEditorState.fields[0]?.id || '';
    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
  };

  const startPassPrintFieldDrag = (pointerEvent, fieldId) => {
    const { page } = getPassPrintElements();
    const selectedField = passPrintEditorState.fields.find((field) => field.id === fieldId);

    if (!page || !selectedField || !passPrintEditorState.canManage) {
      return;
    }

    pointerEvent.preventDefault();

    const rect = page.getBoundingClientRect();

    passPrintEditorState.drag = {
      fieldId,
      pointerId: pointerEvent.pointerId,
      offsetX: pointerEvent.clientX - (rect.left + rect.width * Number(selectedField.x || 0)),
      offsetY: pointerEvent.clientY - (rect.top + rect.height * Number(selectedField.y || 0)),
    };
  };

  const movePassPrintFieldDrag = (pointerEvent) => {
    const { page } = getPassPrintElements();
    const dragState = passPrintEditorState.drag;

    if (!page || !dragState) {
      return;
    }

    const rect = page.getBoundingClientRect();
    const x = (pointerEvent.clientX - rect.left - dragState.offsetX) / rect.width;
    const y = (pointerEvent.clientY - rect.top - dragState.offsetY) / rect.height;

    upsertSelectedPassPrintField({
      x: Math.min(Math.max(x, 0), 0.96),
      y: Math.min(Math.max(y, 0), 0.96),
    });
  };

  const stopPassPrintFieldDrag = () => {
    passPrintEditorState.drag = null;
  };

  const handlePassPrintBackgroundChange = (file) => {
    if (!file) {
      passPrintEditorState.uploadedBackgroundUrl = '';
      syncPassPrintBackgroundPreview();
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      passPrintEditorState.uploadedBackgroundUrl = String(reader.result || '');
      const { removeBackgroundInput } = getPassPrintElements();

      if (removeBackgroundInput) {
        removeBackgroundInput.checked = false;
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
        currentBackgroundUrl: '',
        uploadedBackgroundUrl: '',
        drag: null,
      };
      return;
    }

    passPrintEditorState = {
      canManage: nextState.canManage,
      fields: nextState.fields.map((field) => ({
        id: String(field.id || ''),
        type: field.type,
        x: Number(field.x || 0),
        y: Number(field.y || 0),
        fontSize: Number(field.fontSize || 18),
      })),
      variables: nextState.variables,
      selectedId: nextState.fields[0]?.id || '',
      currentBackgroundUrl: nextState.currentBackgroundUrl || '',
      uploadedBackgroundUrl: '',
      drag: null,
    };

    syncPassPrintBackgroundPreview();
    renderPassPrintFields();
    syncPassPrintInspector();
    syncPassPrintFieldsInput();
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
    historyModal: document.querySelector('[data-access-history-modal]'),
    historyTitle: document.querySelector('[data-access-history-title]'),
    historyEyebrow: document.querySelector('[data-access-history-eyebrow]'),
    historyMeta: document.querySelector('[data-access-history-meta]'),
    historySummary: document.querySelector('[data-access-history-summary]'),
    historyLoading: document.querySelector('[data-access-history-loading]'),
    historyEmpty: document.querySelector('[data-access-history-empty]'),
    historyList: document.querySelector('[data-access-history-list]'),
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
    entryWindowsList: document.querySelector('[data-access-entry-windows-list]'),
    entryWindowsEmpty: document.querySelector('[data-access-entry-windows-empty]'),
    entryWindowTemplate: document.querySelector('[data-access-entry-window-template]'),
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
      historyTitle: workspace.dataset.accessHistoryTitle,
      historyLoading: workspace.dataset.accessHistoryLoading,
      historyEmpty: workspace.dataset.accessHistoryEmpty,
      historyError: workspace.dataset.accessHistoryError,
      historyGateLabel: workspace.dataset.accessHistoryGateLabel,
      historySourceLabel: workspace.dataset.accessHistorySourceLabel,
      historyButtonLabel: workspace.dataset.accessHistoryButtonLabel,
      historyCompanyLabel: workspace.dataset.accessHistoryCompanyLabel,
      historyTypeLabel: workspace.dataset.accessHistoryTypeLabel,
      historyProfileLabel: workspace.dataset.accessHistoryProfileLabel,
      historyRegisteredLabel: workspace.dataset.accessHistoryRegisteredLabel,
      historyEntryLabel: workspace.dataset.accessHistoryEntryLabel,
      historyLastEntryLabel: workspace.dataset.accessHistoryLastEntryLabel,
      historyLastExitLabel: workspace.dataset.accessHistoryLastExitLabel,
      eventId: workspace.dataset.accessEventId,
      pageType: workspace.dataset.accessPageType,
      singularLabel: workspace.dataset.accessSingularLabel,
      editLabel: workspace.dataset.accessEditLabel,
      notSet: workspace.dataset.accessNotSet,
      statusPendingLabel: workspace.dataset.accessStatusPendingLabel,
      statusHandedOutLabel: workspace.dataset.accessStatusHandedOutLabel,
      filteredCountTemplate: workspace.dataset.accessFilteredCountTemplate,
      vehiclePlateLabel: workspace.dataset.accessVehiclePlateLabel,
      entryAtLabel: workspace.dataset.accessEntryAtLabel,
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

  const addAccessEntryWindowRow = (values = {}) => {
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
    if (elements.entryWindowsList && !elements.entryWindowsList.children.length) {
      setAccessEntryWindows([], { ensureBlank: true });
    }
    syncAccessTypeUsageMetrics();
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
        request.vehiclePlate,
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

  const readAccessRequestFromRow = (row) => {
    const ui = getAccessUi();

    if (!row) {
      return null;
    }

    return {
      type: ui.pageType,
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
      tableScroll.classList.toggle('hidden', visibleCount === 0);
    }

    if (emptyState) {
      emptyState.classList.toggle('hidden', visibleCount > 0);
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

    const nextUrl = params.toString()
      ? `${filterForm.action}?${params.toString()}`
      : filterForm.action;

    window.history.replaceState({}, '', `${nextUrl}#requests`);
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

  const buildAccessRequestRow = (request = {}) => {
    const ui = getAccessUi();
    const row = document.createElement('tr');
    const notSet = ui.notSet || '-';
    const isPass = ui.pageType === 'pass';
    const buttonToneClass = request.nextStatusTone === 'primary'
      ? 'access-mini-button--primary'
      : 'access-mini-button--secondary';
    const statusToneClass = request.statusTone === 'active' ? 'status-active' : 'status-pending';
    const personMeta = escapeHtml(request.notes || request.email || request.phone || '');
    const secondaryUpdatedLabel = request.enteredAtLabel
      ? `${escapeHtml(ui.entryAtLabel || 'Entered')}: ${escapeHtml(request.enteredAtLabel)}`
      : '&nbsp;';

    row.dataset.requestRowId = request.id;
    row.dataset.requestStatus = request.status || '';
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
        </div>
      </td>
      <td>
        <div class="access-data-stack">
          <strong data-request-updated-primary>${escapeHtml(request.createdAtLabel || '')}</strong>
          <span data-request-updated-by>${secondaryUpdatedLabel}</span>
        </div>
      </td>
      <td>
        <div class="access-row-actions">
          ${isPass ? `
            <button
              type="button"
              class="table-icon-button"
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
            </button>
          ` : ''}
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
      applyAccessFilters();
      return true;
    }

    if (!elements.table) {
      return false;
    }

    insertAccessRowSorted(nextRow);
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

    const row = document.querySelector(`[data-request-row-id="${escapeSelector(requestId)}"]`);

    if (!row) {
      return false;
    }

    updateAccessTypeUsageMetrics(snapshotAccessRequestFromRow(row), null);

    row.remove();
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

  const renderAccessHistoryItems = (items = []) => {
    const ui = getAccessUi();

    return items.map((item) => {
      const details = [
        item.gateName ? `${escapeHtml(ui.historyGateLabel || 'Gate')}: ${escapeHtml(item.gateName)}` : '',
        item.source ? `${escapeHtml(ui.historySourceLabel || 'Source')}: ${escapeHtml(item.source)}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      return `
        <div class="access-history-item">
          <div class="access-history-item__top">
            <span class="portal-type-pill ${item.direction === 'exit' ? 'is-wristband' : 'is-pass'}">${escapeHtml(item.directionLabel || '')}</span>
            <strong>${escapeHtml(item.createdAtLabel || '')}</strong>
          </div>
          ${details ? `<p class="access-history-item__meta">${details}</p>` : ''}
        </div>
      `;
    }).join('');
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
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || ui.historyError || 'Could not load vehicle history.');
      }

      if (historyTitle) {
        historyTitle.textContent = payload.request?.fullName || ui.historyTitle || 'Vehicle history';
      }

      if (historyMeta) {
        historyMeta.textContent = payload.request?.vehiclePlate || '';
      }

      if (historySummary) {
        historySummary.innerHTML = renderAccessHistorySummary(payload.request || {});
        historySummary.hidden = false;
      }

      if (historyLoading) {
        historyLoading.hidden = true;
      }

      if (!payload.movements?.length) {
        if (historyEmpty) {
          historyEmpty.hidden = false;
        }
        return;
      }

      if (historyList) {
        historyList.innerHTML = renderAccessHistoryItems(payload.movements);
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

    const eventId = document.body.dataset.eventRoom;
    const accessType = window.location.pathname.includes('/wristbands') ? 'wristband' : 'pass';
    const isEdit = Boolean(trigger?.dataset.requestId);

    requestForm.reset();
    requestForm.action = isEdit
      ? `/events/${eventId}/${accessType}/requests/${trigger.dataset.requestId}?_method=PUT`
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
    if (requestForm.elements.vehiclePlate) {
      requestForm.elements.vehiclePlate.value = trigger?.dataset.requestVehiclePlate || '';
    }
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

    closeAccessHistoryModal();
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
    requestPassOnlyFields: [...document.querySelectorAll('[data-portal-pass-only-field]')],
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

  const syncPortalRequestFormLayout = (type) => {
    const { requestForm, requestPassOnlyFields } = getPortalElements();
    const isPass = type === 'pass';

    requestPassOnlyFields.forEach((field) => {
      field.classList.toggle('hidden', !isPass);
    });

    if (requestForm?.elements.vehiclePlate) {
      requestForm.elements.vehiclePlate.disabled = !isPass;

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
    syncPortalRequestFormLayout(type);
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
      if (elements.requestForm.vehiclePlate) {
        elements.requestForm.vehiclePlate.value = request.vehiclePlate || '';
      }
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

    const searchInput = document.querySelector('[data-portal-table-search]');

    if (searchInput) {
      searchInput.value = portalTableSearchQuery;
    }

    syncPortalSortControls();
    syncPortalRequestFormLayout(activePortalRequestType);
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
      closeAccessHistoryModal();
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
    const passPrintAddTrigger = event.target.closest('[data-pass-print-add-field]');

    if (passPrintAddTrigger) {
      addPassPrintField(passPrintAddTrigger.dataset.passPrintAddField || '');
      return;
    }

    const passPrintRemoveTrigger = event.target.closest('[data-pass-print-remove-field]');

    if (passPrintRemoveTrigger) {
      removeSelectedPassPrintField();
      return;
    }

    const passPrintFieldTrigger = event.target.closest('[data-pass-print-field-id]');

    if (passPrintFieldTrigger) {
      selectPassPrintField(passPrintFieldTrigger.dataset.passPrintFieldId || '');
      return;
    }

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

    const accessEntryWindowAddTrigger = event.target.closest('[data-access-entry-window-add]');

    if (accessEntryWindowAddTrigger) {
      addAccessEntryWindowRow();
      return;
    }

    const accessEntryWindowRemoveTrigger = event.target.closest('[data-access-entry-window-remove]');

    if (accessEntryWindowRemoveTrigger) {
      accessEntryWindowRemoveTrigger.closest('[data-access-entry-window-row]')?.remove();
      reindexAccessEntryWindowRows();
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

    const accessHistoryTrigger = event.target.closest('[data-access-history-open]');

    if (accessHistoryTrigger) {
      await openAccessHistoryModal(accessHistoryTrigger);
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

    const accessHistoryCloseTrigger = event.target.closest('[data-access-history-close]');

    if (accessHistoryCloseTrigger) {
      closeAccessHistoryModal();
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
      const accessFilterForm = liveFilterResetTrigger.closest('[data-live-filter-form]');

      if (accessFilterForm && getAccessElements().workspace) {
        accessFilterForm.reset();

        if (accessFilterForm.elements.sort) {
          accessFilterForm.elements.sort.value = 'newest';
        }

        window.history.replaceState({}, '', `${resetUrl}#requests`);
        activeAccessView = 'requests';
        applyAccessFilters();
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
          vehiclePlate: editTrigger.dataset.vehiclePlate,
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

  document.addEventListener('pointerdown', (event) => {
    const passPrintFieldTrigger = event.target.closest('[data-pass-print-field-id]');

    if (!passPrintFieldTrigger) {
      return;
    }

    selectPassPrintField(passPrintFieldTrigger.dataset.passPrintFieldId || '');
    startPassPrintFieldDrag(event, passPrintFieldTrigger.dataset.passPrintFieldId || '');
  });

  window.addEventListener('pointermove', (event) => {
    if (!passPrintEditorState.drag) {
      return;
    }

    movePassPrintFieldDrag(event);
  });

  window.addEventListener('pointerup', () => {
    stopPassPrintFieldDrag();
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-pass-print-field-type]')) {
      upsertSelectedPassPrintField({
        type: event.target.value || 'vehiclePlate',
      });
      return;
    }

    if (event.target.matches('[data-pass-print-background-input]')) {
      handlePassPrintBackgroundChange(event.target.files?.[0] || null);
      return;
    }

    if (event.target.matches('[data-pass-print-remove-background]')) {
      syncPassPrintBackgroundPreview();
      return;
    }

    if (event.target.matches('[data-portal-table-sort]')) {
      portalTableSortField = event.target.value || 'updated';
      filterPortalRows();
      return;
    }

    if (event.target.matches('[data-portal-import-category]')) {
      updateImportTemplateLink();
    }

    const liveFilterForm = event.target.closest('[data-live-filter-form]');

    if (liveFilterForm && getAccessElements().workspace && event.target.matches('select, input')) {
      activeAccessView = 'requests';
      syncAccessFilterUrl();
      applyAccessFilters();
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-pass-print-field-font-size]')) {
      upsertSelectedPassPrintField({
        fontSize: Number(event.target.value || 18),
      });
      return;
    }

    if (event.target.matches('[data-request-profile-search]')) {
      filterRequestProfileRows();
    }

    if (event.target.matches('[data-portal-table-search]')) {
      portalTableSearchQuery = event.target.value;
      filterPortalRows();
    }

    if (event.target.matches('[data-check-vehicle-plate], [data-check-gate-name]')) {
      setCheckFeedback('');
    }

    const liveFilterForm = event.target.closest('[data-live-filter-form]');

    if (
      liveFilterForm
      && getAccessElements().workspace
      && event.target.matches('input[type="search"], input[type="text"], input:not([type])')
    ) {
      window.clearTimeout(liveFilterTimer);
      liveFilterTimer = window.setTimeout(() => {
        activeAccessView = 'requests';
        syncAccessFilterUrl();
        applyAccessFilters();
      }, 180);
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

    if (form.matches('[data-live-filter-form]')) {
      event.preventDefault();
      if (getAccessElements().workspace) {
        activeAccessView = 'requests';
        syncAccessFilterUrl();
        applyAccessFilters();
      }

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
    closeAccessHistoryModal();
    closeAccessRequestModal();
    closeAccessExportModal();
    initializeAccessUI();
    initializeCheckUI();
    initializePassPrintUI();
    initializePortalUI();
    initializeRequestProfileUI();
    initializeSystemEmailSettings();
  });

  initializeAccessUI();
  initializeCheckUI();
  initializePassPrintUI();
  initializePortalUI();
  initializeRequestProfileUI();
  initializeSystemEmailSettings();
});
