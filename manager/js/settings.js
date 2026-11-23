/* ==========================================================================
   settings.js — the administrator's Settings page.
   - Profile: full name (shown throughout the system), Arabic name, personal
     username, own e-mail (optional, for example a Gmail address), photo.
   - Password change (checked by Laravel; other devices are signed out).
   - Language, theme, sound and browser notifications (this browser only).
   - Technicians that maintenance requests are assigned to.
   - E-mail: whether sending (Gmail) is set up and from which address, a test
     e-mail, and the latest e-mails the system sent, logged locally, or could
     not send (with the reason).
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;
  const api = DMS.api;
  const storage = DMS.storage;

  // Read by the live-update code in app.js.
  const DESKTOP_KEY = 'dms.desktop';
  let avatar = null;
  let avatarChanged = false;
  let mailLog = null;

  const RULES = [
    { key: 'settings.ruleLength', test: function (p) { return p.length >= 8; } },
    { key: 'settings.ruleUpper', test: function (p) { return /[A-Z]/.test(p); } },
    { key: 'settings.ruleLower', test: function (p) { return /[a-z]/.test(p); } },
    { key: 'settings.ruleNumber', test: function (p) { return /\d/.test(p); } },
    { key: 'settings.ruleSymbol', test: function (p) { return /[^A-Za-z0-9]/.test(p); } },
  ];

  function drawRules() {
    const value = document.getElementById('pw-new').value;
    document.getElementById('pw-rules').innerHTML = RULES.map(function (rule) {
      const met = rule.test(value);
      return '<li' + (met ? ' class="is-met"' : '') + '>' + ui.icon(met ? 'check-circle' : 'info', { size: 14 }) +
        '<span>' + esc(t(rule.key)) + '<span class="sr-only"> ' + esc(t(met ? 'settings.ruleMet' : 'settings.ruleNotMet')) + '</span></span></li>';
    }).join('');
  }

  function drawAvatar() {
    const admin = data.db.admin;
    document.getElementById('avatar-preview').innerHTML = avatar
      ? '<img src="' + esc(avatar) + '" alt="' + esc(t('settings.photoPreview')) + '">'
      : ui.avatar(Object.assign({ id: 0 }, admin, { avatar: null }), 'lg');
    document.getElementById('avatar-remove').hidden = !avatar;
  }

  function fillProfile() {
    const admin = data.db.admin;
    avatar = admin.avatar;
    avatarChanged = false;
    DMS.form.fill(document.getElementById('profile-form'), { name: admin.name, name_ar: admin.name_ar, username: admin.username, email: admin.email || '' });
    drawAvatar();
  }

  /* ---- Browser notifications ---- */
  function desktopState() {
    if (!('Notification' in global)) return 'unsupported';
    if (global.Notification.permission === 'denied') return 'blocked';
    if (global.Notification.permission !== 'granted') return 'ask';
    return storage.get(DESKTOP_KEY) === 'off' ? 'off' : 'on';
  }
  function drawDesktop() {
    const state = desktopState();
    const button = document.getElementById('desktop-toggle');
    document.getElementById('desktop-status').textContent = t('settings.desktop_' + state);
    button.hidden = state === 'unsupported' || state === 'blocked';
    button.textContent = t(state === 'on' ? 'settings.desktopOff' : state === 'off' ? 'settings.desktopOn' : 'settings.desktopAllow');
  }
  function toggleDesktop() {
    const state = desktopState();
    if (state === 'on') { storage.set(DESKTOP_KEY, 'off'); drawDesktop(); return; }
    storage.remove(DESKTOP_KEY);
    if (state === 'off') { drawDesktop(); return; }
    Promise.resolve(global.Notification.requestPermission(function () { /* older browsers answer by callback */ })).then(drawDesktop);
  }

  /* ---- Technicians ---- */
  function drawTechnicians() {
    const list = data.db.technicians;
    document.getElementById('tech-list').innerHTML = list.length
      ? list.map(function (tech) {
        return '<li class="activity__item"><span class="tile tile--sm tile--neutral">' + ui.icon('wrench', { size: 16 }) + '</span>' +
          '<div class="attention-row"><span class="activity__text"><span dir="auto">' + esc(i18n.name(tech)) + '</span> · ' + esc(t('specialty.' + tech.specialty)) +
          (tech.phone ? ' · ' + ui.telLink(tech.phone) : '') + '</span>' +
          '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-remove-tech="' + tech.id + '" aria-label="' + esc(t('tech.removeLabel', { name: i18n.name(tech) })) + '">' + ui.icon('trash', { size: 16 }) + '</button></div></li>';
      }).join('')
      : '<li>' + ui.empty({ icon: 'wrench', title: 'tech.emptyTitle', text: 'tech.emptyText', compact: true }) + '</li>';
    document.getElementById('tech-specialty').innerHTML = data.config.technicianSpecialties.map(function (k) {
      return '<option value="' + k + '">' + esc(t('specialty.' + k)) + '</option>';
    }).join('');
  }

  /* ---- E-mail ---- */
  function drawMail() {
    if (!mailLog) return;
    const local = mailLog.mailer === 'log' || mailLog.mailer === 'array';
    // Gmail chosen, its App Password not in .env yet; otherwise sending, or the log by choice.
    const state = mailLog.gmail_waiting ? 'wait' : local ? 'local' : 'live';
    document.getElementById('mail-status').innerHTML = '<div class="notice ' + (state === 'live' ? 'notice--success' : 'notice--warning') + '">' +
      ui.icon(state === 'live' ? 'mail' : 'info', { size: 18 }) + '<div><strong>' + esc(t('maillog.' + state + 'Title')) + '</strong>' +
      esc(t('maillog.' + state + 'Text', { mailer: mailLog.mailer === 'gmail' ? 'Gmail' : mailLog.mailer, from: mailLog.from || '' })) + '</div></div>';
    const tones = { sent: 'success', logged: 'info', failed: 'danger' };
    document.getElementById('mail-log').innerHTML = mailLog.data.length
      ? mailLog.data.slice(0, 8).map(function (m) {
        return '<li class="activity__item"><span class="tile tile--sm tile--' + tones[m.status] + '">' + ui.icon('mail', { size: 16 }) + '</span>' +
          '<div><p class="activity__text"><span class="ltr">' + esc(m.to) + '</span> · ' + esc(t('maillog.status_' + m.status)) + '</p>' +
          '<p class="activity__time" dir="auto">' + esc(m.subject) + ' · <time datetime="' + esc(m.at) + '">' + esc(i18n.relative(m.at)) + '</time></p>' +
          (m.status === 'failed' && m.error ? '<p class="cell-sub ltr">' + esc(t('maillog.why', { error: m.error })) + '</p>' : '') + '</div></li>';
      }).join('')
      : '<li>' + ui.empty({ icon: 'mail', title: 'maillog.emptyTitle', text: 'maillog.emptyText', compact: true }) + '</li>';
  }
  function loadMail() {
    return api.get('/email-logs', { per_page: 8 }).then(function (res) { mailLog = res; drawMail(); }).catch(function () { return null; });
  }

  function init() {
    const profileForm = document.getElementById('profile-form');
    const passwordForm = document.getElementById('password-form');

    fillProfile();
    drawRules();
    drawDesktop();
    drawTechnicians();
    loadMail();
    passwordForm.elements.username.value = data.db.admin.username;

    document.getElementById('avatar-input').addEventListener('change', function (event) {
      ui.readImage(event.target.files[0]).then(function (url) {
        avatar = url;
        avatarChanged = true;
        DMS.form.clear(profileForm);
        drawAvatar();
      }).catch(function (key) { DMS.form.show(profileForm, { avatar: key }); });
      event.target.value = '';
    });
    document.getElementById('avatar-remove').addEventListener('click', function () {
      avatar = null;
      avatarChanged = true;
      drawAvatar();
      document.getElementById('avatar-input').focus();
    });
    const testForm = document.getElementById('mail-test-form');
    testForm.elements.to.value = data.db.admin.email || '';
    testForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const to = (testForm.elements.to.value || '').trim().toLowerCase();
      const errors = {};
      if (!to) errors.to = 'err.required';
      else if (!DMS.form.isEmail(to)) errors.to = 'err.email';
      if (DMS.form.show(testForm, errors)) return;
      ui.busy(testForm.querySelector('[type="submit"]'), api.post('/mail/test', { to: to }))
        .then(function (res) {
          const logged = res.data.status === 'logged';
          ui.toast(t(logged ? 'maillog.toastTestLogged' : 'maillog.toastTest', { to: res.data.to }), logged ? 'warning' : 'success');
        })
        .catch(ui.failed(testForm))
        // The attempt is in the list either way (with the reason when it failed).
        .then(loadMail, loadMail);
    });

    profileForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const v = DMS.form.values(profileForm);
      const username = (v.username || '').toLowerCase();
      const errors = {};
      if (!v.name) errors.name = 'err.required';
      else if (v.name.length < 3) errors.name = 'settings.errNameShort';
      // The Arabic name is optional; when given it must be in Arabic letters.
      if (v.name_ar && !DMS.form.isArabic(v.name_ar)) errors.name_ar = 'menus.errArabic';
      if (!username) errors.username = 'err.required';
      else if (!/^[a-z][a-z0-9._-]{2,29}$/.test(username)) errors.username = 'setup.errUsername';
      const email = (v.email || '').trim().toLowerCase();
      if (email && !DMS.form.isEmail(email)) errors.email = 'err.email';
      if (DMS.form.show(profileForm, errors)) return;
      const body = { name: v.name, name_ar: v.name_ar || null, username: username, email: email || null };
      const photo = !avatarChanged ? Promise.resolve()
        : avatar ? api.post('/profile/avatar', api.form({}, { avatar: avatar })) : api.del('/profile/avatar');
      ui.busy(profileForm.querySelector('[type="submit"]'), api.patch('/profile', body).then(function (res) {
        data.db.admin = res.user;
        return photo;
      })).then(function () {
        return DMS.app.reload().then(function () {
          return api.get('/auth/me').then(function (me) { data.db.admin = me.data; });
        });
      }).then(function () {
        fillProfile();
        passwordForm.elements.username.value = data.db.admin.username;
        DMS.app.refreshShell();
        ui.toast(t('settings.toastProfile'));
      }).catch(ui.failed(profileForm));
    });

    document.getElementById('pw-new').addEventListener('input', drawRules);
    passwordForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const current = passwordForm.elements.current.value;
      const next = passwordForm.elements.password.value;
      const confirm = passwordForm.elements.confirm.value;
      const errors = {};
      if (!current) errors.current = 'err.required';
      if (!next) errors.password = 'err.required';
      else if (!RULES.every(function (r) { return r.test(next); })) errors.password = 'settings.errRules';
      else if (next === current) errors.password = 'settings.errSame';
      if (!confirm) errors.confirm = 'err.required';
      else if (next && confirm !== next) errors.confirm = 'settings.errMatch';
      if (DMS.form.show(passwordForm, errors)) return;
      ui.busy(passwordForm.querySelector('[type="submit"]'), api.post('/auth/password', { current: current, password: next, password_confirmation: confirm }))
        .then(function () {
          passwordForm.reset();
          passwordForm.elements.username.value = data.db.admin.username;
          drawRules();
          ui.toast(t('settings.toastPassword'));
        })
        .catch(function (err) {
          if (err.code === 'wrongCurrent') { DMS.form.show(passwordForm, { current: 'settings.errCurrent' }); return; }
          if (err.code === 'samePassword') { DMS.form.show(passwordForm, { password: 'settings.errSame' }); return; }
          ui.failed(passwordForm)(err).catch(function () { return null; });
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
    const drawSound = function () { soundSel.value = DMS.sound && DMS.sound.enabled() ? 'on' : 'off'; };
    soundSel.disabled = !DMS.sound;
    drawSound();
    soundSel.addEventListener('change', function () {
      DMS.sound.setEnabled(soundSel.value === 'on');
      DMS.sound.play('info');
    });
    // The mute switch in the profile menu changes the same setting.
    if (DMS.sound) DMS.sound.onChange(drawSound);
    document.getElementById('desktop-toggle').addEventListener('click', toggleDesktop);

    const techForm = document.getElementById('tech-form');
    techForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const v = DMS.form.values(techForm);
      const errors = {};
      if (!v.name) errors.name = 'err.required';
      else if (v.name.length < 3) errors.name = 'settings.errNameShort';
      if (v.phone && !DMS.form.isPhone(v.phone)) errors.phone = 'err.phone';
      if (DMS.form.show(techForm, errors)) return;
      const typedArabic = DMS.translate && DMS.translate.languageOf(v.name) === 'ar';
      const body = { name: v.name, name_ar: typedArabic ? v.name : null, specialty: v.specialty, phone: v.phone || null };
      ui.busy(techForm.querySelector('[type="submit"]'), api.post('/technicians', body))
        .then(function () { techForm.reset(); return DMS.app.reload(); })
        .then(function () { ui.toast(t('tech.toastAdded', { name: v.name })); })
        .catch(ui.failed(techForm));
    });
    document.getElementById('tech-list').addEventListener('click', function (event) {
      const b = event.target.closest('[data-remove-tech]');
      if (!b) return;
      const tech = data.find('technicians', b.getAttribute('data-remove-tech'));
      ui.confirm({ title: t('tech.removeTitle'), message: t('tech.removeText', { name: i18n.name(tech) }), confirm: t('common.delete') }).then(function (ok) {
        if (!ok) return null;
        return api.del('/technicians/' + tech.id)
          .then(function () { return DMS.app.reload(); })
          .then(function () { ui.toast(t('tech.toastRemoved', { name: i18n.name(tech) }), 'info'); })
          .catch(ui.failed());
      });
    });
  }

  function render() {
    drawRules();
    drawAvatar();
    drawDesktop();
    drawTechnicians();
    drawMail();
    document.getElementById('pref-lang').value = i18n.lang();
  }

  DMS.app.page({ needs: ['technicians'], init: init, render: render });
})(window);
