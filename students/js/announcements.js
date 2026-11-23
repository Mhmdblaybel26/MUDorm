/* ==========================================================================
   announcements.js — dorm news and the student's own notifications.
   Two tabs: "News" (announcements from the dorm office, pinned first, new
   ones marked) and "Notifications" (decisions on tickets, leave and swap
   requests, room changes and live alerts). Opening the news tab marks the
   news as seen, which clears the sidebar badge.
   Every item has a "Details" button. News opens in full; a notification
   shows what it is about (the announcement, the rule, the doctor's answer)
   and a link to the page where the student can act on it.
   Links: #notifications, #news-<id> and #alert-<id> open a tab or an item.
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

  // Where the student acts on each kind of notification: [page, menu label].
  const TARGETS = {
    complaint_status: ['maintenance.html', 'snav.maintenance'], complaint_assigned: ['maintenance.html', 'snav.maintenance'],
    maintenance_visit: ['maintenance.html', 'snav.maintenance'], leave_decision: ['leave.html', 'snav.leave'],
    swap_decision: ['swap.html', 'snav.swap'], swap_request: ['swap.html', 'snav.swap'],
    room_allocated: ['index.html', 'snav.home'], room_ended: ['index.html', 'snav.home'], rating: ['index.html', 'snav.home'],
    meal_reminder: ['meals.html', 'snav.meals'], profile_updated: ['settings.html#profile', 'snav.profile'],
    rules_updated: ['rules.html', 'snav.rules'], health_update: ['health.html', 'snav.health'],
  };

  let tab = 'news';
  // News newer than this was unread when the page opened; it stays marked "New" until the student leaves.
  let seenAtOpen = '';
  // The item whose details are open, to give the keyboard back to its button after a redraw.
  let opened = null;

  /** News of the chosen academic year and semester. Pinned news is shown whatever the term. */
  function news() {
    return data.db.announcements.filter(function (a) { return a.pinned || DMS.app.term.hasDate(a.date); }).sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at < b.created_at ? 1 : -1);
    });
  }
  /** The student's own notifications (the API never returns anyone else's). */
  function alerts() {
    return data.db.notifications.slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  function count(n) { return n ? '<span class="badge badge--accent">' + esc(i18n.number(n)) + '</span>' : ''; }
  function detailsButton(attr, id, label) {
    return '<button type="button" class="btn btn--secondary btn--sm" ' + attr + '="' + id + '" aria-label="' + esc(label) + '">' +
      icon('eye', { size: 16 }) + esc(t('sann.details')) + '</button>';
  }
  /** Typed text kept as paragraphs. */
  function paragraphs(text) {
    return String(text || '').split(/\n+/).filter(Boolean).map(function (p) { return '<p dir="auto">' + esc(p) + '</p>'; }).join('');
  }
  /** "Translated automatically" when the reader's language was not the one the office typed in. */
  function translatedNote(record, base) {
    return record[base + '_' + i18n.lang()] ? '' : '<p class="cell-sub">' + icon('info', { size: 14 }) + ' ' + esc(t('sann.translated')) + '</p>';
  }

  function drawNews() {
    const list = news();
    document.getElementById('news').innerHTML = list.length ? list.map(function (a) {
      const isNew = a.created_at > seenAtOpen;
      const title = i18n.field(a, 'title');
      return '<li class="ann' + (a.pinned ? ' is-pinned' : '') + '"><div><p class="ann__meta">' +
        (a.pinned ? '<span class="badge badge--accent">' + esc(t('sann.pinned')) + '</span>' : '') +
        (isNew ? '<span class="badge badge--info">' + esc(t('sann.new')) + '</span>' : '') +
        '<time datetime="' + esc(a.date) + '">' + esc(i18n.date(a.date, 'full')) + '</time></p>' +
        '<h3 class="ann__title">' + esc(title) + '</h3>' +
        '<p class="ann__body ann__body--clamp">' + esc(i18n.field(a, 'body')) + '</p>' +
        '<div class="ann__actions">' + detailsButton('data-news', a.id, t('sann.detailsLabel', { title: title })) + '</div></div></li>';
    }).join('') : '<li>' + ui.empty({ icon: 'megaphone', title: 'sann.emptyNews', text: 'sann.emptyNewsTerm' }) + '</li>';
  }

  function drawAlerts() {
    const list = alerts();
    const unread = list.filter(function (n) { return !n.read; }).length;
    document.getElementById('alerts-read').disabled = !unread;
    document.getElementById('alerts').innerHTML = list.length ? list.map(function (n) {
      return '<li class="notif-item' + (n.read ? '' : ' is-unread') + '">' + ui.alertIcon(n) +
        '<div>' + (n.read ? '' : '<span class="sr-only">' + esc(t('notif.unread')) + ': </span>') + '<span dir="auto">' + esc(ui.alertText(n)) + '</span>' +
        '<time datetime="' + esc(n.at) + '" title="' + esc(i18n.dateTime(n.at)) + '">' + esc(i18n.relative(n.at)) + '</time></div>' +
        detailsButton('data-alert', n.id, t('sann.alertLabel', { text: ui.alertText(n) })) + '</li>';
    }).join('') : '<li>' + ui.empty({ icon: 'bell', title: 'sann.emptyAlerts', text: 'sann.emptyAlertsText' }) + '</li>';
  }

  function drawTabs() {
    const me = portal.me();
    const fresh = data.db.announcements.filter(function (a) { return a.created_at > (me.announcements_seen_at || ''); }).length;
    const unread = alerts().filter(function (n) { return !n.read; }).length;
    document.getElementById('news-count').innerHTML = count(fresh);
    document.getElementById('alert-count').innerHTML = count(unread);
    document.querySelectorAll('#tabs [data-tab]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === tab)); });
    document.getElementById('panel-news').hidden = tab !== 'news';
    document.getElementById('panel-notifications').hidden = tab !== 'notifications';
  }

  function markNewsSeen() {
    const me = portal.me();
    const latest = data.db.announcements.reduce(function (m, a) { return a.created_at > m ? a.created_at : m; }, '');
    if (latest && latest > (me.announcements_seen_at || '')) {
      me.announcements_seen_at = data.now();
      DMS.app.refreshShell();
      DMS.api.patch('/me', { announcements_seen: true }).catch(function () { return null; });
    }
  }

  /* ---- Details ---- */
  function openDetails(title, sub, body, foot) {
    document.getElementById('detail-title').textContent = title;
    document.getElementById('detail-sub').innerHTML = sub;
    document.getElementById('detail-body').innerHTML = body;
    document.getElementById('detail-foot').innerHTML = (foot || '') +
      '<button type="button" class="btn btn--ghost" data-close>' + esc(t('common.close')) + '</button>';
    ui.openModal(document.getElementById('detail-modal'));
  }

  function showNews(a) {
    opened = { attr: 'data-news', id: a.id };
    openDetails(i18n.field(a, 'title'),
      (a.pinned ? '<span class="badge badge--accent">' + esc(t('sann.pinned')) + '</span> ' : '') +
        '<time datetime="' + esc(a.date) + '">' + esc(i18n.date(a.date, 'full')) + '</time>',
      '<div class="prose">' + paragraphs(i18n.field(a, 'body')) + '</div>' + translatedNote(a, 'body'));
  }

  /** What a notification is about, in full, when that record still exists. */
  function alertSubject(n) {
    const p = n.params || {};
    if (n.type === 'announcement' && p.id) {
      const a = data.find('announcements', p.id);
      if (a) return '<h3 class="detail-quote__title" dir="auto">' + esc(i18n.field(a, 'title')) + '</h3>' + paragraphs(i18n.field(a, 'body'));
    }
    if (n.type === 'rules_updated' && p.id) {
      const rule = data.find('rules', p.id);
      if (rule) return '<h3 class="detail-quote__title" dir="auto">' + esc(i18n.field(rule, 'title')) + '</h3>' + paragraphs(i18n.field(rule, 'body'));
    }
    if (n.type === 'health_update' && p.ref) {
      const r = data.db.health_requests.filter(function (x) { return x.ref === p.ref; })[0];
      if (r) {
        return '<dl class="details">' +
          '<div class="details__item"><dt>' + esc(t('common.status')) + '</dt><dd>' + ui.badge(r.status) + '</dd></div>' +
          '<div class="details__item"><dt>' + esc(t('shealth.colAppointment')) + '</dt><dd>' +
            esc(r.appointment_at && r.status !== 'cancelled' ? i18n.dateTime(r.appointment_at) : t('shealth.noAppointment')) + '</dd></div>' +
          '<div class="details__item details__item--full"><dt>' + esc(t('shealth.colProblem')) + '</dt><dd dir="auto">' + esc(ui.tr(r.symptoms)) + '</dd></div>' +
          (r.note ? '<div class="details__item details__item--full"><dt>' + esc(t('sann.doctorNote')) + '</dt><dd dir="auto">' + esc(ui.tr(r.note)) + '</dd></div>' : '') +
          '</dl>';
      }
    }
    return '';
  }

  function showAlert(n) {
    opened = { attr: 'data-alert', id: n.id };
    if (!n.read) {
      n.read = true;
      DMS.api.post('/notifications/' + encodeURIComponent(n.id) + '/read').catch(function () { return null; });
      DMS.app.refreshBell(false);
      drawTabs();
      drawAlerts();
    }
    const subject = alertSubject(n);
    const target = TARGETS[n.type];
    openDetails(t('sann.alertTitle'),
      '<time datetime="' + esc(n.at) + '">' + esc(i18n.dateTime(n.at)) + '</time>',
      '<div class="notif-detail">' + ui.alertIcon(n) + '<p dir="auto">' + esc(ui.alertText(n)) + '</p></div>' +
        (subject ? '<div class="detail-quote">' + subject + '</div>' : ''),
      target ? '<a class="btn btn--primary" href="' + target[0] + '">' + esc(t('sann.goTo', { page: t(target[1]) })) + '</a>' : '');
  }

  function render() {
    if (tab === 'news') markNewsSeen();
    drawTabs();
    drawNews();
    drawAlerts();
  }

  function show(next, focus) {
    tab = next;
    render();
    if (global.history && global.history.replaceState) {
      try { global.history.replaceState(null, '', next === 'notifications' ? '#notifications' : global.location.pathname + global.location.search); } catch (e) { /* file:// may refuse */ }
    }
    if (focus) document.querySelector('#tabs [data-tab="' + next + '"]').focus();
  }

  /** #notifications, #news-3 or #alert-<uuid>: the tab to show and, when named, the item to open. */
  function followHash() {
    const hash = global.location.hash;
    const m = /^#(news|alert)-([0-9a-f-]+)$/i.exec(hash);
    show(hash === '#notifications' || (m && m[1] === 'alert') ? 'notifications' : 'news', false);
    if (!m) return;
    if (m[1] === 'news') { const a = data.find('announcements', m[2]); if (a) showNews(a); }
    else { const n = data.find('notifications', m[2]); if (n) showAlert(n); }
  }

  function init() {
    seenAtOpen = portal.me().announcements_seen_at || '';
    document.getElementById('tabs').addEventListener('click', function (event) {
      const b = event.target.closest('[data-tab]');
      if (b) show(b.getAttribute('data-tab'), false);
    });
    // The bell's links land here with #notifications or #alert-<id>, also when this page is already open.
    global.addEventListener('hashchange', followHash);
    document.getElementById('alerts-read').addEventListener('click', function () {
      DMS.app.markAllRead();
      DMS.app.refreshBell(false);
      render();
      document.querySelector('#tabs [data-tab="notifications"]').focus();
      ui.toast(t('sann.toastRead'), 'info');
    });

    document.getElementById('news').addEventListener('click', function (event) {
      const b = event.target.closest('[data-news]');
      const a = b && data.find('announcements', b.getAttribute('data-news'));
      if (a) showNews(a);
    });
    document.getElementById('alerts').addEventListener('click', function (event) {
      const b = event.target.closest('[data-alert]');
      const n = b && data.find('notifications', b.getAttribute('data-alert'));
      if (n) showAlert(n);
    });
    // Reading a notification redraws the list, so the button that opened it is a new one by now.
    const detail = document.getElementById('detail-modal');
    detail.addEventListener('close', function () {
      if (!opened) return;
      const again = document.querySelector('[' + opened.attr + '="' + opened.id + '"]');
      opened = null;
      // Right after closing, focus may still sit on the hidden dialog's own button.
      const lost = !document.activeElement || document.activeElement === document.body || detail.contains(document.activeElement);
      if (again && lost) again.focus();
    });

    followHash();
  }

  DMS.app.page({ needs: ['rules', 'health_requests'], init: init, render: render });
})(window);
