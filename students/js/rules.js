/* ==========================================================================
   rules.js — the dorm's rules and guidelines, to read.
   The dorm office writes and updates them (manager/rules.html). Rules typed
   in the other language are shown translated.
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

  function items() {
    return data.db.rules.slice().sort(function (a, b) { return a.position - b.position; });
  }

  function render() {
    const latest = data.db.rules.reduce(function (m, r) { return r.updated_at > m ? r.updated_at : m; }, '');
    document.getElementById('rules-updated').textContent = latest
      ? t('srules.noticeText', { date: i18n.date(latest, 'medium') })
      : t('srules.noticeEmpty');
    list.render();
  }

  function init() {
    list = DMS.list.create({
      root: document.getElementById('rule-list'),
      items: items,
      pageSize: 30,
      search: function (r) { return [r.title_en, r.title_ar, r.body_en, r.body_ar, i18n.field(r, 'title'), i18n.field(r, 'body')]; },
      render: function (rule) {
        return '<li class="rule"><span class="rule__n" aria-hidden="true">' + esc(i18n.number(rule.position)) + '</span>' +
          '<div><h3 class="rule__title">' + esc(i18n.field(rule, 'title')) + '</h3>' +
          '<p class="rule__body">' + esc(i18n.field(rule, 'body')) + '</p></div></li>';
      },
      empty: { icon: 'shield', title: 'srules.emptyTitle', text: 'srules.emptyText' },
    });
    render();
  }

  DMS.app.page({ needs: ['rules'], init: init, render: render });
})(window);
