// ЗМЕЙКА: a pen-tool path that eats colour swatches and avoids client edits. Six levels.
// The path takes the colour of every swatch it eats, so a finished level looks like a palette.
import { $, $$, esc, ICON, sound, reducedMotion } from '../util.js';
import { complete, celebrate, gamesNavHTML, albumHTML, isUnlocked, unlockHint, levelsDone } from '../progress.js';

const N = 16; // grid is N×N
const SWATCHES = ['#FFD84A', '#FFB8D9', '#E8291F', '#7FB2FF', '#2BB673', '#FF8A3D', '#B48CFF'];
// Static «edits» per level, as [x, y]. Kept off the start row and away from edges the snake must cross.
const LEVELS = [
  { target: 8, speed: 6, wrap: true, name: 'Разминка', blocks: [] },
  { target: 10, speed: 6.5, wrap: true, name: 'Первые правки', blocks: [[4, 4], [11, 4], [4, 11], [11, 11]] },
  { target: 12, speed: 7, wrap: true, name: 'Колонки', blocks: [[5, 2], [5, 3], [5, 4], [10, 11], [10, 12], [10, 13]] },
  { target: 12, speed: 7, wrap: false, name: 'Поля', blocks: [[3, 3], [12, 3], [3, 12], [12, 12]] },
  { target: 14, speed: 7.5, wrap: false, name: 'Сетка', blocks: [[4, 4], [4, 5], [11, 4], [11, 5], [4, 10], [4, 11], [11, 10], [11, 11]] },
  { target: 16, speed: 8, wrap: false, name: 'Дедлайн', blocks: [[3, 3], [4, 3], [11, 3], [12, 3], [7, 5], [8, 5], [3, 12], [4, 12], [11, 12], [12, 12]] }
];
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export async function mount(root) {
  let alive = true;
  root.innerHTML = `<div class="page game-page">
    <div class="page-head"><div><a class="back" href="#/">${ICON.back}На рабочий стол</a>
      <h1 class="page-title">Змейка</h1><p class="page-sub">собирай цвета в палитру и не врезайся в правки</p></div></div>
    <div id="gamesnav">${gamesNavHTML('snake')}</div>
    <div id="sn-body"></div>
    <div id="album">${albumHTML()}</div>
  </div>`;
  const body = $('#sn-body', root);
  if (!isUnlocked('snake')) {
    body.innerHTML = `<div class="lockcard">${ICON.lock}<h2>Игра пока закрыта</h2><p>${esc(unlockHint('snake'))}</p><a class="btn btn--yellow" href="#/run">Играть в Забег дизайнера</a></div>`;
    return () => { alive = false; };
  }
  body.innerHTML = `<div class="lvlbar" id="sn-levels" role="group" aria-label="Уровни"></div>
    <div class="snake">
      <div class="snake__top"><p id="sn-stats" aria-live="polite"></p><div class="snake__pal" id="sn-pal" aria-hidden="true"></div></div>
      <div class="snake__box" id="sn-box" tabindex="0" aria-label="Игра «Змейка». Стрелки или W A S D поворачивают, P — пауза.">
        <canvas id="sn-cv" width="480" height="480"></canvas>
        <div class="snake__over" id="sn-over"></div>
      </div>
      <div class="dpad" aria-hidden="true"><button type="button" data-d="up">▲</button><button type="button" data-d="left">◀</button><button type="button" data-d="down">▼</button><button type="button" data-d="right">▶</button></div>
      <p class="snake__help">Стрелки или W A S D — поворот, P — пауза. На телефоне — свайп по полю или кнопки.
        На уровнях 1–3 края поля сквозные, с 4-го края — стены. Награды: стикер за уровни 1–3 и 4–6.</p>
    </div>`;
  const cv = $('#sn-cv', body), ctx = cv.getContext('2d'), box = $('#sn-box', body), over = $('#sn-over', body);
  const CELL = cv.width / N;
  let S = null;

  function levelBar() {
    const done = levelsDone('snake');
    $('#sn-levels', body).innerHTML = LEVELS.map((L, i) => {
      const open = i <= done;
      return `<button class="lvl${S && S.li === i ? ' is-current' : ''}" type="button" data-lvl="${i}" ${open ? '' : 'disabled'} aria-label="Уровень ${i + 1}: ${L.name}${open ? '' : ', закрыт'}"><b>${i + 1}</b><small>${open ? (i < done ? '✓ ' : '') + esc(L.name) : ICON.lock}</small></button>`;
    }).join('');
  }
  function free(x, y) {
    if (S.blocks.has(x + ',' + y)) return false;
    return !S.snake.some(p => p.x === x && p.y === y);
  }
  function placeFood() {
    const spots = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (free(x, y) && !(Math.abs(x - S.snake[0].x) + Math.abs(y - S.snake[0].y) < 3)) spots.push([x, y]);
    const [x, y] = spots[Math.floor(Math.random() * spots.length)];
    S.food = { x, y, c: SWATCHES[S.eaten % SWATCHES.length] };
  }
  function setup(li) {
    const L = LEVELS[li];
    S = { li, L, snake: [{ x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }], cols: ['#244EE7', '#244EE7', '#244EE7'], pend: [], dir: 'right', queue: [], grow: 0,
      blocks: new Set(L.blocks.map(b => b.join(','))), eaten: 0, state: 'ready', acc: 0, t: 0, flash: 0 };
    placeFood(); levelBar(); hud(); draw();
    overlay(`<div class="snake__card"><p class="snake__kicker">уровень ${li + 1} из ${LEVELS.length}</p><h2>${esc(L.name)}</h2>
      <p>Собери ${L.target} цветов. ${L.wrap ? 'Края поля сквозные.' : 'Края поля — стены.'}${L.blocks.length ? ' Красные квадраты — правки, в них не врезайся.' : ''}</p>
      <button class="btn btn--yellow btn--big" type="button" data-act="go">Старт</button><p class="snake__hint">или нажми любую стрелку</p></div>`);
  }
  function overlay(html) { over.innerHTML = html; over.hidden = !html; const b = $('button', over); if (b) b.focus({ preventScroll: true }); }
  function hud() {
    $('#sn-stats', body).textContent = `Уровень ${S.li + 1} · цвета ${S.eaten} из ${S.L.target}`;
    $('#sn-pal', body).innerHTML = Array.from({ length: S.L.target }, (_, i) => `<i style="${i < S.eaten ? `background:${SWATCHES[i % SWATCHES.length]}` : ''}"></i>`).join('');
  }
  function go() { if (S.state === 'ready' || S.state === 'paused') { S.state = 'play'; overlay(''); box.focus({ preventScroll: true }); } }
  function turn(d) {
    if (S.state === 'ready') { go(); }
    if (S.state !== 'play') return;
    const last = S.queue.length ? S.queue[S.queue.length - 1] : S.dir;
    const [lx, ly] = DIRS[last], [nx, ny] = DIRS[d];
    if (d === last || (lx === -nx && ly === -ny)) return; // no reversing into yourself
    if (S.queue.length < 2) S.queue.push(d);
  }
  function step() {
    if (S.queue.length) S.dir = S.queue.shift();
    const [dx, dy] = DIRS[S.dir];
    let x = S.snake[0].x + dx, y = S.snake[0].y + dy;
    if (S.L.wrap) { x = (x + N) % N; y = (y + N) % N; }
    const tailMoves = S.grow === 0;
    const hitsSelf = S.snake.some((p, i) => p.x === x && p.y === y && !(tailMoves && i === S.snake.length - 1));
    if (x < 0 || y < 0 || x >= N || y >= N || S.blocks.has(x + ',' + y) || hitsSelf) return crash();
    S.snake.unshift({ x, y });
    // the path grows at the tail, and each new piece keeps the colour of the swatch that made it
    if (S.grow > 0) { S.grow--; S.cols.push(S.pend.shift() || '#244EE7'); } else S.snake.pop();
    if (S.food && x === S.food.x && y === S.food.y) {
      S.pend.push(S.food.c); S.lastC = S.food.c; S.eaten++; S.grow += 1; S.flash = 8; sound.play('coin'); hud();
      if (S.eaten >= S.L.target) return win();
      placeFood();
    }
  }
  function crash() {
    S.state = 'over'; sound.play('lose'); S.flash = 14;
    overlay(`<div class="snake__card"><h2>Упс, правка!</h2><p>Собрано ${S.eaten} из ${S.L.target}. Уровень начнётся заново.</p><button class="btn btn--yellow btn--big" type="button" data-act="retry">Ещё раз</button></div>`);
  }
  function win() {
    S.state = 'won'; sound.play('win');
    const res = complete('snake', S.li + 1);
    $('#gamesnav', root).innerHTML = gamesNavHTML('snake'); $('#album', root).innerHTML = albumHTML(); levelBar();
    const last = S.li === LEVELS.length - 1;
    overlay(`<div class="snake__card"><p class="snake__kicker">уровень ${S.li + 1} пройден</p><h2>${last ? 'Палитра собрана!' : 'Готово!'}</h2><p>${last ? 'Все шесть уровней пройдены.' : `Дальше: «${esc(LEVELS[S.li + 1].name)}».`}</p>
      ${last ? '<button class="btn btn--yellow btn--big" type="button" data-act="retry">Сыграть ещё</button>' : '<button class="btn btn--yellow btn--big" type="button" data-act="next">Следующий уровень</button>'}</div>`);
    setTimeout(() => celebrate(res), 400);
  }

  /* ---------- drawing: a pen-tool path with anchor points ---------- */
  function draw() {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = '#e6eaf3'; ctx.lineWidth = 1;
    for (let i = 1; i < N; i++) { ctx.beginPath(); ctx.moveTo(i * CELL + .5, 0); ctx.lineTo(i * CELL + .5, cv.height); ctx.moveTo(0, i * CELL + .5); ctx.lineTo(cv.width, i * CELL + .5); ctx.stroke(); }
    if (!S.L.wrap) { ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, cv.width - 4, cv.height - 4); }
    for (const k of S.blocks) {
      const [x, y] = k.split(',').map(Number), px = x * CELL, py = y * CELL;
      ctx.fillStyle = '#E8291F'; ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px + 8, py + 8); ctx.lineTo(px + CELL - 8, py + CELL - 8); ctx.moveTo(px + CELL - 8, py + 8); ctx.lineTo(px + 8, py + CELL - 8); ctx.stroke();
    }
    if (S.food) {
      const f = S.food, pulse = reducedMotion() ? 0 : Math.sin(S.t / 6) * 2;
      ctx.fillStyle = '#000'; ctx.fillRect(f.x * CELL + 4 - pulse, f.y * CELL + 4 - pulse, CELL - 8 + pulse * 2, CELL - 8 + pulse * 2);
      ctx.fillStyle = f.c; ctx.fillRect(f.x * CELL + 6 - pulse, f.y * CELL + 6 - pulse, CELL - 12 + pulse * 2, CELL - 12 + pulse * 2);
    }
    // the path
    const c = p => [p.x * CELL + CELL / 2, p.y * CELL + CELL / 2];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = S.snake.length - 1; i > 0; i--) {
      const a = S.snake[i], b = S.snake[i - 1];
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) continue; // wrapped across the edge
      const [ax, ay] = c(a), [bx, by] = c(b);
      ctx.strokeStyle = '#000'; ctx.lineWidth = CELL * .62; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = S.cols[i] || '#244EE7'; ctx.lineWidth = CELL * .42; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    S.snake.forEach((p, i) => {
      if (i === 0) return;
      const [x, y] = c(p); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeRect(x - 4, y - 4, 8, 8);
    });
    // head: a pen nib pointing where it goes
    const h0 = S.snake[0], [hx, hy] = c(h0), [dx, dy] = DIRS[S.dir];
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(CELL * .62, 0); ctx.lineTo(-CELL * .2, -CELL * .42); ctx.lineTo(-CELL * .46, 0); ctx.lineTo(-CELL * .2, CELL * .42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = S.lastC || '#FFD84A'; ctx.beginPath(); ctx.moveTo(CELL * .5, 0); ctx.lineTo(-CELL * .16, -CELL * .32); ctx.lineTo(-CELL * .36, 0); ctx.lineTo(-CELL * .16, CELL * .32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, CELL * .11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (S.flash > 0) { ctx.fillStyle = S.state === 'over' ? `rgba(232,41,31,${S.flash / 40})` : `rgba(255,216,74,${S.flash / 50})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  }

  /* ---------- loop ---------- */
  let raf = 0, last = performance.now();
  const frame = now => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last); last = now;
    if (!S) return;
    S.t++; if (S.flash > 0) S.flash--;
    if (S.state === 'play') { S.acc += dt; const every = 1000 / S.L.speed; while (S.acc >= every && S.state === 'play') { S.acc -= every; step(); } }
    draw();
  };

  /* ---------- input ---------- */
  const KEYMAP = { arrowup: 'up', w: 'up', 'ц': 'up', arrowdown: 'down', s: 'down', 'ы': 'down', arrowleft: 'left', a: 'left', 'ф': 'left', arrowright: 'right', d: 'right', 'в': 'right' };
  const onKey = e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('.modal')) return;
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) { e.preventDefault(); turn(KEYMAP[k]); return; }
    if ((k === 'p' || k === 'з' || k === 'escape') && S) {
      if (S.state === 'play') { S.state = 'paused'; overlay(`<div class="snake__card"><h2>Пауза</h2><button class="btn btn--yellow btn--big" type="button" data-act="go">Продолжить</button></div>`); }
      else if (S.state === 'paused') go();
    }
  };
  window.addEventListener('keydown', onKey);
  let touch = null;
  cv.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', e => {
    if (!touch) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y; touch = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) { if (S.state === 'ready') go(); return; }
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  cv.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  body.addEventListener('click', e => {
    const d = e.target.closest('[data-d]'); if (d) { turn(d.dataset.d); return; }
    const l = e.target.closest('[data-lvl]'); if (l && !l.disabled) { setup(+l.dataset.lvl); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'go') go();
    if (a.dataset.act === 'retry') setup(S.li);
    if (a.dataset.act === 'next') setup(S.li + 1);
  });
  const onBlur = () => { if (S && S.state === 'play') { S.state = 'paused'; overlay(`<div class="snake__card"><h2>Пауза</h2><button class="btn btn--yellow btn--big" type="button" data-act="go">Продолжить</button></div>`); } };
  window.addEventListener('blur', onBlur);

  setup(Math.min(levelsDone('snake'), LEVELS.length - 1));
  raf = requestAnimationFrame(frame);
  // test hook (automated checks only)
  root.__snake = { get S() { return S; }, step: () => step(), turn, go, setup, N };
  return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('blur', onBlur); };
}
