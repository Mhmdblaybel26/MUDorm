/* ==========================================================================
   rules.js — dorm rules and guidelines: add, edit, delete and reorder.
   Students read them on the portal's "Rules" page and are notified when a
   rule is added or changed. A rule is typed once, in Arabic or English;
   readers of the other language see a translation.
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
    return data.db.rules.slice().sort(function (a, b) { return a.position - b.position; });
  }
  /** Positions are 1, 2, 3 ... with no gaps, in the order shown. */
  function renumber(ordered) { ordered.forEach(function (rule, i) { rule.position = i + 1; }); }

  function card(rule) {
    const title = i18n.field(rule, 'title');
    const all = items();
    const first = all[0].id === rule.id;
    const last = all[all.length - 1].id === rule.id;
    const button = function (attr, iconName, label, extra) {
      return '<button type="button" class="icon-btn icon-btn--sm' + (extra || '') + '" ' + attr + '="' + rule.id + '" aria-label="' + esc(t(label, { title: title })) + '" title="' + esc(t(label, { title: title })) + '"' +
        ((attr === 'data-up' && first) || (attr === 'data-down' && last) ? ' disabled' : '') + '>' + ui.icon(iconName, { size: 17 }) + '</button>';
    };
    return (
      '<li class="rule"><span class="rule__n" aria-hidden="true">' + esc(i18n.number(rule.position)) + '</span>' +
      '<div><h3 class="rule__title">' + esc(title) + '</h3><p class="rule__body">' + esc(i18n.field(rule, 'body')) + '</p>' +
      '<p class="cell-sub">' + esc(t('rules.updated', { date: i18n.date(rule.updated_at, 'medium') })) + '</p></div>' +
      '<div class="rule__actions">' +
      button('data-up', 'arrow-down', 'rules.moveUp', ' icon-btn--flip') +
      button('data-down', 'arrow-down', 'rules.moveDown') +
      button('data-edit', 'edit', 'rules.editLabel') +
      button('data-delete', 'trash', 'rules.deleteLabel', ' icon-btn--danger') +
      '</div></li>'
    );
  }

  function openForm(rule) {
    editing = rule || null;
    const formEl = document.getElementById('rule-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('rule-modal-title').textContent = t(rule ? 'rules.editTitle' : 'rules.addTitle');
    DMS.form.fill(formEl, rule ? { title: ui.getText(rule, 'title'), body: ui.getText(rule, 'body') } : { title: '', body: '' });
    ui.openModal(document.getElementById('rule-modal'));
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (!v.title) errors.title = 'err.required';
    else if (v.title.length < 3) errors.title = 'rules.errTitle';
    if (!v.body) errors.body = 'err.required';
    else if (v.body.length < 10) errors.body = 'rules.errBody';
    if (DMS.form.show(formEl, errors)) return;

    const rule = editing ? Object.assign({}, editing) : { title_en: '', title_ar: '', body_en: '', body_ar: '' };
    ui.setText(rule, 'title', v.title);
    ui.setText(rule, 'body', v.body);
    const body = { title_en: rule.title_en, title_ar: rule.title_ar, body_en: rule.body_en, body_ar: rule.body_ar };
    const wasEditing = !!editing;
    // Laravel notifies every active student that the rules changed.
    const request = wasEditing ? DMS.api.put('/rules/' + editing.id, body) : DMS.api.post('/rules', body);
    ui.busy(formEl.querySelector('[type="submit"]'), request).then(function () {
      ui.closeModal(document.getElementById('rule-modal'));
      return DMS.app.reload();
    }).then(function () { ui.toast(t(wasEditing ? 'rules.toastUpdated' : 'rules.toastAdded')); }).catch(ui.failed(formEl));
  }

  function move(rule, step) {
    const ordered = items();
    const from = ordered.indexOf(rule);
    const to = from + step;
    if (to < 0 || to >= ordered.length) return;
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
    renumber(ordered);
    list.render();
    DMS.api.put('/rules/order', { ids: ordered.map(function (r) { return r.id; }) }).catch(ui.failed()).catch(function () { return DMS.app.reload(); });
    // Keep the keyboard on the rule that moved.
    const again = document.querySelector('[' + (step < 0 ? 'data-up' : 'data-down') + '="' + rule.id + '"]:not([disabled])') ||
      document.querySelector('[data-edit="' + rule.id + '"]');
    if (again) again.focus();
    ui.announce(t('rules.moved', { title: i18n.field(rule, 'title'), n: i18n.number(rule.position) }));
  }

  function remove(rule) {
    const title = i18n.field(rule, 'title');
    ui.confirm({ title: t('rules.deleteTitle'), message: t('rules.deleteText', { title: title }), confirm: t('common.delete') }).then(function (ok) {
      if (!ok) return null;
      return DMS.api.del('/rules/' + rule.id)
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('rules.toastDeleted'), 'info'); })
        .catch(ui.failed());
    });
  }

  function init() {
    const root = document.getElementById('rule-list');
    list = DMS.list.create({
      root: root,
      items: items,
      pageSize: 20,
      search: function (r) { return [r.title_en, r.title_ar, r.body_en, r.body_ar]; },
      render: card,
      empty: { icon: 'shield', title: 'rules.emptyTitle', text: 'rules.emptyText' },
    });
    root.addEventListener('click', function (event) {
      const find = function (attr) { const b = event.target.closest('[' + attr + ']'); return b && !b.disabled ? data.find('rules', b.getAttribute(attr)) : null; };
      let rule;
      if ((rule = find('data-up'))) move(rule, -1);
      else if ((rule = find('data-down'))) move(rule, 1);
      else if ((rule = find('data-edit'))) openForm(rule);
      else if ((rule = find('data-delete'))) remove(rule);
    });
    document.getElementById('add-rule').addEventListener('click', function () { openForm(null); });
    document.getElementById('rule-form').addEventListener('submit', save);
    list.render();
  }

  DMS.app.page({ needs: ['rules'], init: init, render: function () { list.render(); } });
})(window);
