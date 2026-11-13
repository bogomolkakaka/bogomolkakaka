import { $, $$, esc, h, ICON, todayKey, addDays, fmtDay, zoned } from '../util.js';
import { wall } from '../store.js';
import { drawMini } from '../wallmini.js';
import { mountBoard } from './wall.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let R = null, inner = null, token = 0;

export async function mount(root, params) { R = root; await show(params); return () => { if (inner) inner(); inner = null; R = null; }; }
export async function update(params) { if (R) await show(params); }

async function show(params) {
  const my = ++token;
  if (inner) { inner(); inner = null; }
  const today = todayKey();
  const day = params[0];
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    if (day >= today) { location.hash = '#/wall'; return; }
    R.innerHTML = '';
    const holder = h('<div></div>'); R.appendChild(holder);
    const cleanup = await mountBoard(holder, { day, live: false, back: { href: `#/capsule/month/${day.slice(0, 7)}`, label: 'Back to the calendar' } });
    if (my !== token) { cleanup && cleanup(); return; }
    inner = cleanup;
    const prev = addDays(day, -1), next = addDays(day, 1);
    const nav = h(`<div class="cap-daynav"><a class="btn btn--ghost btn--small" href="#/capsule/${prev}">${ICON.left}${esc(fmtDay(prev, { day: 'numeric', month: 'short' }))}</a>
      <a class="btn btn--ghost btn--small" href="${next >= today ? '#/wall' : '#/capsule/' + next}">${next >= today ? 'Today' : esc(fmtDay(next, { day: 'numeric', month: 'short' }))}${ICON.right}</a></div>`);
    const r = $('.wallhead__r', holder); if (r) r.appendChild(nav);
    return;
  }
  const z = zoned();
  let y = z.y, m = z.m;
  if (params[0] === 'month' && /^\d{4}-\d{2}$/.test(params[1] || '')) { y = +params[1].slice(0, 4); m = +params[1].slice(5, 7); }
  const mm = String(m).padStart(2, '0');
  const first = `${y}-${mm}-01`;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${mm}-${String(dim).padStart(2, '0')}`;
  const prevM = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const nextM = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const isFutureMonth = first > today;
  const years = []; for (let k = z.y - 3; k <= z.y; k++) years.push(k);
  R.innerHTML = `<div class="page">
    <div class="page-head"><div><a class="back" href="#/">${ICON.back}Back to the desk</a>
      <h1 class="page-title">Time Capsule</h1><p class="page-sub">every wall we made together, one square per day</p></div></div>
    <div class="cap-nav">
      <a class="iconbtn" href="#/capsule/month/${prevM}" aria-label="Previous month">${ICON.left}</a>
      <h2 aria-live="polite">${MONTHS[m - 1]} ${y}</h2>
      <a class="iconbtn" href="#/capsule/month/${nextM}" aria-label="Next month" ${nextM > today.slice(0, 7) ? 'aria-disabled="true" tabindex="-1" style="opacity:.3;pointer-events:none"' : ''}>${ICON.right}</a>
      <label class="sr-only" for="cap-m">Month</label><select class="input" id="cap-m">${MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label class="sr-only" for="cap-y">Year</label><select class="input" id="cap-y">${years.map(v => `<option ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <a class="btn btn--ghost btn--small" href="#/wall">Today’s wall</a>
    </div>
    <div class="cap-grid" role="presentation">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cap-wd" aria-hidden="true">${d}</div>`).join('')}</div>
    <ol class="cap-grid" id="cap-days" aria-label="Days of ${MONTHS[m - 1]} ${y}"><li class="cap-legend" style="grid-column:1/-1">Opening the capsule…</li></ol>
    <p class="cap-legend">Each square is a small copy of that day’s wall. Past walls are read-only.</p>
  </div>`;
  const go = () => { const mv = $('#cap-m', R).value.padStart(2, '0'); location.hash = `#/capsule/month/${$('#cap-y', R).value}-${mv}`; };
  $('#cap-m', R).addEventListener('change', go); $('#cap-y', R).addEventListener('change', go);

  let items = [];
  if (!isFutureMonth) {
    try { items = await wall.listRange(first, last < today ? last : today); }
    catch (e) { $('#cap-days', R).innerHTML = `<li class="cap-legend" style="grid-column:1/-1">${esc(e.message || 'The capsule did not open.')}</li>`; return; }
  }
  if (my !== token || !R) return;
  const byDay = new Map();
  items.forEach(it => { if (!byDay.has(it.day)) byDay.set(it.day, []); byDay.get(it.day).push(it); });
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  let html = '';
  for (let i = 0; i < lead; i++) html += '<li class="cap-day cap-day--empty" aria-hidden="true"></li>';
  for (let d = 1; d <= dim; d++) {
    const key = `${y}-${mm}-${String(d).padStart(2, '0')}`;
    const list = byDay.get(key) || [];
    const label = fmtDay(key, { weekday: 'long', day: 'numeric', month: 'long' });
    if (key > today) html += `<li class="cap-day cap-day--future" aria-label="${esc(label)}, not yet"><span class="cap-day__n">${d}</span></li>`;
    else if (key === today) html += `<li><a class="cap-day cap-day--today" href="#/wall" aria-label="${esc(label)}: today, still open, ${list.length} things"><span class="cap-day__n">${d}</span><canvas width="240" height="160" data-day="${key}"></canvas><span class="cap-day__c"><span class="cap-today">today · </span>${list.length}</span></a></li>`;
    else if (list.length) html += `<li><a class="cap-day" href="#/capsule/${key}" aria-label="${esc(label)}: ${list.length} things"><span class="cap-day__n">${d}</span><canvas width="240" height="160" data-day="${key}"></canvas><span class="cap-day__c">${list.length}</span></a></li>`;
    else html += `<li class="cap-day cap-day--quiet" aria-label="${esc(label)}: quiet day"><span class="cap-day__n">${d}</span><span class="q">quiet day</span></li>`;
  }
  $('#cap-days', R).innerHTML = html;
  $$('canvas[data-day]', R).forEach(cv => drawMini(cv, byDay.get(cv.dataset.day) || [], { bg: '#ffffff', redraw: true, fit: 'content' }));
}
