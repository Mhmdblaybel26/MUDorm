/* ==========================================================================
   app.js — runs on every admin page.

   - sign-in guard: the page opens only with a valid Laravel (Sanctum) token
     for its area; the administrator's mandatory first-login setup is shown
     as a popup that cannot be closed (the API refuses everything else too)
   - loads the page's records from the API, then draws the page; polls the
     API for news (new notifications, changed records) and redraws live
   - renders the shared sidebar and top bar
   - language toggle, light/dark theme toggle, dropdowns, mobile drawer
   - shared helpers used by the page scripts:
       DMS.ui    escaping, badges, empty states, toasts, confirm dialog,
                 modals, image reading, CSV download
       DMS.form  read/fill forms and show validation errors
       DMS.list  search + filters + pagination for any table or card list
       DMS.app   page registration and shell refresh

   Each page script calls DMS.app.page({ needs, init, render }). needs lists
   the collections the page reads (data.load); init runs once after they
   arrived and the shell is drawn; render runs again whenever the language
   changes or the data was reloaded.

   The same shell serves the student portal (../students/): pages there carry
   <body data-area="student">, which switches the menu, the sign-in guard, the
   profile menu and the bell to the signed-in student.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const icon = DMS.icons.icon;
  const data = DMS.data;
  const storage = DMS.storage;

  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Every dynamic value goes through esc() before it reaches innerHTML. */
  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (ch) { return ESCAPES[ch]; });
  }

  /* ======================================================================
     Navigation: the admin sections (the 13 of the brief, plus Rules and Health)
     ====================================================================== */
  const NAV = [
    { id: 'dashboard', href: 'dashboard.html', icon: 'dashboard' },
    { id: 'applications', href: 'applications.html', icon: 'clipboard', badge: function (s) { return s.pendingApplications; } },
    { id: 'appForm', href: 'application-form.html', icon: 'file' },
    { id: 'students', href: 'students.html', icon: 'users' },
    { id: 'rooms', href: 'rooms.html', icon: 'bed' },
    { id: 'allocation', href: 'allocation.html', icon: 'key' },
    { id: 'menus', href: 'meal-menus.html', icon: 'utensils' },
    { id: 'complaints', href: 'complaints.html', icon: 'wrench', badge: function (s) { return s.pendingTickets; } },
    { id: 'leaves', href: 'leave-requests.html', icon: 'luggage', badge: function (s) { return s.pendingLeaves; } },
    { id: 'swaps', href: 'room-swaps.html', icon: 'swap', badge: function (s) { return s.pendingSwaps; } },
    { id: 'announcements', href: 'announcements.html', icon: 'megaphone' },
    { id: 'rules', href: 'rules.html', icon: 'shield' },
    { id: 'health', href: 'health.html', icon: 'heart', badge: function (s) { return s.pendingHealth; } },
    { id: 'ratings', href: 'room-ratings.html', icon: 'star' },
    { id: 'settings', href: 'settings.html', icon: 'settings' },
  ];

  const AREA = document.body.getAttribute('data-area') === 'student' ? 'student' : 'admin';

  // The student portal's menu (pages in ../students/).
  const STUDENT_NAV = [
    { id: 'home', href: 'index.html', icon: 'home' },
    { id: 'meals', href: 'meals.html', icon: 'utensils' },
    { id: 'progress', href: 'progress.html', icon: 'book' },
    { id: 'maintenance', href: 'maintenance.html', icon: 'wrench' },
    { id: 'health', href: 'health.html', icon: 'heart' },
    { id: 'leave', href: 'leave.html', icon: 'luggage' },
    { id: 'swap', href: 'swap.html', icon: 'swap' },
    { id: 'announcements', href: 'announcements.html', icon: 'megaphone', badge: function (c) { return c.announcements; } },
    { id: 'rules', href: 'rules.html', icon: 'shield' },
    // "My profile" is a tab of the Settings page.
    { id: 'settings', href: 'settings.html', icon: 'settings' },
  ];

  /* ======================================================================
     Session. Students and the dorm manager both log in on ../login/, which
     keeps the Laravel token of each area (DMS.api). Laravel checks the token
     on every request; this page only decides where to send a visitor.
     ====================================================================== */
  const LOGIN_PAGE = '../login/index.html';
  // Opened from the admin console, the log-in page shows its form even when a
  // student is still logged in on this browser, instead of opening their portal.
  const MANAGER_LOGIN = LOGIN_PAGE + '?as=manager';
  const api = DMS.api;
  api.setArea(AREA);
  const auth = {
    isSignedIn: function () { return !!api.token('admin'); },
    signOut: function () {
      return api.post('/auth/logout').catch(function () { return null; }).then(function () { api.clearToken('admin'); });
    },
  };
  const studentAuth = {
    /** The signed-in student's profile (students collection shape). */
    current: function () { return data.db.me && data.db.me.student ? data.db.me.student : null; },
    signOut: function () {
      return api.post('/auth/logout').catch(function () { return null; }).then(function () { api.clearToken('student'); });
    },
  };

  /* ======================================================================
     Automatic translation (js/translate.js): text typed in one language is
     shown translated to a reader using the other one.
     ====================================================================== */
  const tr = DMS.translate ? DMS.translate.text : function (value) { return value; };
  // Content kept as *_en / *_ar (announcements, dishes, rules): when it was not
  // typed in the reader's language, the other version is translated.
  const storedField = i18n.field;
  i18n.field = function (record, base) {
    return record[base + '_' + i18n.lang()] || tr(storedField(record, base));
  };
  /**
   * Saves text typed once into a record's *_en / *_ar pair. The language it was
   * typed in gets the text; when the text changed, the other side is emptied so
   * that readers of that language get a fresh translation.
   */
  function setText(record, base, text) {
    const typed = DMS.translate ? DMS.translate.languageOf(text) : i18n.lang();
    const other = typed === 'ar' ? 'en' : 'ar';
    if (record[base + '_' + typed] !== text) record[base + '_' + other] = '';
    record[base + '_' + typed] = text;
  }
  /** Text for an edit field: the version in the editor's language, else the other one as it was typed. */
  function getText(record, base) { return record[base + '_' + i18n.lang()] || storedField(record, base); }

  /** E-mail addresses and phone numbers open the mail program or the dialler. */
  function mailLink(email, className) {
    return email ? '<a class="' + (className || 'ltr') + '" href="mailto:' + esc(email) + '">' + esc(email) + '</a>' : '';
  }
  function telLink(phone, className) {
    return phone ? '<a class="' + (className || 'ltr') + '" href="tel:' + esc(String(phone).replace(/[^0-9+]/g, '')) + '">' + esc(phone) + '</a>' : '';
  }

  /* ======================================================================
     Sound effects (js/sound.js). Pages that do not load it stay silent.
     ====================================================================== */
  const sound = DMS.sound || { play: function () {}, enabled: function () { return false; }, toggle: function () {}, onChange: function () {} };
  function soundItem() {
    const on = sound.enabled();
    return '<button type="button" class="menu__item" data-action="sound" aria-pressed="' + on + '">' +
      icon(on ? 'volume' : 'volume-off', { size: 18 }) + '<span>' + esc(t(on ? 'top.soundOn' : 'top.soundOff')) + '</span></button>';
  }

  /* ======================================================================
     Academic term (admin console): the year and semester the lists show.
     One choice for the whole console, remembered in this browser. Pages
     filter their records with term.hasRecord() or term.hasDate().
     ====================================================================== */
  const TERM_KEY = 'dms.term';
  const termListeners = [];
  const term = {
    /** { year: 2026 | 'all', semester: 'fall' | 'spring' | 'summer' | 'all' }. Starts on the current semester. */
    get: function () {
      let saved = null;
      try { saved = JSON.parse(storage.get(TERM_KEY) || 'null'); } catch (e) { saved = null; }
      const now = data.currentTerm();
      if (!saved) return now;
      const yearOk = saved.year === 'all' || data.academicYears().indexOf(Number(saved.year)) > -1;
      const semesterOk = saved.semester === 'all' || data.config.semesters.some(function (s) { return s.key === saved.semester; });
      return { year: !yearOk ? now.year : saved.year === 'all' ? 'all' : Number(saved.year), semester: semesterOk ? saved.semester : now.semester };
    },
    set: function (year, semester) {
      storage.set(TERM_KEY, JSON.stringify({ year: year, semester: semester }));
      syncTerm();
      if (pageDef && pageDef.render) pageDef.render();
      termListeners.forEach(function (fn) { fn(); });
      announce(t('term.changed', { term: term.label() }));
    },
    /** A record that names its semester (applications, room allocations). */
    hasRecord: function (record) {
      const now = term.get();
      return (now.year === 'all' || Number(record.academic_year) === now.year) && (now.semester === 'all' || record.semester === now.semester);
    },
    /** A dated record (tickets, leave, swaps, ratings): the semester its date falls in. */
    hasDate: function (iso) {
      return term.hasRecord({ academic_year: data.termOf(iso).year, semester: data.termOf(iso).semester });
    },
    yearName: function (year) { return i18n.isolate(year + '–' + (Number(year) + 1)); },
    /** "Fall 2026–2027" */
    name: function (year, semester) { return t('term.name', { semester: t('semester.' + semester), year: term.yearName(year) }); },
    label: function () {
      const now = term.get();
      if (now.year === 'all') return now.semester === 'all' ? t('term.everything') : t('term.semesterAllYears', { semester: t('semester.' + now.semester) });
      return now.semester === 'all' ? t('term.yearAllSemesters', { year: term.yearName(now.year) }) : term.name(now.year, now.semester);
    },
    onChange: function (fn) { termListeners.push(fn); },
  };

  /** The two selects (academic year, semester). Every copy on the page changes the same choice. */
  function termFields(prefix) {
    const now = term.get();
    const option = function (value, text, selected) { return '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + esc(text) + '</option>'; };
    return (
      '<label class="sr-only" for="' + prefix + '-year">' + esc(t('term.year')) + '</label>' +
      '<select class="control" id="' + prefix + '-year" data-term="year">' + option('all', t('term.allYears'), now.year === 'all') +
      data.academicYears().map(function (y) { return option(y, y + '–' + (y + 1), now.year === y); }).join('') + '</select>' +
      '<label class="sr-only" for="' + prefix + '-semester">' + esc(t('term.semester')) + '</label>' +
      '<select class="control" id="' + prefix + '-semester" data-term="semester">' + option('all', t('term.allSemesters'), now.semester === 'all') +
      data.config.semesters.map(function (s) { return option(s.key, t('semester.' + s.key), now.semester === s.key); }).join('') + '</select>'
    );
  }
  function termDropdown() {
    return (
      '<div class="dropdown topbar__term" data-dropdown>' +
      '<button type="button" class="term-btn" id="term-btn" aria-expanded="false" aria-controls="term-panel" aria-label="' + esc(t('term.choose', { term: term.label() })) + '">' +
      icon('calendar', { size: 18 }) + '<span id="term-btn-text">' + esc(term.label()) + '</span>' + icon('chevron-down', { size: 16, className: 'icon--chev' }) + '</button>' +
      '<div class="dropdown__panel dropdown__panel--narrow" id="term-panel" role="region" aria-label="' + esc(t('term.title')) + '" hidden>' +
      '<div class="term-panel"><p class="term-panel__title">' + esc(t('term.title')) + '</p>' +
      '<div class="term-fields">' + termFields('top') + '</div>' +
      '<p class="field__hint">' + esc(t(STUDENT ? 'term.hintStudent' : 'term.hint')) + '</p>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-action="term-now">' + esc(t('term.backToNow')) + '</button></div></div></div>'
    );
  }
  /** Page toolbars that want the term selects carry <div data-term-fields="prefix">. */
  function fillTermFields() {
    $$('[data-term-fields]').forEach(function (box) { box.innerHTML = termFields(box.getAttribute('data-term-fields')); });
  }
  /** After a change: every copy of the selects and the top-bar button show the new choice. */
  function syncTerm() {
    const now = term.get();
    $$('select[data-term="year"]').forEach(function (el) { el.value = String(now.year); });
    $$('select[data-term="semester"]').forEach(function (el) { el.value = now.semester; });
    const text = document.getElementById('term-btn-text');
    if (text) {
      text.textContent = term.label();
      document.getElementById('term-btn').setAttribute('aria-label', t('term.choose', { term: term.label() }));
    }
  }

  /* ======================================================================
     Theme
     ====================================================================== */
  const THEME_KEY = 'dms.theme';
  const darkQuery = global.matchMedia('(prefers-color-scheme: dark)');
  function getThemeChoice() { return storage.get(THEME_KEY) || 'system'; }
  function isDark() {
    const choice = getThemeChoice();
    return choice === 'dark' || (choice === 'system' && darkQuery.matches);
  }
  function setTheme(choice) {
    if (choice === 'system') {
      storage.remove(THEME_KEY);
      document.documentElement.removeAttribute('data-theme');
    } else {
      storage.set(THEME_KEY, choice);
      document.documentElement.setAttribute('data-theme', choice);
    }
    themeListeners.forEach(function (fn) { fn(); });
  }
  const themeListeners = [];

  /* ======================================================================
     UI helpers
     ====================================================================== */
  const STATUS_TONES = {
    pending: 'warning', in_progress: 'info', resolved: 'success',
    accepted: 'success', approved: 'success', rejected: 'danger',
    active: 'success', ended: 'neutral',
    available: 'success', full: 'info', maintenance: 'warning',
    reserved: 'success', cancelled: 'neutral', disabled: 'neutral',
    scheduled: 'info', done: 'success',
    unavailable: 'neutral', uninhabitable: 'danger', open: 'danger', monitoring: 'warning',
  };
  function badge(status) {
    return '<span class="badge badge--' + (STATUS_TONES[status] || 'neutral') + '">' + esc(t('status.' + status)) + '</span>';
  }

  function emptyState(opts) {
    return (
      '<div class="empty' + (opts.compact ? ' empty--compact' : '') + '">' +
      '<span class="empty__icon">' + icon(opts.icon || 'inbox', { size: opts.compact ? 20 : 26 }) + '</span>' +
      '<p class="empty__title">' + esc(t(opts.title)) + '</p>' +
      (opts.text ? '<p class="empty__text">' + esc(t(opts.text)) + '</p>' : '') +
      (opts.action ? '<button type="button" class="btn btn--secondary btn--sm" ' + opts.action.attr + '>' + esc(t(opts.action.label)) + '</button>' : '') +
      '</div>'
    );
  }

  /** <td> that carries its column label, used when tables stack on phones. */
  function td(labelKey, html, className) {
    return '<td data-label="' + esc(labelKey ? t(labelKey) : '') + '"' + (className ? ' class="' + className + '"' : '') + '>' + html + '</td>';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/);
    return ((parts[0] || '').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
  }
  function avatar(person, size) {
    const name = i18n.name(person);
    const tone = ((person && person.id) || 0) % 6 + 1;
    const cls = 'avatar' + (size ? ' avatar--' + size : '');
    if (person && person.avatar) return '<span class="' + cls + '"><img src="' + esc(person.avatar) + '" alt=""></span>';
    return '<span class="' + cls + '" style="--avatar-bg: var(--avatar-' + tone + ')" aria-hidden="true">' + esc(initials(name)) + '</span>';
  }
  /** Avatar + name + secondary line (e-mail by default). */
  function person(p, sub) {
    if (!p) return '<span class="muted">' + esc(t('common.unknown')) + '</span>';
    return (
      '<span class="person">' + avatar(p, 'sm') + '<span class="person__text">' +
      '<span class="cell-main" dir="auto">' + esc(i18n.name(p)) + '</span>' +
      (sub === undefined ? mailLink(p.email, 'cell-sub ltr') : '<span class="cell-sub ltr">' + esc(sub) + '</span>') + '</span></span>'
    );
  }

  /**
   * Sign-in details of a student account: the username (university ID) and,
   * while the student has not chosen a password yet, the temporary one.
   */
  function credentials(student) {
    const temp = student.must_change_password;
    return (
      '<dl class="creds">' +
      '<div><dt>' + esc(t('creds.username')) + '</dt><dd><code class="ltr">' + esc(student.university_id) + '</code>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-copy="' + esc(student.university_id) + '">' + icon('clipboard', { size: 14 }) + esc(t('creds.copy')) + '</button></dd></div>' +
      (temp
        ? '<div><dt>' + esc(t('creds.password')) + '</dt><dd><code class="ltr">' + esc(student.password) + '</code>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-copy="' + esc(student.password) + '">' + icon('clipboard', { size: 14 }) + esc(t('creds.copy')) + '</button></dd></div>'
        : '') +
      '</dl><p class="field__hint">' + esc(t(temp ? 'creds.tempHint' : 'creds.ownHint')) + '</p>'
    );
  }
  document.addEventListener('click', function (event) {
    const btn = event.target.closest('[data-copy]');
    if (!btn) return;
    const value = btn.getAttribute('data-copy');
    const done = function () { toast(t(btn.getAttribute('data-copied') || 'creds.copied'), 'info'); };
    try {
      if (global.navigator.clipboard) global.navigator.clipboard.writeText(value).then(done, done);
      else done();
    } catch (e) { done(); }
  });

  /* ---- Welcome e-mail ---- */
  /**
   * The message for a new student, written in English and in Arabic.
   * Laravel sends it by e-mail when a mail server is configured; the office
   * also sees it here, so it can pass the sign-in details on by hand when the
   * computer is offline or no mail server is set up.
   * mail: { to, sent_at, params: { name, username, password, meeting? } }
   * A param may be { en, ar }: each language of the message takes its own text.
   */
  function composeMail(mail) {
    const url = /^https?:$/.test(global.location.protocol) ? new URL(LOGIN_PAGE, global.location.href).href : '';
    const part = function (language) {
      const params = { meeting: '' };
      Object.keys(mail.params).forEach(function (k) {
        const v = mail.params[k];
        params[k] = v && typeof v === 'object' ? (v[language] || v.en || '') : v;
      });
      return i18n.tIn(language, 'mail.welcomeBody', Object.assign(params, {
        where: url ? i18n.tIn(language, 'mail.whereLink', { url: url }) : i18n.tIn(language, 'mail.whereSite'),
        office: data.config.housingEmail,
      }));
    };
    const en = part('en');
    const ar = part('ar');
    return { subject: i18n.tIn('en', 'mail.welcomeSubject') + ' | ' + i18n.tIn('ar', 'mail.welcomeSubject'), en: en, ar: ar, text: en + '\n\n' + ar };
  }
  /** Card with the welcome e-mail: who it is for, the message, and the two ways to pass it on. */
  function mailCard(mail) {
    const m = composeMail(mail);
    return (
      '<section class="card card--pad stack" aria-labelledby="mail-title">' +
      '<div><h3 class="card__title" id="mail-title">' + esc(t('mail.title')) + '</h3>' +
      '<p class="cell-sub">' + esc(t('mail.to')) + ' <span class="ltr">' + esc(mail.to) + '</span> · ' +
      '<time datetime="' + esc(mail.sent_at) + '">' + esc(i18n.dateTime(mail.sent_at)) + '</time></p></div>' +
      '<details class="mail"><summary>' + esc(t('mail.read')) + '</summary>' +
      '<p class="mail__subject" dir="auto"><strong>' + esc(t('mail.subject')) + '</strong> ' + esc(m.subject) + '</p>' +
      '<p class="mail__body" lang="en" dir="ltr">' + esc(m.en) + '</p>' +
      '<p class="mail__body" lang="ar" dir="rtl">' + esc(m.ar) + '</p></details>' +
      '<div class="chips">' +
      // The body can be long in Arabic, so it travels on the clipboard instead of inside the mailto: link.
      '<a class="btn btn--secondary btn--sm" href="mailto:' + esc(mail.to) + '?subject=' + esc(encodeURIComponent(m.subject)) + '" data-copy="' + esc(m.text) + '" data-copied="mail.copiedOpen">' +
      icon('mail', { size: 16 }) + esc(t('mail.open')) + '</a>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-copy="' + esc(m.text) + '" data-copied="mail.copied">' + icon('clipboard', { size: 16 }) + esc(t('mail.copy')) + '</button></div>' +
      '<p class="field__hint">' + esc(t('mail.hint')) + '</p></section>'
    );
  }

  /** Short text shown for a room: "A-101". */
  function roomCode(room) { return room ? '<span class="ltr">' + esc(room.number) + '</span>' : '<span class="muted">' + esc(t('common.noRoom')) + '</span>'; }

  /* ---- Toasts ---- */
  const TOAST_ICONS = { success: 'check-circle', danger: 'alert', warning: 'alert', info: 'info' };
  const TOAST_SOUNDS = { success: 'success', danger: 'error', warning: 'warning', info: 'info' };
  /** silent: the caller plays its own sound (the notification chime). */
  function toast(message, tone, silent) {
    const region = document.getElementById('toast-region');
    if (!region) return;
    const kind = tone || 'success';
    if (!silent) sound.play(TOAST_SOUNDS[kind]);
    while (region.children.length >= 3) region.removeChild(region.firstChild);
    const el = document.createElement('div');
    el.className = 'toast toast--' + kind;
    el.innerHTML = icon(TOAST_ICONS[kind], { size: 18 }) + '<p class="toast__text" dir="auto"></p>' +
      '<button type="button" class="icon-btn" aria-label="' + esc(t('common.dismiss')) + '">' + icon('x', { size: 16 }) + '</button>';
    el.querySelector('.toast__text').textContent = message;
    const remove = function () { if (el.parentNode) el.parentNode.removeChild(el); };
    el.querySelector('button').addEventListener('click', remove);
    setTimeout(remove, kind === 'danger' ? 9000 : 5500);
    region.appendChild(el);
  }

  /* ---- Modals: native <dialog> gives focus trapping, Escape and inert background ---- */
  function openModal(dialog) {
    if (!dialog || dialog.open) return;
    dialog._opener = document.activeElement;
    dialog.showModal();
    const first = dialog.querySelector('[autofocus], input:not([type="hidden"]):not([disabled]), select, textarea, button:not([data-close])');
    if (first) first.focus();
  }
  function closeModal(dialog) {
    if (dialog && dialog.open) dialog.close();
  }
  document.addEventListener('click', function (event) {
    const closer = event.target.closest('[data-close]');
    if (closer && closer.closest('dialog')) closeModal(closer.closest('dialog'));
    // A click on the backdrop lands on the <dialog> element itself. Locked dialogs
    // (the administrator's first-login setup) cannot be closed this way.
    if (event.target.tagName === 'DIALOG' && event.target.classList.contains('modal') && !event.target.hasAttribute('data-locked')) closeModal(event.target);
  });
  document.addEventListener('close', function (event) {
    const dialog = event.target;
    if (dialog.tagName !== 'DIALOG') return;
    if (dialog._opener && document.contains(dialog._opener)) dialog._opener.focus();
  }, true);

  /* ---- Confirm dialog (replaces window.confirm) ---- */
  let confirmDialog = null;
  function ensureConfirm() {
    if (confirmDialog) return confirmDialog;
    confirmDialog = document.createElement('dialog');
    confirmDialog.className = 'modal modal--sm';
    confirmDialog.setAttribute('aria-labelledby', 'confirm-title');
    confirmDialog.setAttribute('aria-describedby', 'confirm-text');
    document.body.appendChild(confirmDialog);
    return confirmDialog;
  }
  /** Promise<boolean>. opts: { title, message, confirm, cancel, tone: 'danger'|'primary' } (already translated). */
  function confirm(opts) {
    const dialog = ensureConfirm();
    dialog.innerHTML =
      '<div class="modal__head"><div><h2 class="modal__title" id="confirm-title">' + esc(opts.title) + '</h2></div></div>' +
      '<div class="modal__body"><p id="confirm-text">' + esc(opts.message) + '</p></div>' +
      '<div class="modal__foot">' +
      '<button type="button" class="btn btn--ghost" value="no">' + esc(opts.cancel || t('common.cancel')) + '</button>' +
      '<button type="button" class="btn ' + (opts.tone === 'primary' ? 'btn--primary' : 'btn--danger') + '" value="yes">' + esc(opts.confirm || t('common.confirm')) + '</button></div>';
    return new Promise(function (resolve) {
      let answer = false;
      dialog.querySelectorAll('button').forEach(function (button) {
        button.addEventListener('click', function () { answer = button.value === 'yes'; dialog.close(); });
      });
      dialog.addEventListener('close', function done() {
        dialog.removeEventListener('close', done);
        resolve(answer);
      });
      openModal(dialog);
      dialog.querySelector('button[value="no"]').focus();
    });
  }

  /* ---- Files ---- */
  /**
   * Reads an image chosen by the user, checks type and size, and scales it
   * down (max 720px) so it fits in browser storage. Resolves to a data URL.
   * Rejects with an i18n key.
   */
  function readImage(file, maxBytes) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject('err.fileMissing');
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject('err.fileType');
      if (file.size > (maxBytes || 2 * 1024 * 1024)) return reject('err.fileSize');
      const reader = new FileReader();
      reader.onerror = function () { reject('err.fileRead'); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject('err.fileRead'); };
        img.onload = function () {
          const scale = Math.min(1, 720 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** Builds a CSV file in the browser and downloads it (UTF-8 BOM so Excel shows Arabic). */
  function downloadCsv(filename, rows) {
    const csv = rows.map(function (row) {
      return row.map(function (cell) {
        const text = String(cell === null || cell === undefined ? '' : cell);
        return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join(',');
    }).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /**
   * A report to save as PDF: a clean A4 page (logo, title, key figures, table)
   * printed from a hidden frame, so the browser's print window opens with
   * "Save as PDF". The browser shapes Arabic correctly, which PDF libraries
   * running in the page do not. Phase 4 can render the same report with dompdf.
   * opts: { file, title, subtitle, facts: [[label, value]], head: [text], rows: [[cell]],
   *         foot: [cell] | null, numeric: [column indexes], landscape: bool }
   * A cell is plain text, or { text, sub } for a second, smaller line. Codes,
   * phone numbers and e-mail addresses add ltr: true (and subLtr for the second
   * line) so they keep their order inside an Arabic report.
   */
  function printReport(opts) {
    const rtl = i18n.dir() === 'rtl';
    const numeric = opts.numeric || [];
    const cellHtml = function (c, i, tag) {
      const value = c && typeof c === 'object' ? c : { text: c };
      const text = value.ltr ? '<span dir="ltr">' + esc(value.text) + '</span>' : esc(value.text);
      return '<' + tag + (numeric.indexOf(i) > -1 ? ' class="num"' : '') + '>' + text +
        (value.sub ? '<small' + (value.subLtr ? ' dir="ltr"' : '') + '>' + esc(value.sub) + '</small>' : '') + '</' + tag + '>';
    };
    const logo = new URL(BASE + 'assets/logo-mark.svg', document.baseURI).href;
    const html = '<!doctype html><html lang="' + i18n.lang() + '" dir="' + (rtl ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8">' +
      '<title>' + esc(opts.file) + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=Tajawal:wght@400;500;700&display=swap">' +
      '<style>' +
      '@page { size: A4 ' + (opts.landscape ? 'landscape' : 'portrait') + '; margin: 14mm 12mm; }' +
      '* { box-sizing: border-box; }' +
      'body { margin: 0; color: #0b1d36; font: 10pt/1.45 ' + (rtl ? "'Tajawal', " : '') + "'Plus Jakarta Sans', 'Tajawal', system-ui, sans-serif; " +
      '-webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      'header { display: flex; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 2px solid #0f766e; }' +
      'header img { width: 42px; height: 42px; }' +
      'header p { margin: 0; color: #4a5b74; font-size: 9pt; }' +
      'h1 { margin: 2px 0 0; font-size: 16pt; }' +
      '.sub { margin: 10px 0 0; color: #4a5b74; }' +
      '.facts { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }' +
      '.facts div { flex: 1 1 0; min-width: 90px; padding: 7px 10px; border: 1px solid #d5deea; border-radius: 6px; background: #f4f7fb; }' +
      '.facts span { display: block; color: #4a5b74; font-size: 8pt; }' +
      '.facts strong { font-size: 13pt; }' +
      'table { width: 100%; border-collapse: collapse; }' +
      'th, td { padding: 5px 7px; border: 1px solid #d5deea; text-align: start; vertical-align: top; }' +
      'thead th { background: #e8eef6; font-size: 8.5pt; }' +
      'tfoot td { background: #f4f7fb; font-weight: 700; }' +
      'tr { break-inside: avoid; }' +
      'td small { display: block; color: #4a5b74; font-size: 8pt; }' +
      '[dir="rtl"] td small[dir="ltr"] { text-align: right; }' +
      'span[dir="ltr"] { unicode-bidi: isolate; }' +
      '.num { text-align: end; font-variant-numeric: tabular-nums; }' +
      '.empty { padding: 20px; border: 1px dashed #d5deea; color: #4a5b74; text-align: center; }' +
      'footer { margin-top: 12px; color: #4a5b74; font-size: 8pt; }' +
      '</style></head><body>' +
      '<header><img src="' + esc(logo) + '" alt=""><div><p>' + esc(t('report.org')) + '</p><h1>' + esc(opts.title) + '</h1></div></header>' +
      (opts.subtitle ? '<p class="sub">' + esc(opts.subtitle) + '</p>' : '') +
      (opts.facts && opts.facts.length ? '<div class="facts">' + opts.facts.map(function (f) {
        return '<div><span>' + esc(f[0]) + '</span><strong>' + esc(f[1]) + '</strong></div>';
      }).join('') + '</div>' : '') +
      (opts.rows.length
        ? '<table><thead><tr>' + opts.head.map(function (h, i) { return cellHtml(h, i, 'th'); }).join('') + '</tr></thead><tbody>' +
          opts.rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return cellHtml(c, i, 'td'); }).join('') + '</tr>'; }).join('') + '</tbody>' +
          (opts.foot ? '<tfoot><tr>' + opts.foot.map(function (c, i) { return cellHtml(c, i, 'td'); }).join('') + '</tr></tfoot>' : '') + '</table>'
        : '<p class="empty">' + esc(t('report.empty')) + '</p>') +
      '<footer>' + esc(t('report.generated', { when: i18n.dateTime(data.now()), by: i18n.name(data.db.admin) })) + '</footer>' +
      '</body></html>';

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:0;width:900px;height:600px;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    const win = frame.contentWindow;
    const remove = function () { if (frame.parentNode) frame.remove(); };
    // Print once the fonts and the logo are in (or after a few seconds offline).
    const images = Array.prototype.map.call(doc.images, function (img) {
      return img.complete ? Promise.resolve() : new Promise(function (resolve) { img.onload = img.onerror = resolve; });
    });
    const loaded = Promise.all([doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve()].concat(images));
    Promise.race([loaded, new Promise(function (resolve) { setTimeout(resolve, 3000); })]).then(function () {
      win.addEventListener('afterprint', function () { setTimeout(remove, 500); });
      win.focus();
      win.print();
      // Some browsers never send "afterprint"; the frame is not needed for long.
      setTimeout(remove, 120000);
    });
  }

  /**
   * Turns stored params into display text: { en, ar } names in the current
   * language, status/category keys translated, ISO dates formatted, and codes
   * such as CMP-0207 kept left-to-right.
   */
  function resolveParams(raw) {
    const params = {};
    Object.keys(raw || {}).forEach(function (key) {
      const value = raw[key];
      if (value && typeof value === 'object') params[key] = value[i18n.lang()] || tr(value.en || value.ar || '');
      else if (key === 'title') params[key] = tr(value);
      else if (key === 'status' || key === 'category') params[key] = t((key === 'status' ? 'status.' : 'category.') + value);
      else if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) params[key] = i18n.date(value, 'medium');
      else params[key] = i18n.isolate(value);
    });
    return params;
  }
  function activityText(entry) { return t('activity.' + entry.type, resolveParams(entry.params)); }

  /** A ticket history note: system notes are stored as keys so they follow the language. */
  function noteText(n) {
    if (!n.key) return tr(n.text);
    const params = n.params ? Object.assign({}, n.params, n.params.status ? { status: t('status.' + n.params.status) } : {}) : undefined;
    return t(n.key, params);
  }
  const ACTIVITY_ICONS = {
    application_submitted: ['clipboard', 'info'], application_accepted: ['check-circle', 'success'], application_rejected: ['x-circle', 'danger'],
    account_created: ['user-plus', 'success'], student_disabled: ['lock', 'danger'], student_enabled: ['user-check', 'success'], password_reset: ['key', 'info'],
    welcome_email: ['mail', 'info'], student_updated: ['edit', 'neutral'],
    room_created: ['bed', 'neutral'], room_updated: ['bed', 'neutral'], room_deleted: ['trash', 'danger'],
    allocation_created: ['key', 'success'], allocation_moved: ['swap', 'info'], allocation_ended: ['door', 'neutral'],
    complaint_created: ['wrench', 'warning'], complaint_updated: ['wrench', 'info'], complaint_resolved: ['check-circle', 'success'],
    application_deleted: ['trash', 'danger'],
    rule_saved: ['shield', 'neutral'], rule_deleted: ['shield', 'danger'],
    health_requested: ['heart', 'warning'], health_updated: ['heart', 'info'], health_cancelled: ['heart', 'neutral'],
    leave_submitted: ['luggage', 'info'], leave_approved: ['luggage', 'success'], leave_rejected: ['luggage', 'danger'],
    swap_submitted: ['swap', 'info'], swap_approved: ['swap', 'success'], swap_rejected: ['swap', 'danger'],
    announcement_published: ['megaphone', 'info'], menu_saved: ['utensils', 'neutral'], cutoff_changed: ['clock', 'neutral'],
    rating_saved: ['star', 'neutral'],
  };
  function activityIcon(type) {
    const def = ACTIVITY_ICONS[type] || ['info', 'neutral'];
    return '<span class="tile tile--sm tile--' + def[1] + '">' + icon(def[0], { size: 16 }) + '</span>';
  }

  /**
   * Status chips above a list ("All 12", "Pending 6" ...). Clicking one sets the
   * list's status filter. Returns a function that redraws the chips; call it
   * from the list's onRender so counts and the pressed chip stay in sync.
   */
  function statusChips(el, list, statuses, items) {
    el.addEventListener('click', function (event) {
      const chip = event.target.closest('[data-chip]');
      if (chip) list.setFilter('status', chip.getAttribute('data-chip'));
    });
    return function draw() {
      const all = items();
      const current = list.state.filters.status || 'all';
      el.innerHTML = ['all'].concat(statuses).map(function (s) {
        const n = s === 'all' ? all.length : all.filter(function (x) { return x.status === s; }).length;
        return '<button type="button" class="chip" data-chip="' + s + '" aria-pressed="' + (current === s) + '">' +
          esc(t(s === 'all' ? 'common.all' : 'status.' + s)) + '<span class="chip__count">' + esc(i18n.number(n)) + '</span></button>';
      }).join('');
    };
  }

  function announce(message) {
    const node = document.getElementById('sr-announcer');
    if (!node) return;
    node.textContent = '';
    setTimeout(function () { node.textContent = message; }, 40);
  }

  /* ======================================================================
     Forms: values, filling, validation messages
     ====================================================================== */
  const form = {
    values: function (formEl) {
      const out = {};
      Array.prototype.forEach.call(formEl.elements, function (el) {
        if (!el.name || el.disabled || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
        if (el.type === 'checkbox') out[el.name] = el.checked;
        else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
        else out[el.name] = el.value.trim();
      });
      return out;
    },
    fill: function (formEl, values) {
      Object.keys(values).forEach(function (name) {
        const el = formEl.elements[name];
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!values[name];
        else el.value = values[name] === null || values[name] === undefined ? '' : values[name];
      });
    },
    clear: function (formEl) {
      $$('.field__error', formEl).forEach(function (node) { node.remove(); });
      $$('[aria-invalid="true"]', formEl).forEach(function (el) {
        el.removeAttribute('aria-invalid');
        const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(function (id) { return id && id.slice(-6) !== '-error'; });
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
        else el.removeAttribute('aria-describedby');
      });
    },
    /**
     * errors: { fieldName: 'i18n.key' | ['i18n.key', params] }.
     * Shows each message under its field, links it with aria-describedby and
     * focuses the first invalid field. Returns true when there were errors.
     */
    show: function (formEl, errors) {
      form.clear(formEl);
      const names = Object.keys(errors);
      names.forEach(function (name) {
        const el = formEl.elements[name];
        if (!el) return;
        const control = el.length && !el.tagName ? el[0] : el;
        const spec = Array.isArray(errors[name]) ? errors[name] : [errors[name]];
        const id = (control.id || name) + '-error';
        const msg = document.createElement('p');
        msg.className = 'field__error';
        msg.id = id;
        msg.setAttribute('data-key', spec[0]);
        if (spec[1]) msg.setAttribute('data-params', JSON.stringify(spec[1]));
        msg.innerHTML = icon('alert', { size: 14 }) + '<span>' + esc(t(spec[0], spec[1])) + '</span>';
        const field = control.closest('.field') || control.parentNode;
        field.appendChild(msg);
        control.setAttribute('aria-invalid', 'true');
        const described = control.getAttribute('aria-describedby');
        control.setAttribute('aria-describedby', (described ? described + ' ' : '') + id);
      });
      if (names.length) {
        sound.play('warning');
        const first = formEl.elements[names[0]];
        const control = first && first.length && !first.tagName ? first[0] : first;
        if (control && control.focus) control.focus();
      }
      return names.length > 0;
    },
    /** Re-translates visible error messages after a language change. */
    retranslate: function () {
      $$('.field__error[data-key]').forEach(function (node) {
        const params = node.getAttribute('data-params');
        node.querySelector('span').textContent = t(node.getAttribute('data-key'), params ? JSON.parse(params) : undefined);
      });
    },
    isEmail: function (value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value); },
    isPhone: function (value) { return /^\+?[0-9][0-9\s-]{6,18}$/.test(value); },
    isArabic: function (value) { return !DMS.translate || DMS.translate.languageOf(value) === 'ar'; },
  };

  /* ======================================================================
     List controller: search, filters and pagination for a table or list.

     Markup inside `root`:
       [data-list-search]            text input
       [data-list-filter="name"]     <select>, value "all" means no filter
       [data-list-table]             wrapper hidden when there is nothing to show
       [data-list-body]              <tbody> or list container
       [data-list-empty]             empty-state container
       [data-list-pager]             pagination container
     ====================================================================== */
  function createList(opts) {
    const root = opts.root;
    const body = $('[data-list-body]', root);
    const tableWrap = $('[data-list-table]', root);
    const emptyBox = $('[data-list-empty]', root);
    const pager = $('[data-list-pager]', root);
    const searchEl = $('[data-list-search]', root);
    const filterEls = $$('[data-list-filter]', root);
    const pageSize = opts.pageSize || 8;
    const state = { page: 1, query: '', filters: {} };

    filterEls.forEach(function (el) { state.filters[el.getAttribute('data-list-filter')] = el.value; });

    function filtered() {
      let items = opts.items();
      Object.keys(state.filters).forEach(function (name) {
        const value = state.filters[name];
        if (value && value !== 'all' && opts.filters && opts.filters[name]) {
          items = items.filter(function (item) { return opts.filters[name](item, value); });
        }
      });
      if (state.query && opts.search) {
        const q = state.query.toLowerCase();
        items = items.filter(function (item) { return opts.search(item).join(' ').toLowerCase().indexOf(q) > -1; });
      }
      if (opts.sort) items = items.slice().sort(opts.sort);
      return items;
    }

    function pageButtons(pages) {
      const list = [];
      for (let p = 1; p <= pages; p += 1) {
        if (p === 1 || p === pages || Math.abs(p - state.page) <= 1) list.push(p);
        else if (list[list.length - 1] !== '…') list.push('…');
      }
      return list.map(function (p) {
        if (p === '…') return '<span class="page-btn" aria-hidden="true">…</span>';
        return '<button type="button" class="page-btn" data-page="' + p + '" aria-label="' + esc(t('list.page', { n: i18n.number(p) })) + '"' +
          (p === state.page ? ' aria-current="page"' : '') + '>' + esc(i18n.number(p)) + '</button>';
      }).join('');
    }

    function render(focusPage) {
      const all = opts.items();
      const items = filtered();
      const pages = Math.max(1, Math.ceil(items.length / pageSize));
      if (state.page > pages) state.page = pages;
      const start = (state.page - 1) * pageSize;
      const pageItems = items.slice(start, start + pageSize);
      body.innerHTML = pageItems.map(opts.render).join('');

      const empty = items.length === 0;
      if (tableWrap) tableWrap.hidden = empty;
      if (emptyBox) {
        emptyBox.hidden = !empty;
        emptyBox.innerHTML = !empty ? '' : all.length === 0
          ? emptyState(opts.empty)
          : emptyState({ icon: 'search', title: 'list.noMatchTitle', text: 'list.noMatchText', action: { label: 'list.clear', attr: 'data-list-clear' } });
      }
      if (pager) {
        pager.hidden = empty;
        pager.innerHTML = empty ? '' :
          '<p>' + esc(t('list.showing', { from: i18n.number(start + 1), to: i18n.number(start + pageItems.length), total: i18n.number(items.length) })) + '</p>' +
          (pages > 1
            ? '<div class="pagination__pages">' +
              '<button type="button" class="page-btn" data-page="prev" aria-label="' + esc(t('list.prev')) + '"' + (state.page === 1 ? ' disabled' : '') + '>' + icon('chevron-left', { size: 16 }) + '</button>' +
              pageButtons(pages) +
              '<button type="button" class="page-btn" data-page="next" aria-label="' + esc(t('list.next')) + '"' + (state.page === pages ? ' disabled' : '') + '>' + icon('chevron-right', { size: 16 }) + '</button></div>'
            : '');
      }
      if (focusPage && pager) {
        const target = $('[data-page="' + focusPage + '"]:not([disabled])', pager) || $('[aria-current="page"]', pager);
        if (target) target.focus();
      }
      if (opts.onRender) opts.onRender(pageItems, items);
    }

    if (searchEl) {
      let timer = null;
      searchEl.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { state.query = searchEl.value.trim(); state.page = 1; render(); }, 120);
      });
    }
    filterEls.forEach(function (el) {
      el.addEventListener('change', function () {
        state.filters[el.getAttribute('data-list-filter')] = el.value;
        state.page = 1;
        render();
      });
    });
    root.addEventListener('click', function (event) {
      const pageBtn = event.target.closest('[data-page]');
      if (pageBtn && pager && pager.contains(pageBtn)) {
        const value = pageBtn.getAttribute('data-page');
        state.page = value === 'prev' ? state.page - 1 : value === 'next' ? state.page + 1 : Number(value);
        render(value);
        return;
      }
      if (event.target.closest('[data-list-clear]')) api.clear();
    });

    const api = {
      render: render,
      state: state,
      // The items that pass the search and the filters (all pages), e.g. for an export.
      filtered: filtered,
      setFilter: function (name, value) {
        state.filters[name] = value;
        const el = $('[data-list-filter="' + name + '"]', root);
        if (el) el.value = value;
        state.page = 1;
        render();
      },
      clear: function () {
        state.query = '';
        if (searchEl) searchEl.value = '';
        filterEls.forEach(function (el) { el.value = 'all'; state.filters[el.getAttribute('data-list-filter')] = 'all'; });
        state.page = 1;
        render();
        if (searchEl) searchEl.focus();
      },
    };
    return api;
  }

  /* ======================================================================
     Shell: sidebar and top bar (admin console or student portal)
     ====================================================================== */
  let pageId = '';
  let pageDef = null;
  const drawer = { open: false };
  const STUDENT = AREA === 'student';
  // The portal lives in ../students/, so shared assets are one folder up.
  const BASE = STUDENT ? '../manager/' : '';

  function currentUser() { return STUDENT ? studentAuth.current() : data.db.admin; }

  function studentCounts(student) {
    return {
      announcements: student ? data.db.announcements.filter(function (a) { return a.created_at > (student.announcements_seen_at || ''); }).length : 0,
    };
  }

  function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const ctx = STUDENT ? studentCounts(currentUser()) : data.stats();
    const prefix = STUDENT ? 'snav.' : 'nav.';
    const links = (STUDENT ? STUDENT_NAV : NAV).map(function (item) {
      const count = item.badge ? item.badge(ctx) : 0;
      const label = t(prefix + item.id);
      return (
        '<li><a class="nav__link" href="' + item.href + '"' + (item.id === pageId ? ' aria-current="page"' : '') + '>' +
        icon(item.icon, { size: 19 }) + '<span class="nav__label">' + esc(label) + '</span>' +
        (count > 0
          ? '<span class="nav__badge" aria-hidden="true">' + esc(i18n.number(count)) + '</span><span class="sr-only">' + esc(t(STUDENT ? 'snav.new' : 'nav.pending', { count: i18n.number(count) })) + '</span>'
          : '') +
        '</a></li>'
      );
    }).join('');
    const site = i18n.lang() === 'ar' ? '../main%20page/index.html' : '../main%20page/engindex.html';
    sidebar.setAttribute('aria-label', t('nav.sidebar'));
    sidebar.innerHTML =
      '<div class="sidebar__brand"><a class="brand" href="' + (STUDENT ? 'index.html' : 'dashboard.html') + '">' +
      '<span class="brand__logo"><img src="' + BASE + 'assets/logo-mark.svg" alt="' + esc(t('app.logoAlt')) + '" width="36" height="36"></span>' +
      '<span class="brand__text"><span class="brand__name">' + esc(t('app.short')) + '</span><span class="brand__sub">' + esc(t(STUDENT ? 'app.portal' : 'app.console')) + '</span></span></a>' +
      '<button type="button" class="icon-btn sidebar__close" id="sidebar-close" aria-label="' + esc(t('nav.close')) + '">' + icon('x') + '</button></div>' +
      '<nav class="sidebar__nav" aria-label="' + esc(t(STUDENT ? 'snav.main' : 'nav.main')) + '"><ul class="nav">' + links + '</ul></nav>' +
      '<div class="sidebar__foot">' +
      // On small screens the term switch lives here, in the drawer; from 720px up it is in the top bar.
      '<div class="sidebar__termpick"><p class="sidebar__term">' + esc(t('term.title')) + '</p>' + termFields('side') + '</div>' +
      '<p class="sidebar__term">' + esc(t(STUDENT ? 'app.termStudent' : 'app.term', { term: term.name(data.currentTerm().year, data.currentTerm().semester) })) + '</p>' +
      '<a href="' + site + '">' + icon('external', { size: 16 }) + '<span>' + esc(t('nav.publicSite')) + '</span></a></div>';
    $('#sidebar-close').addEventListener('click', function () { setDrawer(false, true); });
  }

  function greetingKey() {
    const hour = new Date().getHours();
    return hour < 12 ? 'top.morning' : hour < 18 ? 'top.afternoon' : 'top.evening';
  }

  function toolsHtml() {
    const other = i18n.lang() === 'ar' ? 'en' : 'ar';
    return (
      '<button type="button" class="lang-btn" data-action="lang" lang="' + other + '" title="' + esc(t('top.language')) + '">' +
      esc(other === 'ar' ? 'العربية' : 'English') + '</button>' +
      '<button type="button" class="icon-btn" data-action="theme" aria-label="' + esc(t(isDark() ? 'top.themeLight' : 'top.themeDark')) + '" title="' + esc(t(isDark() ? 'top.themeLight' : 'top.themeDark')) + '">' +
      icon(isDark() ? 'sun' : 'moon') + '</button>'
    );
  }

  /* ---- Notifications: recent activity for the admin, personal alerts for a student ---- */
  const ALERT_ICONS = {
    complaint_status: 'wrench', complaint_assigned: 'user-check', leave_decision: 'luggage', swap_decision: 'swap',
    announcement: 'megaphone', room_allocated: 'key', room_ended: 'door', meal_reminder: 'utensils',
    rating: 'star', maintenance_visit: 'wrench', swap_request: 'arrow-left-right', profile_updated: 'user',
    rules_updated: 'shield', health_update: 'heart', exam_reminder: 'book',
  };
  function alertIcon(n) {
    const status = n.params && n.params.status;
    const tone = status === 'approved' || status === 'resolved' ? 'success' : status === 'rejected' ? 'danger' : 'info';
    return '<span class="tile tile--sm tile--' + tone + '">' + icon(ALERT_ICONS[n.type] || 'bell', { size: 16 }) + '</span>';
  }
  function alertText(n) { return t('snotif.' + n.type, resolveParams(n.params)); }

  /** The signed-in student's notifications, newest first (the API only returns their own). */
  function studentAlerts() {
    return data.db.notifications.slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }

  function adminSeen() { return (data.db.admin && data.db.admin.notifications_seen_at) || ''; }
  function unreadCount() {
    if (STUDENT) return studentAlerts().filter(function (n) { return !n.read; }).length;
    const seen = adminSeen();
    return data.db.activity.slice(0, 8).filter(function (a) { return a.at > seen && !a.by_me; }).length;
  }

  function notificationsPanel() {
    const unread = unreadCount();
    let items;
    if (STUDENT) {
      items = studentAlerts().slice(0, 8).map(function (n) {
        return { unread: !n.read, tile: alertIcon(n), text: alertText(n), at: n.at, href: 'announcements.html#alert-' + n.id };
      });
    } else {
      const seen = adminSeen();
      items = data.db.activity.slice(0, 8).map(function (a) {
        return { unread: a.at > seen && !a.by_me, tile: activityIcon(a.type), text: activityText(a), at: a.at };
      });
    }
    return (
      '<div class="dropdown__head"><h2 class="dropdown__title">' + esc(t('notif.title')) + '</h2>' +
      (unread ? '<button type="button" class="btn btn--ghost btn--sm" data-action="mark-read">' + esc(t('notif.markRead')) + '</button>' : '') + '</div>' +
      (items.length
        ? '<ul class="notif-list">' + items.map(function (n) {
          return '<li class="notif-item' + (n.unread ? ' is-unread' : '') + '">' + n.tile +
            '<div>' + (n.unread ? '<span class="sr-only">' + esc(t('notif.unread')) + ': </span>' : '') +
            (n.href ? '<a class="notif-item__link" href="' + n.href + '">' + esc(n.text) + '</a>' : esc(n.text)) +
            '<time datetime="' + esc(n.at) + '">' + esc(i18n.relative(n.at)) + '</time></div></li>';
        }).join('') + '</ul>' +
          (STUDENT ? '<div class="dropdown__foot"><a class="btn btn--ghost btn--sm btn--block" href="announcements.html#notifications">' + esc(t('notif.all')) + '</a></div>' : '')
        : emptyState({ icon: 'bell', title: 'notif.emptyTitle', text: STUDENT ? 'notif.emptyStudent' : 'notif.emptyText', compact: true }))
    );
  }

  /** Marks the bell read on the server; the bell shows it at once. */
  function markAllRead() {
    if (STUDENT) {
      data.db.notifications.forEach(function (n) { n.read = true; });
      return api.post('/notifications/read-all').catch(failed());
    }
    data.db.admin.notifications_seen_at = data.now();
    return api.post('/activity/seen').then(function (res) {
      if (res && res.notifications_seen_at) data.db.admin.notifications_seen_at = res.notifications_seen_at;
    }).catch(failed());
  }

  function bellButton() {
    const unread = unreadCount();
    return (
      '<button type="button" class="icon-btn" id="bell-btn" aria-expanded="false" aria-controls="notif-panel" aria-label="' +
      esc(unread ? t('notif.labelUnread', { count: i18n.number(unread) }) : t('notif.title')) + '">' + icon('bell') +
      (unread ? '<span class="bell-count" aria-hidden="true">' + esc(i18n.number(unread > 9 ? 9 : unread)) + (unread > 9 ? '+' : '') + '</span>' : '') + '</button>'
    );
  }

  /** Redraws only the bell (used by live alerts) so focus and open menus are kept. */
  function refreshBell(ring) {
    const old = document.getElementById('bell-btn');
    if (!old) return;
    const holder = document.createElement('template');
    holder.innerHTML = bellButton();
    const button = holder.content.firstElementChild;
    const panel = document.getElementById('notif-panel');
    button.setAttribute('aria-expanded', String(!panel.hidden));
    const hadFocus = document.activeElement === old;
    old.replaceWith(button);
    if (hadFocus) button.focus();
    panel.innerHTML = notificationsPanel();
    if (ring) {
      sound.play('notify');
      button.classList.add('is-ringing');
      setTimeout(function () { button.classList.remove('is-ringing'); }, 1600);
    }
  }

  function profilePanel() {
    const user = currentUser();
    const sub = STUDENT ? t('top.studentId', { id: user.university_id }) : user.email || user.username;
    return (
      '<div class="profile-card">' + avatar(STUDENT ? user : Object.assign({ id: 0 }, user), 'lg') +
      '<div><p class="profile-card__name">' + esc(i18n.name(user)) + '</p><p class="profile-card__mail ltr">' + esc(sub) + '</p></div></div>' +
      '<div class="menu">' +
      (STUDENT
        ? '<a class="menu__item" href="settings.html#profile">' + icon('user', { size: 18 }) + '<span>' + esc(t('snav.profile')) + '</span></a>' +
          '<a class="menu__item" href="settings.html">' + icon('settings', { size: 18 }) + '<span>' + esc(t('snav.settings')) + '</span></a>'
        : '<a class="menu__item" href="settings.html">' + icon('settings', { size: 18 }) + '<span>' + esc(t('nav.settings')) + '</span></a>') +
      soundItem() +
      '<div class="menu__sep"></div>' +
      '<button type="button" class="menu__item" data-action="sign-out">' + icon('log-out', { size: 18 }) + '<span>' + esc(t('top.signOut')) + '</span></button>' +
      '</div>'
    );
  }

  function roleLabel(user) {
    if (!STUDENT) return t('top.role');
    const room = data.roomOfStudent(user.id);
    return room ? t('top.resident', { room: i18n.isolate(room.number) }) : t('top.student');
  }

  function renderTopbar() {
    const bar = document.getElementById('topbar');
    if (!bar) return;
    const user = currentUser();
    const first = i18n.name(user).split(' ')[0];
    bar.innerHTML =
      '<button type="button" class="icon-btn topbar__menu" id="menu-btn" aria-controls="sidebar" aria-expanded="' + drawer.open + '" aria-label="' + esc(t('nav.open')) + '">' + icon('menu') + '</button>' +
      '<div class="topbar__context"><p class="topbar__greeting">' + esc(t(greetingKey(), { name: first })) + '</p>' +
      '<time class="topbar__date" datetime="' + data.dates.today() + '">' + esc(i18n.date(data.dates.today(), 'full')) + '</time></div>' +
      '<div class="topbar__actions">' + termDropdown() + toolsHtml() +
      '<div class="dropdown" data-dropdown>' + bellButton() +
      '<div class="dropdown__panel" id="notif-panel" role="region" aria-label="' + esc(t('notif.title')) + '" hidden>' + notificationsPanel() + '</div></div>' +
      '<div class="dropdown" data-dropdown>' +
      '<button type="button" class="profile-btn" aria-expanded="false" aria-controls="profile-panel" aria-label="' + esc(t('top.profileMenu')) + '">' +
      avatar(STUDENT ? user : Object.assign({ id: 0 }, user)) +
      '<span class="profile-btn__text"><span class="profile-btn__name">' + esc(i18n.name(user)) + '</span><span class="profile-btn__role">' + esc(roleLabel(user)) + '</span></span>' +
      icon('chevron-down', { size: 16, className: 'icon--chev' }) + '</button>' +
      '<div class="dropdown__panel dropdown__panel--narrow" id="profile-panel" role="region" aria-label="' + esc(t('top.profileMenu')) + '" hidden>' + profilePanel() + '</div></div>' +
      '</div>';
  }

  function refreshShell() {
    renderSidebar();
    renderTopbar();
  }

  /* ---- Drawer (tablet and phone) ---- */
  const desktop = global.matchMedia('(min-width: 1024px)');
  function setDrawer(open, restoreFocus) {
    if (drawer.open === open) return;
    drawer.open = open;
    document.body.classList.toggle('drawer-open', open);
    const scrim = document.getElementById('scrim');
    if (scrim) scrim.hidden = !open;
    const body = $('.app__body');
    if (body) body.inert = open;
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) {
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', t(open ? 'nav.close' : 'nav.open'));
    }
    if (open) {
      const close = document.getElementById('sidebar-close');
      if (close) close.focus();
    } else if (restoreFocus && menuBtn) {
      menuBtn.focus();
    }
  }

  /* ---- Dropdowns ---- */
  function closeDropdowns(except, restoreFocus) {
    $$('[data-dropdown]').forEach(function (dd) {
      if (dd === except) return;
      const button = dd.querySelector('[aria-expanded]');
      const panel = dd.querySelector('.dropdown__panel');
      if (panel && !panel.hidden) {
        panel.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        if (restoreFocus) button.focus();
      }
    });
  }

  function bindGlobal() {
    document.addEventListener('click', function (event) {
      const target = event.target;

      const ddButton = target.closest('[data-dropdown] > button');
      if (ddButton) {
        const dd = ddButton.parentNode;
        const panel = dd.querySelector('.dropdown__panel');
        const open = panel.hidden;
        closeDropdowns(dd);
        panel.hidden = !open;
        ddButton.setAttribute('aria-expanded', String(open));
        return;
      }
      if (!target.closest('[data-dropdown]')) closeDropdowns();

      const action = target.closest('[data-action]');
      if (!action) {
        if (target.closest('#menu-btn')) setDrawer(!drawer.open, true);
        return;
      }
      switch (action.getAttribute('data-action')) {
        case 'lang':
          i18n.setLang(i18n.lang() === 'ar' ? 'en' : 'ar');
          announce(t('top.langChanged'));
          (document.querySelector('[data-action="lang"]') || document.body).focus();
          break;
        case 'theme':
          setTheme(isDark() ? 'light' : 'dark');
          break;
        case 'sound':
          sound.toggle();
          break;
        case 'term-now': {
          const now = data.currentTerm();
          term.set(now.year, now.semester);
          break;
        }
        case 'mark-read':
          markAllRead();
          refreshBell(false);
          document.getElementById('bell-btn').focus();
          if (pageDef && pageDef.render) pageDef.render();
          break;
        case 'sign-out':
          action.disabled = true;
          (STUDENT ? studentAuth : auth).signOut().then(function () { global.location.href = STUDENT ? LOGIN_PAGE : MANAGER_LOGIN; });
          break;
        default:
          break;
      }
    });

    document.addEventListener('click', function (event) {
      if (event.target.id === 'scrim') setDrawer(false, true);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      const openPanel = $('[data-dropdown] .dropdown__panel:not([hidden])');
      if (openPanel) { closeDropdowns(null, true); return; }
      if (drawer.open && !$('dialog[open]')) setDrawer(false, true);
    });

    document.addEventListener('focusin', function (event) {
      $$('[data-dropdown]').forEach(function (dd) {
        const panel = dd.querySelector('.dropdown__panel');
        if (panel && !panel.hidden && !dd.contains(event.target)) {
          panel.hidden = true;
          dd.querySelector('[aria-expanded]').setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Any copy of the academic year / semester selects changes the one shared choice.
    document.addEventListener('change', function (event) {
      const select = event.target.closest('select[data-term]');
      if (!select) return;
      const now = term.get();
      if (select.getAttribute('data-term') === 'year') term.set(select.value === 'all' ? 'all' : Number(select.value), now.semester);
      else term.set(now.year, select.value);
    });
    sound.onChange(function () {
      $$('[data-action="sound"]').forEach(function (button) {
        const holder = document.createElement('template');
        holder.innerHTML = soundItem();
        const hadFocus = document.activeElement === button;
        button.replaceWith(holder.content.firstElementChild);
        if (hadFocus) document.querySelector('[data-action="sound"]').focus();
      });
    });

    desktop.addEventListener('change', function () { if (desktop.matches) setDrawer(false, false); });
    darkQuery.addEventListener('change', function () { themeListeners.forEach(function (fn) { fn(); }); });
    themeListeners.push(function () {
      // Only the theme button changes; re-render the tools without moving focus.
      $$('[data-action="theme"]').forEach(function (button) {
        const label = t(isDark() ? 'top.themeLight' : 'top.themeDark');
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.innerHTML = icon(isDark() ? 'sun' : 'moon');
      });
    });
  }

  /* ---- Static icons in page markup: <span data-icon="plus" data-size="18"></span> ---- */
  function hydrateIcons(root) {
    $$('[data-icon]', root).forEach(function (node) {
      const holder = document.createElement('template');
      holder.innerHTML = icon(node.getAttribute('data-icon'), { size: Number(node.getAttribute('data-size')) || 18 });
      if (holder.content.firstElementChild) node.replaceWith(holder.content.firstElementChild);
    });
  }

  function setTitle() {
    document.title = t((STUDENT ? 'snav.' : 'nav.') + pageId) + ' · ' + t(STUDENT ? 'app.portalName' : 'app.name');
  }

  function injectRegions() {
    if (!document.getElementById('toast-region')) {
      const region = document.createElement('div');
      region.id = 'toast-region';
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    if (!document.getElementById('sr-announcer')) {
      const sr = document.createElement('div');
      sr.id = 'sr-announcer';
      sr.className = 'sr-only';
      sr.setAttribute('aria-live', 'polite');
      document.body.appendChild(sr);
    }
  }

  /* ======================================================================
     Errors from the API, shown in the reader's language
     ====================================================================== */
  function has(key) { return i18n.translations.en[key] !== undefined; }
  /** A sentence for an API refusal: its own translation key, a known API code, or the server's words. */
  function errorText(err) {
    if (!err) return t('api.failed');
    if (err.code && has(err.code)) return t(err.code, resolveParams(err.params));
    if (err.code && has('api.' + err.code)) return t('api.' + err.code, resolveParams(err.params));
    return err.message || t('api.failed');
  }
  /**
   * A .catch() handler: shows the refusal under the form fields it concerns
   * (when a form is given), otherwise as a toast. Returns a rejected promise
   * marker so the caller's next .then() does not run.
   */
  function failed(formEl) {
    return function (err) {
      if (err && err.status === 401) return Promise.reject(err);
      const fields = {};
      if (formEl && err) {
        if (err.codes) Object.keys(err.codes).forEach(function (k) { fields[k] = err.codes[k]; });
        else if (err.errors) Object.keys(err.errors).forEach(function (k) { fields[k.split('.')[0]] = ['api.field', { message: [].concat(err.errors[k])[0] }]; });
        if (err.field) fields[err.field] = ['api.field', { message: errorText(err) }];
      }
      const shown = Object.keys(fields).filter(function (k) { return formEl.elements[k]; });
      if (shown.length) {
        const visible = {};
        shown.forEach(function (k) { visible[k] = fields[k]; });
        form.show(formEl, visible);
      } else {
        toast(errorText(err), 'danger');
      }
      err.shown = true;
      return Promise.reject(err);
    };
  }
  /** Disables a button while its request runs; resolves or rejects like the promise. */
  function busy(button, promise) {
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    const done = function () { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } };
    return promise.then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }
  // A refusal that was already shown needs nothing more.
  global.addEventListener('unhandledrejection', function (event) {
    if (event.reason && (event.reason.shown || event.reason.status === 401)) event.preventDefault();
  });

  /* ======================================================================
     Start: check the token, (administrator) the first-login setup, load the
     page's records, then draw the shell and the page.
     ====================================================================== */
  // What every page of the area shows in the sidebar, the top bar and the bell.
  const SHELL_NEEDS = STUDENT
    ? ['settings', 'notifications', 'announcements', 'rooms', 'allocations', 'students']
    : ['settings', 'stats', 'activity'];

  function toLogin() { global.location.replace(STUDENT ? LOGIN_PAGE : MANAGER_LOGIN); }

  function setLoading(on) {
    document.body.classList.toggle('is-loading', on);
    const main = document.getElementById('main');
    if (main) main.setAttribute('aria-busy', String(on));
  }

  /** The server could not be reached or answered with an error: say so, offer to try again. */
  function showFatal(err) {
    setLoading(false);
    if (err && err.status === 401) return;
    const main = document.getElementById('main');
    if (!main) return;
    const box = document.createElement('div');
    box.className = 'notice notice--danger load-error';
    box.setAttribute('role', 'alert');
    box.innerHTML = icon('alert', { size: 18 }) + '<div><strong>' + esc(t(err && err.code === 'network' ? 'api.offlineTitle' : 'api.loadTitle')) + '</strong>' +
      esc(err && err.code === 'network' ? t('api.network') : errorText(err)) +
      '<p><button type="button" class="btn btn--secondary btn--sm" data-reload>' + esc(t('api.retry')) + '</button></p></div>';
    box.querySelector('[data-reload]').addEventListener('click', function () { global.location.reload(); });
    main.insertBefore(box, main.firstChild);
  }

  function boot() {
    pageId = document.body.getAttribute('data-page') || '';
    injectRegions();
    hydrateIcons(document);
    i18n.apply(document);
    setTitle();

    if (!api.token(AREA)) { toLogin(); return; }
    api.onUnauthorized(toLogin);
    bindGlobal();
    setLoading(true);

    api.get('/auth/me').then(function (res) {
      const user = res.data;
      if (user.role !== AREA) { api.clearToken(AREA); toLogin(); return null; }
      if (STUDENT) {
        // A temporary password is replaced on the log-in page first.
        if (user.must_change_password) { global.location.replace(LOGIN_PAGE); return null; }
        data.db.me = user;
      } else {
        data.db.admin = user;
        if (user.setup_required) { setLoading(false); showSetup(); return null; }
      }
      return start();
    }).catch(showFatal);
  }

  let started = false;
  function start() {
    const needs = SHELL_NEEDS.concat((pageDef && pageDef.needs) || []);
    return data.load(needs).then(function () {
      setLoading(false);
      refreshShell();
      fillTermFields();
      if (!started) {
        started = true;
        i18n.onChange(function () {
          refreshShell();
          fillTermFields();
          setTitle();
          form.retranslate();
          if (pageDef && pageDef.render) pageDef.render();
        });
        if (pageDef && pageDef.init) pageDef.init();
        bindLive();
      }
    });
  }

  /** Reloads the page's records from the server and redraws (after a change). */
  function reload() {
    return data.refresh().then(function () {
      if (!STUDENT) return null;
      return api.get('/auth/me').then(function (res) { data.db.me = res.data; });
    }).then(function () { redraw(); });
  }

  /* ======================================================================
     The administrator's mandatory first-login setup. A popup that cannot be
     closed (no close button, Escape and the backdrop do nothing). Laravel
     refuses every console request until it is done, so it cannot be skipped.
     ====================================================================== */
  const PW_RULES = [
    { key: 'pw.length', test: function (p) { return p.length >= 8; } },
    { key: 'pw.upper', test: function (p) { return /[A-Z]/.test(p); } },
    { key: 'pw.lower', test: function (p) { return /[a-z]/.test(p); } },
    { key: 'pw.number', test: function (p) { return /\d/.test(p); } },
    { key: 'pw.symbol', test: function (p) { return /[^A-Za-z0-9]/.test(p); } },
  ];
  function drawPwRules(listEl, value) {
    listEl.innerHTML = PW_RULES.map(function (rule) {
      const met = rule.test(value);
      return '<li' + (met ? ' class="is-met"' : '') + '>' + icon(met ? 'check-circle' : 'info', { size: 14 }) +
        '<span>' + esc(t(rule.key)) + '<span class="sr-only"> ' + esc(t(met ? 'pw.met' : 'pw.notMet')) + '</span></span></li>';
    }).join('');
  }

  function showSetup() {
    const admin = data.db.admin;
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.id = 'setup-modal';
    dialog.setAttribute('data-locked', '');
    dialog.setAttribute('aria-labelledby', 'setup-title');
    dialog.setAttribute('aria-describedby', 'setup-sub');
    dialog.innerHTML =
      '<form class="modal__form" id="setup-form" novalidate>' +
      '<div class="modal__head"><div><h2 class="modal__title" id="setup-title">' + esc(t('setup.title')) + '</h2>' +
      '<p class="modal__sub" id="setup-sub">' + esc(t('setup.sub')) + '</p></div></div>' +
      '<div class="modal__body">' +
      '<div class="notice notice--accent">' + icon('shield', { size: 18 }) + '<div><strong>' + esc(t('setup.whyTitle')) + '</strong>' + esc(t('setup.whyText')) + '</div></div>' +
      '<div class="form-grid">' +
      '<div class="field field--full"><label class="field__label" for="setup-name">' + esc(t('setup.name')) + '</label>' +
      '<input class="control" id="setup-name" name="name" autocomplete="name" maxlength="120" required dir="auto"></div>' +
      '<div class="field field--full"><label class="field__label" for="setup-name-ar">' + esc(t('setup.nameAr')) + '</label>' +
      '<input class="control" id="setup-name-ar" name="name_ar" maxlength="120" lang="ar" dir="rtl"></div>' +
      '<div class="field field--full"><label class="field__label" for="setup-username">' + esc(t('setup.username')) + '</label>' +
      '<input class="control" id="setup-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30" dir="ltr" required aria-describedby="setup-username-hint">' +
      '<p class="field__hint" id="setup-username-hint">' + esc(t('setup.usernameHint', { current: admin.username })) + '</p></div>' +
      '<div class="field"><label class="field__label" for="setup-password">' + esc(t('setup.password')) + '</label>' +
      '<input class="control" id="setup-password" name="password" type="password" autocomplete="new-password" required aria-describedby="setup-rules">' +
      '<ul class="rules" id="setup-rules" aria-live="polite"></ul></div>' +
      '<div class="field"><label class="field__label" for="setup-confirm">' + esc(t('setup.confirm')) + '</label>' +
      '<input class="control" id="setup-confirm" name="confirm" type="password" autocomplete="new-password" required></div>' +
      '</div></div>' +
      '<div class="modal__foot"><button type="button" class="btn btn--ghost" data-action="sign-out">' + icon('log-out', { size: 16 }) + esc(t('top.signOut')) + '</button>' +
      '<button type="submit" class="btn btn--primary" id="setup-save">' + icon('check-circle', { size: 16 }) + esc(t('setup.save')) + '</button></div>' +
      '</form>';
    document.body.appendChild(dialog);
    const formEl = dialog.querySelector('form');
    const rules = dialog.querySelector('#setup-rules');
    drawPwRules(rules, '');
    formEl.elements.password.addEventListener('input', function () { drawPwRules(rules, formEl.elements.password.value); });
    // Escape does not close it.
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); });
    dialog.addEventListener('close', function () { if (dialog.hasAttribute('data-locked')) dialog.showModal(); });

    formEl.addEventListener('submit', function (event) {
      event.preventDefault();
      const v = form.values(formEl);
      const pass = formEl.elements.password.value;
      const errors = {};
      if (!v.name) errors.name = 'err.required';
      else if (v.name.length < 3) errors.name = 'setup.errName';
      if (v.name_ar && !/[؀-ۿ]/.test(v.name_ar)) errors.name_ar = 'menus.errArabic';
      const username = v.username.toLowerCase();
      if (!username) errors.username = 'err.required';
      else if (!/^[a-z][a-z0-9._-]{2,29}$/.test(username)) errors.username = 'setup.errUsername';
      else if (username === admin.username) errors.username = 'setup.errSameUsername';
      if (!pass) errors.password = 'err.required';
      else if (!PW_RULES.every(function (r) { return r.test(pass); })) errors.password = 'err.passwordRules';
      if (!formEl.elements.confirm.value) errors.confirm = 'err.required';
      else if (pass && formEl.elements.confirm.value !== pass) errors.confirm = 'err.match';
      if (form.show(formEl, errors)) return;

      busy(document.getElementById('setup-save'), api.post('/auth/setup', {
        name: v.name, name_ar: v.name_ar || null, username: username, password: pass, password_confirmation: formEl.elements.confirm.value,
      })).then(function (res) {
        data.db.admin = res.user;
        dialog.removeAttribute('data-locked');
        dialog.close();
        dialog.remove();
        setLoading(true);
        return start().then(function () { toast(t('setup.done', { name: res.user.name })); });
      }).catch(failed(formEl)).catch(function () { return null; });
    });
    openModal(dialog);
  }

  /* ======================================================================
     Live updates. Every few seconds the page asks the server for news
     (GET /api/sync). When any record changed, the page reloads its records
     and redraws without a page reload; a new notification also rings the
     bell, shows a toast, and a browser notification when the tab is hidden
     and the user allowed them (Settings).
     ====================================================================== */
  let redrawWaiting = false;

  function redraw() {
    // Never underneath an open form: wait until the dialog closes.
    if ($('dialog[open]')) { redrawWaiting = true; return; }
    redrawWaiting = false;
    refreshShell();
    fillTermFields();
    if (pageDef && pageDef.render) pageDef.render();
  }

  /** A system notification, for a student or manager whose tab is in the background. */
  function desktopNotice(text) {
    try {
      if (!global.Notification || global.Notification.permission !== 'granted' || !document.hidden) return;
      if (storage.get('dms.desktop') === 'off') return;
      const notice = new global.Notification(t(STUDENT ? 'app.portalName' : 'app.name'), { body: text, icon: BASE + 'assets/logo-mark.svg', tag: 'dms-alert' });
      notice.onclick = function () { global.focus(); notice.close(); };
    } catch (e) { /* notifications are blocked: the bell and the sound still work */ }
  }

  let version = null;
  let lastUnread = null;
  let polling = false;

  function poll() {
    if (polling) return;
    polling = true;
    api.get('/sync').then(function (s) {
      const ring = lastUnread !== null && s.unread > lastUnread;
      const changed = version !== null && s.version !== version;
      version = s.version;
      lastUnread = s.unread;
      if (!changed && !ring) return null;
      return reload().then(function () {
        if (!ring) return;
        const latest = STUDENT ? studentAlerts()[0] : data.db.activity[0];
        if (!latest) return;
        const text = STUDENT ? alertText(latest) : activityText(latest);
        refreshBell(true);
        toast(text, 'info', true);
        desktopNotice(text);
      });
    }).catch(function () { return null; }).then(function () { polling = false; });
  }

  function bindLive() {
    document.addEventListener('close', function () {
      if (!$('dialog[open]') && redrawWaiting) redraw();
    }, true);
    if (DMS.translate) DMS.translate.onUpdate(redraw);
    poll();
    global.setInterval(poll, DMS.config.pollSeconds * 1000);
    // Coming back to the tab: check at once.
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  }

  DMS.ui = {
    tr: tr, setText: setText, getText: getText, mailLink: mailLink, telLink: telLink,
    $: $, $$: $$, esc: esc, icon: icon, badge: badge, empty: emptyState, td: td,
    avatar: avatar, person: person, roomCode: roomCode, initials: initials, credentials: credentials, mailCard: mailCard,
    toast: toast, confirm: confirm, openModal: openModal, closeModal: closeModal,
    readImage: readImage, downloadCsv: downloadCsv, printReport: printReport, announce: announce, hydrateIcons: hydrateIcons,
    activityText: activityText, activityIcon: activityIcon, statusChips: statusChips,
    noteText: noteText, alertText: alertText, alertIcon: alertIcon, resolveParams: resolveParams,
    /** .catch(ui.failed(form)): shows an API refusal under the form's fields, or as a toast. */
    failed: failed,
    errorText: errorText,
    /** busy(button, promise): the button is disabled while the request runs. */
    busy: busy,
    pwRules: PW_RULES,
    drawPwRules: drawPwRules,
  };
  DMS.form = form;
  DMS.list = { create: createList };
  DMS.auth = auth;
  DMS.theme = { choice: getThemeChoice, set: setTheme, isDark: isDark, onChange: function (fn) { themeListeners.push(fn); } };
  DMS.app = {
    nav: NAV,
    area: AREA,
    page: function (def) { pageDef = def; },
    refreshShell: refreshShell,
    refreshBell: refreshBell,
    markAllRead: markAllRead,
    /** Academic term the admin lists show: get, set, hasRecord, hasDate, name, label, onChange. */
    term: term,
    /** The signed-in student (student portal only). */
    student: function () { return studentAuth.current(); },
    /** The signed-in account as the API describes it (role, username, avatar ...). */
    user: function () { return STUDENT ? data.db.me : data.db.admin; },
    /** Reload the page's records from the server and redraw (call after a change). */
    reload: reload,
  };

  document.addEventListener('DOMContentLoaded', boot);
})(window);
