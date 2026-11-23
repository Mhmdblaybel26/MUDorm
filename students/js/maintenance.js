/* ==========================================================================
   maintenance.js — maintenance and complaint portal.
   Students open tickets (plumbing, electricity, noise, other) with a
   description and an optional photo, follow each ticket's status and
   history, and can edit or withdraw a ticket while it is still pending.
   The dorm office manages the same tickets in manager/complaints.html.
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

  const CATEGORIES = ['plumbing', 'electricity', 'noise', 'other'];
  const CATEGORY_ICONS = { plumbing: 'droplet', electricity: 'zap', noise: 'volume', other: 'help' };
  const STEPS = ['pending', 'in_progress', 'resolved'];
  let list;
  let drawChips;
  let editing = null;
  let photo = null;

  function mine() {
    const id = portal.me().id;
    return data.db.complaints.filter(function (c) { return c.student_id === id; });
  }
  function techName(id) {
    const tech = id ? data.find('technicians', id) : null;
    return tech ? i18n.name(tech) : '';
  }

  function steps(c) {
    const reached = STEPS.indexOf(c.status);
    return '<ol class="steps-bar" aria-label="' + esc(t('smaint.progressLabel', { status: t('status.' + c.status) })) + '">' +
      STEPS.map(function (s, i) {
        return '<li' + (i <= reached ? ' class="is-done"' : '') + '>' + esc(t('smaint.step.' + s)) + '</li>';
      }).join('') + '</ol>';
  }

  function ticketCard(c) {
    const pending = c.status === 'pending';
    const tech = techName(c.technician_id);
    return '<li class="ticket">' +
      '<div class="ticket__head"><span class="person"><span class="tile tile--sm tile--neutral">' + icon(CATEGORY_ICONS[c.category], { size: 16 }) + '</span>' +
      '<span class="person__text"><span class="cell-main ltr">' + esc(c.ref) + '</span><span class="cell-sub">' + esc(t('category.' + c.category)) + ' · ' +
      '<time datetime="' + esc(c.created_at) + '" title="' + esc(i18n.dateTime(c.created_at)) + '">' + esc(t('smaint.opened', { when: i18n.relative(c.created_at) })) + '</time></span></span></span>' +
      ui.badge(c.status) + '</div>' +
      '<p class="ticket__desc" dir="auto">' + esc(ui.tr(c.description)) + '</p>' +
      (c.image ? '<div class="ticket__photo"><img src="' + esc(c.image) + '" alt="' + esc(t('smaint.photoAlt', { ref: c.ref })) + '"></div>' : '') +
      steps(c) +
      '<p class="cell-sub">' + esc(tech ? t('smaint.assignedTo', { name: tech }) : t('smaint.notAssigned')) + ' · ' +
      esc(t('smaint.updated', { when: i18n.relative(c.updated_at) })) + '</p>' +
      '<div class="ticket__actions">' +
      '<button type="button" class="btn btn--secondary btn--sm" data-view="' + c.id + '" aria-label="' + esc(t('smaint.viewLabel', { ref: c.ref })) + '">' + icon('eye', { size: 16 }) + esc(t('smaint.view')) + '</button>' +
      (pending
        ? '<button type="button" class="btn btn--ghost btn--sm" data-edit="' + c.id + '" aria-label="' + esc(t('smaint.editLabel', { ref: c.ref })) + '">' + icon('edit', { size: 16 }) + esc(t('common.edit')) + '</button>' +
          '<button type="button" class="btn btn--soft-danger btn--sm" data-withdraw="' + c.id + '" aria-label="' + esc(t('smaint.withdrawLabel', { ref: c.ref })) + '">' + icon('trash', { size: 16 }) + esc(t('smaint.withdraw')) + '</button>'
        : '') +
      '</div></li>';
  }

  function drawNotice() {
    const room = portal.room();
    const open = mine().filter(function (c) { return c.status !== 'resolved'; }).length;
    document.getElementById('add-ticket').disabled = !room;
    document.getElementById('maint-notice').innerHTML = !room
      ? '<div class="notice notice--warning">' + icon('key', { size: 18 }) + '<div><strong>' + esc(t('smaint.noRoomTitle')) + '</strong>' + esc(t('smaint.noRoomText')) + '</div></div>'
      : '<div class="notice">' + icon('info', { size: 18 }) + '<div>' + esc(t('smaint.notice', { n: i18n.number(open), room: i18n.isolate(room.number) })) + '</div></div>';
  }

  /* ---- Photo ---- */
  function showPhoto() {
    document.getElementById('tk-photo-preview').innerHTML = photo
      ? '<img src="' + esc(photo) + '" alt="' + esc(t('smaint.photoPreview')) + '">'
      : icon('image', { size: 24 });
    document.getElementById('tk-photo-remove').hidden = !photo;
  }

  /* ---- Create / edit ---- */
  function openForm(c) {
    editing = c || null;
    photo = c ? c.image : null;
    const formEl = document.getElementById('ticket-modal-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('ticket-title').textContent = c ? t('smaint.editTitle', { ref: c.ref }) : t('smaint.newTitle');
    document.getElementById('tk-categories').innerHTML = CATEGORIES.map(function (cat) {
      return '<label class="radio"><input type="radio" name="category" value="' + cat + '"' + (c && c.category === cat ? ' checked' : '') + '>' +
        icon(CATEGORY_ICONS[cat], { size: 16 }) + '<span>' + esc(t('category.' + cat)) + '</span></label>';
    }).join('');
    formEl.elements.description.value = c ? c.description : '';
    const room = portal.room();
    document.getElementById('tk-room').textContent = room ? t('smaint.roomHint', { room: i18n.isolate(room.number), wing: t('wing.' + room.wing) }) : '';
    showPhoto();
    ui.openModal(document.getElementById('ticket-modal'));
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (!v.category) errors.category = 'smaint.errCategory';
    if (!v.description) errors.description = 'err.required';
    else if (v.description.length < 15) errors.description = 'smaint.errShort';
    if (DMS.form.show(formEl, errors)) return;

    const wasEditing = editing;
    const photoChanged = wasEditing ? wasEditing.image !== photo : !!photo;
    if (wasEditing && !photoChanged && wasEditing.category === v.category && wasEditing.description === v.description) {
      ui.closeModal(document.getElementById('ticket-modal'));
      return;
    }
    // A new photo travels as a file; Laravel checks its type and size and records the change in the history.
    const values = { category: v.category, description: v.description };
    if (wasEditing && photoChanged && !photo) values.remove_image = true;
    const body = DMS.api.form(values, photoChanged && photo ? { image: photo } : null);
    ui.busy(formEl.querySelector('[type="submit"]'), DMS.api.post(wasEditing ? '/maintenance/' + wasEditing.id : '/maintenance', body))
      .then(function (res) {
        ui.closeModal(document.getElementById('ticket-modal'));
        return DMS.app.reload().then(function () { ui.toast(t(wasEditing ? 'smaint.toastUpdated' : 'smaint.toastSent', { ref: res.data.ref })); });
      })
      .catch(ui.failed(formEl));
  }

  /* ---- Details ---- */
  function view(c) {
    const room = data.find('rooms', c.room_id);
    document.getElementById('view-title').textContent = t('smaint.viewTitle', { ref: c.ref });
    document.getElementById('view-sub').innerHTML = esc(t('category.' + c.category)) + ' · ' + ui.badge(c.status);
    const history = [{ at: c.created_at, key: 'smaint.noteCreated' }].concat(c.notes);
    document.getElementById('view-body').innerHTML =
      steps(c) +
      '<dl class="details">' +
      '<div class="details__item"><dt>' + esc(t('common.room')) + '</dt><dd>' + (room ? '<span class="ltr">' + esc(room.number) + '</span> · ' + esc(t('wing.' + room.wing)) : esc(t('common.noRoom'))) + '</dd></div>' +
      '<div class="details__item"><dt>' + esc(t('smaint.technician')) + '</dt><dd>' + esc(techName(c.technician_id) || t('smaint.notAssigned')) + '</dd></div>' +
      '<div class="details__item details__item--full"><dt>' + esc(t('smaint.describe')) + '</dt><dd dir="auto">' + esc(ui.tr(c.description)) + '</dd></div>' +
      (c.image ? '<div class="details__item details__item--full"><dt>' + esc(t('smaint.photo')) + '</dt><dd><img class="thumb" src="' + esc(c.image) + '" alt="' + esc(t('smaint.photoAlt', { ref: c.ref })) + '"></dd></div>' : '') +
      '</dl>' +
      '<h3 class="field__label">' + esc(t('smaint.history')) + '</h3>' +
      '<ol class="timeline">' + history.map(function (n) {
        return '<li class="timeline__item"><p dir="auto">' + esc(ui.noteText(n)) + '</p>' +
          '<p class="timeline__meta"><time datetime="' + esc(n.at) + '">' + esc(i18n.dateTime(n.at)) + '</time> · ' +
          esc(t(n.by === 'student' ? 'smaint.byYou' : 'smaint.byOffice')) + '</p></li>';
      }).join('') + '</ol>';
    ui.openModal(document.getElementById('view-modal'));
  }

  function withdraw(c) {
    ui.confirm({ title: t('smaint.withdrawTitle', { ref: c.ref }), message: t('smaint.withdrawText'), confirm: t('smaint.withdraw') }).then(function (ok) {
      if (!ok) return null;
      // The office may have picked it up while the dialog was open: Laravel refuses then.
      return DMS.api.del('/maintenance/' + c.id)
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('smaint.toastWithdrawn', { ref: c.ref }), 'info'); })
        .catch(function (err) { return DMS.app.reload().then(function () { return ui.failed()(err); }); });
    });
  }

  function render() {
    drawNotice();
    list.render();
  }

  function init() {
    const root = document.getElementById('ticket-list');
    list = DMS.list.create({
      root: root,
      items: function () { return mine().filter(function (c) { return DMS.app.term.hasDate(c.created_at); }); },
      pageSize: 6,
      sort: function (a, b) { return a.created_at < b.created_at ? 1 : -1; },
      search: function (c) { return [c.ref, c.description, t('category.' + c.category), techName(c.technician_id)]; },
      filters: { status: function (c, v) { return c.status === v; } },
      render: ticketCard,
      empty: { icon: 'wrench', title: 'smaint.emptyTitle', text: 'smaint.emptyText' },
      onRender: function () { drawChips(); },
    });
    drawChips = ui.statusChips(document.getElementById('status-chips'), list, STEPS, function () { return mine().filter(function (c) { return DMS.app.term.hasDate(c.created_at); }); });

    document.getElementById('add-ticket').addEventListener('click', function () { openForm(null); });
    document.getElementById('ticket-modal-form').addEventListener('submit', save);
    document.getElementById('tk-photo').addEventListener('change', function (event) {
      const formEl = document.getElementById('ticket-modal-form');
      const file = event.target.files[0];
      if (!file) return;
      ui.readImage(file).then(function (url) {
        photo = url;
        DMS.form.clear(formEl);
        showPhoto();
      }, function (key) {
        DMS.form.show(formEl, { photo: key });
      });
      event.target.value = '';
    });
    document.getElementById('tk-photo-remove').addEventListener('click', function () {
      photo = null;
      showPhoto();
      document.getElementById('tk-photo').focus();
    });

    root.addEventListener('click', function (event) {
      const find = function (attr) { const b = event.target.closest('[' + attr + ']'); return b ? data.find('complaints', b.getAttribute(attr)) : null; };
      let c;
      if ((c = find('data-view'))) view(c);
      else if ((c = find('data-edit'))) { if (c.status === 'pending') openForm(c); else { render(); ui.toast(t('smaint.tooLate', { ref: c.ref }), 'warning'); } }
      else if ((c = find('data-withdraw'))) withdraw(c);
    });

    render();
  }

  DMS.app.page({ needs: ['complaints', 'technicians'], init: init, render: render });
})(window);
