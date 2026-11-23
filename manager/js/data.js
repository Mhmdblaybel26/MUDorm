/* ==========================================================================
   data.js — the records the pages show, loaded from the Laravel API, and the
   read helpers the pages use (DMS.data).

   - Collections keep the shapes the pages have always used (students, rooms,
     allocations, applications, complaints, leaves, swaps, menus, orders ...),
     so the pages read data.db.<collection> as before.
   - Nothing is stored in the browser any more: data.load([...]) fetches the
     collections a page needs from MySQL through the API, and data.refresh()
     fetches them again (after a change, or when the server reports news).
   - Business rules (capacity, deadlines, one meal per type and day, one room
     per student ...) are enforced by Laravel; the pages only check forms
     early so people see mistakes before sending.
   - The system starts empty: there is no sample data.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = (global.DMS = global.DMS || {});
  const api = DMS.api;

  /* ---- Fixed reference data ---------------------------------------------- */
  const config = {
    // The dorm office's own e-mail (contact address; e-mails to students are sent
    // from it). Students use their own personal e-mail (for example name@gmail.com).
    housingEmail: 'mudorm.office@gmail.com',
    wings: ['A', 'B', 'C', 'D'],
    roomTypes: { double: 2, triple: 3 },
    menuTypes: ['main', 'vegetarian', 'light'],
    complaintCategories: ['plumbing', 'electricity', 'noise', 'other'],
    faculties: ['engineering', 'sciences', 'business', 'media', 'health'],
    // major key -> faculty key (labels live in i18n.js)
    majors: {
      cce: 'engineering', mech: 'engineering', biomed: 'engineering',
      cs: 'sciences', bio: 'sciences',
      acc: 'business', mkt: 'business', mis: 'business',
      media: 'media', journalism: 'media',
      nursing: 'health', nutrition: 'health', medlab: 'health',
    },
    // The three daily meals and the hours the dining hall serves them.
    meals: [
      { key: 'breakfast', from: '06:00', to: '10:00' },
      { key: 'lunch', from: '13:00', to: '16:00' },
      { key: 'dinner', from: '18:00', to: '21:00' },
    ],
    // A student may ask for at most this many portions of one meal.
    maxPortions: 2,
    // Requests for a day close at this time on the day before, so the kitchen
    // knows the quantities before it buys and prepares.
    defaultCutoff: '20:00',
    // Room states the office sets; "full" follows the residents. The last three close the room.
    roomStates: ['available', 'maintenance', 'unavailable', 'uninhabitable'],
    closedRoomStates: ['maintenance', 'unavailable', 'uninhabitable'],
    // Leave: temporary (out of hours or nights away) or final departure from the dorm.
    leaveTypes: ['temporary', 'final'],
    technicianSpecialties: ['plumbing', 'electricity', 'general', 'network'],
    emergencyCategories: ['illness', 'injury', 'mental_health', 'family', 'security', 'fire', 'other'],
    emergencySeverities: ['low', 'medium', 'high', 'critical'],
  };
  // Public emergency numbers in Lebanon, shown beside the dorm's own hotline.
  config.publicHotlines = [
    { key: 'redCross', number: '140' },
    { key: 'civilDefense', number: '125' },
    { key: 'police', number: '112' },
    { key: 'fire', number: '175' },
  ];
  // An academic year has three semesters. It is named by the calendar year it
  // starts in: 2026 is the year 2026-2027 (Fall 2026, Spring 2027, Summer 2027).
  config.semesters = [
    { key: 'fall', from: '09-01', to: '01-31' },
    { key: 'spring', from: '02-01', to: '06-15' },
    { key: 'summer', from: '06-16', to: '08-31' },
  ];

  /* ---- The housing application form --------------------------------------
     The dorm office edits it on the admin page "Application form"; the homepage
     draws the form from this list. Labels, hints and choices are kept in both
     languages because applicants read them on the Arabic and English pages.
     - system: needed to create the student's account and place the student;
       can be renamed and moved, never deleted or made optional.
     - builtin: part of the standard form; its type and choices are fixed.
     Fields the office adds get the key "custom_<n>". An application keeps the
     answers to those with a copy of the question, so they stay readable after
     the field is changed or deleted. */
  config.formSections = ['personal', 'family', 'contact', 'studies', 'housing', 'health', 'confirm'];
  config.formTypes = ['text', 'textarea', 'number', 'date', 'email', 'tel', 'select', 'radio', 'checkbox'];
  const opt = function (value, en, ar) { return { value: value, en: en, ar: ar }; };
  // [key, section, type, required, system, label en, label ar, hint en, hint ar, extra]
  const DEFAULT_FORM = [
    // Each name in English and in Arabic side by side: the form has two columns.
    ['first_name_en', 'personal', 'text', true, true, 'First name (English)', 'الاسم الأول (بالإنجليزية)', 'In Latin letters, as on your university ID card.', 'بالأحرف اللاتينية، كما على بطاقتك الجامعية.', { lang: 'en' }],
    ['first_name_ar', 'personal', 'text', true, true, 'First name (Arabic)', 'الاسم الأول (بالعربية)', 'In Arabic letters, as on your identity card.', 'بالأحرف العربية، كما على بطاقة الهوية.', { lang: 'ar' }],
    ['father_name_en', 'personal', 'text', true, false, "Father's name (English)", 'اسم الأب (بالإنجليزية)', '', '', { lang: 'en' }],
    ['father_name_ar', 'personal', 'text', true, false, "Father's name (Arabic)", 'اسم الأب (بالعربية)', '', '', { lang: 'ar' }],
    ['last_name_en', 'personal', 'text', true, true, 'Family name (English)', 'الشهرة (بالإنجليزية)', '', '', { lang: 'en' }],
    ['last_name_ar', 'personal', 'text', true, true, 'Family name (Arabic)', 'الشهرة (بالعربية)', '', '', { lang: 'ar' }],
    ['date_of_birth', 'personal', 'date', true, false, 'Date of birth', 'تاريخ الولادة', '', ''],
    ['place_of_birth', 'personal', 'text', true, false, 'Place of birth', 'مكان الولادة', '', ''],
    ['nationality', 'personal', 'select', true, false, 'Nationality', 'الجنسية', '', '', {
      options: [opt('lebanese', 'Lebanese', 'لبنانية'), opt('syrian', 'Syrian', 'سورية'), opt('palestinian', 'Palestinian', 'فلسطينية'),
        opt('iraqi', 'Iraqi', 'عراقية'), opt('jordanian', 'Jordanian', 'أردنية'), opt('other', 'Other', 'أخرى')],
    }],
    ['gender', 'personal', 'radio', true, true, 'Gender', 'الجنس', 'Female and male students live in separate wings.', 'تسكن الطالبات والطلاب في أجنحة منفصلة.', {
      options: [opt('female', 'Female', 'أنثى'), opt('male', 'Male', 'ذكر')],
    }],
    ['mother_name_en', 'family', 'text', true, false, "Mother's full name (English)", 'اسم الأم وشهرتها (بالإنجليزية)', 'First name and maiden family name.', 'الاسم الأول وشهرة العائلة قبل الزواج.', { lang: 'en' }],
    ['mother_name_ar', 'family', 'text', true, false, "Mother's full name (Arabic)", 'اسم الأم وشهرتها (بالعربية)', '', '', { lang: 'ar' }],
    ['guardian_name', 'family', 'text', true, false, 'Emergency contact (parent or guardian)', 'جهة الاتصال في الطوارئ (وليّ الأمر)', 'The person the dorm office calls in an emergency.', 'الشخص الذي يتصل به مكتب السكن في حالات الطوارئ.'],
    ['guardian_relation', 'family', 'select', true, false, 'Relation to you', 'صلة القرابة', '', '', {
      options: [opt('father', 'Father', 'الأب'), opt('mother', 'Mother', 'الأم'), opt('brother', 'Brother', 'الأخ'), opt('sister', 'Sister', 'الأخت'),
        opt('guardian', 'Legal guardian', 'الوصيّ القانوني'), opt('other', 'Other', 'أخرى')],
    }],
    ['guardian_phone', 'family', 'tel', true, false, 'Emergency contact phone', 'هاتف جهة الاتصال في الطوارئ', '', '', { placeholder: '+961 70 123 456' }],
    ['university_id', 'contact', 'text', true, true, 'University ID', 'الرقم الجامعي', '8 digits, for example 24110457. It becomes your username.', '8 أرقام، مثل 24110457، ويصبح اسم المستخدم الخاص بك.', { ltr: true }],
    ['email', 'contact', 'email', true, true, 'Personal e-mail', 'البريد الإلكتروني الشخصي', 'Your own address, for example your Gmail. The dorm office sends its answer and your sign-in details there.', 'عنوانك الخاص، مثل بريدك على Gmail. يرسل إليه مكتب السكن ردّه وبيانات الدخول.', { placeholder: 'name@gmail.com' }],
    ['phone', 'contact', 'tel', true, true, 'Mobile phone', 'الهاتف الخلوي', '', '', { placeholder: '+961 70 123 456' }],
    ['governorate', 'contact', 'select', true, false, 'Governorate', 'المحافظة', '', '', {
      options: [opt('beirut', 'Beirut', 'بيروت'), opt('mount_lebanon', 'Mount Lebanon', 'جبل لبنان'), opt('north', 'North', 'الشمال'), opt('akkar', 'Akkar', 'عكار'),
        opt('bekaa', 'Bekaa', 'البقاع'), opt('baalbek_hermel', 'Baalbek-Hermel', 'بعلبك الهرمل'), opt('south', 'South', 'الجنوب'), opt('nabatieh', 'Nabatieh', 'النبطية'),
        opt('abroad', 'Outside Lebanon', 'خارج لبنان')],
    }],
    ['home_town', 'contact', 'text', true, false, 'Home town', 'البلدة', '', '', { placeholder_en: 'For example Tyre, Baalbek or Hermel', placeholder_ar: 'مثل صور أو بعلبك أو الهرمل' }],
    ['address', 'contact', 'textarea', false, false, 'Home address', 'عنوان السكن الدائم', 'Street, building and floor.', 'الشارع والمبنى والطابق.'],
    ['major', 'studies', 'select', true, true, 'Faculty and major', 'الكلية والاختصاص', '', ''],
    ['year', 'studies', 'select', true, true, 'Year of study', 'السنة الدراسية', '', ''],
    ['term', 'housing', 'select', true, true, 'Semester you are applying for', 'الفصل الذي تتقدّم له', 'Housing is given for one semester at a time.', 'يُمنح السكن لفصل دراسي واحد في كل مرة.'],
    ['room_type', 'housing', 'radio', true, true, 'Preferred room type', 'نوع الغرفة المفضّل', '', ''],
    ['reason', 'housing', 'textarea', true, false, 'Why do you need housing?', 'لماذا تحتاج إلى السكن؟', 'At least 30 characters.', '30 حرفًا على الأقل.'],
    ['blood_type', 'health', 'select', false, false, 'Blood type', 'فصيلة الدم', '', '', {
      options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(function (b) { return opt(b, b, b); }).concat([opt('unknown', "I don't know", 'لا أعرف')]),
    }],
    ['medical_notes', 'health', 'textarea', false, false, 'Medical notes and allergies', 'ملاحظات طبية وحساسية', 'Shared only with the dorm office and the on-site doctor.', 'لا يطّلع عليها إلا مكتب السكن وطبيب السكن.'],
    ['consent', 'confirm', 'checkbox', true, true, 'I have read the rules and guidelines and agree to follow them.', 'قرأت الأنظمة والإرشادات وأوافق على الالتزام بها.', '', ''],
  ];
  /** A fresh copy of the standard form, numbered 1, 2, 3 ... */
  function defaultForm() {
    return DEFAULT_FORM.map(function (r, i) {
      const extra = r[9] || {};
      return {
        id: i + 1, key: r[0], section: r[1], type: r[2], required: r[3], system: r[4], builtin: true,
        label_en: r[5], label_ar: r[6], hint_en: r[7], hint_ar: r[8], position: i + 1,
        options: extra.options ? extra.options.map(function (o) { return Object.assign({}, o); }) : null,
        lang: extra.lang || null, ltr: !!extra.ltr,
        placeholder_en: extra.placeholder_en || extra.placeholder || '', placeholder_ar: extra.placeholder_ar || extra.placeholder || '',
      };
    });
  }

  /* ---- Date helpers (local time, ISO strings) ---------------------------- */
  const pad = function (n) { return String(n).padStart(2, '0'); };
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isoDateTime(d) { return isoDate(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00'; }
  function parseDate(iso) {
    const p = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function addDays(iso, n) { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoDate(d); }
  function today() { return isoDate(new Date()); }
  function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }

  /* ---- Academic terms ----------------------------------------------------- */
  /** The academic year and semester a date falls in: { year, semester }. */
  function termOf(iso) {
    const day = String(iso).slice(0, 10);
    const year = Number(day.slice(0, 4));
    const monthDay = day.slice(5);
    if (monthDay >= '09-01') return { year: year, semester: 'fall' };
    if (monthDay <= '01-31') return { year: year - 1, semester: 'fall' };
    return { year: year - 1, semester: monthDay <= '06-15' ? 'spring' : 'summer' };
  }
  /** First and last day of a semester: { from, to }. */
  function termDates(year, semester) {
    const y = Number(year);
    if (semester === 'fall') return { from: y + '-09-01', to: (y + 1) + '-01-31' };
    if (semester === 'spring') return { from: (y + 1) + '-02-01', to: (y + 1) + '-06-15' };
    return { from: (y + 1) + '-06-16', to: (y + 1) + '-08-31' };
  }
  function currentTerm() { return termOf(today()); }

  /* ---- The store ------------------------------------------------------------- */
  function emptyDb() {
    return {
      admin: null, me: null,
      settings: { meal_cutoff: config.defaultCutoff, health: { hotline: '', doctor_en: '', doctor_ar: '', hours_en: '', hours_ar: '' }, academic_years: [] },
      stats: null,
      students: [], applications: [], application_form: [], rooms: [], allocations: [], technicians: [],
      complaints: [], leaves: [], swaps: [], announcements: [], ratings: [], menus: [], orders: [],
      activity: [], academic_logs: [], medical_profiles: [], rules: [], health_requests: [], emergencies: [],
      notifications: [], mealCounts: {},
      ui: { notifications_seen_at: null },
    };
  }
  let db = emptyDb();
  const loaded = {};

  /** Meals: ten weeks back and ahead by default; pages can ask for another range. */
  const ranges = {
    menus: { from: addDays(today(), -70), to: addDays(today(), 70) },
    orders: { from: addDays(today(), -70), to: addDays(today(), 14) },
  };

  const LOADERS = {
    settings: function () {
      return api.get('/settings').then(function (res) {
        const s = res.data;
        db.settings = { meal_cutoff: s.meal_cutoff, health: s.health, academic_years: s.academic_years || [], term: s.term, now: s.now };
        db.application_form = s.application_form || [];
      });
    },
    stats: function () { return api.get('/dashboard').then(function (res) { db.stats = res.data; db.mealCounts[res.data.meals.tomorrow] = res.data.meals.counts; }); },
    activity: function () { return api.get('/activity', { per_page: 60 }).then(function (res) { db.activity = res.data; }); },
    students: function () { return api.all('/students').then(function (list) { db.students = list; }); },
    rooms: function () { return api.all('/rooms').then(function (list) { db.rooms = list; }); },
    allocations: function () { return api.all('/room-assignments').then(function (list) { db.allocations = list; }); },
    applications: function () { return api.all('/applications').then(function (list) { db.applications = list; }); },
    technicians: function () { return api.all('/technicians').then(function (list) { db.technicians = list; }); },
    complaints: function () { return api.all('/maintenance').then(function (list) { db.complaints = list; }); },
    leaves: function () { return api.all('/leave-requests').then(function (list) { db.leaves = list; }); },
    swaps: function () { return api.all('/room-swaps').then(function (list) { db.swaps = list; }); },
    announcements: function () { return api.all('/announcements').then(function (list) { db.announcements = list; }); },
    rules: function () { return api.all('/rules').then(function (list) { db.rules = list; }); },
    ratings: function () { return api.all('/room-ratings').then(function (list) { db.ratings = list; }); },
    menus: function () { return api.all('/meals/menus', ranges.menus).then(function (list) { db.menus = list; }); },
    orders: function () { return api.all('/meals/orders', ranges.orders).then(function (list) { db.orders = list; }); },
    health_requests: function () { return api.all('/health/requests').then(function (list) { db.health_requests = list; }); },
    medical_profiles: function () { return api.all('/health/profiles').then(function (list) { db.medical_profiles = list; }); },
    emergencies: function () { return api.all('/emergency-cases').then(function (list) { db.emergencies = list; }); },
    academic_logs: function () { return api.get('/academic').then(function (res) { db.academic_logs = res.data; }); },
    notifications: function () { return api.all('/notifications').then(function (list) { db.notifications = list; }); },
    // The student's dorm pass, signed by the server.
    pass: function () { return api.get('/me/pass').then(function (res) { db.pass = res.data; }); },
  };

  /** Loads (or reloads) the named collections. Resolves when all have arrived. */
  function load(names) {
    const unique = (names || []).filter(function (n, i, arr) { return LOADERS[n] && arr.indexOf(n) === i; });
    unique.forEach(function (n) { loaded[n] = true; });
    return Promise.all(unique.map(function (n) { return LOADERS[n](); }));
  }
  /** Fetches again every collection this page has loaded. */
  function refresh() { return load(Object.keys(loaded)); }
  /** Changes the meal range a page works with (and reloads it). */
  function setRange(name, from, to) {
    ranges[name] = { from: from, to: to };
    return loaded[name] ? load([name]) : Promise.resolve();
  }
  function rangeOf(name) { return ranges[name]; }

  /* ---- Generic helpers ------------------------------------------------------ */
  function find(collection, id) {
    const list = db[collection] || [];
    for (let i = 0; i < list.length; i += 1) if (String(list[i].id) === String(id)) return list[i];
    return null;
  }
  function nowStamp() { return isoDateTime(new Date()); }
  /** A person's name in both languages, for messages. */
  function names(person) {
    if (!person) return { en: '', ar: '' };
    const en = person.name || person.full_name || '';
    return { en: en, ar: person.name_ar || en };
  }

  /* ---- The application form ---- */
  /** The form's fields in the order applicants see them: by section, then by position. */
  function formFields() {
    return db.application_form.slice().sort(function (a, b) {
      return config.formSections.indexOf(a.section) - config.formSections.indexOf(b.section) || a.position - b.position;
    });
  }
  /** The standard wording of a built-in field, for answers to a field that was later removed. */
  function defaultField(key) { return defaultForm().filter(function (f) { return f.key === key; })[0] || null; }

  /* ---- Rooms and stays (read only; changes go through the API) ---- */
  function activeAllocations() { return db.allocations.filter(function (a) { return a.status === 'active'; }); }
  function occupants(roomId) {
    return activeAllocations().filter(function (a) { return a.room_id === Number(roomId); });
  }
  function allocationOf(studentId) {
    return activeAllocations().filter(function (a) { return a.student_id === Number(studentId); })[0] || null;
  }
  function roomOfStudent(studentId) {
    const a = allocationOf(studentId);
    return a ? find('rooms', a.room_id) : null;
  }
  /** Maintenance, unavailable or uninhabitable: no new residents. */
  function isClosed(room) { return !!room && config.closedRoomStates.indexOf(room.status) > -1; }
  function roommates(studentId) {
    const a = allocationOf(studentId);
    if (!a) return [];
    return occupants(a.room_id).filter(function (x) { return x.student_id !== Number(studentId); })
      .map(function (x) { return find('students', x.student_id); }).filter(Boolean);
  }
  function medicalProfile(studentId) {
    return db.medical_profiles.filter(function (x) { return x.student_id === Number(studentId); })[0] ||
      { student_id: Number(studentId), blood_type: '', allergies: '', conditions: '', medications: '', emergency_name: '', emergency_relation: 'father', emergency_phone: '', updated_at: null };
  }

  /** Academic years to offer in filters: every year on record plus this one and the next, newest first. */
  function academicYears() {
    const now = currentTerm().year;
    const years = {};
    years[now] = true;
    years[now + 1] = true;
    (db.settings.academic_years || []).forEach(function (y) { years[y] = true; });
    db.applications.concat(db.allocations).forEach(function (r) { if (r.academic_year) years[r.academic_year] = true; });
    return Object.keys(years).map(Number).sort(function (a, b) { return b - a; });
  }

  /* ---- Meals (the server enforces the same rules) ---- */
  /** The moment requests close for a service day: the day before, at the cutoff time. */
  function mealDeadline(isoDay) {
    const p = String(db.settings.meal_cutoff || config.defaultCutoff).split(':').map(Number);
    const d = parseDate(addDays(isoDay, -1));
    d.setHours(p[0] || 0, p[1] || 0, 0, 0);
    return d;
  }
  function mealOpen(isoDay) { return Date.now() < mealDeadline(isoDay).getTime(); }
  function menusFor(isoDay, meal) {
    const order = { main: 0, vegetarian: 1, light: 2 };
    return db.menus.filter(function (m) { return m.date === isoDay && (!meal || m.meal === meal); })
      .sort(function (a, b) { return order[a.type] - order[b.type]; });
  }
  /** Portions requested for a day, per meal: { breakfast, lunch, dinner, total, students }. */
  function mealCounts(isoDay) {
    if (db.mealCounts[isoDay]) return db.mealCounts[isoDay];
    const out = { total: 0, students: 0 };
    const who = {};
    config.meals.forEach(function (meal) { out[meal.key] = 0; });
    db.orders.forEach(function (o) {
      if (o.date !== isoDay || o.status !== 'reserved') return;
      out[o.meal] += o.portions;
      out.total += o.portions;
      who[o.student_id] = true;
    });
    out.students = Object.keys(who).length;
    return out;
  }

  /* ---- Figures for the dashboard and the menu badges (calculated by the server) ---- */
  const NO_STATS = {
    residents: 0, beds: 0, occupancy: 0, rooms: 0, emptyRooms: 0, maintenanceRooms: 0, students: 0, pendingTickets: 0,
    inProgressTickets: 0, pendingApplications: 0, waitingForRoom: 0, pendingLeaves: 0, pendingSwaps: 0, pendingHealth: 0,
    openEmergencies: 0, complaintsByStatus: { pending: 0, in_progress: 0, resolved: 0 }, wings: [],
  };
  function stats() { return db.stats || NO_STATS; }

  DMS.data = {
    config: config,
    get db() { return db; },
    load: load,
    refresh: refresh,
    setRange: setRange,
    rangeOf: rangeOf,
    find: find,
    formFields: formFields,
    defaultField: defaultField,
    names: names,
    now: nowStamp,
    occupants: occupants,
    allocationOf: allocationOf,
    roomOfStudent: roomOfStudent,
    isClosed: isClosed,
    termOf: termOf,
    termDates: termDates,
    currentTerm: currentTerm,
    academicYears: academicYears,
    mealDeadline: mealDeadline,
    mealOpen: mealOpen,
    menusFor: menusFor,
    mealCounts: mealCounts,
    roommates: roommates,
    medicalProfile: medicalProfile,
    stats: stats,
    dates: { iso: isoDate, isoDateTime: isoDateTime, parse: parseDate, addDays: addDays, today: today, between: daysBetween },
  };
})(window);
