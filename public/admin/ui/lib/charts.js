/**
 * Vayu Admin — hand-rolled inline-SVG charts. No library: three chart
 * types, drawn as strings, is far less code than a dependency.
 *
 * Colours come from the CSS custom properties in admin.css, a palette
 * validated for this light surface: --series-1 #9e3a26 (revenue),
 * --series-2 #1c5cab (traffic), --series-3 #8a6013 (aux).
 */

import { esc, dayLabel } from './dom.js';

const CHART = { w: 640, h: 240, padL: 46, padR: 10, padT: 14, padB: 26 };
const GRID_LINES = 4;

/** Round an axis maximum up to a readable step (10, 20, 25, 50, 100…). */
function niceMax(v) {
    if (v <= 0) return 10;
    const magnitude = 10 ** Math.floor(Math.log10(v));
    for (const step of [1, 2, 2.5, 5, 10]) {
        if (v <= step * magnitude) return step * magnitude;
    }
    return 10 * magnitude;
}

/** Horizontal gridlines with their value labels, plus the baseline. */
function frame(maxVal, fmt) {
    const { w, h, padL, padR, padT, padB } = CHART;
    const innerH = h - padT - padB;
    let svg = '';

    for (let i = 0; i <= GRID_LINES; i++) {
        const y = padT + innerH - (innerH * i) / GRID_LINES;
        svg += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>`
            + `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)"`
            + ` style="font-variant-numeric:tabular-nums">${fmt((maxVal * i) / GRID_LINES)}</text>`;
    }
    return svg + `<line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--hairline)" stroke-width="1"/>`;
}

/** Date labels along the x-axis, thinned to about seven across. */
function xLabels(data, xOf) {
    const step = Math.ceil(data.length / 7);
    return data.map((d, i) => (i % step === 0 || i === data.length - 1)
        ? `<text x="${xOf(i)}" y="${CHART.h - 8}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${dayLabel(d.day)}</text>`
        : '').join('');
}

/**
 * Follow the pointer, highlight the nearest data point and show its
 * tooltip. Nearest-x rather than per-mark hit testing, so thin bars and
 * small dots stay easy to hit.
 */
function attachTip(wrap, svg, points, tipHtml) {
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    wrap.appendChild(tip);

    const marks = () => svg.querySelectorAll('.hover-mark');

    svg.addEventListener('mousemove', (e) => {
        const box = svg.getBoundingClientRect();
        const x = ((e.clientX - box.left) / box.width) * CHART.w;

        let best = 0;
        points.forEach((p, i) => {
            if (Math.abs(p.x - x) < Math.abs(points[best].x - x)) best = i;
        });

        const p = points[best];
        tip.innerHTML = tipHtml(best);
        tip.style.left = (p.x / CHART.w) * box.width + 'px';
        tip.style.top = (p.y / CHART.h) * box.height + 'px';
        tip.classList.add('show');

        marks().forEach(m => m.setAttribute('opacity', 0));
        svg.querySelector(`[data-hm="${best}"]`)?.setAttribute('opacity', 1);
    });

    svg.addEventListener('mouseleave', () => {
        tip.classList.remove('show');
        marks().forEach(m => m.setAttribute('opacity', 0));
    });
}

function mount(container, innerSvg, points, tipHtml) {
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    wrap.innerHTML = `<svg viewBox="0 0 ${CHART.w} ${CHART.h}" role="img">${innerSvg}</svg>`;
    container.appendChild(wrap);
    attachTip(wrap, wrap.querySelector('svg'), points, tipHtml);
}

const defaultTip = (data, fmt) => (i) => `${dayLabel(data[i].day)}<br><b>${fmt(data[i].value)}</b>`;

/** Bar chart over `[{ day, value }]`. */
export function barChart(container, data, { color = 'var(--series-1)', fmt = String, tipLine } = {}) {
    const { padL, padR, padT, padB, w, h } = CHART;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const max = niceMax(Math.max(...data.map(d => d.value), 1));
    const slot = innerW / data.length;
    const barW = Math.min(26, slot * 0.6);
    const baseline = padT + innerH;

    // Only the tallest bar is labelled — a number over every bar is noise.
    const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
    const points = [];
    let bars = '';

    data.forEach((d, i) => {
        const x = padL + slot * i + (slot - barW) / 2;
        const y = baseline - (d.value / max) * innerH;
        points.push({ x: x + barW / 2, y });

        if (d.value > 0) {
            // Rounded top, square foot: the bar stays anchored to the axis.
            bars += `<path d="M${x} ${baseline} V${y + 4} Q${x} ${y} ${x + 4} ${y}`
                + ` H${x + barW - 4} Q${x + barW} ${y} ${x + barW} ${y + 4} V${baseline} Z" fill="${color}"/>`;
        }
        // Full-height hover target, wider than the bar itself.
        bars += `<rect data-hm="${i}" class="hover-mark" x="${padL + slot * i}" y="${padT}"`
            + ` width="${slot}" height="${innerH}" fill="var(--ink)" opacity="0" fill-opacity="0.05"/>`;

        if (i === peak && d.value > 0) {
            bars += `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10.5"`
                + ` fill="var(--body)" style="font-variant-numeric:tabular-nums">${fmt(d.value)}</text>`;
        }
    });

    const labels = xLabels(data, i => padL + slot * i + slot / 2);
    mount(container, frame(max, fmt) + bars + labels, points, tipLine || defaultTip(data, fmt));
}

/** Line chart with a soft fill under it, over `[{ day, value }]`. */
export function lineChart(container, data, { color = 'var(--series-2)', fmt = String, tipLine } = {}) {
    const { padL, padR, padT, padB, w, h } = CHART;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const max = niceMax(Math.max(...data.map(d => d.value), 1));
    const baseline = padT + innerH;

    const xOf = (i) => padL + (data.length === 1 ? innerW / 2 : (innerW * i) / (data.length - 1));
    const points = data.map((d, i) => ({ x: xOf(i), y: baseline - (d.value / max) * innerH }));

    const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${points.at(-1).x} ${baseline} L${points[0].x} ${baseline} Z`;

    const marks = points.map((p, i) =>
        `<g data-hm="${i}" class="hover-mark" opacity="0">`
        + `<line x1="${p.x}" y1="${padT}" x2="${p.x}" y2="${baseline}" stroke="var(--hairline)" stroke-width="1"/>`
        + `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${color}" stroke="var(--card)" stroke-width="2"/></g>`).join('');

    const body = frame(max, fmt)
        + `<path d="${area}" fill="${color}" fill-opacity="0.07"/>`
        + `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`
        + marks + xLabels(data, xOf);

    mount(container, body, points, tipLine || defaultTip(data, fmt));
}

/** Horizontal bars as plain HTML, for ranked lists like top pages. */
export function hBars(rows, fmt = String) {
    if (!rows.length) return '<div class="empty">No data yet</div>';
    const max = Math.max(...rows.map(r => r.value), 1);
    return rows.map(r => `
        <div class="hbar-row">
            <div class="lbl" title="${esc(r.label)}">${esc(r.label)}</div>
            <div class="hbar-track"><div class="hbar-fill" style="width:${(r.value / max) * 100}%"></div></div>
            <div class="val">${fmt(r.value)}</div>
        </div>`).join('');
}
