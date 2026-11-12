import { CONFIG } from '../config.js';
import { $, $$, esc, h, ICON, sound, lsGet, lsSet, zoned, todayKey, reducedMotion, pick } from '../util.js';
import { wall } from '../store.js';
import { drawMini } from '../wallmini.js';

const PHRASES = [
  'Ctrl+S is a love language.', 'Make the logo bigger. Just kidding.', 'Kerning is self-care.', 'final_final_v7.png',
  'Trust the grid. Then break it.', 'There is always room for one more sticker.', 'Lorem ipsum is not a personality.',
  'Every pixel has feelings.', 'Undo is the best thing ever invented.', 'This note has been here since 2004.',
  'Leave the desk messier than you found it.', 'Type “kerning” anywhere. Trust me.', '↑ ↑ ↓ ↓ ← → ← → B A',
  'Somebody’s cousin is a designer.', 'Comic Sans is someone’s favourite.', 'Today’s mood: 60% coffee, 40% gradients.'
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function mount(root) {
  const z = zoned();
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: CONFIG.TIMEZONE }).format(new Date());
  root.innerHTML = `<section class="desk" aria-label="The desk">
    <div class="mat" aria-hidden="true">
      <div class="mat__ruler">${Array.from({ length: 10 }, (_, i) => `<span>${i * 10}</span>`).join('')}</div>
      <div class="mat__ruler mat__ruler--side">${Array.from({ length: 6 }, (_, i) => `<span>${i * 10}</span>`).join('')}</div>
      <div class="mat__angle"></div>
    </div>
    <div class="desk-hero">
      <h1 class="desk-title">${esc(CONFIG.SITE_NAME)}</h1>
      <p class="desk-sub">a tiny studio on the internet.<br>touch things, make things.</p>
    </div>
    <a class="thing thing--booth" href="#/booth" data-thing="booth"><img src="assets/desk/camera.png" alt="Photo Booth: a blue camera" width="441" height="391"><span class="thing__label">Photo Booth</span></a>
    <a class="thing thing--wall" href="#/wall" data-thing="wall"><div class="deskboard"><span class="tape" aria-hidden="true"></span><canvas width="480" height="320" aria-hidden="true"></canvas>
      <div class="board__cap"><b>Today’s Wall</b><span id="desk-count">…</span></div></div><span class="thing__label">Make something together</span></a>
    <a class="thing thing--capsule" href="#/capsule" data-thing="capsule"><div class="cal"><div class="cal__top">${MONTHS[z.m - 1].toUpperCase()}</div><div class="cal__day">${z.d}</div><div class="cal__wd">${esc(wd)}</div></div><span class="thing__label">Time Capsule</span></a>
    <a class="thing thing--run" href="#/run" data-thing="run"><img src="assets/desk/console.png" alt="Designer Run: a yellow game console" width="489" height="523"><canvas class="console-screen" width="96" height="76" aria-hidden="true"></canvas><span class="thing__label">Designer Run</span></a>
    <a class="thing thing--objects" href="#/objects" data-thing="objects"><img src="assets/desk/toys.png" alt="Little Objects: three small figures" width="639" height="351"><span class="thing__label">Little Objects</span></a>
    <a class="thing thing--stuff" href="#/stuff" data-thing="stuff"><div class="folders" aria-hidden="true">
      <div class="folder folder--1" data-tab="random"></div><div class="folder folder--2" data-tab="3D"></div><div class="folder__paper"></div>
      <div class="folder folder--3" data-tab="posters"><span class="folder__label">My Stuff</span></div></div><span class="thing__label">My Stuff</span></a>
    <button class="note-phrase" type="button" id="phrase" aria-live="polite"><span>${esc(pick(PHRASES))}</span><small>tap for another one</small></button>
    <span class="decor pencil" aria-hidden="true"></span>
    <span class="decor ring" aria-hidden="true"></span>
    <span class="decor eraser" aria-hidden="true"></span>
    <span class="decor clip" aria-hidden="true"></span>
    <p class="hint-move">psst: you can move things around the desk</p>
    <button class="btn btn--ghost btn--small desk-reset" type="button" id="desk-reset" hidden>Tidy the desk</button>
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
  const onResize = () => applyPos();
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
      drawMini(cv, items, { bg: '#fafbfd', redraw: true });
      $('#desk-count').textContent = items.length ? `${items.length} thing${items.length === 1 ? '' : 's'} today` : 'empty, be first';
    } catch (e) { $('#desk-count').textContent = 'open it'; }
  })();

  // tiny game on the console screen
  const sc = $('.console-screen', root), g = sc.getContext('2d');
  let frame = 0, raf = 0, last = 0;
  const words = ['MORE POP', 'URGENT', 'BIGGER', 'v7'];
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
