/* ==========================================================================
   application-form.js — the housing application form, as the dorm office
   wants it. Add questions, change their wording, make them required or
   optional, move them and delete them. The homepage form follows at once.
   - System fields (names, university ID, e-mail, phone, gender, studies,
     semester, room type, consent) create the student's account: they can be
     renamed and moved, but not deleted or made optional.
   - The other standard fields keep their type and choices; they can be
     reworded, made optional or deleted ("Restore the standard form" brings
     them back).
   - The office's own fields can be changed completely.
   Labels, hints and choices are kept in both languages because applicants
   read the form in Arabic or English; a language left empty is translated.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const t = i18n.t;
  const ui = DMS.ui;
  const esc = ui.esc;
  const data = DMS.data;
  const config = data.config;

  const CHOICE_TYPES = ['select', 'radio'];
  let editing = null; // the field being edited, or null for a new one
  let saving = false;

  function label(field) { return i18n.field(field, 'label'); }
  function otherLabel(field) { return field[i18n.lang() === 'ar' ? 'label_en' : 'label_ar'] || ''; }
  function inSection(section) {
    return data.formFields().filter(function (f) { return f.section === section; });
  }
  /** Positions inside a section are 1, 2, 3 ... in the order shown. */
  function renumber(fields) { fields.forEach(function (f, i) { f.position = i + 1; }); }

  /* ---- The list ---- */
  function kindBadge(field) {
    if (field.system) return '<span class="badge badge--accent">' + ui.icon('lock', { size: 12 }) + esc(t('aform.system')) + '</span>';
    if (field.builtin) return '<span class="badge badge--neutral">' + esc(t('aform.standard')) + '</span>';
    return '<span class="badge badge--info">' + esc(t('aform.custom')) + '</span>';
  }

  function row(field, index, count) {
    const name = label(field);
    const button = function (attr, iconName, key, disabled, extra) {
      return '<button type="button" class="icon-btn icon-btn--sm' + (extra || '') + '" ' + attr + '="' + field.id + '" aria-label="' +
        esc(t(key, { label: name })) + '" title="' + esc(t(key, { label: name })) + '"' + (disabled ? ' disabled' : '') + '>' +
        ui.icon(iconName, { size: 17 }) + '</button>';
    };
    const other = otherLabel(field);
    return '<li class="ff">' +
      '<span class="ff__n" aria-hidden="true">' + esc(i18n.number(index + 1)) + '</span>' +
      // Only the wording itself takes its own direction, so it lines up with the page.
      '<div class="ff__text"><p class="ff__label"><span dir="auto">' + esc(name) + '</span>' +
        (field.required ? ' <span class="field__req" aria-hidden="true">*</span>' : '') + '</p>' +
        (other && other !== name ? '<p class="cell-sub"><span dir="auto">' + esc(other) + '</span></p>' : '') +
        '<p class="ff__meta">' + kindBadge(field) +
        '<span class="badge badge--neutral">' + esc(t('aform.type.' + field.type)) + '</span>' +
        '<span class="badge ' + (field.required ? 'badge--warning' : 'badge--neutral') + '">' + esc(t(field.required ? 'aform.required' : 'aform.optional')) + '</span></p></div>' +
      '<div class="ff__actions">' +
        button('data-up', 'arrow-up', 'aform.moveUp', index === 0) +
        button('data-down', 'arrow-down', 'aform.moveDown', index === count - 1) +
        button('data-edit', 'edit', 'aform.editLabel', false) +
        button('data-delete', 'trash', field.system ? 'aform.lockedLabel' : 'aform.deleteLabel', field.system, ' icon-btn--danger') +
      '</div></li>';
  }

  function render() {
    document.getElementById('sections').innerHTML = config.formSections.map(function (section) {
      const fields = inSection(section);
      return '<section class="card" aria-labelledby="sec-' + section + '">' +
        '<div class="card__head"><h2 class="card__title" id="sec-' + section + '">' + esc(t('form.sec.' + section)) + '</h2>' +
        '<span class="badge badge--neutral">' + esc(t('aform.count', { n: i18n.number(fields.length) })) + '</span></div>' +
        (fields.length
          ? '<ol class="ff-list">' + fields.map(function (f, i) { return row(f, i, fields.length); }).join('') + '</ol>'
          : '<p class="card__body muted">' + esc(t('aform.emptySection')) + '</p>') +
        '</section>';
    }).join('');
    // The preview opens the homepage in the language the manager is using.
    document.getElementById('preview-form').href = '../main%20page/' + (i18n.lang() === 'ar' ? 'index.html' : 'engindex.html') + '#apply';
  }

  /* ---- Add / edit ---- */
  function optionLines(field, lang) {
    return (field.options || []).map(function (o) { return o[lang]; }).join('\n');
  }

  function showTypeParts() {
    const formEl = document.getElementById('field-form');
    const type = editing && editing.builtin ? editing.type : formEl.elements.type.value;
    const builtinChoices = editing && editing.builtin && editing.options;
    document.getElementById('ff-options').hidden = !(CHOICE_TYPES.indexOf(type) > -1 && !(editing && editing.builtin));
    document.getElementById('ff-fixed-options').hidden = !builtinChoices;
    document.getElementById('ff-type-hint').textContent = editing && editing.builtin ? t('aform.typeFixed') : t('aform.typeHint.' + type);
  }

  function openForm(field) {
    editing = field || null;
    const formEl = document.getElementById('field-form');
    formEl.reset();
    DMS.form.clear(formEl);
    document.getElementById('field-modal-title').textContent = field ? t('aform.editTitle', { label: label(field) }) : t('aform.addTitle');
    document.getElementById('field-modal-sub').innerHTML = field ? kindBadge(field) : '';
    formEl.elements.section.innerHTML = config.formSections.map(function (s) {
      return '<option value="' + s + '">' + esc(t('form.sec.' + s)) + '</option>';
    }).join('');
    formEl.elements.type.innerHTML = config.formTypes.map(function (type) {
      return '<option value="' + type + '">' + esc(t('aform.type.' + type)) + '</option>';
    }).join('');
    DMS.form.fill(formEl, field ? {
      section: field.section, type: field.type, label_en: field.label_en, label_ar: field.label_ar, hint_en: field.hint_en, hint_ar: field.hint_ar,
      required: field.required, options_en: optionLines(field, 'en'), options_ar: optionLines(field, 'ar'),
    } : { section: 'personal', type: 'text', required: false });
    formEl.elements.type.disabled = !!(field && field.builtin);
    formEl.elements.required.disabled = !!(field && field.system);
    if (field && field.system) formEl.elements.required.checked = true;
    document.getElementById('ff-required-hint').textContent = field && field.system ? t('aform.requiredLocked') : t('aform.requiredHint');
    showTypeParts();
    ui.openModal(document.getElementById('field-modal'));
  }

  function lines(text) { return text.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }

  /** Fills the language left empty with a translation of the other one. */
  function bothLanguages(en, ar) {
    if (en && ar) return Promise.resolve([en, ar]);
    if (!en && !ar) return Promise.resolve(['', '']);
    return en
      ? DMS.translate.into(en, 'ar').then(function (out) { return [en, out]; })
      : DMS.translate.into(ar, 'en').then(function (out) { return [out, ar]; });
  }

  function save(event) {
    event.preventDefault();
    if (saving) return;
    const formEl = event.target;
    const v = DMS.form.values(formEl);
    const type = editing && editing.builtin ? editing.type : v.type;
    const choices = CHOICE_TYPES.indexOf(type) > -1 && !(editing && editing.builtin);
    const optionsEn = lines(v.options_en || '');
    const optionsAr = lines(v.options_ar || '');
    const errors = {};
    if (!v.label_en && !v.label_ar) errors.label_en = 'aform.errLabel';
    if (choices) {
      const given = optionsEn.length || optionsAr.length;
      if (given < 2) errors.options_en = 'aform.errOptions';
      else if (optionsEn.length && optionsAr.length && optionsEn.length !== optionsAr.length) errors.options_ar = 'aform.errOptionsCount';
    }
    if (DMS.form.show(formEl, errors)) return;

    saving = true;
    const button = document.getElementById('field-save');
    button.disabled = true;
    button.textContent = t('aform.saving');
    const count = Math.max(optionsEn.length, optionsAr.length);
    const optionPairs = choices ? Array.apply(null, { length: count }).map(function (_, i) { return bothLanguages(optionsEn[i] || '', optionsAr[i] || ''); }) : [];

    Promise.all([bothLanguages(v.label_en, v.label_ar), bothLanguages(v.hint_en, v.hint_ar)].concat(optionPairs)).then(function (out) {
      const isNew = !editing;
      // Laravel keeps the stored value of each choice that is still there, so earlier answers keep their meaning;
      // a new field goes to the end of its section, and a field moved to another section too.
      const body = {
        section: v.section, type: type, required: editing && editing.system ? true : !!v.required,
        label_en: out[0][0], label_ar: out[0][1], hint_en: out[1][0], hint_ar: out[1][1],
        options: choices ? out.slice(2).map(function (pair) { return { en: pair[0], ar: pair[1] }; }) : null,
      };
      const request = isNew ? DMS.api.post('/application-form', body) : DMS.api.put('/application-form/' + editing.id, body);
      return request.then(function (res) {
        ui.closeModal(document.getElementById('field-modal'));
        return DMS.app.reload().then(function () { ui.toast(t(isNew ? 'aform.toastAdded' : 'aform.toastSaved', { label: label(res.data) })); });
      }).catch(ui.failed(formEl)).catch(function () { return null; });
    }).then(function () {
      saving = false;
      button.disabled = false;
      button.textContent = t('common.save');
    });
  }

  /* ---- Move, delete, restore ---- */
  function move(field, step) {
    const fields = inSection(field.section);
    const from = fields.indexOf(field);
    const to = from + step;
    if (to < 0 || to >= fields.length) return;
    fields.splice(to, 0, fields.splice(from, 1)[0]);
    renumber(fields);
    render();
    // Keep the keyboard on the field that moved.
    const again = document.querySelector('[' + (step < 0 ? 'data-up' : 'data-down') + '="' + field.id + '"]:not([disabled])') ||
      document.querySelector('[data-edit="' + field.id + '"]');
    if (again) again.focus();
    ui.announce(t('aform.moved', { label: label(field), n: i18n.number(field.position) }));
    DMS.api.put('/application-form/order', { section: field.section, ids: fields.map(function (f) { return f.id; }) })
      .catch(ui.failed()).catch(function () { return DMS.app.reload(); });
  }

  function remove(field) {
    if (field.system) return;
    ui.confirm({
      title: t('aform.deleteTitle'),
      message: t(field.builtin ? 'aform.deleteTextStandard' : 'aform.deleteText', { label: label(field) }),
      confirm: t('common.delete'),
    }).then(function (ok) {
      if (!ok) return null;
      return DMS.api.del('/application-form/' + field.id)
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('aform.toastDeleted', { label: label(field) }), 'info'); })
        .catch(ui.failed());
    });
  }

  function restore() {
    ui.confirm({ title: t('aform.resetTitle'), message: t('aform.resetConfirm'), confirm: t('aform.reset') }).then(function (ok) {
      if (!ok) return null;
      return DMS.api.post('/application-form/reset')
        .then(function () { return DMS.app.reload(); })
        .then(function () { ui.toast(t('aform.toastReset'), 'info'); })
        .catch(ui.failed());
    });
  }

  function init() {
    const sections = document.getElementById('sections');
    sections.addEventListener('click', function (event) {
      const find = function (attr) {
        const b = event.target.closest('[' + attr + ']');
        return b && !b.disabled ? data.find('application_form', b.getAttribute(attr)) : null;
      };
      let field;
      if ((field = find('data-up'))) move(field, -1);
      else if ((field = find('data-down'))) move(field, 1);
      else if ((field = find('data-edit'))) openForm(field);
      else if ((field = find('data-delete'))) remove(field);
    });
    document.getElementById('add-field').addEventListener('click', function () { openForm(null); });
    document.getElementById('reset-form').addEventListener('click', restore);
    const formEl = document.getElementById('field-form');
    formEl.addEventListener('submit', save);
    formEl.elements.type.addEventListener('change', showTypeParts);
    render();
  }

  DMS.app.page({ needs: [], init: init, render: render });
})(window);
