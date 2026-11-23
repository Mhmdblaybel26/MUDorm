/* ==========================================================================
   dashboard.js — summary cards, the two charts, recent activity and the
   "needs attention" list. Every figure is calculated by Laravel from the
   database (GET /api/dashboard) and refreshed live while the page is open.
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

  function kpis(s) {
    const cards = [
      { href: 'allocation.html', icon: 'users', tone: '', label: 'dash.kpiResidents', value: i18n.number(s.residents), meta: t('dash.kpiResidentsMeta', { free: i18n.number(s.beds - s.residents) }) },
      { href: 'rooms.html', icon: 'chart', tone: 'info', label: 'dash.kpiOccupancy', value: i18n.percent(s.occupancy), meta: t('dash.kpiOccupancyMeta', { used: i18n.number(s.residents), beds: i18n.number(s.beds) }) },
      { href: 'rooms.html', icon: 'door', tone: 'neutral', label: 'dash.kpiEmpty', value: i18n.number(s.emptyRooms), meta: t('dash.kpiEmptyMeta', { n: i18n.number(s.maintenanceRooms) }) },
      { href: 'complaints.html', icon: 'wrench', tone: 'warning', label: 'dash.kpiTickets', value: i18n.number(s.pendingTickets), meta: t('dash.kpiTicketsMeta', { n: i18n.number(s.inProgressTickets) }) },
      { href: 'applications.html', icon: 'clipboard', tone: 'danger', label: 'dash.kpiApps', value: i18n.number(s.pendingApplications), meta: t('dash.kpiAppsMeta', { n: i18n.number(s.waitingForRoom) }) },
    ];
    document.getElementById('kpis').innerHTML = cards.map(function (c) {
      return (
        '<a class="stat" href="' + c.href + '">' +
        '<span class="tile' + (c.tone ? ' tile--' + c.tone : '') + '">' + icon(c.icon, { size: 20 }) + '</span>' +
        '<span><span class="stat__label">' + esc(t(c.label)) + '</span>' +
        '<span class="stat__value">' + esc(c.value) + '</span>' +
        '<span class="stat__meta">' + esc(c.meta) + '</span></span></a>'
      );
    }).join('');
  }

  function charts(s) {
    DMS.charts.bars(document.getElementById('occ-chart'), {
      title: t('dash.occTitle'),
      tableHeaders: [t('common.wing'), t('dash.occRate'), t('dash.occBeds')],
      items: s.wings.map(function (w) {
        return { label: t('wing.' + w.wing), value: w.rate, detail: t('dash.bedsOf', { used: i18n.number(w.used), beds: i18n.number(w.beds) }) };
      }),
    });
    DMS.charts.donut(document.getElementById('cmp-chart'), {
      title: t('dash.cmpTitle'),
      caption: t('dash.tickets'),
      tableHeaders: [t('common.status'), t('dash.tickets'), t('dash.share')],
      segments: ['pending', 'in_progress', 'resolved'].map(function (key) {
        return { key: key, label: t('status.' + key), value: s.complaintsByStatus[key] };
      }),
    });
  }

  function activity() {
    const items = data.db.activity.slice(0, 7);
    document.getElementById('activity').innerHTML = items.length
      ? '<ul class="activity">' + items.map(function (a) {
        return '<li class="activity__item">' + ui.activityIcon(a.type) +
          '<div><p class="activity__text">' + esc(ui.activityText(a)) + '</p>' +
          '<time class="activity__time" datetime="' + esc(a.at) + '">' + esc(i18n.relative(a.at)) + '</time></div></li>';
      }).join('') + '</ul>'
      : ui.empty({ icon: 'inbox', title: 'dash.activityEmpty', text: 'dash.activityEmptyText', compact: true });
  }

  function attention(s) {
    const tomorrow = data.dates.addDays(data.dates.today(), 1);
    const meals = data.mealCounts(tomorrow);
    // Meals of tomorrow that still have no dish: students cannot request them.
    const unposted = data.config.meals.filter(function (m) { return data.menusFor(tomorrow, m.key).length === 0; }).length;
    const rows = [
      { href: 'applications.html', icon: 'clipboard', tone: 'info', label: 'dash.needApps', n: s.pendingApplications },
      { href: 'allocation.html', icon: 'key', tone: 'info', label: 'dash.needRoom', n: s.waitingForRoom },
      { href: 'complaints.html', icon: 'wrench', tone: 'warning', label: 'dash.needTickets', n: s.pendingTickets },
      { href: 'leave-requests.html', icon: 'luggage', tone: 'neutral', label: 'dash.needLeaves', n: s.pendingLeaves },
      { href: 'room-swaps.html', icon: 'swap', tone: 'neutral', label: 'dash.needSwaps', n: s.pendingSwaps },
      { href: 'meal-menus.html', icon: 'utensils', tone: 'warning', label: 'dash.needMenu', n: unposted },
      { href: 'health.html#emergencies', icon: 'alert', tone: 'danger', label: 'dash.needEmergency', n: s.openEmergencies },
    ];
    document.getElementById('attention').innerHTML =
      '<ul class="activity">' + rows.map(function (r) {
        return '<li class="activity__item"><span class="tile tile--sm tile--' + r.tone + '">' + icon(r.icon, { size: 16 }) + '</span>' +
          '<div class="attention-row">' +
          '<a href="' + r.href + '" class="activity__text">' + esc(t(r.label)) + '</a>' +
          (r.n > 0 ? '<span class="badge badge--warning badge--plain">' + esc(i18n.number(r.n)) + '</span>' : '<span class="badge badge--success badge--plain">' + esc(t('dash.clear')) + '</span>') +
          '</div></li>';
      }).join('') + '</ul>' +
      '<div class="notice notice--accent notice--spaced">' + icon('utensils', { size: 18 }) +
      '<div><strong>' + esc(t('dash.mealsTomorrow', { n: i18n.number(meals.total), students: i18n.number(meals.students) })) + '</strong>' +
      esc(t('dash.mealsSplit', { breakfast: i18n.number(meals.breakfast), lunch: i18n.number(meals.lunch), dinner: i18n.number(meals.dinner) })) + ' ' +
      esc(t(data.mealOpen(tomorrow) ? 'dash.mealsOpen' : 'dash.mealsFinal', { time: i18n.time(data.db.settings.meal_cutoff) })) + '</div></div>';
  }

  function render() {
    const s = data.stats();
    kpis(s);
    charts(s);
    activity();
    attention(s);
  }

  DMS.app.page({ needs: ['menus'], init: render, render: render });
})(window);
