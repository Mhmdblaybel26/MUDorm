/* ==========================================================================
   api.js — the connection to the Laravel REST API (DMS.api).

   - Sign-in tokens (Laravel Sanctum) are kept per area, so the dorm manager
     and a student can still be signed in side by side in one browser:
       dms.token.admin / dms.token.student
     in sessionStorage, or in localStorage with "Keep me signed in".
   - Every request sends "Authorization: Bearer <token>" and JSON.
   - Errors reject with { status, code, message, params, errors, codes, field }:
       code    a stable key (roomFull, mealClosed ...) or a translation key
       errors  Laravel validation messages per field
       codes   translation keys per field (housing application form)
   - 401 on a signed-in page: the token is dropped and the log-in page opens.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const storage = DMS.storage;
  const BASE = DMS.config.apiBase;
  const KEYS = { admin: 'dms.token.admin', student: 'dms.token.student' };
  // Large pages: the console filters and searches in the browser.
  const PAGE = 500;

  let area = null;
  let onUnauthorized = null;

  function token(which) {
    const key = KEYS[which || area];
    if (!key) return null;
    return storage.get(key, 'session') || storage.get(key) || null;
  }
  function setToken(which, value, remember) {
    clearToken(which);
    storage.set(KEYS[which], value, remember ? 'local' : 'session');
  }
  function clearToken(which) {
    storage.remove(KEYS[which], 'session');
    storage.remove(KEYS[which]);
  }

  function query(params) {
    if (!params) return '';
    const parts = Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function failure(status, body) {
    const b = body || {};
    const err = new Error(b.message || 'Request failed');
    err.status = status;
    err.code = b.code || (status === 422 ? 'invalid' : status === 403 ? 'forbidden' : status === 404 ? 'notFound' : status === 429 ? 'tooManyAttempts' : status >= 500 ? 'server' : 'failed');
    err.params = b.params || {};
    err.errors = b.errors || null;
    err.codes = b.codes || null;
    err.field = b.field || null;
    return err;
  }

  /**
   * opts: { body: object | FormData, area: 'admin' | 'student' | null (no token), query }
   * Resolves with the parsed JSON (or null for an empty answer).
   */
  function request(method, path, opts) {
    // The page is moving to its web address (it was opened from disk): stay quiet until it has.
    if (DMS.config.leaving) return new Promise(function () {});
    const o = opts || {};
    const which = o.area === undefined ? area : o.area;
    const headers = { Accept: 'application/json', 'Accept-Language': DMS.i18n ? DMS.i18n.lang() : 'en' };
    const bearer = which ? token(which) : null;
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    let body;
    if (o.body instanceof FormData) body = o.body;
    else if (o.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }

    return global.fetch(BASE + path + query(o.query), { method: method, headers: headers, body: body, credentials: 'omit' })
      .catch(function () {
        const err = new Error('The server cannot be reached.');
        err.status = 0;
        err.code = 'network';
        err.params = {};
        throw err;
      })
      .then(function (res) {
        return res.text().then(function (text) {
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
          if (res.ok) return json;
          const err = failure(res.status, json);
          if (res.status === 401 && which && bearer && path.indexOf('/auth/login') !== 0) {
            clearToken(which);
            if (onUnauthorized) onUnauthorized(err);
          }
          throw err;
        });
      });
  }

  /** Every page of a list endpoint, joined into one array. */
  function all(path, params) {
    const out = [];
    function page(n) {
      return request('GET', path, { query: Object.assign({}, params, { per_page: PAGE, page: n }) }).then(function (res) {
        Array.prototype.push.apply(out, res.data || []);
        const meta = res.meta || {};
        return meta.last_page && n < meta.last_page ? page(n + 1) : out;
      });
    }
    return page(1);
  }

  /** A data URL from DMS.ui.readImage as a file for a multipart upload. */
  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(',');
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    const bytes = global.atob(parts[1] || '');
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
    return new Blob([array], { type: mime });
  }
  /** FormData from plain values; data-URL images become files. */
  function form(values, files) {
    const fd = new FormData();
    Object.keys(values || {}).forEach(function (k) {
      const v = values[k];
      if (v === undefined || v === null) return;
      fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
    });
    Object.keys(files || {}).forEach(function (k) {
      if (files[k]) fd.append(k, dataUrlToBlob(files[k]), k + '.jpg');
    });
    return fd;
  }

  DMS.api = {
    base: BASE,
    setArea: function (which) { area = which; },
    area: function () { return area; },
    token: token,
    setToken: setToken,
    clearToken: clearToken,
    onUnauthorized: function (fn) { onUnauthorized = fn; },
    request: request,
    get: function (path, params, opts) { return request('GET', path, Object.assign({ query: params }, opts)); },
    post: function (path, body, opts) { return request('POST', path, Object.assign({ body: body }, opts)); },
    put: function (path, body, opts) { return request('PUT', path, Object.assign({ body: body }, opts)); },
    patch: function (path, body, opts) { return request('PATCH', path, Object.assign({ body: body }, opts)); },
    del: function (path, opts) { return request('DELETE', path, opts); },
    all: all,
    form: form,
  };
})(window);
