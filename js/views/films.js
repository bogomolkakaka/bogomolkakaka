// ВИДЕОПРОКАТ: a shelf of VHS sleeves with film and series recommendations.
// Anyone can suggest one; guest suggestions wait for the owner's approval before they appear.
import { $, $$, esc, ICON, sound, toast, openModal, confirmBox, hashStr, lsGet, lsSet, plural } from '../util.js';
import { recs as store, state, onAuth } from '../store.js';

const KIND = { film: 'Фильм', series: 'Сериал' };
const KINDS = [['all', 'Всё'], ['film', 'Фильмы'], ['series', 'Сериалы']];
const WHO = [['all', 'Все советы'], ['owner', 'От хозяйки'], ['guests', 'От гостей']];
// Sleeve palettes: background, art colour, text colour on the title block.
const SLEEVES = [
  ['#244EE7', '#FFD84A', '#fff'], ['#FFD84A', '#E8291F', '#000'], ['#FFB8D9', '#244EE7', '#000'], ['#E8291F', '#FFB8D9', '#fff'],
  ['#CFE0FF', '#244EE7', '#000'], ['#000000', '#FFD84A', '#fff'], ['#FFFFFF', '#E8291F', '#000'], ['#244EE7', '#FFB8D9', '#fff']
];
const ARTS = ['sun', 'stripes', 'dots', 'half', 'rings', 'grid'];

let S = null, R = null;
export async function mount(root) {
  R = root;
  S = { list: [], loaded: false, failed: '', kind: 'all', who: 'all' };
  root.innerHTML = `<div class="page films-page">
    <div class="page-head"><div><a class="back" href="#/">${ICON.back}На рабочий стол</a>
      <h1 class="page-title">Видеопрокат</h1><p class="page-sub">фильмы и сериалы, которые стоит посмотреть</p></div>
      <button class="btn btn--yellow" type="button" data-act="suggest" id="f-suggest">${ICON.plus}<span>Посоветовать</span></button></div>
    ${state.mode === 'local' ? '<p class="notice films-local">Демо-режим: твои советы сохраняются только в этом браузере, пока студия не подключит базу данных.</p>' : ''}
    <div class="films-bar">
      <div class="films-seg" role="group" aria-label="Что показать" id="f-kind"></div>
      <div class="films-seg" role="group" aria-label="Чьи советы" id="f-who"></div>
    </div>
    <ul class="vhs-shelf" id="f-shelf" aria-label="Полка с кассетами"></ul>
  </div>`;
  root.addEventListener('click', onClick);
  const off = onAuth(() => { load(); });
  await load();
  return () => { off(); R = null; S = null; };
}

async function load() {
  try { S.list = await store.list(); S.failed = ''; }
  catch (e) { S.failed = e.message || 'Полка не загрузилась. Обнови страницу.'; }
  if (!S) return;
  S.loaded = true;
  render();
}

const mine = r => !!r.owner && r.owner === state.uid;
function visible() {
  const hidden = new Set(lsGet('bg.reported', []));
  return S.list
    .filter(r => !hidden.has(r.id) && r.status !== 'rejected' && (r.status === 'approved' || mine(r) || state.admin))
    .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || String(b.created_at).localeCompare(String(a.created_at)));
}
const passes = r => (S.kind === 'all' || r.kind === S.kind) && (S.who === 'all' || (S.who === 'owner' ? r.by_owner : !r.by_owner));

function render() {
  if (!S || !R) return;
  $('#f-suggest', R).lastElementChild.textContent = state.admin ? 'Добавить свой совет' : 'Посоветовать';
  const all = visible();
  const count = (k, w) => all.filter(r => (k === 'all' || r.kind === k) && (w === 'all' || (w === 'owner' ? r.by_owner : !r.by_owner))).length;
  $('#f-kind', R).innerHTML = KINDS.map(([k, n]) => `<button class="chip" type="button" data-kind="${k}" aria-pressed="${S.kind === k}">${n} <small>${count(k, S.who)}</small></button>`).join('');
  $('#f-who', R).innerHTML = WHO.map(([k, n]) => `<button class="chip" type="button" data-who="${k}" aria-pressed="${S.who === k}">${n} <small>${count(S.kind, k)}</small></button>`).join('');
  const shelf = $('#f-shelf', R);
  if (S.failed) { shelf.innerHTML = `<li class="vhs-empty"><b>Полка не загрузилась</b>${esc(S.failed)}</li>`; return; }
  if (!S.loaded) { shelf.innerHTML = [0, 1, 2, 3].map(() => '<li class="vhs-slot is-skeleton" aria-hidden="true"><span class="vhs"></span></li>').join(''); return; }
  const list = all.filter(passes);
  if (!list.length) {
    shelf.innerHTML = all.length
      ? `<li class="vhs-empty"><b>Здесь пока пусто</b>С такими фильтрами кассет нет. <button class="linkbtn" type="button" data-act="reset">Показать всё</button></li>`
      : `<li class="vhs-empty"><b>Полка ждёт первую кассету</b>Посоветуй фильм или сериал, который тебе правда понравился. <button class="btn btn--yellow btn--small" type="button" data-act="suggest">${ICON.plus}Посоветовать</button></li>`;
    return;
  }
  shelf.innerHTML = list.map(sleeveHTML).join('');
}

// Fit the title on the sleeve: biggest size at which the longest word fits and the title takes at most four lines.
function titleSize(t) {
  const words = t.toUpperCase().split(/\s+/).filter(Boolean);
  const W = 84, CH = .86;
  for (let fs = 15; fs > 6; fs -= .5) {
    const cw = fs * CH;
    if (Math.max(...words.map(w => w.length)) * cw > W) continue;
    let lines = 1, cur = 0;
    for (const w of words) { const len = w.length * cw; if (cur && cur + cw + len > W) { lines++; cur = len; } else cur += (cur ? cw : 0) + len; }
    if (lines <= 4) return fs;
  }
  return 6;
}
function sleeveHTML(r, i) {
  const hsh = hashStr(r.title + r.year);
  const [bg, art, ink] = SLEEVES[hsh % SLEEVES.length];
  const kind = ARTS[(hsh >>> 5) % ARTS.length];
  const tilt = (((hsh >>> 9) % 7) - 3) * .5;
  const pend = r.status === 'pending';
  const who = r.by_owner ? 'Хозяйка советует' : r.author ? `советует ${esc(r.author)}` : 'совет гостя';
  const meta = [KIND[r.kind], r.year].filter(Boolean).join(', ');
  return `<li class="vhs-slot${pend ? ' is-pending' : ''}" style="--i:${i}">
    <button class="vhs" type="button" data-id="${esc(r.id)}" style="--sbg:${bg};--sart:${art};--sink:${ink};--tilt:${tilt}deg;--fs:${titleSize(r.title)}cqw" aria-label="${esc(r.title)}. ${esc(meta)}. ${who}${pend ? '. Ждёт проверки' : ''}">
      <span class="vhs__top"><span>${KIND[r.kind]}</span>${r.year ? `<span>${esc(r.year)}</span>` : ''}</span>
      <span class="vhs__art vhs__art--${kind}" aria-hidden="true"></span>
      <span class="vhs__title">${esc(r.title)}</span>
      ${r.genre ? `<span class="vhs__genre" style="--gs:${Math.min(10, 84 / (r.genre.length * .74)).toFixed(2)}cqw">${esc(r.genre)}</span>` : ''}
      <span class="vhs__tape" aria-hidden="true"></span>
      ${r.by_owner ? '<span class="vhs__pick" aria-hidden="true">Хозяйка<br>советует</span>' : ''}
      ${pend ? '<span class="vhs__pending" aria-hidden="true">на проверке</span>' : ''}
      ${r.demo ? '<span class="vhs__demo" aria-hidden="true">демо</span>' : ''}
    </button>
    <p class="vhs-cap">${r.by_owner ? '' : `<span>${who}</span>`}${r.links.length ? `<small>${r.links.length} ${plural(r.links.length, ['ссылка', 'ссылки', 'ссылок'])}</small>` : ''}</p></li>`;
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
function openRec(id) {
  const r = S.list.find(x => x.id === id); if (!r) return;
  const hsh = hashStr(r.title + r.year);
  const [bg, art, ink] = SLEEVES[hsh % SLEEVES.length];
  const pend = r.status === 'pending';
  const own = mine(r);
  const paras = r.note.trim() ? r.note.trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : '';
  const m = openModal(`<div class="rec" style="--sbg:${bg};--sart:${art};--sink:${ink}">
    <div class="rec__head"><p class="rec__meta"><span class="chip chip--static">${KIND[r.kind]}</span>${r.year ? `<span>${esc(r.year)}</span>` : ''}${r.genre ? `<span>${esc(r.genre)}</span>` : ''}</p>
      <h2 class="rec__title">${esc(r.title)}</h2>
      <p class="rec__who">${r.by_owner ? 'Хозяйка советует' : r.author ? `Советует ${esc(r.author)}` : 'Совет гостя'}</p></div>
    ${pend ? `<p class="notice">${state.admin ? 'Этот совет ждёт проверки: гости его пока не видят.' : 'Совет ждёт проверки. Пока его видишь только ты, на общей полке он появится после одобрения.'}</p>` : ''}
    ${paras ? `<div class="rec__note">${paras}</div>` : ''}
    <div class="rec__watch"><h3>Где смотреть</h3>
      ${r.links.length ? `<ul class="rec__links">${r.links.map(l => `<li><a class="btn btn--primary" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${ICON.right}<span>${esc(l.label || host(l.url))}</span><small>${esc(host(l.url))}</small></a></li>`).join('')}</ul>
        ${r.by_owner ? '' : '<p class="rec__hint">Ссылки добавили гости. Перед входом проверь, что сайт тебе знаком.</p>'}` : '<p class="rec__hint">Ссылок пока нет. Поищи по названию в своём любимом сервисе.</p>'}</div>
    <div class="rec__actions">
      ${state.admin ? `${pend ? '<button class="btn btn--primary btn--small" type="button" data-r="approve">Одобрить</button>' : ''}<button class="btn btn--ink btn--small" type="button" data-r="edit">${ICON.pen}Изменить</button><button class="btn btn--danger btn--small" type="button" data-r="del">${ICON.trash}Удалить</button>`
        : own && pend ? `<button class="btn btn--ghost btn--small" type="button" data-r="withdraw">${ICON.trash}Забрать совет</button>`
        : r.by_owner || r.demo ? '' : `<button class="btn btn--text btn--small" type="button" data-r="report">${ICON.flag}Пожаловаться</button>`}
    </div></div>`, { label: r.title, wide: true });
  m.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const a = b.dataset.r;
    try {
      if (a === 'approve') { await store.setStatus(r.id, 'approved'); toast('Одобрено: кассета на полке'); m.close(); load(); }
      if (a === 'edit') { m.close(); suggest(r); }
      if (a === 'del' || a === 'withdraw') {
        if (!(await confirmBox(a === 'del' ? 'Удалить совет?' : 'Забрать совет?', 'Кассета пропадёт с полки.', a === 'del' ? 'Удалить' : 'Забрать', 'Отмена'))) return;
        await store.remove(r.id); toast(a === 'del' ? 'Удалено' : 'Совет забран'); m.close(); load();
      }
      if (a === 'report') { m.close(); report(r); }
    } catch (er) { toast(er.message, true); }
  });
}

function report(r) {
  const m = openModal(`<h2>Пожаловаться?</h2><p>Хозяйка студии проверит этот совет. После нескольких жалоб он сам уходит на проверку.</p>
    <div class="field"><label for="fr-r">Что не так</label><select id="fr-r"><option>Подозрительная ссылка</option><option>Спам или реклама</option><option>Грубо или обидно</option><option>Другое</option></select></div>
    <div class="modal__actions"><button class="btn btn--ghost" type="button" data-close>Отмена</button><button class="btn btn--danger" type="button" id="fr-go">Пожаловаться</button></div>`, { label: 'Жалоба' });
  $('#fr-go', m.el).addEventListener('click', async () => {
    try { await store.report(r.id, $('#fr-r', m.el).value); const h = lsGet('bg.reported', []); if (!h.includes(r.id)) { h.push(r.id); lsSet('bg.reported', h); } m.close(); toast('Спасибо. Мы скрыли кассету для тебя, хозяйка посмотрит.'); render(); }
    catch (e) { toast(e.message, true); }
  });
}

// Accepts "kinopoisk.ru/film/1" or a full address; returns a clean http(s) URL or ''.
function cleanUrl(v) {
  let u = String(v || '').trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  try { const x = new URL(u); if (!/^https?:$/.test(x.protocol) || !x.hostname.includes('.') || /[\s"'<>]/.test(u)) return null; return x.href.slice(0, 500); }
  catch (e) { return null; }
}
function linkRow(l = {}, i) {
  return `<div class="lrow" data-l="${i}"><input class="input" type="url" inputmode="url" maxlength="500" placeholder="https://…" aria-label="Ссылка ${i + 1}" value="${esc(l.url || '')}" data-k="url">
    <input class="input" maxlength="40" placeholder="Сервис, например Кинопоиск" aria-label="Название сервиса для ссылки ${i + 1}" value="${esc(l.label || '')}" data-k="label">
    <button class="iconbtn" type="button" data-lx="${i}" aria-label="Убрать ссылку ${i + 1}">${ICON.close}</button></div>`;
}
function suggest(src = null) {
  const d = src || { kind: 'film', links: [] };
  let links = d.links.length ? d.links.map(l => ({ ...l })) : [{ url: '', label: '' }];
  const owner = state.admin;
  const m = openModal(`<h2>${src ? 'Изменить совет' : owner ? 'Свой совет' : 'Посоветовать фильм или сериал'}</h2>
    <p>${owner ? 'Твой совет сразу появится на полке с наклейкой «Хозяйка советует».' : 'Совет появится на полке, когда хозяйка студии его проверит.'}</p>
    <form id="rf" novalidate>
      <div class="field" id="rf-title-f"><label for="rf-title">Название *</label><input id="rf-title" maxlength="120" required value="${esc(d.title || '')}" placeholder="Например, Амели"><span class="field__err" id="rf-title-e" hidden>Напиши название.</span></div>
      <div class="field"><span class="label">Это</span><div class="seg" role="radiogroup" aria-label="Фильм или сериал">${Object.entries(KIND).map(([k, n]) => `<button type="button" class="chip" role="radio" aria-checked="${d.kind === k}" data-kd="${k}">${n}</button>`).join('')}</div></div>
      <div class="grid2"><div class="field"><label for="rf-year">Год</label><input id="rf-year" maxlength="9" inputmode="numeric" value="${esc(d.year || '')}" placeholder="2001"></div>
        <div class="field"><label for="rf-genre">Жанр</label><input id="rf-genre" maxlength="40" value="${esc(d.genre || '')}" placeholder="комедия, драма…"></div></div>
      <div class="field"><label for="rf-note">Почему стоит посмотреть</label><textarea id="rf-note" rows="4" maxlength="600" placeholder="Пара предложений без спойлеров">${esc(d.note || '')}</textarea><small id="rf-note-c">${(d.note || '').length} / 600</small></div>
      <div class="field"><span class="label">Ссылки на просмотр</span><small>До трёх ссылок. Лучше на официальные сервисы: пиратские ссылки не пройдут проверку.</small>
        <div id="rf-links"></div><button class="btn btn--ghost btn--small" type="button" id="rf-addl">${ICON.plus}Ещё ссылка</button><span class="field__err" id="rf-links-e" hidden></span></div>
      ${owner ? '' : `<div class="field"><label for="rf-author">Твоё имя</label><input id="rf-author" maxlength="40" value="${esc(d.author || '')}" placeholder="Можно не писать"><small>Будет видно на кассете: «советует …».</small></div>`}
      <div class="hp" aria-hidden="true"><label>Не заполняй это поле <input id="rf-site" tabindex="-1" autocomplete="off"></label></div>
      <div class="modal__actions"><button class="btn btn--ghost" type="button" data-close>Отмена</button><button class="btn btn--primary" type="submit" id="rf-go">${src ? 'Сохранить' : owner ? 'Поставить на полку' : 'Отправить на проверку'}</button></div>
    </form>`, { label: 'Совет', wide: true });
  const el = m.el;
  let kind = d.kind;
  const drawLinks = () => {
    $('#rf-links', el).innerHTML = links.map(linkRow).join('');
    $('#rf-addl', el).hidden = links.length >= 3;
  };
  const readLinks = () => { $$('.lrow', el).forEach((row, i) => { links[i] = { url: $('[data-k="url"]', row).value, label: $('[data-k="label"]', row).value }; }); };
  drawLinks();
  el.addEventListener('click', e => {
    const k = e.target.closest('[data-kd]'); if (k) { kind = k.dataset.kd; $$('[data-kd]', el).forEach(b => b.setAttribute('aria-checked', String(b === k))); return; }
    const x = e.target.closest('[data-lx]'); if (x) { readLinks(); links.splice(+x.dataset.lx, 1); if (!links.length) links = [{ url: '', label: '' }]; drawLinks(); return; }
    if (e.target.closest('#rf-addl')) { readLinks(); if (links.length < 3) links.push({ url: '', label: '' }); drawLinks(); const rows = $$('.lrow', el); $('input', rows[rows.length - 1]).focus(); }
  });
  $('#rf-note', el).addEventListener('input', e => { $('#rf-note-c', el).textContent = `${e.target.value.length} / 600`; });
  $('#rf', el).addEventListener('submit', async e => {
    e.preventDefault();
    readLinks();
    const title = $('#rf-title', el).value.trim().replace(/\s+/g, ' ');
    $('#rf-title-f', el).classList.toggle('is-invalid', !title); $('#rf-title-e', el).hidden = !!title;
    if (!title) { $('#rf-title', el).focus(); return; }
    const clean = []; let bad = false;
    for (const l of links) { if (!l.url.trim()) continue; const u = cleanUrl(l.url); if (!u) { bad = true; break; } clean.push({ url: u, label: l.label.trim().slice(0, 40) }); }
    const le = $('#rf-links-e', el);
    if (bad) { le.textContent = 'Проверь ссылку: она должна быть адресом сайта, например https://www.kinopoisk.ru/…'; le.hidden = false; return; }
    le.hidden = true;
    if ($('#rf-site', el).value) { m.close(); toast('Спасибо! Совет отправлен на проверку.'); return; }
    const rec = { kind, title, year: $('#rf-year', el).value.trim(), genre: $('#rf-genre', el).value.trim(), note: $('#rf-note', el).value.trim(), author: owner ? (d.author || '') : $('#rf-author', el).value.trim(), links: clean };
    const btn = $('#rf-go', el); btn.disabled = true;
    try {
      if (src) await store.update(src.id, rec);
      else await store.add(rec);
      m.close(); sound.play('pop');
      toast(src ? 'Совет сохранён' : owner ? 'Кассета на полке' : 'Спасибо! Совет появится на полке после проверки.');
      if (!src) { S.kind = 'all'; S.who = 'all'; }
      await load();
    } catch (er) { toast(er.message, true); btn.disabled = false; }
  });
}

function onClick(e) {
  const t = e.target;
  const v = t.closest('.vhs[data-id]'); if (v) { sound.play('click'); openRec(v.dataset.id); return; }
  const k = t.closest('[data-kind]'); if (k) { S.kind = k.dataset.kind; render(); return; }
  const w = t.closest('[data-who]'); if (w) { S.who = w.dataset.who; render(); return; }
  const a = t.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'suggest') suggest();
  if (a.dataset.act === 'reset') { S.kind = 'all'; S.who = 'all'; render(); }
}
