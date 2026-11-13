import { CONFIG } from '../config.js';
import { $, $$, esc, h, ICON, sound, lsGet, lsSet, zoned, todayKey, reducedMotion, pick, plural, MONTHS } from '../util.js';
import { wall } from '../store.js';
import { drawMini } from '../wallmini.js';

const PHRASES = [
  'Ctrl+S — мой язык любви.', 'Сделай логотип побольше. Шучу.', 'Кернинг — это забота о себе.', 'final_final_v7.png',
  'Верь сетке. Потом нарушай её.', 'Для ещё одного стикера место всегда найдётся.', 'Lorem ipsum — это не характер.',
  'У каждого пикселя есть чувства.', 'Отмена — лучшее изобретение человечества.', 'Эта записка висит тут с 2004 года.',
  'Оставь стол чуть веселее, чем он был.', 'Набери «кернинг» где угодно. Поверь.', '↑ ↑ ↓ ↓ ← → ← → B A',
  'У кого-то кузен — дизайнер.', 'Для кого-то Comic Sans — любимый шрифт.', 'Настроение дня: 60% кофе, 40% градиентов.'
];

export async function mount(root) {
  const z = zoned();
  const wd = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: CONFIG.TIMEZONE }).format(new Date());
  root.innerHTML = `<section class="desk" aria-label="Рабочий стол">
    <div class="mat" aria-hidden="true">
      <div class="mat__ruler">${Array.from({ length: 10 }, (_, i) => `<span>${i * 10}</span>`).join('')}</div>
      <div class="mat__ruler mat__ruler--side">${Array.from({ length: 6 }, (_, i) => `<span>${i * 10}</span>`).join('')}</div>
      <div class="mat__angle"></div>
    </div>
    <div class="desk-hero">
      <h1 class="desk-title">${esc(CONFIG.SITE_NAME)}</h1>
      <p class="desk-sub">маленькая студия в интернете.<br>трогай вещи, оставляй след.</p>
    </div>
    <a class="thing thing--booth" href="#/booth" data-thing="booth"><img src="assets/desk/camera.png" alt="Фотобудка: синий фотоаппарат" width="441" height="391"><span class="thing__label">Фотобудка</span></a>
    <a class="thing thing--wall" href="#/wall" data-thing="wall"><div class="deskboard"><span class="tape" aria-hidden="true"></span><canvas width="640" height="400" aria-hidden="true"></canvas>
      <div class="board__cap"><b>Стена дня</b><span id="desk-count">…</span></div></div><span class="thing__label">Сделаем что-то вместе</span></a>
    <a class="thing thing--capsule" href="#/capsule" data-thing="capsule"><div class="cal"><div class="cal__top">${MONTHS[z.m - 1].toUpperCase()}</div><div class="cal__day">${z.d}</div><div class="cal__wd">${esc(wd)}</div></div><span class="thing__label">Капсула времени</span></a>
    <a class="thing thing--run" href="#/run" data-thing="run"><span class="console"><img src="assets/desk/console.png" alt="Игры: жёлтая игровая консоль" width="489" height="523"><canvas class="console-screen" width="96" height="76" aria-hidden="true"></canvas></span><span class="thing__label">Игры</span></a>
    <a class="thing thing--objects" href="#/objects" data-thing="objects"><img src="assets/desk/toys.png" alt="Маленькие объекты: три фигурки" width="639" height="351"><span class="thing__label">Маленькие объекты</span></a>
    <a class="thing thing--films" href="#/films" data-thing="films"><span class="dvhs-stack" aria-hidden="true"><span class="dvhs dvhs--1"><b>СЕРИАЛЫ</b></span><span class="dvhs dvhs--2"><b>ЛЮБИМОЕ</b></span><span class="dvhs dvhs--3"><b>КИНО</b></span></span><span class="thing__label">Видеопрокат</span></a>
    <a class="thing thing--stuff" href="#/stuff" data-thing="stuff"><div class="folders" aria-hidden="true">
      <div class="folder folder--1" data-tab="разное"></div><div class="folder folder--2" data-tab="3D"></div><div class="folder__paper"></div>
      <div class="folder folder--3" data-tab="постеры"><span class="folder__label">Мои работы</span></div></div><span class="thing__label">Мои работы</span></a>
    <button class="note-phrase" type="button" id="phrase" aria-live="polite"><span>${esc(pick(PHRASES))}</span><small>нажми, чтобы сменить</small></button>
    <span class="decor pencil" aria-hidden="true"></span>
    <span class="decor ring" aria-hidden="true"></span>
    <span class="decor eraser" aria-hidden="true"></span>
    <span class="decor clip" aria-hidden="true"></span>
    <p class="hint-move">пссс: вещи на столе можно двигать</p>
    <button class="btn btn--ghost btn--small desk-reset" type="button" id="desk-reset" hidden>Прибрать стол</button>
  </section>`;

  const desk = $('.desk', root);
  const unit = () => parseFloat(getComputedStyle(desk).getPropertyValue('--u')) || 0;
  const pxPerU = () => { const probe = document.createElement('div'); probe.style.width = 'calc(100 * var(--u))'; probe.style.position = 'absolute'; desk.appendChild(probe); const w = probe.getBoundingClientRect().width / 100; probe.remove(); return w || 1; };
  const isPhone = () => matchMedia('(max-width: 819px)').matches;
  let saved = lsGet('bg.desk', {});
  const applyPos = () => {
    const k = pxPerU();
    $$('.thing', desk).forEach(t => {
      const p = saved[t.dataset.thing];
      if (p && !isPhone()) { t.style.setProperty('--dx', p[0] * k + 'px'); t.style.setProperty('--dy', p[1] * k + 'px'); }
      else { t.style.removeProperty('--dx'); t.style.removeProperty('--dy'); }
    });
    $('#desk-reset').hidden = !Object.keys(saved).length || isPhone();
  };
  applyPos();
  void unit;

  // keep the site name inside the mat whatever the font and screen width
  const title = $('.desk-title', root), hero = $('.desk-hero', root);
  const fitTitle = () => {
    title.style.fontSize = '';
    const cs = getComputedStyle(hero);
    const room = hero.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const w = title.scrollWidth;
    if (room > 0 && w > room) title.style.fontSize = (parseFloat(getComputedStyle(title).fontSize) * room / w * .98) + 'px';
  };
  fitTitle();
  if (document.fonts) document.fonts.ready.then(() => { if (title.isConnected) fitTitle(); });

  // drag things around (desktop); a short press without moving still opens the room
  let drag = null, suppressClick = false;
  const onDown = e => {
    const t = e.target.closest('.thing');
    if (!t || isPhone() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const k = pxPerU();
    const p = saved[t.dataset.thing] || [0, 0];
    drag = { t, x0: e.clientX, y0: e.clientY, dx0: p[0], dy0: p[1], k, moved: false, id: e.pointerId };
  };
  const onMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const mx = e.clientX - drag.x0, my = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(mx, my) < 7) return;
    if (!drag.moved) { drag.moved = true; drag.t.classList.add('is-dragging'); try { drag.t.setPointerCapture(drag.id); } catch (er) { /* ignore */ } sound.play('paper'); }
    const nx = drag.dx0 + mx / drag.k, ny = drag.dy0 + my / drag.k;
    drag.t.style.setProperty('--dx', nx * drag.k + 'px'); drag.t.style.setProperty('--dy', ny * drag.k + 'px');
    drag.cur = [Math.round(nx * 10) / 10, Math.round(ny * 10) / 10];
  };
  const onUp = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      suppressClick = true;
      drag.t.classList.remove('is-dragging');
      saved = { ...saved, [drag.t.dataset.thing]: drag.cur }; lsSet('bg.desk', saved);
      $('#desk-reset').hidden = false;
      setTimeout(() => { suppressClick = false; }, 50);
    }
    drag = null;
  };
  desk.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  desk.addEventListener('click', e => {
    if (suppressClick && e.target.closest('.thing')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  desk.addEventListener('dragstart', e => e.preventDefault());
  $('#desk-reset').addEventListener('click', () => { saved = {}; lsSet('bg.desk', saved); applyPos(); sound.play('paper'); });
  const onResize = () => { applyPos(); fitTitle(); };
  window.addEventListener('resize', onResize);

  // phrase note
  $('#phrase').addEventListener('click', () => {
    const cur = $('#phrase span').textContent;
    let next = pick(PHRASES); while (next === cur) next = pick(PHRASES);
    $('#phrase span').textContent = next; sound.play('paper');
  });

  // today's wall preview
  const cv = $('.thing--wall canvas', root);
  let alive = true;
  (async () => {
    try {
      const items = await wall.list(todayKey());
      if (!alive) return;
      drawMini(cv, items, { bg: '#fafbfd', redraw: true, fit: 'content' });
      $('#desk-count').textContent = items.length ? `${items.length} ${plural(items.length, ['штука', 'штуки', 'штук'])} сегодня` : 'пока пусто';
    } catch (e) { $('#desk-count').textContent = 'открыть'; }
  })();

  // tiny game on the console screen
  const sc = $('.console-screen', root), g = sc.getContext('2d');
  let frame = 0, raf = 0, last = 0;
  const words = ['ЯРЧЕ', 'СРОЧНО', 'КРУПНЕЕ', 'v7'];
  const drawScreen = t => {
    raf = requestAnimationFrame(drawScreen);
    if (t - last < 90) return; last = t; frame++;
    g.fillStyle = '#CFE0FF'; g.fillRect(0, 0, 96, 76);
    g.fillStyle = '#9bb6ff'; for (let i = 0; i < 6; i++) g.fillRect(((i * 23 - frame * 2) % 120 + 120) % 120 - 12, 18 + (i % 3) * 7, 10, 3);
    g.fillStyle = '#244EE7'; g.fillRect(0, 62, 96, 14);
    const bx = 96 - (frame * 3) % 130, word = words[Math.floor(frame / 43) % words.length];
    g.fillStyle = '#fff'; g.fillRect(bx, 46, 34, 12); g.fillStyle = '#E8291F'; g.font = '6px monospace'; g.fillText(word, bx + 2, 55);
    const near = bx < 34 && bx > -6;
    const jy = near ? -Math.sin(((34 - bx) / 40) * Math.PI) * 18 : 0;
    const px = 18, py = 50 + jy;
    g.fillStyle = '#000'; g.fillRect(px + 2, py - 2, 8, 4);
    g.fillStyle = '#FFB8D9'; g.fillRect(px + 2, py + 2, 8, 6);
    g.fillStyle = '#FFD84A'; g.fillRect(px + 1, py + 8, 10, 6);
    g.fillStyle = '#000'; g.fillRect(px + 7, py + 4, 1, 1);
    g.fillRect(px + 2 + (frame % 2) * 2, py + 14, 2, 3); g.fillRect(px + 7 - (frame % 2) * 2, py + 14, 2, 3);
    g.fillStyle = '#FFD84A'; const cx = (60 - frame * 3 % 96 + 96) % 96; g.fillRect(cx, 30, 4, 4);
  };
  if (reducedMotion()) { last = -1e9; drawScreen(0); cancelAnimationFrame(raf); } else raf = requestAnimationFrame(drawScreen);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('resize', onResize);
  };
}
