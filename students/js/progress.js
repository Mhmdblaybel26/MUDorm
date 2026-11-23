/* ==========================================================================
   progress.js — academic and skill progress tracker. The records are kept by
   Laravel (GET /api/academic); the dorm office can read them to follow
   residents' progress. Four record types, each with create / edit / delete:
     study       hours studied on a day, for a course (or general study)
     course      this term's courses (active or completed)
     achievement certificates, awards, volunteering, competitions, skills
     exam        upcoming exams; a reminder notification arrives two days before
   Plus a weekly study-hours goal and a chart of the last seven days.
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
  const dates = data.dates;
  const portal = DMS.portal;
  const api = DMS.api;

  const CATEGORIES = ['award', 'certificate', 'competition', 'volunteering', 'skill'];
  const CATEGORY_ICONS = { award: 'star', certificate: 'file', competition: 'chart', volunteering: 'users', skill: 'sparkle' };
  // The API path of each record type.
  const PATHS = { study: 'study', course: 'courses', achievement: 'achievements', exam: 'exams' };
  const GENERAL = 'GEN';
  let list;
  let editing = null;

  function mine(type) {
    return data.db.academic_logs.filter(function (r) { return r.type === type; });
  }
  function courses() { return mine('course').sort(function (a, b) { return a.status === b.status ? (a.code < b.code ? -1 : 1) : a.status === 'active' ? -1 : 1; }); }
  function hoursText(n) { return t('sprog.hoursShort', { n: i18n.number(n, { maximumFractionDigits: 1 }) }); }
  function courseName(code) {
    if (code === GENERAL) return t('sprog.general');
    const c = mine('course').filter(function (x) { return x.code === code; })[0];
    return c ? c.code + ' · ' + c.title : code;
  }
  function courseIdOf(code) {
    const c = mine('course').filter(function (x) { return x.code === code; })[0];
    return c ? c.id : null;
  }
  function lastWeek() {
    const out = [];
    for (let i = 6; i >= 0; i -= 1) out.push(dates.addDays(dates.today(), -i));
    return out;
  }
  function hoursOn(day) {
    return mine('study').filter(function (r) { return r.date === day; }).reduce(function (s, r) { return s + r.hours; }, 0);
  }

  /** Sends a record to the server, then reloads the records and redraws. */
  function send(type, record, body, formEl, modalId, toast) {
    const path = '/academic/' + PATHS[type] + (record ? '/' + record.id : '');
    const request = record ? api.put(path, body) : api.post(path, body);
    ui.busy(formEl.querySelector('[type="submit"]'), request).then(function () {
      ui.closeModal(document.getElementById(modalId));
      return data.load(['academic_logs']);
    }).then(function () {
      refresh();
      ui.toast(toast);
    }).catch(ui.failed(formEl));
  }

  /* ---- Summary, goal and chart ---- */
  function drawSummary() {
    const me = portal.me();
    const week = lastWeek();
    const total = week.reduce(function (s, d) { return s + hoursOn(d); }, 0);
    const studyDays = week.filter(function (d) { return hoursOn(d) > 0; }).length;
    const active = mine('course').filter(function (c) { return c.status === 'active'; }).length;
    const cards = [
      ['clock', '', 'sprog.statWeek', hoursText(total), t('sprog.statWeekMeta', { goal: hoursText(me.study_goal) })],
      ['calendar', 'info', 'sprog.statDays', i18n.number(studyDays), t('sprog.statDaysMeta')],
      ['book', 'neutral', 'sprog.statCourses', i18n.number(active), t('sprog.statCoursesMeta')],
      ['star', 'warning', 'sprog.statAchv', i18n.number(mine('achievement').length), t('sprog.statAchvMeta')],
    ];
    document.getElementById('prog-stats').innerHTML = cards.map(function (c) {
      return '<div class="stat"><span class="tile' + (c[1] ? ' tile--' + c[1] : '') + '">' + icon(c[0], { size: 20 }) + '</span>' +
        '<span><span class="stat__label">' + esc(t(c[2])) + '</span><span class="stat__value">' + esc(c[3]) + '</span>' +
        '<span class="stat__meta">' + esc(c[4]) + '</span></span></div>';
    }).join('');

    const pct = Math.min(100, Math.round((total / me.study_goal) * 100));
    document.getElementById('goal').innerHTML =
      '<div class="goal__text"><strong>' + esc(t('sprog.goalProgress', { done: hoursText(total), goal: hoursText(me.study_goal) })) + '</strong>' +
      '<span>' + esc(total >= me.study_goal ? t('sprog.goalReached') : t('sprog.goalLeft', { left: hoursText(Math.max(0, me.study_goal - total)) })) + '</span></div>' +
      '<div class="goal__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + esc(t('sprog.goalLabel')) + '">' +
      '<span style="width:' + pct + '%"></span></div>';

    const values = week.map(hoursOn);
    DMS.charts.bars(document.getElementById('week-chart'), {
      title: t('sprog.weekTitle'),
      tableHeaders: [t('common.date'), t('sprog.hours'), t('sprog.sessions')],
      max: Math.max(4, Math.ceil(Math.max.apply(null, values))),
      format: hoursText,
      height: 230,
      items: week.map(function (d, i) {
        const n = mine('study').filter(function (r) { return r.date === d; }).length;
        return { label: i18n.date(d, 'weekday').slice(0, 3), value: values[i], detail: t('sprog.sessionsN', { n: i18n.number(n) }) };
      }),
    });
  }

  function drawCourses() {
    const rows = courses();
    document.getElementById('courses').innerHTML = rows.length ? rows.map(function (c) {
      return '<li><span class="tile tile--sm">' + icon('book', { size: 16 }) + '</span>' +
        '<div><span class="cell-main ltr">' + esc(c.code) + '</span><span class="cell-sub" dir="auto">' + esc(c.title) + ' · ' + esc(t('sprog.creditsN', { n: i18n.number(c.credits) })) + '</span></div>' +
        '<div class="cell-actions">' + (c.status === 'active' ? ui.badge('active') : '<span class="badge badge--neutral">' + esc(t('sprog.completed')) + '</span>') +
        '<button type="button" class="icon-btn icon-btn--sm" data-edit-course="' + c.id + '" aria-label="' + esc(t('sprog.editLabel', { name: c.code })) + '">' + icon('edit', { size: 16 }) + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete-course="' + c.id + '" aria-label="' + esc(t('sprog.deleteLabel', { name: c.code })) + '">' + icon('trash', { size: 16 }) + '</button></div></li>';
    }).join('') : '<li>' + ui.empty({ icon: 'book', title: 'sprog.noCourses', text: 'sprog.noCoursesText', compact: true }) + '</li>';
  }

  function drawAchievements() {
    const rows = mine('achievement').sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    document.getElementById('achievements').innerHTML = rows.length ? rows.map(function (a) {
      return '<li><span class="tile tile--sm tile--warning">' + icon(CATEGORY_ICONS[a.category] || 'star', { size: 16 }) + '</span>' +
        '<div><span class="cell-main" dir="auto">' + esc(a.title) + '</span><span class="cell-sub">' + esc(t('sprog.cat.' + a.category)) + ' · ' + esc(i18n.date(a.date, 'medium')) + '</span></div>' +
        '<div class="cell-actions">' +
        '<button type="button" class="icon-btn icon-btn--sm" data-edit-achv="' + a.id + '" aria-label="' + esc(t('sprog.editLabel', { name: a.title })) + '">' + icon('edit', { size: 16 }) + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete-achv="' + a.id + '" aria-label="' + esc(t('sprog.deleteLabel', { name: a.title })) + '">' + icon('trash', { size: 16 }) + '</button></div></li>';
    }).join('') : '<li>' + ui.empty({ icon: 'star', title: 'sprog.noAchv', text: 'sprog.noAchvText', compact: true }) + '</li>';
  }

  /** Upcoming exams first (soonest on top), then the past ones. */
  function drawExams() {
    const today = dates.today();
    const rows = mine('exam').sort(function (a, b) {
      const pa = a.date < today;
      const pb = b.date < today;
      if (pa !== pb) return pa ? 1 : -1;
      return (a.date + (a.time || '')) < (b.date + (b.time || '')) ? (pa ? 1 : -1) : (pa ? -1 : 1);
    });
    document.getElementById('exams').innerHTML = rows.length ? rows.map(function (e) {
      const past = e.date < today;
      const days = dates.between(today, e.date);
      const when = esc(i18n.date(e.date, 'full')) + (e.time ? ' · ' + esc(i18n.time(e.time)) : '');
      const badge = past ? '<span class="badge badge--neutral">' + esc(t('sprog.examPast')) + '</span>'
        : days === 0 ? '<span class="badge badge--danger">' + esc(t('sprog.examToday')) + '</span>'
          : '<span class="badge badge--' + (days <= 2 ? 'warning' : 'info') + '">' + esc(t('sprog.examInDays', { n: i18n.number(days) })) + '</span>';
      return '<li><span class="tile tile--sm' + (past ? ' tile--neutral' : ' tile--info') + '">' + icon('calendar', { size: 16 }) + '</span>' +
        '<div><span class="cell-main" dir="auto">' + esc(e.title) + '</span><span class="cell-sub">' + when +
        (e.course ? ' · <span class="ltr">' + esc(e.course) + '</span>' : '') + (e.location ? ' · <span dir="auto">' + esc(e.location) + '</span>' : '') + '</span></div>' +
        '<div class="cell-actions">' + badge +
        '<button type="button" class="icon-btn icon-btn--sm" data-edit-exam="' + e.id + '" aria-label="' + esc(t('sprog.editLabel', { name: e.title })) + '">' + icon('edit', { size: 16 }) + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete-exam="' + e.id + '" aria-label="' + esc(t('sprog.deleteLabel', { name: e.title })) + '">' + icon('trash', { size: 16 }) + '</button></div></li>';
    }).join('') : '<li>' + ui.empty({ icon: 'calendar', title: 'sprog.noExams', text: 'sprog.noExamsText', compact: true }) + '</li>';
  }

  function drawCourseFilter() {
    const sel = document.getElementById('study-course');
    const keep = sel.value || 'all';
    const codes = mine('study').map(function (r) { return r.course; }).concat(mine('course').map(function (c) { return c.code; }))
      .filter(function (c, i, arr) { return arr.indexOf(c) === i; }).sort();
    sel.innerHTML = '<option value="all">' + esc(t('sprog.allCourses')) + '</option>' +
      codes.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c === GENERAL ? t('sprog.general') : c) + '</option>'; }).join('');
    sel.value = sel.querySelector('option[value="' + keep + '"]') ? keep : 'all';
    if (list) list.state.filters.course = sel.value;
  }

  function studyRow(r) {
    return '<tr>' +
      ui.td('common.date', '<span class="cell-main">' + esc(i18n.date(r.date, 'medium')) + '</span><span class="cell-sub">' + esc(i18n.date(r.date, 'weekday')) + '</span>') +
      ui.td('sprog.course', '<span dir="auto">' + esc(courseName(r.course)) + '</span>') +
      ui.td('sprog.hours', '<strong class="num">' + esc(hoursText(r.hours)) + '</strong>') +
      ui.td('sprog.note', '<span class="cell-clip" dir="auto">' + esc(r.note || '—') + '</span>') +
      ui.td('', '<button type="button" class="icon-btn icon-btn--sm" data-edit-study="' + r.id + '" aria-label="' + esc(t('sprog.editLabel', { name: i18n.date(r.date, 'medium') })) + '">' + icon('edit', { size: 16 }) + '</button>' +
        '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-delete-study="' + r.id + '" aria-label="' + esc(t('sprog.deleteLabel', { name: i18n.date(r.date, 'medium') })) + '">' + icon('trash', { size: 16 }) + '</button>', 'cell-actions') +
      '</tr>';
  }

  /* ---- Forms ---- */
  function openStudy(r) {
    editing = r || null;
    const formEl = document.getElementById('study-modal-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('study-title').textContent = t(r ? 'sprog.editStudy' : 'sprog.logStudy');
    const active = mine('course').filter(function (c) { return c.status === 'active' || (r && c.code === r.course); });
    formEl.elements.course.innerHTML = active.map(function (c) { return '<option value="' + esc(c.code) + '">' + esc(c.code + ' · ' + c.title) + '</option>'; }).join('') +
      '<option value="' + GENERAL + '">' + esc(t('sprog.general')) + '</option>';
    formEl.elements.date.max = dates.today();
    DMS.form.fill(formEl, r ? { date: r.date, hours: r.hours, course: r.course, note: r.note } : { date: dates.today(), hours: 2, course: active.length ? active[0].code : GENERAL, note: '' });
    ui.openModal(document.getElementById('study-modal'));
  }

  function saveStudy(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const hours = Number(v.hours);
    const errors = {};
    if (!v.date) errors.date = 'err.required';
    else if (v.date > dates.today()) errors.date = 'sprog.errFuture';
    else if (v.date < dates.addDays(dates.today(), -365)) errors.date = 'sprog.errOld';
    if (!v.hours) errors.hours = 'err.required';
    else if (!(hours >= 0.5 && hours <= 12) || Math.round(hours * 2) !== hours * 2) errors.hours = 'sprog.errHours';
    else {
      const sameDay = mine('study').filter(function (r) { return r.date === v.date && (!editing || r.id !== editing.id); }).reduce(function (s, r) { return s + r.hours; }, 0);
      if (sameDay + hours > 16) errors.hours = ['sprog.errDayTotal', { n: i18n.number(16 - sameDay) }];
    }
    if (DMS.form.show(formEl, errors)) return;
    const body = { date: v.date, hours: hours, course_id: v.course === GENERAL ? null : courseIdOf(v.course), note: v.note || null };
    send('study', editing, body, formEl, 'study-modal', t(editing ? 'sprog.toastStudyUpdated' : 'sprog.toastStudyAdded', { hours: hoursText(hours) }));
  }

  function openCourse(c) {
    editing = c || null;
    const formEl = document.getElementById('course-modal-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('course-title').textContent = t(c ? 'sprog.editCourse' : 'sprog.addCourse');
    formEl.elements.status.innerHTML = '<option value="active">' + esc(t('status.active')) + '</option><option value="completed">' + esc(t('sprog.completed')) + '</option>';
    DMS.form.fill(formEl, c ? { code: c.code, title: c.title, credits: c.credits, status: c.status } : { code: '', title: '', credits: 3, status: 'active' });
    ui.openModal(document.getElementById('course-modal'));
  }

  function saveCourse(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const code = v.code.toUpperCase().replace(/\s+/g, ' ').replace(/^([A-Z]+)(\d)/, '$1 $2');
    const credits = Number(v.credits);
    const errors = {};
    if (!code) errors.code = 'err.required';
    else if (!/^[A-Z]{2,4} \d{3}$/.test(code)) errors.code = 'sprog.errCode';
    else if (mine('course').some(function (c) { return c.code === code && (!editing || c.id !== editing.id); })) errors.code = ['sprog.errCodeTaken', { code: code }];
    if (!v.title) errors.title = 'err.required';
    else if (v.title.length < 3) errors.title = 'sprog.errShort';
    if (!Number.isInteger(credits) || credits < 1 || credits > 6) errors.credits = 'sprog.errCredits';
    if (DMS.form.show(formEl, errors)) return;
    // Study sessions point at the course itself, so a renamed course keeps its hours.
    send('course', editing, { code: code, title: v.title, credits: credits, status: v.status }, formEl, 'course-modal', t('sprog.toastCourse', { code: code }));
  }

  function openAchievement(a) {
    editing = a || null;
    const formEl = document.getElementById('achv-modal-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('achv-title-m').textContent = t(a ? 'sprog.editAchv' : 'sprog.addAchv');
    formEl.elements.category.innerHTML = CATEGORIES.map(function (c) { return '<option value="' + c + '">' + esc(t('sprog.cat.' + c)) + '</option>'; }).join('');
    formEl.elements.date.max = dates.today();
    DMS.form.fill(formEl, a ? { title: a.title, category: a.category, date: a.date } : { title: '', category: 'certificate', date: dates.today() });
    ui.openModal(document.getElementById('achv-modal'));
  }

  function saveAchievement(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (!v.title) errors.title = 'err.required';
    else if (v.title.length < 3) errors.title = 'sprog.errShort';
    if (!v.date) errors.date = 'err.required';
    else if (v.date > dates.today()) errors.date = 'sprog.errFuture';
    if (DMS.form.show(formEl, errors)) return;
    send('achievement', editing, { title: v.title, category: v.category, date: v.date }, formEl, 'achv-modal', t('sprog.toastAchv'));
  }

  function openExam(e) {
    editing = e || null;
    const formEl = document.getElementById('exam-modal-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('exam-title-m').textContent = t(e ? 'sprog.editExam' : 'sprog.addExam');
    formEl.elements.course_id.innerHTML = '<option value="">' + esc(t('sprog.examNoCourse')) + '</option>' +
      courses().map(function (c) { return '<option value="' + c.id + '">' + esc(c.code + ' · ' + c.title) + '</option>'; }).join('');
    if (!e) formEl.elements.exam_date.min = dates.today();
    DMS.form.fill(formEl, e
      ? { title: e.title, exam_date: e.date, start_time: e.time || '', course_id: e.course_id || '', location: e.location }
      : { title: '', exam_date: dates.addDays(dates.today(), 7), start_time: '', course_id: '', location: '' });
    ui.openModal(document.getElementById('exam-modal'));
  }

  function saveExam(event) {
    event.preventDefault();
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (!v.title) errors.title = 'err.required';
    else if (v.title.length < 3) errors.title = 'sprog.errShort';
    if (!v.exam_date) errors.exam_date = 'err.required';
    else if (!editing && v.exam_date < dates.today()) errors.exam_date = 'sprog.errExamPast';
    if (DMS.form.show(formEl, errors)) return;
    const body = { title: v.title, exam_date: v.exam_date, start_time: v.start_time || null, course_id: v.course_id ? Number(v.course_id) : null, location: v.location || null };
    send('exam', editing, body, formEl, 'exam-modal', t('sprog.toastExam', { title: v.title }));
  }

  function remove(record, label) {
    ui.confirm({ title: t('sprog.deleteTitle'), message: t('sprog.deleteText', { name: label }), confirm: t('common.delete') }).then(function (ok) {
      if (!ok) return null;
      return api.del('/academic/' + PATHS[record.type] + '/' + record.id)
        .then(function () { return data.load(['academic_logs']); })
        .then(function () { refresh(); ui.toast(t('sprog.toastDeleted'), 'info'); })
        .catch(ui.failed());
    });
  }

  function refresh() {
    drawSummary();
    drawCourses();
    drawAchievements();
    drawExams();
    drawCourseFilter();
    list.render();
  }

  function init() {
    list = DMS.list.create({
      root: document.getElementById('study-list'),
      items: function () { return mine('study'); },
      pageSize: 8,
      sort: function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id; },
      search: function (r) { return [r.course, courseName(r.course), r.note]; },
      filters: { course: function (r, v) { return r.course === v; } },
      render: studyRow,
      empty: { icon: 'clock', title: 'sprog.noStudy', text: 'sprog.noStudyText' },
    });

    document.getElementById('add-study').addEventListener('click', function () { openStudy(null); });
    document.getElementById('add-course').addEventListener('click', function () { openCourse(null); });
    document.getElementById('add-achv').addEventListener('click', function () { openAchievement(null); });
    document.getElementById('add-exam').addEventListener('click', function () { openExam(null); });
    document.getElementById('edit-goal').addEventListener('click', function () {
      const formEl = document.getElementById('goal-modal-form');
      DMS.form.clear(formEl);
      formEl.elements.goal.value = portal.me().study_goal;
      document.getElementById('goal-title').textContent = t('sprog.editGoal');
      ui.openModal(document.getElementById('goal-modal'));
    });

    document.getElementById('study-modal-form').addEventListener('submit', saveStudy);
    document.getElementById('course-modal-form').addEventListener('submit', saveCourse);
    document.getElementById('achv-modal-form').addEventListener('submit', saveAchievement);
    document.getElementById('exam-modal-form').addEventListener('submit', saveExam);
    document.getElementById('goal-modal-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const formEl = event.target;
      const goal = Number(formEl.elements.goal.value);
      if (!Number.isInteger(goal) || goal < 1 || goal > 60) { DMS.form.show(formEl, { goal: 'sprog.errGoal' }); return; }
      ui.busy(formEl.querySelector('[type="submit"]'), api.patch('/me', { study_goal: goal })).then(function () {
        ui.closeModal(document.getElementById('goal-modal'));
        return DMS.app.reload();
      }).then(function () { ui.toast(t('sprog.toastGoal', { goal: hoursText(goal) })); }).catch(ui.failed(formEl));
    });

    document.querySelector('.main').addEventListener('click', function (event) {
      // Ids are only unique within a type, so each button looks in its own type.
      const pick = function (attr, type) {
        const b = event.target.closest('[' + attr + ']');
        if (!b) return null;
        return data.db.academic_logs.filter(function (r) { return r.type === type && String(r.id) === b.getAttribute(attr); })[0] || null;
      };
      let r;
      if ((r = pick('data-edit-study', 'study'))) openStudy(r);
      else if ((r = pick('data-delete-study', 'study'))) remove(r, i18n.date(r.date, 'medium') + ' · ' + hoursText(r.hours));
      else if ((r = pick('data-edit-course', 'course'))) openCourse(r);
      else if ((r = pick('data-delete-course', 'course'))) remove(r, r.code);
      else if ((r = pick('data-edit-achv', 'achievement'))) openAchievement(r);
      else if ((r = pick('data-delete-achv', 'achievement'))) remove(r, r.title);
      else if ((r = pick('data-edit-exam', 'exam'))) openExam(r);
      else if ((r = pick('data-delete-exam', 'exam'))) remove(r, r.title);
    });

    refresh();
  }

  DMS.app.page({ needs: ['academic_logs'], init: init, render: refresh });
})(window);
