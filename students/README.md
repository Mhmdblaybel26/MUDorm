# MU Dorm — Student portal (Phase 3, frontend)

The resident side of the Al Maaref University Dormitory Management System. Same design system as
the admin console (`../manager/`), with a simpler sidebar. Plain HTML5, CSS3 and vanilla JavaScript:
no backend, no framework, no build step. English by default, Arabic with a full right-to-left layout,
light and dark themes.

The dormitory is free: there is no payment, fee, invoice or billing feature anywhere.

## Open it

1. Serve the project folder, for example `python -m http.server 5500` in `MUDormFile/`
   (double-clicking the files also works, but the QR code needs the internet).
2. Open `http://localhost:5500/login/` and sign in as a student. Students never open the portal
   directly: the portal sends anyone who is not signed in back to the log-in page.

| Who | Username | Password | What you see |
|-----|----------|----------|--------------|
| Ali Fakih | `22110457` | `Student@123` | A resident of room A-101 with tickets, requests and study data |
| Kawthar Saad | `24120874` | `Mu@40517kq` (temporary) | Must choose a new password first, then the portal with no room yet |
| Mostafa Hoteit | `24110935` | `Mu@93126tz` (temporary) | Same as Kawthar, waiting for a bed |

Every other sample student uses `Student@123`.

## The 10 pages

| Page | What the student can do |
|------|-------------------------|
| `index.html` — My housing | Room number, wing, floor, type and stay dates; beds taken; roommate profiles; at a glance (tomorrow's meals, open tickets, pending requests, new announcements); the **digital dorm pass** with a QR code, a pass code and a full-screen view; **Print housing card** (front and back, bank-card size, with photo and QR) |
| `meals.html` — Meals | Today's three meals with what was requested and which one is being served; pick a day (tomorrow + 6) and choose dishes for breakfast, lunch and dinner with − / + buttons, **up to two portions per meal**; every change is saved at once and can be changed or cancelled until the deadline (20:00 the day before by default). A **live countdown** shows the time left for tomorrow; when it reaches zero the day locks. Allergy reminder. Request history |
| `progress.html` — Study progress | Study hours: log, edit, delete; weekly goal with progress bar; 7-day bar chart with a "View as table" twin. Courses: add, edit, delete, mark completed. Achievements (certificate, award, competition, volunteering, skill): add, edit, delete |
| `maintenance.html` — Maintenance | Open a ticket (plumbing, electricity, noise, other) with a description and an optional photo; status steps (sent, in progress, resolved), technician, full history. Edit or withdraw while still pending. Status chips, search, filter |
| `leave.html` — Leave requests | Departure and return dates, destination, reason; nights counted live; edit or withdraw while pending; the office's note after a decision |
| `swap.html` — Room swap | Choose a resident of the same gender in another room, see both rooms side by side, give a reason. One pending request at a time, withdraw while pending. Also lists requests other residents made with you |
| `announcements.html` — News and alerts | Dorm news (pinned first, new ones marked) and the student's own notifications, with "mark all as read". Every item has a **Details** button: news opens in full; a notification shows what it is about (the announcement, the rule, the clinic's answer) and a link to the page where the student acts on it. The bell's alerts open here (`#alert-<id>`) |
| `health.html` — Health | **Emergency**: the dorm's emergency line as a one-tap call button, the public numbers (Red Cross 140, Civil Defense 125, Police 112, Fire 175) and the clinic's hours. **Ask to see the doctor**: normal or urgent (urgent shows the hotline again), symptoms; follow the appointment and the doctor's note; cancel while pending. **My health profile**, view only |
| `rules.html` — Rules & guidelines | The dorm rules as the office keeps them, with search and the date of the last change |
| `settings.html` — Settings | Two tabs. **Settings**: profile photo (upload, preview, remove), theme and language, password change with live rules, sound effects and desktop notifications. **My profile** (`settings.html#profile`): account, contact and study details, **view only**; the dorm office changes them. `profile.html` now only forwards here |

## How it connects to the admin console

Both sides use the same sample data (`../manager/js/data.js`, stored in the browser as `dms.data.v1`),
so a change on one side shows on the other at once, without reloading (see the admin README, "Live updates"):

- Tickets, leave requests and swap requests the student sends appear on the admin **Complaints**,
  **Leave Requests** and **Room Swaps** pages, and in the admin activity feed.
- When the office assigns a technician, changes a ticket's status, decides a leave or swap request,
  allocates or ends a room, or publishes an announcement, the student gets a notification in the bell.
- Menus and the request deadline come from the admin **Meal Menus** page; requested portions count in its **Meal summary** export.
- Personal, medical and emergency details start from the housing application. Only the dorm office
  changes them (admin **Students** page, Edit, and **Health**); the student sees them on **My profile** and **Health**.
- Health requests appear on the admin **Health** page; the clinic's appointment and note come back here.
- Rules come from the admin **Rules** page; each change sends the student an alert.
- The year and semester switch in the top bar (in the drawer on phones) filters tickets, leave and swap
  requests, health requests, meal history and news. Pinned news is always shown.

## Live alerts (simulated)

While a student browses, a few realistic alerts arrive in the top-bar bell (the badge rings and a
toast appears): a meal-request reminder, a planned maintenance visit and the monthly room rating. The first
comes after 20 seconds, then one a minute, each kind once per browser session. In Phase 4 the bell
reads the Laravel `notifications` table instead.

## Files

```
students/
  index.html … settings.html  one page per section (10), plus profile.html, which forwards to settings.html#profile
  css/portal.css              portal-only components (room card, pass, day picker, tickets …)
  js/portal.js                shared helpers: signed-in student, meal requests, pass code and QR, live alerts
  js/<page>.js                one script per page
```

The pages load the admin console's shared files from `../manager/` (`css/base.css`, `layout.css`,
`components.css`, `rtl.css`, `js/i18n.js`, `icons.js`, `data.js`, `app.js`, `charts.js`). `app.js`
draws the student sidebar and top bar because each page has `<body data-area="student">`. All portal
text is in `../manager/js/i18n.js` under the `snav.`, `shome.`, `smeal.`, `sprog.`, `smaint.`,
`sleave.`, `sswap.`, `sann.`, `shealth.`, `srules.`, `sprof.`, `sset.` and `snotif.` keys.

The QR code is drawn by `qrcode-generator` 1.4.4 from cdnjs (pinned version with an integrity hash).
Without a connection the pass still shows its text code.

## Printing the housing card

**My housing → Print housing card** opens the browser's print window with only the card on the page:
the front (logo, photo or initials, name in both scripts, university ID, room, major, validity, QR code,
pass code) and the back (card rules, office contact), each 85.6 × 54 mm. Print at 100% scale and cut
along the dashed lines. The button is off until a room is allocated. An ordinary Ctrl+P still prints
the page as usual.

## Porting to Laravel + Blade (Phase 4)

- `layouts/student.blade.php` holds the sidebar and top bar; each page's `<main>` becomes `@section('content')`.
- New tables beside the Phase 1 ones: `academic_logs` (type `study` / `course` / `achievement`),
  `medical_profiles` (one per student) and Laravel's `notifications`.
- The meal deadline and two-portion limit, the "edit only while pending" rules, the swap checks and the leave date checks are
  enforced again in the controllers. The pass code becomes a signed value from the server.

## Not done in this phase

- No real authentication: the session is a browser storage key, and passwords are plain text in the demo data.
- Tested in Chromium at 400–1400 px, English and Arabic, light and dark. Not tested in Firefox or
  Safari, or with a screen reader.
