/* ==========================================================================
   room-swaps.js — requests from two residents to exchange rooms.
   Approving swaps their active allocations (capacity does not change).
   The swap is refused if either student has changed room since the request,
   or if either room is under maintenance.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;

  const ORDER = { pending: 0, approved: 1, rejected: 2 };
  let list;
  let drawChips;
  let current = null;

  function items() {
    // Requests made in the academic year and semester chosen in the console.
    return data.db.swaps.filter(function (w) { return DMS.app.term.hasDate(w.created_at); }).sort(function (a, b) {
      return ORDER[a.status] - ORDER[b.status] || (a.created_at < b.created_at ? 1 : -1);
    });
  }

  function roomNumber(id) { const r = data.find('rooms', id); return r ? r.number : t('common.noRoom'); }

  function row(sw) {
    const a = data.find('students', sw.requester_id);
    const b = data.find('students', sw.target_id);
    return (
      '<tr>' +
      ui.td('swaps.requester', ui.person(a, roomNumber(sw.requester_room_id))) +
      ui.td('swaps.target', ui.person(b, roomNumber(sw.target_room_id))) +
      ui.td('common.reason', '<span class="cell-clip" dir="auto">' + esc(ui.tr(sw.reason)) + '</span>') +
      ui.td('common.submitted', '<time datetime="' + esc(sw.created_at) + '">' + esc(i18n.relative(sw.created_at)) + '</time>') +
      ui.td('common.status', ui.badge(sw.status)) +
      ui.td('', '<button type="button" class="btn btn--secondary btn--sm" data-review="' + sw.id + '" aria-label="' + esc(t('swaps.reviewLabel', { ref: sw.ref })) + '">' +
        esc(t(sw.status === 'pending' ? 'leaves.review' : 'common.view')) + '</button>', 'cell-actions') +
      '</tr>'
    );
  }

  function side(student, roomId, labelKey) {
    const room = data.find('rooms', roomId);
    return '<div class="compare__side"><span class="cell-sub">' + esc(t(labelKey)) + '</span>' +
      ui.person(student) +
      '<span class="compare__room ltr">' + esc(room ? room.number : '—') + '</span>' +
      '<span class="cell-sub">' + (room ? esc(t('wing.' + room.wing)) + ' · ' + esc(t('roomType.' + room.type)) : '') + '</span></div>';
  }

  /** Returns an i18n key when the swap can no longer be applied, otherwise null. */
  function problem(sw) {
    const a = data.allocationOf(sw.requester_id);
    const b = data.allocationOf(sw.target_id);
    if (!a || !b) return 'swaps.errNoRoom';
    if (a.room_id !== sw.requester_room_id || b.room_id !== sw.target_room_id) return 'swaps.errMoved';
    const ra = data.find('rooms', a.room_id);
    const rb = data.find('rooms', b.room_id);
    if (data.isClosed(ra) || data.isClosed(rb)) return 'swaps.errMaintenance';
    return null;
  }

  function fillModal(sw) {
    current = sw;
    const a = data.find('students', sw.requester_id);
    const b = data.find('students', sw.target_id);
    document.getElementById('swap-modal-title').textContent = t('swaps.modalTitle');
    document.getElementById('swap-modal-sub').innerHTML = '<span class="ltr">' + esc(sw.ref) + '</span> · ' + esc(t('apps.submittedOn', { date: i18n.dateTime(sw.created_at) })) + ' · ' + ui.badge(sw.status);
    document.getElementById('swap-compare').innerHTML =
      side(a, sw.requester_room_id, 'swaps.requester') +
      '<span class="compare__arrow" aria-hidden="true">' + ui.icon('arrow-left-right', { size: 28 }) + '</span>' +
      side(b, sw.target_room_id, 'swaps.target');
    document.getElementById('swap-details').innerHTML =
      '<div class="details__item details__item--full"><dt>' + esc(t('common.reason')) + '</dt><dd dir="auto">' + esc(ui.tr(sw.reason)) + '</dd></div>';

    const err = document.getElementById('swap-error');
    const issue = sw.status === 'pending' ? problem(sw) : null;
    err.hidden = !issue;
    err.innerHTML = issue ? ui.icon('alert', { size: 18 }) + '<div><strong>' + esc(t('swaps.errTitle')) + '</strong>' + esc(t(issue)) + '</div>' : '';

    const decision = document.getElementById('swap-decision');
    const foot = document.getElementById('swap-foot');
    if (sw.status === 'pending') {
      decision.innerHTML = '<div class="field"><label class="field__label" for="swap-note">' + esc(t('common.noteOptional')) + '</label>' +
        '<textarea class="control" id="swap-note" name="note" maxlength="300" dir="auto" aria-describedby="swap-note-hint"></textarea>' +
        '<p class="field__hint" id="swap-note-hint">' + esc(t('swaps.noteHint')) + '</p></div>';
      foot.innerHTML = '<button type="button" class="btn btn--ghost" data-close>' + esc(t('common.close')) + '</button>' +
        '<div class="modal__foot-group">' +
        '<button type="button" class="btn btn--soft-danger" data-decide="rejected">' + ui.icon('x-circle', { size: 16 }) + esc(t('common.reject')) + '</button>' +
        '<button type="button" class="btn btn--success" data-decide="approved"' + (issue ? ' disabled' : '') + '>' + ui.icon('check-circle', { size: 16 }) + esc(t('swaps.approve')) + '</button></div>';
    } else {
      decision.innerHTML = '<div class="notice ' + (sw.status === 'approved' ? 'notice--success' : 'notice--danger') + '">' +
        ui.icon(sw.status === 'approved' ? 'check-circle' : 'x-circle', { size: 18 }) +
        '<div><strong>' + esc(t('common.decidedOn', { date: i18n.date(sw.decided_at, 'medium') })) + '</strong>' +
        '<span dir="auto">' + esc(ui.tr(sw.note || t('leaves.noNote'))) + '</span></div></div>';
      foot.innerHTML = '<span></span><button type="button" class="btn btn--primary" data-close>' + esc(t('common.close')) + '</button>';
    }
  }

  function decide(status) {
    const sw = current;
    const a = data.find('students', sw.requester_id);
    const b = data.find('students', sw.target_id);
    if (status === 'approved' && problem(sw)) { fillModal(sw); return; }
    const formEl = document.getElementById('swap-form');
    const note = DMS.form.values(formEl).note || '';
    // Laravel checks again that neither student moved, exchanges the rooms and notifies both.
    ui.busy(document.querySelector('[data-decide="' + status + '"]'), DMS.api.post('/room-swaps/' + sw.id + '/decision', { status: status, note: note || null }))
      .then(function () {
        ui.closeModal(document.getElementById('swap-modal'));
        return DMS.app.reload();
      })
      .then(function () {
        ui.toast(t(status === 'approved' ? 'swaps.toastApproved' : 'swaps.toastRejected', { a: i18n.name(a), b: i18n.name(b) }), status === 'approved' ? 'success' : 'info');
      })
      .catch(ui.failed(formEl)).catch(function () { return DMS.app.reload(); });
  }

  function init() {
    const root = document.getElementById('swap-list');
    list = DMS.list.create({
      root: root,
      items: items,
      pageSize: 8,
      search: function (sw) {
        const a = data.find('students', sw.requester_id);
        const b = data.find('students', sw.target_id);
        return [sw.ref, a.name, a.name_ar, b.name, b.name_ar, roomNumber(sw.requester_room_id), roomNumber(sw.target_room_id), sw.reason];
      },
      filters: { status: function (sw, v) { return sw.status === v; } },
      render: row,
      empty: { icon: 'swap', title: 'swaps.emptyTitle', text: 'swaps.emptyText' },
      onRender: function () { drawChips(); },
    });
    drawChips = ui.statusChips(document.getElementById('status-chips'), list, ['pending', 'approved', 'rejected'], items);

    root.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-review]');
      if (!btn) return;
      fillModal(data.find('swaps', btn.getAttribute('data-review')));
      ui.openModal(document.getElementById('swap-modal'));
    });
    document.getElementById('swap-foot').addEventListener('click', function (event) {
      const btn = event.target.closest('[data-decide]');
      if (btn && !btn.disabled) decide(btn.getAttribute('data-decide'));
    });
    document.getElementById('swap-form').addEventListener('submit', function (event) { event.preventDefault(); });
    list.render();
  }

  function render() {
    list.render();
    const modal = document.getElementById('swap-modal');
    if (modal.open && current) {
      const note = modal.querySelector('#swap-note');
      const kept = note ? note.value : '';
      fillModal(data.find('swaps', current.id) || current);
      const again = modal.querySelector('#swap-note');
      if (again) again.value = kept;
    }
  }

  DMS.app.page({ needs: ['swaps', 'students', 'rooms', 'allocations'], init: init, render: render });
})(window);
