/* ==========================================================================
   students.js — Student Management.
   Students cannot sign up: only the dorm office creates accounts, here with
   "Add student" or by accepting a housing application. The office can view a
   complete profile (stays, application, health profile, academic progress),
   edit a student's details (students can only view their own), write an
   e-mail to the student's personal address (for example name@gmail.com, the
   one given in the housing application), reset a password (a new temporary
   one is shown to hand over), and disable or re-enable an account. A disabled
   student cannot sign in.
   Everything is saved by Laravel; the rules are checked there again.
   The students shown (search and filters applied) can be exported as
   Excel (CSV) or as a PDF report.
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

  const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const RELATIONS = ['father', 'mother', 'brother', 'sister', 'guardian', 'spouse', 'other'];

  let list;
  let drawChips;
  let disabling = null;
  let editing = null; // the student being edited, or null while adding one

  function items() {
    return data.db.students.slice().sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return a.registered_at < b.registered_at ? 1 : -1;
    });
  }

  function actions(s) {
    const name = i18n.name(s);
    const view = '<button type="button" class="btn btn--ghost btn--sm" data-view="' + s.id + '" aria-label="' + esc(t('students.viewLabel', { name: name })) + '">' +
      ui.icon('user', { size: 16 }) + esc(t('students.view')) + '</button>';
    const edit = '<button type="button" class="btn btn--secondary btn--sm" data-edit="' + s.id + '" aria-label="' + esc(t('students.editLabel', { name: name })) + '">' +
      ui.icon('edit', { size: 16 }) + esc(t('common.edit')) + '</button>';
    const reset = '<button type="button" class="btn btn--secondary btn--sm" data-reset="' + s.id + '" aria-label="' + esc(t('students.resetLabel', { name: name })) + '">' +
      ui.icon('key', { size: 16 }) + esc(t('students.reset')) + '</button>';
    const mail = s.email ? '<button type="button" class="btn btn--secondary btn--sm" data-mail="' + s.id + '" aria-label="' + esc(t('students.mailLabel', { name: name })) + '">' +
      ui.icon('mail', { size: 16 }) + esc(t('students.mail')) + '</button>' : '';
    if (s.status === 'disabled') {
      return view + edit + mail + '<button type="button" class="btn btn--soft-success btn--sm" data-enable="' + s.id + '" aria-label="' + esc(t('students.enableLabel', { name: name })) + '">' +
        ui.icon('user-check', { size: 16 }) + esc(t('students.enable')) + '</button>';
    }
    return view + edit + mail + reset + '<button type="button" class="btn btn--soft-danger btn--sm" data-disable="' + s.id + '" aria-label="' + esc(t('students.disableLabel', { name: name })) + '">' +
      ui.icon('lock', { size: 16 }) + esc(t('students.disable')) + '</button>';
  }

  function row(s) {
    const room = data.roomOfStudent(s.id);
    return (
      '<tr>' +
      ui.td('common.student', ui.person(s)) +
      ui.td('students.colUniId', '<code class="ltr">' + esc(s.university_id) + '</code>' +
        (s.must_change_password ? '<span class="cell-sub">' + esc(t('students.tempActive')) + '</span>' : '')) +
      ui.td('students.colMajor', '<span class="cell-main">' + esc(t('major.' + s.major)) + '</span><span class="cell-sub">' + esc(t('faculty.' + data.config.majors[s.major])) + ' · ' + esc(t('common.yearN', { n: i18n.number(s.year) })) + '</span>') +
      ui.td('common.room', ui.roomCode(room)) +
      ui.td('students.colCreated', '<time datetime="' + esc(s.registered_at) + '">' + esc(i18n.date(s.registered_at, 'medium')) + '</time>') +
      ui.td('common.status', ui.badge(s.status) + (s.status === 'disabled' && s.note ? '<span class="cell-sub" dir="auto">' + esc(ui.tr(s.note)) + '</span>' : '')) +
      ui.td('', actions(s), 'cell-actions') +
      '</tr>'
    );
  }

  /* ---- Add a student, or edit a student's details ---- */
  function options(values, label, selected) {
    return values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(label(v)) + '</option>';
    }).join('');
  }

  function openEdit(s) {
    editing = s || null;
    const medical = s ? data.medicalProfile(s.id) : data.medicalProfile(0);
    const formEl = document.getElementById('edit-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('edit-title').textContent = t(s ? 'students.editTitle' : 'students.addTitle');
    document.getElementById('edit-sub').textContent = s ? i18n.name(s) + ' · ' + s.university_id : t('students.addSub');
    const gender = s ? s.gender : 'female';
    formEl.elements.gender.innerHTML = options(['male', 'female'], function (v) { return t('gender.' + v); }, gender);
    formEl.elements.major.innerHTML = data.config.faculties.map(function (faculty) {
      const majors = Object.keys(data.config.majors).filter(function (m) { return data.config.majors[m] === faculty; });
      return '<optgroup label="' + esc(t('faculty.' + faculty)) + '">' + options(majors, function (m) { return t('major.' + m); }, s ? s.major : '') + '</optgroup>';
    }).join('');
    formEl.elements.year.innerHTML = options([1, 2, 3, 4, 5], function (y) { return t('common.yearN', { n: i18n.number(y) }); }, s ? s.year : 1);
    formEl.elements.blood_type.innerHTML = '<option value="">' + esc(t('students.bloodUnknown')) + '</option>' + options(BLOOD, function (b) { return b; }, medical.blood_type);
    formEl.elements.emergency_relation.innerHTML = options(RELATIONS, function (r) { return t('relation.' + r); }, medical.emergency_relation || 'father');
    DMS.form.fill(formEl, s ? {
      name: s.name, name_ar: s.name_ar, university_id: s.university_id, email: s.email, phone: s.phone,
      allergies: medical.allergies, conditions: medical.conditions, medications: medical.medications,
      emergency_name: medical.emergency_name, emergency_phone: medical.emergency_phone,
    } : { name: '', name_ar: '', university_id: '', email: '', phone: '', allergies: '', conditions: '', medications: '', emergency_name: '', emergency_phone: '' });
    ui.openModal(document.getElementById('edit-modal'));
  }

  function saveEdit(event) {
    event.preventDefault();
    const s = editing;
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const others = data.db.students.filter(function (x) { return !s || x.id !== s.id; });
    const errors = {};
    if (!v.name) errors.name = 'err.required';
    else if (v.name.length < 3) errors.name = 'students.errName';
    if (v.name_ar && !/[؀-ۿ]/.test(v.name_ar)) errors.name_ar = 'menus.errArabic';
    if (!v.university_id) errors.university_id = 'err.required';
    else if (!/^\d{8}$/.test(v.university_id)) errors.university_id = 'students.errUniId';
    else if (others.some(function (x) { return x.university_id === v.university_id; })) errors.university_id = 'students.errUniIdTaken';
    const email = (v.email || '').trim().toLowerCase();
    if (!email) errors.email = 'err.required';
    else if (!DMS.form.isEmail(email)) errors.email = 'err.email';
    else if (others.some(function (x) { return (x.email || '').toLowerCase() === email; })) errors.email = 'students.errEmailTaken';
    if (!v.phone) errors.phone = 'err.required';
    else if (!DMS.form.isPhone(v.phone)) errors.phone = 'err.phone';
    if (v.emergency_name && v.emergency_name.length < 3) errors.emergency_name = 'students.errName';
    if (v.emergency_phone && !DMS.form.isPhone(v.emergency_phone)) errors.emergency_phone = 'err.phone';
    if (DMS.form.show(formEl, errors)) return;

    const payload = {
      name: v.name, name_ar: v.name_ar || null, university_id: v.university_id, email: email, phone: v.phone, gender: v.gender,
      major: v.major, year: Number(v.year), blood_type: v.blood_type, allergies: v.allergies, conditions: v.conditions,
      medications: v.medications, emergency_name: v.emergency_name || null, emergency_relation: v.emergency_relation, emergency_phone: v.emergency_phone || null,
    };
    const button = formEl.querySelector('[type="submit"]');
    if (!s) {
      ui.busy(button, api.post('/students', payload)).then(function (res) {
        ui.closeModal(document.getElementById('edit-modal'));
        return DMS.app.reload().then(function () {
          const created = Object.assign({}, res.data, { password: res.credentials.password, must_change_password: true });
          ui.toast(t('students.toastCreated', { name: i18n.name(created) }));
          showCredentials(created);
        });
      }).catch(ui.failed(formEl));
      return;
    }
    ui.busy(button, api.put('/students/' + s.id, payload)).then(function (res) {
      ui.closeModal(document.getElementById('edit-modal'));
      return DMS.app.reload().then(function () {
        // The university ID is the username, so the student signs in with the new one from now on.
        ui.toast(t(res.id_changed ? 'students.toastUpdatedId' : 'students.toastUpdated', { name: i18n.name(res.data), id: res.data.university_id }));
      });
    }).catch(ui.failed(formEl));
  }

  function showCredentials(s) {
    document.getElementById('creds-modal-sub').textContent = i18n.name(s);
    document.getElementById('creds-modal-body').innerHTML = '<p>' + esc(t('students.credsText', { name: i18n.name(s) })) + '</p>' + ui.credentials(s) +
      '<p class="field__hint">' + esc(t('students.credsMailed', { email: s.email })) + '</p>';
    ui.openModal(document.getElementById('creds-modal'));
  }

  function resetPassword(s) {
    ui.confirm({
      title: t('students.resetTitle'),
      message: t('students.resetText', { name: i18n.name(s) }),
      confirm: t('students.reset'),
      tone: 'primary',
    }).then(function (ok) {
      if (!ok) return null;
      return api.post('/students/' + s.id + '/reset-password').then(function (res) {
        return DMS.app.reload().then(function () {
          showCredentials(Object.assign({}, res.data, { password: res.credentials.password, must_change_password: true }));
        });
      }).catch(ui.failed());
    });
  }

  /* ---- A message to one student's personal e-mail, sent at once by Laravel ---- */
  let mailing = null;
  function openMail(s) {
    mailing = s;
    const formEl = document.getElementById('mail-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('mail-sub').textContent = i18n.name(s) + ' · ' + s.university_id;
    formEl.elements.to.value = s.email;
    ui.openModal(document.getElementById('mail-modal'));
  }

  function sendMail(event) {
    event.preventDefault();
    const s = mailing;
    if (!s) return;
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if ((v.subject || '').trim().length < 3) errors.subject = 'students.errSubject';
    if ((v.message || '').trim().length < 3) errors.message = 'students.errMessage';
    if (DMS.form.show(formEl, errors)) return;
    ui.busy(formEl.querySelector('[type="submit"]'), api.post('/students/' + s.id + '/email', { subject: v.subject.trim(), message: v.message.trim() }))
      .then(function (res) {
        ui.closeModal(document.getElementById('mail-modal'));
        const logged = res.data.status === 'logged';
        ui.toast(t(logged ? 'students.toastMailLogged' : 'students.toastMailed', { name: i18n.name(s) }), logged ? 'warning' : 'success');
      })
      .catch(ui.failed(formEl));
  }

  function openDisable(s) {
    if (data.allocationOf(s.id)) {
      ui.toast(t('students.errHasRoom', { name: i18n.name(s), room: data.roomOfStudent(s.id).number }), 'danger');
      return;
    }
    disabling = s;
    document.getElementById('disable-form').reset();
    document.getElementById('disable-sub').textContent = i18n.name(s) + ' · ' + s.university_id;
    ui.openModal(document.getElementById('disable-modal'));
  }

  function enable(s) {
    api.patch('/students/' + s.id + '/status', { status: 'active' })
      .then(function () { return DMS.app.reload(); })
      .then(function () { ui.toast(t('students.toastEnabled', { name: i18n.name(s) })); })
      .catch(ui.failed());
  }

  /* ---- Complete profile (read from the server when opened) ---- */
  let profileDialog = null;
  function section(title, body) {
    return '<section class="stack"><h3 class="card__title">' + esc(t(title)) + '</h3>' + body + '</section>';
  }
  function detail(label, value) {
    return '<div class="details__item"><dt>' + esc(t(label)) + '</dt><dd>' + value + '</dd></div>';
  }
  function hoursText(n) { return t('sprog.hoursShort', { n: i18n.number(n, { maximumFractionDigits: 1 }) }); }

  function profileHtml(p) {
    const s = p.student;
    const room = data.roomOfStudent(s.id);
    const m = p.medical;
    const a = p.academic;
    const today = data.dates.today();
    const exams = a.exams.filter(function (e) { return e.date >= today; });
    const stays = p.assignments.slice().sort(function (x, y) { return x.start_date < y.start_date ? 1 : -1; });
    return (
      '<div class="profile-card">' + ui.avatar(s, 'lg') + '<div><p class="profile-card__name" dir="auto">' + esc(i18n.name(s)) + '</p>' +
      '<p class="cell-sub ltr">' + esc(s.university_id) + '</p></div></div>' +
      section('students.secAccount', '<dl class="details">' +
        detail('students.csvEmail', ui.mailLink(s.email)) +
        detail('students.csvPhone', ui.telLink(s.phone) || '—') +
        detail('students.colMajor', esc(t('major.' + s.major)) + ' · ' + esc(t('common.yearN', { n: i18n.number(s.year) }))) +
        detail('common.status', ui.badge(s.status) + (s.must_change_password ? ' <span class="cell-sub">' + esc(t('students.tempActive')) + '</span>' : '')) +
        detail('students.colCreated', esc(i18n.date(s.registered_at, 'medium'))) +
        detail('students.lastLogin', s.last_login_at ? esc(i18n.dateTime(s.last_login_at)) : esc(t('students.never'))) +
        '</dl>') +
      section('students.secStays', stays.length
        ? '<ul class="activity">' + stays.map(function (x) {
          const r = data.find('rooms', x.room_id);
          return '<li class="activity__item">' + ui.icon('bed', { size: 16 }) + '<div><p class="activity__text">' +
            (r ? '<span class="ltr">' + esc(r.number) + '</span>' : esc(t('common.noRoom'))) + ' · ' + ui.badge(x.status) + '</p>' +
            '<p class="activity__time">' + esc(i18n.date(x.start_date, 'medium')) + ' → ' + esc(i18n.date(x.end_date, 'medium')) + '</p></div></li>';
        }).join('') + '</ul>'
        : '<p class="muted">' + esc(t(room ? 'common.noRoom' : 'students.noStays')) + '</p>') +
      section('students.secApplication', p.application
        ? '<p><span class="ltr">' + esc(p.application.ref) + '</span> · ' + ui.badge(p.application.status) + ' · ' + esc(i18n.date(p.application.submitted_at, 'medium')) + '</p>'
        : '<p class="muted">' + esc(t('students.noApplication')) + '</p>') +
      section('students.secHealth', '<dl class="details">' +
        detail('students.fBlood', esc(m.blood_type || t('students.bloodUnknown'))) +
        detail('students.fAllergies', '<span dir="auto">' + esc(m.allergies || '—') + '</span>') +
        detail('students.fEmergency', m.emergency_name ? '<span dir="auto">' + esc(m.emergency_name) + '</span> · ' + esc(t('relation.' + m.emergency_relation)) + '<br>' + ui.telLink(m.emergency_phone) : '—') +
        '</dl>') +
      section('students.secAcademic', '<dl class="details">' +
        detail('students.weekHours', esc(t('sprog.goalProgress', { done: hoursText(a.week_hours), goal: hoursText(a.study_goal) }))) +
        detail('students.activeCourses', a.courses.filter(function (c) { return c.status === 'active'; }).map(function (c) {
          return '<span class="ltr">' + esc(c.code) + '</span> <span dir="auto">' + esc(c.title) + '</span>';
        }).join('<br>') || '—') +
        detail('students.upcomingExams', exams.map(function (e) {
          return '<span dir="auto">' + esc(e.title) + '</span> · ' + esc(i18n.date(e.date, 'medium')) + (e.time ? ' ' + esc(i18n.time(e.time)) : '');
        }).join('<br>') || esc(t('students.noExams'))) +
        detail('students.achievements', esc(i18n.number(a.achievements.length))) +
        '</dl>')
    );
  }

  function openProfile(s) {
    if (!profileDialog) {
      profileDialog = document.createElement('dialog');
      profileDialog.className = 'modal modal--lg';
      profileDialog.setAttribute('aria-labelledby', 'profile-title');
      document.body.appendChild(profileDialog);
    }
    profileDialog.innerHTML =
      '<div class="modal__head"><div><h2 class="modal__title" id="profile-title">' + esc(t('students.profileTitle')) + '</h2>' +
      '<p class="modal__sub">' + esc(i18n.name(s)) + '</p></div>' +
      '<button type="button" class="icon-btn" data-close aria-label="' + esc(t('common.close')) + '">' + ui.icon('x') + '</button></div>' +
      '<div class="modal__body stack" id="profile-body"><p class="muted" role="status">' + esc(t('api.loading')) + '</p></div>' +
      '<div class="modal__foot"><span></span><button type="button" class="btn btn--primary" data-close>' + esc(t('common.close')) + '</button></div>';
    ui.openModal(profileDialog);
    api.get('/students/' + s.id).then(function (res) {
      document.getElementById('profile-body').innerHTML = profileHtml(res.data);
    }).catch(function (err) {
      document.getElementById('profile-body').innerHTML = '<div class="notice notice--danger">' + ui.icon('alert', { size: 18 }) + '<div>' + esc(ui.errorText(err)) + '</div></div>';
    });
  }

  /* ---- Export the students shown (search and filters applied): Excel (CSV) or PDF ---- */
  /** What the list is showing, in words, for the report's subtitle. */
  function shownText() {
    const parts = [];
    const f = list.state.filters;
    if (f.status && f.status !== 'all') parts.push(t('status.' + f.status));
    if (f.faculty && f.faculty !== 'all') parts.push(t('faculty.' + f.faculty));
    if (list.state.query) parts.push(t('students.exportSearch', { q: list.state.query }));
    return parts.length ? t('students.exportShown', { filters: parts.join(' · ') }) : t('students.exportAll');
  }
  function stamp() { return data.dates.today(); }

  function exportCsv() {
    const shown = list.filtered();
    if (!shown.length) { ui.toast(t('students.exportEmpty'), 'warning'); return; }
    const lines = [[
      t('students.csvId'), t('students.csvNameEn'), t('students.csvNameAr'), t('students.csvGender'), t('students.csvFaculty'),
      t('students.csvMajor'), t('students.csvYear'), t('students.csvRoom'), t('students.csvWing'), t('students.csvPhone'),
      t('students.csvEmail'), t('students.csvStatus'), t('students.csvCreated'),
    ]].concat(shown.map(function (s) {
      const room = data.roomOfStudent(s.id);
      return [
        s.university_id, s.name, s.name_ar, t('gender.' + s.gender), t('faculty.' + data.config.majors[s.major]),
        t('major.' + s.major), s.year, room ? room.number : '', room ? t('wing.' + room.wing) : '', s.phone,
        s.email, t('status.' + s.status), s.registered_at.slice(0, 10),
      ];
    }));
    ui.downloadCsv('students_' + stamp() + '.csv', lines);
    ui.toast(t('students.toastCsv', { n: i18n.number(shown.length) }));
  }

  function exportPdf() {
    const shown = list.filtered();
    if (!shown.length) { ui.toast(t('students.exportEmpty'), 'warning'); return; }
    const inRoom = shown.filter(function (s) { return data.roomOfStudent(s.id); }).length;
    const active = shown.filter(function (s) { return s.status === 'active'; }).length;
    // The name in the other script goes underneath, so both are on paper.
    const otherName = function (s) { return i18n.lang() === 'ar' ? s.name : s.name_ar; };
    ui.printReport({
      file: 'students_' + stamp(),
      title: t('students.exportTitle'),
      subtitle: shownText(),
      landscape: true,
      facts: [
        [t('students.factListed'), i18n.number(shown.length)],
        [t('students.factActive'), i18n.number(active)],
        [t('students.factRoom'), i18n.number(inRoom)],
        [t('students.factWaiting'), i18n.number(shown.filter(function (s) { return s.status === 'active' && !data.roomOfStudent(s.id); }).length)],
      ],
      head: ['#', t('common.student'), t('students.csvId'), t('students.csvGender'), t('students.colMajor'), t('common.room'), t('students.csvPhone'), t('common.status')],
      rows: shown.map(function (s, i) {
        const room = data.roomOfStudent(s.id);
        return [
          i18n.number(i + 1),
          { text: i18n.name(s), sub: otherName(s) || '' },
          { text: s.university_id, sub: s.email, ltr: true, subLtr: true },
          t('gender.' + s.gender),
          { text: t('major.' + s.major), sub: t('faculty.' + data.config.majors[s.major]) + ' · ' + t('common.yearN', { n: i18n.number(s.year) }) },
          room ? { text: room.number, sub: t('wing.' + room.wing), ltr: true } : t('common.noRoom'),
          { text: s.phone, ltr: true },
          t('status.' + s.status),
        ];
      }),
      numeric: [0],
    });
  }

  function init() {
    const root = document.getElementById('student-list');
    list = DMS.list.create({
      root: root,
      items: items,
      pageSize: 10,
      search: function (s) { return [s.name, s.name_ar, s.email, s.university_id, t('major.' + s.major)]; },
      filters: {
        status: function (s, v) { return s.status === v; },
        faculty: function (s, v) { return data.config.majors[s.major] === v; },
      },
      render: row,
      empty: { icon: 'users', title: 'students.emptyTitle', text: 'students.emptyText' },
      onRender: function () { drawChips(); },
    });
    drawChips = ui.statusChips(document.getElementById('status-chips'), list, ['active', 'disabled'], items);

    root.addEventListener('click', function (event) {
      const pick = function (attr) { const b = event.target.closest('[' + attr + ']'); return b ? data.find('students', b.getAttribute(attr)) : null; };
      let s;
      if ((s = pick('data-view'))) openProfile(s);
      else if ((s = pick('data-edit'))) openEdit(s);
      else if ((s = pick('data-mail'))) openMail(s);
      else if ((s = pick('data-reset'))) resetPassword(s);
      else if ((s = pick('data-disable'))) openDisable(s);
      else if ((s = pick('data-enable'))) enable(s);
    });

    document.getElementById('add-student').addEventListener('click', function () { openEdit(null); });
    document.getElementById('edit-form').addEventListener('submit', saveEdit);
    document.getElementById('export-csv').addEventListener('click', exportCsv);
    document.getElementById('export-pdf').addEventListener('click', exportPdf);
    document.getElementById('mail-form').addEventListener('submit', sendMail);

    document.getElementById('disable-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const s = disabling;
      if (!s) return;
      const formEl = event.target;
      ui.busy(formEl.querySelector('[type="submit"]'), api.patch('/students/' + s.id + '/status', { status: 'disabled', note: DMS.form.values(formEl).note }))
        .then(function () {
          ui.closeModal(document.getElementById('disable-modal'));
          return DMS.app.reload();
        })
        .then(function () { ui.toast(t('students.toastDisabled', { name: i18n.name(s) }), 'info'); })
        .catch(ui.failed(formEl));
    });

    list.render();
  }

  DMS.app.page({ needs: ['students', 'rooms', 'allocations', 'medical_profiles'], init: init, render: function () { list.render(); } });
})(window);
