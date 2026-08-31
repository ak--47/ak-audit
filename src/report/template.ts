/**
 * The self-contained HTML report.
 *
 * One file, no network, no build step. The report exists because
 * BigQuery's own preview is slow to reach and shallow once you get there,
 * so the design goal is time-to-answer: a command palette over every table
 * and column, and a copyable query on everything.
 *
 * Colours come from the validated data-viz palette. The three relationship
 * hues were checked with the palette validator (worst adjacent CVD dE 9.2),
 * and every one of them is paired with a text label, which also satisfies
 * the contrast relief rule for the aqua slot.
 */

import type { ReportPayload } from './payload.ts';

function escapeJson(payload: unknown): string {
	// `</script` inside embedded JSON would close the tag early.
	return JSON.stringify(payload)
		.replaceAll('<', '\\u003c')
		.replaceAll('>', '\\u003e')
		.replaceAll(' ', '\\u2028')
		.replaceAll(' ', '\\u2029');
}

/**
 * Inline SVG favicon.
 *
 * Embedded rather than shipped as a file so the report stays a single
 * self-contained document, and so opening it never requests anything.
 */
const FAVICON =
	'data:image/svg+xml,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
			'<rect width="32" height="32" rx="7" fill="#2a78d6"/>' +
			'<rect x="7" y="17" width="4" height="9" rx="2" fill="#fff"/>' +
			'<rect x="14" y="11" width="4" height="15" rx="2" fill="#fff"/>' +
			'<rect x="21" y="6" width="4" height="20" rx="2" fill="#fff"/>' +
			'</svg>',
	);

function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export function renderHtml(payload: ReportPayload): string {
	return `<!doctype html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(payload.dataset)} — ak-audit</title>
<link rel="icon" href="${FAVICON}">
<meta name="robots" content="noindex">
<style>${CSS}</style>
</head>
<body>
<script id="payload" type="application/json">${escapeJson(payload)}</script>
<div id="app"></div>
<script>${JS}</script>
</body>
</html>
`;
}

const CSS = String.raw`
:root {
  color-scheme: light;
  --surface: #fcfcfb;
  --plane: #f9f9f7;
  --raised: #ffffff;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
  --line: #c3c2b7;
  --border: rgba(11,11,11,0.10);
  --fk: #2a78d6;
  --dup: #eb6834;
  --ovl: #1baf7a;
  --warn: #d03b3b;
  --ok: #0ca30c;
  --accent: #2a78d6;
  --shadow: 0 1px 2px rgba(11,11,11,.06), 0 8px 24px rgba(11,11,11,.08);
}
:root[data-theme="dark"], :root[data-theme="auto"]:is(.dark) {
  color-scheme: dark;
  --surface: #1a1a19;
  --plane: #0d0d0d;
  --raised: #232322;
  --ink: #ffffff;
  --ink-2: #c3c2b7;
  --muted: #898781;
  --grid: #2c2c2a;
  --line: #383835;
  --border: rgba(255,255,255,0.10);
  --fk: #3987e5;
  --dup: #d95926;
  --ovl: #199e70;
  --warn: #d03b3b;
  --ok: #0ca30c;
  --accent: #3987e5;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.5);
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--plane);
  color: var(--ink);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
code, pre, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

/* ---------- shell ---------- */
.shell { display: grid; grid-template-columns: 300px 1fr; height: 100vh; }
@media (max-width: 900px) { .shell { grid-template-columns: 1fr; } .side { display: none; } }

.side {
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column; min-height: 0;
}
.brand { padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
.brand h1 { margin: 0; font-size: 14px; letter-spacing: -0.01em; }
.brand .sub { color: var(--muted); font-size: 12px; margin-top: 2px; word-break: break-all; }

.side-search { padding: 10px 12px; border-bottom: 1px solid var(--border); }
.side-search input {
  width: 100%; padding: 7px 10px; border-radius: 7px;
  border: 1px solid var(--border); background: var(--plane); color: var(--ink);
  font: inherit;
}
.side-search input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }

.tlist { overflow-y: auto; flex: 1; padding: 6px; min-height: 0; }
.titem {
  display: block; width: 100%; text-align: left; padding: 7px 10px; border-radius: 7px;
  border: 0; background: none; color: var(--ink); cursor: pointer; font: inherit;
}
.titem:hover { background: var(--plane); }
.titem[aria-current="true"] { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.titem .tn { font-weight: 500; }
.titem .tm { color: var(--muted); font-size: 12px; display: flex; gap: 8px; }
.pill {
  font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
  padding: 1px 5px; border-radius: 4px; border: 1px solid var(--border); color: var(--ink-2);
}

/* ---------- main ---------- */
.main { overflow-y: auto; min-height: 0; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 22px 26px 80px; }

.topbar {
  position: sticky; top: 0; z-index: 5; background: var(--plane);
  border-bottom: 1px solid var(--border); padding: 10px 26px;
  display: flex; gap: 12px; align-items: center;
}
.kbtn {
  display: flex; align-items: center; gap: 8px; flex: 1; max-width: 460px;
  padding: 7px 11px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--surface); color: var(--muted); cursor: pointer; font: inherit;
}
.kbd {
  font: 11px ui-monospace, monospace; border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 5px; color: var(--ink-2);
}
.spacer { flex: 1; }
.ghost {
  border: 1px solid var(--border); background: var(--surface); color: var(--ink-2);
  border-radius: 7px; padding: 6px 10px; cursor: pointer; font: inherit;
}
.ghost:hover { color: var(--ink); }

/* ---------- stat tiles ---------- */
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 10px; margin-bottom: 22px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.tile .v { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
.tile .l { color: var(--muted); font-size: 12px; margin-top: 1px; }

h2 { font-size: 15px; margin: 26px 0 10px; letter-spacing: -0.01em; }
h3 { font-size: 13px; margin: 18px 0 8px; color: var(--ink-2); text-transform: uppercase; letter-spacing: .05em; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.card + .card { margin-top: 12px; }
.card.scroll { overflow-x: auto; }

/* Fixed layout so a long column name or value cannot push the count column
   off the edge of the card. */
table { border-collapse: collapse; width: 100%; font-size: 13px; table-layout: fixed; }
th {
  text-align: left; font-weight: 500; color: var(--muted); font-size: 11px;
  text-transform: uppercase; letter-spacing: .05em;
  padding: 8px 12px; border-bottom: 1px solid var(--grid); position: sticky; top: 0;
  background: var(--surface);
}
td { padding: 7px 12px; border-bottom: 1px solid var(--grid); vertical-align: top; }
tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: var(--plane); }
.num { text-align: right; font-variant-numeric: tabular-nums; }

/* ---------- meters ---------- */
.meter { display: flex; align-items: center; gap: 7px; justify-content: flex-end; }
/* Inline spans ignore width and height, so these must be block-level or the
   bar renders as an empty sliver at every value. */
.meter .bar {
  display: block; flex: none;
  width: 40px; height: 5px; border-radius: 3px; background: var(--grid); overflow: hidden;
}
.meter .fill { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
.meter .fill.hot { background: var(--warn); }
.meter .t { font-variant-numeric: tabular-nums; min-width: 34px; text-align: right; }

/* ---------- misc ---------- */
.usebar { display: flex; flex-wrap: wrap; gap: 8px; }
.upill {
  font-size: 12px; padding: 4px 9px; border-radius: 6px;
  background: var(--plane); border: 1px solid var(--border); color: var(--ink-2);
}
.upill strong { color: var(--ink); font-variant-numeric: tabular-nums; }
.banner {
  padding: 9px 13px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--ink-2);
}
.banner.warn {
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  border-color: color-mix(in srgb, var(--warn) 35%, transparent);
}
.tdesc { margin: 2px 0 10px; color: var(--ink-2); max-width: 70ch; }
.tag {
  display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 4px;
  border: 1px solid var(--border); color: var(--ink-2); margin-left: 5px;
  text-transform: uppercase; letter-spacing: .04em;
}
.kind-fk { color: var(--fk); }
.kind-duplicate { color: var(--dup); }
.kind-overlap { color: var(--ovl); }
.dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:6px; vertical-align: middle; }

/* Top values sit inline in the column row, so they must stay short. Each is
   one line: a proportional wash behind the label carries magnitude, the
   count sits right-aligned. Three lines keeps a wide table scannable. */
.top-values { display: flex; flex-direction: column; gap: 2px; }
.tv {
  display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: baseline;
  font-size: 11.5px; line-height: 1.45; border-radius: 3px; padding: 0 4px;
  background-repeat: no-repeat;
  background-image: linear-gradient(to right, color-mix(in srgb, var(--accent) 20%, transparent), color-mix(in srgb, var(--accent) 20%, transparent));
}
.tv .tvlabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap-any { overflow-wrap: anywhere; }
.tv .tvn { font-variant-numeric: tabular-nums; color: var(--muted); }
.tv em { color: var(--muted); }

pre.sql, pre.json {
  margin: 0; padding: 12px 14px; overflow-x: auto; font-size: 12px;
  background: var(--plane); color: var(--ink-2); line-height: 1.55;
}
.card-head {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  border-bottom: 1px solid var(--grid); font-size: 12px; color: var(--muted);
}
.copy { margin-left: auto; }

.notes li { margin-bottom: 4px; }
.note-warn { color: var(--warn); }
.empty { color: var(--muted); padding: 22px; text-align: center; }

details.samples summary { padding: 9px 12px; cursor: pointer; font-size: 12px; color: var(--muted); }
details.samples[open] summary { border-bottom: 1px solid var(--grid); }

/* ---------- command palette ---------- */
.pal-bg {
  position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 50;
  display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh;
}
.pal {
  width: min(680px, 92vw); background: var(--raised); border: 1px solid var(--border);
  border-radius: 12px; box-shadow: var(--shadow); overflow: hidden;
}
.pal input {
  width: 100%; padding: 14px 16px; border: 0; border-bottom: 1px solid var(--grid);
  background: none; color: var(--ink); font: 15px/1.4 inherit;
}
.pal input:focus { outline: none; }
.pal-list { max-height: 52vh; overflow-y: auto; padding: 6px; }
.pal-item {
  display: flex; gap: 10px; align-items: baseline; padding: 8px 11px;
  border-radius: 7px; cursor: pointer;
}
.pal-item[data-sel="1"] { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.pal-item .pi-main { font-weight: 500; }
.pal-item .pi-sub { color: var(--muted); font-size: 12px; margin-left: auto; }
.pal-foot { padding: 7px 14px; border-top: 1px solid var(--grid); color: var(--muted); font-size: 11px; display:flex; gap:14px; }
mark { background: color-mix(in srgb, var(--accent) 30%, transparent); color: inherit; border-radius: 2px; }

.hl { animation: hl 1.6s ease-out; }
@keyframes hl { from { background: color-mix(in srgb, var(--accent) 30%, transparent); } to { background: transparent; } }
`;

const JS = String.raw`
(() => {
'use strict';
const DATA = JSON.parse(document.getElementById('payload').textContent);
const app = document.getElementById('app');

/* ---------- theme ---------- */
const media = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const saved = localStorage.getItem('ak-audit-theme') || 'auto';
  document.documentElement.dataset.theme = saved;
  document.documentElement.classList.toggle('dark', saved === 'auto' ? media.matches : saved === 'dark');
}
media.addEventListener('change', applyTheme);
applyTheme();

/* ---------- formatting ---------- */
const fmtInt = n => n === null || n === undefined ? '—' : n.toLocaleString();
function fmtBytes(n) {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return n + ' B';
  const u = ['KB','MB','GB','TB','PB']; let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ' + u[i];
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct = v => v === null || v === undefined ? '—' : Math.round(v * 100) + '%';

/* ---------- fuzzy search ----------
   Subsequence matching with a bonus for contiguous runs and word starts, so
   "evrm" finds "events.room_id" the way an editor's file finder would. */
function score(needle, hay) {
  if (!needle) return 0;
  const n = needle.toLowerCase(), h = hay.toLowerCase();
  const direct = h.indexOf(n);
  if (direct === 0) return 1000 - hay.length;
  if (direct > 0) return 700 - direct - hay.length * 0.1;
  let hi = 0, s = 0, run = 0;
  for (let i = 0; i < n.length; i++) {
    const c = n[i];
    let found = -1;
    for (let j = hi; j < h.length; j++) if (h[j] === c) { found = j; break; }
    if (found === -1) return -1;
    if (found === hi) { run++; s += 8 + run * 2; }
    else { run = 0; s += 2; }
    if (found === 0 || /[^a-z0-9]/.test(h[found - 1] || '')) s += 6;
    hi = found + 1;
  }
  return s - hay.length * 0.05;
}

/* Search index: every table and every column, built once. */
const INDEX = [];
for (const t of DATA.tables) {
  // Descriptions join the searchable text, so "renewals" finds the table
  // that is *about* renewals even when its name never says so.
  INDEX.push({
    kind: 'table', label: t.name, hay: t.name + ' ' + (t.desc || ''),
    sub: t.kind.toLowerCase() + ' · ' + fmtInt(t.rows) + ' rows', table: t.name,
  });
  for (const c of t.columns) {
    INDEX.push({
      kind: 'column', label: t.name + '.' + c.p, hay: t.name + '.' + c.p + ' ' + (c.desc || ''),
      sub: c.t, table: t.name, column: c.p,
    });
  }
}

/* ---------- state ---------- */
let current = DATA.tables.length ? DATA.tables[0].name : null;
let sideFilter = '';

function tableByName(n) { return DATA.tables.find(t => t.name === n); }

function select(name, column) {
  current = name;
  render();
  const main = document.querySelector('.main');
  if (column) {
    const row = document.querySelector('[data-col="' + CSS.escape(column) + '"]');
    if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('hl'); return; }
  }
  if (main) main.scrollTop = 0;
}

/* ---------- command palette ---------- */
let pal = null;
function openPalette() {
  if (pal) return;
  pal = document.createElement('div');
  pal.className = 'pal-bg';
  pal.innerHTML = '<div class="pal" role="dialog" aria-label="Search"><input placeholder="Search tables and columns…" autocomplete="off" spellcheck="false"><div class="pal-list"></div><div class="pal-foot"><span><span class="kbd">↑↓</span> navigate</span><span><span class="kbd">↵</span> open</span><span><span class="kbd">esc</span> close</span></div></div>';
  document.body.appendChild(pal);
  const input = pal.querySelector('input');
  const list = pal.querySelector('.pal-list');
  let results = [], sel = 0;

  function refresh() {
    const q = input.value.trim();
    results = (q
      ? INDEX.map(e => ({ e, s: Math.max(score(q, e.label), score(q, e.hay) - 40) })).filter(r => r.s > 0)
          .sort((a, b) => b.s - a.s).slice(0, 60).map(r => r.e)
      : INDEX.filter(e => e.kind === 'table').slice(0, 60));
    sel = 0;
    draw();
  }
  function draw() {
    list.innerHTML = results.map((r, i) =>
      '<div class="pal-item" data-i="' + i + '" data-sel="' + (i === sel ? 1 : 0) + '">' +
      '<span class="pi-main">' + esc(r.label) + '</span>' +
      '<span class="pi-sub">' + esc(r.sub) + '</span></div>').join('')
      || '<div class="empty">No match</div>';
    const active = list.querySelector('[data-sel="1"]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const r = results[i];
    if (!r) return;
    close();
    select(r.table, r.column);
  }
  function close() { if (pal) { pal.remove(); pal = null; } }

  input.addEventListener('input', refresh);
  pal.addEventListener('click', e => { if (e.target === pal) close(); });
  list.addEventListener('click', e => {
    const item = e.target.closest('.pal-item');
    if (item) choose(Number(item.dataset.i));
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, results.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { choose(sel); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); }
  });
  refresh();
  input.focus();
}

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openPalette(); }
  else if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    e.preventDefault(); openPalette();
  }
});

/* ---------- copy ---------- */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const text = btn.dataset.copy === 'prev'
    ? btn.closest('.card').querySelector('pre').textContent
    : btn.dataset.copy;
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = old; }, 1200);
  });
});

/* ---------- render ---------- */
/* Rounding must not lie: a 99.96%-null column showing "100%" beside a
   distinct count of 6 reads as a contradiction. */
function nullMeter(v) {
  if (v === null || v === undefined) return '<span style="color:var(--muted)">—</span>';
  const raw = Math.round(v * 100);
  const label = v <= 0 ? 0 : v >= 1 ? 100 : Math.min(99, Math.max(1, raw));
  return '<span class="meter"><span class="bar"><span class="fill' + (v >= 0.95 ? ' hot' : '') +
    '" style="width:' + raw + '%"></span></span><span class="t">' + label + '%</span></span>';
}

function topValues(c) {
  if (!c.top.length) return '<span style="color:var(--muted)">—</span>';
  const max = Math.max(...c.top.map(t => t.c)) || 1;
  const shown = c.top.slice(0, 3);
  const rest = c.top.length - shown.length;
  return '<div class="top-values">' + shown.map(t =>
    '<div class="tv" style="background-size:' + Math.max(2, (t.c / max) * 100) + '% 100%">' +
    '<span class="tvlabel">' + (t.v === null ? '<em>null</em>' : esc(t.v)) + '</span>' +
    '<span class="tvn">' + fmtInt(t.c) + '</span></div>').join('') +
    (rest > 0 ? '<div class="tv" style="background-size:0"><span class="tvlabel"><em>+' + rest + ' more</em></span><span></span></div>' : '') +
    '</div>';
}

function renderSide() {
  const q = sideFilter.trim();
  const list = q
    ? DATA.tables.map(t => ({ t, s: score(q, t.name) })).filter(r => r.s > 0).sort((a,b) => b.s - a.s).map(r => r.t)
    : DATA.tables;
  return '<aside class="side"><div class="brand"><h1>' + esc(DATA.dataset.split('.').slice(-1)[0]) +
    '</h1><div class="sub">' + esc(DATA.dataset) + '</div></div>' +
    '<div class="side-search"><input id="sf" placeholder="Filter tables…" value="' + esc(sideFilter) + '"></div>' +
    '<nav class="tlist">' + (list.length ? list.map(t =>
      '<button class="titem" data-t="' + esc(t.name) + '" aria-current="' + (t.name === current) + '">' +
      '<div class="tn">' + esc(t.name) + '</div><div class="tm"><span>' + fmtInt(t.rows) + ' rows</span>' +
      '<span>' + t.columns.length + ' cols</span>' +
      (t.usage ? '<span title="queries">' + fmtInt(t.usage.queries) + 'q</span>' : '') +
      (t.kind !== 'TABLE' ? '<span class="pill">view</span>' : '') + '</div></button>').join('')
      : '<div class="empty">No match</div>') + '</nav></aside>';
}

function renderTable(t) {
  if (!t) return '<div class="empty">No tables.</div>';

  const meta = [
    fmtInt(t.rows) + ' rows',
    fmtBytes(t.bytes),
    t.columns.length + ' columns',
    t.partitionField
      ? 'partitioned by ' + esc(t.partitionField) + ' (' + esc(t.partitionGranularity) + ', ' + t.partitionCount + ')'
      : 'not partitioned',
  ];
  if (t.clustering.length) meta.push('clustered by ' + t.clustering.map(esc).join(', '));
  if (t.lastModified) meta.push('modified ' + esc(t.lastModified.slice(0, 10)));

  let html = '<h2>' + esc(t.name) + '<span class="tag">' + esc(t.kind.toLowerCase().replace('_',' ')) + '</span></h2>';
  if (t.desc) html += '<p class="tdesc">' + esc(t.desc) + '</p>';
  html += '<div class="tm" style="color:var(--muted);margin:-4px 0 14px">' + meta.join(' · ') + '</div>';
  if (Object.keys(t.labels || {}).length)
    html += '<div style="margin:-8px 0 14px">' + Object.entries(t.labels)
      .map(([k,v]) => '<span class="tag">' + esc(k) + '=' + esc(v) + '</span>').join(' ') + '</div>';

  if (t.findings.length) {
    html += '<ul class="notes">' + t.findings.map(f =>
      '<li class="' + (f.severity === 'warn' ? 'note-warn' : '') + '">' +
      (f.column ? '<code>' + esc(f.column) + '</code> — ' : '') + esc(f.message) + '</li>').join('') + '</ul>';
  }

  html += '<div class="card"><div class="card-head">Query it<button class="ghost copy" data-copy="prev">Copy SQL</button></div>' +
    '<pre class="sql">' + esc(t.sql) + '</pre></div>';

  const hasDesc = t.columns.some(c => c.desc);
  html += '<h3>Columns</h3><div class="card scroll"><table class="cols">' +
    '<colgroup><col style="width:21%"><col style="width:12%"><col style="width:10%">' +
    '<col style="width:11%"><col style="width:9%"><col style="width:16%"><col style="width:21%"></colgroup>' +
    '<thead><tr>' +
    '<th>Column</th><th>Type</th><th>Role</th><th class="num">Null</th><th class="num">Distinct</th>' +
    '<th>' + (hasDesc ? 'Description' : 'Range') + '</th><th>Common values</th></tr></thead><tbody>' +
    t.columns.map(c => {
      const flags = (c.part ? '<span class="tag">part</span>' : '') + (c.clus ? '<span class="tag">clus</span>' : '') +
        (c.rep ? '<span class="tag">array</span>' : '');
      const range = (c.min !== null && c.max !== null)
        ? esc(String(c.min).slice(0,26)) + ' … ' + esc(String(c.max).slice(0,26)) : '—';
      return '<tr data-col="' + esc(c.p) + '"><td class="wrap-any"><code>' + esc(c.p) + '</code>' + flags + '</td>' +
        '<td class="mono clip" style="font-size:12px;color:var(--ink-2)" title="' + esc(c.t) + '">' + esc(c.t) + '</td>' +
        '<td style="color:var(--muted)">' + esc(c.r) + '</td>' +
        '<td class="num">' + nullMeter(c.n) + '</td>' +
        '<td class="num">' + fmtInt(c.d) + '</td>' +
        '<td class="clip" style="font-size:12px;color:var(--ink-2)" title="' + esc(hasDesc ? (c.desc || range) : range) + '">' +
          esc(hasDesc ? (c.desc || '—') : '') + (hasDesc ? '' : range) + '</td>' +
        '<td>' + topValues(c) + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<div style="color:var(--muted);font-size:12px;margin-top:6px">' + esc(t.profileNote) + '</div>';

  if (t.relations.length) {
    html += '<h3>Relationships</h3><div class="card"><table>' +
      '<colgroup><col style="width:26%"><col style="width:36%"><col style="width:16%">' +
      '<col style="width:11%"><col style="width:11%"></colgroup><thead><tr>' +
      '<th>This column</th><th>Joins</th><th>Kind</th><th class="num">Containment</th><th class="num">Shared</th>' +
      '</tr></thead><tbody>' + t.relations.map(r => {
        const cls = r.kind === 'foreign-key' ? 'fk' : r.kind === 'duplicate' ? 'duplicate' : 'overlap';
        const color = r.kind === 'foreign-key' ? 'var(--fk)' : r.kind === 'duplicate' ? 'var(--dup)' : 'var(--ovl)';
        const target = r.table + '.' + r.otherCol;
        return '<tr><td class="clip"><code>' + esc(r.col) + '</code></td>' +
          '<td class="clip"><a href="#" title="' + esc(target) + '" data-goto="' + esc(r.table) +
          '" data-gotocol="' + esc(r.otherCol) + '">' + esc(target) + '</a></td>' +
          '<td class="kind-' + cls + ' clip"><span class="dot" style="background:' + color + '"></span>' + esc(r.kind) + '</td>' +
          '<td class="num">' + r.containment.toFixed(2) + '</td>' +
          '<td class="num">' + fmtInt(r.shared) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div style="color:var(--muted);font-size:12px;margin-top:6px">Estimated from HyperLogLog sketches of real values. Treat as candidates, not guarantees.</div>';
  }

  if (t.reads.length || t.readBy.length) {
    html += '<h3>Lineage</h3><div class="card"><div style="padding:11px 13px;font-size:13px">' +
      (t.reads.length ? '<div>Reads: ' + t.reads.map(r => '<a href="#" data-goto="' + esc(r) + '">' + esc(r) + '</a>').join(', ') + '</div>' : '') +
      (t.readBy.length ? '<div>Read by: ' + t.readBy.map(r => '<a href="#" data-goto="' + esc(r) + '">' + esc(r) + '</a>').join(', ') + '</div>' : '') +
      '</div></div>';
  }

  if (t.usage) {
    const u = t.usage;
    html += '<h3>How it is used</h3><div class="card"><div style="padding:12px 14px">' +
      '<div class="usebar">' +
      usePill(fmtInt(u.queries), 'queries') + usePill(fmtInt(u.users), 'readers') +
      usePill(fmtBytes(u.bytes), 'scanned') + usePill((u.last||'').slice(0,10) || '—', 'last read') +
      '</div>' +
      (u.detection === 'named-in-sql'
        ? '<div style="color:var(--muted);font-size:12px;margin-top:8px">Matched by name in query text. A view never appears in BigQuery\'s referenced tables, so this is approximate.</div>'
        : '') +
      (u.topUsers.length ? '<div style="margin-top:10px;font-size:13px"><strong>Top readers:</strong> ' +
        u.topUsers.slice(0,5).map(x => esc(x.user) + ' (' + fmtInt(x.queries) + ')').join(', ') + '</div>' : '') +
      (u.coAccessed.length ? '<div style="margin-top:8px;font-size:13px"><strong>Queried alongside:</strong> ' +
        u.coAccessed.slice(0,6).map(c => '<a href="#" data-goto="' + esc(c.table) + '">' + esc(c.table) +
        '</a> (' + fmtInt(c.queries) + ')').join(', ') + '</div>' : '') +
      '</div></div>';
    if (u.examples.length) {
      html += '<div class="card"><details class="samples"><summary>' + u.examples.length +
        ' example quer' + (u.examples.length===1?'y':'ies') + ' people actually ran</summary>' +
        u.examples.map(e => '<div class="card-head" style="border-top:1px solid var(--grid)">' +
          esc(e.user || 'unknown') + ' · ' + esc((e.at||'').slice(0,16)) +
          '<button class="ghost copy" data-copy="' + esc(e.sql) + '">Copy</button></div>' +
          '<pre class="sql">' + esc(e.sql.trim()) + '</pre>').join('') +
        '</details></div>';
    }
  }

  if (t.samples.length) {
    html += '<h3>Sample rows</h3><div class="card"><details class="samples"><summary>' + t.samples.length +
      ' rows (read from storage metadata, no query cost)</summary>' +
      '<div class="card-head" style="border-top:0"><span></span><button class="ghost copy" data-copy="prev">Copy JSON</button></div>' +
      '<pre class="json">' + esc(JSON.stringify(t.samples, null, 2)) + '</pre></details></div>';
  }

  if (t.ddl) {
    html += '<h3>DDL</h3><div class="card"><details class="samples"><summary>Show definition</summary>' +
      '<pre class="sql">' + esc(t.ddl.trim()) + '</pre></details></div>';
  }

  return html;
}

function render() {
  const t = tableByName(current);
  const totals = DATA.totals;
  app.innerHTML = '<div class="shell">' + renderSide() +
    '<div class="main"><div class="topbar">' +
      '<button class="kbtn" id="open-pal"><span>Search tables and columns…</span>' +
      '<span class="kbd" style="margin-left:auto">' + (navigator.platform.includes('Mac') ? '⌘' : 'Ctrl ') + 'K</span></button>' +
      '<div class="spacer"></div>' +
      '<button class="ghost" id="theme">Theme</button></div>' +
    '<div class="wrap"><div class="tiles">' +
      tile(fmtInt(totals.tables + totals.views), 'objects') +
      tile(fmtInt(totals.rows), 'rows') +
      tile(fmtBytes(totals.bytes), 'stored') +
      tile(fmtInt(totals.columns), 'columns') +
      tile(fmtInt(totals.relationships), 'relationships') +
      tile(fmtBytes(totals.bytesScanned), 'scanned to profile') +
      (DATA.usageScope
        ? tile(fmtInt(DATA.tables.reduce((s,x) => s + (x.usage ? x.usage.queries : 0), 0)),
               'queries in ' + DATA.usageDays + 'd')
        : '') +
    '</div>' + usageBanner() + renderTable(t) + '</div></div></div>';

  document.getElementById('open-pal').onclick = openPalette;
  document.getElementById('theme').onclick = () => {
    const order = ['auto', 'light', 'dark'];
    const now = localStorage.getItem('ak-audit-theme') || 'auto';
    localStorage.setItem('ak-audit-theme', order[(order.indexOf(now) + 1) % 3]);
    applyTheme();
  };
  const sf = document.getElementById('sf');
  sf.oninput = e => {
    sideFilter = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const next = document.getElementById('sf');
    next.focus();
    next.setSelectionRange(pos, pos);
  };
  app.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => select(b.dataset.t); });
  app.querySelectorAll('[data-goto]').forEach(a => {
    a.onclick = e => { e.preventDefault(); select(a.dataset.goto, a.dataset.gotocol); };
  });
}

function usePill(v, l) {
  return '<span class="upill"><strong>' + v + '</strong> ' + l + '</span>';
}

/* A caller-only history answers a different question from a project-wide
   one, so the report says which it is rather than implying coverage. */
function usageBanner() {
  if (!DATA.usageScope) return '';
  const scoped = DATA.usageScope === 'user';
  const unused = DATA.unusedTables.length;
  return '<div class="banner' + (scoped ? ' warn' : '') + '">' +
    (scoped
      ? 'Query history covers <strong>only your own queries</strong> — project-wide history needs bigquery.jobs.listAll. Treat "unread" with care.'
      : 'Query history covers <strong>all users</strong>, last ' + DATA.usageDays + ' days.') +
    (unused ? ' <strong>' + unused + '</strong> table(s) went unread: ' +
      DATA.unusedTables.slice(0,12).map(esc).join(', ') + (unused>12?' …':'') : '') +
    '</div>';
}

function tile(v, l) {
  return '<div class="tile"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';
}

render();
})();
`;
