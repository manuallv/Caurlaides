document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('[data-mobile-sidebar]');
  const sidebarToggles = document.querySelectorAll('[data-mobile-sidebar-toggle]');
  const sidebarClosers = document.querySelectorAll('[data-mobile-sidebar-close], [data-mobile-sidebar-overlay]');
  const menuButton = document.querySelector('[data-mobile-menu-toggle]');
  const menuPanel = document.querySelector('[data-mobile-menu]');
  const eventRoom = document.body.dataset.eventRoom;
  let activePortalTab = 'all';
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

  const refreshLiveSections = async () => {
    const currentSections = [...document.querySelectorAll('[data-live-section]')];

    if (!currentSections.length) {
      window.location.reload();
      return;
    }

    const response = await fetch(window.location.href, {
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
      window.location.reload();
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

  const getPortalElements = () => ({
    app: document.querySelector('[data-portal-app]'),
    requestModal: document.querySelector('[data-portal-request-modal]'),
    requestForm: document.querySelector('[data-portal-request-form]'),
    requestTitle: document.querySelector('[data-portal-request-modal-title]'),
    requestSubmitLabel: document.querySelector('[data-portal-request-submit-label]'),
    requestCategorySelect: document.querySelector('[data-portal-category-select]'),
    requestMethodHolder: document.querySelector('[data-portal-method-holder]'),
    importModal: document.querySelector('[data-portal-import-modal]'),
    importPreviewForm: document.querySelector('[data-portal-import-preview-form]'),
    importTitle: document.querySelector('[data-portal-import-title]'),
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
      button.classList.toggle('btn-primary', isActive);
      button.classList.toggle('btn-secondary', !isActive);
    });
  };

  const closePortalModal = (modal) => {
    if (!modal) {
      return;
    }

    modal.classList.add('hidden');
    modal.classList.remove('flex');
  };

  const openPortalModal = (modal) => {
    if (!modal) {
      return;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
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

  const openRequestModal = ({ type, mode = 'create', request = null }) => {
    const elements = getPortalElements();

    if (!elements.requestForm) {
      return;
    }

    const ui = getPortalUi();
    elements.requestForm.reset();
    elements.requestForm.action = `/p/${type}`;
    elements.requestTitle.textContent = mode === 'edit'
      ? (ui.editRequestTitle || 'Edit request')
      : type === 'pass'
        ? (ui.addPassTitle || 'Add pass')
        : (ui.addWristbandTitle || 'Add wristband');
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
    openPortalModal(elements.requestModal);
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

  const openImportModal = (type) => {
    const elements = getPortalElements();

    if (!elements.importPreviewForm) {
      return;
    }

    const ui = getPortalUi();
    elements.importPreviewForm.reset();
    elements.importTypeInput.value = type;
    elements.importTitle.textContent = type === 'pass'
      ? (ui.importPassTitle || 'Import passes from Excel')
      : (ui.importWristbandTitle || 'Import wristbands from Excel');
    elements.importPreview.classList.add('hidden');
    elements.importPreview.innerHTML = '';
    elements.importConfirmButton.classList.add('hidden');
    elements.importConfirmButton.dataset.token = '';
    fillCategoryOptions(elements.importCategory, type);
    updateImportTemplateLink();
    openPortalModal(elements.importModal);
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
        <tr class="border-b border-slate-200/70 align-top">
          <td class="py-3 pr-4 text-slate-600">${row.rowNumber}</td>
          <td class="py-3 pr-4 text-slate-900">${row.fullName || '-'}</td>
          <td class="py-3 pr-4 text-slate-600">${row.phone || '-'}</td>
          <td class="py-3 pr-4 text-slate-600">${row.companyName || '-'}</td>
          <td class="py-3 pr-4 text-slate-600">${row.email || '-'}</td>
          <td class="py-3 text-rose-600">${(row.errors || []).join('<br>') || (ui.previewOk || 'OK')}</td>
        </tr>
      `)
      .join('');

    elements.importPreview.innerHTML = `
      <div class="space-y-4">
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-sm font-semibold text-slate-900">${ui.previewRows || 'Rows'}: ${preview.totalRows}</p>
          <p class="mt-1 text-sm text-slate-600">${ui.previewValidRows || 'Valid rows'}: ${preview.validRows}</p>
          ${overallErrors ? `<ul class="mt-3 space-y-1 text-sm text-rose-600">${overallErrors}</ul>` : ''}
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="border-b border-slate-200 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th class="pb-3 pr-4">${ui.previewRowColumn || 'Row'}</th>
                <th class="pb-3 pr-4">${ui.previewNameColumn || 'Name'}</th>
                <th class="pb-3 pr-4">${ui.previewPhoneColumn || 'Phone'}</th>
                <th class="pb-3 pr-4">${ui.previewCompanyColumn || 'Company'}</th>
                <th class="pb-3 pr-4">${ui.previewEmailColumn || 'Email'}</th>
                <th class="pb-3">${ui.previewValidationColumn || 'Validation'}</th>
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
      closePortalModal(getPortalElements().requestModal);
      closePortalModal(getPortalElements().importModal);
    }
  });

  if (menuButton && menuPanel) {
    menuButton.addEventListener('click', () => {
      menuPanel.classList.toggle('hidden');
    });
  }

  document.addEventListener('click', async (event) => {
    const closeTrigger = event.target.closest('[data-portal-close]');

    if (closeTrigger) {
      closePortalModal(getPortalElements().requestModal);
      closePortalModal(getPortalElements().importModal);
      return;
    }

    const tabTrigger = event.target.closest('[data-portal-tab], [data-portal-set-tab]');

    if (tabTrigger) {
      const tab = tabTrigger.dataset.tab || 'all';
      setPortalTab(tab);
      document.querySelector('[data-live-section="portal-table"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const createTrigger = event.target.closest('[data-portal-open-request-modal]');

    if (createTrigger) {
      openRequestModal({
        type: createTrigger.dataset.requestType,
      });
      return;
    }

    const editTrigger = event.target.closest('[data-portal-edit-request]');

    if (editTrigger) {
      openRequestModal({
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

    const importTrigger = event.target.closest('[data-portal-open-import-modal]');

    if (importTrigger) {
      openImportModal(importTrigger.dataset.requestType);
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

        closePortalModal(getPortalElements().importModal);
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

  document.addEventListener('submit', async (event) => {
    const form = event.target;

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
        closePortalModal(getPortalElements().requestModal);
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
    initializePortalUI();
  });

  initializePortalUI();
});
