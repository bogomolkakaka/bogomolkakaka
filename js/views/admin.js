// Studio admin: sign in, moderate the wall, manage prompts, stickers, booth frames and settings.
import { CONFIG } from '../config.js';
import { $, $$, esc, h, ICON, toast, confirmBox, todayKey, fmtDay, resizeToBlob } from '../util.js';
import { state, onAuth, admin, prompts, stickers, config, upload, recs } from '../store.js';
import { FRAMES } from '../booth-strip.js';
import { stickerURL, medalSVG, svgURL } from '../stickers.js';

let R = null, tab = 'moderation';
export async function mount(root) {
  R = root;
  const off = onAuth(() => render());
  render();
  return () => { off(); R = null; };
}

function render() {
  if (!R) return;
  if (state.mode !== 'cloud') {
    R.innerHTML = `<div class="page admin"><a class="back" href="#/">${ICON.back}На рабочий стол</a><h1 class="page-title">Студия</h1>
      <div class="admin-card"><h2>Сайт пока работает в демо-режиме</h2>
      <p>Всё открывается и работает, но стена, архив и запросы хранятся только в браузере посетителя, а фигурки и работы берутся из демо-файла. Чтобы стена стала общей, а ты могла редактировать контент, подключи бесплатную базу Supabase. Пошаговая инструкция лежит в файле <b>README.md</b> в репозитории (займёт минут 15).</p>
      <ol class="admin-steps"><li>Создать проект на supabase.com.</li><li>Запустить файл <code>supabase/schema.sql</code> в SQL Editor.</li><li>Включить гостевой вход (Anonymous sign-ins).</li><li>Создать свой аккаунт и сделать его администратором.</li><li>Вписать адрес и ключ проекта в <code>js/config.js</code>.</li></ol></div></div>`;
    return;
  }
  if (!state.admin) {
    R.innerHTML = `<div class="page admin"><a class="back" href="#/">${ICON.back}На рабочий стол</a><h1 class="page-title">Студия</h1>
      <form class="admin-card admin-login" id="login"><h2>Вход для хозяйки студии</h2>
      ${state.email ? `<p class="notice">Ты вошла как ${esc(state.email)}, но этот аккаунт не отмечен как администратор. Выполни шаг 4 из README.</p>` : ''}
      <div class="field"><label for="a-email">Почта</label><input id="a-email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="a-pass">Пароль</label><input id="a-pass" type="password" autocomplete="current-password" required></div>
      <div class="modal__actions"><button class="btn btn--primary" type="submit">Войти</button>${state.email ? '<button class="btn btn--ghost" type="button" id="a-out">Выйти</button>' : ''}</div></form></div>`;
    $('#login', R).addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('button[type="submit"]', e.target); btn.disabled = true; btn.textContent = 'Вхожу…';
      try { await admin.signIn($('#a-email', R).value.trim(), $('#a-pass', R).value); toast('Добро пожаловать в студию'); }
      catch (er) { toast(er.message, true); btn.disabled = false; btn.textContent = 'Войти'; }
    });
    const o = $('#a-out', R); if (o) o.addEventListener('click', () => admin.signOut());
    return;
  }
  const tabs = [['moderation', 'Модерация'], ['films', 'Видеопрокат'], ['prompts', 'Вопросы дня'], ['stickers', 'Стикеры'], ['frames', 'Рамки'], ['settings', 'Настройки']];
  R.innerHTML = `<div class="page admin"><a class="back" href="#/">${ICON.back}На рабочий стол</a>
    <div class="page-head"><div><h1 class="page-title">Студия</h1><p class="page-sub">привет, хозяйка</p></div>
      <div class="admin-who"><span>${esc(state.email)}</span><button class="btn btn--ghost btn--small" type="button" id="a-out">Выйти</button></div></div>
    <p class="notice notice--blue">Фигурки и работы редактируются прямо на их страницах: открой <a href="#/objects">Маленькие объекты</a> или <a href="#/stuff">Мои работы</a> и нажми «Студия». Свои советы фильмов добавляй прямо в <a href="#/films">Видеопрокате</a>.</p>
    <div class="admin-tabs" role="tablist">${tabs.map(([k, n]) => `<button class="chip" role="tab" type="button" data-tab="${k}" aria-selected="${tab === k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    <div id="a-body" class="admin-body"><p>Загружаю…</p></div></div>`;
  $('#a-out', R).addEventListener('click', () => admin.signOut());
  $$('[data-tab]', R).forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  ({ moderation, films: filmsTab, prompts: promptsTab, stickers: stickersTab, frames: framesTab, settings: settingsTab })[tab]();
}

function preview(it) {
  const d = it.data || {};
  if (it.kind === 'note' || it.kind === 'whisper') return `<div class="mod-note">${esc(d.text || '')}</div>`;
  if (it.kind === 'sticker') return `<img src="${esc(d.src || stickerURL(d.sticker))}" alt="">`;
  if (it.kind === 'medal') return `<img src="${esc(svgURL(medalSVG(d)))}" alt="">`;
  if (it.kind === 'drawing') return `<div class="mod-note">рисунок (${(d.paths || []).length} линий)</div>`;
  return `<img src="${esc(d.src || '')}" alt="">`;
}
const KIND = { note: 'записка', whisper: 'шёпот', sticker: 'стикер', image: 'картинка', strip: 'фотолента', drawing: 'рисунок', medal: 'медаль' };
function itemRow(it, reasons) {
  return `<li class="mod-item${it.hidden ? ' is-hidden' : ''}" data-id="${esc(it.id)}"><div class="mod-prev">${preview(it)}</div>
    <div class="mod-info"><b>${KIND[it.kind] || it.kind}</b> · ${esc(fmtDay(it.day, { day: 'numeric', month: 'short', year: 'numeric' }))}${it.hidden ? ' · <span class="mod-flag">скрыто</span>' : ''}
      ${reasons ? `<p class="mod-reasons">Жалобы (${reasons.length}): ${esc([...new Set(reasons)].join(', '))}</p>` : ''}</div>
    <div class="mod-btns">${it.hidden ? `<button class="btn btn--ghost btn--small" data-m="show">${ICON.eye}Показать</button>` : `<button class="btn btn--ghost btn--small" data-m="hide">${ICON.eyeOff}Скрыть</button>`}
      ${reasons ? '<button class="btn btn--ghost btn--small" data-m="ok">Жалобы сняты</button>' : ''}<button class="btn btn--danger btn--small" data-m="del">${ICON.trash}Удалить</button></div></li>`;
}
async function moderation() {
  const body = $('#a-body', R);
  body.innerHTML = `<section class="admin-card"><h2>Жалобы</h2><ul class="mod-list" id="rep"><li>Загружаю…</li></ul></section>
    <section class="admin-card"><h2>Стена за день</h2><div class="admin-row"><label for="m-day">День</label><input class="input" type="date" id="m-day" value="${todayKey()}" max="${todayKey()}" style="width:auto"><button class="btn btn--ink btn--small" id="m-load" type="button">Показать</button></div><ul class="mod-list" id="day"></ul></section>`;
  const act = async (e, after) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const id = b.closest('.mod-item').dataset.id;
    try {
      if (b.dataset.m === 'hide') await admin.setHidden(id, true);
      if (b.dataset.m === 'show') await admin.setHidden(id, false);
      if (b.dataset.m === 'ok') await admin.clearReports(id);
      if (b.dataset.m === 'del') { if (!(await confirmBox('Удалить навсегда?', 'Элемент пропадёт со стены и из архива.', 'Удалить', 'Отмена'))) return; await admin.removeItem(id); }
      toast('Готово'); after();
    } catch (er) { toast(er.message, true); }
  };
  const loadReports = async () => {
    try {
      const { reports, items } = await admin.reports();
      const by = new Map(); reports.forEach(r => { if (!by.has(r.item_id)) by.set(r.item_id, []); by.get(r.item_id).push(r.reason || '—'); });
      $('#rep', R).innerHTML = items.length ? items.map(it => itemRow(it, by.get(it.id))).join('') : '<li class="mod-empty">Жалоб нет. Тишина и порядок.</li>';
    } catch (er) { $('#rep', R).innerHTML = `<li class="mod-empty">${esc(er.message)}</li>`; }
  };
  const loadDay = async () => {
    const day = $('#m-day', R).value || todayKey();
    try { const items = await admin.dayItems(day); $('#day', R).innerHTML = items.length ? items.map(it => itemRow(it)).join('') : '<li class="mod-empty">В этот день на стене ничего нет.</li>'; }
    catch (er) { $('#day', R).innerHTML = `<li class="mod-empty">${esc(er.message)}</li>`; }
  };
  $('#rep', R).addEventListener('click', e => act(e, () => { loadReports(); loadDay(); }));
  $('#day', R).addEventListener('click', e => act(e, () => { loadReports(); loadDay(); }));
  $('#m-load', R).addEventListener('click', loadDay);
  loadReports(); loadDay();
}
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
function recRow(r, reasons) {
  const meta = [r.kind === 'series' ? 'сериал' : 'фильм', r.year, r.genre].filter(Boolean).map(esc).join(' · ');
  return `<li class="mod-item rec-item" data-id="${esc(r.id)}"><div class="mod-prev"><div class="mod-note"><b>${esc(r.title)}</b><br><small>${meta}</small></div></div>
    <div class="mod-info"><b>${r.author ? esc(r.author) : 'гость без имени'}</b> · ${esc(r.created_at ? fmtDay(r.created_at.slice(0, 10), { day: 'numeric', month: 'short' }) : '')}${r.status !== 'approved' ? ` · <span class="mod-flag">${r.status === 'rejected' ? 'отклонено' : 'ждёт проверки'}</span>` : ''}
      ${r.note ? `<p class="rec-note">${esc(r.note)}</p>` : ''}
      ${r.links.length ? `<p class="rec-links">${r.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow">${l.label ? esc(l.label) + ': ' : ''}${esc(l.url.length > 72 ? l.url.slice(0, 72) + '…' : l.url)}</a>`).join('<br>')}</p>` : ''}
      ${reasons ? `<p class="mod-reasons">Жалобы (${reasons.length}): ${esc([...new Set(reasons)].join(', '))}</p>` : ''}</div>
    <div class="mod-btns">${r.status !== 'approved' ? `<button class="btn btn--primary btn--small" data-r="approve">${ICON.check || ''}Одобрить</button>` : `<button class="btn btn--ghost btn--small" data-r="hide">${ICON.eyeOff}Снять с полки</button>`}
      ${r.status === 'pending' ? '<button class="btn btn--ghost btn--small" data-r="reject">Отклонить</button>' : ''}
      ${reasons ? '<button class="btn btn--ghost btn--small" data-r="ok">Жалобы сняты</button>' : ''}<button class="btn btn--danger btn--small" data-r="del">${ICON.trash}Удалить</button></div></li>`;
}
async function filmsTab() {
  const body = $('#a-body', R);
  body.innerHTML = `<section class="admin-card"><h2>Ждут проверки</h2><p>Советы гостей появляются в Видеопрокате только после одобрения. Проверь ссылки, прежде чем одобрять.</p><ul class="mod-list" id="r-pend"><li>Загружаю…</li></ul></section>
    <section class="admin-card"><h2>Жалобы на советы</h2><p>После трёх жалоб совет гостя сам уходит на проверку.</p><ul class="mod-list" id="r-rep"><li>Загружаю…</li></ul></section>
    <section class="admin-card"><h2>Свои советы</h2><p>Добавлять и править свои фильмы удобнее прямо на полке: <a href="#/films">открыть Видеопрокат</a>.</p></section>`;
  const load = async () => {
    try {
      const list = await recs.pending();
      $('#r-pend', R).innerHTML = list.length ? list.map(r => recRow(r)).join('') : '<li class="mod-empty">Новых советов нет.</li>';
    } catch (er) { $('#r-pend', R).innerHTML = `<li class="mod-empty">${esc(er.message)}</li>`; }
    try {
      const { reports, items } = await recs.reports();
      const by = new Map(); reports.forEach(r => { if (!by.has(r.rec_id)) by.set(r.rec_id, []); by.get(r.rec_id).push(r.reason || '—'); });
      $('#r-rep', R).innerHTML = items.length ? items.map(it => recRow(it, by.get(it.id))).join('') : '<li class="mod-empty">Жалоб нет.</li>';
    } catch (er) { $('#r-rep', R).innerHTML = `<li class="mod-empty">${esc(er.message)}</li>`; }
  };
  body.addEventListener('click', async e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const id = b.closest('.mod-item').dataset.id;
    try {
      if (b.dataset.r === 'approve') { await recs.setStatus(id, 'approved'); toast('Одобрено: совет уже на полке'); }
      if (b.dataset.r === 'reject') { await recs.setStatus(id, 'rejected'); toast('Отклонено'); }
      if (b.dataset.r === 'hide') { await recs.setStatus(id, 'pending'); toast('Снято с полки и отправлено на проверку'); }
      if (b.dataset.r === 'ok') { await recs.clearReports(id); toast('Жалобы сняты'); }
      if (b.dataset.r === 'del') { if (!(await confirmBox('Удалить совет?', 'Он пропадёт из Видеопроката навсегда.', 'Удалить', 'Отмена'))) return; await recs.remove(id); toast('Удалено'); }
      load();
    } catch (er) { toast(er.message, true); }
  });
  load();
}
async function promptsTab() {
  const body = $('#a-body', R);
  let list = [];
  try { list = await prompts.list(); } catch (e) { toast(e.message, true); }
  body.innerHTML = `<section class="admin-card"><h2>Вопросы дня</h2><p>Каждый день стена берёт один активный вопрос. Можно привязать вопрос к конкретной дате.</p>
    <form class="admin-row" id="p-add"><input class="input" id="p-text" maxlength="140" placeholder="Например: Нарисуй свой завтрак" required><input class="input" type="date" id="p-day" style="width:auto" aria-label="Дата (необязательно)"><button class="btn btn--primary btn--small" type="submit">${ICON.plus}Добавить</button></form>
    <ul class="p-list">${list.map(p => `<li data-id="${p.id}"><label class="check"><input type="checkbox" ${p.active !== false ? 'checked' : ''} data-p="toggle">${esc(p.text)}</label>${p.day ? `<span class="p-day">${esc(fmtDay(p.day, { day: 'numeric', month: 'short' }))}</span>` : ''}<button class="iconbtn" type="button" data-p="del" aria-label="Удалить вопрос">${ICON.trash}</button></li>`).join('')}</ul></section>`;
  $('#p-add', R).addEventListener('submit', async e => { e.preventDefault(); try { await prompts.add($('#p-text', R).value.trim(), $('#p-day', R).value || null); toast('Вопрос добавлен'); promptsTab(); } catch (er) { toast(er.message, true); } });
  $('.p-list', R).addEventListener('click', async e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const id = +b.closest('li').dataset.id;
    try {
      if (b.dataset.p === 'toggle') { await prompts.setActive(id, b.checked); toast(b.checked ? 'Включено' : 'Выключено'); }
      if (b.dataset.p === 'del') { await prompts.remove(id); promptsTab(); }
    } catch (er) { toast(er.message, true); }
  });
}
async function stickersTab() {
  const body = $('#a-body', R);
  let list = [];
  try { list = await stickers.list(true); } catch (e) { toast(e.message, true); }
  body.innerHTML = `<section class="admin-card"><h2>Свои стикеры</h2><p>Появляются в фотобудке и на стене рядом со встроенными. Лучше всего PNG или SVG с прозрачным фоном.</p>
    <div class="admin-row"><input class="input" id="s-name" maxlength="40" placeholder="Название, например мордочка мопса" style="max-width:280px"><label class="btn btn--primary btn--small">${ICON.upload}Загрузить стикер<input type="file" id="s-file" accept="image/png,image/svg+xml,image/webp,image/jpeg" hidden></label></div>
    <ul class="s-list">${list.map(s => `<li data-id="${esc(s.id)}"><img src="${esc(s.url)}" alt=""><span>${esc(s.name || 'стикер')}</span><label class="check"><input type="checkbox" ${s.active ? 'checked' : ''} data-s="toggle">виден</label><button class="iconbtn" type="button" data-s="del" aria-label="Удалить стикер">${ICON.trash}</button></li>`).join('') || '<li class="mod-empty">Пока только встроенные стикеры.</li>'}</ul></section>`;
  $('#s-file', R).addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      let blob = f, ext = (f.type.split('/')[1] || 'png').replace('svg+xml', 'svg').replace('jpeg', 'jpg');
      if (f.type !== 'image/svg+xml' && f.size > 1.5 * 1024 * 1024) { blob = (await resizeToBlob(f, 800, 'image/png')).blob; ext = 'png'; }
      const url = await upload('media', blob, ext);
      await stickers.add(url, $('#s-name', R).value.trim());
      toast('Стикер добавлен'); stickersTab();
    } catch (er) { toast(er.message, true); }
  });
  $('.s-list', R).addEventListener('click', async e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const id = b.closest('li').dataset.id;
    try { if (b.dataset.s === 'toggle') await stickers.setActive(id, b.checked); if (b.dataset.s === 'del') { await stickers.remove(id); stickersTab(); } toast('Готово'); } catch (er) { toast(er.message, true); }
  });
}
async function framesTab() {
  const body = $('#a-body', R);
  const cfg = await config.all(); const off = new Set(cfg.frames_off || []);
  body.innerHTML = `<section class="admin-card"><h2>Рамки фотобудки</h2><p>Выключенные рамки посетители не увидят.</p>
    <ul class="f-list">${FRAMES.map(f => `<li><label class="check"><input type="checkbox" data-f="${f.id}" ${off.has(f.id) ? '' : 'checked'}>${esc(f.name)}</label></li>`).join('')}</ul>
    <button class="btn btn--primary btn--small" id="f-save" type="button">Сохранить</button></section>`;
  $('#f-save', R).addEventListener('click', async () => {
    const offList = $$('[data-f]', R).filter(c => !c.checked).map(c => c.dataset.f);
    if (offList.length === FRAMES.length) { toast('Оставь хотя бы одну рамку.', true); return; }
    try { await config.set('frames_off', offList); toast('Рамки сохранены'); } catch (er) { toast(er.message, true); }
  });
}
async function settingsTab() {
  const body = $('#a-body', R);
  const cfg = await config.all(); const c = { ...CONFIG.CONTACTS, ...(cfg.contacts || {}) };
  body.innerHTML = `<section class="admin-card"><h2>Контакты для покупателей</h2>
      <div class="field"><label for="c-email">Почта</label><input id="c-email" type="email" value="${esc(c.email || '')}"></div>
      <div class="grid2"><div class="field"><label for="c-tg">Telegram</label><input id="c-tg" value="${esc(c.telegram || '')}" placeholder="@username"></div><div class="field"><label for="c-ig">Instagram</label><input id="c-ig" value="${esc(c.instagram || '')}" placeholder="@username"></div></div>
      <button class="btn btn--primary btn--small" id="c-save" type="button">Сохранить контакты</button></section>
    <section class="admin-card"><h2>Часовой пояс студии</h2><p>Стена меняется в полночь по этому поясу для всех. Сейчас в базе: <b>${esc(String(cfg.timezone || 'Europe/Moscow'))}</b>, на сайте: <b>${esc(CONFIG.TIMEZONE)}</b>. Если меняешь здесь, поменяй и <code>TIMEZONE</code> в <code>js/config.js</code>.</p>
      <div class="admin-row"><input class="input" id="tz" value="${esc(String(cfg.timezone || CONFIG.TIMEZONE))}" style="max-width:260px" aria-label="Часовой пояс, например Europe/Moscow"><button class="btn btn--ink btn--small" id="tz-save" type="button">Сохранить пояс</button></div></section>
    <section class="admin-card"><h2>Тексты</h2>
      <div class="field"><label for="t-obj">Вступление на «Маленьких объектах»</label><textarea id="t-obj" rows="3" maxlength="600">${esc(cfg.objects_intro || '')}</textarea></div>
      <button class="btn btn--primary btn--small" id="t-save" type="button">Сохранить тексты</button></section>`;
  const run = async (fn, msg) => { try { await fn(); toast(msg); } catch (er) { toast(er.message, true); } };
  $('#c-save', R).addEventListener('click', () => run(() => config.set('contacts', { email: $('#c-email', R).value.trim(), telegram: $('#c-tg', R).value.trim(), instagram: $('#c-ig', R).value.trim() }), 'Контакты сохранены'));
  $('#tz-save', R).addEventListener('click', () => {
    const tz = $('#tz', R).value.trim();
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch (e) { toast('Такого часового пояса нет. Пример: Europe/Moscow', true); return; }
    run(() => config.set('timezone', tz), 'Пояс сохранён');
  });
  $('#t-save', R).addEventListener('click', () => run(() => config.set('objects_intro', $('#t-obj', R).value.trim()), 'Тексты сохранены'));
}
