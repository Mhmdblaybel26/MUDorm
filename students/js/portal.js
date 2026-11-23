/* ==========================================================================
   portal.js — helpers shared by every student portal page (DMS.portal):
   the signed-in student, their room and meal requests, and the dorm pass.

   The shell itself (sidebar, top bar, sign-in guard, live notifications) is
   ../manager/js/app.js running with <body data-area="student">. Notifications
   come from Laravel: the bell is refreshed every few seconds while a page is
   open, and a browser notification appears when the student allowed them.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const data = DMS.data;

  function me() { return DMS.app.student(); }
  function myRoom() { return data.roomOfStudent(me().id); }
  function myAllocation() { return data.allocationOf(me().id); }

  /* ---- Meal requests ----------------------------------------------------------
     The deadline rule itself (data.mealDeadline / data.mealOpen) lives in
     ../manager/js/data.js; Laravel enforces it again. */
  /** A student's live requests for one day (cancelled ones left out). */
  function ordersFor(studentId, isoDate) {
    const order = { breakfast: 0, lunch: 1, dinner: 2 };
    return data.db.orders.filter(function (o) { return o.student_id === studentId && o.date === isoDate && o.status === 'reserved'; })
      .sort(function (a, b) { return order[a.meal] - order[b.meal]; });
  }
  /** "01:07:45" for a number of milliseconds. */
  function clock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor(total / 60) % 60) + ':' + pad(total % 60);
  }

  /* ---- Dorm pass: the code and the QR content are signed by the server ---- */
  function passCode() { return data.db.pass ? data.db.pass.code : ''; }
  function passPayload() { return data.db.pass ? data.db.pass.payload : ''; }
  /**
   * QR code as an SVG string, drawn from the qrcode-generator library
   * (served with the site, so it works offline). Returns null without it.
   */
  function qrSvg(text, label) {
    if (typeof global.qrcode !== 'function' || !text) return null;
    const qr = global.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) path += 'M' + c + ' ' + r + 'h1v1h-1z';
    }
    return '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" role="img" aria-label="' + DMS.ui.esc(label) + '" shape-rendering="crispEdges">' +
      '<rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#ffffff"/><path d="' + path + '" fill="#0b1d36"/></svg>';
  }

  DMS.portal = {
    me: me,
    room: myRoom,
    allocation: myAllocation,
    ordersFor: ordersFor,
    clock: clock,
    passCode: passCode,
    passPayload: passPayload,
    qrSvg: qrSvg,
  };
})(window);
