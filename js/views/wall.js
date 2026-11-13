import { CONFIG } from '../config.js';
import { $, $$, esc, h, ICON, sound, toast, clamp, rand, todayKey, fmtDay, msToNextDay, addDays, openModal, confirmBox, resizeToBlob, lsGet, lsSet, plural } from '../util.js';
import { wall, upload, prompts, stickers as stickerStore, state } from '../store.js';
import { BUILTIN, stickerURL, medalSVG, svgURL } from '../stickers.js';
import { WORLD, NOTE_COLORS } from '../wallmini.js';

const BRUSHES = { pen: { s: 6, a: 1, name: 'Ручка' }, marker: { s: 16, a: 1, name: 'Маркер' }, glow: { s: 30, a: .4, name: 'Выделитель' } };
const COLOR_NAMES = { yellow: 'жёлтая', pink: 'розовая', blue: 'голубая', white: 'белая', red: 'красная', cobalt: 'синяя' };
const INKS = ['#000000', '#244EE7', '#E8291F', '#FFD84A', '#FF7AB6', '#7FB2FF', '#ffffff'];

export async function mount(root) { return mountBoard(root, { day: todayKey(), live: true }); }

export async function mountBoard(root, { day, live, back }) {
  const S = { day, live, items: new Map(), k: .4, tx: 0, ty: 0, mode: 'idle', ink: INKS[1], brush: 'marker', drawPaths: [], hidden: wall.reportedLocally(), maxZ: 0, alive: true, custom: [] };
  const today = todayKey();
  const readonly = () => !S.live;
  const isMine = it => !!state.uid && it.owner === state.uid;
  const canEdit = it => S.live && S.day === todayKey() && (state.admin || isMine(it));

  root.innerHTML = `<div class="wallpage${readonly() ? ' is-archive' : ''}">
    <header class="wallhead">
      <div class="wallhead__l">
        ${back ? `<a class="back" href="${back.href}">${ICON.back}${esc(back.label)}</a>` : `<a class="back" href="#/">${ICON.back}На рабочий стол</a>`}
        <h1 class="page-title wall-title">${readonly() ? esc(fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) : 'Стена дня'}</h1>
        <p class="page-sub">${readonly() ? 'стена из архива · только смотреть' : 'Сегодня мы делаем что-то вместе.'}</p>
      </div>
      <div class="wallhead__r">
        <p class="wallhead__stats" id="stats" aria-live="polite"></p>
        ${live ? `<p class="wallhead__clock" id="closes"></p>` : ''}
        ${state.mode === 'local' && live ? `<p class="wallhead__local">Демо-режим: стена хранится только в этом браузере, пока студия не подключит базу данных.</p>` : ''}
      </div>
    </header>
    <div class="board-wrap">
      <div class="viewport" id="viewport" tabindex="-1" aria-label="${readonly() ? 'Стена из архива' : 'Общая стена. Тяни пустое место, чтобы двигаться; щипок или кнопки — масштаб.'}">
        <div class="world" id="world" style="width:${WORLD.w}px;height:${WORLD.h}px">
          <div class="prompt-card" id="prompt" aria-live="polite"><span>Вопрос дня</span><b>…</b></div>
          <svg class="draft" id="draft" viewBox="0 0 ${WORLD.w} ${WORLD.h}" width="${WORLD.w}" height="${WORLD.h}" aria-hidden="true"></svg>
        </div>
        <div class="empty-hint" id="empty" hidden></div>
      </div>
      <div class="zoombar" role="group" aria-label="Масштаб">
        <button class="iconbtn" type="button" data-act="zin" aria-label="Приблизить">${ICON.zoomIn}</button>
        <button class="iconbtn" type="button" data-act="zout" aria-label="Отдалить">${ICON.zoomOut}</button>
        <button class="iconbtn" type="button" data-act="zfit" aria-label="Показать всю стену">${ICON.target}</button>
      </div>
      ${live ? `<div class="dock" id="dock" role="toolbar" aria-label="Добавить на стену"></div>` : ''}
      <div class="drawbar" id="drawbar" hidden></div>
    </div>
  </div>`;

  const vp = $('#viewport', root), world = $('#world', root);

  /* ---------- view transform ---------- */
  function applyView() {
    world.style.transform = `translate(${S.tx}px, ${S.ty}px) scale(${S.k})`;
    world.style.setProperty('--k', S.k);
  }
  function fit() {
    const r = vp.getBoundingClientRect();
    const k = Math.min(r.width / WORLD.w, r.height / WORLD.h) * .96;
    S.k = clamp(k, .08, 2); S.tx = (r.width - WORLD.w * S.k) / 2; S.ty = (r.height - WORLD.h * S.k) / 2; applyView();
  }
  function startView() {
    const r = vp.getBoundingClientRect();
    const fitK = Math.min(r.width / WORLD.w, r.height / WORLD.h);
    if (fitK >= .3) { fit(); return; }
    // small screens: frame the question card and whatever is already on the wall
    const card = $('#prompt', root), cw = card ? card.offsetWidth : 840, ch = card ? card.offsetHeight : 200;
    let x0 = WORLD.w / 2 - cw / 2, y0 = 20, x1 = WORLD.w / 2 + cw / 2, y1 = 40 + ch;
    for (const it of S.items.values()) { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); }
    x0 -= 40; y0 -= 20; x1 += 40; y1 += 120;
    const room = r.width - 58; // keep clear of the zoom buttons on the right
    S.k = clamp(Math.min(room / (x1 - x0), r.height / (y1 - y0)), .14, .5);
    S.tx = room / 2 - (x0 + x1) / 2 * S.k; S.ty = Math.min(16, r.height / 2 - (y0 + y1) / 2 * S.k);
    clampView(); applyView();
  }
  function zoomAt(f, cx, cy) {
    const r = vp.getBoundingClientRect();
    const px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
    const nk = clamp(S.k * f, .08, 2.2);
    S.tx = px - (px - S.tx) * nk / S.k; S.ty = py - (py - S.ty) * nk / S.k; S.k = nk; clampView(); applyView();
  }
  function clampView() {
    const r = vp.getBoundingClientRect(), m = 120;
    S.tx = clamp(S.tx, Math.min(m, r.width - WORLD.w * S.k - m), Math.max(r.width - m, m)); S.ty = clamp(S.ty, Math.min(m, r.height - WORLD.h * S.k - m), Math.max(r.height - m, m));
    if (WORLD.w * S.k < r.width) S.tx = clamp(S.tx, -WORLD.w * S.k + m, r.width - m);
  }
  const toWorld = (cx, cy) => { const r = vp.getBoundingClientRect(); return { x: (cx - r.left - S.tx) / S.k, y: (cy - r.top - S.ty) / S.k }; };
  function viewCenter() { const r = vp.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); }

  /* ---------- items ---------- */
  function contentHTML(it) {
    const d = it.data || {};
    switch (it.kind) {
      case 'note': {
        const t = String(d.text || ''); const fs = t.length < 30 ? 40 : t.length < 70 ? 32 : t.length < 140 ? 26 : 21;
        return `<span class="tape" aria-hidden="true"></span><p class="wi__text" style="font-size:${fs}px">${esc(t)}</p>`;
      }
      case 'whisper': return `<span class="wi__psst" aria-hidden="true">пссс</span><p class="wi__text">${esc(d.text || '')}</p>`;
      case 'sticker': return `<img src="${esc(d.src || stickerURL(d.sticker))}" alt="${esc(d.name || 'стикер')}" draggable="false">`;
      case 'image': return `<img src="${esc(d.src)}" alt="Картинка, которую кто-то приколол" draggable="false" loading="lazy">`;
      case 'strip': return `<img src="${esc(d.src)}" alt="Фотолента из фотобудки" draggable="false" loading="lazy">`;
      case 'medal': return `<img src="${esc(svgURL(medalSVG(d)))}" alt="Медаль «Забега дизайнера»: ${esc(d.title || '')}" draggable="false">`;
      case 'drawing': return `<svg viewBox="0 0 ${it.w} ${it.h}" preserveAspectRatio="none" aria-label="Рисунок">${(d.paths || []).map(p => {
        const pts = p.p || []; let dd = '';
        for (let i = 0; i < pts.length; i += 2) dd += (i ? 'L' : 'M') + (pts[i] * it.w).toFixed(1) + ' ' + (pts[i + 1] * it.h).toFixed(1);
        if (pts.length === 2) dd += 'l.1 0';
        return `<path d="${dd}" stroke="${esc(p.c || '#000')}" stroke-width="${+p.s || 6}" stroke-opacity="${+p.a || 1}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('')}</svg>`;
    }
    return '';
  }
  const LABEL = { note: 'Записка', whisper: 'Анонимное сообщение', sticker: 'Стикер', image: 'Картинка', strip: 'Фотолента', drawing: 'Рисунок', medal: 'Медаль' };
  function itemEl(it) {
    const el = document.createElement('div');
    el.className = `wi wi--${it.kind}`;
    el.dataset.id = it.id;
    el.tabIndex = 0;
    return el;
  }
  function paint(it, el = $(`.wi[data-id="${CSS.escape(it.id)}"]`, world)) {
    if (!el) return;
    const mine = canEdit(it);
    el.classList.toggle('is-mine', mine);
    el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; el.style.width = it.w + 'px'; el.style.height = it.h + 'px';
    el.style.transform = `rotate(${it.rot}deg)`; el.style.zIndex = 10 + Math.max(0, Math.min(it.z | 0, 2e9));
    if (it.kind === 'note' || it.kind === 'whisper') el.style.setProperty('--paper', NOTE_COLORS[it.data.color] || (it.kind === 'whisper' ? '#fff' : NOTE_COLORS.yellow));
    if (it.kind === 'note') el.classList.toggle('is-dark', it.data.color === 'cobalt');
    el.setAttribute('aria-label', `${LABEL[it.kind] || 'Объект'}${it.data && it.data.text ? ': ' + it.data.text : ''}${mine ? '. Твоё: стрелки двигают, Delete удаляет.' : ''}`);
    el.innerHTML = contentHTML(it) + (mine ? `<div class="wi__h" aria-hidden="true"><button type="button" class="hd hd--del" data-h="del" tabindex="-1" title="Удалить">${ICON.close}</button><span class="hd hd--rot" data-h="rot" title="Повернуть">${ICON.rotate}</span><span class="hd hd--size" data-h="size" title="Размер">${ICON.resize}</span></div>`
      : (live ? `<button type="button" class="wi__flag" data-act="report" title="Пожаловаться" aria-label="Пожаловаться: ${(LABEL[it.kind] || 'объект').toLowerCase()}">${ICON.flag}</button>` : ''));
  }
  function upsert(it) {
    if (S.hidden.has(it.id)) return;
    if (it.hidden && !state.admin) { removeLocal(it.id); return; }
    S.items.set(it.id, it);
    S.maxZ = Math.max(S.maxZ, it.z | 0);
    let el = $(`.wi[data-id="${CSS.escape(it.id)}"]`, world);
    if (!el) { el = itemEl(it); world.appendChild(el); el.classList.add('is-new'); setTimeout(() => el.classList.remove('is-new'), 600); }
    paint(it, el);
  }
  function removeLocal(id) {
    S.items.delete(id);
    const el = $(`.wi[data-id="${CSS.escape(id)}"]`, world); if (el) el.remove();
  }
  function stats() {
    const n = S.items.size, people = new Set([...S.items.values()].map(i => i.owner)).size;
    $('#stats', root).textContent = n ? `${n} ${plural(n, ['штука', 'штуки', 'штук'])} от ${people} ${plural(people, ['человека', 'человек', 'человек'])}` : (S.live ? 'Пока пусто. Ты можешь быть первым.' : 'В этот день никто ничего не оставил.');
    const empty = $('#empty', root);
    empty.hidden = !!n || !S.live;
    if (!n && S.live) empty.innerHTML = `<p>Стена пустая.<br>Оставишь первую записку?</p>`;
  }
  async function load() {
    try {
      const list = await wall.list(S.day);
      if (!S.alive) return;
      const ids = new Set(list.map(i => i.id));
      [...S.items.keys()].forEach(id => { if (!ids.has(id) && !(drag && drag.id === id)) removeLocal(id); });
      list.forEach(it => { if (!(drag && drag.id === it.id)) upsert(it); });
      stats();
    } catch (e) { toast(e.message || 'Стена не загрузилась. Проверь соединение.', true); }
  }

  /* ---------- prompt ---------- */
  const promptReady = (async () => {
    try { const list = await prompts.list(); $('#prompt b', root).textContent = prompts.pick(S.day, list); }
    catch (e) { $('#prompt b', root).textContent = 'Оставь что-нибудь незнакомцу.'; }
  })();

  /* ---------- adding ---------- */
  function spot(w, hgt) {
    const c = viewCenter();
    return { x: clamp(c.x - w / 2 + rand(-120, 120), 20, WORLD.w - w - 20), y: clamp(c.y - hgt / 2 + rand(-90, 90), 20, WORLD.h - hgt - 20) };
  }
  async function add(kind, data, w, hgt, rot = rand(-6, 6)) {
    const p = spot(w, hgt);
    try {
      const it = await wall.add({ day: S.day, kind, x: Math.round(p.x), y: Math.round(p.y), w: Math.round(w), h: Math.round(hgt), rot: Math.round(rot * 10) / 10, z: S.maxZ + 1, data });
      upsert(it); stats(); sound.play('pop');
      const el = $(`.wi[data-id="${CSS.escape(it.id)}"]`, world); if (el) el.focus({ preventScroll: true });
      return it;
    } catch (e) { toast(e.message || 'Не приклеилось. Попробуй ещё раз.', true); return null; }
  }
  function renderDock() {
    const dock = $('#dock', root); if (!dock) return;
    const medal = lsGet('bg.medal', null);
    dock.innerHTML = `
      <button class="tool" type="button" data-act="note"><span class="tool__ic tool__ic--note"></span>Записка</button>
      <button class="tool" type="button" data-act="whisper"><span class="tool__ic tool__ic--whisper"></span>Шёпот</button>
      <button class="tool" type="button" data-act="draw"><span class="tool__ic tool__ic--draw"></span>Рисунок</button>
      <button class="tool" type="button" data-act="sticker"><span class="tool__ic tool__ic--sticker"></span>Стикер</button>
      <label class="tool"><span class="tool__ic tool__ic--image"></span>Картинка<input type="file" accept="image/*" id="pic" hidden></label>
      <a class="tool" href="#/booth"><span class="tool__ic tool__ic--strip"></span>Лента</a>
      ${medal && !medal.used ? `<button class="tool tool--medal" type="button" data-act="medal"><span class="tool__ic tool__ic--medal"></span>Моя медаль</button>` : ''}`;
    $('#pic', root).addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (f.size > 25 * 1024 * 1024) { toast('Файл слишком большой. Выбери картинку меньше 25 МБ.', true); return; }
      try {
        toast('Прикалываю картинку…');
        const { blob, width, height } = await resizeToBlob(f, state.mode === 'cloud' ? 1000 : 520, 'image/jpeg', .82);
        const url = await upload('wall', blob, 'jpg');
        const w = 300, hh = Math.round(300 * height / width);
        await add('image', { src: url }, w, clamp(hh, 60, 900));
      } catch (er) { toast(er.message && er.code ? er.message : 'Не получилось прочитать картинку. Попробуй JPEG или PNG.', true); }
    });
  }
  function noteDialog(kind) {
    const isNote = kind === 'note';
    let color = isNote ? 'yellow' : 'white';
    const m = openModal(`<h2>${isNote ? 'Написать записку' : 'Оставить шёпот'}</h2>
      <p>${isNote ? 'Она повиснет на стене для всех сегодня и останется в Капсуле времени.' : 'Маленькое анонимное послание для того, кто придёт следующим.'}</p>
      <div class="field"><label for="nt">${isNote ? 'Твоя записка' : 'Твоё послание'}</label><textarea id="nt" maxlength="${isNote ? 200 : 90}" rows="${isNote ? 4 : 2}" placeholder="${isNote ? esc($('#prompt b', root).textContent) : 'пссс…'}"></textarea><small id="nt-c">0 / ${isNote ? 200 : 90}</small></div>
      ${isNote ? `<div class="field"><span class="label">Бумага</span><div class="paper-pick" role="radiogroup" aria-label="Цвет бумаги">${Object.entries(NOTE_COLORS).map(([k, v]) => `<button type="button" role="radio" class="pp" style="--c:${v}" data-c="${k}" aria-checked="${k === color}" aria-label="${COLOR_NAMES[k] || k}"></button>`).join('')}</div></div>` : ''}
      <div class="modal__actions"><button class="btn btn--ghost" type="button" data-close>Отмена</button><button class="btn btn--primary" type="button" id="nt-go">${isNote ? 'Приколоть' : 'Оставить'}</button></div>`, { label: isNote ? 'Написать записку' : 'Оставить шёпот' });
    const ta = $('#nt', m.el);
    ta.addEventListener('input', () => { $('#nt-c', m.el).textContent = `${ta.value.length} / ${ta.maxLength}`; });
    $$('.pp', m.el).forEach(b => b.addEventListener('click', () => { color = b.dataset.c; $$('.pp', m.el).forEach(x => x.setAttribute('aria-checked', String(x === b))); }));
    $('#nt-go', m.el).addEventListener('click', async () => {
      const text = ta.value.trim().replace(/\s+\n/g, '\n');
      if (!text) { ta.focus(); return; }
      m.close();
      if (isNote) await add('note', { text, color }, 240, 220);
      else await add('whisper', { text }, Math.min(420, 160 + text.length * 5), 96, rand(-3, 3));
    });
  }
  function stickerDialog() {
    const list = [...BUILTIN.map(b => ({ sticker: b.id, name: b.name, src: stickerURL(b.id) })), ...S.custom.map(c => ({ src: c.url, name: c.name || 'стикер', custom: true }))];
    const m = openModal(`<h2>Выбери стикер</h2><div class="tray tray--big">${list.map((s, i) => `<button class="tray__s" type="button" data-i="${i}" aria-label="${esc(s.name)}"><img src="${esc(s.src)}" alt=""></button>`).join('')}</div>`, { label: 'Выбери стикер', wide: true });
    $$('.tray__s', m.el).forEach(b => b.addEventListener('click', () => {
      const s = list[+b.dataset.i]; m.close();
      const size = rand(150, 210);
      add('sticker', s.custom ? { src: s.src, name: s.name } : { sticker: s.sticker, name: s.name }, size, s.sticker === 'pop' ? size * .8 : size, rand(-18, 18));
    }));
  }
  function reportDialog(it) {
    const m = openModal(`<h2>Пожаловаться?</h2><p>После нескольких жалоб вещь скрывается, а студия её проверяет.</p>
      <div class="field"><label for="rr">Что не так</label><select id="rr"><option>Спам или реклама</option><option>Грубо или обидно</option><option>Личные данные</option><option>Другое</option></select></div>
      <div class="modal__actions"><button class="btn btn--ghost" type="button" data-close>Отмена</button><button class="btn btn--danger" type="button" id="rr-go">Пожаловаться</button></div>`, { label: 'Жалоба' });
    $('#rr-go', m.el).addEventListener('click', async () => {
      try { await wall.report(it.id, $('#rr', m.el).value); S.hidden.add(it.id); removeLocal(it.id); stats(); m.close(); toast('Спасибо. Мы скрыли это для тебя, студия посмотрит.'); }
      catch (e) { toast(e.message, true); }
    });
  }

  /* ---------- drawing ---------- */
  function renderDrawbar() {
    const bar = $('#drawbar', root);
    bar.hidden = S.mode !== 'draw';
    if (S.mode !== 'draw') return;
    bar.innerHTML = `<div class="drawbar__in">
      <div class="seg" role="radiogroup" aria-label="Кисть">${Object.entries(BRUSHES).map(([k, b]) => `<button type="button" class="chip" role="radio" aria-checked="${S.brush === k}" data-brush="${k}">${b.name}</button>`).join('')}</div>
      <div class="swatches" role="radiogroup" aria-label="Цвет">${INKS.map(c => `<button type="button" class="sw" role="radio" style="--c:${c}" data-ink="${c}" aria-checked="${S.ink === c}" aria-label="Цвет ${c}"></button>`).join('')}</div>
      <div class="drawbar__btns"><button class="btn btn--ghost btn--small" type="button" data-act="draw-undo">Отменить</button><button class="btn btn--ghost btn--small" type="button" data-act="draw-cancel">Выйти</button><button class="btn btn--primary btn--small" type="button" data-act="draw-done">Приколоть рисунок</button></div>
    </div>`;
  }
  function drawDraft() {
    $('#draft', root).innerHTML = S.drawPaths.map(p => `<path d="${p.pts.map((v, i) => (i % 2 ? '' : (i ? 'L' : 'M')) + v.toFixed(1) + (i % 2 ? '' : ' ')).join('')}" stroke="${p.c}" stroke-width="${p.s}" stroke-opacity="${p.a}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  }
  function enterDraw() { S.mode = 'draw'; S.drawPaths = []; vp.classList.add('is-drawing'); renderDrawbar(); drawDraft(); toast('Рисуй где угодно на стене, потом нажми «Приколоть рисунок».'); }
  function exitDraw() { S.mode = 'idle'; S.drawPaths = []; vp.classList.remove('is-drawing'); drawDraft(); renderDrawbar(); }
  async function finishDraw() {
    const paths = S.drawPaths.filter(p => p.pts.length >= 2);
    if (!paths.length) { exitDraw(); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    paths.forEach(p => { for (let i = 0; i < p.pts.length; i += 2) { x0 = Math.min(x0, p.pts[i]); x1 = Math.max(x1, p.pts[i]); y0 = Math.min(y0, p.pts[i + 1]); y1 = Math.max(y1, p.pts[i + 1]); } });
    const pad = Math.max(...paths.map(p => p.s)) / 2 + 4;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const w = Math.max(24, x1 - x0), hh = Math.max(24, y1 - y0);
    let budget = 2400;
    const data = { paths: paths.map(p => {
      const out = [];
      for (let i = 0; i < p.pts.length && budget > 0; i += 2, budget--) out.push(+((p.pts[i] - x0) / w).toFixed(3), +((p.pts[i + 1] - y0) / hh).toFixed(3));
      return { p: out, c: p.c, s: p.s, a: p.a };
    }) };
    exitDraw();
    try {
      const it = await wall.add({ day: S.day, kind: 'drawing', x: Math.round(clamp(x0, -150, WORLD.w)), y: Math.round(clamp(y0, -150, WORLD.h)), w: Math.round(w), h: Math.round(hh), rot: 0, z: S.maxZ + 1, data });
      upsert(it); stats(); sound.play('pop');
    } catch (e) { toast(e.message || 'Рисунок не приклеился. Попробуй ещё раз.', true); }
  }

  /* ---------- pointer: pan, pinch, move, rotate, resize, draw ---------- */
  const pointers = new Map();
  let drag = null, pinch = null;
  vp.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.wi__flag, .hd--del')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      if (drag && drag.kind === 'draw' && S.drawPaths.length) S.drawPaths.pop(), drawDraft();
      drag = null;
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), k0: S.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx0: S.tx, ty0: S.ty };
      return;
    }
    if (pointers.size > 2) return;
    try { vp.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    if (S.mode === 'draw') {
      const p = toWorld(e.clientX, e.clientY);
      const b = BRUSHES[S.brush];
      S.drawPaths.push({ pts: [p.x, p.y], c: S.ink, s: b.s, a: b.a });
      drag = { kind: 'draw', id: e.pointerId };
      drawDraft(); e.preventDefault(); return;
    }
    const el = e.target.closest('.wi');
    const it = el && S.items.get(el.dataset.id);
    if (it && canEdit(it)) {
      const hd = e.target.closest('[data-h]');
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      drag = { kind: hd ? hd.dataset.h : 'move', id: it.id, pid: e.pointerId, x0: e.clientX, y0: e.clientY, ox: it.x, oy: it.y, ow: it.w, oh: it.h, orot: it.rot, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, moved: false };
      el.classList.add('is-active');
      e.preventDefault(); return;
    }
    drag = { kind: 'pan', pid: e.pointerId, x0: e.clientX, y0: e.clientY, tx0: S.tx, ty0: S.ty, moved: false };
  });
  const onMove = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = vp.getBoundingClientRect();
      const nk = clamp(pinch.k0 * d / pinch.d0, .08, 2.2);
      const px = pinch.cx - r.left, py = pinch.cy - r.top;
      S.k = nk; S.tx = px - (px - pinch.tx0) * nk / pinch.k0 + (cx - pinch.cx); S.ty = py - (py - pinch.ty0) * nk / pinch.k0 + (cy - pinch.cy);
      applyView(); return;
    }
    if (!drag) return;
    if (drag.kind === 'draw') {
      const p = toWorld(e.clientX, e.clientY); const path = S.drawPaths[S.drawPaths.length - 1];
      const lx = path.pts[path.pts.length - 2], ly = path.pts[path.pts.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) * S.k >= 2.5) { path.pts.push(p.x, p.y); drawDraft(); }
      return;
    }
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      S.tx = drag.tx0 + dx; S.ty = drag.ty0 + dy; clampView(); applyView(); return;
    }
    const it = S.items.get(drag.id); if (!it) return;
    const el = $(`.wi[data-id="${CSS.escape(it.id)}"]`, world);
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 3) drag.moved = true;
    if (drag.kind === 'move') {
      it.x = clamp(drag.ox + (e.clientX - drag.x0) / S.k, -150, WORLD.w - 40); it.y = clamp(drag.oy + (e.clientY - drag.y0) / S.k, -150, WORLD.h - 40);
    } else if (drag.kind === 'rot') {
      it.rot = Math.round((drag.orot + (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) - drag.a0) * 180 / Math.PI) * 10) / 10;
      it.rot = ((it.rot + 540) % 360) - 180;
    } else if (drag.kind === 'size') {
      const f = clamp(Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) / drag.d0, .2, 6);
      const nw = clamp(drag.ow * f, 30, 1200), nh = clamp(drag.oh * nw / drag.ow, 24, 1200);
      it.x = drag.ox + (drag.ow - nw) / 2; it.y = drag.oy + (drag.oh - nh) / 2; it.w = nw; it.h = nh;
      if (it.kind === 'drawing') { const svg = $('svg', el); if (svg) { svg.setAttribute('viewBox', `0 0 ${drag.ow} ${drag.oh}`); } }
    }
    if (el) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; el.style.width = it.w + 'px'; el.style.height = it.h + 'px'; el.style.transform = `rotate(${it.rot}deg)`; }
  };
  const onUp = async e => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'draw' || d.kind === 'pan') return;
    const it = S.items.get(d.id); if (!it) return;
    const el = $(`.wi[data-id="${CSS.escape(it.id)}"]`, world); if (el) el.classList.remove('is-active');
    if (!d.moved) return;
    it.z = S.maxZ + 1; S.maxZ = it.z;
    paint(it);
    const patch = { x: Math.round(it.x), y: Math.round(it.y), w: Math.round(it.w), h: Math.round(it.h), rot: it.rot, z: it.z };
    try { await wall.update(it.id, S.day, patch); sound.play('paper'); }
    catch (er) { toast(er.message, true); load(); }
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * .01), e.clientX, e.clientY);
    else { S.tx -= e.deltaX; S.ty -= e.deltaY; clampView(); applyView(); }
  }, { passive: false });

  async function removeItem(it) {
    const ok = await confirmBox('Убрать это со стены?', 'Оно исчезнет у всех.', 'Убрать', 'Оставить');
    if (!ok) return;
    try { await wall.remove(it.id, S.day); removeLocal(it.id); stats(); sound.play('paper'); }
    catch (e) { toast(e.message, true); }
  }
  root.addEventListener('click', e => {
    const t = e.target;
    const del = t.closest('.hd--del'); if (del) { const it = S.items.get(del.closest('.wi').dataset.id); if (it) removeItem(it); return; }
    const flag = t.closest('[data-act="report"]'); if (flag) { const it = S.items.get(flag.closest('.wi').dataset.id); if (it) reportDialog(it); return; }
    const br = t.closest('[data-brush]'); if (br) { S.brush = br.dataset.brush; renderDrawbar(); return; }
    const ink = t.closest('[data-ink]'); if (ink) { S.ink = ink.dataset.ink; renderDrawbar(); return; }
    const a = t.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'zin': zoomAt(1.25); break;
      case 'zout': zoomAt(.8); break;
      case 'zfit': fit(); break;
      case 'note': noteDialog('note'); break;
      case 'whisper': noteDialog('whisper'); break;
      case 'sticker': stickerDialog(); break;
      case 'draw': S.mode === 'draw' ? exitDraw() : enterDraw(); break;
      case 'draw-undo': S.drawPaths.pop(); drawDraft(); break;
      case 'draw-cancel': exitDraw(); break;
      case 'draw-done': finishDraw(); break;
      case 'medal': {
        const m = lsGet('bg.medal', null); if (!m) break;
        add('medal', { title: m.title, coins: m.coins }, 170, 212, rand(-10, 10)).then(it => { if (it) { m.used = true; lsSet('bg.medal', m); renderDock(); } });
        break;
      }
    }
  });
  root.addEventListener('keydown', async e => {
    const el = e.target.closest && e.target.closest('.wi');
    if (!el) return;
    const it = S.items.get(el.dataset.id);
    if (!it || !canEdit(it)) return;
    const st = e.shiftKey ? 50 : 10;
    const k = e.key;
    if (k === 'ArrowLeft') it.x -= st; else if (k === 'ArrowRight') it.x += st; else if (k === 'ArrowUp') it.y -= st; else if (k === 'ArrowDown') it.y += st;
    else if (k === '[') it.rot -= 5; else if (k === ']') it.rot += 5;
    else if (k === '+' || k === '=') { const f = 1.1; it.x -= it.w * (f - 1) / 2; it.y -= it.h * (f - 1) / 2; it.w *= f; it.h *= f; }
    else if (k === '-') { const f = 1 / 1.1; it.x -= it.w * (f - 1) / 2; it.y -= it.h * (f - 1) / 2; it.w *= f; it.h *= f; }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeItem(it); return; }
    else return;
    e.preventDefault();
    it.x = clamp(it.x, -150, WORLD.w - 40); it.y = clamp(it.y, -150, WORLD.h - 40);
    paint(it); el.focus();
    clearTimeout(it._t);
    it._t = setTimeout(() => wall.update(it.id, S.day, { x: Math.round(it.x), y: Math.round(it.y), w: Math.round(it.w), h: Math.round(it.h), rot: it.rot }).catch(er => { toast(er.message, true); load(); }), 500);
  });

  /* ---------- live updates and the end of the day ---------- */
  let unsub = () => {}, refresh = 0, dayTimer = 0, clockTimer = 0;
  if (live) {
    unsub = wall.subscribe(S.day, ev => {
      if (!S.alive) return;
      if (ev.type === 'DELETE') removeLocal(ev.item.id);
      else if (!(drag && drag.id === ev.item.id)) upsert(ev.item);
      stats();
    });
    if (state.mode === 'cloud') refresh = setInterval(load, 90000);
    const tickClock = () => {
      const ms = msToNextDay(); const hh = Math.floor(ms / 3.6e6), mm = Math.floor(ms % 3.6e6 / 6e4);
      const c = $('#closes', root); if (c) c.textContent = `Стена уйдёт в Капсулу времени через ${hh} ч ${mm} мин`;
    };
    tickClock(); clockTimer = setInterval(tickClock, 30000);
    dayTimer = setTimeout(() => {
      if (!S.alive) return;
      S.live = false; exitDraw();
      const dock = $('#dock', root); if (dock) dock.remove();
      $$('.wi', world).forEach(el => { const it = S.items.get(el.dataset.id); if (it) paint(it, el); });
      const banner = h(`<div class="dayover" role="status"><p><b>В студии полночь.</b> Эта стена ушла в Капсулу времени, началась новая.</p><a class="btn btn--yellow" href="#/wall" id="fresh">Открыть новую стену</a></div>`);
      $('.board-wrap', root).appendChild(banner);
      $('#fresh', banner).addEventListener('click', e => { e.preventDefault(); location.hash = '#/'; setTimeout(() => { location.hash = '#/wall'; }, 30); });
    }, msToNextDay() + 1500);
    try { S.custom = await stickerStore.list(); } catch (e) { S.custom = []; }
    renderDock();
  }

  const onResize = () => { clampView(); applyView(); };
  window.addEventListener('resize', onResize);
  startView();
  await Promise.all([load(), promptReady]);
  startView();

  return () => {
    S.alive = false; unsub(); clearInterval(refresh); clearInterval(clockTimer); clearTimeout(dayTimer);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('resize', onResize);
  };
}
