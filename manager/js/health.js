/* ==========================================================================
   health.js — health, medical and emergency (dorm office only).
   - The dorm's emergency line and the on-site doctor's hours, shown to
     students on their Health page.
   - Consultation requests from students: schedule an appointment, add the
     doctor's note, mark done. Laravel notifies the student of every change.
   - Emergency cases: illness, injury and other situations that need the
     office's attention, with the action taken and the follow-up status.
     Sensitive: the API serves them to the administrator only.
   - Health profiles (blood type, allergies, conditions, medication and the
     emergency contact). Students can only view theirs; the office edits it.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;
  const api = DMS.api;

  const STATUSES = ['pending', 'scheduled', 'done', 'cancelled'];
  const ORDER = { pending: 0, scheduled: 1, done: 2, cancelled: 3 };
  const EMG_ORDER = { open: 0, monitoring: 1, resolved: 2 };
  const SEVERITY_TONES = { low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' };
  const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const RELATIONS = ['father', 'mother', 'brother', 'sister', 'guardian', 'spouse', 'other'];
  let requests;
  let profiles;
  let emergencies;
  let drawChips;
  let current = null;
  let editing = null;
  let editingCase = null;
  let caseFromRequest = null;

  function requestItems() {
    return data.db.health_requests.filter(function (r) { return DMS.app.term.hasDate(r.created_at); }).sort(function (a, b) {
      // Waiting requests first, urgent ones on top; then the newest.
      return ORDER[a.status] - ORDER[b.status] || (a.urgency === b.urgency ? 0 : a.urgency === 'urgent' ? -1 : 1) || (a.created_at < b.created_at ? 1 : -1);
    });
  }
  function urgency(r) {
    return r.urgency === 'urgent' ? '<span class="badge badge--danger">' + esc(t('health.urgent')) + '</span>' : '';
  }
  function flagged(m) { return !!(m.allergies || m.conditions || m.medications); }
  function muted(key) { return '<span class="muted">' + esc(t(key)) + '</span>'; }
  function nowLocal() { return data.now().slice(0, 16); }

  /* ---- Clinic and hotline ---- */
  function fillClinic() {
    const h = data.db.settings.health;
    const formEl = document.getElementById('clinic-form');
    DMS.form.clear(formEl);
    DMS.form.fill(formEl, { hotline: h.hotline, doctor: ui.getText(h, 'doctor'), hours: ui.getText(h, 'hours') });
  }

  /* ---- Consultation requests ---- */
  function requestRow(r) {
    const s = data.find('students', r.student_id);
    const room = data.roomOfStudent(r.student_id);
    return '<tr>' +
      ui.td('common.student', ui.person(s, room ? room.number : t('common.noRoom'))) +
      ui.td('health.colRequest', '<span class="cell-main ltr">' + esc(r.ref) + '</span> ' + urgency(r) +
        '<span class="cell-sub"><time datetime="' + esc(r.created_at) + '" title="' + esc(i18n.dateTime(r.created_at)) + '">' + esc(i18n.relative(r.created_at)) + '</time></span>') +
      ui.td('health.colProblem', '<span class="cell-clip" dir="auto">' + esc(ui.tr(r.symptoms)) + '</span>') +
      ui.td('health.colAppointment', r.appointment_at ? '<span class="nowrap">' + esc(i18n.dateTime(r.appointment_at)) + '</span>' : muted('health.notScheduled')) +
      ui.td('common.status', ui.badge(r.status)) +
      ui.td('', '<button type="button" class="btn btn--secondary btn--sm" data-open="' + r.id + '" aria-label="' + esc(t('health.openLabel', { ref: r.ref })) + '">' +
        esc(t(r.status === 'pending' || r.status === 'scheduled' ? 'health.manage' : 'common.view')) + '</button>', 'cell-actions') +
      '</tr>';
  }

  function detail(labelKey, html, full) {
    return '<div class="details__item' + (full ? ' details__item--full' : '') + '"><dt>' + esc(t(labelKey)) + '</dt><dd>' + html + '</dd></div>';
  }

  function openRequest(r) {
    current = r;
    const s = data.find('students', r.student_id);
    const room = data.roomOfStudent(r.student_id);
    const m = data.medicalProfile(r.student_id);
    document.getElementById('request-modal-title').textContent = t('health.requestTitle', { ref: r.ref });
    document.getElementById('request-modal-sub').innerHTML = esc(t('health.requested', { when: i18n.dateTime(r.created_at) })) + ' ' + urgency(r);
    document.getElementById('request-details').innerHTML =
      detail('common.student', '<span dir="auto">' + esc(i18n.name(s)) + '</span> · ' + (room ? '<span class="ltr">' + esc(room.number) + '</span>' : esc(t('common.noRoom')))) +
      detail('health.phone', s ? ui.telLink(s.phone) : '') +
      detail('health.colProblem', '<span dir="auto">' + esc(ui.tr(r.symptoms)) + '</span>', true) +
      detail('health.allergies', m.allergies ? '<span dir="auto">' + esc(ui.tr(m.allergies)) + '</span>' : muted('health.none')) +
      detail('health.conditions', (m.conditions || m.medications) ? '<span dir="auto">' + esc([m.conditions, m.medications].filter(Boolean).map(ui.tr).join(' · ')) + '</span>' : muted('health.none')) +
      detail('health.blood', m.blood_type ? '<span class="ltr">' + esc(m.blood_type) + '</span>' : muted('health.unknown')) +
      detail('health.colEmergency', m.emergency_name ? '<span dir="auto">' + esc(m.emergency_name) + '</span> · ' + ui.telLink(m.emergency_phone) : muted('health.none')) +
      (r.urgency === 'urgent'
        ? '<div class="details__item details__item--full"><dd><button type="button" class="btn btn--soft-danger btn--sm" data-case-from="' + r.id + '">' +
          ui.icon('alert', { size: 16 }) + esc(t('emg.fromRequest')) + '</button></dd></div>'
        : '');
    const formEl = document.getElementById('request-form');
    DMS.form.clear(formEl);
    DMS.form.fill(formEl, { status: r.status, appointment_at: r.appointment_at ? r.appointment_at.slice(0, 16) : '', note: r.note });
    ui.openModal(document.getElementById('request-modal'));
  }

  function saveRequest(event) {
    event.preventDefault();
    const r = current;
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (v.status === 'scheduled' && !v.appointment_at) errors.appointment_at = 'health.errWhen';
    if (v.status === 'cancelled' && !v.note) errors.note = 'health.errNote';
    if (DMS.form.show(formEl, errors)) return;

    const appointment = v.appointment_at ? v.appointment_at + ':00' : null;
    const changed = v.status !== r.status || appointment !== r.appointment_at || v.note !== r.note;
    if (!changed) { ui.closeModal(document.getElementById('request-modal')); return; }
    ui.busy(formEl.querySelector('[type="submit"]'), api.put('/health/requests/' + r.id, { status: v.status, appointment_at: v.appointment_at || null, note: v.note || null }))
      .then(function () {
        ui.closeModal(document.getElementById('request-modal'));
        return DMS.app.reload();
      })
      .then(function () { ui.toast(t('health.toastRequest', { ref: r.ref })); })
      .catch(ui.failed(formEl));
  }

  /* ---- Emergency cases ---- */
  function caseItems() {
    return data.db.emergencies.slice().sort(function (a, b) {
      return EMG_ORDER[a.status] - EMG_ORDER[b.status] || (a.occurred_at < b.occurred_at ? 1 : -1);
    });
  }
  function severity(c) {
    return '<span class="badge badge--' + SEVERITY_TONES[c.severity] + '">' + esc(t('emg.sev.' + c.severity)) + '</span>';
  }
  function caseRow(c) {
    const s = c.student_id ? data.find('students', c.student_id) : null;
    return '<tr>' +
      ui.td('emg.colCase', '<span class="cell-main ltr">' + esc(c.ref) + '</span> ' + severity(c) + '<span class="cell-sub">' + esc(t('emg.cat.' + c.category)) + '</span>') +
      ui.td('common.student', s ? ui.person(s, s.university_id) : muted('emg.noStudent')) +
      ui.td('emg.colWhat', '<span class="cell-main" dir="auto">' + esc(c.title) + '</span><span class="cell-clip cell-sub" dir="auto">' + esc(c.action_taken || c.description) + '</span>') +
      ui.td('emg.colWhen', '<span class="nowrap">' + esc(i18n.dateTime(c.occurred_at)) + '</span>' + (c.reported_by ? '<span class="cell-sub" dir="auto">' + esc(i18n.loc(c.reported_by)) + '</span>' : '')) +
      ui.td('common.status', ui.badge(c.status)) +
      ui.td('', '<button type="button" class="btn btn--secondary btn--sm" data-case="' + c.id + '" aria-label="' + esc(t('emg.openLabel', { ref: c.ref })) + '">' + esc(t('health.manage')) + '</button>', 'cell-actions') +
      '</tr>';
  }

  function options(values, label, selected) {
    return values.map(function (v) { return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(label(v)) + '</option>'; }).join('');
  }

  /** c: an existing case, or null for a new one (from: a health request to start from). */
  function openCase(c, from) {
    editingCase = c || null;
    caseFromRequest = from || null;
    const formEl = document.getElementById('emergency-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('emergency-modal-title').textContent = c ? t('emg.editTitle', { ref: c.ref }) : t('emg.newTitle');
    const students = data.db.students.slice().sort(function (a, b) { return i18n.name(a).localeCompare(i18n.name(b), i18n.lang()); });
    const studentId = c ? c.student_id : from ? from.student_id : '';
    formEl.elements.student_id.innerHTML = '<option value="">' + esc(t('emg.noStudent')) + '</option>' +
      options(students.map(function (s) { return s.id; }), function (id) { const s = data.find('students', id); return i18n.name(s) + ' · ' + s.university_id; }, studentId || '');
    formEl.elements.category.innerHTML = options(data.config.emergencyCategories, function (k) { return t('emg.cat.' + k); }, c ? c.category : 'illness');
    formEl.elements.severity.innerHTML = options(data.config.emergencySeverities, function (k) { return t('emg.sev.' + k); }, c ? c.severity : (from ? 'high' : 'medium'));
    DMS.form.fill(formEl, c
      ? { occurred_at: c.occurred_at.slice(0, 16), title: c.title, description: c.description, action_taken: c.action_taken, status: c.status }
      : { occurred_at: nowLocal(), title: '', description: from ? from.symptoms : '', action_taken: '', status: 'open' });
    formEl.elements.occurred_at.max = nowLocal();
    ui.openModal(document.getElementById('emergency-modal'));
  }

  function saveCase(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (!v.occurred_at) errors.occurred_at = 'err.required';
    else if (v.occurred_at > nowLocal()) errors.occurred_at = 'emg.errFuture';
    if (!v.title) errors.title = 'err.required';
    else if (v.title.length < 3) errors.title = 'emg.errShort';
    if (!v.description) errors.description = 'err.required';
    else if (v.description.length < 5) errors.description = 'emg.errShort';
    if (v.status === 'resolved' && !v.action_taken) errors.action_taken = 'emg.errAction';
    if (DMS.form.show(formEl, errors)) return;

    const body = {
      student_id: v.student_id ? Number(v.student_id) : null, category: v.category, severity: v.severity, title: v.title,
      description: v.description, action_taken: v.action_taken || null, status: v.status, occurred_at: v.occurred_at,
      health_request_id: editingCase ? editingCase.health_request_id : caseFromRequest ? caseFromRequest.id : null,
    };
    const isNew = !editingCase;
    const request = isNew ? api.post('/emergency-cases', body) : api.put('/emergency-cases/' + editingCase.id, body);
    ui.busy(formEl.querySelector('[type="submit"]'), request).then(function (res) {
      ui.closeModal(document.getElementById('emergency-modal'));
      return DMS.app.reload().then(function () { ui.toast(t(isNew ? 'emg.toastAdded' : 'emg.toastSaved', { ref: res.data.ref })); });
    }).catch(ui.failed(formEl));
  }

  /* ---- Health profiles ---- */
  function profileRow(s) {
    const m = data.medicalProfile(s.id);
    const room = data.roomOfStudent(s.id);
    const medical = [m.allergies && t('health.allergiesN', { text: ui.tr(m.allergies) }), m.conditions && ui.tr(m.conditions), m.medications && ui.tr(m.medications)].filter(Boolean);
    return '<tr>' +
      ui.td('common.student', ui.person(s, room ? room.number : t('common.noRoom'))) +
      ui.td('health.blood', m.blood_type ? '<span class="ltr">' + esc(m.blood_type) + '</span>' : muted('health.unknown')) +
      ui.td('health.colMedical', medical.length
        ? (m.allergies ? '<span class="badge badge--warning">' + esc(t('health.allergy')) + '</span> ' : '') + '<span class="cell-sub" dir="auto">' + esc(medical.join(' · ')) + '</span>'
        : muted('health.none')) +
      ui.td('health.colEmergency', m.emergency_name
        ? '<span class="cell-main" dir="auto">' + esc(m.emergency_name) + '</span><span class="cell-sub">' + esc(t('relation.' + (m.emergency_relation || 'other'))) + ' · ' + ui.telLink(m.emergency_phone) + '</span>'
        : muted('health.none')) +
      ui.td('', '<button type="button" class="icon-btn icon-btn--sm" data-edit="' + s.id + '" aria-label="' + esc(t('health.editLabel', { name: i18n.name(s) })) + '" title="' + esc(t('common.edit')) + '">' + ui.icon('edit', { size: 17 }) + '</button>', 'cell-actions') +
      '</tr>';
  }

  function openProfile(s) {
    editing = s;
    const m = data.medicalProfile(s.id);
    const formEl = document.getElementById('profile-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('profile-modal-title').textContent = t('health.profileTitle');
    document.getElementById('profile-modal-sub').textContent = i18n.name(s) + ' · ' + s.university_id;
    formEl.elements.blood_type.innerHTML = '<option value="">' + esc(t('health.unknown')) + '</option>' + options(BLOOD, function (b) { return b; }, m.blood_type);
    formEl.elements.emergency_relation.innerHTML = options(RELATIONS, function (r) { return t('relation.' + r); }, m.emergency_relation || 'father');
    DMS.form.fill(formEl, { allergies: m.allergies, conditions: m.conditions, medications: m.medications, emergency_name: m.emergency_name, emergency_phone: m.emergency_phone });
    ui.openModal(document.getElementById('profile-modal'));
  }

  function saveProfile(event) {
    event.preventDefault();
    const s = editing;
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (v.emergency_name && v.emergency_name.length < 3) errors.emergency_name = 'health.errName';
    if (v.emergency_phone && !DMS.form.isPhone(v.emergency_phone)) errors.emergency_phone = 'err.phone';
    if (DMS.form.show(formEl, errors)) return;
    const m = data.medicalProfile(s.id);
    const keys = ['blood_type', 'allergies', 'conditions', 'medications', 'emergency_name', 'emergency_relation', 'emergency_phone'];
    if (keys.every(function (k) { return (m[k] || '') === (v[k] || ''); })) { ui.closeModal(document.getElementById('profile-modal')); return; }
    const body = {};
    keys.forEach(function (k) { body[k] = v[k] || null; });
    ui.busy(formEl.querySelector('[type="submit"]'), api.put('/health/profiles/' + s.id, body))
      .then(function () {
        ui.closeModal(document.getElementById('profile-modal'));
        return DMS.app.reload();
      })
      .then(function () { ui.toast(t('health.toastProfile', { name: i18n.name(s) })); })
      .catch(ui.failed(formEl));
  }

  function init() {
    requests = DMS.list.create({
      root: document.getElementById('request-list'),
      items: requestItems,
      pageSize: 6,
      search: function (r) { const s = data.find('students', r.student_id); return [r.ref, r.symptoms, s ? s.name : '', s ? s.name_ar : '', s ? s.university_id : '']; },
      filters: { status: function (r, v) { return r.status === v; } },
      render: requestRow,
      empty: { icon: 'heart', title: 'health.emptyRequests', text: 'health.emptyRequestsText' },
      onRender: function () { drawChips(); },
    });
    drawChips = ui.statusChips(document.getElementById('status-chips'), requests, STATUSES, requestItems);

    emergencies = DMS.list.create({
      root: document.getElementById('emergency-list'),
      items: caseItems,
      pageSize: 6,
      search: function (c) { const s = c.student_id ? data.find('students', c.student_id) : null; return [c.ref, c.title, c.description, c.action_taken, s ? s.name : '', s ? s.name_ar : '', t('emg.cat.' + c.category)]; },
      filters: { status: function (c, v) { return c.status === v; } },
      render: caseRow,
      empty: { icon: 'alert', title: 'emg.emptyTitle', text: 'emg.emptyText' },
    });

    profiles = DMS.list.create({
      root: document.getElementById('profile-list'),
      items: function () { return data.db.students.filter(function (s) { return s.status === 'active'; }); },
      pageSize: 8,
      sort: function (a, b) { return i18n.name(a).localeCompare(i18n.name(b), i18n.lang()); },
      search: function (s) { const m = data.medicalProfile(s.id); return [s.name, s.name_ar, s.university_id, m.allergies, m.conditions, m.medications, m.blood_type, m.emergency_name]; },
      filters: { flag: function (s) { return flagged(data.medicalProfile(s.id)); } },
      render: profileRow,
      empty: { icon: 'users', title: 'health.emptyProfiles', text: 'health.emptyProfilesText' },
    });

    document.getElementById('request-list').addEventListener('click', function (event) {
      const b = event.target.closest('[data-open]');
      if (b) openRequest(data.find('health_requests', b.getAttribute('data-open')));
    });
    document.getElementById('request-details').addEventListener('click', function (event) {
      const b = event.target.closest('[data-case-from]');
      if (!b) return;
      const r = data.find('health_requests', b.getAttribute('data-case-from'));
      ui.closeModal(document.getElementById('request-modal'));
      openCase(null, r);
    });
    document.getElementById('emergency-list').addEventListener('click', function (event) {
      const b = event.target.closest('[data-case]');
      if (b) openCase(data.find('emergencies', b.getAttribute('data-case')));
    });
    document.getElementById('add-emergency').addEventListener('click', function () { openCase(null); });
    document.getElementById('profile-list').addEventListener('click', function (event) {
      const b = event.target.closest('[data-edit]');
      if (b) openProfile(data.find('students', b.getAttribute('data-edit')));
    });
    document.getElementById('request-form').addEventListener('submit', saveRequest);
    document.getElementById('emergency-form').addEventListener('submit', saveCase);
    document.getElementById('profile-form').addEventListener('submit', saveProfile);

    document.getElementById('clinic-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const formEl = event.target;
      const v = DMS.form.values(formEl);
      const errors = {};
      if (!v.hotline) errors.hotline = 'err.required';
      else if (!DMS.form.isPhone(v.hotline)) errors.hotline = 'err.phone';
      if (!v.doctor) errors.doctor = 'err.required';
      if (!v.hours) errors.hours = 'err.required';
      if (DMS.form.show(formEl, errors)) return;
      const h = Object.assign({}, data.db.settings.health);
      ui.setText(h, 'doctor', v.doctor);
      ui.setText(h, 'hours', v.hours);
      ui.busy(formEl.querySelector('[type="submit"]'), api.put('/health/clinic', {
        hotline: v.hotline, doctor_en: h.doctor_en, doctor_ar: h.doctor_ar, hours_en: h.hours_en, hours_ar: h.hours_ar,
      })).then(function () { return DMS.app.reload(); }).then(function () { ui.toast(t('health.toastClinic')); }).catch(ui.failed(formEl));
    });

    fillClinic();
    requests.render();
    emergencies.render();
    profiles.render();
    if (global.location.hash === '#emergencies') document.getElementById('emergencies').scrollIntoView();
  }

  DMS.app.page({
    needs: ['health_requests', 'medical_profiles', 'emergencies', 'students', 'rooms', 'allocations'],
    init: init,
    render: function () {
      // Keep what is being typed in the clinic form; only the lists follow the language and the term.
      requests.render();
      emergencies.render();
      profiles.render();
    },
  });
})(window);
