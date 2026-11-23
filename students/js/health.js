/* ==========================================================================
   health.js — the student's Health page.
   - Emergency: the dorm's own hotline (a tel: link) and the public numbers.
   - Consultation requests to the on-site doctor: normal or urgent, with the
     symptoms. The student follows the appointment and the doctor's note,
     and can cancel a request while the clinic has not handled it yet.
   - The health profile, read-only: only the dorm office can change personal
     or medical details (manager/health.html).
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

  const ORDER = { pending: 0, scheduled: 1, done: 2, cancelled: 3 };
  let list;

  function clinic() { return data.db.settings.health; }
  function mine() {
    const id = portal.me().id;
    return data.db.health_requests.filter(function (r) { return r.student_id === id && DMS.app.term.hasDate(r.created_at); });
  }
  function dial(number) { return 'tel:' + String(number).replace(/[^0-9+]/g, ''); }
  function muted(key) { return '<span class="muted">' + esc(t(key)) + '</span>'; }

  /* ---- Emergency block ---- */
  function drawEmergency() {
    const h = clinic();
    const hotline = document.getElementById('hotline');
    hotline.href = dial(h.hotline);
    hotline.setAttribute('aria-label', t('shealth.callLabel', { number: h.hotline }));
    hotline.innerHTML = icon('phone', { size: 18 }) + '<span>' + esc(t('shealth.call')) + ' <span class="ltr">' + esc(h.hotline) + '</span></span>';
    document.getElementById('public-lines').innerHTML = data.config.publicHotlines.map(function (line) {
      return '<li><a class="emergency__line" href="' + esc(dial(line.number)) + '" aria-label="' + esc(t('shealth.lineLabel', { name: t('shealth.line.' + line.key), number: line.number })) + '">' +
        '<span>' + esc(t('shealth.line.' + line.key)) + '</span><strong class="ltr">' + esc(line.number) + '</strong></a></li>';
    }).join('');
    document.getElementById('clinic').innerHTML = icon('stethoscope', { size: 16 }) +
      '<span>' + esc(t('shealth.clinic', { doctor: i18n.field(h, 'doctor'), hours: i18n.field(h, 'hours') })) + '</span>';
  }

  /** The next appointment the clinic gave this student, if it is still ahead. */
  function drawNotice() {
    const now = data.now();
    const next = data.db.health_requests.filter(function (r) {
      return r.student_id === portal.me().id && r.status === 'scheduled' && r.appointment_at && r.appointment_at >= now;
    }).sort(function (a, b) { return a.appointment_at < b.appointment_at ? -1 : 1; })[0];
    const holder = document.getElementById('health-notice');
    holder.innerHTML = next
      ? '<div class="notice notice--accent">' + icon('calendar', { size: 18 }) + '<div><strong>' + esc(t('shealth.nextTitle')) + '</strong>' +
        esc(t('shealth.next', { when: i18n.dateTime(next.appointment_at), ref: next.ref })) + '</div></div>'
      : '';
    // An empty holder would still take a gap in the page layout.
    holder.hidden = !next;
  }

  /* ---- Requests ---- */
  function row(r) {
    const open = r.status === 'pending';
    return '<tr>' +
      ui.td('shealth.colRequest', '<span class="cell-main ltr">' + esc(r.ref) + '</span> ' +
        (r.urgency === 'urgent' ? '<span class="badge badge--danger">' + esc(t('shealth.urgent')) + '</span>' : '') +
        '<span class="cell-sub"><time datetime="' + esc(r.created_at) + '" title="' + esc(i18n.dateTime(r.created_at)) + '">' + esc(i18n.relative(r.created_at)) + '</time></span>') +
      ui.td('shealth.colProblem', '<span class="cell-clip" dir="auto">' + esc(ui.tr(r.symptoms)) + '</span>' +
        (r.note ? '<span class="cell-sub" dir="auto">' + esc(t('shealth.note', { text: ui.tr(r.note) })) + '</span>' : '')) +
      ui.td('shealth.colAppointment', r.appointment_at && r.status !== 'cancelled'
        ? '<span class="nowrap">' + esc(i18n.dateTime(r.appointment_at)) + '</span>'
        : muted(r.status === 'pending' ? 'shealth.notScheduled' : 'shealth.noAppointment')) +
      ui.td('common.status', ui.badge(r.status)) +
      ui.td('', open
        ? '<button type="button" class="btn btn--soft-danger btn--sm" data-cancel="' + r.id + '" aria-label="' + esc(t('shealth.cancelLabel', { ref: r.ref })) + '">' + esc(t('shealth.cancel')) + '</button>'
        : '', 'cell-actions') +
      '</tr>';
  }

  function cancel(r) {
    ui.confirm({ title: t('shealth.cancelTitle', { ref: r.ref }), message: t('shealth.cancelText'), confirm: t('shealth.cancel'), cancel: t('shealth.keep') }).then(function (ok) {
      if (!ok) return null;
      // The clinic may have answered while the dialog was open: Laravel refuses then.
      return DMS.api.post('/health/requests/' + r.id + '/cancel')
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('shealth.toastCancelled', { ref: r.ref }), 'info'); })
        .catch(function (err) { return DMS.app.reload().then(function () { return ui.failed()(err); }); });
    });
  }

  /* ---- New request ---- */
  function showUrgent() {
    const formEl = document.getElementById('request-form');
    const urgent = DMS.form.values(formEl).urgency === 'urgent';
    const text = document.getElementById('urgent-text');
    text.textContent = ' ' + t('shealth.urgentText', { number: clinic().hotline });
    text.closest('.notice').hidden = !urgent;
  }

  function openForm() {
    const formEl = document.getElementById('request-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('request-modal-title').textContent = t('shealth.newTitle');
    showUrgent();
    ui.openModal(document.getElementById('request-modal'));
  }

  function save(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (!v.symptoms) errors.symptoms = 'err.required';
    else if (v.symptoms.length < 10) errors.symptoms = 'shealth.errShort';
    if (DMS.form.show(formEl, errors)) return;

    const urgency = v.urgency === 'urgent' ? 'urgent' : 'normal';
    ui.busy(formEl.querySelector('[type="submit"]'), DMS.api.post('/health/requests', { urgency: urgency, symptoms: v.symptoms }))
      .then(function (res) {
        ui.closeModal(document.getElementById('request-modal'));
        return DMS.app.reload().then(function () {
          ui.toast(t(urgency === 'urgent' ? 'shealth.toastUrgent' : 'shealth.toastSent', { ref: res.data.ref, number: clinic().hotline }));
        });
      })
      .catch(ui.failed(formEl));
  }

  /* ---- Health profile (read-only) ---- */
  function kv(labelKey, html) { return '<div><dt>' + esc(t(labelKey)) + '</dt><dd>' + html + '</dd></div>'; }
  function typed(value) { return value ? '<span dir="auto">' + esc(ui.tr(value)) + '</span>' : muted('sprof.notSet'); }

  function drawProfile() {
    const m = data.medicalProfile(portal.me().id);
    document.getElementById('health-profile').innerHTML =
      kv('sprof.blood', m.blood_type ? '<span class="ltr">' + esc(m.blood_type) + '</span>' : muted('sprof.bloodUnknown')) +
      kv('sprof.allergies', typed(m.allergies)) +
      kv('sprof.conditions', typed(m.conditions)) +
      kv('sprof.medications', typed(m.medications)) +
      kv('shealth.emergencyContact', m.emergency_name
        ? '<span dir="auto">' + esc(m.emergency_name) + '</span> · ' + esc(t('relation.' + (m.emergency_relation || 'other')))
        : muted('sprof.notSet')) +
      kv('sprof.emPhone', m.emergency_phone ? ui.telLink(m.emergency_phone) : muted('sprof.notSet')) +
      kv('sprof.medicalUpdated', esc(m.updated_at ? i18n.date(m.updated_at, 'medium') : t('sprof.never')));
  }

  function render() {
    drawEmergency();
    drawNotice();
    list.render();
    drawProfile();
  }

  function init() {
    const root = document.getElementById('request-list');
    list = DMS.list.create({
      root: root,
      items: mine,
      pageSize: 6,
      sort: function (a, b) { return ORDER[a.status] - ORDER[b.status] || (a.created_at < b.created_at ? 1 : -1); },
      render: row,
      empty: { icon: 'stethoscope', title: 'shealth.emptyTitle', text: 'shealth.emptyText' },
    });
    root.addEventListener('click', function (event) {
      const b = event.target.closest('[data-cancel]');
      if (b) cancel(data.find('health_requests', b.getAttribute('data-cancel')));
    });

    document.getElementById('add-request').addEventListener('click', openForm);
    const formEl = document.getElementById('request-form');
    formEl.addEventListener('submit', save);
    formEl.addEventListener('change', function (event) { if (event.target.name === 'urgency') showUrgent(); });

    render();
  }

  DMS.app.page({ needs: ['health_requests', 'medical_profiles'], init: init, render: render });
})(window);
