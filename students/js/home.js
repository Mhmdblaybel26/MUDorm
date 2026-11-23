/* ==========================================================================
   home.js — housing dashboard: my room and wing, roommates, quick links
   (tomorrow's meals, tickets, requests, news) and the digital dorm pass with
   a QR code to show at the gate. The pass can also be printed as a housing
   card (front and back, bank-card size).
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

  function fact(label, value) {
    return '<div><dt>' + esc(label) + '</dt><dd>' + value + '</dd></div>';
  }

  function drawRoom(me, room, allocation) {
    const box = document.getElementById('room');
    if (!room) {
      box.innerHTML = '<div class="card">' + ui.empty({ icon: 'key', title: 'shome.noRoomTitle', text: 'shome.noRoomText' }) + '</div>';
      return;
    }
    const used = data.occupants(room.id).length;
    let beds = '';
    for (let i = 0; i < room.capacity; i += 1) beds += '<span' + (i < used ? ' class="is-taken"' : '') + '></span>';
    box.innerHTML =
      '<article class="room-card">' +
      '<div class="room-card__top"><div><p class="room-card__label">' + esc(t('shome.yourRoom')) + '</p>' +
      '<p class="room-card__number ltr">' + esc(room.number) + '</p></div>' +
      '<div class="beds" role="img" aria-label="' + esc(t('shome.bedsLabel', { used: i18n.number(used), capacity: i18n.number(room.capacity) })) + '">' + beds + '</div></div>' +
      '<dl class="room-card__facts">' +
      fact(t('common.wing'), esc(t('wing.' + room.wing))) +
      fact(t('shome.floor'), esc(i18n.number(room.floor))) +
      fact(t('shome.type'), esc(t('roomType.' + room.type))) +
      fact(t('shome.stay'), esc(t('shome.until', { date: i18n.date(allocation.end_date, 'medium') }))) +
      '</dl></article>';
  }

  function drawMates(me, room) {
    const box = document.getElementById('mates');
    if (!room) { box.innerHTML = ui.empty({ icon: 'users', title: 'shome.matesLaterTitle', text: 'shome.matesLaterText', compact: true }); return; }
    const mates = data.roommates(me.id);
    box.innerHTML = mates.length
      ? '<ul class="mates">' + mates.map(function (m) {
        return '<li class="mate">' + ui.avatar(m, 'lg') + '<div>' +
          '<p class="mate__name" dir="auto">' + esc(i18n.name(m)) + '</p>' +
          '<p class="mate__sub">' + esc(t('major.' + m.major)) + ' · ' + esc(t('common.yearN', { n: i18n.number(m.year) })) + '</p>' +
          (m.email ? '<p class="mate__sub"><a class="ltr" href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a></p>' : '') + '</div></li>';
      }).join('') + '</ul>'
      : ui.empty({ icon: 'users', title: 'shome.aloneTitle', text: 'shome.aloneText', compact: true });
  }

  function quickTile(href, iconName, tone, label, value, meta) {
    return '<a class="stat" href="' + href + '"><span class="tile' + (tone ? ' tile--' + tone : '') + '">' + icon(iconName, { size: 20 }) + '</span>' +
      '<span><span class="stat__label">' + esc(label) + '</span><span class="stat__value">' + esc(value) + '</span>' +
      '<span class="stat__meta">' + esc(meta) + '</span></span></a>';
  }

  function drawQuick(me, room) {
    const tomorrow = data.dates.addDays(data.dates.today(), 1);
    const portions = portal.ordersFor(me.id, tomorrow).reduce(function (sum, o) { return sum + o.portions; }, 0);
    const left = data.mealDeadline(tomorrow).getTime() - Date.now();
    const mealsMeta = !room ? t('shome.mealsNoRoom') : left > 0
      ? t('shome.mealsCloses', { time: portal.clock(left).slice(0, 5) })
      : t('shome.mealsClosed', { time: i18n.time(data.db.settings.meal_cutoff) });
    const openTickets = data.db.complaints.filter(function (c) { return c.student_id === me.id && c.status !== 'resolved'; }).length;
    const pending = data.db.leaves.filter(function (l) { return l.student_id === me.id && l.status === 'pending'; }).length +
      data.db.swaps.filter(function (w) { return w.requester_id === me.id && w.status === 'pending'; }).length;
    const news = data.db.announcements.filter(function (a) { return a.created_at > (me.announcements_seen_at || ''); }).length;
    document.getElementById('quick').innerHTML =
      quickTile('meals.html', 'utensils', '', t('shome.mealsTomorrow'), portions ? t('shome.portionsN', { n: i18n.number(portions) }) : t('shome.notRequested'), mealsMeta) +
      quickTile('maintenance.html', 'wrench', 'warning', t('shome.openTickets'), i18n.number(openTickets), t('shome.ticketsMeta')) +
      quickTile('leave.html', 'luggage', 'info', t('shome.pendingRequests'), i18n.number(pending), t('shome.requestsMeta')) +
      quickTile('announcements.html', 'megaphone', 'neutral', t('shome.news'), i18n.number(news), t('shome.newsMeta'));
  }

  function drawPass(me, room, allocation) {
    const code = portal.passCode();
    const qr = portal.qrSvg(portal.passPayload(), t('shome.qrLabel', { name: i18n.name(me) }));
    document.getElementById('pass').innerHTML =
      '<article class="pass">' +
      '<div class="pass__head"><div class="pass__brand"><img src="../manager/assets/logo-mark.svg" alt="" width="40" height="40">' +
      '<div><strong>' + esc(t('shome.passTitle')) + '</strong><span>' + esc(t('shome.passTerm')) + '</span></div></div>' +
      (room ? ui.badge('active') : '<span class="badge badge--warning">' + esc(t('shome.passInactive')) + '</span>') + '</div>' +
      '<div class="pass__qr">' + (qr || '<p>' + esc(t('shome.qrOffline')) + '</p>') + '</div>' +
      '<div class="pass__who">' + ui.avatar(me, 'lg') + '<div><strong dir="auto">' + esc(i18n.name(me)) + '</strong>' +
      '<span>' + esc(t('shome.passId', { id: me.university_id })) + '</span><br>' +
      '<span>' + esc(room ? t('shome.passRoom', { room: i18n.isolate(room.number), date: i18n.date(allocation.end_date, 'medium') }) : t('shome.passNoRoom')) + '</span></div></div>' +
      '<p class="pass__code" dir="ltr">' + esc(code) + '</p>' +
      (qr ? '<button type="button" class="btn btn--glass btn--block" id="pass-open">' + icon('expand', { size: 16 }) + esc(t('shome.passOpen')) + '</button>' : '') +
      '<button type="button" class="btn btn--glass btn--block" id="pass-print"' + (room && qr ? '' : ' disabled aria-describedby="pass-print-hint"') + '>' +
      icon('printer', { size: 16 }) + esc(t('shome.passPrint')) + '</button>' +
      (room && qr ? '' : '<p class="pass__foot" id="pass-print-hint">' + esc(t(room ? 'shome.printOffline' : 'shome.printNoRoom')) + '</p>') +
      '<p class="pass__foot">' + esc(t('shome.passHint')) + '</p></article>';
    document.getElementById('pass-print').addEventListener('click', printCard);
    drawCard(me, room, allocation, code, qr);
    const open = document.getElementById('pass-open');
    if (open) {
      open.addEventListener('click', function () {
        document.getElementById('pass-big-qr').innerHTML = qr;
        document.getElementById('pass-big-code').textContent = code;
        ui.openModal(document.getElementById('pass-modal'));
      });
    }
  }

  /* ---- Printable housing card ---- */
  function cardFact(label, value) { return '<div><dt>' + esc(label) + '</dt><dd>' + value + '</dd></div>'; }

  /** Fills the print-only sheet: the front and the back of the card, to cut out. */
  function drawCard(me, room, allocation, code, qr) {
    const sheet = document.getElementById('id-card');
    if (!room || !qr) { sheet.innerHTML = ''; return; }
    const year = allocation.start_date.slice(0, 4) + '–' + allocation.end_date.slice(0, 4);
    sheet.innerHTML =
      '<p class="idcard-sheet__title">' + esc(t('shome.cardSheet', { name: i18n.name(me) })) + '</p>' +
      '<article class="idcard">' +
      '<header class="idcard__head"><img src="../manager/assets/logo-mark.svg" alt="">' +
      '<div><strong>' + esc(t('shome.cardUni')) + '</strong><span>' + esc(t('shome.cardTitle')) + '</span></div>' +
      '<span class="idcard__year">' + esc(year) + '</span></header>' +
      '<div class="idcard__body">' +
      '<div class="idcard__photo">' + (me.avatar ? '<img src="' + esc(me.avatar) + '" alt="">' : '<span>' + esc(ui.initials(i18n.name(me))) + '</span>') + '</div>' +
      '<div class="idcard__who"><p class="idcard__name">' + esc(me.name) + '</p>' +
      (me.name_ar ? '<p class="idcard__name idcard__name--ar" lang="ar" dir="rtl">' + esc(me.name_ar) + '</p>' : '') +
      '<dl class="idcard__facts">' +
      cardFact(t('shome.cardId'), '<span dir="ltr">' + esc(me.university_id) + '</span>') +
      cardFact(t('common.room'), '<span dir="ltr">' + esc(room.number) + '</span> · ' + esc(t('wing.' + room.wing))) +
      cardFact(t('shome.cardMajor'), esc(t('major.' + me.major))) +
      cardFact(t('shome.cardValid'), esc(i18n.date(allocation.end_date, 'medium'))) +
      '</dl></div>' +
      '<div class="idcard__qr">' + qr + '</div></div>' +
      '<footer class="idcard__foot" dir="ltr">' + esc(code) + '</footer></article>' +
      '<article class="idcard idcard--back">' +
      '<h3>' + esc(t('shome.cardBackTitle')) + '</h3>' +
      '<ul><li>' + esc(t('shome.cardRule1')) + '</li><li>' + esc(t('shome.cardRule2')) + '</li><li>' + esc(t('shome.cardRule3')) + '</li></ul>' +
      '<p class="idcard__office">' + esc(t('shome.cardOffice')) + ' · ' + ui.mailLink(data.config.housingEmail) + '</p></article>' +
      '<p class="idcard-sheet__hint">' + esc(t('shome.cardCut')) + '</p>';
  }

  /** Prints only the card: the class switches the print styles on for this one print job. */
  function printCard() {
    const rootEl = document.documentElement;
    rootEl.classList.add('print-idcard');
    const done = function () {
      rootEl.classList.remove('print-idcard');
      global.removeEventListener('afterprint', done);
    };
    global.addEventListener('afterprint', done);
    global.print();
  }

  function render() {
    const me = portal.me();
    const room = portal.room();
    const allocation = portal.allocation();
    document.getElementById('home-title').textContent = t('shome.title', { name: i18n.name(me).split(' ')[0] });
    drawRoom(me, room, allocation);
    drawMates(me, room);
    drawQuick(me, room);
    drawPass(me, room, allocation);
  }

  function init() {
    render();
    // Keep the lunch tile's "closes in" time current.
    global.setInterval(function () { drawQuick(portal.me(), portal.room()); }, 30000);
  }

  DMS.app.page({ needs: ['pass', 'orders', 'complaints', 'leaves', 'swaps'], init: init, render: render });
})(window);
