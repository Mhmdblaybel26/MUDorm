/* ==========================================================================
   rooms.js — Rooms & Capacity (create, edit, delete).
   Rules shown to the manager here and enforced by Laravel:
   - room numbers are unique and start with their wing letter (A-101)
   - capacity can never drop below the number of current residents
   - a room with residents cannot be deleted
   - "Full" is set automatically when every bed is taken
   - maintenance, unavailable and uninhabitable rooms take no new residents
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

  let list;
  let editing = null;
  let photo = null; // the photo shown in the form: its address, or a data URL of a new one
  let photoChanged = false;

  function items() {
    return data.db.rooms.slice().sort(function (a, b) { return a.number < b.number ? -1 : 1; });
  }

  function drawStats() {
    const rooms = data.db.rooms;
    let beds = 0;
    let used = 0;
    rooms.forEach(function (r) {
      if (data.isClosed(r)) return;
      beds += r.capacity;
      used += data.occupants(r.id).length;
    });
    const cards = [
      ['building', '', 'rooms.statRooms', rooms.length],
      ['bed', 'info', 'rooms.statBeds', beds],
      ['key', 'success', 'rooms.statFree', beds - used],
      ['wrench', 'warning', 'rooms.statMaintenance', rooms.filter(data.isClosed).length],
    ];
    document.getElementById('room-stats').innerHTML = cards.map(function (c) {
      return '<div class="stat"><span class="tile' + (c[1] ? ' tile--' + c[1] : '') + '">' + ui.icon(c[0], { size: 20 }) + '</span>' +
        '<span><span class="stat__label">' + esc(t(c[2])) + '</span><span class="stat__value">' + esc(i18n.number(c[3])) + '</span></span></div>';
    }).join('');
  }

  function occupancyCell(room) {
    const used = data.occupants(room.id).length;
    const pct = Math.min(100, Math.round((used / room.capacity) * 100));
    return '<span class="occ"><span class="num">' + esc(t('rooms.bedsUsed', { used: i18n.number(used), capacity: i18n.number(room.capacity) })) + '</span>' +
      '<span class="occ__bar" aria-hidden="true"><span class="occ__fill' + (used >= room.capacity ? ' occ__fill--full' : '') + '" style="width:' + pct + '%"></span></span></span>';
  }

  function row(room) {
    const thumb = room.photo
      ? '<span class="thumb"><img src="' + esc(room.photo) + '" alt="' + esc(t('rooms.photoAlt', { room: room.number })) + '"></span>'
      : '<span class="thumb" title="' + esc(t('rooms.noPhoto')) + '">' + ui.icon('image', { size: 18 }) + '</span>';
    return (
      '<tr>' +
      ui.td('rooms.fPhoto', thumb) +
      ui.td('common.room', '<span class="cell-main ltr">' + esc(room.number) + '</span><span class="cell-sub">' + esc(t('rooms.floorN', { n: i18n.number(room.floor) })) + '</span>') +
      ui.td('common.wing', esc(t('wing.' + room.wing))) +
      ui.td('rooms.fType', esc(t('roomType.' + room.type))) +
      ui.td('rooms.colOccupancy', occupancyCell(room)) +
      ui.td('common.status', ui.badge(room.status)) +
      ui.td('', '<button type="button" class="icon-btn icon-btn--sm" data-edit="' + room.id + '" aria-label="' + esc(t('rooms.editLabel', { room: room.number })) + '" title="' + esc(t('common.edit')) + '">' + ui.icon('edit', { size: 17 }) + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="' + room.id + '" aria-label="' + esc(t('rooms.deleteLabel', { room: room.number })) + '" title="' + esc(t('common.delete')) + '">' + ui.icon('trash', { size: 17 }) + '</button>', 'cell-actions') +
      '</tr>'
    );
  }

  function showPhoto() {
    const preview = document.getElementById('room-photo-preview');
    preview.innerHTML = photo ? '<img src="' + esc(photo) + '" alt="' + esc(t('rooms.photoPreview')) + '">' : ui.icon('image', { size: 24 });
    document.getElementById('room-photo-remove').hidden = !photo;
  }

  function openForm(room) {
    editing = room || null;
    const formEl = document.getElementById('room-form');
    formEl.reset();
    DMS.form.clear(formEl);
    photo = room ? room.photo : null;
    photoChanged = false;
    document.getElementById('room-modal-title').textContent = room ? t('rooms.editTitle', { room: room.number }) : t('rooms.addTitle');
    document.getElementById('room-modal-sub').textContent = room ? t('rooms.residentsNow', { n: i18n.number(data.occupants(room.id).length) }) : t('rooms.addSub');
    DMS.form.fill(formEl, room
      ? { number: room.number, wing: room.wing, type: room.type, capacity: room.capacity, status: room.status === 'full' ? 'available' : room.status, notes: room.notes }
      : { number: '', wing: 'A', type: 'double', capacity: 2, status: 'available', notes: '' });
    showPhoto();
    ui.openModal(document.getElementById('room-modal'));
  }

  function validate(v) {
    const errors = {};
    const number = v.number.toUpperCase();
    if (!number) errors.number = 'err.required';
    else if (!/^[A-D]-\d{3}$/.test(number)) errors.number = 'rooms.errFormat';
    else if (number.charAt(0) !== v.wing) errors.number = ['rooms.errWing', { wing: v.wing }];
    else if (data.db.rooms.some(function (r) { return r.number === number && (!editing || r.id !== editing.id); })) errors.number = ['rooms.errDuplicate', { room: number }];

    const capacity = Number(v.capacity);
    const residents = editing ? data.occupants(editing.id).length : 0;
    if (!v.capacity) errors.capacity = 'err.required';
    else if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4) errors.capacity = 'rooms.errCapacityRange';
    else if (capacity < residents) errors.capacity = ['rooms.errCapacityResidents', { n: residents }];
    return errors;
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    if (DMS.form.show(formEl, validate(v))) return;

    const number = v.number.toUpperCase();
    const values = { number: number, wing: v.wing, type: v.type, capacity: Number(v.capacity), status: v.status, notes: v.notes };
    // A new photo travels as a file; removing it is a flag. An unchanged photo is not sent.
    if (photoChanged && !photo) values.remove_photo = true;
    const body = api.form(values, photoChanged && photo ? { photo: photo } : null);
    const wasEditing = editing;
    ui.busy(formEl.querySelector('[type="submit"]'), api.post(wasEditing ? '/rooms/' + wasEditing.id : '/rooms', body))
      .then(function () {
        ui.closeModal(document.getElementById('room-modal'));
        return DMS.app.reload();
      })
      .then(function () { ui.toast(t(wasEditing ? 'rooms.toastUpdated' : 'rooms.toastCreated', { room: number })); })
      .catch(ui.failed(formEl));
  }

  function remove(room) {
    const residents = data.occupants(room.id).length;
    if (residents) {
      ui.toast(t('rooms.errDeleteResidents', { room: room.number, n: i18n.number(residents) }), 'danger');
      return;
    }
    ui.confirm({
      title: t('rooms.deleteTitle', { room: room.number }),
      message: t('rooms.deleteText'),
      confirm: t('common.delete'),
    }).then(function (ok) {
      if (!ok) return null;
      return api.del('/rooms/' + room.id)
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('rooms.toastDeleted', { room: room.number }), 'info'); })
        .catch(ui.failed());
    });
  }

  function refresh() {
    drawStats();
    list.render();
  }

  function init() {
    const root = document.getElementById('room-list');
    list = DMS.list.create({
      root: root,
      items: items,
      pageSize: 8,
      search: function (r) { return [r.number, r.notes, t('wing.' + r.wing)]; },
      filters: {
        wing: function (r, v) { return r.wing === v; },
        type: function (r, v) { return r.type === v; },
        status: function (r, v) { return r.status === v; },
      },
      render: row,
      empty: { icon: 'bed', title: 'rooms.emptyTitle', text: 'rooms.emptyText' },
    });

    root.addEventListener('click', function (event) {
      const edit = event.target.closest('[data-edit]');
      const del = event.target.closest('[data-delete]');
      if (edit) openForm(data.find('rooms', edit.getAttribute('data-edit')));
      if (del) remove(data.find('rooms', del.getAttribute('data-delete')));
    });

    document.getElementById('add-room').addEventListener('click', function () { openForm(null); });
    const formEl = document.getElementById('room-form');
    formEl.addEventListener('submit', save);

    // Type sets the usual capacity; the wing follows the room number prefix.
    formEl.elements.type.addEventListener('change', function () {
      formEl.elements.capacity.value = data.config.roomTypes[formEl.elements.type.value];
    });
    formEl.elements.number.addEventListener('input', function () {
      const letter = formEl.elements.number.value.trim().charAt(0).toUpperCase();
      if (data.config.wings.indexOf(letter) > -1) formEl.elements.wing.value = letter;
    });

    document.getElementById('room-photo').addEventListener('change', function (event) {
      const file = event.target.files[0];
      ui.readImage(file).then(function (url) {
        photo = url;
        photoChanged = true;
        DMS.form.clear(formEl);
        showPhoto();
      }).catch(function (key) {
        DMS.form.show(formEl, { photo: key });
      });
      event.target.value = '';
    });
    document.getElementById('room-photo-remove').addEventListener('click', function () {
      photo = null;
      photoChanged = true;
      showPhoto();
      document.getElementById('room-photo').focus();
    });

    refresh();
  }

  DMS.app.page({ needs: ['rooms', 'allocations'], init: init, render: refresh });
})(window);
