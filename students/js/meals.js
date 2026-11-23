/* ==========================================================================
   meals.js — meal requests for the three daily meals.

   The dining hall serves breakfast, lunch and dinner. The dorm office posts
   each day's menu in advance and students say what they will eat, so the
   kitchen prepares the right quantities:
   - a student may take up to two portions per meal (two of one dish, or one
     each of two dishes);
   - requests for a day close on the day before at the cutoff time (20:00 by
     default, set by the dorm office); until then they can be changed or
     cancelled, after that they are locked;
   - every change is saved at once, there is no separate "send" step.
   A live countdown shows the time left for tomorrow's meals.
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
  const dates = data.dates;
  const portal = DMS.portal;

  const MEALS = data.config.meals;
  const MAX = data.config.maxPortions;
  const MEAL_ICONS = { breakfast: 'sun', lunch: 'utensils', dinner: 'moon' };
  const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2 };
  let selected = null;
  let wasOpen = null;
  let drawnOn = null; // the calendar day the page was last drawn for
  let todaySignature = '';
  let history;
  let saving = false; // one portion change at a time

  function days() {
    const list = [];
    for (let i = 1; i <= 7; i += 1) list.push(dates.addDays(dates.today(), i));
    return list;
  }
  function mine(day) { return portal.ordersFor(portal.me().id, day); }
  function total(day, meal) {
    return mine(day).reduce(function (sum, o) { return !meal || o.meal === meal ? sum + o.portions : sum; }, 0);
  }
  function hours(meal) { return i18n.time(meal.from) + ' – ' + i18n.time(meal.to); }
  function cutoffTime() { return i18n.time(data.db.settings.meal_cutoff); }
  /** "20:00 on Tuesday" for the day whose meals are being requested. */
  function deadlineParams(day) {
    return { time: cutoffTime(), day: i18n.date(dates.addDays(day, -1), 'weekday') };
  }

  /* ---- Countdown to the deadline for tomorrow's meals ---- */
  function tick() {
    const today = dates.today();
    if (drawnOn !== today) { selected = null; render(); return; } // midnight passed
    const tomorrow = dates.addDays(today, 1);
    const deadline = data.mealDeadline(tomorrow);
    const left = deadline.getTime() - Date.now();
    const open = left > 0;
    const params = { day: i18n.date(tomorrow, 'weekday'), time: cutoffTime() };
    document.getElementById('countdown').classList.toggle('is-closed', !open);
    document.getElementById('countdown-label').textContent = t(open ? 'smeal.closesIn' : 'smeal.closedFor', params);
    document.getElementById('countdown-time').textContent = open ? portal.clock(left) : t('smeal.locked');
    document.getElementById('countdown-next').textContent = open
      ? t('smeal.countHint')
      : t('smeal.nextDay', { day: i18n.date(dates.addDays(today, 2), 'weekday') });
    const start = dates.parse(today).getTime();
    document.getElementById('countdown-bar').style.width = open ? Math.max(0, Math.min(100, ((Date.now() - start) / (deadline - start)) * 100)) + '%' : '100%';
    if (wasOpen !== null && wasOpen !== open) {
      // The deadline just passed: lock tomorrow and tell screen readers once.
      document.getElementById('countdown-status').textContent = t('smeal.justClosed', params);
      wasOpen = open;
      render();
      return;
    }
    wasOpen = open;
    if (todayPhases() !== todaySignature) drawToday();
  }

  /* ---- Today's meals (already fixed: yesterday's requests) ---- */
  function phase(meal) {
    const now = new Date();
    const clock = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    return clock < meal.from ? 'later' : clock < meal.to ? 'now' : 'done';
  }
  function todayPhases() { return MEALS.map(phase).join(','); }

  function drawToday() {
    const today = dates.today();
    todaySignature = todayPhases();
    document.getElementById('today-sub').textContent = i18n.date(today, 'full');
    const box = document.getElementById('today-meals');
    if (!portal.room()) {
      box.innerHTML = '<li>' + ui.empty({ icon: 'utensils', title: 'smeal.noRoomTitle', text: 'smeal.noRoomText', compact: true }) + '</li>';
      return;
    }
    box.innerHTML = MEALS.map(function (meal) {
      const state = phase(meal);
      const orders = mine(today).filter(function (o) { return o.meal === meal.key; });
      const badge = state === 'now' ? '<span class="badge badge--success">' + esc(t('smeal.servingNow')) + '</span>'
        : state === 'later' ? '<span class="badge badge--info">' + esc(t('smeal.startsAt', { time: i18n.time(meal.from) })) + '</span>'
          : '<span class="badge badge--neutral">' + esc(t('smeal.finished')) + '</span>';
      return '<li class="today-meal' + (state === 'now' ? ' is-now' : '') + '">' +
        '<div class="today-meal__head"><span class="today-meal__name">' + icon(MEAL_ICONS[meal.key], { size: 18 }) + esc(t('meal.' + meal.key)) + '</span>' + badge + '</div>' +
        '<p class="cell-sub">' + esc(hours(meal)) + '</p>' +
        (orders.length
          ? '<ul>' + orders.map(function (o) {
            const menu = data.find('menus', o.menu_id);
            return '<li>' + esc(t('smeal.dishTimes', { dish: menu ? i18n.field(menu, 'name') : '—', n: i18n.number(o.portions) })) + '</li>';
          }).join('') + '</ul>'
          : '<p class="muted">' + esc(t('smeal.notRequested')) + '</p>') +
        '</li>';
    }).join('');
  }

  /* ---- Day picker ---- */
  function drawDays() {
    document.getElementById('days').innerHTML = days().map(function (day, i) {
      const n = total(day);
      const open = data.mealOpen(day);
      const posted = data.menusFor(day).length > 0;
      const mark = n ? icon('check', { size: 14 }) + '<span>' + esc(t('smeal.portionsN', { n: i18n.number(n) })) + '</span>'
        : !open ? icon('lock', { size: 12 }) + '<span>' + esc(t('smeal.dayClosed')) + '</span>'
          : !posted ? '<span>' + esc(t('smeal.dayNoMenu')) + '</span>' : '&nbsp;';
      return '<button type="button" class="day-btn" data-day="' + day + '" aria-pressed="' + (day === selected) + '">' +
        '<strong>' + esc(i === 0 ? t('smeal.tomorrow') : i18n.date(day, 'weekday')) + '</strong>' +
        '<span>' + esc(i18n.date(day, 'short')) + '</span>' +
        '<span class="day-btn__mark' + (n ? '' : ' is-muted') + '">' + mark + '</span></button>';
    }).join('');
  }

  /* ---- Dishes of the selected day, one group per meal ---- */
  function dishRow(menu, open, mealTotal) {
    const order = mine(selected).filter(function (o) { return o.menu_id === menu.id; })[0];
    const n = order ? order.portions : 0;
    const name = i18n.field(menu, 'name');
    return '<li class="dish' + (n ? ' is-picked' : '') + '">' +
      '<div class="dish__text"><span class="dish__type">' + esc(t('menuType.' + menu.type)) + '</span><span class="dish__name">' + esc(name) + '</span></div>' +
      '<div class="stepper" role="group" aria-label="' + esc(t('smeal.portionsFor', { dish: name })) + '">' +
      '<button type="button" class="icon-btn icon-btn--sm stepper__btn" data-step="-1" data-menu="' + menu.id + '" aria-label="' + esc(t('smeal.less', { dish: name })) + '"' + (!open || n === 0 ? ' disabled' : '') + '>' + icon('minus', { size: 16 }) + '</button>' +
      '<output class="stepper__value">' + esc(i18n.number(n)) + '</output>' +
      '<button type="button" class="icon-btn icon-btn--sm stepper__btn" data-step="1" data-menu="' + menu.id + '" aria-label="' + esc(t('smeal.more', { dish: name })) + '"' + (!open || mealTotal >= MAX ? ' disabled' : '') + '>' + icon('plus', { size: 16 }) + '</button>' +
      '</div></li>';
  }

  function drawPicker() {
    const room = portal.room();
    const open = !!room && data.mealOpen(selected);
    const menus = data.menusFor(selected);
    const all = total(selected);
    document.getElementById('pick-sub').textContent = i18n.date(selected, 'full');

    const state = document.getElementById('meal-state');
    const groups = document.getElementById('meal-groups');
    const actions = document.getElementById('meal-actions');
    if (!menus.length) {
      state.innerHTML = '';
      actions.innerHTML = '';
      groups.innerHTML = '<div class="meal-groups__empty">' + ui.empty({ icon: 'utensils', title: 'smeal.noMenuTitle', text: 'smeal.noMenuText' }) + '</div>';
      return;
    }

    const params = Object.assign({ n: i18n.number(all), max: i18n.number(MAX) }, deadlineParams(selected));
    const note = function (tone, iconName, title, text) {
      return '<div class="notice' + (tone ? ' notice--' + tone : '') + '">' + icon(iconName, { size: 18 }) + '<div><strong>' + esc(title) + '</strong>' + esc(text) + '</div></div>';
    };
    state.innerHTML = !room ? ''
      : !open ? note(all ? 'success' : 'warning', 'lock', t('smeal.lockedTitle', params), t(all ? 'smeal.lockedSome' : 'smeal.lockedNone', params))
        : all ? note('success', 'check-circle', t('smeal.someTitle', params), t('smeal.someText', params))
          : note('', 'info', t('smeal.noneTitle'), t('smeal.noneText', params));

    groups.innerHTML = MEALS.map(function (meal) {
      const list = menus.filter(function (m) { return m.meal === meal.key; });
      const mealTotal = total(selected, meal.key);
      return '<section class="meal-group" aria-labelledby="mg-' + meal.key + '">' +
        '<div class="meal-group__head"><span class="tile tile--sm' + (mealTotal ? '' : ' tile--neutral') + '">' + icon(MEAL_ICONS[meal.key], { size: 16 }) + '</span>' +
        '<div><h3 class="meal-group__name" id="mg-' + meal.key + '">' + esc(t('meal.' + meal.key)) + '</h3><p class="cell-sub">' + esc(hours(meal)) + '</p></div>' +
        '<span class="badge ' + (mealTotal ? 'badge--success' : 'badge--neutral') + '">' + esc(t('smeal.portionsOf', { n: i18n.number(mealTotal), max: i18n.number(MAX) })) + '</span></div>' +
        (list.length
          ? '<ul class="dish-list">' + list.map(function (m) { return dishRow(m, open, mealTotal); }).join('') + '</ul>'
          : '<p class="muted">' + esc(t('smeal.mealNoMenu')) + '</p>') +
        '</section>';
    }).join('');

    actions.innerHTML = open && all
      ? '<button type="button" class="btn btn--soft-danger" id="clear-day">' + icon('x-circle', { size: 16 }) + esc(t('smeal.clearDay')) + '</button>'
      : '';
  }

  function drawNotices() {
    const me = portal.me();
    const medical = data.medicalProfile(me.id);
    let html = '';
    if (!portal.room()) {
      html += '<div class="notice notice--warning">' + icon('key', { size: 18 }) + '<div><strong>' + esc(t('smeal.noRoomTitle')) + '</strong>' + esc(t('smeal.noRoomText')) + '</div></div>';
    }
    if (medical.allergies) {
      html += '<div class="notice notice--danger">' + icon('alert', { size: 18 }) + '<div><strong>' + esc(t('smeal.allergyTitle')) + '</strong>' +
        '<span dir="auto">' + esc(t('smeal.allergyText', { allergies: medical.allergies })) + '</span></div></div>';
    }
    document.getElementById('meal-notices').innerHTML = html;
  }

  /** Adds or removes one portion of a dish and saves at once. */
  function step(menuId, delta) {
    const menu = data.find('menus', menuId);
    if (!menu || !portal.room()) return;
    if (!data.mealOpen(selected)) { render(); ui.toast(t('smeal.tooLate', deadlineParams(selected)), 'warning'); return; }
    const me = portal.me();
    const order = data.db.orders.filter(function (o) { return o.student_id === me.id && o.menu_id === menu.id && o.date === selected; })[0];
    const current = order && order.status === 'reserved' ? order.portions : 0;
    const next = current + delta;
    if (next < 0) return;
    if (delta > 0 && total(selected, menu.meal) >= MAX) {
      ui.toast(t('smeal.maxReached', { max: i18n.number(MAX), meal: t('meal.' + menu.meal) }), 'warning');
      return;
    }
    if (saving) return;
    saving = true;
    // Laravel keeps one reservation per meal and day, checks the two-portion limit and the deadline.
    DMS.api.put('/meals/orders', { menu_id: menu.id, portions: next }).then(function () {
      return data.load(['orders']);
    }).then(function () {
      drawDays();
      drawPicker();
      history.render();
      ui.announce(t(next ? 'smeal.saved' : 'smeal.removed', { dish: i18n.field(menu, 'name'), n: i18n.number(next), meal: t('meal.' + menu.meal) }));
      // Keep the keyboard on the same stepper after the redraw.
      const same = document.querySelector('[data-menu="' + menu.id + '"][data-step="' + delta + '"]');
      const other = document.querySelector('[data-menu="' + menu.id + '"][data-step="' + (-delta) + '"]');
      if (same && !same.disabled) same.focus();
      else if (other && !other.disabled) other.focus();
    }).catch(function (err) {
      if (err.code === 'mealClosed') { render(); ui.toast(t('smeal.tooLate', deadlineParams(selected)), 'warning'); return null; }
      if (err.code === 'mealMax') { ui.toast(t('smeal.maxReached', { max: i18n.number(MAX), meal: t('meal.' + menu.meal) }), 'warning'); return null; }
      return ui.failed()(err);
    }).catch(function () { return null; }).then(function () { saving = false; });
  }

  function clearDay() {
    const day = selected;
    ui.confirm({ title: t('smeal.clearTitle'), message: t('smeal.clearText', { day: i18n.date(day, 'full') }), confirm: t('smeal.clearDay') }).then(function (ok) {
      if (!ok) return null;
      if (!data.mealOpen(day)) { render(); ui.toast(t('smeal.tooLate', deadlineParams(day)), 'warning'); return null; }
      return DMS.api.del('/meals/orders/' + day)
        .then(function () { return data.load(['orders']); })
        .then(function () { render(); ui.toast(t('smeal.toastCleared', { day: i18n.date(day, 'full') }), 'info'); })
        .catch(function (err) {
          if (err.code === 'mealClosed') { render(); ui.toast(t('smeal.tooLate', deadlineParams(day)), 'warning'); return null; }
          return ui.failed()(err);
        });
    });
  }

  function render() {
    drawnOn = dates.today();
    // Start on the first day that can still be changed.
    if (!selected || days().indexOf(selected) === -1) {
      selected = days().filter(function (day) { return data.mealOpen(day); })[0] || days()[0];
    }
    drawNotices();
    drawToday();
    drawDays();
    drawPicker();
    history.render();
    tick();
  }

  function init() {
    const me = portal.me();
    history = DMS.list.create({
      root: document.getElementById('history'),
      items: function () { return data.db.orders.filter(function (o) { return o.student_id === me.id && DMS.app.term.hasDate(o.date); }); },
      sort: function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : MEAL_ORDER[a.meal] - MEAL_ORDER[b.meal]; },
      pageSize: 9,
      render: function (o) {
        const menu = data.find('menus', o.menu_id);
        const meal = MEALS.filter(function (m) { return m.key === o.meal; })[0];
        return '<tr>' +
          ui.td('common.date', '<span class="cell-main">' + esc(i18n.date(o.date, 'weekday')) + '</span><span class="cell-sub">' + esc(i18n.date(o.date, 'medium')) + '</span>') +
          ui.td('smeal.meal', '<span class="cell-main">' + esc(t('meal.' + o.meal)) + '</span><span class="cell-sub">' + esc(hours(meal)) + '</span>') +
          ui.td('smeal.dish', menu ? '<span class="cell-main">' + esc(i18n.field(menu, 'name')) + '</span><span class="cell-sub">' + esc(t('menuType.' + menu.type)) + '</span>' : '—') +
          ui.td('smeal.portions', o.status === 'reserved' ? '<strong class="num">' + esc(i18n.number(o.portions)) + '</strong>' : '—', 'num') +
          ui.td('common.status', ui.badge(o.status)) +
          '</tr>';
      },
      empty: { icon: 'utensils', title: 'smeal.historyEmpty', text: 'smeal.historyEmptyText' },
    });

    document.getElementById('days').addEventListener('click', function (event) {
      const b = event.target.closest('[data-day]');
      if (!b) return;
      selected = b.getAttribute('data-day');
      drawDays();
      drawPicker();
      const again = document.querySelector('[data-day="' + selected + '"]');
      if (again) again.focus();
    });
    document.getElementById('meal-groups').addEventListener('click', function (event) {
      const b = event.target.closest('[data-step]');
      if (b && !b.disabled) step(Number(b.getAttribute('data-menu')), Number(b.getAttribute('data-step')));
    });
    document.getElementById('meal-actions').addEventListener('click', function (event) {
      if (event.target.closest('#clear-day')) clearDay();
    });

    render();
    global.setInterval(tick, 1000);
  }

  DMS.app.page({ needs: ['menus', 'orders', 'medical_profiles'], init: init, render: render });
})(window);
