/* ==========================================================================
   translate.js — automatic translation of text typed in one language
   (DMS.translate).

   Announcements, dishes, rules, ticket descriptions, reasons and notes are
   typed once, in Arabic or in English. A reader using the other language
   sees a machine translation. The housing application is the exception: it
   is always shown as it was written.

   How it works
   - text(value) returns the value in the reader's language. If no
     translation is saved yet it returns the original and asks the service
     in the background; pages are redrawn when the answer arrives.
   - Answers are kept in this browser (localStorage "dms.translations"), so a
     text is translated once and then works offline.
   - Optional: it needs the internet. Offline, or with DMS.config.autoTranslate
     set to false in config.js, everyone sees the text as it was written; the
     rest of the system is not affected.

   Service: MyMemory (https://mymemory.translated.net), free, no key, about
   5,000 characters a day per visitor. The text is sent to that service to be
   translated; do not use it for confidential text.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const storage = DMS.storage;
  const enabled = !DMS.config || DMS.config.autoTranslate !== false;

  const CACHE_KEY = 'dms.translations';
  // The newest answers are kept; older ones are dropped so the cache stays small.
  const CACHE_MAX = 600;
  const cache = (function () {
    try { return JSON.parse(storage.get(CACHE_KEY) || '{}') || {}; } catch (e) { return {}; }
  })();
  function remember(key, value) {
    cache[key] = value;
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) keys.slice(0, keys.length - CACHE_MAX).forEach(function (k) { delete cache[k]; });
    storage.set(CACHE_KEY, JSON.stringify(cache));
  }

  const ENDPOINT = 'https://api.mymemory.translated.net/get';
  // The service accepts 500 bytes per call; Arabic letters take two bytes each.
  const CHUNK = { en: 420, ar: 200 };
  const listeners = [];
  const waiting = {};
  const failed = {};
  let timer = null;

  function languageOf(text) { return /[؀-ۿ]/.test(text) ? 'ar' : 'en'; }
  /** Codes, numbers and symbols need no translation. */
  function hasWords(text) { return /[A-Za-z؀-ۿ]{2}/.test(text); }

  /** Cuts a long text at sentence ends (or spaces) into pieces the service accepts. */
  function pieces(text, limit) {
    const out = [];
    let rest = text;
    while (rest.length > limit) {
      const head = rest.slice(0, limit);
      let cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('؟ '), head.lastIndexOf('! '), head.lastIndexOf('\n'));
      if (cut < limit / 3) cut = head.lastIndexOf(' ');
      if (cut < 1) cut = limit - 1;
      out.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1);
    }
    if (rest.trim()) out.push(rest.trim());
    return out;
  }

  function decode(text) {
    const box = document.createElement('textarea');
    box.innerHTML = text;
    return box.value;
  }

  function ask(part, from, to) {
    return global.fetch(ENDPOINT + '?q=' + encodeURIComponent(part) + '&langpair=' + from + '|' + to)
      .then(function (response) { return response.json(); })
      .then(function (answer) {
        const translated = answer && answer.responseData && answer.responseData.translatedText;
        // When the daily limit is used up the service answers with a warning instead of a translation.
        if (Number(answer.responseStatus) !== 200 || !translated || /^MYMEMORY WARNING/i.test(translated)) throw new Error('no translation');
        return decode(translated).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
      });
  }

  function request(text, from, to, key) {
    waiting[key] = true;
    Promise.all(pieces(text, CHUNK[from]).map(function (part) { return ask(part, from, to); }))
      .then(function (parts) {
        remember(key, parts.join(' '));
        // Several answers usually arrive together: redraw once.
        global.clearTimeout(timer);
        timer = global.setTimeout(function () { listeners.forEach(function (fn) { fn(); }); }, 300);
      })
      .catch(function () { failed[key] = true; }) // offline or over the limit: the original stays on screen
      .then(function () { delete waiting[key]; });
  }

  /** The text in the reader's language, or as written while (or if) no translation is available. */
  function text(value) {
    const original = String(value === undefined || value === null ? '' : value);
    const to = i18n.lang();
    if (!original || !hasWords(original)) return original;
    const from = languageOf(original);
    if (from === to) return original;
    const key = to + '|' + original;
    const saved = cache[key];
    if (saved) return saved;
    if (enabled && !waiting[key] && !failed[key] && typeof global.fetch === 'function') request(original, from, to, key);
    return original;
  }

  /**
   * For text kept in both languages (the application form): resolves to the
   * translation into `to`, or to the text as written when none is available.
   */
  function into(value, to) {
    const original = String(value === undefined || value === null ? '' : value);
    const from = languageOf(original);
    if (!original || !hasWords(original) || from === to) return Promise.resolve(original);
    const key = to + '|' + original;
    if (cache[key]) return Promise.resolve(cache[key]);
    if (!enabled || typeof global.fetch !== 'function') return Promise.resolve(original);
    // Never wait long: offline, the text as written is used.
    const timeout = new Promise(function (resolve) { global.setTimeout(function () { resolve(null); }, 6000); });
    const asked = Promise.all(pieces(original, CHUNK[from]).map(function (part) { return ask(part, from, to); }))
      .then(function (parts) { remember(key, parts.join(' ')); return cache[key]; })
      .catch(function () { return null; });
    return Promise.race([asked, timeout]).then(function (out) { return out || original; });
  }

  DMS.translate = {
    text: text,
    into: into,
    languageOf: languageOf,
    onUpdate: function (fn) { listeners.push(fn); },
  };
})(window);
