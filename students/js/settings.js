/* ==========================================================================
   settings.js — the student's Settings page, in two tabs.
   - Settings: the few things a student manages alone (a personal photo,
     theme and language, the account password, sound and desktop notices).
   - My profile (settings.html#profile): account, contact and study details,
     to view only. The dorm office changes them (manager/students.html), and
     medical details are shown on the Health page.
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
  const storage = DMS.storage;
  const portal = DMS.portal;

  const RULES = [
    { key: 'pw.length', test: function (p) { return p.length >= 8; } },
    { key: 'pw.upper', test: function (p) { return /[A-Z]/.test(p); } },
    { key: 'pw.lower', test: function (p) { return /[a-z]/.test(p); } },
    { key: 'pw.number', test: function (p) { return /\d/.test(p); } },
    { key: 'pw.symbol', test: function (p) { return /[^A-Za-z0-9]/.test(p); } },
  ];
  // Read by the live-update code in ../manager/js/app.js.
  const DESKTOP_KEY = 'dms.desktop';
  let tab = 'settings';
  // The photo shown in the preview; saved to the account only on "Save photo".
  let avatar = null;

  /* ---- Tabs ---- */
  function tabFromHash() { return global.location.hash === '#profile' ? 'profile' : 'settings'; }
  function drawTabs() {
    document.querySelectorAll('#tabs [data-tab]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === tab)); });
    document.getElementById('panel-settings').hidden = tab !== 'settings';
    document.getElementById('panel-profile').hidden = tab !== 'profile';
  }
  function show(next) {
    tab = next;
    drawTabs();
    if (global.history && global.history.replaceState) {
      try { global.history.replaceState(null, '', next === 'profile' ? '#profile' : global.location.pathname + global.location.search); } catch (e) { /* file:// may refuse */ }
    }
  }

  /* ---- Photo and password ---- */
  function drawAvatar() {
    const me = portal.me();
    document.getElementById('avatar-preview').innerHTML = avatar
      ? '<img src="' + esc(avatar) + '" alt="' + esc(t('sset.photoPreview')) + '">'
      : ui.avatar(Object.assign({}, me, { avatar: null }), 'lg');
    document.getElementById('avatar-remove').hidden = !avatar;
    document.getElementById('photo-save').disabled = avatar === (me.avatar || null);
  }

  function drawRules() {
    const value = document.getElementById('password-form').elements.password.value;
    document.getElementById('pw-rules').innerHTML = RULES.map(function (rule) {
      const met = rule.test(value);
      return '<li' + (met ? ' class="is-met"' : '') + '>' + icon(met ? 'check-circle' : 'info', { size: 14 }) +
        '<span>' + esc(t(rule.key)) + '<span class="sr-only"> ' + esc(t(met ? 'pw.met' : 'pw.notMet')) + '</span></span></li>';
    }).join('');
  }

  /* ---- Sound and desktop notices ---- */
  function desktopState() {
    if (!('Notification' in global)) return 'unsupported';
    if (global.Notification.permission === 'denied') return 'blocked';
    if (global.Notification.permission !== 'granted') return 'ask';
    return storage.get(DESKTOP_KEY) === 'off' ? 'off' : 'on';
  }
  function drawAlerts() {
    document.getElementById('pref-sound').value = DMS.sound && DMS.sound.enabled() ? 'on' : 'off';
    const state = desktopState();
    const button = document.getElementById('desktop-toggle');
    document.getElementById('desktop-status').textContent = t('sset.desktop_' + state);
    button.hidden = state === 'unsupported' || state === 'blocked';
    button.textContent = t(state === 'on' ? 'sset.turnOff' : state === 'off' ? 'sset.turnOn' : 'sset.allow');
  }
  function toggleDesktop() {
    const state = desktopState();
    if (state === 'on') {
      storage.set(DESKTOP_KEY, 'off');
      drawAlerts();
      ui.toast(t('sset.toastDesktopOff'), 'info');
      return;
    }
    storage.remove(DESKTOP_KEY);
    if (state === 'off') {
      drawAlerts();
      ui.toast(t('sset.toastDesktopOn'));
      return;
    }
    const asked = global.Notification.requestPermission(function () { /* older browsers answer by callback */ });
    Promise.resolve(asked).then(function () {
      drawAlerts();
      if (desktopState() === 'on') ui.toast(t('sset.toastDesktopOn'));
      else if (desktopState() === 'blocked') ui.toast(t('sset.toastDesktopBlocked'), 'warning');
    });
  }

  /* ---- My profile (view only) ---- */
  function kv(labelKey, html) { return '<div><dt>' + esc(t(labelKey)) + '</dt><dd>' + html + '</dd></div>'; }
  /** Text typed by a person, or a muted "Not provided". */
  function typed(value) {
    return value ? '<span dir="auto">' + esc(value) + '</span>' : '<span class="muted">' + esc(t('sprof.notSet')) + '</span>';
  }

  function drawProfile() {
    const me = portal.me();
    const room = portal.room();
    const office = document.getElementById('office-mail');
    office.textContent = data.config.housingEmail;
    office.href = 'mailto:' + data.config.housingEmail;

    document.getElementById('me-head').innerHTML = ui.avatar(me, 'lg') +
      '<div><p class="profile-card__name" dir="auto">' + esc(i18n.name(me)) + '</p>' +
      '<p class="cell-sub">' + esc(t('major.' + me.major)) + ' · ' + esc(t('common.yearN', { n: i18n.number(me.year) })) + '</p></div>' +
      ui.badge(me.status);
    document.getElementById('me-details').innerHTML =
      kv('sprof.username', '<code class="ltr">' + esc(me.university_id) + '</code>') +
      kv('sprof.nameEn', typed(me.name)) +
      kv('sprof.nameAr', typed(me.name_ar)) +
      kv('sprof.email', ui.mailLink(me.email) || typed('')) +
      kv('sprof.phone', ui.telLink(me.phone) || typed('')) +
      kv('sprof.gender', esc(t('gender.' + me.gender))) +
      kv('sprof.faculty', esc(t('faculty.' + data.config.majors[me.major]))) +
      kv('sprof.major', esc(t('major.' + me.major)) + ' · ' + esc(t('common.yearN', { n: i18n.number(me.year) }))) +
      kv('common.room', room ? '<span class="ltr">' + esc(room.number) + '</span> · ' + esc(t('wing.' + room.wing)) : esc(t('common.noRoom'))) +
      kv('sprof.since', esc(i18n.date(me.registered_at, 'medium')));
  }

  function init() {
    const me = portal.me();
    const photoForm = document.getElementById('photo-form');
    const pw = document.getElementById('password-form');
    avatar = me.avatar || null;
    pw.elements.username.value = me.university_id;

    tab = tabFromHash();
    document.getElementById('tabs').addEventListener('click', function (event) {
      const b = event.target.closest('[data-tab]');
      if (b) show(b.getAttribute('data-tab'));
    });
    // The profile menu's "My profile" link lands here with #profile, also when this page is already open.
    global.addEventListener('hashchange', function () { show(tabFromHash()); });

    document.getElementById('avatar-input').addEventListener('change', function (event) {
      ui.readImage(event.target.files[0]).then(function (url) {
        avatar = url;
        DMS.form.clear(photoForm);
        drawAvatar();
      }, function (key) { DMS.form.show(photoForm, { avatar: key }); });
      event.target.value = '';
    });
    document.getElementById('avatar-remove').addEventListener('click', function () {
      avatar = null;
      DMS.form.clear(photoForm);
      drawAvatar();
      document.getElementById('avatar-input').focus();
    });
    photoForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const chosen = avatar;
      // A new photo is uploaded as a file (checked and stored by Laravel); no photo removes it.
      const request = chosen ? DMS.api.post('/profile/avatar', DMS.api.form({}, { avatar: chosen })) : DMS.api.del('/profile/avatar');
      ui.busy(document.getElementById('photo-save'), request)
        .then(function () { return DMS.app.reload(); })
        .then(function () {
          avatar = portal.me().avatar || null;
          drawAvatar();
          drawProfile();
          ui.toast(t(chosen ? 'sset.toastPhoto' : 'sset.toastPhotoRemoved'));
        })
        .catch(ui.failed(photoForm));
    });

    pw.elements.password.addEventListener('input', drawRules);
    pw.addEventListener('submit', function (event) {
      event.preventDefault();
      const student = portal.me();
      const current = pw.elements.current.value;
      const next = pw.elements.password.value;
      const confirm = pw.elements.confirm.value;
      const errors = {};
      if (!current) errors.current = 'err.required';
      if (!next) errors.password = 'err.required';
      else if (!RULES.every(function (r) { return r.test(next); })) errors.password = 'sset.errRules';
      else if (next === current) errors.password = 'sset.errSame';
      if (!confirm) errors.confirm = 'err.required';
      else if (next && confirm !== next) errors.confirm = 'sset.errMatch';
      if (DMS.form.show(pw, errors)) return;
      // Other devices signed in to this account are signed out by Laravel.
      ui.busy(pw.querySelector('[type="submit"]'), DMS.api.post('/auth/password', { current: current, password: next, password_confirmation: confirm }))
        .then(function () {
          pw.reset();
          pw.elements.username.value = student.university_id;
          drawRules();
          ui.toast(t('sset.toastPassword'));
        })
        .catch(function (err) {
          if (err.code === 'wrongCurrent') { DMS.form.show(pw, { current: 'sset.errCurrent' }); return; }
          if (err.code === 'samePassword') { DMS.form.show(pw, { password: 'sset.errSame' }); return; }
          ui.failed(pw)(err).catch(function () { return null; });
        });
    });

    const langSel = document.getElementById('pref-lang');
    const themeSel = document.getElementById('pref-theme');
    langSel.value = i18n.lang();
    themeSel.value = DMS.theme.choice();
    langSel.addEventListener('change', function () { i18n.setLang(langSel.value); langSel.focus(); });
    themeSel.addEventListener('change', function () { DMS.theme.set(themeSel.value); });
    DMS.theme.onChange(function () { themeSel.value = DMS.theme.choice(); });

    const soundSel = document.getElementById('pref-sound');
    soundSel.disabled = !DMS.sound;
    soundSel.addEventListener('change', function () {
      DMS.sound.setEnabled(soundSel.value === 'on');
      DMS.sound.play('info');
    });
    // The mute switch in the profile menu changes the same setting.
    if (DMS.sound) DMS.sound.onChange(drawAlerts);
    document.getElementById('desktop-toggle').addEventListener('click', toggleDesktop);

    render();
  }

  function render() {
    drawTabs();
    drawAvatar();
    drawRules();
    drawAlerts();
    drawProfile();
    document.getElementById('pref-lang').value = i18n.lang();
  }

  DMS.app.page({ needs: [], init: init, render: render });
})(window);
