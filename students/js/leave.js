/* ==========================================================================
   leave.js — leave and departure requests, of two kinds:
   - temporary: leaving or coming back outside the gate hours (times), or
     nights away (dates, destination, reason)
   - final: leaving the dormitory for good (departure date and reason); when
     the dorm office approves it, the stay ends on that day
   The office approves or rejects in manager/leave-requests.html and the
   student is notified. A request can be edited or withdrawn while pending.
   Laravel checks the same rules again (dates, overlaps, 21 nights at most).
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const icon = ui.icon;
  const data = DMS.data;
  const dates = data.dates;
  const portal = DMS.portal;

  const MAX_NIGHTS = 21;
  const MAX_AHEAD = 90;
  const ORDER = { pending: 0, approved: 1, rejected: 2 };
  let list;
  let editing = null;

  function mine() {
    const id = portal.me().id;
    return data.db.leaves.filter(function (l) { return l.student_id === id; });
  }
  function isFinal(l) { return l.type === 'final'; }
  function nights(l) { return isFinal(l) ? 0 : dates.between(l.departure_date, l.return_date); }
  function at(day, time) { return i18n.date(day, 'medium') + (time ? ' ' + i18n.time(time) : ''); }

  function row(l) {
    const pending = l.status === 'pending';
    const today = dates.today();
    const away = l.status === 'approved' && !isFinal(l) && l.departure_date <= today && l.return_date >= today;
    const when = isFinal(l)
      ? '<span class="cell-main">' + esc(t('sleave.finalFrom', { date: i18n.date(l.departure_date, 'medium') })) + '</span>' +
        '<span class="cell-sub"><span class="badge badge--danger badge--plain">' + esc(t('sleave.typeFinal')) + '</span> · <span class="ltr">' + esc(l.ref) + '</span></span>'
      : '<span class="cell-main">' + esc(at(l.departure_date, l.departure_time)) + ' → ' + esc(at(l.return_date, l.return_time)) + '</span>' +
        '<span class="cell-sub">' + esc(nights(l) ? t('sleave.nightsN', { n: i18n.number(nights(l)) }) : t('sleave.sameDay')) + ' · <span class="ltr">' + esc(l.ref) + '</span></span>';
    return '<tr>' +
      ui.td('sleave.dates', when) +
      ui.td('sleave.destination', l.destination ? '<span dir="auto">' + esc(ui.tr(l.destination)) + '</span>' : '<span class="muted">—</span>') +
      ui.td('common.reason', '<span class="cell-clip" dir="auto">' + esc(ui.tr(l.reason)) + '</span>' +
        (l.note ? '<span class="cell-sub" dir="auto">' + esc(t('sleave.officeNote', { note: ui.tr(l.note) })) + '</span>' : '')) +
      ui.td('common.status', ui.badge(l.status) + (away ? ' <span class="badge badge--info">' + esc(t('sleave.away')) + '</span>' : '')) +
      ui.td('', pending
        ? '<button type="button" class="icon-btn icon-btn--sm" data-edit="' + l.id + '" aria-label="' + esc(t('sleave.editLabel', { ref: l.ref })) + '">' + icon('edit', { size: 16 }) + '</button>' +
          '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-withdraw="' + l.id + '" aria-label="' + esc(t('sleave.withdrawLabel', { ref: l.ref })) + '">' + icon('trash', { size: 16 }) + '</button>'
        : '', 'cell-actions') +
      '</tr>';
  }

  function formType() {
    const checked = document.querySelector('#leave-modal-form input[name="type"]:checked');
    return checked ? checked.value : 'temporary';
  }

  /** Shows the return fields for a temporary leave only, and explains the chosen kind. */
  function showType() {
    const formEl = document.getElementById('leave-modal-form');
    const final = formType() === 'final';
    formEl.querySelectorAll('[data-temporary]').forEach(function (el) { el.hidden = final; });
    formEl.elements.return_date.disabled = final;
    formEl.elements.return_time.disabled = final;
    formEl.elements.destination.disabled = final;
    document.getElementById('lv-type-hint').textContent = t(final ? 'sleave.finalHint' : 'sleave.temporaryHint');
    showNights();
  }

  function showNights() {
    const formEl = document.getElementById('leave-modal-form');
    const from = formEl.elements.departure_date.value;
    const to = formEl.elements.return_date.value;
    const n = formType() === 'temporary' && from && to ? dates.between(from, to) : 0;
    document.getElementById('lv-nights').textContent = n > 0 ? t('sleave.nightsAway', { n: i18n.number(n) }) : '';
  }

  function openForm(l) {
    editing = l || null;
    const formEl = document.getElementById('leave-modal-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('leave-title').textContent = l ? t('sleave.editTitle', { ref: l.ref }) : t('sleave.newTitle');
    const today = dates.today();
    formEl.elements.departure_date.min = today;
    formEl.elements.departure_date.max = dates.addDays(today, MAX_AHEAD);
    formEl.elements.return_date.min = today;
    formEl.querySelectorAll('input[name="type"]').forEach(function (r) { r.checked = r.value === (l ? l.type : 'temporary'); r.disabled = !!l; });
    DMS.form.fill(formEl, l
      ? { departure_date: l.departure_date, departure_time: l.departure_time || '', return_date: l.return_date || '', return_time: l.return_time || '', destination: l.destination, reason: l.reason }
      : { departure_date: dates.addDays(today, 1), departure_time: '', return_date: dates.addDays(today, 3), return_time: '', destination: '', reason: '' });
    showType();
    ui.openModal(document.getElementById('leave-modal'));
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const type = formType();
    const final = type === 'final';
    const today = dates.today();
    const errors = {};
    if (!v.departure_date) errors.departure_date = 'err.required';
    else if (v.departure_date < today) errors.departure_date = 'sleave.errPast';
    else if (v.departure_date > dates.addDays(today, MAX_AHEAD)) errors.departure_date = ['sleave.errAhead', { n: i18n.number(MAX_AHEAD) }];
    if (!final) {
      const out = v.departure_date + 'T' + (v.departure_time || '00:00');
      const back = v.return_date + 'T' + (v.return_time || (v.return_date === v.departure_date ? '23:59' : '00:00'));
      if (!v.return_date) errors.return_date = 'err.required';
      else if (v.departure_date && back <= out) errors.return_date = 'sleave.errOrder';
      else if (v.departure_date && dates.between(v.departure_date, v.return_date) > MAX_NIGHTS) errors.return_date = ['sleave.errLong', { n: i18n.number(MAX_NIGHTS) }];
      if (!errors.departure_date && !errors.return_date) {
        const clash = mine().filter(function (l) {
          return !isFinal(l) && l.status !== 'rejected' && (!editing || l.id !== editing.id) &&
            ((v.departure_date < l.return_date && v.return_date > l.departure_date) || v.departure_date === l.departure_date);
        })[0];
        if (clash) errors.departure_date = ['sleave.errOverlap', { ref: clash.ref }];
      }
      if (!v.destination) errors.destination = 'err.required';
      else if (v.destination.length < 2) errors.destination = 'sleave.errShort';
    }
    if (!v.reason) errors.reason = 'err.required';
    else if (v.reason.length < 10) errors.reason = 'sleave.errReason';
    if (DMS.form.show(formEl, errors)) return;

    const body = final
      ? { type: type, departure_date: v.departure_date, departure_time: v.departure_time || null, reason: v.reason }
      : { type: type, departure_date: v.departure_date, departure_time: v.departure_time || null, return_date: v.return_date, return_time: v.return_time || null, destination: v.destination, reason: v.reason };
    const wasEditing = editing;
    const request = wasEditing ? DMS.api.put('/leave-requests/' + wasEditing.id, body) : DMS.api.post('/leave-requests', body);
    ui.busy(formEl.querySelector('[type="submit"]'), request).then(function (res) {
      ui.closeModal(document.getElementById('leave-modal'));
      return DMS.app.reload().then(function () { ui.toast(t(wasEditing ? 'sleave.toastUpdated' : 'sleave.toastSent', { ref: res.data.ref })); });
    }).catch(ui.failed(formEl));
  }

  function withdraw(l) {
    ui.confirm({ title: t('sleave.withdrawTitle', { ref: l.ref }), message: t('sleave.withdrawText'), confirm: t('sleave.withdraw') }).then(function (ok) {
      if (!ok) return null;
      if (l.status !== 'pending') { list.render(); ui.toast(t('sleave.tooLate', { ref: l.ref }), 'warning'); return null; }
      return DMS.api.del('/leave-requests/' + l.id)
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('sleave.toastWithdrawn', { ref: l.ref }), 'info'); })
        .catch(function (err) { return DMS.app.reload().then(function () { return ui.failed()(err); }); });
    });
  }

  function init() {
    const root = document.getElementById('leave-list');
    list = DMS.list.create({
      root: root,
      items: function () { return mine().filter(function (l) { return DMS.app.term.hasDate(l.departure_date); }); },
      pageSize: 8,
      sort: function (a, b) { return ORDER[a.status] - ORDER[b.status] || (a.departure_date < b.departure_date ? 1 : -1); },
      render: row,
      empty: { icon: 'luggage', title: 'sleave.emptyTitle', text: 'sleave.emptyText' },
    });

    const add = document.getElementById('add-leave');
    add.addEventListener('click', function () { openForm(null); });
    // Without a room the student does not live in the dorm yet, so there is nothing to leave.
    if (!portal.room()) {
      add.disabled = true;
      root.insertAdjacentHTML('beforebegin', '<div class="notice notice--warning">' + icon('key', { size: 18 }) +
        '<div><strong>' + esc(t('sleave.noRoomTitle')) + '</strong>' + esc(t('sleave.noRoomText')) + '</div></div>');
    }
    const formEl = document.getElementById('leave-modal-form');
    formEl.addEventListener('submit', save);
    formEl.addEventListener('change', function (event) { if (event.target.name === 'type') showType(); });
    formEl.elements.departure_date.addEventListener('change', function () {
      const from = formEl.elements.departure_date.value;
      if (from) {
        formEl.elements.return_date.min = from;
        if (!formEl.elements.return_date.value || formEl.elements.return_date.value < from) formEl.elements.return_date.value = from;
      }
      showNights();
    });
    formEl.elements.return_date.addEventListener('change', showNights);

    root.addEventListener('click', function (event) {
      const find = function (attr) { const b = event.target.closest('[' + attr + ']'); return b ? data.find('leaves', b.getAttribute(attr)) : null; };
      let l;
      if ((l = find('data-edit'))) { if (l.status === 'pending') openForm(l); else { list.render(); ui.toast(t('sleave.tooLate', { ref: l.ref }), 'warning'); } }
      else if ((l = find('data-withdraw'))) withdraw(l);
    });

    list.render();
  }

  DMS.app.page({ needs: ['leaves'], init: init, render: function () { list.render(); } });
})(window);
