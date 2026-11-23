/* ==========================================================================
   meal-menus.js — the menu of the three daily meals (breakfast, lunch,
   dinner): create, edit and delete dishes, and the request deadline.

   The dorm office posts each day's menu in advance. Students then request
   their meals (up to two portions per meal) until the deadline: the day
   before, at the cutoff time (20:00 by default). The "Tomorrow" card shows
   whether tomorrow's menu is complete and how many portions were requested.
   One dish per menu type per meal per day keeps the kitchen summary clean.
   "Meal summary" exports the portions per day, meal and dish for any range
   of days as Excel (CSV) or as a PDF report.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;
  const dates = data.dates;

  const MEALS = data.config.meals;
  const TYPES = data.config.menuTypes;
  const MEAL_ICONS = { breakfast: 'sun', lunch: 'utensils', dinner: 'moon' };
  let weekStart = mondayOf(dates.today());
  let meal = 'breakfast'; // the meal shown in the week grid
  let editing = null;

  function mondayOf(iso) {
    const day = dates.parse(iso).getDay(); // 0 = Sunday
    return dates.addDays(iso, day === 0 ? -6 : 1 - day);
  }

  /** Portions requested of one dish (counted by the server). */
  function portionsFor(menuId) {
    const menu = data.find('menus', menuId);
    return menu ? menu.portions || 0 : 0;
  }
  /** Loads the menus around the week shown when it leaves the range already loaded. */
  function ensureWeek() {
    const r = data.rangeOf('menus');
    if (weekStart >= r.from && dates.addDays(weekStart, 6) <= r.to) return Promise.resolve();
    return data.setRange('menus', dates.addDays(weekStart, -35), dates.addDays(weekStart, 42));
  }
  function goToWeek(start) {
    weekStart = start;
    ensureWeek().then(drawWeek).catch(ui.failed());
  }
  function hours(m) { return i18n.time(m.from) + ' – ' + i18n.time(m.to); }

  /* ---- Tomorrow: is the menu posted, and how many portions so far ---- */
  function drawTomorrow() {
    const tomorrow = dates.addDays(dates.today(), 1);
    const open = data.mealOpen(tomorrow);
    const counts = data.mealCounts(tomorrow);
    const cutoff = i18n.time(data.db.settings.meal_cutoff);
    document.getElementById('tomorrow-sub').textContent = i18n.date(tomorrow, 'full');
    const missing = MEALS.filter(function (m) { return data.menusFor(tomorrow, m.key).length === 0; });
    const partial = MEALS.filter(function (m) { const n = data.menusFor(tomorrow, m.key).length; return n > 0 && n < TYPES.length; });

    let notice;
    if (missing.length) {
      notice = ['danger', 'alert', t('menus.tomorrowMissing'), t(open ? 'menus.tomorrowMissingText' : 'menus.tomorrowMissingLate', { meals: missing.map(function (m) { return t('meal.' + m.key); }).join(i18n.lang() === 'ar' ? '، ' : ', '), time: cutoff })];
    } else if (open) {
      notice = [partial.length ? 'warning' : 'success', partial.length ? 'info' : 'check-circle', t('menus.tomorrowPosted'), t(partial.length ? 'menus.tomorrowPartial' : 'menus.tomorrowOpen', { time: cutoff })];
    } else {
      notice = ['success', 'lock', t('menus.tomorrowFinal'), t('menus.tomorrowFinalText', { time: cutoff, n: i18n.number(counts.total), students: i18n.number(counts.students) })];
    }
    document.getElementById('tomorrow-notice').innerHTML =
      '<div class="notice notice--' + notice[0] + '">' + ui.icon(notice[1], { size: 18 }) + '<div><strong>' + esc(notice[2]) + '</strong>' + esc(notice[3]) + '</div></div>';

    document.getElementById('tomorrow-meals').innerHTML = MEALS.map(function (m) {
      const posted = data.menusFor(tomorrow, m.key).length;
      return '<div class="stat"><span class="tile' + (posted ? '' : ' tile--danger') + '">' + ui.icon(MEAL_ICONS[m.key], { size: 20 }) + '</span>' +
        '<span><span class="stat__label">' + esc(t('meal.' + m.key)) + ' · ' + esc(hours(m)) + '</span>' +
        '<span class="stat__value">' + esc(i18n.number(counts[m.key])) + '</span>' +
        '<span class="stat__meta">' + esc(t('menus.dishesPosted', { n: i18n.number(posted), max: i18n.number(TYPES.length) })) + '</span></span></div>';
    }).join('');
  }

  /* ---- Week grid for the chosen meal ---- */
  function drawTabs() {
    document.querySelectorAll('#meal-tabs [data-meal]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-meal') === meal));
    });
  }

  function drawWeek() {
    const end = dates.addDays(weekStart, 6);
    document.getElementById('week-label').textContent = i18n.date(weekStart, 'short') + ' – ' + i18n.date(end, 'medium');
    const today = dates.today();
    const tomorrow = dates.addDays(today, 1);
    let html = '';
    for (let i = 0; i < 7; i += 1) {
      const day = dates.addDays(weekStart, i);
      const items = data.menusFor(day, meal);
      const mealName = t('meal.' + meal);
      html +=
        '<article class="card day' + (day === today ? ' is-today' : '') + '" aria-labelledby="day-' + day + '">' +
        '<div class="day__head"><div><h3 class="day__name" id="day-' + day + '">' + esc(i18n.date(day, 'weekday')) + '</h3>' +
        '<p class="day__date">' + esc(i18n.date(day, 'medium')) + '</p></div>' +
        (day === today ? '<span class="badge badge--accent badge--plain">' + esc(t('menus.today')) + '</span>'
          : day === tomorrow ? '<span class="badge badge--info badge--plain">' + esc(t('menus.tomorrow')) + '</span>' : '') + '</div>' +
        '<div class="day__items">' +
        (items.length ? items.map(function (m) {
          const name = i18n.field(m, 'name');
          return '<div class="menu-item"><div><p class="menu-item__type">' + esc(t('menuType.' + m.type)) + '</p>' +
            '<p class="menu-item__name">' + esc(name) + '</p>' +
            '<p class="cell-sub">' + esc(t('menus.orders', { n: i18n.number(portionsFor(m.id)) })) + '</p></div>' +
            '<div class="menu-item__actions">' +
            '<button type="button" class="icon-btn icon-btn--sm" data-edit="' + m.id + '" aria-label="' + esc(t('menus.editLabel', { name: name })) + '">' + ui.icon('edit', { size: 16 }) + '</button>' +
            '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="' + m.id + '" aria-label="' + esc(t('menus.deleteLabel', { name: name })) + '">' + ui.icon('trash', { size: 16 }) + '</button>' +
            '</div></div>';
        }).join('') : ui.empty({ icon: MEAL_ICONS[meal], title: 'menus.dayEmpty', compact: true })) +
        '</div>' +
        (items.length < TYPES.length
          ? '<div class="day__foot"><button type="button" class="btn btn--ghost btn--sm" data-add="' + day + '" aria-label="' + esc(t('menus.addForDay', { meal: mealName, day: i18n.date(day, 'full') })) + '">' +
            ui.icon('plus', { size: 16 }) + esc(t('menus.addShort')) + '</button></div>'
          : '') +
        '</article>';
    }
    document.getElementById('week').innerHTML = html;
  }

  function drawCutoff() {
    const cutoff = data.db.settings.meal_cutoff;
    const tomorrow = dates.addDays(dates.today(), 1);
    document.getElementById('cutoff-time').value = cutoff;
    document.getElementById('cutoff-status').textContent = t(data.mealOpen(tomorrow) ? 'menus.cutoffOpen' : 'menus.cutoffClosed',
      { time: i18n.time(cutoff), day: i18n.date(tomorrow, 'weekday') });
  }

  /* ---- Add / edit a dish ---- */
  function openForm(menu, date, forMeal) {
    editing = menu || null;
    const formEl = document.getElementById('menu-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('menu-modal-title').textContent = t(menu ? 'menus.editTitle' : 'menus.addTitle');
    formEl.elements.meal.innerHTML = MEALS.map(function (m) {
      return '<option value="' + m.key + '">' + esc(t('meal.' + m.key) + ' · ' + hours(m)) + '</option>';
    }).join('');
    // A new dish goes to tomorrow by default: that is the menu students are waiting for.
    const day = date || dates.addDays(dates.today(), 1);
    const inMeal = forMeal || meal;
    let type = 'main';
    if (!menu) {
      const used = data.menusFor(day, inMeal).map(function (m) { return m.type; });
      type = TYPES.filter(function (k) { return used.indexOf(k) === -1; })[0] || 'main';
    }
    DMS.form.fill(formEl, menu
      ? { date: menu.date, meal: menu.meal, type: menu.type, name: ui.getText(menu, 'name') }
      : { date: day, meal: inMeal, type: type, name: '' });
    const portions = menu ? portionsFor(menu.id) : 0;
    document.getElementById('menu-orders-note').textContent = portions ? t('menus.editOrdersNote', { n: i18n.number(portions) }) : '';
    ui.openModal(document.getElementById('menu-modal'));
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    const requested = editing ? portionsFor(editing.id) : 0;
    if (!v.date) errors.date = 'err.required';
    // Requests are tied to the day and the meal, so a dish that was already requested keeps both.
    else if (requested && v.date !== editing.date) errors.date = ['menus.errDateLocked', { n: i18n.number(requested) }];
    if (requested && v.meal !== editing.meal) errors.meal = ['menus.errMealLocked', { n: i18n.number(requested) }];
    if (!v.name) errors.name = 'err.required';
    const clash = data.db.menus.filter(function (m) { return m.date === v.date && m.meal === v.meal && m.type === v.type && (!editing || m.id !== editing.id); })[0];
    if (v.date && clash) errors.type = ['menus.errDuplicate', { type: t('menuType.' + v.type), meal: t('meal.' + v.meal), day: i18n.date(v.date, 'full') }];
    if (DMS.form.show(formEl, errors)) return;

    // The dish name is typed once; readers of the other language get a translation.
    const dish = { name_en: editing ? editing.name_en : '', name_ar: editing ? editing.name_ar : '' };
    ui.setText(dish, 'name', v.name);
    const body = { date: v.date, meal: v.meal, type: v.type, name_en: dish.name_en, name_ar: dish.name_ar };
    const request = editing ? DMS.api.put('/meals/menus/' + editing.id, body) : DMS.api.post('/meals/menus', body);
    ui.busy(formEl.querySelector('[type="submit"]'), request).then(function () {
      ui.closeModal(document.getElementById('menu-modal'));
      weekStart = mondayOf(v.date);
      meal = v.meal;
      return ensureWeek().then(function () { return DMS.app.reload(); });
    }).then(function () { ui.toast(t('menus.toastSaved', { name: v.name })); }).catch(ui.failed(formEl));
  }

  function remove(menu) {
    const portions = portionsFor(menu.id);
    const name = i18n.field(menu, 'name');
    ui.confirm({
      title: t('menus.deleteTitle'),
      message: portions ? t('menus.deleteTextOrders', { name: name, n: i18n.number(portions) }) : t('menus.deleteText', { name: name }),
      confirm: t('common.delete'),
    }).then(function (ok) {
      if (!ok) return null;
      // The server cancels the requests for this dish.
      return DMS.api.del('/meals/menus/' + menu.id)
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('menus.toastDeleted', { name: name }), 'info'); })
        .catch(ui.failed());
    });
  }

  /* ---- Meal summary for the kitchen: Excel (CSV) or PDF ----
     Portions requested per day, meal and dish over a range of days (this
     replaces the former Meal Summary page). */
  let range = null;

  /** One row per day and meal that has a menu: { date, meal, cells: { main: { count, menu } ... }, total, students } */
  function summarise(from, to) {
    const rows = [];
    for (let day = from; day <= to; day = dates.addDays(day, 1)) {
      const orders = data.db.orders.filter(function (o) { return o.date === day && o.status === 'reserved'; });
      MEALS.forEach(function (m) {
        const menus = data.menusFor(day, m.key);
        if (!menus.length) return;
        const cells = {};
        const who = {};
        let total = 0;
        TYPES.forEach(function (type) {
          const menu = menus.filter(function (x) { return x.type === type; })[0] || null;
          let count = 0;
          if (menu) {
            orders.forEach(function (o) {
              if (o.menu_id !== menu.id) return;
              count += o.portions;
              who[o.student_id] = true;
            });
          }
          cells[type] = { count: count, menu: menu };
          total += count;
        });
        rows.push({ date: day, meal: m, cells: cells, total: total, students: Object.keys(who).length });
      });
    }
    return rows;
  }
  /** Students who requested at least one meal in the range. */
  function studentsIn(from, to) {
    const who = {};
    data.db.orders.forEach(function (o) { if (o.status === 'reserved' && o.date >= from && o.date <= to) who[o.student_id] = true; });
    return Object.keys(who).length;
  }
  function rangeText(from, to) {
    return from === to ? i18n.date(from, 'full') : t('summary.rangeText', { from: i18n.date(from, 'medium'), to: i18n.date(to, 'medium') });
  }

  /** "tomorrow", "week" (the week shown in the grid) or "last7". */
  function quickRange(key) {
    const tomorrow = dates.addDays(dates.today(), 1);
    if (key === 'week') return { from: weekStart, to: dates.addDays(weekStart, 6) };
    if (key === 'last7') return { from: dates.addDays(dates.today(), -6), to: dates.today() };
    return { from: tomorrow, to: tomorrow };
  }

  /** Checks the dates; returns false (and shows why) when they cannot be used. */
  function readRange() {
    const formEl = document.getElementById('summary-form');
    const v = DMS.form.values(formEl);
    const errors = {};
    if (!v.from) errors.from = 'err.required';
    if (!v.to) errors.to = 'err.required';
    else if (v.from && v.to < v.from) errors.to = 'summary.errRange';
    else if (v.from && dates.between(v.from, v.to) > 62) errors.to = 'summary.errLong';
    if (DMS.form.show(formEl, errors)) { range = null; return false; }
    range = { from: v.from, to: v.to };
    return true;
  }

  /** The requests of the chosen days, fetched from the server before counting. */
  function loadRange() {
    data.setRange('orders', range.from, range.to);
    data.setRange('menus', range.from < data.rangeOf('menus').from ? range.from : data.rangeOf('menus').from,
      range.to > data.rangeOf('menus').to ? range.to : data.rangeOf('menus').to);
    return data.load(['orders', 'menus']);
  }

  function drawPreview() {
    const box = document.getElementById('summary-preview');
    if (!range) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="muted" role="status">' + esc(t('api.loading')) + '</p>';
    const shown = range;
    loadRange().then(function () { if (shown === range) drawPreviewNow(); }).catch(ui.failed());
  }
  function drawPreviewNow() {
    const box = document.getElementById('summary-preview');
    const rows = summarise(range.from, range.to);
    const total = rows.reduce(function (s, r) { return s + r.total; }, 0);
    box.innerHTML = '<div class="notice' + (rows.length ? '' : ' notice--warning') + '">' + ui.icon(rows.length ? 'utensils' : 'alert', { size: 18 }) +
      '<div><strong>' + esc(rangeText(range.from, range.to)) + '</strong>' +
      esc(rows.length ? t('msum.preview', { portions: i18n.number(total), students: i18n.number(studentsIn(range.from, range.to)), meals: i18n.number(rows.length) }) : t('summary.emptyText')) +
      '</div></div>';
  }

  function setQuick(key) {
    document.querySelectorAll('#summary-quick [data-range]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-range') === key));
    });
  }
  function useQuick(key) {
    const formEl = document.getElementById('summary-form');
    range = quickRange(key);
    formEl.elements.from.value = range.from;
    formEl.elements.to.value = range.to;
    DMS.form.clear(formEl);
    setQuick(key);
    drawPreview();
  }

  function fileName() { return 'meal-summary_' + range.from + (range.to !== range.from ? '_to_' + range.to : ''); }

  function exportCsv(rows) {
    const lines = [[t('summary.csvDate'), t('summary.csvMeal'), t('summary.csvType'), t('summary.csvItem'), t('summary.csvOrders')]];
    rows.forEach(function (r) {
      TYPES.forEach(function (type) {
        const c = r.cells[type];
        if (c.menu) lines.push([r.date, t('meal.' + r.meal.key), t('menuType.' + type), i18n.field(c.menu, 'name'), c.count]);
      });
    });
    ui.downloadCsv(fileName() + '.csv', lines);
    ui.toast(t('summary.toastCsv', { n: i18n.number(lines.length - 1) }));
  }

  function exportPdf(rows) {
    const totals = { all: 0 };
    TYPES.forEach(function (type) { totals[type] = 0; });
    rows.forEach(function (r) {
      TYPES.forEach(function (type) { totals[type] += r.cells[type].count; });
      totals.all += r.total;
    });
    const byMeal = {};
    MEALS.forEach(function (m) { byMeal[m.key] = rows.reduce(function (s, r) { return r.meal.key === m.key ? s + r.total : s; }, 0); });
    const top = MEALS.slice().sort(function (a, b) { return byMeal[b.key] - byMeal[a.key]; })[0];
    ui.printReport({
      file: fileName(),
      title: t('msum.title'),
      subtitle: rangeText(range.from, range.to),
      facts: [
        [t('summary.totalOrders'), i18n.number(totals.all)],
        [t('summary.students'), i18n.number(studentsIn(range.from, range.to))],
        [t('msum.days'), i18n.number(dates.between(range.from, range.to) + 1)],
        [t('summary.topMeal'), totals.all ? t('meal.' + top.key) : t('common.none')],
      ],
      head: [t('common.date'), t('summary.meal')].concat(TYPES.map(function (type) { return t('menuType.' + type); }), [t('summary.total')]),
      // The kitchen reads the days in order.
      rows: rows.map(function (r) {
        return [{ text: i18n.date(r.date, 'weekday'), sub: i18n.date(r.date, 'medium') }, { text: t('meal.' + r.meal.key), sub: hours(r.meal) }]
          .concat(TYPES.map(function (type) {
            const c = r.cells[type];
            return c.menu ? { text: i18n.number(c.count), sub: i18n.field(c.menu, 'name') } : { text: '—', sub: t('summary.noMenu') };
          }), [{ text: i18n.number(r.total), sub: t('summary.studentsN', { n: i18n.number(r.students) }) }]);
      }),
      foot: [t('summary.totalRange'), ''].concat(TYPES.map(function (type) { return i18n.number(totals[type]); }), [i18n.number(totals.all)]),
      // Dish columns read as text (portions over the dish name); only the total lines up as a number.
      numeric: [5],
    });
  }

  function exportSummary(kind) {
    if (!readRange()) return;
    loadRange().then(function () {
      const rows = summarise(range.from, range.to);
      if (!rows.length) { ui.toast(t('summary.csvEmpty'), 'warning'); return; }
      if (kind === 'csv') exportCsv(rows);
      else exportPdf(rows);
    }).catch(ui.failed());
  }

  function initSummary() {
    const formEl = document.getElementById('summary-form');
    document.getElementById('open-summary').addEventListener('click', function () {
      useQuick('tomorrow');
      ui.openModal(document.getElementById('summary-modal'));
    });
    document.getElementById('summary-quick').addEventListener('click', function (event) {
      const b = event.target.closest('[data-range]');
      if (b) useQuick(b.getAttribute('data-range'));
    });
    formEl.addEventListener('submit', function (event) { event.preventDefault(); });
    formEl.addEventListener('change', function () {
      setQuick(null);
      readRange();
      drawPreview();
    });
    formEl.addEventListener('click', function (event) {
      const b = event.target.closest('[data-export]');
      if (b) exportSummary(b.getAttribute('data-export'));
    });
  }

  function init() {
    initSummary();
    const week = document.getElementById('week');
    week.addEventListener('click', function (event) {
      const add = event.target.closest('[data-add]');
      const edit = event.target.closest('[data-edit]');
      const del = event.target.closest('[data-delete]');
      if (add) openForm(null, add.getAttribute('data-add'));
      if (edit) openForm(data.find('menus', edit.getAttribute('data-edit')));
      if (del) remove(data.find('menus', del.getAttribute('data-delete')));
    });
    document.getElementById('add-item').addEventListener('click', function () { openForm(null, null); });
    document.getElementById('menu-form').addEventListener('submit', save);

    document.getElementById('meal-tabs').addEventListener('click', function (event) {
      const b = event.target.closest('[data-meal]');
      if (!b) return;
      meal = b.getAttribute('data-meal');
      drawTabs();
      drawWeek();
    });
    document.getElementById('week-prev').addEventListener('click', function () { goToWeek(dates.addDays(weekStart, -7)); });
    document.getElementById('week-next').addEventListener('click', function () { goToWeek(dates.addDays(weekStart, 7)); });
    document.getElementById('week-today').addEventListener('click', function () { goToWeek(mondayOf(dates.today())); });

    document.getElementById('cutoff-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const formEl = event.target;
      const value = formEl.elements.cutoff.value;
      if (!/^\d{2}:\d{2}$/.test(value)) { DMS.form.show(formEl, { cutoff: 'menus.errTime' }); return; }
      // Late enough for students to see the menu, early enough for the kitchen to plan.
      if (value < '12:00' || value > '23:00') { DMS.form.show(formEl, { cutoff: 'menus.errTimeRange' }); return; }
      DMS.form.clear(formEl);
      ui.busy(formEl.querySelector('[type="submit"]'), DMS.api.put('/meals/cutoff', { meal_cutoff: value }))
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('menus.toastCutoff', { time: i18n.time(value) })); })
        .catch(ui.failed(formEl));
    });

    render();
  }

  function render() {
    drawCutoff();
    drawTomorrow();
    drawTabs();
    drawWeek();
  }

  DMS.app.page({ needs: ['menus'], init: init, render: render });
})(window);
