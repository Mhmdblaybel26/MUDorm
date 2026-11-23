/* ==========================================================================
   room-ratings.js — periodic cleanliness and discipline scores (1 to 10)
   with comments, listed per room. One rating per room per month.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;

  let averages;
  let history;
  let editing = null;

  function score(value, labelKey) {
    const tone = value >= 8 ? '' : value >= 5 ? ' score__fill--mid' : ' score__fill--low';
    const shown = i18n.number(value, { maximumFractionDigits: 1 });
    return '<span class="score" role="img" aria-label="' + esc(t('ratings.scoreLabel', { label: t(labelKey), value: shown })) + '">' +
      '<span class="score__num">' + esc(shown) + '</span>' +
      '<span class="score__bar"><span class="score__fill' + tone + '" style="width:' + (value * 10) + '%"></span></span></span>';
  }

  /** Ratings of the months that fall in the academic year and semester chosen in the console. */
  function ratings() {
    return data.db.ratings.filter(function (r) { return DMS.app.term.hasDate(r.period + '-01'); });
  }

  function roomAverages() {
    const shown = ratings();
    return data.db.rooms.map(function (room) {
      const list = shown.filter(function (r) { return r.room_id === room.id; });
      if (!list.length) return null;
      const avg = function (key) { return list.reduce(function (s, r) { return s + r[key]; }, 0) / list.length; };
      return {
        room: room, count: list.length, cleanliness: avg('cleanliness'), discipline: avg('discipline'),
        latest: list.map(function (r) { return r.period; }).sort().pop(),
      };
    }).filter(Boolean);
  }

  function avgRow(a) {
    return (
      '<tr>' +
      ui.td('common.room', '<span class="cell-main ltr">' + esc(a.room.number) + '</span><span class="cell-sub">' + esc(t('wing.' + a.room.wing)) + '</span>') +
      ui.td('ratings.cleanliness', score(a.cleanliness, 'ratings.cleanliness')) +
      ui.td('ratings.discipline', score(a.discipline, 'ratings.discipline')) +
      ui.td('ratings.count', '<span class="num">' + esc(i18n.number(a.count)) + '</span>') +
      ui.td('ratings.latest', esc(i18n.date(a.latest, 'month'))) +
      ui.td('', '<button type="button" class="btn btn--ghost btn--sm" data-room="' + a.room.id + '" aria-label="' + esc(t('ratings.historyLabel', { room: a.room.number })) + '">' + esc(t('ratings.history')) + '</button>', 'cell-actions') +
      '</tr>'
    );
  }

  function historyRow(r) {
    const room = data.find('rooms', r.room_id);
    return (
      '<tr>' +
      ui.td('ratings.period', '<span class="nowrap">' + esc(i18n.date(r.period, 'month')) + '</span>') +
      ui.td('common.room', ui.roomCode(room)) +
      ui.td('ratings.cleanliness', score(r.cleanliness, 'ratings.cleanliness')) +
      ui.td('ratings.discipline', score(r.discipline, 'ratings.discipline')) +
      ui.td('ratings.comment', '<span class="cell-clip" dir="auto">' + esc(r.comment || '—') + '</span><span class="cell-sub" dir="auto">' + esc(r.rated_by) + '</span>') +
      ui.td('', '<button type="button" class="icon-btn icon-btn--sm" data-edit="' + r.id + '" aria-label="' + esc(t('ratings.editLabel', { room: room ? room.number : '' })) + '">' + ui.icon('edit', { size: 17 }) + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="' + r.id + '" aria-label="' + esc(t('ratings.deleteLabel', { room: room ? room.number : '' })) + '">' + ui.icon('trash', { size: 17 }) + '</button>', 'cell-actions') +
      '</tr>'
    );
  }

  function roomsSorted() { return data.db.rooms.slice().sort(function (a, b) { return a.number < b.number ? -1 : 1; }); }

  /** Rebuilds the room and period filters, keeping the current choice. */
  function fillFilters() {
    const roomSel = document.getElementById('rating-room');
    const periodSel = document.getElementById('rating-period');
    const keepRoom = roomSel.value || 'all';
    const keepPeriod = periodSel.value || 'all';
    roomSel.innerHTML = '<option value="all">' + esc(t('ratings.allRooms')) + '</option>' +
      roomsSorted().map(function (r) { return '<option value="' + r.id + '">' + esc(r.number) + '</option>'; }).join('');
    const periods = ratings().map(function (r) { return r.period; }).filter(function (p, i, arr) { return arr.indexOf(p) === i; }).sort().reverse();
    periodSel.innerHTML = '<option value="all">' + esc(t('ratings.allPeriods')) + '</option>' +
      periods.map(function (p) { return '<option value="' + p + '">' + esc(i18n.date(p, 'month')) + '</option>'; }).join('');
    roomSel.value = roomSel.querySelector('option[value="' + keepRoom + '"]') ? keepRoom : 'all';
    periodSel.value = periodSel.querySelector('option[value="' + keepPeriod + '"]') ? keepPeriod : 'all';
  }

  function openForm(r) {
    // A new system has no rooms yet: there is nothing to rate.
    if (!r && !roomsSorted().length) { ui.toast(t('ratings.noRooms'), 'warning'); return; }
    editing = r || null;
    const formEl = document.getElementById('rating-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('rating-modal-title').textContent = t(r ? 'ratings.editTitle' : 'ratings.addTitle');
    document.getElementById('rating-room-input').innerHTML = roomsSorted().map(function (room) {
      return '<option value="' + room.id + '">' + esc(room.number + ' · ' + t('wing.' + room.wing)) + '</option>';
    }).join('');
    const filterRoom = document.getElementById('rating-room').value;
    DMS.form.fill(formEl, r
      ? { room_id: r.room_id, period: r.period, cleanliness: r.cleanliness, discipline: r.discipline, comment: r.comment }
      : { room_id: filterRoom !== 'all' ? filterRoom : roomsSorted()[0].id, period: data.dates.today().slice(0, 7), cleanliness: '', discipline: '', comment: '' });
    ui.openModal(document.getElementById('rating-modal'));
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (!v.period) errors.period = 'err.required';
    else if (v.period > data.dates.today().slice(0, 7)) errors.period = 'ratings.errFuture';
    ['cleanliness', 'discipline'].forEach(function (key) {
      const n = Number(v[key]);
      if (v[key] === '') errors[key] = 'err.required';
      else if (!Number.isInteger(n) || n < 1 || n > 10) errors[key] = 'ratings.errScore';
    });
    const roomId = Number(v.room_id);
    const clash = data.db.ratings.filter(function (r) { return r.room_id === roomId && r.period === v.period && (!editing || r.id !== editing.id); })[0];
    if (v.period && clash) errors.period = ['ratings.errDuplicate', { room: data.find('rooms', roomId).number, month: i18n.date(v.period, 'month') }];
    if (DMS.form.show(formEl, errors)) return;

    const values = { room_id: roomId, period: v.period, cleanliness: Number(v.cleanliness), discipline: Number(v.discipline), comment: v.comment || null };
    const room = data.find('rooms', roomId);
    // The residents of the room are notified of the new scores.
    const request = editing ? DMS.api.put('/room-ratings/' + editing.id, values) : DMS.api.post('/room-ratings', values);
    ui.busy(formEl.querySelector('[type="submit"]'), request).then(function () {
      ui.closeModal(document.getElementById('rating-modal'));
      return DMS.app.reload();
    }).then(function () { ui.toast(t('ratings.toastSaved', { room: room ? room.number : '' })); }).catch(ui.failed(formEl));
  }

  function refresh() {
    fillFilters();
    averages.render();
    history.render();
  }

  function init() {
    averages = DMS.list.create({
      root: document.getElementById('avg-list'),
      items: roomAverages,
      pageSize: 6,
      sort: function (a, b) { return (b.cleanliness + b.discipline) - (a.cleanliness + a.discipline); },
      render: avgRow,
      empty: { icon: 'star', title: 'ratings.emptyTitle', text: 'ratings.emptyText' },
    });
    fillFilters();
    history = DMS.list.create({
      root: document.getElementById('rating-list'),
      items: ratings,
      pageSize: 8,
      sort: function (a, b) {
        if (a.period !== b.period) return a.period < b.period ? 1 : -1;
        const ra = data.find('rooms', a.room_id);
        const rb = data.find('rooms', b.room_id);
        return (ra ? ra.number : '') < (rb ? rb.number : '') ? -1 : 1;
      },
      search: function (r) { const room = data.find('rooms', r.room_id); return [room ? room.number : '', r.comment, r.rated_by]; },
      filters: {
        room: function (r, v) { return r.room_id === Number(v); },
        period: function (r, v) { return r.period === v; },
      },
      render: historyRow,
      empty: { icon: 'star', title: 'ratings.emptyTitle', text: 'ratings.emptyText' },
    });

    document.getElementById('avg-list').addEventListener('click', function (event) {
      const btn = event.target.closest('[data-room]');
      if (!btn) return;
      history.setFilter('room', btn.getAttribute('data-room'));
      const section = document.getElementById('rating-list');
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('rating-room').focus({ preventScroll: true });
    });
    document.getElementById('rating-list').addEventListener('click', function (event) {
      const edit = event.target.closest('[data-edit]');
      const del = event.target.closest('[data-delete]');
      if (edit) openForm(data.find('ratings', edit.getAttribute('data-edit')));
      if (del) {
        const r = data.find('ratings', del.getAttribute('data-delete'));
        const room = data.find('rooms', r.room_id);
        ui.confirm({ title: t('ratings.deleteTitle'), message: t('ratings.deleteText', { room: room ? room.number : '', month: i18n.date(r.period, 'month') }), confirm: t('common.delete') })
          .then(function (ok) {
            if (!ok) return null;
            return DMS.api.del('/room-ratings/' + r.id)
              .then(function () { return DMS.app.reload(); })
              .then(function () { ui.toast(t('ratings.toastDeleted'), 'info'); })
              .catch(ui.failed());
          });
      }
    });
    document.getElementById('add-rating').addEventListener('click', function () { openForm(null); });
    document.getElementById('rating-form').addEventListener('submit', save);
    refresh();
  }

  DMS.app.page({ needs: ['ratings', 'rooms', 'allocations'], init: init, render: refresh });
})(window);
