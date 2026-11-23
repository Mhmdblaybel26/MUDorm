/* ==========================================================================
   config.js — where the Laravel API is. The only file to edit when the
   backend moves (see DEPLOYMENT.md).

   Local (WAMP): Apache serves Laravel's public/ folder at
     http://localhost/MU-Dorm-Backend/public  ->  API at .../public/api
   The address follows the host the page was opened with (localhost or
   127.0.0.1), so the pages and the API stay on the same machine.

   Production: set API_BASE to the API's address, for example
     'https://api.mudorm.example/api'
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = (global.DMS = global.DMS || {});

  const API_BASE = '';
  const LOCAL_PATH = '/MU-Dorm-Backend/public/api';
  // Where WAMP's Apache publishes this folder (C:\wamp64\alias\mudorm.conf).
  const LOCAL_SITE = 'http://localhost/mudorm';

  /* A page opened straight from disk (file://...) has no web address, so the
     browser will not let it read the API's answers. It moves to the same page
     on the local web server instead: .../main page/index.html becomes
     http://localhost/mudorm/main%20page/index.html. */
  let leaving = false;
  if (global.location.protocol === 'file:') {
    const path = global.location.pathname.replace(/\\/g, '/');
    const match = /\/(main(%20| )page|login|manager|students)\/[^/]*$/i.exec(path);
    if (match) {
      leaving = true;
      global.location.replace(LOCAL_SITE + match[0].replace(/ /g, '%20') + global.location.search + global.location.hash);
    }
  }

  function localBase() {
    const loc = global.location;
    const host = /^https?:$/.test(loc.protocol) ? loc.hostname : 'localhost';
    return 'http://' + host + LOCAL_PATH;
  }

  DMS.config = {
    apiBase: (API_BASE || localBase()).replace(/\/+$/, ''),
    // How often open pages ask the server for news (new notifications, changed records).
    pollSeconds: 8,
    // Automatic translation of text typed in one language (needs the internet; optional).
    autoTranslate: true,
    // True while a page opened from disk moves to the web server: no requests are sent.
    leaving: leaving,
  };
})(window);
