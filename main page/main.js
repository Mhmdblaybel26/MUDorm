/* ==========================================================================
   main.js — behaviour for the public pages.

   Shared (homepages and login/): translations and icons on load, language
   and theme buttons, form helpers (exposed as DMS.site for the log-in page).

   Homepage only: mobile menu, active section in the menu, scroll-reveal
   animation, visual effects (scroll progress, card light, parallax), gallery (carousel + thumbnails + full-screen viewer) and the
   housing application form. A submitted application is saved
   in the same sample data as the admin console, so it appears on the admin
   Applications page.
   ========================================================================== */
(function (global) {
  'use strict';

  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const icon = DMS.icons.icon;
  const data = DMS.data;
  const storage = DMS.storage;
  const root = document.documentElement;
  const byId = function (id) { return document.getElementById(id); };
  // Sound effects (../manager/js/sound.js); silent if the file is missing.
  const sound = DMS.sound || { play: function () {}, enabled: function () { return false; }, toggle: function () {} };

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (ch) { return ESCAPES[ch]; });
  }
  function rtl() { return root.dir === 'rtl'; }

  /* ======================================================================
     Icons, theme and language buttons
     ====================================================================== */
  function hydrateIcons(scope) {
    (scope || document).querySelectorAll('[data-icon]').forEach(function (node) {
      const holder = document.createElement('template');
      holder.innerHTML = icon(node.getAttribute('data-icon'), { size: Number(node.getAttribute('data-size')) || 18 });
      if (holder.content.firstElementChild) node.replaceWith(holder.content.firstElementChild);
    });
  }

  const darkQuery = global.matchMedia('(prefers-color-scheme: dark)');
  function isDark() {
    const choice = storage.get('dms.theme') || 'system';
    return choice === 'dark' || (choice === 'system' && darkQuery.matches);
  }

  let toolsHost = null;
  let toolsMode = 'link';
  /**
   * Draws the language and theme buttons.
   * mode "link": the homepages, where the button opens the other language's file.
   * mode "toggle": the log-in page, where the language switches in place.
   */
  function drawTools(host, mode) {
    toolsHost = host || toolsHost;
    toolsMode = mode || toolsMode;
    if (!toolsHost) return;
    const other = i18n.lang() === 'ar' ? 'en' : 'ar';
    const otherName = other === 'ar' ? 'العربية' : 'English';
    const langControl = toolsMode === 'link'
      ? '<a class="lang-btn" href="' + (other === 'ar' ? 'index.html' : 'engindex.html') + '" lang="' + other + '" hreflang="' + other + '" title="' + esc(t('tools.language')) + '">' + otherName + '</a>'
      : '<button type="button" class="lang-btn" data-site-action="lang" lang="' + other + '" title="' + esc(t('tools.language')) + '">' + otherName + '</button>';
    const themeLabel = t(isDark() ? 'tools.themeLight' : 'tools.themeDark');
    const soundLabel = t(sound.enabled() ? 'tools.soundOff' : 'tools.soundOn');
    toolsHost.innerHTML = langControl +
      '<button type="button" class="icon-btn" data-site-action="sound" aria-pressed="' + sound.enabled() + '" aria-label="' + esc(soundLabel) + '" title="' + esc(soundLabel) + '">' + icon(sound.enabled() ? 'volume' : 'volume-off') + '</button>' +
      '<button type="button" class="icon-btn" data-site-action="theme" aria-label="' + esc(themeLabel) + '" title="' + esc(themeLabel) + '">' + icon(isDark() ? 'sun' : 'moon') + '</button>';
  }

  document.addEventListener('click', function (event) {
    const action = event.target.closest('[data-site-action]');
    if (!action) return;
    if (action.getAttribute('data-site-action') === 'theme') {
      const next = isDark() ? 'light' : 'dark';
      storage.set('dms.theme', next);
      root.setAttribute('data-theme', next);
      drawTools();
      const again = toolsHost && toolsHost.querySelector('[data-site-action="theme"]');
      if (again) again.focus();
    } else if (action.getAttribute('data-site-action') === 'lang') {
      i18n.setLang(i18n.lang() === 'ar' ? 'en' : 'ar');
    } else if (action.getAttribute('data-site-action') === 'sound') {
      sound.toggle();
      drawTools();
      const again = toolsHost && toolsHost.querySelector('[data-site-action="sound"]');
      if (again) again.focus();
    }
  });
  darkQuery.addEventListener('change', function () { drawTools(); });

  /* ======================================================================
     Form helpers (same behaviour as the admin console's DMS.form)
     ====================================================================== */
  const form = {
    values: function (formEl) {
      const out = {};
      Array.prototype.forEach.call(formEl.elements, function (el) {
        if (!el.name || el.disabled || el.type === 'submit' || el.type === 'button' || el.type === 'file') return;
        if (el.type === 'checkbox') out[el.name] = el.checked;
        else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; }
        else out[el.name] = el.value.trim();
      });
      return out;
    },
    clear: function (formEl) {
      formEl.querySelectorAll('.field__error').forEach(function (n) { n.remove(); });
      formEl.querySelectorAll('[aria-invalid="true"]').forEach(function (el) {
        el.removeAttribute('aria-invalid');
        const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(function (id) { return id && id.slice(-6) !== '-error'; });
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
        else el.removeAttribute('aria-describedby');
      });
    },
    /** errors: { name: 'i18n.key' | ['i18n.key', params] }. Returns true when there are errors. */
    show: function (formEl, errors) {
      form.clear(formEl);
      const names = Object.keys(errors);
      names.forEach(function (name) {
        const el = formEl.elements[name];
        if (!el) return;
        const control = el.length && !el.tagName ? el[0] : el;
        const spec = Array.isArray(errors[name]) ? errors[name] : [errors[name]];
        const id = (control.id || name) + '-error';
        const msg = document.createElement('p');
        msg.className = 'field__error';
        msg.id = id;
        msg.setAttribute('data-key', spec[0]);
        if (spec[1]) msg.setAttribute('data-params', JSON.stringify(spec[1]));
        msg.innerHTML = icon('alert', { size: 14 }) + '<span>' + esc(t(spec[0], spec[1])) + '</span>';
        (control.closest('.field') || control.parentNode).appendChild(msg);
        control.setAttribute('aria-invalid', 'true');
        const described = control.getAttribute('aria-describedby');
        control.setAttribute('aria-describedby', (described ? described + ' ' : '') + id);
      });
      if (names.length) {
        const first = formEl.elements[names[0]];
        const control = first && first.length && !first.tagName ? first[0] : first;
        if (control && control.focus) control.focus();
      }
      return names.length > 0;
    },
    retranslate: function () {
      document.querySelectorAll('.field__error[data-key]').forEach(function (node) {
        const params = node.getAttribute('data-params');
        node.querySelector('span').textContent = t(node.getAttribute('data-key'), params ? JSON.parse(params) : undefined);
      });
    },
    isEmail: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); },
    isPhone: function (v) { return /^\+?[0-9][0-9\s-]{6,18}$/.test(v); },
    isArabic: function (v) { return /[؀-ۿ]/.test(v); },
  };

  /** Major <select> grouped by faculty, and the year <select>. */
  function fillStudySelects(majorEl, yearEl) {
    const keepMajor = majorEl.value;
    const keepYear = yearEl.value;
    const majors = data.config.majors;
    majorEl.innerHTML = '<option value="">' + esc(t('apply.majorChoose')) + '</option>' +
      data.config.faculties.map(function (faculty) {
        return '<optgroup label="' + esc(t('faculty.' + faculty)) + '">' + Object.keys(majors).filter(function (k) { return majors[k] === faculty; })
          .map(function (k) { return '<option value="' + k + '">' + esc(t('major.' + k)) + '</option>'; }).join('') + '</optgroup>';
      }).join('');
    let years = '<option value="">' + esc(t('apply.yearChoose')) + '</option>';
    for (let y = 1; y <= 5; y += 1) years += '<option value="' + y + '">' + esc(t('common.yearN', { n: i18n.number(y) })) + '</option>';
    yearEl.innerHTML = years;
    majorEl.value = keepMajor;
    yearEl.value = keepYear;
  }

  /* ======================================================================
     Homepage: header, menu, active section
     ====================================================================== */
  function initHeader() {
    const header = document.querySelector('.site-header');
    const nav = byId('site-nav');
    const toggle = byId('menu-toggle');
    if (!header || !nav || !toggle) return;

    function setMenu(open, restoreFocus) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', t(open ? 'nav.close' : 'nav.open'));
      toggle.innerHTML = icon(open ? 'x' : 'menu');
      if (!open && restoreFocus) toggle.focus();
    }
    toggle.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open'), false); });
    nav.addEventListener('click', function (event) { if (event.target.closest('a')) setMenu(false, false); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) setMenu(false, true);
    });
    document.addEventListener('click', function (event) {
      if (nav.classList.contains('is-open') && !header.contains(event.target)) setMenu(false, false);
    });
    global.matchMedia('(min-width: 761px)').addEventListener('change', function (e) { if (e.matches) setMenu(false, false); });

    // "Back to top" and the logo: scroll to the very top and give the keyboard to the logo link,
    // without adding #top to the address.
    document.addEventListener('click', function (event) {
      const link = event.target.closest('a[href="#top"]');
      if (!link) return;
      event.preventDefault();
      const still = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      global.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
      const brand = header.querySelector('.site-brand');
      if (brand && link !== brand) brand.focus({ preventScroll: true });
    });

    const onScroll = function () { header.classList.toggle('is-scrolled', global.scrollY > 8); };
    global.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Highlight the menu link of the section in view.
    if ('IntersectionObserver' in global) {
      const links = nav.querySelectorAll('.site-nav__links a');
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function (a) {
            if (a.getAttribute('href') === '#' + entry.target.id) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
          });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      links.forEach(function (a) {
        const section = document.querySelector(a.getAttribute('href'));
        if (section) observer.observe(section);
      });
    }
  }


  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in global)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { observer.observe(el); });
  }

  /* ======================================================================
     Visual effects: scroll progress, a light following the pointer on
     cards, and a slower-moving photo band (not when motion is reduced)
     ====================================================================== */
  function initEffects() {
    const header = document.querySelector('.site-header');
    const band = document.querySelector('.photo-band');
    const still = global.matchMedia('(prefers-reduced-motion: reduce)');
    let waiting = false;

    function update() {
      waiting = false;
      const scrollable = document.documentElement.scrollHeight - global.innerHeight;
      if (header) header.style.setProperty('--scroll', scrollable > 0 ? Math.min(1, global.scrollY / scrollable).toFixed(4) : '0');
      if (band) {
        if (still.matches) { band.style.removeProperty('--parallax'); return; }
        const r = band.getBoundingClientRect();
        // Only while the band is on screen: 0 when it is centred, up to about 10% of its height either way.
        if (r.bottom > 0 && r.top < global.innerHeight) {
          const offset = (r.top + r.height / 2 - global.innerHeight / 2) * -0.12;
          band.style.setProperty('--parallax', offset.toFixed(1) + 'px');
        }
      }
    }
    function schedule() {
      if (waiting) return;
      waiting = true;
      global.requestAnimationFrame(update);
    }
    global.addEventListener('scroll', schedule, { passive: true });
    global.addEventListener('resize', schedule);
    update();

    document.addEventListener('pointermove', function (event) {
      const card = event.target.closest && event.target.closest('.feature, .rule, .contact-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (event.clientX - r.left) + 'px');
      card.style.setProperty('--my', (event.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ======================================================================
     Gallery: category filter, carousel, thumbnails, swipe, full-screen view
     ====================================================================== */
  function initGallery() {
    const stage = byId('carousel-stage');
    if (!stage) return;
    const slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
    const thumbs = byId('thumbs');
    const status = byId('carousel-status');
    const lightbox = byId('lightbox');
    let visible = slides;
    let index = 0;

    const titleOf = function (slide) { return slide.querySelector('.slide__caption strong').textContent; };
    const textOf = function (slide) { return slide.querySelector('.slide__caption span').textContent; };
    const imgOf = function (slide) { return slide.querySelector('img'); };

    function drawThumbs() {
      thumbs.innerHTML = visible.map(function (slide, i) {
        const img = imgOf(slide);
        return '<button type="button" class="thumb-btn" data-i="' + i + '" aria-label="' +
          esc(t('gallery.status', { n: i18n.number(i + 1), total: i18n.number(visible.length), title: titleOf(slide) })) + '">' +
          '<img src="' + esc(img.getAttribute('src')) + '" alt="" loading="lazy"></button>';
      }).join('');
    }

    function drawLightbox() {
      const slide = visible[index];
      const img = imgOf(slide);
      const big = byId('lightbox-img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      byId('lightbox-caption').innerHTML = '<strong>' + esc(titleOf(slide)) + '</strong><span>' + esc(textOf(slide)) + '</span>';
      byId('lightbox-count').textContent = t('gallery.slideOf', { n: i18n.number(index + 1), total: i18n.number(visible.length) });
    }

    function show(i, announce) {
      index = (i + visible.length) % visible.length;
      slides.forEach(function (slide) {
        const pos = visible.indexOf(slide);
        const active = pos === index;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
        if (pos > -1) slide.setAttribute('aria-label', t('gallery.slideOf', { n: i18n.number(pos + 1), total: i18n.number(visible.length) }));
      });
      byId('carousel-count').textContent = i18n.number(index + 1) + ' / ' + i18n.number(visible.length);
      thumbs.querySelectorAll('.thumb-btn').forEach(function (b) {
        if (Number(b.getAttribute('data-i')) === index) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
      // Keep the current thumbnail in view by scrolling the strip itself, never the page.
      const current = thumbs.querySelector('[aria-current="true"]');
      if (current) {
        const box = thumbs.getBoundingClientRect();
        const item = current.getBoundingClientRect();
        if (item.left < box.left || item.right > box.right) {
          thumbs.scrollBy({ left: item.left + item.width / 2 - (box.left + box.width / 2), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        }
      }
      if (announce) {
        status.textContent = t('gallery.status', { n: i18n.number(index + 1), total: i18n.number(visible.length), title: titleOf(visible[index]) });
      }
      if (lightbox.open) drawLightbox();
      schedule();
    }

    /* ---- Auto-scroll ----
       The gallery moves to the next photo every 5 seconds. It waits while the
       pointer or the keyboard focus is on it, while the full-screen view is
       open and while the tab is hidden, and it stops for good when the visitor
       presses pause. It does not start when the device asks for reduced motion. */
    const AUTO_MS = 5000;
    const carousel = byId('carousel');
    const playBtn = byId('carousel-play');
    const progress = byId('carousel-progress');
    const reduceMotion = global.matchMedia('(prefers-reduced-motion: reduce)');
    let playing = !reduceMotion.matches;
    let hovering = false;
    let focused = false;
    let timer = null;

    function drawPlay() {
      const label = t(playing ? 'gallery.pause' : 'gallery.play');
      playBtn.setAttribute('aria-pressed', String(playing));
      playBtn.setAttribute('aria-label', label);
      playBtn.title = label;
      playBtn.innerHTML = icon(playing ? 'pause' : 'play', { size: 18 });
    }
    /** (Re)starts the wait for the next photo, or cancels it when the gallery should stand still. */
    function schedule() {
      global.clearTimeout(timer);
      const run = playing && !hovering && !focused && !lightbox.open && !document.hidden && visible.length > 1;
      // Restart the progress line from zero.
      progress.classList.remove('is-running');
      if (!run) return;
      void progress.offsetWidth;
      progress.classList.add('is-running');
      timer = global.setTimeout(function () { show(index + 1, false); }, AUTO_MS);
    }

    function setFilter(filter) {
      visible = filter === 'all' ? slides : slides.filter(function (s) { return s.getAttribute('data-cat') === filter; });
      byId('gallery-filters').querySelectorAll('[data-filter]').forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(chip.getAttribute('data-filter') === filter));
      });
      drawThumbs();
      show(0, true);
    }

    function openLightbox() {
      lightbox._opener = document.activeElement;
      drawLightbox();
      lightbox.showModal();
      schedule();
    }

    byId('gallery-filters').addEventListener('click', function (event) {
      const chip = event.target.closest('[data-filter]');
      if (chip) setFilter(chip.getAttribute('data-filter'));
    });
    byId('carousel-prev').addEventListener('click', function () { show(index - 1, true); });
    byId('carousel-next').addEventListener('click', function () { show(index + 1, true); });
    byId('carousel-expand').addEventListener('click', openLightbox);
    playBtn.addEventListener('click', function () {
      playing = !playing;
      drawPlay();
      schedule();
    });
    carousel.addEventListener('pointerenter', function (event) { if (event.pointerType === 'mouse') { hovering = true; schedule(); } });
    carousel.addEventListener('pointerleave', function () { hovering = false; schedule(); });
    // Only keyboard focus holds the gallery; a mouse click on a button must not stop it for good.
    carousel.addEventListener('focusin', function (event) { focused = event.target.matches(':focus-visible'); schedule(); });
    carousel.addEventListener('focusout', function (event) {
      if (!carousel.contains(event.relatedTarget)) { focused = false; schedule(); }
    });
    document.addEventListener('visibilitychange', schedule);
    i18n.onChange(drawPlay);
    thumbs.addEventListener('click', function (event) {
      const b = event.target.closest('.thumb-btn');
      if (b) show(Number(b.getAttribute('data-i')), true);
    });

    // Arrow keys follow reading direction: in Arabic, the left arrow goes forward.
    function arrowStep(key) {
      if (key === 'ArrowRight') return rtl() ? -1 : 1;
      if (key === 'ArrowLeft') return rtl() ? 1 : -1;
      return 0;
    }
    stage.addEventListener('keydown', function (event) {
      const step = arrowStep(event.key);
      if (step) { event.preventDefault(); show(index + step, true); }
      else if (event.key === 'Home') { event.preventDefault(); show(0, true); }
      else if (event.key === 'End') { event.preventDefault(); show(visible.length - 1, true); }
      else if (event.key === 'Enter') { event.preventDefault(); openLightbox(); }
    });

    // Swipe on touch screens; a tap opens the full-screen view.
    let startX = null;
    let swiped = false;
    stage.addEventListener('pointerdown', function (event) { startX = event.clientX; swiped = false; });
    stage.addEventListener('pointerup', function (event) {
      if (startX === null) return;
      const dx = event.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 48) {
        swiped = true;
        const forward = rtl() ? dx > 0 : dx < 0;
        show(index + (forward ? 1 : -1), true);
      }
    });
    stage.addEventListener('click', function (event) {
      if (!swiped && event.target.closest('.slide img')) openLightbox();
    });

    byId('lightbox-close').addEventListener('click', function () { lightbox.close(); });
    byId('lightbox-prev').addEventListener('click', function () { show(index - 1, true); });
    byId('lightbox-next').addEventListener('click', function () { show(index + 1, true); });
    lightbox.addEventListener('keydown', function (event) {
      const step = arrowStep(event.key);
      if (step) { event.preventDefault(); show(index + step, true); }
    });
    lightbox.addEventListener('click', function (event) { if (event.target === lightbox) lightbox.close(); });
    lightbox.addEventListener('close', function () {
      if (lightbox._opener && document.contains(lightbox._opener)) lightbox._opener.focus();
      schedule();
    });

    drawPlay();
    drawThumbs();
    show(0, false);
  }

  /* ======================================================================
     Housing application form (a popup: every "Apply" link or button opens it)
     ====================================================================== */
  /** The semesters a student can apply for: the current one and the next two. */
  function fillTermSelect(select) {
    const keep = select.value;
    const next = function (tm) {
      return tm.semester === 'fall' ? { year: tm.year, semester: 'spring' } : tm.semester === 'spring' ? { year: tm.year, semester: 'summer' } : { year: tm.year + 1, semester: 'fall' };
    };
    const first = data.currentTerm();
    const second = next(first);
    select.innerHTML = '<option value="">' + esc(t('apply.termChoose')) + '</option>' +
      [first, second, next(second)].map(function (tm) {
        return '<option value="' + tm.year + '|' + tm.semester + '">' +
          esc(t('term.name', { semester: t('semester.' + tm.semester), year: tm.year + '–' + (tm.year + 1) })) + '</option>';
      }).join('');
    select.value = keep;
  }

  /* ---- The form's fields, drawn from the list the dorm office keeps (data.formFields) ---- */
  /** A field's label, hint or placeholder in the page language (the other language if that one is empty). */
  function fieldText(field, base) {
    const lang = i18n.lang();
    return field[base + '_' + lang] || field[base + '_' + (lang === 'ar' ? 'en' : 'ar')] || '';
  }
  function optionText(option) { return i18n.lang() === 'ar' ? option.ar || option.en : option.en || option.ar; }
  const AUTOCOMPLETE = { first_name_en: 'given-name', last_name_en: 'family-name', email: 'email', phone: 'tel', date_of_birth: 'bday' };
  // Full width: long answers and groups of choices; everything else shares a row.
  function isWide(field) { return field.type === 'textarea' || field.type === 'radio' || field.type === 'checkbox' || field.key === 'term'; }

  function controlHtml(field, id, describedBy) {
    const name = ' id="' + id + '" name="' + esc(field.key) + '"' + (field.required ? ' required' : '') +
      (describedBy ? ' aria-describedby="' + describedBy + '"' : '');
    const dir = field.lang === 'ar' ? ' lang="ar" dir="rtl"' : field.lang === 'en' ? ' lang="en" dir="ltr"'
      : field.ltr || field.type === 'email' || field.type === 'tel' || field.type === 'number' || field.type === 'date' ? ' dir="ltr"' : ' dir="auto"';
    const placeholder = fieldText(field, 'placeholder');
    const extra = (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
      (AUTOCOMPLETE[field.key] ? ' autocomplete="' + AUTOCOMPLETE[field.key] + '"' : '') +
      (field.key === 'university_id' ? ' inputmode="numeric" maxlength="8"' : '');
    if (field.type === 'textarea') return '<textarea class="control"' + name + dir + ' maxlength="800" rows="4"></textarea>';
    if (field.type === 'select') {
      // Majors, years and semesters are filled in by fillStudySelects / fillTermSelect.
      const options = field.options ? '<option value="">' + esc(t('apply.choose')) + '</option>' + field.options.map(function (o) {
        return '<option value="' + esc(o.value) + '">' + esc(optionText(o)) + '</option>';
      }).join('') : '';
      return '<select class="control"' + name + '>' + options + '</select>';
    }
    const type = { number: 'number', date: 'date', email: 'email', tel: 'tel' }[field.type] || 'text';
    const limits = field.key === 'date_of_birth' ? ' max="' + new Date().toISOString().slice(0, 10) + '"' : type === 'text' ? ' maxlength="120"' : '';
    return '<input class="control" type="' + type + '"' + name + dir + extra + limits + '>';
  }

  function fieldHtml(field) {
    const id = 'ap-' + field.key.replace(/_/g, '-');
    const hint = fieldText(field, 'hint');
    const hintId = hint ? id + '-hint' : '';
    const hintHtml = hint ? '<p class="field__hint" id="' + hintId + '">' + esc(hint) + '</p>' : '';
    const req = field.required ? '<span class="field__req" aria-hidden="true">*</span>' : '';
    const label = '<span>' + esc(fieldText(field, 'label')) + '</span>' + req;
    const wide = isWide(field) ? ' field--full' : '';

    if (field.type === 'checkbox') {
      // The consent sentence ends with a link to the rules. The box is named by the sentence alone.
      const rules = field.key === 'consent' && byId('rules');
      return '<div class="field field--full"><label class="check"><input type="checkbox" id="' + id + '" name="' + esc(field.key) + '"' +
        (field.required ? ' required' : '') + (hintId ? ' aria-describedby="' + hintId + '"' : '') +
        (rules ? ' aria-labelledby="' + id + '-text"' : '') + '><span class="check__text"><span id="' + id + '-text">' + esc(fieldText(field, 'label')) + '</span>' +
        (rules ? ' <a class="check__link" href="#rules" data-rules-link>' + esc(t('apply.checkRules')) + '</a>' : '') + req +
        '</span></label>' + hintHtml + '</div>';
    }
    if (field.type === 'radio') {
      const choices = field.key === 'room_type'
        ? '<div class="choices">' + Object.keys(data.config.roomTypes).map(function (type) {
          return '<label class="choice"><input type="radio" name="room_type" value="' + type + '"' + (field.required ? ' required' : '') + '>' +
            '<span><strong>' + esc(t('roomType.' + type)) + '</strong><small>' + esc(t('apply.' + type + 'Text')) + '</small></span>' +
            icon(type === 'double' ? 'bed' : 'users', { size: 22 }) + '</label>';
        }).join('') + '</div>'
        : '<div class="radios">' + (field.options || []).map(function (o) {
          return '<label class="radio"><input type="radio" name="' + esc(field.key) + '" value="' + esc(o.value) + '"' + (field.required ? ' required' : '') + '>' +
            '<span>' + esc(optionText(o)) + '</span></label>';
        }).join('') + '</div>';
      return '<fieldset class="field field--group field--full"' + (hintId ? ' aria-describedby="' + hintId + '"' : '') + '>' +
        '<legend class="field__label">' + label + '</legend>' + choices + hintHtml + '</fieldset>';
    }
    return '<div class="field' + wide + '"><label class="field__label" for="' + id + '">' + label + '</label>' +
      controlHtml(field, id, hintId) + hintHtml + '</div>';
  }

  /** Draws the form, keeping whatever was already typed (after a language change, for example). */
  function renderApplyFields(formEl) {
    const typed = form.values(formEl);
    const fields = data.formFields();
    byId('apply-fields').innerHTML = data.config.formSections.map(function (section) {
      const inSection = fields.filter(function (f) { return f.section === section; });
      if (!inSection.length) return '';
      return '<fieldset class="fieldset"><legend>' + esc(t('form.sec.' + section)) + '</legend>' +
        '<div class="form-grid">' + inSection.map(fieldHtml).join('') + '</div></fieldset>';
    }).join('');
    if (formEl.elements.major && formEl.elements.year) fillStudySelects(formEl.elements.major, formEl.elements.year);
    if (formEl.elements.term) fillTermSelect(formEl.elements.term);
    Object.keys(typed).forEach(function (key) {
      const el = formEl.elements[key];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!typed[key];
      else if (el.length && !el.tagName) Array.prototype.forEach.call(el, function (r) { r.checked = r.value === typed[key]; });
      else el.value = typed[key];
    });
  }

  /** Age in whole years on a given day. */
  function ageOn(birth, day) {
    const b = birth.split('-').map(Number);
    const d = day.split('-').map(Number);
    return d[0] - b[0] - (d[1] < b[1] || (d[1] === b[1] && d[2] < b[2]) ? 1 : 0);
  }

  /** errors: { field key: i18n key }, in the order the fields appear. */
  function checkApplication(fields, v) {
    const e = {};
    fields.forEach(function (f) {
      const value = v[f.key];
      if (!value) {
        if (f.required) e[f.key] = f.key === 'consent' ? 'apply.errConsent' : f.type === 'checkbox' ? 'apply.errTick' : 'err.required';
        return;
      }
      if (f.type === 'checkbox') return;
      if (f.lang === 'en' && !/^[A-Za-z][A-Za-z' .-]*$/.test(value)) e[f.key] = 'apply.errLatin';
      else if (f.lang === 'ar' && (!form.isArabic(value) || /[A-Za-z]/.test(value))) e[f.key] = 'apply.errArabic';
      else if (f.type === 'email' && !form.isEmail(value)) e[f.key] = 'err.email';
      else if (f.type === 'tel' && !form.isPhone(value)) e[f.key] = 'err.phone';
      else if (f.type === 'number' && !isFinite(Number(value))) e[f.key] = 'apply.errNumber';
      else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) e[f.key] = 'apply.errDate';
    });
    // Rules of the standard fields.
    if (!e.university_id && v.university_id && !/^\d{8}$/.test(v.university_id)) e.university_id = 'err.uniId';
    if (!e.reason && v.reason && v.reason.length < 30) e.reason = 'apply.errReasonShort';
    if (!e.date_of_birth && v.date_of_birth) {
      const age = ageOn(v.date_of_birth, data.dates.today());
      if (age < 16 || age > 60) e.date_of_birth = 'apply.errAge';
    }
    const ordered = {};
    fields.forEach(function (f) { if (e[f.key]) ordered[f.key] = e[f.key]; });
    return ordered;
  }

  /**
   * What is sent to Laravel: every answer under its field key (the semester as
   * "2026|fall"). The server checks it again against the published form, keeps
   * the standard answers in their own columns and the office's own questions
   * in "extra" with a copy of the question.
   */
  function buildApplication(fields, v) {
    const out = {};
    fields.forEach(function (f) {
      const value = v[f.key];
      out[f.key] = f.type === 'checkbox' ? !!value : f.key === 'email' ? String(value || '').toLowerCase() : value;
    });
    return out;
  }

  function initApply() {
    const formEl = byId('apply-form');
    if (!formEl) return;
    const dialog = byId('apply-modal');
    const success = byId('apply-success');
    const errorBox = byId('apply-error');
    renderApplyFields(formEl);
    i18n.onChange(function () { renderApplyFields(formEl); });
    const firstControl = function () { return formEl.querySelector('input, select, textarea'); };

    // "Back to your application": shown after "Check it now" took the applicant to the rules.
    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'btn btn--accent apply-return';
    backButton.hidden = true;
    document.body.appendChild(backButton);
    function drawBackButton() { backButton.innerHTML = icon('clipboard', { size: 18 }) + '<span>' + esc(t('apply.backToForm')) + '</span>'; }
    drawBackButton();
    i18n.onChange(drawBackButton);

    function openApply(opener) {
      if (dialog.open) return;
      backButton.hidden = true;
      dialog._opener = opener;
      dialog.showModal();
      (success.hidden ? firstControl() : success).focus();
    }
    backButton.addEventListener('click', function () { openApply(document.querySelector('[data-open-apply]')); });

    // "Check it now": close the form (everything typed stays) and go to the rules section.
    formEl.addEventListener('click', function (event) {
      const link = event.target.closest('[data-rules-link]');
      if (!link) return;
      event.preventDefault();
      dialog._opener = null; // do not jump back to the button that opened the form
      dialog.close();
      const section = byId('rules');
      const still = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      section.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      const title = byId('rules-title');
      if (title) {
        title.setAttribute('tabindex', '-1');
        title.focus({ preventScroll: true });
      }
      backButton.hidden = false;
    });
    document.addEventListener('click', function (event) {
      const trigger = event.target.closest('[data-open-apply], a[href="#apply"]');
      if (!trigger) return;
      event.preventDefault();
      openApply(trigger);
    });
    byId('apply-close').addEventListener('click', function () { dialog.close(); });
    byId('apply-done').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () {
      // After a sent application the next opening starts with an empty form.
      if (!success.hidden) {
        formEl.reset();
        form.clear(formEl);
        success.hidden = true;
        formEl.hidden = false;
      }
      if (dialog._opener && document.contains(dialog._opener)) dialog._opener.focus();
    });
    // "Apply for housing" on the log-in page arrives here with #apply.
    if (global.location.hash === '#apply') openApply(null);

    formEl.addEventListener('submit', function (event) {
      event.preventDefault();
      errorBox.hidden = true;
      const fields = data.formFields();
      if (!fields.length) {
        errorBox.innerHTML = icon('alert', { size: 18 }) + '<div>' + esc(t('apply.formError')) + '</div>';
        errorBox.hidden = false;
        errorBox.focus();
        return;
      }
      const v = form.values(formEl);
      if (form.show(formEl, checkApplication(fields, v))) { sound.play('warning'); return; }

      const showError = function (text) {
        errorBox.innerHTML = icon('alert', { size: 18 }) + '<div>' + esc(text) + '</div>';
        errorBox.hidden = false;
        errorBox.focus();
        sound.play('error');
      };
      const button = formEl.querySelector('[type="submit"]');
      button.disabled = true;
      DMS.api.post('/applications', buildApplication(fields, v), { area: null }).then(function (res) {
        button.disabled = false;
        byId('apply-success-text').textContent = t('apply.successText', { ref: res.data.ref, email: res.data.email });
        formEl.hidden = true;
        success.hidden = false;
        success.focus();
        sound.play('success');
      }).catch(function (err) {
        button.disabled = false;
        // The server checked the answers again (the office may have changed the form meanwhile).
        if (err.codes) { form.show(formEl, err.codes); sound.play('warning'); return; }
        if (err.code === 'applyDuplicate') { showError(t('apply.errDuplicate', { ref: err.params.ref })); return; }
        if (err.code === 'network') { showError(t('apply.errOffline')); return; }
        showError(t('apply.errSave') + (err.message ? ' ' + err.message : ''));
      });
    });

    byId('apply-again').addEventListener('click', function () {
      formEl.reset();
      form.clear(formEl);
      success.hidden = true;
      formEl.hidden = false;
      firstControl().focus();
    });
  }

  /**
   * The public information the homepage needs from the server: the application
   * form the dorm office publishes and the meal deadline. Nothing private.
   * The rest of the homepage works without it (offline, it stays static).
   */
  function loadSite() {
    const holder = byId('apply-fields');
    if (holder) holder.innerHTML = '<p class="muted" role="status">' + esc(t('apply.loading')) + '</p>';
    DMS.api.get('/public/site', null, { area: null }).then(function (res) {
      data.db.application_form = res.data.application_form || [];
      data.db.settings.meal_cutoff = res.data.meal_cutoff || data.config.defaultCutoff;
      translatePage();
      initApply();
    }).catch(function () {
      // The buttons still open the popup, which explains the problem.
      initApply();
      if (holder) holder.innerHTML = '<div class="notice notice--danger">' + icon('alert', { size: 18 }) + '<div>' + esc(t('apply.formError')) + '</div></div>';
    });
  }

  /* ======================================================================
     Start
     ====================================================================== */
  const TITLES = { home: 'site.title', login: 'site.loginTitle' };
  let page = '';

  function translatePage() {
    i18n.globals.cutoff = i18n.time(data.db.settings.meal_cutoff);
    i18n.apply(document);
    document.title = t(TITLES[page] || 'site.title');
    const rights = byId('footer-rights');
    if (rights) rights.textContent = t('footer.rights', { year: new Date().getFullYear() });
  }

  function boot() {
    page = document.body.getAttribute('data-page') || 'home';
    hydrateIcons(document);
    translatePage();

    if (page === 'home') {
      drawTools(byId('site-tools'), 'link');
      initHeader();
      initReveal();
      initEffects();
      initGallery();
      loadSite();
    }

    // The log-in page switches language in place.
    i18n.onChange(function () {
      translatePage();
      drawTools();
      form.retranslate();
    });
  }

  DMS.site = {
    esc: esc,
    form: form,
    drawTools: drawTools,
    fillStudySelects: fillStudySelects,
    hydrateIcons: hydrateIcons,
  };

  document.addEventListener('DOMContentLoaded', boot);
})(window);
