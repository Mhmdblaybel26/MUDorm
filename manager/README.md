# MU Dorm — Admin / Dorm Manager console (Phase 1, frontend)

The administrator side of the Al Maaref University Dormitory Management System.
Plain HTML5, CSS3 and vanilla JavaScript: no backend, no framework, no build step.
English by default, Arabic with a full right-to-left layout, light and dark themes.

The dormitory is free: there is no payment, fee, invoice or billing feature anywhere.

## Open it

- serve the project folder, for example `python -m http.server 5500` in `MUDormFile/`, then open
  `http://localhost:5500/login/` (or the **Log in** button on the homepage), or
- double-click `../login/index.html` (works from disk).

Students and the dorm manager share **one log-in page**, `../login/`. Log in there with the sample
administrator account (the same one Phase 4 seeds): username **admin** (or its e-mail), password
**Admin@12345**. The page sees that it is the admin account and opens `dashboard.html`.
`/manager/` and `index.html` in this folder only forward to the dashboard, which sends a visitor who is
not logged in to the log-in page. Signing out also goes back there.
Students are written to at their personal e-mail (for example `name@gmail.com`). The dorm office's own address is `housingEmail` in `js/data.js` (`mudorm.office@gmail.com`); e-mails to students are sent from it.
Fonts load from Google Fonts when online; without a connection the system fonts are used.

## The 15 sections

| # | Page | What you can do |
|---|------|-----------------|
| 1 | `dashboard.html` | Residents, occupancy rate, empty rooms, pending tickets, pending applications; occupancy-by-wing bar chart and complaints-by-status ring chart (inline SVG, each with a "View as table" twin); recent activity; "needs attention" list and today's lunch count |
| 2 | `applications.html` | Status chips, search, status and room-type filters, pagination. Detail modal shows every form field. Accept (asks the day and time of the meeting at the dorm office, creates the student account with a unique temporary password, and Laravel e-mails one welcome message with the meeting, username and password from the dorm's Gmail to the address in the application), reject (note required) or **delete**. Shows the semester applied for and follows the term switch. The detail view lists every answer under the form's sections (names in English and Arabic, parents' names, date of birth with age, the office's own questions); answers to questions removed later stay readable under "Questions no longer on the form" |
| 3 | `students.html` | Student accounts (created from accepted applications): **edit** a student's personal, study, medical and emergency details (students can only view them), reset a password (shows a new temporary one), disable or enable an account, and **E-mail** a student (a message sent at once to the student's personal address, for example `name@gmail.com`, given in the application or typed when adding the student). Search, status and faculty filters, pagination. **Excel (CSV)** and **PDF** buttons export the students shown (search and filters applied): IDs, names in both languages, gender, faculty, major, year, room, phone, e-mail, account status |
| 4 | `rooms.html` | Create, edit, delete rooms: number, wing, type, capacity, status, photo upload with preview, notes |
| 5 | `allocation.html` | Assign or reassign a student for a year and semester (the dates fill in) or for any dates. A full room or a room under maintenance is refused with a clear error. End a stay |
| 6 | `meal-menus.html` | Menu of the three daily meals (breakfast, lunch, dinner; a main, a vegetarian and a light dish each), week grid per meal, create/edit/delete dishes (the name is typed once, in Arabic or English); "Tomorrow" card (is the menu posted, portions requested so far); request deadline (default 20:00 the day before). **Meal summary** button: pick the days (tomorrow, the week shown, the last 7 days, or any dates) and export the portions per day, meal and dish as **Excel (CSV)** or **PDF** (this replaced the separate Meal Summary page) |
| 7 | `complaints.html` | Ticket list; change status (Pending / In progress / Resolved), assign a technician, add notes; full history per ticket |
| 8 | `leave-requests.html` | Approve or reject departure/return requests with an optional note |
| 9 | `room-swaps.html` | Approve or reject swaps with an optional note; approval exchanges the two allocations |
| 10 | `announcements.html` | Create, edit, delete, pin. Title and message are typed once, in Arabic or English; students reading the other language see an automatic translation. Students are alerted at once, without reloading |
| 11 | `room-ratings.html` | Monthly cleanliness and discipline scores (1–10) with comments; averages per room and full history |
| 12 | `settings.html` | Name, personal username, optional own e-mail, profile picture with preview, password change with live rules, language, theme, sound effects and browser notifications, technicians, and the **E-mail** card (is Gmail sending set up and from which address, a **Send test** button, the latest e-mails with the reason of any failure). Two columns of cards |
| 13 | `rules.html` | Rules and guidelines: add, edit, delete and reorder (up / down). Typed once in either language. Students read them on their **Rules** page and are notified of every change |
| 14 | `health.html` | The dorm's emergency line, the on-site doctor and clinic hours (shown to students); consultation requests from students (status chips, schedule an appointment, the doctor's note, done or cancelled; the student is notified); every resident's **health profile** (blood type, allergies, conditions, medication, emergency contact), edited here only |
| 15 | `application-form.html` | The housing **application form** on the homepage: add a field (short or long text, number, date, e-mail, phone, drop-down list, choice buttons, tick box) to any section, reword any question and its help text, make it required or optional, move it up or down, move it to another section, delete it. The homepage form changes at once. Questions and choices are kept in English and Arabic; a language left empty is translated automatically. **System** fields (names, university ID, e-mail, phone, gender, major, year, semester, room type, consent) create the student's account: they can be reworded and moved, never deleted or made optional. **Restore the standard form** brings the original back |

## Rules the frontend enforces (Phase 4 enforces them again on the server)

- A room never receives more residents than its capacity; rooms under maintenance accept nobody.
- Reassigning a student ends the old allocation and frees that bed.
- Room capacity can never drop below the current residents; a room with residents cannot be deleted.
- "Full" is set automatically from the number of residents.
- Students cannot sign up: an account is created only when an application is accepted. The username is the
  university ID; the first password is temporary and must be changed at the first sign-in.
- An account with an active room allocation cannot be disabled.
- One dish per menu type per day; a dish that already has reservations keeps its date.
- One rating per room per month; scores are whole numbers from 1 to 10.
- A swap is refused if either student changed room since the request.
- Rejecting an application needs a note; resolving a ticket needs a note.

## Files

```
manager/
  index.html             forwards to dashboard.html (the log-in page is ../login/)
  dashboard.html ... application-form.html   one page per section (15)
  css/base.css           design tokens (light + dark), reset, utilities
  css/layout.css         sidebar, top bar, page header, drawer, log-in page layout
  css/components.css     buttons, cards, tables, forms, modals, toasts, charts ...
  css/rtl.css            Arabic typography and RTL-only details
  js/i18n.js             ALL interface text (en + ar), formatting, storage wrapper
  js/translate.js        automatic translation of typed text (MyMemory), with a cache
  js/sound.js            short sound effects (Web Audio), with an on/off switch
  js/icons.js            inline SVG icon set
  js/data.js             sample data + business rules (allocate, swap, stats)
  js/app.js              shell (sidebar, top bar), auth guard, toasts, modals, forms, list helper
  js/charts.js           SVG bar and ring charts
  js/<page>.js           one script per page
  assets/logo.svg        the modern logo (with the Arabic name); logo-mark.svg is the small version
  assets/logoM.png       copied unchanged from ../main page/LogoM.png (the original, kept as it is)
  assets/favicon.svg
```

## Data and storage

- Sample data lives in `js/data.js` and mirrors the Phase 4 tables (`students` = users with the
  student role, `applications`, `rooms`, `allocations`, `menus`, `orders`, `complaints`, `leaves`,
  `swaps`, `announcements`, `ratings`, `rules`, `health_requests`). Field names are snake_case to match Laravel.
  The housing application form itself is data too (`application_form`, one record per field).
  The data version is 9; when it changes, the sample data is created again.
- Changes are kept in `localStorage` (`dms.data.v1`) so every page sees them. **Settings → Reset
  sample data** restores the originals. Language (`dms.lang`) and theme (`dms.theme`) are remembered.
  All storage access is wrapped in try/catch; if storage is blocked, pages still work but forget changes.
- Dates are generated relative to the day the sample data is created, so the demo always looks current.

## Porting to Laravel + Blade (Phase 4)

- The `<aside id="sidebar">` and `<header id="topbar">` drawn by `app.js` become `partials/sidebar` and
  `partials/topbar` in `layouts/admin.blade.php`; each page's `<main>` becomes `@section('content')`.
- `data-i18n="rooms.add"` becomes `{{ __('rooms.add') }}`; the `translations` object splits into
  `lang/en/*.php` and `lang/ar/*.php`.
- `DMS.data.allocate()` / `swapRooms()` describe the server-side services and validation rules.
- The sample password is stored as plain text only because there is no server; Laravel hashes it.

## Shared with the public website (Phase 2)

- `../main page/` and `../login/` use this folder's `css/base.css`, `components.css`, `layout.css`,
  `rtl.css`, `js/icons.js` and `js/data.js`, so everything shares one design system and one set of
  sample data.
- Applications sent from the homepage appear on **Applications**. Accepting one creates the account
  the student uses at `../login/`.
- Sample students log in at `../login/`, the same page as the manager, with their university ID and the password `Student@123`;
  Kawthar Saad (`24120874`) and Mostafa Hoteit (`24110935`) still have temporary passwords
  (`Mu@40517kq`, `Mu@93126tz`). Passwords are plain text only in this frontend demo.

## Shared with the student portal (Phase 3)

- `../students/` loads this folder's CSS and scripts; `app.js` draws the portal's simpler sidebar
  when a page has `<body data-area="student">`, and `i18n.js` holds the portal text too.
- Ticket, leave and swap requests from students appear on the matching pages here. Decisions made
  here (and room allocations and announcements) send the student a notification.
- The data model gained `academic_logs`, `medical_profiles`, `notifications` and `emails`; menus and
  orders carry a `meal`, orders a number of `portions`, students an `avatar` (data version 6).

## Meals: how requests work

- Three meals a day: breakfast 06:00–10:00, lunch 13:00–16:00, dinner 18:00–21:00 (`config.meals` in `js/data.js`).
- The dorm office posts each day's menu in advance. A student requests dishes for a day until the
  **deadline: 20:00 on the day before** (`settings.meal_cutoff`, changed on Meal Menus, 12:00–23:00).
  One deadline for all three meals, the evening before, because breakfast is served at 06:00 and the
  kitchen needs one shopping and preparation list per day.
- Up to **two portions per meal** per student (`config.maxPortions`): two of one dish or one each of two.
- After the deadline the requests are locked; **Meal Menus → Meal summary** exports the final numbers per meal and dish.
- A dish that was already requested keeps its date and its meal; deleting it cancels its requests.

## Accounts, passwords and the welcome e-mail

- Accepting an application creates the account. The temporary password is checked against every
  temporary password issued before and every password in use, so no two students get the same one.
- A welcome e-mail (English and Arabic, signed by the Housing Administration) with the username and
  the temporary password is addressed to the e-mail in the application and kept in `db.emails`.
  **There is no mail server in the frontend phases**, so nothing is delivered automatically: the
  message is shown on the accepted application, with "Open in mail app" (starts an e-mail to the
  student and copies the text) and "Copy message". Phase 4 sends it with Laravel Mail.
- Only the dorm office edits a student's details. The student is notified in the portal when they change.

## Academic year and semester

- A year has three semesters: Fall (Sept–Jan), Spring (Feb–mid June), Summer (mid June–Aug). The year is
  named by the year it starts in: 2026 is 2026–2027.
- The switch in the top bar (in the drawer on phones) chooses the year and semester. Applications,
  room stays, tickets, leave and swap requests, health requests and ratings follow it.
  The dashboard always shows today. The choice is remembered (`dms.term`).

## Typed once, read in either language

- Announcements, dishes, rules, clinic details and everything students type (tickets, requests,
  symptoms) and office notes are typed once, in Arabic or English. The language is detected; the other
  language is filled by **MyMemory**, a free online translation service (`js/translate.js`), and the
  result is cached in `db.translations` so each text is translated once.
- The free service allows about 5,000 characters a day. Offline or over the limit, readers see the
  text as it was written. Phase 4 can call a translation API from Laravel instead.
- The housing application is the exception: it is stored as the applicant wrote it.

## Live updates, sound and e-mail links

- Every open page listens for changes made in another tab (`storage` event) and redraws at once: a
  student sees a new announcement, the clinic's answer or a decision without reloading. New alerts
  ring the bell, play a short sound and, when the tab is in the background and the student allowed it,
  show a desktop notification. Phase 4 replaces this with polling or broadcasting.
- Sound effects can be switched off in Settings or in the account menu (`dms.sound`).
- Every e-mail address opens the mail program (`mailto:`) and every phone number the dialler (`tel:`).
- E-mail addresses: each student's own personal address (unique per account); the administrator's optional own address;
  dorm office `mudorm.office@gmail.com` (the sender of every e-mail).

## Not done in this phase

- No real authentication or e-mail sending (Phase 4).
- **Exports.** Excel exports are CSV files (UTF-8, open directly in Excel with Arabic intact). PDF exports
  open the browser's print window with a clean A4 report (logo, title, key figures, table, in the page's
  language); choose **Save as PDF** as the printer. The browser shapes Arabic correctly, which PDF
  libraries running in the page do not. Phase 4 can produce the same reports on the server with dompdf.
- Tested in Chromium at 400–1400 px, English and Arabic, light and dark. Not tested in Firefox or
  Safari, or with a screen reader.
