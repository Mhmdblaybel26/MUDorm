/* ==========================================================================
   leave-requests.js — leave and departure requests from residents.
   Two kinds:
   - temporary: leaving or coming back outside the gate hours, or nights away
   - final: leaving the dormitory for good; approving it ends the stay on the
     departure day (Laravel frees the bed)
   Approve or reject with an optional note; the student is notified.
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
    // Pending first, soonest departure on top; decided requests newest first.
    // Only departures in the academic year and semester chosen in the console.
    return data.db.leaves.filter(function (l) { return DMS.app.term.hasDate(l.departure_date); }).sort(function (a, b) {
      if (a.status !== b.status) return ORDER[a.status] - ORDER[b.status];
      const earlier = a.departure_date < b.departure_date ? -1 : 1;
      return a.status === 'pending' ? earlier : -earlier;
    });
  }

  function isFinal(l) { return l.type === 'final'; }
  function nights(l) { return isFinal(l) ? 0 : data.dates.between(l.departure_date, l.return_date); }
  function at(day, time) { return i18n.date(day, 'short') + (time ? ' ' + i18n.time(time) : ''); }

  function datesCell(l) {
    if (isFinal(l)) {
      return '<span class="cell-main nowrap">' + esc(t('leaves.finalFrom', { date: i18n.date(l.departure_date, 'short') })) + '</span>' +
        '<span class="cell-sub"><span class="badge badge--danger badge--plain">' + esc(t('leaves.typeFinal')) + '</span> · ' + esc(i18n.relative(l.departure_date)) + '</span>';
    }
    return '<span class="cell-main nowrap">' + esc(t('leaves.range', { from: at(l.departure_date, l.departure_time), to: at(l.return_date, l.return_time) })) + '</span>' +
      '<span class="cell-sub">' + esc(nights(l) ? t('leaves.nights', { n: i18n.number(nights(l)) }) : t('leaves.sameDay')) + ' · ' + esc(i18n.relative(l.departure_date)) + '</span>';
  }

  function row(l) {
    const s = data.find('students', l.student_id);
    const room = s ? data.roomOfStudent(s.id) : null;
    return (
      '<tr>' +
      ui.td('common.student', ui.person(s, room ? room.number : t('common.noRoom'))) +
      ui.td('leaves.dates', datesCell(l)) +
      ui.td('leaves.destination', l.destination ? '<span dir="auto">' + esc(ui.tr(l.destination)) + '</span>' : '<span class="muted">—</span>') +
      ui.td('common.reason', '<span class="cell-clip" dir="auto">' + esc(ui.tr(l.reason)) + '</span>') +
      ui.td('common.status', ui.badge(l.status)) +
      ui.td('', '<button type="button" class="btn btn--secondary btn--sm" data-review="' + l.id + '" aria-label="' + esc(t('leaves.reviewLabel', { name: i18n.name(s) })) + '">' +
        esc(t(l.status === 'pending' ? 'leaves.review' : 'common.view')) + '</button>', 'cell-actions') +
      '</tr>'
    );
  }

  function item(label, html, full) {
    return '<div class="details__item' + (full ? ' details__item--full' : '') + '"><dt>' + esc(label) + '</dt><dd>' + html + '</dd></div>';
  }

  function fillModal(l) {
    current = l;
    const s = data.find('students', l.student_id);
    const room = s ? data.roomOfStudent(s.id) : null;
    const full = function (day, time) { return esc(i18n.date(day, 'full')) + (time ? ' · ' + esc(i18n.time(time)) : ''); };
    document.getElementById('leave-modal-title').textContent = t('leaves.modalTitle', { name: i18n.name(s) });
    document.getElementById('leave-modal-sub').innerHTML = '<span class="ltr">' + esc(l.ref) + '</span> · ' + esc(t('apps.submittedOn', { date: i18n.dateTime(l.created_at) })) + ' · ' + ui.badge(l.status);
    document.getElementById('leave-details').innerHTML =
      item(t('leaves.type'), esc(t(isFinal(l) ? 'leaves.typeFinal' : 'leaves.typeTemporary'))) +
      item(t('common.room'), ui.roomCode(room)) +
      item(t('complaints.contact'), s ? ui.telLink(s.phone) : '') +
      item(t('leaves.departure'), full(l.departure_date, l.departure_time)) +
      (isFinal(l) ? '' :
        item(t('leaves.return'), full(l.return_date, l.return_time)) +
        item(t('leaves.duration'), esc(nights(l) ? t('leaves.nights', { n: i18n.number(nights(l)) }) : t('leaves.sameDay')))) +
      item(t('leaves.destination'), l.destination ? '<span dir="auto">' + esc(ui.tr(l.destination)) + '</span>' : '—') +
      item(t('common.reason'), '<span dir="auto">' + esc(ui.tr(l.reason)) + '</span>', true);

    const decision = document.getElementById('leave-decision');
    const foot = document.getElementById('leave-foot');
    if (l.status === 'pending') {
      decision.innerHTML = (isFinal(l)
        ? '<div class="notice notice--warning">' + ui.icon('door', { size: 18 }) + '<div><strong>' + esc(t('leaves.finalTitle')) + '</strong>' +
          esc(t(room ? 'leaves.finalText' : 'leaves.finalNoRoom', { room: room ? room.number : '', date: i18n.date(l.departure_date, 'medium') })) + '</div></div>'
        : '') +
        '<div class="field"><label class="field__label" for="leave-note">' + esc(t('common.noteOptional')) + '</label>' +
        '<textarea class="control" id="leave-note" name="note" maxlength="300" dir="auto" aria-describedby="leave-note-hint"></textarea>' +
        '<p class="field__hint" id="leave-note-hint">' + esc(t('leaves.noteHint')) + '</p></div>';
      foot.innerHTML = '<button type="button" class="btn btn--ghost" data-close>' + esc(t('common.close')) + '</button>' +
        '<div class="modal__foot-group">' +
        '<button type="button" class="btn btn--soft-danger" data-decide="rejected">' + ui.icon('x-circle', { size: 16 }) + esc(t('common.reject')) + '</button>' +
        '<button type="button" class="btn btn--success" data-decide="approved">' + ui.icon('check-circle', { size: 16 }) + esc(t('common.approve')) + '</button></div>';
    } else {
      decision.innerHTML = '<div class="notice ' + (l.status === 'approved' ? 'notice--success' : 'notice--danger') + '">' +
        ui.icon(l.status === 'approved' ? 'check-circle' : 'x-circle', { size: 18 }) +
        '<div><strong>' + esc(t('common.decidedOn', { date: i18n.date(l.decided_at, 'medium') })) + '</strong>' +
        '<span dir="auto">' + esc(ui.tr(l.note || t('leaves.noNote'))) + '</span></div></div>';
      foot.innerHTML = '<span></span><button type="button" class="btn btn--primary" data-close>' + esc(t('common.close')) + '</button>';
    }
  }

  function decide(status) {
    const l = current;
    const s = data.find('students', l.student_id);
    const formEl = document.getElementById('leave-form');
    const note = DMS.form.values(formEl).note || '';
    const button = document.querySelector('[data-decide="' + status + '"]');
    ui.busy(button, DMS.api.post('/leave-requests/' + l.id + '/decision', { status: status, note: note || null }))
      .then(function () {
        ui.closeModal(document.getElementById('leave-modal'));
        return DMS.app.reload();
      })
      .then(function () {
        ui.toast(t(status === 'approved' ? 'leaves.toastApproved' : 'leaves.toastRejected', { name: i18n.name(s) }), status === 'approved' ? 'success' : 'info');
      })
      .catch(ui.failed(formEl));
  }

  function init() {
    const root = document.getElementById('leave-list');
    const today = data.dates.today();
    list = DMS.list.create({
      root: root,
      items: items,
      pageSize: 8,
      search: function (l) { const s = data.find('students', l.student_id); return [l.ref, s ? s.name : '', s ? s.name_ar : '', l.destination, l.reason, t(isFinal(l) ? 'leaves.typeFinal' : 'leaves.typeTemporary')]; },
      filters: {
        status: function (l, v) { return l.status === v; },
        when: function (l, v) { const last = l.return_date || l.departure_date; return v === 'upcoming' ? last >= today : last < today; },
      },
      render: row,
      empty: { icon: 'luggage', title: 'leaves.emptyTitle', text: 'leaves.emptyText' },
      onRender: function () { drawChips(); },
    });
    drawChips = ui.statusChips(document.getElementById('status-chips'), list, ['pending', 'approved', 'rejected'], items);

    root.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-review]');
      if (!btn) return;
      fillModal(data.find('leaves', btn.getAttribute('data-review')));
      ui.openModal(document.getElementById('leave-modal'));
    });
    document.getElementById('leave-foot').addEventListener('click', function (event) {
      const btn = event.target.closest('[data-decide]');
      if (btn) decide(btn.getAttribute('data-decide'));
    });
    document.getElementById('leave-form').addEventListener('submit', function (event) { event.preventDefault(); });
    list.render();
  }

  function render() {
    list.render();
    const modal = document.getElementById('leave-modal');
    if (modal.open && current) {
      const note = modal.querySelector('#leave-note');
      const kept = note ? note.value : '';
      fillModal(data.find('leaves', current.id) || current);
      const again = modal.querySelector('#leave-note');
      if (again) again.value = kept;
    }
  }

  DMS.app.page({ needs: ['leaves', 'students', 'rooms', 'allocations'], init: init, render: render });
})(window);
