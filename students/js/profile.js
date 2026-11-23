/* ==========================================================================
   profile.js — the student's own profile, to view only.
   Account, contact, medical and emergency details are kept by the dorm
   office (manager/students.html, Edit). A student who spots a mistake asks
   the office to correct it. Photo, theme and password are in settings.html.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;
  const portal = DMS.portal;

  function kv(label, value) { return '<div><dt>' + esc(label) + '</dt><dd>' + value + '</dd></div>'; }
  /** Text typed by a person, or a muted "Not provided". */
  function typed(value) {
    return value ? '<span dir="auto">' + esc(value) + '</span>' : '<span class="muted">' + esc(t('sprof.notSet')) + '</span>';
  }
  function ltr(value) {
    return value ? '<span class="ltr">' + esc(value) + '</span>' : '<span class="muted">' + esc(t('sprof.notSet')) + '</span>';
  }

  function render() {
    const me = portal.me();
    const room = portal.room();
    const medical = data.medicalProfile(me.id);
    const office = document.getElementById('office-mail');
    office.textContent = data.config.housingEmail;
    office.href = 'mailto:' + data.config.housingEmail;

    document.getElementById('me-head').innerHTML = ui.avatar(me, 'lg') +
      '<div><p class="profile-card__name" dir="auto">' + esc(i18n.name(me)) + '</p>' +
      '<p class="cell-sub">' + esc(t('major.' + me.major)) + ' · ' + esc(t('common.yearN', { n: i18n.number(me.year) })) + '</p></div>' +
      ui.badge(me.status);
    document.getElementById('me-details').innerHTML =
      kv(t('sprof.username'), '<code class="ltr">' + esc(me.university_id) + '</code>') +
      kv(t('sprof.nameEn'), typed(me.name)) +
      kv(t('sprof.nameAr'), typed(me.name_ar)) +
      kv(t('sprof.email'), ltr(me.email)) +
      kv(t('sprof.phone'), ltr(me.phone)) +
      kv(t('sprof.gender'), esc(t('gender.' + me.gender))) +
      kv(t('sprof.faculty'), esc(t('faculty.' + data.config.majors[me.major]))) +
      kv(t('sprof.major'), esc(t('major.' + me.major)) + ' · ' + esc(t('common.yearN', { n: i18n.number(me.year) }))) +
      kv(t('common.room'), room ? '<span class="ltr">' + esc(room.number) + '</span> · ' + esc(t('wing.' + room.wing)) : esc(t('common.noRoom'))) +
      kv(t('sprof.since'), esc(i18n.date(me.registered_at, 'medium')));

    document.getElementById('me-medical').innerHTML =
      kv(t('sprof.blood'), medical.blood_type ? '<span class="ltr">' + esc(medical.blood_type) + '</span>' : '<span class="muted">' + esc(t('sprof.bloodUnknown')) + '</span>') +
      kv(t('sprof.allergies'), typed(medical.allergies)) +
      kv(t('sprof.conditions'), typed(medical.conditions)) +
      kv(t('sprof.medications'), typed(medical.medications)) +
      kv(t('sprof.medicalUpdated'), esc(medical.updated_at ? i18n.date(medical.updated_at, 'medium') : t('sprof.never')));

    document.getElementById('me-emergency').innerHTML =
      kv(t('sprof.emName'), typed(medical.emergency_name)) +
      kv(t('sprof.emRelation'), medical.emergency_name ? esc(t('relation.' + (medical.emergency_relation || 'other'))) : '<span class="muted">' + esc(t('sprof.notSet')) + '</span>') +
      kv(t('sprof.emPhone'), ltr(medical.emergency_phone));
  }

  DMS.app.page({ init: render, render: render });
})(window);
