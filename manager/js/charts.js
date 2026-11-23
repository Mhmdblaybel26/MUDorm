/* ==========================================================================
   charts.js — two small inline-SVG charts, no library (DMS.charts).

   bars()  vertical bars on a 0–100% scale (occupancy by wing)
   donut() part-to-whole ring with a legend (complaints by status)

   Both are drawn to scale, take their colours from CSS variables (so they
   follow the light/dark theme), mirror in Arabic, show a tooltip on hover
   and keyboard focus, and come with a "View as table" twin for screen
   readers and anyone who prefers numbers.
   ========================================================================== */
(function (global) {
  'use strict';
  const DMS = global.DMS;
  const i18n = DMS.i18n;
  const esc = function (v) { return DMS.ui.esc(v); };
  const NS = 'http://www.w3.org/2000/svg';

  function tableHtml(caption, headers, rows) {
    return (
      '<details class="chart-table"><summary>' + esc(i18n.t('chart.viewTable')) + '</summary>' +
      '<div class="table-wrap"><table class="table"><caption class="sr-only">' + esc(caption) + '</caption><thead><tr>' +
      headers.map(function (h, i) { return '<th scope="col"' + (i ? ' class="num"' : '') + '>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) { return i ? '<td class="num">' + esc(c) + '</td>' : '<th scope="row">' + esc(c) + '</th>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></details>'
    );
  }

  /* ---- Tooltip shared by both charts ---- */
  function tooltip(host) {
    let tip = host.querySelector('.chart-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.hidden = true;
      tip.setAttribute('aria-hidden', 'true');
      host.appendChild(tip);
    }
    return {
      show: function (x, y, title, detail) {
        tip.innerHTML = '<strong>' + esc(title) + '</strong>' + esc(detail);
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
        tip.hidden = false;
      },
      hide: function () { tip.hidden = true; },
    };
  }

  /** Path for a column with a 4px rounded top and a square base. */
  function columnPath(x, y, w, base) {
    const h = base - y;
    const r = Math.min(4, h, w / 2);
    if (h <= 0) return '';
    return 'M' + x + ',' + base + 'V' + (y + r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) +
      'H' + (x + w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'V' + base + 'Z';
  }

  /**
   * opts: { title, items: [{ label, value, detail }], height, max, format }
   * By default values are fractions on a 0–100% axis. Pass max (axis top)
   * and format (value -> text) for other units, such as study hours.
   */
  function drawBars(host, opts) {
    const plotHost = host.querySelector('.chart') || host;
    const width = Math.max(260, Math.floor(plotHost.clientWidth || 480));
    const height = opts.height || 250;
    const rtl = document.documentElement.dir === 'rtl';
    const axisW = 44;
    const top = 26;
    const bottom = 48;
    const base = height - bottom;
    const plotW = width - axisW - 8;
    const plotLeft = rtl ? 8 : axisW;
    const slot = plotW / opts.items.length;
    const barW = Math.min(24, slot * 0.5);
    const max = opts.max || 1;
    const fmt = opts.format || i18n.percent;
    const yFor = function (v) { return top + (1 - v) * (base - top); };

    let svg = '<svg xmlns="' + NS + '" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="group" aria-label="' + esc(opts.title) + '">';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (tick) {
      const y = Math.round(yFor(tick)) + 0.5;
      svg += '<line class="chart__grid" x1="' + plotLeft + '" x2="' + (plotLeft + plotW) + '" y1="' + y + '" y2="' + y + '"/>';
      const tx = rtl ? width - 6 : axisW - 8;
      // direction="ltr" keeps "end" meaning the right edge, also in Arabic.
      svg += '<text class="chart__axis-text" x="' + tx + '" y="' + (y + 4) + '" text-anchor="end" direction="ltr">' + esc(fmt(tick * max)) + '</text>';
    });

    opts.items.forEach(function (item, i) {
      const index = rtl ? opts.items.length - 1 - i : i;
      const cx = plotLeft + slot * index + slot / 2;
      const x = cx - barW / 2;
      const y = yFor(Math.max(0, Math.min(1, item.value / max)));
      const label = item.label + ': ' + fmt(item.value) + ', ' + item.detail;
      svg += '<g class="chart__col" tabindex="0" role="img" aria-label="' + esc(label) + '" data-i="' + i + '" data-x="' + cx + '" data-y="' + y + '">' +
        '<rect class="chart__hit" x="' + (cx - slot / 2) + '" y="' + top + '" width="' + slot + '" height="' + (base - top) + '"/>' +
        '<path class="chart__bar" d="' + columnPath(x, y, barW, base) + '"/>' +
        '<text class="chart__value" x="' + cx + '" y="' + (y - 8) + '" text-anchor="middle">' + esc(fmt(item.value)) + '</text>' +
        '<text class="chart__label" x="' + cx + '" y="' + (base + 20) + '" text-anchor="middle">' + esc(item.label) + '</text>' +
        '<text class="chart__axis-text" x="' + cx + '" y="' + (base + 37) + '" text-anchor="middle">' + esc(item.detail) + '</text>' +
        '</g>';
    });
    svg += '</svg>';
    plotHost.innerHTML = svg;

    const tip = tooltip(plotHost);
    plotHost.querySelectorAll('.chart__col').forEach(function (g) {
      const item = opts.items[Number(g.getAttribute('data-i'))];
      const show = function () { tip.show(Number(g.getAttribute('data-x')), Number(g.getAttribute('data-y')) - 18, item.label, fmt(item.value) + ' · ' + item.detail); };
      g.addEventListener('mouseenter', show);
      g.addEventListener('focus', show);
      g.addEventListener('mouseleave', tip.hide);
      g.addEventListener('blur', tip.hide);
    });
  }

  function bars(host, opts) {
    host.innerHTML = '<div class="chart"></div>' +
      tableHtml(opts.title, opts.tableHeaders, opts.items.map(function (item) { return [item.label, (opts.format || i18n.percent)(item.value), item.detail]; }));
    drawBars(host, opts);
    // Redraw at the real width so text stays at its true size.
    if (host._observer) host._observer.disconnect();
    if ('ResizeObserver' in global) {
      let lastWidth = host.clientWidth;
      host._observer = new ResizeObserver(function () {
        if (Math.abs(host.clientWidth - lastWidth) < 4) return;
        lastWidth = host.clientWidth;
        drawBars(host, opts);
      });
      host._observer.observe(host);
    }
  }

  /**
   * opts: { title, caption, segments: [{ key, label, value }] }
   * Segment colours come from .donut-seg--<key>; a 2px gap separates them.
   */
  function donut(host, opts) {
    const total = opts.segments.reduce(function (s, seg) { return s + seg.value; }, 0);
    const r = 76;
    const c = 2 * Math.PI * r;
    const gap = total > 0 && opts.segments.filter(function (s) { return s.value > 0; }).length > 1 ? 2 : 0;
    let offset = 0;
    const rtl = document.documentElement.dir === 'rtl';
    const arcs = opts.segments.map(function (seg, i) {
      const share = total ? seg.value / total : 0;
      const len = Math.max(0, share * c - gap);
      const arc = '<circle class="donut-seg donut-seg--' + seg.key + '" data-i="' + i + '" cx="100" cy="100" r="' + r + '" stroke-width="24"' +
        ' stroke-dasharray="' + len.toFixed(2) + ' ' + (c - len).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '"/>';
      offset += share * c;
      return seg.value > 0 ? arc : '';
    }).join('');

    const summary = opts.title + ': ' + opts.segments.map(function (s) { return s.label + ' ' + i18n.number(s.value); }).join(', ');
    // In Arabic the ring runs counter-clockwise, matching reading direction.
    const transform = rtl ? 'rotate(-90 100 100) scale(1 -1) translate(0 -200)' : 'rotate(-90 100 100)';
    host.innerHTML =
      '<div class="chart-donut chart">' +
      '<svg class="chart-donut__svg" viewBox="0 0 200 200" role="img" aria-label="' + esc(summary) + '">' +
      '<circle class="donut-track" cx="100" cy="100" r="' + r + '" stroke-width="24"/>' +
      '<g transform="' + transform + '">' + arcs + '</g>' +
      '<text class="donut-total" x="100" y="104" text-anchor="middle">' + esc(i18n.number(total)) + '</text>' +
      '<text class="donut-caption" x="100" y="126" text-anchor="middle">' + esc(opts.caption) + '</text></svg>' +
      '<ul class="legend">' + opts.segments.map(function (s) {
        return '<li class="legend__item"><span class="legend__swatch legend__swatch--' + s.key + '" aria-hidden="true"></span>' +
          '<span>' + esc(s.label) + '</span><span class="legend__value">' + esc(i18n.number(s.value)) + '</span>' +
          '<span class="legend__pct">' + esc(i18n.percent(total ? s.value / total : 0)) + '</span></li>';
      }).join('') + '</ul></div>' +
      tableHtml(opts.title, opts.tableHeaders, opts.segments.map(function (s) {
        return [s.label, i18n.number(s.value), i18n.percent(total ? s.value / total : 0)];
      }));

    const wrap = host.querySelector('.chart-donut');
    const svgEl = wrap.querySelector('svg');
    const tip = tooltip(wrap);
    wrap.querySelectorAll('.donut-seg').forEach(function (seg) {
      const s = opts.segments[Number(seg.getAttribute('data-i'))];
      seg.addEventListener('mousemove', function (event) {
        const box = wrap.getBoundingClientRect();
        tip.show(event.clientX - box.left, event.clientY - box.top - 6, s.label, i18n.number(s.value) + ' · ' + i18n.percent(total ? s.value / total : 0));
      });
      seg.addEventListener('mouseleave', tip.hide);
    });
    svgEl.addEventListener('mouseleave', tip.hide);
  }

  DMS.charts = { bars: bars, donut: donut };
})(window);
