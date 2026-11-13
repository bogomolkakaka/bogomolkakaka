// LITTLE OBJECTS: the figurine shelf. Visitors browse and ask to buy; the signed-in owner edits in "studio" mode.
import { CONFIG } from '../config.js';
import { $, $$, esc, h, ICON, sound, toast, openModal, confirmBox, sleep } from '../util.js';
import { objects as store, upload, config, state, onAuth } from '../store.js';

const STATUS = {
  available: { label: 'Available', cta: 'Request to buy', ru: 'В наличии' },
  soon: { label: 'Coming soon', cta: 'Ask to reserve', ru: 'Скоро' },
  soldout: { label: 'Sold out', cta: 'Ask about a new batch', ru: 'Продано' }
};
const FILTERS = [['all', 'All'], ['available', 'Available'], ['soon', 'Coming soon'], ['soldout', 'Sold out']];
const DEFAULT_INTRO = 'Small characters from my own little world. I model each one in 3D, print it layer by layer, paint it by hand and photograph it on my desk.';
const URL_RE = /^(https:\/\/[^\s"'<>]+|assets\/[\w./-]+)$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const str = (v, max = 4000) => typeof v === 'string' ? v.slice(0, max) : '';

function norm(d) {
  const photos = Array.isArray(d.photos) ? d.photos.filter(x => typeof x === 'string' && URL_RE.test(x)) : [];
  const colors = Array.isArray(d.colors) ? d.colors.filter(c => c && typeof c === 'object').map(c => ({ name: str(c.name, 40), hex: HEX_RE.test(c.hex) ? c.hex : '#cccccc', photo: photos.includes(c.photo) ? c.photo : '' })) : [];
  return {
    id: String(d.id), name: str(d.name, 80) || 'Untitled', nick: str(d.nick, 120), story: str(d.story, 6000), price: str(d.price, 40),
    status: STATUS[d.status] ? d.status : 'available', num: str(d.num, 10), height: str(d.height, 60), material: str(d.material, 120),
    edition: str(d.edition, 60), printTime: str(d.printTime, 60), photos, colors, draft: !!d.draft, demo: !!d.demo,
    order: Number.isFinite(d.order) ? d.order : 1e9, createdAt: Number.isFinite(d.createdAt) ? d.createdAt : 0
  };
}
const byOrder = (a, b) => (a.order - b.order) || (a.createdAt - b.createdAt) || a.id.localeCompare(b.id);
const numLabel = o => o.num ? '№ ' + o.num : '';

let S = null, R = null;

export async function mount(root, params) {
  R = root;
  S = { objects: [], cfg: {}, loaded: false, failed: '', filter: 'all', studio: false, dragging: false, first: true, open: null, photo: 0, color: -1, ed: null, returnFocus: null };
  root.innerHTML = `<div class="lo">
    <div id="studio-bar"></div>
    <header class="top">
      <a class="back" href="#/">${ICON.back}Back to the desk</a>
      <div class="top__head">
        <h1 class="title"><span class="title__little">Little</span><span class="title__big">Objects</span></h1>
        <p class="hand-note"><svg viewBox="0 0 48 30" fill="none" aria-hidden="true"><path d="M46 8C34 2 18 4 6 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M6 20l1.5-10M6 20l9.5-3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>made by hand, one layer at a time</p>
      </div>
      <div class="top__row"><p class="intro" id="lo-intro"></p><div class="filters" id="lo-filters" role="group" aria-label="Show objects"></div></div>
    </header>
    <main class="room"><ul class="shelf" id="lo-shelf" aria-label="Collection"></ul></main>
    <footer class="foot" id="lo-foot"></footer>
    <div id="lo-sheet"></div><div id="lo-zoom"></div><div id="lo-drawer"></div>
    <button class="btn btn--primary studio-toggle" id="lo-studio" type="button" hidden>${ICON.pen}Студия</button>
  </div>`;
  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKey);
  const offAuth = onAuth(() => { if (!state.admin) S.studio = false; renderAll(); });
  renderAll();
  await load();
  route(params);
  return () => { document.removeEventListener('keydown', onKey); offAuth(); document.documentElement.classList.remove('locked'); R = null; S = null; };
}
export function update(params) { if (S) route(params); }

async function load() {
  try {
    const [list, cfg] = await Promise.all([store.list(), config.all()]);
    if (!S) return;
    S.objects = list.map(norm).sort(byOrder); S.cfg = cfg; S.loaded = true; S.failed = '';
  } catch (e) { if (S) S.failed = `<strong>The shelf could not be loaded</strong>${esc(e.message || 'Reload the page to try again.')}`; }
  renderAll();
}
const visible = () => S.studio ? S.objects : S.objects.filter(o => !o.draft);
const shown = () => visible().filter(o => S.filter === 'all' || o.status === S.filter);
const $r = s => R && R.querySelector(s);

function renderAll() {
  if (!R || !S) return;
  renderHeader(); renderShelf(); renderFoot(); renderStudioBar();
  if (S.open) renderSheet(false);
}
function renderHeader() {
  $r('#lo-intro').textContent = str(S.cfg.objects_intro, 600).trim() || DEFAULT_INTRO;
  const list = visible(); const counts = { all: list.length };
  for (const k of Object.keys(STATUS)) counts[k] = list.filter(o => o.status === k).length;
  $r('#lo-filters').innerHTML = FILTERS.map(([k, label]) => (k === 'all' || counts[k] || S.filter === k) ? `<button class="chip" data-act="filter" data-f="${k}" aria-pressed="${S.filter === k}">${label} <small>${counts[k]}</small></button>` : '').join('');
}
function contacts() {
  const c = { ...CONFIG.CONTACTS, ...(S.cfg.contacts || {}) };
  const email = str(c.email, 120).trim();
  const tg = str(c.telegram, 64).trim().replace(/^@|^https?:\/\/t\.me\//i, '').replace(/[^A-Za-z0-9_]/g, '');
  const ig = str(c.instagram, 64).trim().replace(/^@|^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[^A-Za-z0-9_.]/g, '');
  return { email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? email : '', tg: tg.length >= 3 ? tg : '', ig };
}
function renderFoot() {
  const c = contacts(); const links = [];
  if (c.email) links.push(`<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`);
  if (c.tg) links.push(`<a href="https://t.me/${esc(c.tg)}" target="_blank" rel="noopener">Telegram @${esc(c.tg)}</a>`);
  if (c.ig) links.push(`<a href="https://instagram.com/${esc(c.ig)}" target="_blank" rel="noopener">Instagram @${esc(c.ig)}</a>`);
  $r('#lo-foot').innerHTML = `<span class="foot__hand">Every object here is modelled, printed and painted by hand.</span>${links.length ? `<span class="foot__links">${links.join('')}</span>` : ''}`;
}

/* ---------- shelf ---------- */
function tagHTML(o) {
  const st = STATUS[o.status];
  const big = o.status === 'soon' ? (o.price || 'soon!') : o.status === 'soldout' ? (o.price || '') : (o.price || st.label);
  const small = (o.status === 'soon' && !o.price) || o.status === 'soldout' ? '' : (o.price ? st.label : '');
  return `<div class="hang" aria-hidden="true"><span class="hang__pin"></span><div class="hang__swing"><span class="tag-shadow"></span>
    <div class="tag tag--${o.status}"><span class="tag__price">${esc(big)}</span>${small ? `<span class="tag__status">${esc(small)}</span>` : ''}</div>
    <span class="hang__string"></span>${o.status === 'soldout' ? '<span class="stamp">Sold out</span>' : ''}</div></div>`;
}
function cardHTML(o, i, list) {
  const st = STATUS[o.status];
  const [p1, p2] = o.photos;
  const label = [o.name, st.label, o.price].filter(Boolean).join(', ');
  const photos = p1 ? `<span class="obj__photos"><img class="p1" src="${esc(p1)}" alt="" ${i > 2 ? 'loading="lazy"' : ''} decoding="async">${p2 ? `<img class="p2" src="${esc(p2)}" alt="" loading="lazy" decoding="async">` : ''}</span>` : `<span class="obj__photos is-empty">no photo yet</span>`;
  const ctl = S.studio ? `<div class="ctl" role="group" aria-label="Управление: ${esc(o.name)}">
    <button class="ctl__drag" data-act="drag" aria-label="Перетащить, чтобы поменять порядок" title="Перетащить">${ICON.grip}</button>
    <button class="ctl__move" data-act="move" data-dir="-1" aria-label="Переместить раньше" ${i === 0 ? 'disabled' : ''}>${ICON.left}</button>
    <button class="ctl__move" data-act="move" data-dir="1" aria-label="Переместить позже" ${i === list.length - 1 ? 'disabled' : ''}>${ICON.right}</button>
    <button data-act="edit">${ICON.pen}Изменить</button>
    <button class="ctl__del" data-act="delete" aria-label="Удалить ${esc(o.name)}">${ICON.trash}</button></div>` : '';
  const dots = o.colors.length > 1 ? `<span class="dots" aria-label="${o.colors.length} colours">${o.colors.map(c => `<span class="dot" style="--c:${esc(c.hex)}" title="${esc(c.name)}"></span>`).join('')}</span>` : '';
  return `<li class="obj${o.draft ? ' is-draft' : ''}" data-id="${esc(o.id)}" style="--i:${i}">
    <div class="obj__stand">${ctl}
      <a class="obj__frame" href="#/objects/${esc(o.id)}" aria-label="${esc(label)}">${photos}${o.demo ? '<span class="sticker">demo</span>' : ''}${o.draft ? '<span class="sticker sticker--draft">Черновик</span>' : ''}</a>
      ${tagHTML(o)}</div>
    <div class="board" data-act="knock" aria-hidden="true"></div>
    <div class="obj__cap">${o.num ? `<span class="obj__num">${esc(numLabel(o))}</span>` : ''}
      <h2 class="obj__name"><a href="#/objects/${esc(o.id)}" tabindex="-1">${esc(o.name)}</a></h2>${o.nick ? `<p class="obj__nick">${esc(o.nick)}</p>` : ''}${dots}</div></li>`;
}
const cols = () => parseInt(getComputedStyle(R.querySelector('.lo')).getPropertyValue('--cols'), 10) || 1;
function renderShelf() {
  if (S.dragging) return;
  const shelf = $r('#lo-shelf');
  shelf.classList.toggle('one-col', cols() === 1);
  if (S.failed) { shelf.innerHTML = `<li class="shelf-note">${S.failed}</li>`; return; }
  if (!S.loaded) { shelf.innerHTML = [0, 1, 2].map(i => `<li class="obj skeleton" style="--i:${i}" aria-hidden="true"><div class="obj__stand"><div class="obj__frame"><span class="obj__photos"></span></div></div><div class="board"></div></li>`).join(''); return; }
  const list = shown();
  if (!list.length) {
    shelf.innerHTML = S.studio && !S.objects.length ? `<li class="shelf-note"><strong>Полка пока пустая</strong>Добавь первую фигурку.<br><br><button class="btn btn--primary" data-act="add">${ICON.plus}Добавить фигурку</button></li>`
      : S.filter !== 'all' ? `<li class="shelf-note"><strong>Nothing here right now</strong>No objects with this status. <button class="linkbtn" data-act="filter" data-f="all">Show all objects</button></li>`
      : `<li class="shelf-note"><strong>New objects are on their way</strong>The shelf is being dusted. Come back soon.</li>`;
    return;
  }
  shelf.innerHTML = list.map((o, i) => cardHTML(o, i, list)).join('');
  if (S.first) { S.first = false; shelf.classList.add('is-first'); setTimeout(() => shelf.classList.remove('is-first'), 1400); }
  $$('img', shelf).forEach(img => img.addEventListener('error', () => img.classList.add('is-broken'), { once: true }));
}

/* ---------- routing / sheet ---------- */
function route(params) {
  const id = params && params[0];
  if (id) {
    if (!S.loaded) return;
    const o = visible().find(x => x.id === id);
    if (!o) { closeSheet(true); return; }
    if (S.open !== o.id) { S.open = o.id; S.photo = 0; S.color = -1; S.returnFocus = S.returnFocus || document.activeElement; }
    renderSheet(true);
  } else if (S.open) closeSheet(false);
}
function closeSheet(setHash) {
  const was = S.open;
  S.open = null; $r('#lo-sheet').innerHTML = ''; $r('#lo-zoom').innerHTML = '';
  document.documentElement.classList.remove('locked');
  if (setHash && location.hash !== '#/objects') history.replaceState(null, '', '#/objects');
  const el = was && $r(`.obj[data-id="${CSS.escape(was)}"] .obj__frame`);
  if (el) el.focus({ preventScroll: true });
  S.returnFocus = null;
}
function renderSheet(fresh) {
  const o = visible().find(x => x.id === S.open);
  if (!o) { closeSheet(true); return; }
  const host = $r('#lo-sheet');
  const list = shown().some(x => x.id === o.id) ? shown() : visible();
  const idx = list.findIndex(x => x.id === o.id), prev = list[idx - 1], next = list[idx + 1];
  const n = o.photos.length; S.photo = Math.max(0, Math.min(S.photo, n - 1));
  const cur = o.photos[S.photo], st = STATUS[o.status];
  const paras = o.story.trim() ? o.story.trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : '';
  const specs = [['Height', o.height], ['Material', o.material], ['Edition', o.edition], ['Print time', o.printTime]].filter(x => x[1]);
  const keep = !fresh && $('.sheet', host) ? $('.sheet', host).scrollTop : 0;
  host.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet__bar"><a class="linkbtn" href="#/objects" data-act="close">${ICON.back}Back to the shelf</a>
      <div class="sheet__nav">
        <a class="iconbtn" href="${prev ? '#/objects/' + esc(prev.id) : '#/objects'}" aria-label="Previous object${prev ? ': ' + esc(prev.name) : ''}" ${prev ? '' : 'aria-disabled="true" tabindex="-1" style="opacity:.3;pointer-events:none"'}>${ICON.left}</a>
        <span class="sheet__pos">${idx + 1} of ${list.length}</span>
        <a class="iconbtn" href="${next ? '#/objects/' + esc(next.id) : '#/objects'}" aria-label="Next object${next ? ': ' + esc(next.name) : ''}" ${next ? '' : 'aria-disabled="true" tabindex="-1" style="opacity:.3;pointer-events:none"'}>${ICON.right}</a></div></div>
    <div class="sheet__body">
      <div class="stage"><div class="stage__frame">
        ${cur ? `<img class="stage__img" id="stage-img" src="${esc(cur)}" alt="${esc(o.name)}, photo ${S.photo + 1} of ${n}" draggable="false">` : `<div class="stage__img" style="display:grid;place-items:center;cursor:default;font-family:var(--font-hand);font-size:30px;color:var(--muted)">Photos coming soon</div>`}
        ${n > 1 ? `<button class="iconbtn stage__arrow stage__arrow--prev" data-act="photo" data-dir="-1" aria-label="Previous photo">${ICON.left}</button><button class="iconbtn stage__arrow stage__arrow--next" data-act="photo" data-dir="1" aria-label="Next photo">${ICON.right}</button><span class="stage__count" aria-hidden="true">${S.photo + 1} / ${n}</span>` : ''}
      </div>${n > 1 ? `<ul class="thumbs" aria-label="Photos">${o.photos.map((p, i) => `<li><button data-act="thumb" data-i="${i}" aria-label="Photo ${i + 1}" aria-current="${i === S.photo}"><img src="${esc(p)}" alt="" loading="lazy"></button></li>`).join('')}</ul>` : ''}</div>
      <div class="info">
        <div>${o.num ? `<div class="info__num">${esc(numLabel(o))}</div>` : ''}<h2 class="info__name" id="sheet-title">${esc(o.name)}</h2>${o.nick ? `<p class="info__nick">${esc(o.nick)}</p>` : ''}</div>
        <div class="buyline">${o.price ? `<span class="buyline__price${o.status === 'soldout' ? ' is-struck' : ''}">${esc(o.price)}</span>` : ''}<span class="pill pill--${o.status}">${st.label}</span>
          <button class="btn ${o.status === 'soldout' ? 'btn--ghost' : 'btn--primary'}" data-act="request">${st.cta}</button></div>
        ${paras ? `<div class="story">${paras}</div>` : ''}
        ${o.colors.length ? `<div><h3 class="block__title">${o.colors.length > 1 ? 'Colours' : 'Colour'}</h3><ul class="swatches">${o.colors.map((c, i) => `<li><button class="swatch" data-act="color" data-i="${i}" aria-pressed="${S.color === i}"><span class="swatch__c" style="--c:${esc(c.hex)}"></span>${esc(c.name || 'Colour ' + (i + 1))}</button></li>`).join('')}</ul></div>` : ''}
        ${specs.length ? `<div><h3 class="block__title">Details</h3><dl class="specs">${specs.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : ''}
        ${state.admin && S.studio ? `<div><button class="btn btn--ink" data-act="edit" data-id="${esc(o.id)}">${ICON.pen}Изменить фигурку</button></div>` : ''}
        <div class="more">${prev ? `<a class="linkbtn" href="#/objects/${esc(prev.id)}">${ICON.left}<span>${esc(prev.name)}</span></a>` : '<span></span>'}${next ? `<a class="linkbtn" href="#/objects/${esc(next.id)}"><span>${esc(next.name)}</span>${ICON.right}</a>` : ''}</div>
      </div></div></div>`;
  document.documentElement.classList.add('locked');
  const sheet = $('.sheet', host);
  if (fresh) { sheet.scrollTop = 0; $('[data-act="close"]', sheet).focus({ preventScroll: true }); } else sheet.scrollTop = keep;
  const img = $('#stage-img', host);
  if (img) { img.addEventListener('error', () => img.classList.add('is-broken'), { once: true }); bindSwipe(img, o); }
}
function setPhoto(i) {
  const o = visible().find(x => x.id === S.open);
  if (!o || !o.photos.length) return;
  S.photo = (i + o.photos.length) % o.photos.length;
  const c = o.colors[S.color]; if (c && c.photo !== o.photos[S.photo]) S.color = -1;
  renderSheet(false);
  const z = $r('#lo-zoom img'); if (z) z.src = o.photos[S.photo];
}
function bindSwipe(el, o) {
  let x0 = null, y0 = 0, t0 = 0;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); });
  el.addEventListener('pointerup', e => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && o.photos.length > 1) setPhoto(S.photo + (dx < 0 ? 1 : -1));
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && Date.now() - t0 < 500) openZoom();
  });
  el.addEventListener('pointercancel', () => { x0 = null; });
}
function openZoom() {
  const o = visible().find(x => x.id === S.open); if (!o || !o.photos.length) return;
  $r('#lo-zoom').innerHTML = `<div class="zoom" role="dialog" aria-modal="true" aria-label="${esc(o.name)}, full size photo"><img src="${esc(o.photos[S.photo])}" alt="${esc(o.name)}, photo ${S.photo + 1}" data-act="unzoom"><button class="iconbtn" data-act="unzoom" aria-label="Close full size photo">${ICON.close}</button></div>`;
  $r('#lo-zoom .iconbtn').focus();
}

/* ---------- request ---------- */
function requestText(o, colorName) {
  const ref = o.num ? `${o.name} (№ ${o.num})` : o.name, inC = colorName ? ` in ${colorName}` : '';
  if (o.status === 'soon') return `Hi! I'd like to reserve ${ref}${inC} when it's ready.`;
  if (o.status === 'soldout') return `Hi! I saw that ${ref} is sold out. Please let me know if you make a new batch${inC}.`;
  return `Hi! I'd like to buy ${ref}${inC}. Is it still available?`;
}
function openRequest() {
  const o = visible().find(x => x.id === S.open); if (!o) return;
  const c = contacts(), any = c.email || c.tg || c.ig;
  const colorName = o.colors[S.color] ? o.colors[S.color].name : (o.colors.length === 1 ? o.colors[0].name : '');
  const titles = { available: `Request ${o.name}`, soon: `Reserve ${o.name}`, soldout: `Ask about ${o.name}` };
  const m = openModal(`<h2>${esc(titles[o.status])}</h2>
    <p>${any ? `Check the message, then send it to me by ${[c.email && 'email', c.tg && 'Telegram', c.ig && 'Instagram'].filter(Boolean).join(' or ')}.` : 'Check the message and copy it.'} Nothing is paid on this site.</p>
    ${o.colors.length > 1 ? `<div class="field"><label for="req-color">Colour</label><select id="req-color"><option value="">Any colour</option>${o.colors.map((cl, i) => `<option value="${i}" ${cl.name === colorName ? 'selected' : ''}>${esc(cl.name || 'Colour ' + (i + 1))}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label for="req-msg">Your message</label><textarea id="req-msg" rows="4"></textarea></div>
    <div class="sendto">
      <button class="btn btn--ink" type="button" id="req-copy">${ICON.copy}<span>Copy message</span></button>
      ${c.email ? `<a class="btn btn--primary" id="req-mail" href="#" target="_blank" rel="noopener">${ICON.mail}<span>Send by email <span class="sendto__addr">${esc(c.email)}</span></span></a>` : ''}
      ${c.tg ? `<a class="btn btn--ghost" href="https://t.me/${esc(c.tg)}" target="_blank" rel="noopener">${ICON.send}<span>Open Telegram <span class="sendto__addr">@${esc(c.tg)}</span></span></a>` : ''}
      ${c.ig ? `<a class="btn btn--ghost" href="https://instagram.com/${esc(c.ig)}" target="_blank" rel="noopener">${ICON.insta}<span>Open Instagram <span class="sendto__addr">@${esc(c.ig)}</span></span></a>` : ''}
    </div>
    <p class="hint">${any ? (c.tg || c.ig ? 'For Telegram and Instagram, copy the message first and paste it into the chat.' : 'If the email button does not open your mail app, copy the message and send it to the address above.') : (state.admin ? 'Посетители пока не видят, куда писать. Добавь почту или Telegram: Студия → Контакты и вступление.' : 'Contact details are coming soon. Copy the message to keep it for later.')}</p>`, { label: titles[o.status] });
  const msg = $('#req-msg', m.el), sel = $('#req-color', m.el);
  const syncMail = () => { const a = $('#req-mail', m.el); if (a) a.href = `mailto:${c.email}?subject=${encodeURIComponent('Little objects: ' + o.name)}&body=${encodeURIComponent(msg.value)}`; };
  const upd = () => { msg.value = requestText(o, sel ? (sel.value === '' ? '' : (o.colors[+sel.value] || {}).name) : colorName); syncMail(); };
  if (sel) sel.addEventListener('change', upd);
  msg.addEventListener('input', syncMail); upd();
  $('#req-copy', m.el).addEventListener('click', async e => {
    const label = $('span', e.currentTarget);
    try { await navigator.clipboard.writeText(msg.value); label.textContent = 'Copied'; } catch (er) { msg.focus(); msg.select(); label.textContent = 'Selected: press Ctrl+C'; }
    setTimeout(() => { if (label.isConnected) label.textContent = 'Copy message'; }, 2600);
  });
}

/* ---------- studio (owner) ---------- */
function renderStudioBar() {
  const bar = $r('#studio-bar'), tg = $r('#lo-studio');
  if (!state.admin) { bar.innerHTML = ''; tg.hidden = true; S.studio = false; return; }
  tg.hidden = S.studio;
  bar.innerHTML = S.studio ? `<div class="studio-bar"><div class="studio-bar__in"><p>Режим студии. Изменения сохраняются сразу и видны всем. Порядок меняется перетаскиванием за синюю ручку или стрелками.</p>
    <div class="studio-bar__actions"><button class="btn btn--primary" data-act="add">${ICON.plus}Добавить фигурку</button><button class="btn btn--ghost" data-act="settings">Контакты и вступление</button><button class="btn btn--ghost" data-act="studio">Готово</button></div></div></div>` : '';
}
function errText(e) { return (e && e.message) || 'Не получилось сохранить. Проверь интернет и попробуй ещё раз.'; }
async function commitOrder(ids) {
  const byId = new Map(S.objects.map(o => [o.id, o]));
  const all = [...S.objects].sort(byOrder);
  const sorted = ids.map(id => byId.get(id).order).sort((a, b) => a - b);
  const unique = new Set(S.objects.map(o => o.order)).size === S.objects.length && sorted.every(v => v < 1e9);
  let plan;
  if (unique) plan = ids.map((id, i) => [id, sorted[i]]);
  else { const sub = new Set(ids), q = [...ids]; plan = all.map(o => sub.has(o.id) ? q.shift() : o.id).map((id, i) => [id, (i + 1) * 10]); }
  const changes = plan.filter(([id, v]) => byId.get(id).order !== v);
  if (!changes.length) { renderShelf(); return; }
  changes.forEach(([id, v]) => { byId.get(id).order = v; });
  S.objects.sort(byOrder); renderShelf();
  try { for (const [id, v] of changes) await store.setOrder(id, v); toast('Порядок сохранён'); }
  catch (e) { toast(errText(e), true); load(); }
}
function moveBy(id, dir) {
  const ids = shown().map(o => o.id), i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  commitOrder(ids).then(() => { const b = $r(`.obj[data-id="${CSS.escape(id)}"] [data-act="move"][data-dir="${dir}"]`) || $r(`.obj[data-id="${CSS.escape(id)}"] [data-act="edit"]`); if (b) b.focus(); });
}
function onPointerDown(e) {
  const hd = e.target.closest('[data-act="drag"]');
  if (!hd || !S.studio) return;
  const li = hd.closest('.obj');
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const shelf = $r('#lo-shelf'), rect = li.getBoundingClientRect(), ghost = li.cloneNode(true);
  ghost.classList.add('ghost'); Object.assign(ghost.style, { width: rect.width + 'px', left: rect.left + 'px', top: rect.top + 'px' });
  R.querySelector('.lo').appendChild(ghost);
  const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
  li.classList.add('is-placeholder'); document.body.classList.add('is-dragging'); S.dragging = true;
  let lastY = e.clientY, raf = 0, moved = false;
  const move = ev => {
    moved = true; ghost.style.transform = `translate(${ev.clientX - dx - rect.left}px, ${ev.clientY - dy - rect.top}px) rotate(2deg)`; lastY = ev.clientY;
    for (const it of shelf.children) {
      if (it === li) continue;
      const r = it.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { const kids = [...shelf.children]; if (kids.indexOf(li) < kids.indexOf(it)) it.after(li); else it.before(li); break; }
    }
  };
  const tick = () => { if (lastY < 80) scrollBy(0, -12); else if (lastY > innerHeight - 120) scrollBy(0, 12); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  const up = () => {
    cancelAnimationFrame(raf); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    ghost.remove(); li.classList.remove('is-placeholder'); document.body.classList.remove('is-dragging'); S.dragging = false;
    const ids = [...shelf.children].map(x => x.dataset.id).filter(Boolean);
    if (moved) commitOrder(ids); else renderShelf();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

function blank() {
  const nums = S.objects.map(o => parseInt(o.num, 10)).filter(Number.isFinite);
  return norm({ id: '', name: '', status: 'available', num: String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0'), photos: [], colors: [] });
}
function openEditor(id) {
  if (!state.admin) return;
  const src = id ? S.objects.find(o => o.id === id) : null;
  if (id && !src) return;
  const d = JSON.parse(JSON.stringify(src || blank())); if (!src) d.name = '';
  S.ed = { id: src ? src.id : null, isNew: !src, d, photos: d.photos.map(u => ({ url: u })), colors: d.colors.map(c => ({ ...c })), dirty: false, saving: false, returnTo: document.activeElement };
  const ED = S.ed;
  $r('#lo-drawer').innerHTML = `<div class="drawer" data-act="ed-bg"><div class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="ed-title">
    <div class="drawer__head"><h2 id="ed-title">${ED.isNew ? 'Новая фигурка' : 'Редактирование'}</h2><button class="iconbtn" data-act="ed-close" aria-label="Закрыть">${ICON.close}</button></div>
    <div class="drawer__body">
      <section class="fs"><h3 class="fs__title">Фотографии</h3><p class="fs__hint">Первое фото стоит на полке, второе появляется при наведении. Остальные ракурсы видны в карточке. Большие фото уменьшаются до 2000 px автоматически.</p>
        <ul class="phgrid" id="ed-photos"></ul>
        <label class="drop" id="ed-drop"><input type="file" id="ed-file" accept="image/*" multiple><span>+ Добавить фото</span><small>можно выбрать несколько или перетащить файлы сюда</small></label></section>
      <section class="fs">
        <div class="field" id="f-name"><label for="ed-name">Название</label><input id="ed-name" data-k="name" maxlength="80" autocomplete="off"><span class="field__err" id="ed-name-err" hidden>Напиши название фигурки.</span></div>
        <div class="field"><label for="ed-nick">Подпись от руки</label><input id="ed-nick" data-k="nick" maxlength="120" placeholder="короткая фраза, будет написана рукописным шрифтом"></div>
        <div class="field"><label for="ed-story">История и описание</label><textarea id="ed-story" data-k="story" rows="7" maxlength="6000"></textarea><small>Пустая строка начинает новый абзац.</small></div>
        <div class="grid2"><div class="field"><label for="ed-num">Номер в каталоге</label><input id="ed-num" data-k="num" maxlength="10"></div></div></section>
      <section class="fs"><h3 class="fs__title">Наличие и цена</h3>
        <div class="seg" role="radiogroup" aria-label="Статус">${Object.entries(STATUS).map(([k, v]) => `<label><input type="radio" name="ed-status" value="${k}" ${ED.d.status === k ? 'checked' : ''}><span>${v.ru} · ${v.label}</span></label>`).join('')}</div>
        <div class="field"><label for="ed-price">Цена</label><input id="ed-price" data-k="price" maxlength="40" placeholder="например, 3 900 ₽"><small>Оставь пустым, если цену не показываешь.</small></div></section>
      <section class="fs"><h3 class="fs__title">Цвета</h3><p class="fs__hint">Если привязать к цвету фото, посетитель увидит его, когда выберет этот цвет.</p>
        <ul class="coled" id="ed-colors"></ul><div class="field"><button class="btn btn--ghost" data-act="col-add" type="button">${ICON.plus}Добавить цвет</button></div></section>
      <section class="fs"><h3 class="fs__title">Детали</h3><p class="fs__hint">Показываются только заполненные строки.</p>
        <div class="grid2"><div class="field"><label for="ed-height">Высота</label><input id="ed-height" data-k="height" maxlength="60" placeholder="9 cm"></div><div class="field"><label for="ed-material">Материал</label><input id="ed-material" data-k="material" maxlength="120" placeholder="PLA, acrylic paint"></div>
        <div class="field"><label for="ed-edition">Тираж</label><input id="ed-edition" data-k="edition" maxlength="60" placeholder="10 pieces"></div><div class="field"><label for="ed-printTime">Время печати</label><input id="ed-printTime" data-k="printTime" maxlength="60" placeholder="7 h"></div></div></section>
      <section class="fs" style="padding-bottom:14px"><label class="check"><input type="checkbox" id="ed-draft" data-k="draft">Скрыть от посетителей (черновик)</label>${ED.d.demo ? '<label class="check"><input type="checkbox" id="ed-demo" data-k="demo">Показывать наклейку «demo»</label>' : ''}</section>
    </div>
    <div class="drawer__foot">${ED.isNew ? '' : `<button class="btn btn--danger-text" data-act="ed-delete" type="button">${ICON.trash}Удалить</button>`}<div class="drawer__foot-r"><button class="btn btn--ghost" data-act="ed-close" type="button">Отмена</button><button class="btn btn--primary" data-act="ed-save" type="button" id="ed-save">Сохранить</button></div></div>
  </div></div>`;
  const host = $r('#lo-drawer');
  $$('[data-k]', host).forEach(inp => {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') inp.checked = !!ED.d[k]; else inp.value = ED.d[k] || '';
    inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => { ED.d[k] = inp.type === 'checkbox' ? inp.checked : inp.value; ED.dirty = true; if (k === 'name') { $('#f-name', host).classList.remove('is-invalid'); $('#ed-name-err', host).hidden = true; } });
  });
  $$('input[name="ed-status"]', host).forEach(r => r.addEventListener('change', () => { ED.d.status = r.value; ED.dirty = true; }));
  const file = $('#ed-file', host), drop = $('#ed-drop', host);
  file.addEventListener('change', () => { addFiles([...file.files]); file.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); addFiles([...e.dataTransfer.files]); });
  renderEdPhotos(); renderEdColors();
  document.documentElement.classList.add('locked');
  setTimeout(() => $('#ed-name', host).focus(), 50);
}
function renderEdPhotos() {
  const ul = $r('#ed-photos'); if (!ul) return;
  const P = S.ed.photos, n = P.length;
  ul.innerHTML = P.map((p, i) => `<li class="ph"><img src="${esc(p.preview || p.url)}" alt="Фото ${i + 1}">
    ${p.url && i === 0 ? '<span class="ph__badge">Обложка</span>' : ''}${p.url && i === 1 ? '<span class="ph__badge ph__badge--hover">При наведении</span>' : ''}
    ${p.pending ? '<span class="ph__state">Загружается…</span>' : ''}${p.error ? `<span class="ph__state is-error">${esc(p.error)}</span>` : ''}
    <div class="ph__tools"><button type="button" data-act="ph-move" data-i="${i}" data-dir="-1" aria-label="Фото ${i + 1}: раньше" ${i === 0 || !p.url ? 'disabled' : ''}>${ICON.left}</button>
    <button type="button" data-act="ph-del" data-i="${i}" aria-label="Убрать фото ${i + 1}" ${p.pending ? 'disabled' : ''}>${ICON.trash}</button>
    <button type="button" data-act="ph-move" data-i="${i}" data-dir="1" aria-label="Фото ${i + 1}: позже" ${i === n - 1 || !p.url ? 'disabled' : ''}>${ICON.right}</button></div></li>`).join('');
}
function renderEdColors() {
  const ul = $r('#ed-colors'); if (!ul) return;
  const ready = S.ed.photos.filter(p => p.url);
  ul.innerHTML = S.ed.colors.map((c, i) => `<li><input type="color" value="${esc(c.hex)}" data-ci="${i}" data-ck="hex" aria-label="Цвет ${i + 1}">
    <input type="text" value="${esc(c.name)}" data-ci="${i}" data-ck="name" maxlength="40" placeholder="Название, напр. Pink" aria-label="Название цвета ${i + 1}">
    <select data-ci="${i}" data-ck="photo" aria-label="Фото для цвета ${i + 1}"><option value="">Без фото</option>${ready.map(p => `<option value="${esc(p.url)}" ${c.photo === p.url ? 'selected' : ''}>Фото ${S.ed.photos.indexOf(p) + 1}</option>`).join('')}</select>
    <button class="iconbtn" type="button" data-act="col-del" data-i="${i}" aria-label="Убрать цвет ${i + 1}">${ICON.close}</button></li>`).join('');
  $$('[data-ci]', ul).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { S.ed.colors[+inp.dataset.ci][inp.dataset.ck] = inp.value; S.ed.dirty = true; }));
}
async function prepareImage(file) {
  const OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }).catch(() => null);
    if (!img) { if (OK.includes(file.type)) return file; throw new Error('Этот формат не подходит. Сохрани фото как JPEG или PNG.'); }
    const w = img.naturalWidth, hh = img.naturalHeight, s = Math.min(1, 2000 / Math.max(w, hh));
    if (file.type === 'image/gif' || (s === 1 && OK.includes(file.type) && file.size < 3.5 * 1024 * 1024)) return file;
    const cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(hh * s);
    const ctx = cv.getContext('2d'); const alpha = file.type === 'image/png' || file.type === 'image/webp';
    if (!alpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const out = await new Promise(r => cv.toBlob(r, alpha ? 'image/png' : 'image/jpeg', .88));
    if (!out) throw new Error('Не удалось обработать фото.');
    return out;
  } finally { URL.revokeObjectURL(url); }
}
let chain = Promise.resolve();
function addFiles(files) {
  const ED = S.ed; if (!ED) return;
  const imgs = files.filter(f => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name));
  if (!imgs.length) { toast('Это не похоже на фото. Выбери файлы JPEG или PNG.', true); return; }
  ED.dirty = true;
  for (const f of imgs) {
    const entry = { pending: true, preview: URL.createObjectURL(f), local: true };
    ED.photos.push(entry);
    chain = chain.then(async () => {
      if (S.ed !== ED) return;
      try {
        const b = await prepareImage(f);
        const ext = (b.type || f.type).split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
        entry.url = await upload('media', b, ext);
        entry.pending = false; URL.revokeObjectURL(entry.preview); entry.preview = ''; entry.local = false;
      } catch (e) { entry.pending = false; entry.error = String(errText(e)).split('.')[0]; }
      if (S.ed === ED) { renderEdPhotos(); renderEdColors(); }
    });
  }
  renderEdPhotos();
}
async function saveEditor() {
  const ED = S.ed; if (!ED || ED.saving) return;
  const d = ED.d, host = $r('#lo-drawer');
  if (!str(d.name).trim()) { $('#f-name', host).classList.add('is-invalid'); $('#ed-name-err', host).hidden = false; $('#ed-name', host).focus(); return; }
  if (ED.photos.some(p => p.pending)) { toast('Подожди, фото ещё загружаются.'); return; }
  const photos = ED.photos.filter(p => p.url).map(p => p.url);
  const colors = ED.colors.map(c => ({ name: str(c.name, 40).trim(), hex: HEX_RE.test(c.hex) ? c.hex.toLowerCase() : '#cccccc', photo: photos.includes(c.photo) ? c.photo : '' }));
  const id = ED.id || 'obj-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const existing = S.objects.find(o => o.id === id);
  const maxOrder = S.objects.reduce((m, o) => Math.max(m, o.order < 1e9 ? o.order : 0), 0);
  const obj = { id, name: d.name.trim(), nick: str(d.nick).trim(), story: str(d.story).trim(), price: str(d.price).trim(), status: STATUS[d.status] ? d.status : 'available', num: str(d.num).trim(),
    height: str(d.height).trim(), material: str(d.material).trim(), edition: str(d.edition).trim(), printTime: str(d.printTime).trim(), photos, colors, draft: !!d.draft, demo: !!d.demo,
    order: existing ? existing.order : maxOrder + 10, createdAt: existing ? existing.createdAt : Date.now() };
  ED.saving = true; const btn = $('#ed-save', host); btn.disabled = true; btn.textContent = 'Сохраняю…';
  try { await store.save(obj); const wasNew = ED.isNew; closeEditor(true); toast(wasNew ? 'Фигурка добавлена на полку' : 'Сохранено'); await load(); }
  catch (e) { ED.saving = false; btn.disabled = false; btn.textContent = 'Сохранить'; toast(errText(e), true); }
}
async function closeEditor(force) {
  const ED = S && S.ed; if (!ED) return;
  if (!force && ED.dirty) { const ok = await confirmBox('Закрыть без сохранения?', 'Изменения в этой фигурке пропадут.', 'Закрыть', 'Вернуться'); if (!ok) return; }
  S.ed = null;
  ED.photos.forEach(p => { if (p.local && p.preview) URL.revokeObjectURL(p.preview); });
  $r('#lo-drawer').innerHTML = '';
  if (!S.open) document.documentElement.classList.remove('locked');
  if (ED.returnTo && document.contains(ED.returnTo)) ED.returnTo.focus({ preventScroll: true });
}
async function deleteObject(id) {
  const o = S.objects.find(x => x.id === id); if (!o) return;
  const ok = await confirmBox(`Удалить «${o.name}»?`, 'Фигурка пропадёт с полки. Это нельзя отменить.', 'Удалить', 'Оставить');
  if (!ok) return;
  try { await store.remove(id); if (S.ed && S.ed.id === id) await closeEditor(true); if (S.open === id) closeSheet(true); toast('Фигурка удалена'); await load(); }
  catch (e) { toast(errText(e), true); }
}
function openSettings() {
  const c = { ...CONFIG.CONTACTS, ...(S.cfg.contacts || {}) };
  const m = openModal(`<h2>Контакты и вступление</h2><p>Сюда посетители отправляют запросы на покупку. Заполни хотя бы одно поле.</p>
    <div class="field"><label for="st-intro">Текст под заголовком</label><textarea id="st-intro" rows="4" maxlength="600" placeholder="${esc(DEFAULT_INTRO)}"></textarea><small>Если оставить пустым, будет стоять текст по умолчанию.</small></div>
    <div class="field"><label for="st-email">Почта</label><input id="st-email" type="email" maxlength="120" placeholder="hello@example.com"></div>
    <div class="grid2"><div class="field"><label for="st-tg">Telegram</label><input id="st-tg" maxlength="64" placeholder="@username"></div><div class="field"><label for="st-ig">Instagram</label><input id="st-ig" maxlength="64" placeholder="@username"></div></div>
    <div class="modal__actions"><button class="btn btn--ghost" data-close type="button">Отмена</button><button class="btn btn--primary" id="st-save" type="button">Сохранить</button></div>`, { label: 'Контакты и вступление' });
  $('#st-intro', m.el).value = str(S.cfg.objects_intro, 600); $('#st-email', m.el).value = str(c.email, 120); $('#st-tg', m.el).value = str(c.telegram, 64); $('#st-ig', m.el).value = str(c.instagram, 64);
  $('#st-save', m.el).addEventListener('click', async e => {
    const email = $('#st-email', m.el).value.trim();
    if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) { toast('Проверь адрес почты: похоже, в нём опечатка.', true); return; }
    e.currentTarget.disabled = true;
    try {
      await config.set('contacts', { email, telegram: $('#st-tg', m.el).value.trim(), instagram: $('#st-ig', m.el).value.trim() });
      await config.set('objects_intro', $('#st-intro', m.el).value.trim());
      m.close(); toast('Контакты сохранены'); await load();
    } catch (er) { e.currentTarget.disabled = false; toast(errText(er), true); }
  });
}

/* ---------- events ---------- */
function onClick(e) {
  const t = e.target.closest('[data-act]');
  const frame = e.target.closest('.obj__frame, .obj__name a');
  if (frame && !t && S.studio) { e.preventDefault(); openEditor(frame.closest('.obj').dataset.id); return; }
  if (e.target.closest('#lo-studio')) { S.studio = true; renderAll(); return; }
  if (!t) return;
  const objId = t.closest('.obj') ? t.closest('.obj').dataset.id : null;
  const ED = S.ed;
  switch (t.dataset.act) {
    case 'filter': S.filter = t.dataset.f; renderHeader(); renderShelf(); break;
    case 'knock': { const row = $$('.obj', $r('#lo-shelf')); row.forEach(el => { el.classList.remove('is-knocked'); void el.offsetWidth; el.classList.add('is-knocked'); }); sound.play('paper'); setTimeout(() => row.forEach(el => el.classList.remove('is-knocked')), 1300); break; }
    case 'close': e.preventDefault(); closeSheet(true); break;
    case 'photo': setPhoto(S.photo + Number(t.dataset.dir)); break;
    case 'thumb': setPhoto(Number(t.dataset.i)); break;
    case 'color': {
      const o = visible().find(x => x.id === S.open), i = Number(t.dataset.i);
      S.color = S.color === i ? -1 : i; const c = o && o.colors[i];
      if (c && c.photo && S.color === i) S.photo = o.photos.indexOf(c.photo);
      renderSheet(false); const b = $r(`.swatch[data-i="${i}"]`); if (b) b.focus({ preventScroll: true }); break;
    }
    case 'request': openRequest(); break;
    case 'unzoom': $r('#lo-zoom').innerHTML = ''; break;
    case 'studio': S.studio = !S.studio; if (!S.studio && S.open && !visible().some(o => o.id === S.open)) closeSheet(true); renderAll(); break;
    case 'add': openEditor(null); break;
    case 'settings': openSettings(); break;
    case 'edit': openEditor(t.dataset.id || objId); break;
    case 'delete': deleteObject(objId); break;
    case 'move': moveBy(objId, Number(t.dataset.dir)); break;
    case 'ed-close': closeEditor(false); break;
    case 'ed-bg': if (e.target === t) closeEditor(false); break;
    case 'ed-save': saveEditor(); break;
    case 'ed-delete': if (ED) deleteObject(ED.id); break;
    case 'ph-move': { const i = Number(t.dataset.i), j = i + Number(t.dataset.dir); if (j < 0 || j >= ED.photos.length) break; [ED.photos[i], ED.photos[j]] = [ED.photos[j], ED.photos[i]]; ED.dirty = true; renderEdPhotos(); renderEdColors(); break; }
    case 'ph-del': { const [p] = ED.photos.splice(Number(t.dataset.i), 1); if (p && p.url) ED.colors.forEach(c => { if (c.photo === p.url) c.photo = ''; }); if (p && p.local) URL.revokeObjectURL(p.preview); ED.dirty = true; renderEdPhotos(); renderEdColors(); break; }
    case 'col-add': ED.colors.push({ name: '', hex: '#ffb8d9', photo: '' }); ED.dirty = true; renderEdColors(); break;
    case 'col-del': ED.colors.splice(Number(t.dataset.i), 1); ED.dirty = true; renderEdColors(); break;
  }
}
function onKey(e) {
  if (!S || !R) return;
  if (e.key === 'Escape') {
    if ($('#layer-modal').children.length) return;
    if (S.ed) { closeEditor(false); return; }
    if ($r('#lo-zoom').innerHTML) { $r('#lo-zoom').innerHTML = ''; return; }
    if (S.open) { closeSheet(true); return; }
  }
  if (S.open && !S.ed && !$('#layer-modal').children.length && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    if (e.key === 'ArrowRight') setPhoto(S.photo + 1);
    if (e.key === 'ArrowLeft') setPhoto(S.photo - 1);
  }
}
