/* ==========================================================================
   login.js — one log-in page for students and the dorm manager, signed in by
   the Laravel API (Sanctum tokens, see ../manager/js/api.js).

   - Students cannot sign up. Only the dorm office creates student accounts;
     the username is the university ID and the first password is a temporary
     one from the office.
   - After signing in with a temporary password the student must choose a new
     one here; Laravel keeps the portal closed until then.
   - The dorm manager logs in here too and is sent to the console. The first
     time, the console asks for the mandatory account setup.
   - Disabled accounts cannot sign in. After 5 wrong passwords the account is
     locked for a minute (enforced by Laravel).
   - A student already signed in on this browser goes straight to the portal,
     except when the page was opened from the console (?as=manager).
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const site = DMS.site;
  const api = DMS.api;
  const esc = site.esc;
  const icon = DMS.icons.icon;

  const PORTAL = '../students/index.html';
  const CONSOLE = '../manager/dashboard.html';
  const FOR_MANAGER = /[?&]as=manager(&|$)/.test(global.location.search);
  const RULES = [
    { key: 'pw.length', test: function (p) { return p.length >= 8; } },
    { key: 'pw.upper', test: function (p) { return /[A-Z]/.test(p); } },
    { key: 'pw.lower', test: function (p) { return /[a-z]/.test(p); } },
    { key: 'pw.number', test: function (p) { return /\d/.test(p); } },
    { key: 'pw.symbol', test: function (p) { return /[^A-Za-z0-9]/.test(p); } },
  ];
  let result = null; // what the status box shows, kept so it can be redrawn in the other language
  let student = null; // the signed-in student who still has to choose a password
  let remember = false;
  let els = {};

  function homeHref(hash) {
    return (i18n.lang() === 'ar' ? '../main%20page/index.html' : '../main%20page/engindex.html') + (hash || '');
  }

  function notice(tone, iconName, title, body) {
    return '<div class="notice notice--' + tone + '">' + icon(iconName, { size: 18 }) +
      '<div><strong>' + esc(title) + '</strong>' + body + '</div></div>';
  }

  function drawResult() {
    const box = els.result;
    if (!result) { box.innerHTML = ''; return; }
    if (result.type === 'error') {
      box.innerHTML = notice('danger', 'alert', t('login.errTitle'), esc(t('login.errText')));
    } else if (result.type === 'disabled') {
      box.innerHTML = notice('danger', 'lock', t('login.disabledTitle'),
        (result.note ? '<span dir="auto">' + esc(result.note) + '</span><br>' : '') + esc(t('login.disabledText')));
    } else if (result.type === 'locked') {
      box.innerHTML = notice('danger', 'clock', t('login.lockedTitle'), esc(t('login.lockedText', { seconds: i18n.number(result.seconds) })));
    } else if (result.type === 'offline') {
      box.innerHTML = notice('danger', 'alert', t('login.offlineTitle'), esc(t('login.offlineText')));
    } else if (result.type === 'temp') {
      box.innerHTML = notice('warning', 'key', t('login.tempTitle'), esc(t('login.tempText')));
    } else if (result.type === 'message') {
      box.innerHTML = notice('danger', 'alert', t('login.errTitle'), esc(result.text));
    }
  }

  function drawRules() {
    const value = els.pwForm.elements.password.value;
    document.getElementById('pw-rules').innerHTML = RULES.map(function (rule) {
      const met = rule.test(value);
      return '<li' + (met ? ' class="is-met"' : '') + '>' + icon(met ? 'check-circle' : 'info', { size: 14 }) +
        '<span>' + esc(t(rule.key)) + '<span class="sr-only"> ' + esc(t(met ? 'pw.met' : 'pw.notMet')) + '</span></span></li>';
    }).join('');
  }

  function drawLinks() {
    document.querySelectorAll('[data-home-link]').forEach(function (a) { a.href = homeHref(a.getAttribute('data-hash')); });
  }

  /** Opens the portal, or first asks for a new password while the temporary one is in use. */
  function showSignedIn(user) {
    if (!user.must_change_password) { global.location.href = PORTAL; return; }
    student = user;
    result = { type: 'temp' };
    els.loginForm.hidden = true;
    els.noAccount.hidden = true;
    els.pwForm.hidden = false;
    els.pwForm.elements.username.value = user.username;
    drawRules();
    drawResult();
  }

  function showLoggedOut() {
    api.clearToken('student');
    student = null;
    result = null;
    els.pwForm.hidden = true;
    els.loginForm.hidden = false;
    els.noAccount.hidden = false;
    els.loginForm.reset();
    drawResult();
    els.loginForm.elements.username.focus();
  }

  function setBusy(formEl, on) {
    const button = formEl.querySelector('[type="submit"]');
    button.disabled = on;
    if (on) button.setAttribute('aria-busy', 'true'); else button.removeAttribute('aria-busy');
  }

  function submitLogin(event) {
    event.preventDefault();
    result = null;
    drawResult();
    const formEl = els.loginForm;
    const v = site.form.values(formEl);
    const username = v.username.toLowerCase();
    const pass = formEl.elements.password.value;
    const errors = {};
    if (!username) errors.username = 'err.required';
    if (!pass) errors.password = 'err.required';
    if (site.form.show(formEl, errors)) return;

    remember = !!v.remember;
    setBusy(formEl, true);
    api.post('/auth/login', { username: username, password: pass, remember: remember }, { area: null }).then(function (res) {
      const user = res.user;
      if (user.role === 'admin') {
        api.setToken('admin', res.token, remember);
        global.location.href = CONSOLE;
        return;
      }
      api.setToken('student', res.token, remember);
      setBusy(formEl, false);
      showSignedIn(user);
      if (user.must_change_password) els.pwForm.elements.current.focus();
    }).catch(function (err) {
      setBusy(formEl, false);
      if (err.code === 'accountDisabled') result = { type: 'disabled', note: err.params.note };
      else if (err.code === 'tooManyAttempts') result = { type: 'locked', seconds: err.params.seconds || 60 };
      else if (err.code === 'network') result = { type: 'offline' };
      else if (err.code === 'badCredentials' || err.status === 422) result = { type: 'error' };
      else result = { type: 'message', text: err.message };
      if (DMS.sound) DMS.sound.play('error');
      formEl.elements.password.value = '';
      drawResult();
      els.result.focus();
    });
  }

  function submitPassword(event) {
    event.preventDefault();
    const formEl = els.pwForm;
    const current = formEl.elements.current.value;
    const next = formEl.elements.password.value;
    const confirm = formEl.elements.confirm.value;
    const errors = {};
    if (!current) errors.current = 'err.required';
    if (!next) errors.password = 'err.required';
    else if (!RULES.every(function (r) { return r.test(next); })) errors.password = 'err.passwordRules';
    else if (next === current) errors.password = 'err.same';
    if (!confirm) errors.confirm = 'err.required';
    else if (next && confirm !== next) errors.confirm = 'err.match';
    if (site.form.show(formEl, errors)) return;

    setBusy(formEl, true);
    api.post('/auth/password', { current: current, password: next, password_confirmation: confirm }, { area: 'student' }).then(function () {
      global.location.href = PORTAL;
    }).catch(function (err) {
      setBusy(formEl, false);
      if (err.code === 'wrongCurrent') site.form.show(formEl, { current: 'err.current' });
      else if (err.code === 'samePassword') site.form.show(formEl, { password: 'err.same' });
      else if (err.errors && err.errors.password) site.form.show(formEl, { password: 'err.passwordRules' });
      else if (err.status === 401) showLoggedOut();
      else { result = { type: err.code === 'network' ? 'offline' : 'message', text: err.message }; drawResult(); }
    });
  }

  function init() {
    els = {
      result: document.getElementById('login-result'),
      loginForm: document.getElementById('login-form'),
      pwForm: document.getElementById('password-form'),
      noAccount: document.getElementById('no-account'),
    };
    els.result.setAttribute('tabindex', '-1');
    site.drawTools(document.getElementById('auth-tools'), 'toggle');
    drawLinks();
    drawRules();

    // Already signed in as a student on this browser.
    if (!FOR_MANAGER && api.token('student')) {
      api.get('/auth/me', null, { area: 'student' }).then(function (res) {
        if (res.data.role === 'student') showSignedIn(res.data);
      }).catch(function () { api.clearToken('student'); });
    }

    const password = document.getElementById('login-password');
    const toggle = document.getElementById('toggle-password');
    toggle.addEventListener('click', function () {
      const show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', t(show ? 'login.hide' : 'login.show'));
      toggle.innerHTML = icon(show ? 'eye-off' : 'eye', { size: 18 });
    });

    document.getElementById('pw-logout').addEventListener('click', function () {
      els.pwForm.reset();
      site.form.clear(els.pwForm);
      api.post('/auth/logout', null, { area: 'student' }).catch(function () { return null; }).then(showLoggedOut);
    });

    els.loginForm.addEventListener('submit', submitLogin);
    els.pwForm.addEventListener('submit', submitPassword);
    els.pwForm.elements.password.addEventListener('input', drawRules);

    DMS.i18n.onChange(function () { drawResult(); drawRules(); drawLinks(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
