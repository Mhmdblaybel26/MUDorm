/* ==========================================================================
   complaints.js — maintenance and complaint tickets.
   Update the status (Pending / In progress / Resolved), assign a technician
   and add notes. Laravel writes every change to the ticket history, which the
   student also sees in their portal, and notifies the student. Technicians
   are managed on the Settings page.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;

  const CATEGORY_ICONS = { plumbing: 'droplet', electricity: 'zap', noise: 'volume', other: 'help' };
  const ORDER = { pending: 0, in_progress: 1, resolved: 2 };
  let list;
  let drawChips;
  let current = null;

  function items() {
    // Tickets opened in the academic year and semester chosen in the console.
    return data.db.complaints.filter(function (c) { return DMS.app.term.hasDate(c.created_at); }).sort(function (a, b) {
      return ORDER[a.status] - ORDER[b.status] || (a.created_at < b.created_at ? 1 : -1);
    });
  }

  function techName(id) {
    const tech = id ? data.find('technicians', id) : null;
    return tech ? i18n.name(tech) : '';
  }

  function category(c) {
    return '<span class="person"><span class="tile tile--sm tile--neutral">' + ui.icon(CATEGORY_ICONS[c.category], { size: 16 }) + '</span>' +
      '<span class="person__text"><span class="cell-main ltr">' + esc(c.ref) + '</span><span class="cell-sub">' + esc(t('category.' + c.category)) + '</span></span></span>';
  }

  function row(c) {
    const s = data.find('students', c.student_id);
    const room = data.find('rooms', c.room_id);
    return (
      '<tr>' +
      ui.td('complaints.ticket', category(c)) +
      ui.td('common.student', '<span class="cell-main" dir="auto">' + esc(i18n.name(s)) + '</span><span class="cell-sub">' + (room ? '<span class="ltr">' + esc(room.number) + '</span>' : esc(t('common.noRoom'))) + '</span>') +
      ui.td('complaints.description', '<span class="cell-clip" dir="auto">' + esc(ui.tr(c.description)) + '</span>') +
      ui.td('complaints.technician', c.technician_id ? esc(techName(c.technician_id)) : '<span class="muted">' + esc(t('complaints.unassigned')) + '</span>') +
      ui.td('complaints.updated', '<time datetime="' + esc(c.updated_at) + '" title="' + esc(i18n.dateTime(c.updated_at)) + '">' + esc(i18n.relative(c.updated_at)) + '</time>') +
      ui.td('common.status', ui.badge(c.status)) +
      ui.td('', '<button type="button" class="btn btn--secondary btn--sm" data-manage="' + c.id + '" aria-label="' + esc(t('complaints.manageLabel', { ref: c.ref })) + '">' + esc(t('complaints.manage')) + '</button>', 'cell-actions') +
      '</tr>'
    );
  }

  const noteText = ui.noteText;

  function fillModal(c) {
    current = c;
    const s = data.find('students', c.student_id);
    const room = data.find('rooms', c.room_id);
    document.getElementById('ticket-modal-title').textContent = t('complaints.modalTitle', { ref: c.ref });
    document.getElementById('ticket-modal-sub').innerHTML = esc(t('category.' + c.category)) + ' · ' + esc(t('complaints.opened', { when: i18n.relative(c.created_at) })) + ' · ' + ui.badge(c.status);
    document.getElementById('ticket-details').innerHTML =
      '<div class="details__item"><dt>' + esc(t('common.student')) + '</dt><dd dir="auto">' + esc(i18n.name(s)) + '</dd></div>' +
      '<div class="details__item"><dt>' + esc(t('common.room')) + '</dt><dd>' + (room ? '<span class="ltr">' + esc(room.number) + '</span> · ' + esc(t('wing.' + room.wing)) : esc(t('common.noRoom'))) + '</dd></div>' +
      '<div class="details__item"><dt>' + esc(t('complaints.contact')) + '</dt><dd>' + ui.mailLink(s.email) + '<br>' + ui.telLink(s.phone) + '</dd></div>' +
      '<div class="details__item"><dt>' + esc(t('complaints.photo')) + '</dt><dd>' +
      (c.image ? '<img class="thumb" src="' + esc(c.image) + '" alt="' + esc(t('complaints.photoAlt', { ref: c.ref })) + '">' : '<span class="muted">' + esc(t('complaints.noPhoto')) + '</span>') + '</dd></div>' +
      '<div class="details__item details__item--full"><dt>' + esc(t('complaints.description')) + '</dt><dd dir="auto">' + esc(ui.tr(c.description)) + '</dd></div>';

    const created = { at: c.created_at, key: 'complaints.noteCreated' };
    document.getElementById('ticket-timeline').innerHTML = [created].concat(c.notes).map(function (n) {
      return '<li class="timeline__item"><p dir="auto">' + esc(noteText(n)) + '</p>' +
        '<p class="timeline__meta"><time datetime="' + esc(n.at) + '">' + esc(i18n.dateTime(n.at)) + '</time></p></li>';
    }).join('');

    document.getElementById('ticket-tech').innerHTML =
      '<option value="">' + esc(t('complaints.unassigned')) + '</option>' +
      data.db.technicians.map(function (tech) {
        return '<option value="' + tech.id + '"' + (tech.id === c.technician_id ? ' selected' : '') + '>' +
          esc(i18n.name(tech) + ' · ' + t('specialty.' + tech.specialty)) + '</option>';
      }).join('');
    const formEl = document.getElementById('ticket-form');
    formEl.elements.status.value = c.status;
    formEl.elements.note.value = '';
    DMS.form.clear(formEl);
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const c = current;
    const v = DMS.form.values(formEl);
    const techId = v.technician_id ? Number(v.technician_id) : null;
    const errors = {};
    if (v.status === 'resolved' && c.status !== 'resolved' && !v.note) errors.note = 'complaints.errResolveNote';
    if (DMS.form.show(formEl, errors)) return;

    if (techId === c.technician_id && v.status === c.status && !v.note) {
      ui.closeModal(document.getElementById('ticket-modal'));
      return;
    }
    // Laravel writes the history (assignment, status, note) and notifies the student.
    ui.busy(formEl.querySelector('[type="submit"]'), DMS.api.put('/maintenance/' + c.id, { status: v.status, technician_id: techId, note: v.note || null }))
      .then(function () {
        ui.closeModal(document.getElementById('ticket-modal'));
        return DMS.app.reload();
      })
      .then(function () { ui.toast(t('complaints.toastSaved', { ref: c.ref })); })
      .catch(ui.failed(formEl));
  }
  function init() {
    const root = document.getElementById('ticket-list');
    list = DMS.list.create({
      root: root,
      items: items,
      pageSize: 8,
      search: function (c) {
        const s = data.find('students', c.student_id);
        const r = data.find('rooms', c.room_id);
        return [c.ref, c.description, s.name, s.name_ar, r ? r.number : '', techName(c.technician_id), t('category.' + c.category)];
      },
      filters: {
        status: function (c, v) { return c.status === v; },
        category: function (c, v) { return c.category === v; },
      },
      render: row,
      empty: { icon: 'wrench', title: 'complaints.emptyTitle', text: 'complaints.emptyText' },
      onRender: function () { drawChips(); },
    });
    drawChips = ui.statusChips(document.getElementById('status-chips'), list, ['pending', 'in_progress', 'resolved'], items);

    root.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-manage]');
      if (!btn) return;
      fillModal(data.find('complaints', btn.getAttribute('data-manage')));
      ui.openModal(document.getElementById('ticket-modal'));
    });
    document.getElementById('ticket-form').addEventListener('submit', save);
    list.render();
  }

  function render() {
    list.render();
    const modal = document.getElementById('ticket-modal');
    if (modal.open && current) {
      const formEl = document.getElementById('ticket-form');
      const keep = DMS.form.values(formEl);
      fillModal(data.find('complaints', current.id) || current);
      DMS.form.fill(formEl, keep);
    }
  }

  DMS.app.page({ needs: ['complaints', 'technicians', 'students', 'rooms'], init: init, render: render });
})(window);
