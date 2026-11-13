// MY STUFF: a loose, scattered portfolio. Visitors browse; the signed-in owner edits.
import { $, $$, esc, h, ICON, sound, toast, openModal, confirmBox, hashStr, lsGet, lsSet } from '../util.js';
import { works as store, upload, config, state, onAuth } from '../store.js';

const CATS = [['graphic', 'Graphic design'], ['3d', '3D experiments'], ['posters', 'Posters'], ['personal', 'Personal projects'], ['random', 'Random stuff']];
const CAT = Object.fromEntries(CATS);
const FORM = { posters: 'poster', '3d': 'photo', graphic: 'spread', personal: 'folder', random: 'paper' };
const URL_RE = /^(https:\/\/[^\s"'<>]+|assets\/[\w./-]+)$/;
const str = (v, m = 4000) => typeof v === 'string' ? v.slice(0, m) : '';
const norm = d => ({ id: String(d.id), title: str(d.title, 90) || 'Untitled', category: CAT[d.category] ? d.category : 'random', year: str(d.year, 12), summary: str(d.summary, 240), body: str(d.body, 8000),
  images: Array.isArray(d.images) ? d.images.filter(u => typeof u === 'string' && URL_RE.test(u)) : [], order: Number.isFinite(d.order) ? d.order : 1e9, draft: !!d.draft, demo: !!d.demo });

let S = null, R = null;
export async function mount(root, params) {
  R = root; S = { list: [], loaded: false, cat: 'all', studio: false, pos: lsGet('bg.stuff.pos', {}), cfg: {} };
  root.innerHTML = `<div class="page stuff-page"><div class="page-head"><div><a class="back" href="#/">${ICON.back}Back to the desk</a>
      <h1 class="page-title">My Stuff</h1><p class="page-sub">posters, 3D, zines and random experiments, scattered on purpose</p></div>
      <div class="stuff-tools" id="stuff-tools"></div></div>
    <div class="cats" id="cats" role="group" aria-label="Categories"></div>
    <div id="stuff-body"></div></div>`;
  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onDown);
  const off = onAuth(() => { if (!state.admin) S.studio = false; render(); });
  await load();
  show(params);
  return () => { off(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); R = null; S = null; };
}
export function update(params) { if (S) show(params); }
async function load() {
  try { const [l, cfg] = await Promise.all([store.list(), config.all()]); S.list = l.map(norm).sort((a, b) => a.order - b.order); S.cfg = cfg; }
  catch (e) { toast(e.message || 'The works did not load.', true); }
  S.loaded = true;
}
const visible = () => S.list.filter(w => (S.studio || !w.draft));
let params0 = [];
function show(params) { params0 = params || []; render(); }

function render() {
  if (!S || !R) return;
  const id = params0[0];
  $('#stuff-tools', R).innerHTML = state.admin ? (S.studio ? `<button class="btn btn--primary btn--small" data-act="add">${ICON.plus}Добавить работу</button><button class="btn btn--ghost btn--small" data-act="studio">Готово</button>` : `<button class="btn btn--ink btn--small" data-act="studio">${ICON.pen}Студия</button>`) : '';
  if (id) return renderProject(id);
  const list = visible().filter(w => S.cat === 'all' || w.category === S.cat);
  const counts = { all: visible().length }; CATS.forEach(([k]) => { counts[k] = visible().filter(w => w.category === k).length; });
  $('#cats', R).hidden = false;
  $('#cats', R).innerHTML = [['all', 'Everything'], ...CATS].map(([k, n]) => `<button class="chip" type="button" data-cat="${k}" aria-pressed="${S.cat === k}">${n} <small>${counts[k]}</small></button>`).join('');
  const body = $('#stuff-body', R);
  if (!list.length) { body.innerHTML = `<p class="stuff-empty">${S.loaded ? (S.studio ? 'Пока пусто. Нажми «Добавить работу».' : 'Nothing in this drawer yet.') : 'Opening the drawers…'}</p>`; return; }
  body.innerHTML = `<ul class="pile" id="pile">${list.map((w, i) => itemHTML(w, i, list.length)).join('')}</ul>
    <p class="pile-hint">Drag things around if you like. Click anything to open it.</p>`;
}
function itemHTML(w, i, n) {
  const r = hashStr(w.id);
  const rot = ((r % 15) - 7) * .9, jx = ((r >> 4) % 30) - 15, jy = ((r >> 9) % 30) - 15;
  const form = FORM[w.category];
  const p = S.pos[w.id] || [0, 0];
  const img = w.images[0];
  const inner = {
    poster: `<span class="tape tape--a"></span><span class="tape tape--b"></span><img src="${esc(img || '')}" alt="" loading="lazy">`,
    photo: `<img src="${esc(img || '')}" alt="" loading="lazy"><span class="pi-cap">${esc(w.title)}</span>`,
    spread: `<img src="${esc(img || '')}" alt="" loading="lazy"><span class="spine"></span>`,
    folder: `<span class="folder-tab">${esc(w.title)}</span><span class="folder-peek"><img src="${esc(img || '')}" alt="" loading="lazy"></span><span class="folder-front"><b>${esc(w.title)}</b><small>${esc(w.year)}</small></span>`,
    paper: `<span class="clip"></span><img src="${esc(img || '')}" alt="" loading="lazy">`
  }[form];
  const ctl = S.studio ? `<div class="pi-ctl"><button type="button" data-act="up" aria-label="Раньше" ${i === 0 ? 'disabled' : ''}>${ICON.left}</button><button type="button" data-act="edit">${ICON.pen}Изменить</button><button type="button" data-act="down" aria-label="Позже" ${i === n - 1 ? 'disabled' : ''}>${ICON.right}</button><button type="button" data-act="del" aria-label="Удалить">${ICON.trash}</button></div>` : '';
  return `<li class="pi pi--${form}${w.draft ? ' is-draft' : ''}" data-id="${esc(w.id)}" style="--rot:${rot}deg;--jx:${jx}px;--jy:${jy}px;--dx:${p[0]}px;--dy:${p[1]}px">
    <a class="pi__obj" href="#/stuff/${esc(w.id)}" aria-label="${esc(w.title)}, ${esc(CAT[w.category])}${w.year ? ', ' + esc(w.year) : ''}">${inner}${w.demo ? '<span class="pi-demo">demo</span>' : ''}</a>
    <p class="pi__label"><b>${esc(w.title)}</b><span>${esc(CAT[w.category])}${w.year ? ' · ' + esc(w.year) : ''}</span></p>${ctl}</li>`;
}
function renderProject(id) {
  const list = visible(), i = list.findIndex(w => w.id === id), w = list[i];
  $('#cats', R).hidden = true;
  const body = $('#stuff-body', R);
  if (!w) { body.innerHTML = S.loaded ? `<p class="stuff-empty">This project is not here. <a href="#/stuff">See all work</a></p>` : ''; return; }
  const prev = list[i - 1], next = list[i + 1];
  const paras = w.body.trim() ? w.body.trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : '';
  body.innerHTML = `<article class="project">
    <a class="back" href="#/stuff">${ICON.back}All my stuff</a>
    <header class="project__head"><p class="project__meta"><span class="chip">${esc(CAT[w.category])}</span>${w.year ? `<span>${esc(w.year)}</span>` : ''}${w.demo ? '<span class="pi-demo pi-demo--inline">demo</span>' : ''}</p>
      <h2 class="project__title">${esc(w.title)}</h2>${w.summary ? `<p class="project__sum">${esc(w.summary)}</p>` : ''}
      ${state.admin && S.studio ? `<button class="btn btn--ink btn--small" data-act="edit" data-id="${esc(w.id)}">${ICON.pen}Изменить</button>` : ''}</header>
    <div class="project__grid"><div class="project__imgs">${w.images.map((u, k) => `<figure><img src="${esc(u)}" alt="${esc(w.title)}, image ${k + 1}" loading="${k ? 'lazy' : 'eager'}"></figure>`).join('') || '<p class="stuff-empty">Images coming soon.</p>'}</div>
      ${paras ? `<div class="project__text">${paras}</div>` : ''}</div>
    <nav class="project__nav" aria-label="More projects">${prev ? `<a class="linkbtn" href="#/stuff/${esc(prev.id)}">${ICON.left}${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="linkbtn" href="#/stuff/${esc(next.id)}">${esc(next.title)}${ICON.right}</a>` : ''}</nav>
  </article>`;
  window.scrollTo(0, 0);
}

/* ---------- drag things around (desktop, remembered in this browser) ---------- */
let drag = null, suppress = false;
function onDown(e) {
  const li = e.target.closest('.pi');
  if (!li || S.studio || e.target.closest('.pi-ctl') || matchMedia('(max-width: 760px)').matches || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const p = S.pos[li.dataset.id] || [0, 0];
  drag = { li, x0: e.clientX, y0: e.clientY, p0: p, moved: false, id: e.pointerId };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
}
function onMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.moved && Math.hypot(dx, dy) < 7) return;
  if (!drag.moved) { drag.moved = true; drag.li.classList.add('is-drag'); sound.play('paper'); }
  drag.cur = [drag.p0[0] + dx, drag.p0[1] + dy];
  drag.li.style.setProperty('--dx', drag.cur[0] + 'px'); drag.li.style.setProperty('--dy', drag.cur[1] + 'px');
}
function onUp(e) {
  window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
  if (!drag) return;
  if (drag.moved) { drag.li.classList.remove('is-drag'); S.pos[drag.li.dataset.id] = drag.cur; lsSet('bg.stuff.pos', S.pos); suppress = true; setTimeout(() => { suppress = false; }, 60); }
  drag = null;
}

/* ---------- owner editing ---------- */
async function reorder(id, dir) {
  const list = visible(), i = list.findIndex(w => w.id === id), j = i + dir;
  if (j < 0 || j >= list.length) return;
  const a = list[i], b = list[j];
  let oa = a.order, ob = b.order; if (oa === ob || oa >= 1e9 || ob >= 1e9) { oa = (i + 1) * 10; ob = (j + 1) * 10; }
  try { await store.setOrder(a.id, ob); await store.setOrder(b.id, oa); await load(); render(); toast('Порядок сохранён'); }
  catch (e) { toast(e.message, true); }
}
function editor(id) {
  const src = id ? S.list.find(w => w.id === id) : null;
  const d = src ? JSON.parse(JSON.stringify(src)) : { id: '', title: '', category: 'posters', year: String(new Date().getFullYear()), summary: '', body: '', images: [], draft: false, demo: false };
  const imgs = d.images.map(u => ({ url: u }));
  let dirty = false, busy = 0;
  const m = openModal(`<h2>${src ? 'Работа' : 'Новая работа'}</h2>
    <div class="field"><label for="w-title">Название</label><input id="w-title" maxlength="90"></div>
    <div class="grid2"><div class="field"><label for="w-cat">Категория</label><select id="w-cat">${CATS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
      <div class="field"><label for="w-year">Год</label><input id="w-year" maxlength="12"></div></div>
    <div class="field"><label for="w-sum">Коротко (одна строка)</label><input id="w-sum" maxlength="240"></div>
    <div class="field"><label for="w-body">Описание</label><textarea id="w-body" rows="6" maxlength="8000"></textarea><small>Пустая строка начинает новый абзац.</small></div>
    <div class="field"><span class="label">Картинки (первая лежит на столе)</span><ul class="w-imgs" id="w-imgs"></ul>
      <label class="btn btn--ghost btn--small">${ICON.upload}Добавить картинки<input type="file" id="w-file" accept="image/*" multiple hidden></label></div>
    <label class="check"><input type="checkbox" id="w-draft">Скрыть от посетителей (черновик)</label>
    ${d.demo ? '<label class="check"><input type="checkbox" id="w-demo">Показывать наклейку «demo»</label>' : ''}
    <div class="modal__actions">${src ? `<button class="btn btn--text" type="button" id="w-del" style="margin-right:auto;color:var(--red)">${ICON.trash}Удалить</button>` : ''}<button class="btn btn--ghost" type="button" data-close>Отмена</button><button class="btn btn--primary" type="button" id="w-save">Сохранить</button></div>`, { label: 'Работа', wide: true });
  const el = m.el;
  $('#w-title', el).value = d.title; $('#w-cat', el).value = d.category; $('#w-year', el).value = d.year; $('#w-sum', el).value = d.summary; $('#w-body', el).value = d.body; $('#w-draft', el).checked = d.draft;
  if ($('#w-demo', el)) $('#w-demo', el).checked = d.demo;
  el.addEventListener('input', () => { dirty = true; });
  const paint = () => {
    $('#w-imgs', el).innerHTML = imgs.map((p, i) => `<li><img src="${esc(p.preview || p.url)}" alt="Картинка ${i + 1}">${p.pending ? '<span>…</span>' : ''}${p.error ? `<span class="err">${esc(p.error)}</span>` : ''}
      <div><button type="button" data-wi="${i}" data-wd="-1" aria-label="Раньше" ${i === 0 ? 'disabled' : ''}>${ICON.left}</button><button type="button" data-wx="${i}" aria-label="Убрать">${ICON.trash}</button><button type="button" data-wi="${i}" data-wd="1" aria-label="Позже" ${i === imgs.length - 1 ? 'disabled' : ''}>${ICON.right}</button></div></li>`).join('');
  };
  paint();
  $('#w-imgs', el).addEventListener('click', e => {
    const mv = e.target.closest('[data-wi]'), x = e.target.closest('[data-wx]');
    if (mv) { const i = +mv.dataset.wi, j = i + +mv.dataset.wd; [imgs[i], imgs[j]] = [imgs[j], imgs[i]]; dirty = true; paint(); }
    if (x) { imgs.splice(+x.dataset.wx, 1); dirty = true; paint(); }
  });
  $('#w-file', el).addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) {
      const entry = { preview: URL.createObjectURL(f), pending: true }; imgs.push(entry); paint(); busy++;
      try {
        const { resizeToBlob } = await import('../util.js');
        const { blob } = await resizeToBlob(f, 2200, 'image/jpeg', .88);
        entry.url = await upload('media', blob, 'jpg'); entry.pending = false; entry.preview = '';
      } catch (er) { entry.pending = false; entry.error = 'не загрузилось'; }
      busy--; dirty = true; paint();
    }
  });
  $('#w-save', el).addEventListener('click', async e => {
    const title = $('#w-title', el).value.trim();
    if (!title) { $('#w-title', el).focus(); toast('Напиши название работы.', true); return; }
    if (busy) { toast('Подожди, картинки ещё загружаются.'); return; }
    const maxOrder = S.list.reduce((mx, w) => Math.max(mx, w.order < 1e9 ? w.order : 0), 0);
    const obj = { id: src ? src.id : 'w-' + Math.random().toString(36).slice(2, 9), title, category: $('#w-cat', el).value, year: $('#w-year', el).value.trim(), summary: $('#w-sum', el).value.trim(), body: $('#w-body', el).value.trim(),
      images: imgs.filter(p => p.url).map(p => p.url), draft: $('#w-draft', el).checked, demo: $('#w-demo', el) ? $('#w-demo', el).checked : false, order: src ? src.order : maxOrder + 10 };
    e.currentTarget.disabled = true;
    try { await store.save(obj); dirty = false; m.close(); toast('Сохранено'); await load(); render(); }
    catch (er) { e.currentTarget.disabled = false; toast(er.message, true); }
  });
  if (src) $('#w-del', el).addEventListener('click', async () => {
    m.close();
    if (!(await confirmBox(`Удалить «${src.title}»?`, 'Работа пропадёт из портфолио. Это нельзя отменить.', 'Удалить', 'Оставить'))) return;
    try { await store.remove(src.id); toast('Удалено'); await load(); if (params0[0] === src.id) location.hash = '#/stuff'; else render(); } catch (er) { toast(er.message, true); }
  });
}
function onClick(e) {
  if (suppress && e.target.closest('.pi')) { e.preventDefault(); e.stopPropagation(); return; }
  const c = e.target.closest('[data-cat]'); if (c) { S.cat = c.dataset.cat; sound.play('paper'); render(); return; }
  const a = e.target.closest('[data-act]');
  const li = e.target.closest('.pi');
  if (!a) { if (S.studio && li && e.target.closest('.pi__obj')) { e.preventDefault(); editor(li.dataset.id); } return; }
  switch (a.dataset.act) {
    case 'studio': S.studio = !S.studio; render(); break;
    case 'add': editor(null); break;
    case 'edit': editor(a.dataset.id || (li && li.dataset.id)); break;
    case 'up': reorder(li.dataset.id, -1); break;
    case 'down': reorder(li.dataset.id, 1); break;
    case 'del': { const w = S.list.find(x => x.id === li.dataset.id); confirmBox(`Удалить «${w.title}»?`, 'Работа пропадёт из портфолио.', 'Удалить', 'Оставить').then(async ok => { if (!ok) return; try { await store.remove(w.id); await load(); render(); toast('Удалено'); } catch (er) { toast(er.message, true); } }); break; }
  }
}
