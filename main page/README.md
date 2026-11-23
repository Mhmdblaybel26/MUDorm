# MU Dorm — public website (Phase 2)

The public homepages of the Al Maaref University student housing, plus the log-in page.
Plain HTML, CSS and vanilla JavaScript. Same design system as the admin console (`../manager/css`).

| File | What it is |
|------|------------|
| `index.html` | Arabic homepage (right-to-left) |
| `engindex.html` | English homepage. Same markup as `index.html`; only `<html lang dir>` differs |
| `i18n.js` | Every visible string of the public pages, in English and Arabic |
| `main.js` | Menu, gallery (carousel, thumbnails, swipe, full-screen view), scroll animations, application form (a popup), sound switch, "Back to top" |
| `MainPage.css` | Homepage sections only; buttons, forms and colours come from `../manager/css/` |
| `illustrations/` | Drawn, animated pictures (SVG) for the overview cards |
| `photos/` | Stock photos (JPG) for the gallery, the hero and the photo band |
| `LogoM.png` | Original university housing logo (file unchanged). The pages show the modern redraw, `../manager/assets/logo.svg` |
| `../login/` | Log in for students and the dorm manager |

## Open it

Double-click `index.html` (Arabic) or `engindex.html` (English). The language button switches between
the two files and remembers the choice for the log-in and admin pages.

## Sections

Header (logo, the five section links and **Log in**) · Hero · Dormitory overview · Rules & guidelines ·
Gallery (rooms, study halls, dining, building) · Housing application form (opens as a popup, see below) · Contact,
with an embedded **Google map** of the dorm and an "Open in Google Maps" link · Footer.

The footer has a **Links** column (Al Maaref University, www.mu.edu.lb, opens in a new tab; this housing
website; the office's e-mail and phone), the copyright line (`© {year}`, the year is filled in by
`main.js`) and **Back to top**. Every e-mail address and phone number is a `mailto:` or `tel:` link.
Under the logo, a **Follow us** row shows Facebook, Instagram, LinkedIn, X and YouTube icons. On hover or
keyboard focus each one fills with its platform's colour.

**Changing the social media addresses:** the links are plain HTML in the footer. Open `index.html`
(Arabic) and `engindex.html` (English), find the comment `SOCIAL MEDIA` near the end, and replace the
address inside each `href="..."`, for example:

```html
<li><a class="social-link" href="https://www.facebook.com/YourPageName" target="_blank" rel="noopener" ...
```

Make the same change in both files. Leave the rest of the line as it is (the icon and the hidden names
for screen readers). To remove a platform, delete its whole `<li> ... </li>` line in both files. Until
you change them, the links open each platform's home page.

"Back to top" and the logo scroll to the very top and move the keyboard focus to the logo. The page
anchor `#top` is on `<body>`: it used to be on the header, which stays fixed at the top while
scrolling, so the link had nowhere to go. On phones the **Log in** button shows only its lock icon so
the header fits on one line.

## The housing application form

The form is **drawn by `main.js` from the list of fields the dorm office keeps** on the admin page
**Application form** (`../manager/application-form.html`), so a question the office adds, rewords,
moves or deletes changes here at once. The standard form asks, in seven sections:

- **Personal details:** first name, father's name and family name, each in English *and* in Arabic
  (side by side), date of birth, place of birth, nationality, gender.
- **Family and emergency contact:** mother's full name in English and Arabic, the emergency contact,
  the relation and the phone number.
- **University ID and contact:** university ID, personal e-mail (for example Gmail), mobile phone, governorate, home
  town, home address.
- **Studies**, **Housing** (semester, room type, reason), **Health** (blood type, medical notes) and
  the **Confirmation** box.

The confirmation sentence ends with **Check it now**: it closes the form (what was typed stays),
scrolls to the Rules & guidelines section, and a **Back to your application** button reopens the form.

English names must be in Latin letters and Arabic names in Arabic letters; the date of birth must give
an age between 16 and 60. Answers are stored as written (no automatic translation). The office's own
questions are stored with a copy of the question, so an answer stays readable if the question changes.

## Accounts: no self sign-up

Students cannot create an account. They apply for housing with the form on the homepage; when the dorm
office **accepts** the application (admin **Applications** page), the student account is created
automatically:

- **Username:** the 8-digit university ID.
- **Password:** a temporary password shown to the dorm office (for example `Mu@40517kq`) to hand over.
- At the first sign-in the student must choose a new password, and can change it again at any time
  on the student portal's **Settings** page.
- The dorm office can reset a password or disable/enable an account on the admin **Students** page.

The dorm manager signs in on the same page with the username `admin`.

## Photos (gallery and backgrounds)

The gallery, the hero background and the photo band above the application form use **free stock
photos from Unsplash** (Unsplash licence: free to use, no permission needed). They are **not photos of
the actual dormitory**; the gallery says "Illustrative photos" under the thumbnails. To use a real
photo, replace the file in `photos/` with one of the same name (JPG, about 1400 × 875 for the gallery,
1920 × 1080 for `hero.jpg` and `campus.jpg`) and update its `gallery.sNAlt` text in `i18n.js`.

| File | Used for | Photo by (unsplash.com) |
|------|----------|-------------------------|
| `room-double.jpg` | Gallery "Double room" | Fazeel PH (`@faseel`) |
| `room-triple.jpg` | Gallery "Triple room" | Loyd Benedict Benedicto (`@benedict_121989`) |
| `study-room.jpg` | Gallery "Floor study room" | RUT MIIT (`@rutmiit`) |
| `study-hall.jpg` | Gallery "Main study hall" | Yue WU (`@samuelwu`) |
| `kitchen.jpg` | Gallery "Shared kitchen" | Rune Enstad (`@runejohs`) |
| `dining.jpg` | Gallery "Dining hall" | Paul Greenberg (`@greenpau`) |
| `building.jpg` | Gallery "Residence building" | Augusto Lopes (`@fromaugusto`) |
| `garden.jpg` | Gallery "Garden" | Bob Jenkin (`@bobj245`) |
| `hero.jpg` | Hero background | Alexandre Lallemand (`@alexandrelallemand`) |
| `campus.jpg` | Photo band above the application form | Porter Raab (`@porterraab`) |

The gallery **scrolls by itself**: a new photo every 5 seconds, with a progress line. It waits while the
pointer or the keyboard focus is on it, while the full-screen view is open and while the tab is hidden.
The pause button stops it for good, and it does not start when the device asks for reduced motion.

## Drawn pictures (overview cards)

The six overview cards use **original drawn illustrations** from `illustrations/`. They are animated: lights turn on in
the building's windows, clouds drift, trees and curtains sway, desk lamps glow, a kettle steams, a tap
drips, the entrance barrier lifts, and a walking route moves on the map. The hero picture also zooms
slowly (ken-burns).

| Picture | Used for |
|---------|----------|
| `building.svg` | Not used on the page any more (kept in the folder) |
| `room-double.svg` | Overview "Furnished rooms" |
| `room-triple.svg` | Not used on the page any more (kept in the folder) |
| `study-room.svg` | Overview "Study halls" |
| `study-hall.svg` | Not used on the page any more (kept in the folder) |
| `kitchen.svg` | Not used on the page any more (kept in the folder) |
| `dining.svg` | Overview "Three meals a day" |
| `garden.svg` | Not used on the page any more (kept in the folder) |
| `safety.svg` | Overview "Safe and calm" |
| `location.svg` | Overview "Close to campus" |
| `maintenance.svg` | Overview "Fast maintenance" |

To use a real photo instead, change the image's `src` in **both** `index.html` and `engindex.html`.

All motion stops when the device asks for reduced motion.

## Visual effects

- A thin teal line under the header shows how far down the page you are.
- The hero text arrives in turn, two soft lights drift behind it, the highlighted word shimmers and
  the dot next to the top label pulses.
- Cards (overview, rules, contact) lift on hover, get a teal edge and a soft light that follows the
  pointer; their icons tilt and grow. The highlighted word of each section title gets an underline
  drawn in when the title scrolls into view.
- The main buttons get a light sheen on hover; the photo band's picture moves a little slower than the
  page (parallax).
- Styles: "Visual effects" at the end of `MainPage.css`; script: `initEffects()` in `main.js`. With
  reduced motion the colours stay and every movement is switched off.

## Changes from the original homepage

- The "Reasonable fees, 70$ per month" card is gone: the dormitory is free.
- No facts table (wings, rooms, beds) in the hero.
- Stray text before `<!doctype>` and after "Contact Us" in the English page is gone.
- The logo path matches the real file name (`LogoM.png`). The logo is shown larger, on its own,
  without a box or text beside it.
- Gold accent replaced by the console's teal; fonts now Plus Jakarta Sans / Sora (English) and Tajawal / Cairo (Arabic).

## Sample accounts (log-in page)

Type them in on the log-in page.

| Who | Username | Password |
|-----|----------|----------|
| Dorm manager | `admin` | `Admin@12345` |
| Student (Ali Fakih) | `22110457` | `Student@123` |
| New student with a temporary password (Kawthar Saad) | `24120874` | `Mu@40517kq` |
| Disabled account (Yara Moghnieh) | `23120518` | `Student@123` |

After signing in, a student goes straight to the student portal (`../students/`, see its README).
