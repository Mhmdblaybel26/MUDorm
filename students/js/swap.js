/* ==========================================================================
   swap.js — room swap requests.
   A student picks another resident (same gender, different room) and asks
   to exchange rooms. Only one pending request at a time; it can be
   withdrawn until the dorm office decides in manager/room-swaps.html.
   Requests other students made with this student are listed too.
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
  const portal = DMS.portal;

  let list;

  function mine() {
    const id = portal.me().id;
    return data.db.swaps.filter(function (w) { return w.requester_id === id; });
  }
  function pendingRequest() { return mine().filter(function (w) { return w.status === 'pending'; })[0] || null; }

  /** Residents this student could swap with. */
  function candidates() {
    const me = portal.me();
    const room = portal.room();
    if (!room) return [];
    return data.db.students.filter(function (s) {
      if (s.id === me.id || s.status !== 'active' || s.gender !== me.gender) return false;
      const r = data.roomOfStudent(s.id);
      return r && r.id !== room.id && !data.isClosed(r);
    }).map(function (s) { return { student: s, room: data.roomOfStudent(s.id) }; })
      .sort(function (a, b) { return a.room.number < b.room.number ? -1 : a.room.number > b.room.number ? 1 : 0; });
  }

  function side(student, room, labelKey) {
    return '<div class="compare__side"><span class="cell-sub">' + esc(t(labelKey)) + '</span>' +
      ui.person(student) +
      '<span class="compare__room ltr">' + esc(room ? room.number : '—') + '</span>' +
      '<span class="cell-sub">' + (room ? esc(t('wing.' + room.wing)) + ' · ' + esc(t('roomType.' + room.type)) : '') + '</span></div>';
  }

  function drawCompare() {
    const formEl = document.getElementById('swap-form');
    const id = Number(formEl.elements.target_id.value);
    const box = document.getElementById('swap-compare');
    const target = id ? data.find('students', id) : null;
    box.hidden = !target;
    box.innerHTML = target
      ? side(portal.me(), portal.room(), 'sswap.you') +
        '<span class="compare__arrow" aria-hidden="true">' + icon('arrow-left-right', { size: 28 }) + '</span>' +
        side(target, data.roomOfStudent(target.id), 'sswap.them')
      : '';
  }

  /** Fills the form, or locks it with a notice when a request cannot be made now. */
  function drawForm() {
    const formEl = document.getElementById('swap-form');
    const room = portal.room();
    const pending = pendingRequest();
    const options = candidates();
    let notice = '';
    if (!room) notice = ['key', 'warning', 'sswap.noRoomTitle', t('sswap.noRoomText')];
    else if (pending) notice = ['clock', '', 'sswap.pendingTitle', t('sswap.pendingText', { ref: pending.ref })];
    else if (!options.length) notice = ['users', 'warning', 'sswap.noneTitle', t('sswap.noneText')];
    document.getElementById('swap-notice').innerHTML = notice
      ? '<div class="notice' + (notice[1] ? ' notice--' + notice[1] : '') + '">' + icon(notice[0], { size: 18 }) + '<div><strong>' + esc(t(notice[2])) + '</strong>' + esc(notice[3]) + '</div></div>'
      : '';
    const locked = !!notice;
    Array.prototype.forEach.call(formEl.elements, function (el) { el.disabled = locked; });

    const keep = formEl.elements.target_id.value;
    formEl.elements.target_id.innerHTML = '<option value="">' + esc(t('sswap.choose')) + '</option>' +
      options.map(function (o) {
        return '<option value="' + o.student.id + '">' + esc(o.room.number + ' · ' + i18n.name(o.student) + ' · ' + t('roomType.' + o.room.type)) + '</option>';
      }).join('');
    if (options.some(function (o) { return String(o.student.id) === keep; })) formEl.elements.target_id.value = keep;
    drawCompare();
  }

  function row(w) {
    const target = data.find('students', w.target_id);
    const room = data.find('rooms', w.target_room_id);
    return '<tr>' +
      ui.td('sswap.with', ui.person(target, room ? room.number : t('common.noRoom'))) +
      ui.td('common.reason', '<span class="cell-clip" dir="auto">' + esc(ui.tr(w.reason)) + '</span>' +
        (w.note ? '<span class="cell-sub" dir="auto">' + esc(t('sswap.officeNote', { note: ui.tr(w.note) })) + '</span>' : '')) +
      ui.td('common.submitted', '<time datetime="' + esc(w.created_at) + '" title="' + esc(i18n.dateTime(w.created_at)) + '">' + esc(i18n.relative(w.created_at)) + '</time>' +
        '<span class="cell-sub ltr">' + esc(w.ref) + '</span>') +
      ui.td('common.status', ui.badge(w.status)) +
      ui.td('', w.status === 'pending'
        ? '<button type="button" class="btn btn--soft-danger btn--sm" data-withdraw="' + w.id + '" aria-label="' + esc(t('sswap.withdrawLabel', { ref: w.ref })) + '">' + esc(t('sswap.withdraw')) + '</button>'
        : '', 'cell-actions') +
      '</tr>';
  }

  function drawIncoming() {
    const id = portal.me().id;
    const rows = data.db.swaps.filter(function (w) { return w.target_id === id; })
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    document.getElementById('incoming').innerHTML = rows.length
      ? '<ul class="activity">' + rows.map(function (w) {
        const from = data.find('students', w.requester_id);
        const room = data.find('rooms', w.requester_room_id);
        return '<li class="activity__item">' + ui.avatar(from, 'sm') + '<div class="activity__text">' +
          '<p dir="auto">' + esc(t('sswap.incomingText', { name: i18n.name(from), room: i18n.isolate(room ? room.number : '—') })) + '</p>' +
          '<p class="activity__time">' + ui.badge(w.status) + ' · <time datetime="' + esc(w.created_at) + '">' + esc(i18n.relative(w.created_at)) + '</time></p>' +
          (w.status === 'pending' ? '<p class="cell-sub">' + esc(t('sswap.incomingHint')) + '</p>' : '') + '</div></li>';
      }).join('') + '</ul>'
      : ui.empty({ icon: 'swap', title: 'sswap.incomingEmpty', text: 'sswap.incomingEmptyText', compact: true });
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    const target = v.target_id ? data.find('students', v.target_id) : null;
    if (!target) errors.target_id = 'sswap.errTarget';
    if (!v.reason) errors.reason = 'err.required';
    else if (v.reason.length < 15) errors.reason = 'sswap.errReason';
    if (DMS.form.show(formEl, errors)) return;
    if (pendingRequest()) { render(); return; }

    // Laravel checks the two rooms again and notifies the other resident.
    ui.busy(formEl.querySelector('[type="submit"]'), DMS.api.post('/room-swaps', { target_id: target.id, reason: v.reason }))
      .then(function (res) {
        formEl.reset();
        return DMS.app.reload().then(function () { ui.toast(t('sswap.toastSent', { ref: res.data.ref })); });
      })
      .catch(ui.failed(formEl));
  }

  function withdraw(w) {
    ui.confirm({ title: t('sswap.withdrawTitle', { ref: w.ref }), message: t('sswap.withdrawText'), confirm: t('sswap.withdraw') }).then(function (ok) {
      if (!ok) return null;
      if (w.status !== 'pending') { render(); ui.toast(t('sswap.tooLate', { ref: w.ref }), 'warning'); return null; }
      return DMS.api.del('/room-swaps/' + w.id)
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('sswap.toastWithdrawn', { ref: w.ref }), 'info'); })
        .catch(function (err) { return DMS.app.reload().then(function () { return ui.failed()(err); }); });
    });
  }

  function render() {
    drawForm();
    list.render();
    drawIncoming();
  }

  function init() {
    const root = document.getElementById('swap-list');
    list = DMS.list.create({
      root: root,
      items: function () { return mine().filter(function (w) { return DMS.app.term.hasDate(w.created_at); }); },
      pageSize: 5,
      sort: function (a, b) { return a.created_at < b.created_at ? 1 : -1; },
      render: row,
      empty: { icon: 'swap', title: 'sswap.emptyTitle', text: 'sswap.emptyText' },
    });
    const formEl = document.getElementById('swap-form');
    formEl.addEventListener('submit', save);
    formEl.elements.target_id.addEventListener('change', drawCompare);
    root.addEventListener('click', function (event) {
      const b = event.target.closest('[data-withdraw]');
      if (b) withdraw(data.find('swaps', b.getAttribute('data-withdraw')));
    });
    render();
  }

  DMS.app.page({ needs: ['swaps'], init: init, render: render });
})(window);
