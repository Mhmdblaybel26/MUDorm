/* ==========================================================================
   allocation.js — assign or reassign approved students to rooms.
   Laravel enforces the rules (AllocationService, in a locked transaction):
   a room never receives more residents than it has beds, closed rooms
   (maintenance, unavailable, uninhabitable) accept no one, and a student
   has one active room. Reassigning ends the previous stay automatically.
   A stay is for one semester: choosing the academic year and semester fills
   in the first and last day, which can still be adjusted.
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
  let formEl;

  const term = DMS.app.term;

  /** Year and semester selects of the form. Keeps the given choice (or the one already made). */
  function fillTermSelects(year, semester) {
    const yearSel = formEl.elements.academic_year;
    const semSel = formEl.elements.semester;
    const keepYear = String(year || yearSel.value);
    const keepSem = semester || semSel.value;
    yearSel.innerHTML = data.academicYears().map(function (y) { return option(y, y + '–' + (y + 1), String(y) === keepYear); }).join('');
    semSel.innerHTML = data.config.semesters.map(function (s) { return option(s.key, t('semester.' + s.key), s.key === keepSem); }).join('');
  }
  /** First and last day of the chosen semester; a semester already running starts today. */
  function applyTermDates() {
    const d = data.termDates(formEl.elements.academic_year.value, formEl.elements.semester.value);
    const today = data.dates.today();
    formEl.elements.start_date.value = today > d.from && today < d.to ? today : d.from;
    formEl.elements.end_date.value = d.to;
  }

  function approvedStudents() {
    return data.db.students.filter(function (s) { return s.status === 'active'; })
      .sort(function (a, b) { return i18n.name(a).localeCompare(i18n.name(b), i18n.lang()); });
  }

  function option(value, text, selected) {
    return '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + esc(text) + '</option>';
  }

  function fillStudentSelect(selected) {
    const students = approvedStudents();
    const without = students.filter(function (s) { return !data.allocationOf(s.id); });
    const withRoom = students.filter(function (s) { return data.allocationOf(s.id); });
    document.getElementById('alloc-student').innerHTML =
      option('', t('alloc.chooseStudent'), !selected) +
      (without.length ? '<optgroup label="' + esc(t('alloc.groupWithout')) + '">' + without.map(function (s) {
        return option(s.id, i18n.name(s), String(s.id) === String(selected));
      }).join('') + '</optgroup>' : '') +
      '<optgroup label="' + esc(t('alloc.groupWith')) + '">' + withRoom.map(function (s) {
        return option(s.id, i18n.name(s) + ' · ' + data.roomOfStudent(s.id).number, String(s.id) === String(selected));
      }).join('') + '</optgroup>';
  }

  function roomText(room) {
    const used = data.occupants(room.id).length;
    let text = room.number + ' · ' + t('roomType.' + room.type) + ' · ' + t('rooms.bedsUsed', { used: i18n.number(used), capacity: i18n.number(room.capacity) });
    if (data.isClosed(room)) text += ' · ' + t('status.' + room.status);
    else if (used >= room.capacity) text += ' · ' + t('status.full');
    return text;
  }

  // Full rooms stay selectable on purpose: choosing one shows why it cannot be used.
  function fillRoomSelect(selected) {
    document.getElementById('alloc-room').innerHTML = option('', t('alloc.chooseRoom'), !selected) +
      data.config.wings.map(function (wing) {
        const rooms = data.db.rooms.filter(function (r) { return r.wing === wing; }).sort(function (a, b) { return a.number < b.number ? -1 : 1; });
        if (!rooms.length) return '';
        return '<optgroup label="' + esc(t('wing.' + wing)) + '">' + rooms.map(function (r) {
          return option(r.id, roomText(r), String(r.id) === String(selected));
        }).join('') + '</optgroup>';
      }).join('');
  }

  function describeRoom() {
    const room = data.find('rooms', formEl.elements.room_id.value);
    const out = document.getElementById('alloc-room-info');
    if (!room) { out.textContent = ''; return; }
    const residents = data.occupants(room.id).map(function (a) { return i18n.name(data.find('students', a.student_id)); });
    const free = room.capacity - residents.length;
    const separator = i18n.lang() === 'ar' ? '، ' : ', ';
    out.textContent = (residents.length ? t('alloc.residents', { names: residents.join(separator) }) : t('alloc.noResidents')) + ' ' +
      (data.isClosed(room) ? t('alloc.infoMaintenance') : free > 0 ? t('alloc.freeBeds', { n: i18n.number(free) }) : t('alloc.noFreeBed'));
  }

  function describeStudent() {
    const out = document.getElementById('alloc-current');
    const id = formEl.elements.student_id.value;
    const a = id ? data.allocationOf(id) : null;
    out.textContent = !id ? '' : a
      ? t('alloc.currentRoom', { room: data.find('rooms', a.room_id).number, date: i18n.date(a.start_date, 'medium') })
      : t('alloc.noCurrentRoom');
  }

  function drawWaiting() {
    const waiting = approvedStudents().filter(function (s) { return !data.allocationOf(s.id); });
    document.getElementById('waiting').innerHTML = waiting.length
      ? '<div class="notice notice--warning">' + ui.icon('users', { size: 18 }) + '<div><strong>' + esc(t('alloc.waitingTitle', { n: i18n.number(waiting.length) })) + '</strong>' +
        '<div class="chips chips--spaced">' + waiting.map(function (s) {
          return '<button type="button" class="chip" data-pick="' + s.id + '">' + ui.icon('plus', { size: 14 }) + esc(i18n.name(s)) + '</button>';
        }).join('') + '</div></div></div>'
      : '';
  }

  function resetForm(keepMessage) {
    formEl.reset();
    DMS.form.clear(formEl);
    if (!keepMessage) document.getElementById('alloc-error').hidden = true;
    fillStudentSelect();
    fillRoomSelect();
    // Start on the semester the console is showing, or the current one when it shows several.
    const shown = term.get();
    const now = data.currentTerm();
    fillTermSelects(shown.year === 'all' ? now.year : shown.year, shown.semester === 'all' ? now.semester : shown.semester);
    applyTermDates();
    describeRoom();
    describeStudent();
  }

  function showError(key, params) {
    const box = document.getElementById('alloc-error');
    box.innerHTML = ui.icon('alert', { size: 18 }) + '<div><strong>' + esc(t('alloc.errTitle')) + '</strong>' + esc(t(key, params)) + '</div>';
    box.hidden = false;
  }

  function submit(event) {
    event.preventDefault();
    document.getElementById('alloc-error').hidden = true;
    const v = DMS.form.values(formEl);
    const errors = {};
    if (!v.student_id) errors.student_id = 'alloc.errChooseStudent';
    if (!v.room_id) errors.room_id = 'alloc.errChooseRoom';
    if (!v.start_date) errors.start_date = 'err.required';
    if (!v.end_date) errors.end_date = 'err.required';
    else if (v.start_date && v.end_date <= v.start_date) errors.end_date = 'alloc.errDates';
    if (DMS.form.show(formEl, errors)) return;

    const student = data.find('students', v.student_id);
    const room = data.find('rooms', v.room_id);
    const body = {
      student_id: Number(v.student_id), room_id: Number(v.room_id), start_date: v.start_date, end_date: v.end_date,
      academic_year: Number(v.academic_year), semester: v.semester,
    };
    ui.busy(formEl.querySelector('[type="submit"]'), DMS.api.post('/room-assignments', body)).then(function (result) {
      ui.toast(t(result.updated ? 'alloc.toastUpdated' : result.moved ? 'alloc.toastMoved' : 'alloc.toastCreated',
        { name: i18n.name(student), room: room.number, from: result.from || '' }));
      return DMS.app.reload().then(function () { resetForm(); });
    }).catch(function (err) {
      // The server's reasons, shown under the field and in the box above the form.
      const map = {
        roomFull: ['alloc.errFull', 'room_id'],
        roomMaintenance: ['alloc.errMaintenance', 'room_id'],
        dates: ['alloc.errDates', 'end_date'],
        studentNotApproved: ['alloc.errStudent', 'student_id'],
        roomMissing: ['alloc.errChooseRoom', 'room_id'],
      }[err.code];
      if (!map) return ui.failed(formEl)(err);
      const params = Object.assign({}, err.params, {
        used: i18n.number(err.params.used || 0), capacity: i18n.number(err.params.capacity || 0),
      });
      const fieldErrors = {};
      fieldErrors[map[1]] = [map[0] + 'Short', params];
      DMS.form.show(formEl, fieldErrors);
      showError(map[0], params);
      return DMS.app.reload();
    }).catch(function () { return null; });
  }
  function row(a) {
    const s = data.find('students', a.student_id);
    const room = data.find('rooms', a.room_id);
    const name = i18n.name(s);
    return (
      '<tr>' +
      ui.td('common.student', ui.person(s)) +
      ui.td('common.room', room ? '<span class="cell-main ltr">' + esc(room.number) + '</span><span class="cell-sub nowrap">' + esc(t('roomType.' + room.type)) + '</span>' : ui.roomCode(null)) +
      ui.td('alloc.period', '<span class="cell-main nowrap">' + esc(term.name(a.academic_year, a.semester)) + '</span>' +
        '<span class="cell-sub nowrap">' + esc(i18n.date(a.start_date, 'medium')) + ' · ' + esc(t('alloc.until', { date: i18n.date(a.end_date, 'medium') })) + '</span>') +
      ui.td('common.status', ui.badge(a.status)) +
      ui.td('', a.status === 'active'
        ? '<button type="button" class="icon-btn icon-btn--sm" data-reassign="' + a.id + '" aria-label="' + esc(t('alloc.reassignLabel', { name: name })) + '" title="' + esc(t('alloc.reassign')) + '">' + ui.icon('swap', { size: 17 }) + '</button>' +
          '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-end="' + a.id + '" aria-label="' + esc(t('alloc.endLabel', { name: name })) + '" title="' + esc(t('alloc.endStay')) + '">' + ui.icon('door', { size: 17 }) + '</button>'
        : '', 'cell-actions') +
      '</tr>'
    );
  }

  function refresh() {
    drawWaiting();
    list.render();
  }

  function init() {
    formEl = document.getElementById('alloc-form');
    const root = document.getElementById('alloc-list');
    list = DMS.list.create({
      root: root,
      items: function () { return data.db.allocations.filter(term.hasRecord); },
      pageSize: 8,
      sort: function (a, b) {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        const ra = data.find('rooms', a.room_id);
        const rb = data.find('rooms', b.room_id);
        return (ra ? ra.number : 'Z') < (rb ? rb.number : 'Z') ? -1 : 1;
      },
      search: function (a) {
        const s = data.find('students', a.student_id);
        const r = data.find('rooms', a.room_id);
        return s ? [s.name, s.name_ar, s.email, r ? r.number : ''] : [r ? r.number : ''];
      },
      filters: {
        wing: function (a, v) { const r = data.find('rooms', a.room_id); return !!r && r.wing === v; },
        status: function (a, v) { return a.status === v; },
      },
      render: row,
      empty: { icon: 'key', title: 'alloc.emptyTitle', text: 'alloc.emptyText' },
    });

    formEl.addEventListener('submit', submit);
    formEl.elements.room_id.addEventListener('change', function () {
      document.getElementById('alloc-error').hidden = true;
      DMS.form.clear(formEl);
      describeRoom();
    });
    formEl.elements.student_id.addEventListener('change', describeStudent);
    formEl.elements.academic_year.addEventListener('change', applyTermDates);
    formEl.elements.semester.addEventListener('change', applyTermDates);
    document.getElementById('alloc-reset').addEventListener('click', function () { resetForm(); });

    document.getElementById('waiting').addEventListener('click', function (event) {
      const pick = event.target.closest('[data-pick]');
      if (!pick) return;
      formEl.elements.student_id.value = pick.getAttribute('data-pick');
      describeStudent();
      formEl.elements.room_id.focus();
    });

    root.addEventListener('click', function (event) {
      const re = event.target.closest('[data-reassign]');
      const end = event.target.closest('[data-end]');
      if (re) {
        const a = data.find('allocations', re.getAttribute('data-reassign'));
        resetForm();
        fillTermSelects(a.academic_year, a.semester);
        DMS.form.fill(formEl, { student_id: a.student_id, room_id: a.room_id, start_date: data.dates.today(), end_date: a.end_date });
        describeStudent();
        describeRoom();
        formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        formEl.elements.room_id.focus({ preventScroll: true });
      }
      if (end) {
        const a = data.find('allocations', end.getAttribute('data-end'));
        const s = data.find('students', a.student_id);
        const room = data.find('rooms', a.room_id);
        ui.confirm({
          title: t('alloc.endTitle'),
          message: t('alloc.endText', { name: i18n.name(s), room: room ? room.number : t('common.noRoom') }),
          confirm: t('alloc.endStay'),
        }).then(function (ok) {
          if (!ok) return null;
          return DMS.api.post('/room-assignments/' + a.id + '/end')
            .then(function () { return DMS.app.reload(); })
            .then(function () {
              resetForm();
              ui.toast(t('alloc.toastEnded', { name: i18n.name(s), room: room ? room.number : '' }), 'info');
            })
            .catch(ui.failed());
        });
      }
    });

    resetForm();
    refresh();
  }

  function render() {
    const keep = DMS.form.values(formEl);
    fillStudentSelect(keep.student_id);
    fillRoomSelect(keep.room_id);
    fillTermSelects();
    describeRoom();
    describeStudent();
    refresh();
  }

  DMS.app.page({ needs: ['students', 'rooms', 'allocations'], init: init, render: render });
})(window);
