/* ==========================================================================
   applications.js — housing applications sent from the public website.
   List with status chips, search and filters; a detail modal shows every
   form field. Accept or reject with a note that the applicant will see.
   Accepting needs the day and time the office will meet the new resident.
   Students cannot sign up themselves: accepting an application creates the
   student account (username = university ID, temporary password) and links
   it to the application. Laravel then e-mails one welcome message from the
   dorm's Gmail to the address in the application: the acceptance, the
   meeting day and time, and the sign-in details. They are also shown here
   for the dorm office to hand over.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;

  let list;
  let drawChips;
  let current = null;

  const term = DMS.app.term;

  /** Applications for the academic year and semester chosen in the console. */
  function items() {
    return data.db.applications.filter(term.hasRecord).sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; });
  }

  function row(app) {
    return (
      '<tr>' +
      ui.td('apps.colApplicant', ui.person({ id: app.id, name: app.full_name, name_ar: app.full_name_ar }, app.email)) +
      ui.td('apps.colRef', '<span class="cell-main ltr nowrap">' + esc(app.ref) + '</span><span class="cell-sub nowrap">' + esc(term.name(app.academic_year, app.semester)) + '</span>') +
      ui.td('apps.colMajor', '<span class="cell-main">' + esc(t('major.' + app.major)) + '</span><span class="cell-sub">' + esc(t('common.yearN', { n: i18n.number(app.year) })) + '</span>') +
      ui.td('apps.colRoomType', esc(t('roomType.' + app.room_type))) +
      ui.td('common.submitted', '<time datetime="' + esc(app.submitted_at) + '" title="' + esc(i18n.dateTime(app.submitted_at)) + '">' + esc(i18n.relative(app.submitted_at)) + '</time>') +
      ui.td('common.status', ui.badge(app.status)) +
      ui.td('', '<button type="button" class="icon-btn icon-btn--sm" data-view="' + app.id + '" aria-label="' +
        esc(t('apps.viewLabel', { name: nameOf(app) })) + '" title="' + esc(t('common.view')) + '">' + ui.icon('eye', { size: 17 }) + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete="' + app.id + '" aria-label="' +
        esc(t('apps.deleteLabel', { name: nameOf(app) })) + '" title="' + esc(t('common.delete')) + '">' + ui.icon('trash', { size: 17 }) + '</button>', 'cell-actions') +
      '</tr>'
    );
  }

  function detail(labelKey, value, opts) {
    const o = opts || {};
    return '<div class="details__item' + (o.full ? ' details__item--full' : '') + '"><dt>' + esc(t(labelKey)) + '</dt>' +
      '<dd' + (o.ltr ? ' class="ltr"' : ' dir="auto"') + '>' + (o.html ? value : esc(value || t('common.none'))) + '</dd></div>';
  }

  /** The applicant's name in the reader's language. */
  function nameOf(app) { return i18n.name({ name: app.full_name, name_ar: app.full_name_ar }); }

  /* ---- The applicant's answers, in the sections and order of the form ---- */
  function optionText(options, value) {
    const o = (options || []).filter(function (x) { return x.value === value; })[0];
    return o ? i18n.field({ label_en: o.en, label_ar: o.ar }, 'label') : value;
  }
  /** One answer, formatted: choices by name, dates as dates, e-mail and phone as links. */
  function answerHtml(field, app, value) {
    if (value === undefined || value === null || value === '') return '<span class="muted">' + esc(t('common.none')) + '</span>';
    switch (field.key) {
      case 'email':
        return ui.mailLink(value);
      case 'major': return esc(t('major.' + value)) + ' <span class="cell-sub">' + esc(t('faculty.' + data.config.majors[value])) + '</span>';
      case 'year': return esc(t('common.yearN', { n: i18n.number(value) }));
      case 'room_type': return esc(t('roomType.' + value));
      case 'term': return esc(term.name(app.academic_year, app.semester));
      default:
    }
    if (field.type === 'tel') return ui.telLink(value);
    if (field.type === 'email') return ui.mailLink(value);
    if (field.type === 'checkbox') return esc(t(value ? 'common.yes' : 'common.no'));
    if (field.type === 'date') {
      return esc(i18n.date(value, 'medium')) + (field.key === 'date_of_birth' ? ' <span class="cell-sub">' + esc(t('apps.age', { n: i18n.number(ageOn(value)) })) + '</span>' : '');
    }
    if (field.options) return esc(optionText(field.options, value));
    return '<span ' + (field.lang ? 'lang="' + field.lang + '" dir="' + (field.lang === 'ar' ? 'rtl' : 'ltr') + '"' : 'dir="auto"') + '>' + esc(value) + '</span>';
  }
  function ageOn(birth) {
    const b = birth.split('-').map(Number);
    const d = data.dates.today().split('-').map(Number);
    return d[0] - b[0] - (d[1] < b[1] || (d[1] === b[1] && d[2] < b[2]) ? 1 : 0);
  }
  function answerRow(field, app, value) {
    const full = field.type === 'textarea' || field.type === 'checkbox';
    return '<div class="details__item' + (full ? ' details__item--full' : '') + '"><dt>' + esc(i18n.field(field, 'label')) + '</dt><dd>' +
      answerHtml(field, app, value) + '</dd></div>';
  }
  function answers(app) {
    const fields = data.formFields().filter(function (f) { return f.key !== 'consent'; });
    const extra = app.extra || [];
    const valueOf = function (f) {
      if (f.builtin) return app[f.key];
      const a = extra.filter(function (x) { return x.key === f.key; })[0];
      return a ? a.value : undefined;
    };
    let html = data.config.formSections.map(function (section) {
      const shown = fields.filter(function (f) { return f.section === section; })
        // A question added after this application was sent has no answer: leave it out.
        .filter(function (f) { return f.builtin || extra.some(function (x) { return x.key === f.key; }); });
      if (!shown.length) return '';
      return '<p class="details__section">' + esc(t('form.sec.' + section)) + '</p>' +
        shown.map(function (f) { return answerRow(f, app, valueOf(f)); }).join('');
    }).join('');
    // Answers to questions the office has since changed or removed, with the question as it was asked.
    const keys = fields.map(function (f) { return f.key; });
    const earlier = extra.filter(function (x) { return keys.indexOf(x.key) === -1; }).map(function (x) {
      return answerRow(Object.assign({ builtin: false }, x), app, x.value);
    }).concat(Object.keys(app).filter(function (k) {
      return keys.indexOf(k) === -1 && data.defaultField(k) && k !== 'consent' && app[k] !== '' && app[k] !== undefined;
    }).map(function (k) { return answerRow(data.defaultField(k), app, app[k]); }));
    if (earlier.length) html += '<p class="details__section">' + esc(t('apps.secEarlier')) + '</p>' + earlier.join('');
    return html;
  }

  function existingAccount(app) {
    return data.db.students.filter(function (s) { return s.university_id === app.university_id; })[0] || null;
  }

  function fillModal(app) {
    current = app;
    document.getElementById('app-modal-title').textContent = t('apps.modalTitle', { name: nameOf(app) });
    document.getElementById('app-modal-sub').innerHTML = '<span class="ltr">' + esc(app.ref) + '</span> · ' +
      esc(t('apps.submittedOn', { date: i18n.dateTime(app.submitted_at) })) + ' · ' + ui.badge(app.status);

    document.getElementById('app-details').innerHTML = answers(app);

    const decision = document.getElementById('app-decision');
    const foot = document.getElementById('app-foot');

    if (app.status === 'pending') {
      const account = existingAccount(app);
      decision.innerHTML =
        // When the new resident comes to the dorm office: required to accept, sent in the welcome e-mail.
        '<fieldset class="fieldset"><legend>' + esc(t('apps.meetingTitle')) + '</legend><div class="form-grid">' +
        '<div class="field"><label class="field__label" for="app-meeting-date">' + esc(t('apps.meetingDate')) + '<span class="field__req" aria-hidden="true">*</span></label>' +
        '<input class="control" id="app-meeting-date" name="meeting_date" type="date" min="' + esc(data.dates.today()) + '" aria-describedby="app-meeting-hint"></div>' +
        '<div class="field"><label class="field__label" for="app-meeting-time">' + esc(t('apps.meetingTime')) + '<span class="field__req" aria-hidden="true">*</span></label>' +
        '<input class="control" id="app-meeting-time" name="meeting_time" type="time" step="300" aria-describedby="app-meeting-hint"></div>' +
        '</div><p class="field__hint" id="app-meeting-hint">' + esc(t('apps.meetingHint')) + '</p></fieldset>' +
        '<div class="field"><label class="field__label" for="app-note">' + esc(t('common.decisionNote')) + '</label>' +
        '<textarea class="control" id="app-note" name="note" maxlength="500" aria-describedby="app-note-hint"></textarea>' +
        '<p class="field__hint" id="app-note-hint">' + esc(t('apps.noteHint')) + '</p></div>' +
        '<div class="notice notice--accent">' + ui.icon('user-plus', { size: 18 }) + '<div><strong>' + esc(t('apps.accountTitle')) + '</strong>' +
        esc(t(account ? 'apps.accountExists' : 'apps.accountNote', { id: app.university_id })) + '</div></div>';
      foot.innerHTML =
        '<button type="button" class="btn btn--ghost" data-close>' + esc(t('common.close')) + '</button>' +
        '<div class="modal__foot-group">' +
        '<button type="button" class="btn btn--soft-danger" data-decide="reject">' + ui.icon('x-circle', { size: 16 }) + esc(t('common.reject')) + '</button>' +
        '<button type="button" class="btn btn--success" data-decide="accept">' + ui.icon('check-circle', { size: 16 }) + esc(t('apps.accept')) + '</button></div>';
    } else {
      decision.innerHTML =
        '<div class="notice ' + (app.status === 'accepted' ? 'notice--success' : 'notice--danger') + '">' +
        ui.icon(app.status === 'accepted' ? 'check-circle' : 'x-circle', { size: 18 }) +
        '<div><strong>' + esc(t(app.status === 'accepted' ? 'apps.decidedAccepted' : 'apps.decidedRejected', { date: i18n.date(app.decided_at, 'medium') })) + '</strong>' +
        '<span dir="auto">' + esc(app.decision_note || '') + '</span>' +
        (app.status === 'accepted' && app.meeting_date && app.meeting_time
          ? '<span>' + esc(t('apps.meetingSet', { day: i18n.date(app.meeting_date, 'full'), time: i18n.time(app.meeting_time) })) + '</span>' : '') +
        '</div></div>';
      const student = app.student_id ? data.find('students', app.student_id) : null;
      if (student) {
        const mail = welcomeMail(student, app);
        decision.innerHTML += '<section class="card card--pad stack" aria-labelledby="creds-title">' +
          '<h3 class="card__title" id="creds-title">' + esc(t('apps.accountTitle')) + '</h3>' + ui.credentials(student) +
          '<a href="students.html">' + esc(t('apps.accountLink')) + '</a></section>' +
          (mail ? ui.mailCard(mail) : '');
      }
      foot.innerHTML = '<span></span><button type="button" class="btn btn--primary" data-close>' + esc(t('common.close')) + '</button>';
    }
  }

  /** The meeting at the dorm office written in one language, for the welcome e-mail (both languages are sent). */
  function meetingLine(language, app) {
    if (!app.meeting_date || !app.meeting_time) return '';
    const locale = (language === 'ar' ? 'ar-LB' : 'en-GB') + '-u-nu-latn';
    const at = new Date(app.meeting_date + 'T' + app.meeting_time + ':00');
    return i18n.tIn(language, 'mail.meetingLine', {
      day: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(at),
      // "10:30 AM" / "10:30 ص", as in the e-mail Laravel sends.
      time: new Intl.DateTimeFormat(language === 'ar' ? locale : 'en-US-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true }).format(at),
    });
  }

  /**
   * The welcome e-mail of an account that still uses its temporary password. Laravel sends
   * it by itself from the dorm's Gmail; the office can also pass it on by hand.
   */
  function welcomeMail(student, app) {
    if (!student.must_change_password || !student.password) return null;
    return {
      to: student.email, sent_at: student.registered_at,
      params: {
        name: app.full_name, ref: app.ref, username: student.university_id, password: student.password,
        meeting: { en: meetingLine('en', app), ar: meetingLine('ar', app) },
      },
    };
  }

  /** The meeting fields: both required to accept, not in the past. */
  function meetingErrors(values) {
    const errors = {};
    const today = data.dates.today();
    if (!values.meeting_date || values.meeting_date < today) errors.meeting_date = 'apps.errMeetingDate';
    if (!values.meeting_time) errors.meeting_time = 'apps.errMeetingTime';
    else if (values.meeting_date === today) {
      const now = new Date();
      const clock = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      if (values.meeting_time <= clock) errors.meeting_time = 'apps.errMeetingPast';
    }
    return errors;
  }

  function decide(kind) {
    const formEl = document.getElementById('app-form');
    const values = DMS.form.values(formEl);
    if (kind === 'reject' && !values.note) {
      DMS.form.show(formEl, { note: 'apps.errRejectNote' });
      return;
    }
    if (kind === 'accept' && DMS.form.show(formEl, meetingErrors(values))) return;
    DMS.form.clear(formEl);
    const app = current;
    const button = document.querySelector('[data-decide="' + kind + '"]');
    const request = kind === 'accept'
      ? DMS.api.post('/applications/' + app.id + '/accept', {
        // An empty note stays empty: the welcome e-mail already says everything.
        note: values.note || null, meeting_date: values.meeting_date, meeting_time: values.meeting_time,
      })
      : DMS.api.post('/applications/' + app.id + '/reject', { note: values.note });
    ui.busy(button, request).then(function (res) {
      return DMS.app.reload().then(function () {
        const fresh = data.find('applications', app.id) || res.data;
        if (kind === 'accept') {
          // Stay in the modal so the dorm office can copy the new sign-in details.
          fillModal(fresh);
          const title = document.getElementById('creds-title');
          if (title) { title.setAttribute('tabindex', '-1'); title.focus(); }
          ui.toast(t(res.account_created ? 'apps.toastAcceptedAccount' : 'apps.toastAccepted', { name: nameOf(fresh), id: fresh.university_id }));
        } else {
          ui.closeModal(document.getElementById('app-modal'));
          ui.toast(t('apps.toastRejected', { name: nameOf(fresh) }), 'info');
        }
      });
    }).catch(ui.failed(formEl)).catch(function () { return DMS.app.reload(); });
  }

  /** Deletes an application for good. An account that was created from it stays (Students page). */
  function remove(app) {
    const hasAccount = app.status === 'accepted' && app.student_id && data.find('students', app.student_id);
    ui.confirm({
      title: t('apps.deleteTitle'),
      message: t(hasAccount ? 'apps.deleteTextAccount' : 'apps.deleteText', { name: nameOf(app), ref: app.ref }),
      confirm: t('common.delete'),
    }).then(function (ok) {
      if (!ok) return null;
      return DMS.api.del('/applications/' + app.id)
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('apps.toastDeleted', { name: nameOf(app) }), 'info'); })
        .catch(ui.failed());
    });
  }

  function init() {
    const root = document.getElementById('app-list');
    list = DMS.list.create({
      root: root,
      items: items,
      pageSize: 8,
      search: function (a) { return [a.full_name, a.full_name_ar, a.father_name_en, a.father_name_ar, a.mother_name_en, a.mother_name_ar, a.ref, a.email, a.university_id, a.home_town, t('major.' + a.major)]; },
      filters: {
        status: function (a, v) { return a.status === v; },
        type: function (a, v) { return a.room_type === v; },
      },
      render: row,
      empty: { icon: 'clipboard', title: 'apps.emptyTitle', text: 'apps.emptyText' },
      onRender: function () { drawChips(); },
    });
    drawChips = ui.statusChips(document.getElementById('status-chips'), list, ['pending', 'accepted', 'rejected'], items);

    root.addEventListener('click', function (event) {
      const del = event.target.closest('[data-delete]');
      if (del) { remove(data.find('applications', del.getAttribute('data-delete'))); return; }
      const btn = event.target.closest('[data-view]');
      if (!btn) return;
      const app = data.find('applications', btn.getAttribute('data-view'));
      fillModal(app);
      ui.openModal(document.getElementById('app-modal'));
    });

    document.getElementById('app-foot').addEventListener('click', function (event) {
      const btn = event.target.closest('[data-decide]');
      if (btn) decide(btn.getAttribute('data-decide'));
    });
    document.getElementById('app-form').addEventListener('submit', function (event) { event.preventDefault(); });

    list.render();
  }

  function render() {
    list.render();
    const modal = document.getElementById('app-modal');
    if (modal.open && current) {
      // A live update redraws the window: keep what the office was typing.
      const ids = ['#app-note', '#app-meeting-date', '#app-meeting-time'];
      const kept = ids.map(function (id) { const el = modal.querySelector(id); return el ? el.value : ''; });
      fillModal(data.find('applications', current.id) || current);
      ids.forEach(function (id, i) { const el = modal.querySelector(id); if (el) el.value = kept[i]; });
    }
  }

  DMS.app.page({ needs: ['applications', 'students'], init: init, render: render });
})(window);
