/* ==========================================================================
   announcements.js — broadcast announcements (create, edit, delete, pin).
   Each announcement is written in English and Arabic; students see the one
   that matches their language. Pinned announcements stay on top.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;

  let list;
  let editing = null;

  function items() {
    return data.db.announcements.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at < b.created_at ? 1 : -1);
    });
  }

  function card(a) {
    const title = i18n.field(a, 'title');
    return (
      '<li class="ann' + (a.pinned ? ' is-pinned' : '') + '">' +
      '<div><p class="ann__meta">' +
      (a.pinned ? '<span class="badge badge--accent">' + esc(t('ann.pinned')) + '</span>' : '') +
      '<time datetime="' + esc(a.date) + '">' + esc(i18n.date(a.date, 'full')) + '</time></p>' +
      '<h3 class="ann__title">' + esc(title) + '</h3>' +
      '<p class="ann__body">' + esc(i18n.field(a, 'body')) + '</p></div>' +
      '<div class="ann__actions">' +
      '<button type="button" class="icon-btn icon-btn--sm" data-pin="' + a.id + '" aria-pressed="' + a.pinned + '" aria-label="' + esc(t(a.pinned ? 'ann.unpinLabel' : 'ann.pinLabel', { title: title })) + '" title="' + esc(t(a.pinned ? 'ann.unpin' : 'ann.pin')) + '">' + ui.icon('pin', { size: 17 }) + '</button>' +
      '<button type="button" class="icon-btn icon-btn--sm" data-edit="' + a.id + '" aria-label="' + esc(t('ann.editLabel', { title: title })) + '" title="' + esc(t('common.edit')) + '">' + ui.icon('edit', { size: 17 }) + '</button>' +
      '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="' + a.id + '" aria-label="' + esc(t('ann.deleteLabel', { title: title })) + '" title="' + esc(t('common.delete')) + '">' + ui.icon('trash', { size: 17 }) + '</button>' +
      '</div></li>'
    );
  }

  function openForm(a) {
    editing = a || null;
    const formEl = document.getElementById('ann-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('ann-modal-title').textContent = t(a ? 'ann.editTitle' : 'ann.addTitle');
    DMS.form.fill(formEl, a
      ? { title: ui.getText(a, 'title'), body: ui.getText(a, 'body'), date: a.date, pinned: a.pinned }
      : { title: '', body: '', date: data.dates.today(), pinned: false });
    ui.openModal(document.getElementById('ann-modal'));
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    ['title', 'body', 'date'].forEach(function (name) { if (!v[name]) errors[name] = 'err.required'; });
    if (v.title && v.title.length < 5) errors.title = 'ann.errShort';
    if (DMS.form.show(formEl, errors)) return;

    // Typed once, in Arabic or English; the other language is translated for its readers.
    const a = editing ? Object.assign({}, editing) : { title_en: '', title_ar: '', body_en: '', body_ar: '' };
    ui.setText(a, 'title', v.title);
    ui.setText(a, 'body', v.body);
    const body = { title_en: a.title_en, title_ar: a.title_ar, body_en: a.body_en, body_ar: a.body_ar, date: v.date, pinned: !!v.pinned };
    const wasEditing = !!editing;
    // A new announcement notifies every active student (bell, browser notification, e-mail).
    const request = wasEditing ? DMS.api.put('/announcements/' + editing.id, body) : DMS.api.post('/announcements', body);
    ui.busy(formEl.querySelector('[type="submit"]'), request).then(function () {
      ui.closeModal(document.getElementById('ann-modal'));
      return DMS.app.reload();
    }).then(function () { ui.toast(t(wasEditing ? 'ann.toastUpdated' : 'ann.toastPublished')); }).catch(ui.failed(formEl));
  }

  function init() {
    const root = document.getElementById('ann-list');
    list = DMS.list.create({
      root: root,
      items: items,
      pageSize: 5,
      search: function (a) { return [a.title_en, a.title_ar, a.body_en, a.body_ar]; },
      filters: { pinned: function (a, v) { return v === 'pinned' ? a.pinned : !a.pinned; } },
      render: card,
      empty: { icon: 'megaphone', title: 'ann.emptyTitle', text: 'ann.emptyText' },
    });

    root.addEventListener('click', function (event) {
      const pin = event.target.closest('[data-pin]');
      const edit = event.target.closest('[data-edit]');
      const del = event.target.closest('[data-delete]');
      if (pin) {
        const a = data.find('announcements', pin.getAttribute('data-pin'));
        const pinned = !a.pinned;
        DMS.api.put('/announcements/' + a.id, { pinned: pinned }).then(function () { return DMS.app.reload(); }).then(function () {
          const again = root.querySelector('[data-pin="' + a.id + '"]');
          if (again) again.focus();
          ui.toast(t(pinned ? 'ann.toastPinned' : 'ann.toastUnpinned'));
        }).catch(ui.failed());
      }
      if (edit) openForm(data.find('announcements', edit.getAttribute('data-edit')));
      if (del) {
        const a = data.find('announcements', del.getAttribute('data-delete'));
        ui.confirm({ title: t('ann.deleteTitle'), message: t('ann.deleteText', { title: i18n.field(a, 'title') }), confirm: t('common.delete') })
          .then(function (ok) {
            if (!ok) return null;
            return DMS.api.del('/announcements/' + a.id)
              .then(function () { return DMS.app.reload(); })
              .then(function () { ui.toast(t('ann.toastDeleted'), 'info'); })
              .catch(ui.failed());
          });
      }
    });
    document.getElementById('add-ann').addEventListener('click', function () { openForm(null); });
    document.getElementById('ann-form').addEventListener('submit', save);
    list.render();
  }

  DMS.app.page({ needs: ['announcements'], init: init, render: function () { list.render(); } });
})(window);
