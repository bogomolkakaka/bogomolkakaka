import { $, $$, esc, h, ICON, sound, toast, clamp, rand, todayKey, lsGet, lsSet, reducedMotion, plural } from '../util.js';
import { LEVELS, T, ROWS, GROUND, SKILLS } from '../game/levels.js';
import { wall } from '../store.js';
import { WORLD } from '../wallmini.js';

const FONT = '8px "Press Start 2P", "Courier New", monospace';
const C = { cobalt: '#244EE7', cobaltTop: '#5577F2', yellow: '#FFD84A', red: '#E8291F', pink: '#FFB8D9', sky: '#CFE0FF', ink: '#000000', paper: '#ffffff' };

export async function mount(root) {
  root.innerHTML = `<div class="page run-page">
    <div class="page-head"><div><a class="back" href="#/">${ICON.back}На рабочий стол</a>
      <h1 class="page-title">Забег дизайнера</h1><p class="page-sub">собирай монеты и навыки, уворачивайся от правок, сдай проект</p></div>
      <p class="run-best" id="best"></p></div>
    <div class="cabinet">
      <div class="gamebox" id="gamebox" tabindex="0" aria-label="Игра «Забег дизайнера». Стрелки или A и D — идти, пробел — прыжок, P — пауза.">
        <canvas id="game" width="480" height="270"></canvas>
        <div class="gscreen" id="gscreen"></div>
      </div>
      <div class="pads" id="pads" aria-hidden="true">
        <div class="pads__lr"><button class="pad" data-pad="left" type="button">◀</button><button class="pad" data-pad="right" type="button">▶</button></div>
        <button class="pad pad--jump" data-pad="jump" type="button">ПРЫЖОК</button>
      </div>
      <div class="run-help">
        <p><b>Клавиши:</b> ← → или A D — идти, пробел или ↑ — прыжок, P — пауза.</p>
        <p><b>Жизни:</b> каждый уровень начинается минимум с трёх. Ещё одну дают каждые 40 монет, сердечки на уровнях и навык «Креатив», всего до пяти.</p>
        <p><b>Навыки:</b> ${Object.values(SKILLS).map(s => `<span class="skill-chip" style="--c:${s.color}">${s.name}</span> ${s.note}`).join(' · ')}</p>
        <p class="run-rotate">Совет: поверни телефон боком — экран станет больше.</p>
      </div>
    </div>
  </div>`;

  const cv = $('#game', root), ctx = cv.getContext('2d');
  const box = $('#gamebox', root), scr = $('#gscreen', root);
  const narrow = () => box.clientWidth < 560;
  let VW = 480, VH = 270;
  function sizeCanvas() {
    const nw = narrow() ? 400 : 480, nh = narrow() ? 225 : 270;
    if (nw !== VW) { VW = nw; VH = nh; cv.width = VW; cv.height = VH; }
  }
  sizeCanvas();
  const best = () => lsGet('bg.run.best', 0);
  const showBest = () => { const b = best(); $('#best', root).textContent = b ? `Твой рекорд: ${b} ${plural(b, ["очко", "очка", "очков"])}` : ''; };
  showBest();

  /* ---------- state ---------- */
  const G = { state: 'title', levelIndex: 0, lives: 3, score: 0, coins: 0, skillsGot: new Set(), effects: {}, t: 0, levelT: 0, paused: false };
  const MAX_LIVES = 5, COINS_PER_LIFE = 40;
  let L = null, P = null, cam = { x: 0, y: 0 }, enemies = [], coins = [], skills = [], hearts = [], pops = [], parts = [], respawn = null, levelScore0 = 0, levelCoins0 = 0;
  const keys = { left: false, right: false, jump: false, jumpPressed: false };

  function solidAt(tx, ty) {
    if (tx < 0 || tx >= L.cols) return true;
    if (ty < 0) return false;
    if (ty >= ROWS) return false;
    const ch = L.grid[ty][tx];
    return ch === '#' || ch === '=' || ch === 'B';
  }
  function bubbleSize(text) {
    const words = text.split(' '); const lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > 12 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    const w = Math.max(...lines.map(l => l.length)) * 8 + 12, hh = lines.length * 10 + 10;
    return { lines, w, h: hh };
  }
  function loadLevel(i) {
    L = LEVELS[i];
    L.checkpoints.forEach(c => { c.got = false; });
    G.levelIndex = i; G.levelT = 0; G.effects = {};
    G.lives = Math.max(G.lives, 3); // every level starts with at least three lives
    P = { x: L.start.x * T, y: (GROUND) * T - 22, w: 12, h: 22, vx: 0, vy: 0, ground: false, coyote: 0, jumpBuf: 0, face: 1, inv: 0, anim: 0 };
    respawn = { x: P.x, y: P.y };
    enemies = L.enemies.map(e => {
      const s = bubbleSize(e.text);
      const base = { ...e, ...s, alive: true, t: rand(0, 6), dir: -1 };
      if (e.type === 'patrol') { base.x = e.x0 + rand(0, Math.max(0, e.x1 - e.x0 - s.w)); base.y = e.y + 2 * T - s.h - 2; }
      else if (e.type === 'bob') { base.x = e.x0; base.y = e.y; base.yc = e.y; }
      else { base.x = e.x0; base.y = e.y; base.yc = e.y; base.active = false; }
      return base;
    });
    coins = L.coins.map(c => ({ ...c, taken: false }));
    skills = L.skills.map(s => ({ ...s, taken: false }));
    hearts = (L.hearts || []).map(hh => ({ ...hh, taken: false }));
    pops = []; parts = [];
    levelScore0 = G.score; levelCoins0 = G.coins;
    cam.x = 0;
  }

  /* ---------- update ---------- */
  const has = k => (G.effects[k] || 0) > 0;
  function hurt(e) {
    if (P.inv > 0) return;
    if (has('color') && e) { popEnemy(e, false); return; }
    G.lives--; P.inv = 130; P.vy = -4.5; P.vx = (P.x < (e ? e.x + e.w / 2 : P.x) ? -2.2 : 2.2);
    sound.play('hit'); burst(P.x + 6, P.y + 10, C.red, 14);
    pops.push({ x: P.x, y: P.y - 8, text: e ? 'НЕТ!' : 'УПС', life: 50, color: C.red });
    if (G.lives <= 0) { gameOver(); }
  }
  function popEnemy(e, bounce = true) {
    e.alive = false; G.score += 50; sound.play('pop');
    burst(e.x + e.w / 2, e.y + e.h / 2, C.paper, 16); burst(e.x + e.w / 2, e.y + e.h / 2, C.red, 8);
    pops.push({ x: e.x + e.w / 2 - 12, y: e.y, text: '+50', life: 40, color: C.cobalt });
    if (bounce) P.vy = -6.2;
    if (e.loop) setTimeout(() => { e.alive = true; e.x = e.x0; e.active = false; }, 4000);
  }
  function gainLife(x, y) {
    if (G.lives < MAX_LIVES) { G.lives++; pops.push({ x: x - 30, y: y - 14, text: '+1 ЖИЗНЬ', life: 80, color: C.red, big: true }); }
    else { G.score += 100; pops.push({ x: x - 16, y: y - 14, text: '+100', life: 60, color: C.cobalt }); }
    sound.play('power'); burst(x, y, C.red, 16);
  }
  function burst(x, y, color, n) { if (reducedMotion()) return; for (let i = 0; i < n; i++) parts.push({ x, y, vx: rand(-2.5, 2.5), vy: rand(-3.5, .5), life: rand(20, 40), color }); }
  function take(sk) {
    sk.taken = true; G.skillsGot.add(sk.type); sound.play('power');
    const info = SKILLS[sk.type];
    if (sk.type === 'typography') G.score += 500;
    if (sk.type === 'creativity') gainLife(sk.x, sk.y - 20);
    if (sk.type === 'color') G.effects.color = 480;
    if (sk.type === 'figma') G.effects.figma = 480;
    if (sk.type === 'composition') G.effects.composition = 600;
    if (sk.type === 'deadline') G.effects.deadline = 480;
    pops.push({ x: sk.x - 40, y: sk.y - 12, text: info.name + '!', life: 80, color: C.ink, big: true });
    pops.push({ x: sk.x - 30, y: sk.y + 2, text: info.note, life: 80, color: C.cobalt });
    burst(sk.x, sk.y, info.color, 22);
  }
  function step() {
    G.t++; G.levelT++;
    for (const k in G.effects) if (G.effects[k] > 0) G.effects[k]--;
    // player
    const ax = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    const maxV = 2.3 * (has('figma') ? 1.6 : 1);
    if (ax) { P.vx += ax * .38; P.face = ax; } else P.vx *= P.ground ? .72 : .93;
    P.vx = clamp(P.vx, -maxV, maxV);
    if (Math.abs(P.vx) < .05) P.vx = 0;
    P.vy = Math.min(P.vy + .48, 9);
    if (keys.jumpPressed) { P.jumpBuf = 8; keys.jumpPressed = false; }
    if (P.ground) P.coyote = 7; else if (P.coyote > 0) P.coyote--;
    if (P.jumpBuf > 0) { P.jumpBuf--; if (P.coyote > 0) { P.vy = -8.5; P.coyote = 0; P.jumpBuf = 0; P.ground = false; sound.play('jump'); } }
    if (!keys.jump && P.vy < -3.2) P.vy = -3.2;
    const prevBottom = P.y + P.h;
    moveX(P.vx); moveY(P.vy);
    if (P.inv > 0) P.inv--;
    P.anim += Math.abs(P.vx) * .12;
    // fell into a pit
    if (P.y > ROWS * T + 40) {
      hurt(null);
      if (G.state === 'play') { P.x = respawn.x; P.y = respawn.y; P.vx = 0; P.vy = 0; P.inv = Math.max(P.inv, 90); }
    }
    // checkpoints
    for (const c of L.checkpoints) if (!c.got && P.x + P.w > c.x - 8 && P.x < c.x + 8) { c.got = true; respawn = safeSpot(c.x) || respawn; sound.play('coin'); pops.push({ x: c.x - 30, y: c.y - 40, text: 'СОХРАНЕНО', life: 60, color: C.cobalt }); }
    // enemies
    const slow = has('deadline') ? .45 : 1;
    for (const e of enemies) {
      if (!e.alive) continue;
      e.t += .016 * slow;
      if (e.type === 'patrol') { e.x += e.dir * e.speed * slow; if (e.x < e.x0) { e.x = e.x0; e.dir = 1; } if (e.x + e.w > e.x1 + T) { e.x = e.x1 + T - e.w; e.dir = -1; } }
      else if (e.type === 'bob') { e.y = e.yc + Math.sin(G.t * e.speed * slow + e.t) * e.amp; }
      else {
        if (!e.active && e.x0 - P.x < VW * .9) e.active = true;
        if (e.active) { e.x -= e.speed * slow; e.y = e.yc + Math.sin(G.t * .05 + e.t) * 14; if (e.x + e.w < cam.x - 60) { if (e.loop) { e.x = cam.x + VW + rand(40, 160); } else e.alive = false; } }
      }
      // collide (hitbox a bit smaller than the bubble, to be fair)
      const ex = e.x + 5, ey = e.y + 4, ew = e.w - 10, eh = e.h - 7;
      if (P.x < ex + ew && P.x + P.w > ex && P.y < ey + eh && P.y + P.h > ey) {
        if (P.vy > 0 && prevBottom <= ey + 9) popEnemy(e); else hurt(e);
        if (G.state !== 'play') return;
      }
    }
    // coins
    const magnet = has('composition');
    for (const c of coins) {
      if (c.taken) continue;
      const dx = P.x + 6 - c.x, dy = P.y + 11 - c.y;
      if (magnet && Math.hypot(dx, dy) < 120) { c.x += dx * .14; c.y += dy * .14; }
      if (Math.abs(dx) < 12 && Math.abs(dy) < 16) { c.taken = true; G.coins++; G.score += 10; sound.play('coin'); if (G.coins % COINS_PER_LIFE === 0) gainLife(c.x, c.y); }
    }
    for (const hh of hearts) if (!hh.taken && Math.abs(P.x + 6 - hh.x) < 14 && Math.abs(P.y + 11 - hh.y) < 18) { hh.taken = true; gainLife(hh.x, hh.y); }
    for (const s of skills) if (!s.taken && Math.abs(P.x + 6 - s.x) < 14 && Math.abs(P.y + 11 - s.y) < 18) take(s);
    // goal
    const gx = L.goal.x;
    if (P.x + P.w > gx && P.x < gx + 32) { levelDone(); return; }
    // fx
    pops.forEach(p => { p.y -= .5; p.life--; }); pops = pops.filter(p => p.life > 0);
    parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .15; p.life--; }); parts = parts.filter(p => p.life > 0);
    // camera
    const target = P.x - VW * .38 + P.face * 30;
    cam.x += (clamp(target, 0, L.cols * T - VW) - cam.x) * .12;
    cam.y = clamp(P.y - VH * .55, 0, ROWS * T - VH);
  }
  // respawn point on solid ground at or just behind a checkpoint, never above a pit
  function safeSpot(x) {
    const tx = Math.floor(x / T);
    for (let d = 0; d < 24; d++) {
      const c = tx - d;
      if (c >= 0 && solidAt(c, GROUND) && !solidAt(c, GROUND - 1) && !solidAt(c, GROUND - 2)) return { x: c * T + 2, y: GROUND * T - P.h };
    }
    return null;
  }
  function moveX(dx) {
    P.x += dx;
    const y0 = Math.floor(P.y / T), y1 = Math.floor((P.y + P.h - 1) / T);
    if (dx > 0) { const tx = Math.floor((P.x + P.w) / T); for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty)) { P.x = tx * T - P.w; P.vx = 0; break; } }
    if (dx < 0) { const tx = Math.floor(P.x / T); for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty)) { P.x = (tx + 1) * T; P.vx = 0; break; } }
  }
  function moveY(dy) {
    P.y += dy; P.ground = false;
    const x0 = Math.floor(P.x / T), x1 = Math.floor((P.x + P.w - 1) / T);
    if (dy > 0) { const ty = Math.floor((P.y + P.h) / T); for (let tx = x0; tx <= x1; tx++) if (solidAt(tx, ty) && ty >= 0 && ty < ROWS) { P.y = ty * T - P.h; P.vy = 0; P.ground = true; break; } }
    if (dy < 0) { const ty = Math.floor(P.y / T); for (let tx = x0; tx <= x1; tx++) if (ty >= 0 && solidAt(tx, ty)) { P.y = (ty + 1) * T; P.vy = 0; break; } }
  }

  /* ---------- drawing ---------- */
  function px(x) { return Math.round(x); }
  function drawBg() {
    const th = L.theme;
    const sky = th === 'brief' ? ['#CFE0FF', '#E4EEFF'] : th === 'deadline' ? ['#FFC9A8', '#FFE0EC'] : ['#0D1338', '#1A2160'];
    ctx.fillStyle = sky[0]; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = sky[1]; for (let y = 0; y < VH; y += 6) if ((y / 6) % 2) ctx.fillRect(0, y + 2, VW, 2);
    const off = cam.x * .3;
    for (let i = -1; i < VW / 120 + 2; i++) {
      const wx = i * 120 - (off % 120), idx = Math.floor((off + i * 120) / 120);
      if (th === 'brief') {
        if (idx % 3 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(px(wx + 20), 30, 64, 48); ctx.fillStyle = '#9ec2ff'; ctx.fillRect(px(wx + 24), 34, 56, 40); ctx.fillStyle = '#fff'; ctx.fillRect(px(wx + 34 + (G.t * .1 % 30)), 46, 18, 6); }
        else { ctx.fillStyle = [C.yellow, C.pink, C.cobalt][idx % 3 === 1 ? 0 : 1]; ctx.fillRect(px(wx + 30), 40, 40, 54); ctx.fillStyle = '#000'; ctx.fillRect(px(wx + 36), 82, 22, 3); }
      } else if (th === 'deadline') {
        if (idx % 2 === 0) {
          const cx = wx + 60, cy = 62; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px(cx), cy, 24, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
          const a = G.levelT / 60 * Math.PI * 2 / 12, b = G.levelT / 60 * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(px(cx), cy); ctx.lineTo(px(cx + Math.sin(a) * 13), cy - Math.cos(a) * 13); ctx.moveTo(px(cx), cy); ctx.lineTo(px(cx + Math.sin(b) * 19), cy - Math.cos(b) * 19); ctx.strokeStyle = C.red; ctx.stroke();
        } else { ctx.fillStyle = '#fff'; ctx.fillRect(px(wx + 28), 36, 54, 36); ctx.fillStyle = C.red; ctx.font = FONT; ctx.fillText('СРОК', px(wx + 38), 58); }
      } else {
        const notes = ['v7', 'ФИНАЛ', 'final2', 'ВОТ ЭТОТ', 'v7_new'];
        ctx.fillStyle = idx % 2 ? C.yellow : C.pink; ctx.fillRect(px(wx + 26), 34 + (idx % 3) * 14, 46, 30);
        ctx.fillStyle = '#000'; ctx.font = FONT; ctx.fillText(notes[((idx % 5) + 5) % 5], px(wx + 30), 52 + (idx % 3) * 14);
        if ((G.t + idx * 17) % 90 < 4) { ctx.fillStyle = 'rgba(36,78,231,.7)'; ctx.fillRect(0, (idx * 37 % VH), VW, 3); }
      }
    }
    const off2 = cam.x * .6;
    for (let i = -1; i < VW / 90 + 2; i++) {
      const wx = i * 90 - (off2 % 90);
      ctx.fillStyle = th === 'final' ? '#232b6e' : 'rgba(255,255,255,.55)';
      ctx.fillRect(px(wx + 10), 150, 60, 34); ctx.fillStyle = th === 'final' ? '#3a4596' : 'rgba(36,78,231,.25)'; ctx.fillRect(px(wx + 14), 154, 52, 26);
      ctx.fillStyle = th === 'final' ? '#232b6e' : 'rgba(255,255,255,.55)'; ctx.fillRect(px(wx + 34), 184, 12, 10);
    }
  }
  function drawTiles() {
    const x0 = Math.floor(cam.x / T), x1 = Math.ceil((cam.x + VW) / T);
    for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || tx >= L.cols) continue;
      const ch = L.grid[ty][tx]; if (ch === '.') continue;
      const x = px(tx * T - cam.x), y = px(ty * T - cam.y);
      const above = ty > 0 ? L.grid[ty - 1][tx] : '.';
      if (ch === '#') {
        ctx.fillStyle = C.cobalt; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y + 7, T, 1); ctx.fillRect(x + 7, y, 1, T);
        if (above !== '#') { ctx.fillStyle = C.cobaltTop; ctx.fillRect(x, y, T, 4); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, T, 1); }
      } else if (ch === '=') {
        ctx.fillStyle = '#000'; ctx.fillRect(x, y, T, 7); ctx.fillStyle = '#fff'; ctx.fillRect(x, y + 1, T, 5);
        ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(x, y + 7, T, 2);
      } else if (ch === 'B') {
        ctx.fillStyle = (tx + ty) % 2 ? C.yellow : C.pink; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#000'; ctx.fillRect(x, y, T, 1); ctx.fillRect(x, y, 1, T); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 3, y + 5, T - 6, 2);
      }
    }
  }
  function drawPlayer() {
    if (P.inv > 0 && Math.floor(P.inv / 4) % 2) return;
    const x = px(P.x - cam.x), y = px(P.y - cam.y);
    ctx.save();
    if (P.face < 0) { ctx.translate(x + P.w, 0); ctx.scale(-1, 1); } else ctx.translate(x, 0);
    const walk = P.ground && Math.abs(P.vx) > .3 ? Math.floor(P.anim) % 4 : 0;
    const air = !P.ground;
    if (has('color')) { ctx.fillStyle = `hsl(${G.t * 8 % 360},90%,60%)`; ctx.fillRect(-2, y - 3, P.w + 4, P.h + 5); }
    ctx.fillStyle = C.cobalt; ctx.fillRect(1, y - 1, 10, 3); ctx.fillRect(6, y - 3, 2, 2); // beret
    ctx.fillStyle = '#111'; ctx.fillRect(1, y + 2, 10, 4); ctx.fillRect(0, y + 3, 2, 6); // hair
    ctx.fillStyle = '#F6C7A6'; ctx.fillRect(2, y + 4, 9, 6); // face
    ctx.fillStyle = '#000'; ctx.fillRect(8, y + 6, 1, 2); // eye
    ctx.fillStyle = '#F28B8B'; ctx.fillRect(6, y + 8, 2, 1);
    ctx.fillStyle = C.yellow; ctx.fillRect(1, y + 10, 10, 7); // sweater
    const arm = air ? -2 : [0, 1, 0, -1][walk];
    ctx.fillStyle = '#E0B800'; ctx.fillRect(4 + arm, y + 11, 3, 5);
    ctx.fillStyle = '#F6C7A6'; ctx.fillRect(5 + arm, y + 15, 2, 2);
    ctx.fillStyle = '#1d2a6b'; // legs
    const l1 = air ? -1 : [0, 2, 0, -2][walk], l2 = -l1;
    ctx.fillRect(3 + l1, y + 17, 3, 4); ctx.fillRect(7 + l2, y + 17, 3, 4);
    ctx.fillStyle = '#000'; ctx.fillRect(2 + l1, y + 21, 4, 1); ctx.fillRect(7 + l2, y + 21, 4, 1);
    ctx.restore();
  }
  function drawBubble(e) {
    const x = px(e.x - cam.x), y = px(e.y - cam.y);
    if (x > VW + 10 || x + e.w < -10) return;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 2, y + 2, e.w, e.h);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, e.w + 2, e.h + 2);
    ctx.fillStyle = has('deadline') ? '#dfe8ff' : '#fff'; ctx.fillRect(x, y, e.w, e.h);
    ctx.fillStyle = '#000'; ctx.fillRect(x + 8, y + e.h + 1, 6, 2); ctx.fillRect(x + 8, y + e.h + 3, 3, 2);
    ctx.fillStyle = C.red; ctx.font = FONT;
    e.lines.forEach((l, i) => ctx.fillText(l, x + 6, y + 13 + i * 10));
  }
  function drawCoin(c) {
    const x = c.x - cam.x, y = c.y - cam.y + Math.sin((G.t + c.x) * .08) * 1.5;
    if (x < -10 || x > VW + 10) return;
    const s = Math.abs(Math.cos((G.t + c.x) * .06));
    const w = Math.max(2, 9 * s);
    ctx.fillStyle = '#000'; ctx.fillRect(px(x - w / 2 - 1), px(y - 6), px(w + 2), 12);
    ctx.fillStyle = C.yellow; ctx.fillRect(px(x - w / 2), px(y - 5), px(w), 10);
    if (w > 6) { ctx.fillStyle = '#000'; ctx.fillRect(px(x - 1), px(y - 3), 2, 6); ctx.fillRect(px(x - 2), px(y - 2), 4, 1); ctx.fillRect(px(x - 2), px(y + 1), 4, 1); }
  }
  // a pixel heart: 2x scale of the HUD heart with a black outline, gently bobbing
  function drawHeart(hh) {
    const x = px(hh.x - cam.x - 8), y = px(hh.y - cam.y - 8 + Math.sin(G.t * .08 + hh.x) * 2);
    if (x < -20 || x > VW + 10) return;
    const rows = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
    ctx.fillStyle = '#000';
    rows.forEach((r, j) => { for (let i = 0; i < 8; i++) if (r[i] === '#') ctx.fillRect(x + i * 2 - 1, y + j * 2 + 1, 4, 4); });
    rows.forEach((r, j) => { for (let i = 0; i < 8; i++) if (r[i] === '#') { ctx.fillStyle = (i === 1 && j === 1) ? '#fff' : C.red; ctx.fillRect(x + i * 2, y + j * 2 + 2, 2, 2); } });
  }
  function drawSkill(s) {
    const x = px(s.x - cam.x - 10), y = px(s.y - cam.y - 10 + Math.sin(G.t * .07 + s.x) * 3);
    if (x < -30 || x > VW + 10) return;
    const info = SKILLS[s.type];
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, 22, 22);
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 20, 20);
    ctx.fillStyle = info.color;
    if (s.type === 'typography') { ctx.font = FONT; ctx.fillStyle = '#000'; ctx.fillText('Aa', x + 2, y + 14); }
    else if (s.type === 'color') { ['#E8291F', '#FFD84A', '#2BB673', '#244EE7'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x + 3 + (i % 2) * 7, y + 3 + Math.floor(i / 2) * 7, 7, 7); }); }
    else if (s.type === 'figma') { ctx.fillStyle = C.cobalt; ctx.fillRect(x + 4, y + 9, 12, 3); ctx.fillRect(x + 13, y + 6, 3, 9); ctx.fillRect(x + 4, y + 4, 3, 3); }
    else if (s.type === 'creativity') { ctx.fillStyle = C.yellow; ctx.fillRect(x + 6, y + 3, 8, 9); ctx.fillStyle = '#000'; ctx.fillRect(x + 7, y + 13, 6, 3); }
    else if (s.type === 'composition') { ctx.fillStyle = '#000'; for (let i = 0; i < 3; i++) { ctx.fillRect(x + 3 + i * 6, y + 3, 1, 14); ctx.fillRect(x + 3, y + 3 + i * 6, 14, 1); } ctx.fillStyle = C.yellow; ctx.fillRect(x + 9, y + 9, 5, 5); }
    else if (s.type === 'deadline') { ctx.fillStyle = '#7FB2FF'; ctx.fillRect(x + 5, y + 3, 10, 3); ctx.fillRect(x + 5, y + 14, 10, 3); ctx.fillRect(x + 8, y + 6, 4, 8); }
    if (G.t % 40 < 20) { ctx.fillStyle = info.color === '#000000' ? C.yellow : info.color; ctx.fillRect(x + 21, y - 3, 3, 3); }
  }
  function drawGoal() {
    const g = L.goal, x = px(g.x - cam.x), y = px(g.y - cam.y);
    if (x > VW + 40 || x < -60) return;
    if (g.send) {
      ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 26, 40, 26); ctx.fillStyle = '#fff'; ctx.fillRect(x, y - 24, 36, 24);
      const pulse = G.t % 40 < 20 ? 0 : 2;
      ctx.fillStyle = '#000'; ctx.fillRect(x + 2, y - 42 - pulse, 32, 18); ctx.fillStyle = C.red; ctx.fillRect(x + 3, y - 41 - pulse, 30, 16);
      ctx.fillStyle = '#fff'; ctx.font = FONT; ctx.fillText('SEND', x + 2, y - 30 - pulse);
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(x, y - 64, 3, 64);
      const wave = Math.floor(G.t / 8) % 2;
      ctx.fillStyle = '#000'; ctx.fillRect(x + 3, y - 64, 54, 22 + wave);
      ctx.fillStyle = C.yellow; ctx.fillRect(x + 4, y - 63, 52, 20 + wave);
      ctx.fillStyle = '#000'; ctx.font = FONT; ctx.fillText(g.label.split(' ')[0], x + 7, y - 50); if (g.label.split(' ')[1]) ctx.fillText(g.label.split(' ')[1], x + 7, y - 41 + wave);
    }
  }
  function drawHUD() {
    ctx.font = FONT; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(4, 4, VW - 8, 16);
    for (let i = 0; i < G.lives; i++) { const x = 9 + i * 12; ctx.fillStyle = C.red; ctx.fillRect(x, 8, 3, 3); ctx.fillRect(x + 4, 8, 3, 3); ctx.fillRect(x, 10, 7, 3); ctx.fillRect(x + 1, 13, 5, 2); ctx.fillRect(x + 3, 15, 1, 1); }
    ctx.fillStyle = '#000';
    ctx.fillText(`$${G.coins}`, 78, 16);
    ctx.fillText(`${G.score}`, 130, 16);
    ctx.fillText(`НАВЫКИ ${G.skillsGot.size}/6`, VW - 130, 16);
    let ex = 8;
    for (const k of ['color', 'figma', 'composition', 'deadline']) {
      if (!has(k)) continue;
      const left = G.effects[k], max = k === 'composition' ? 600 : 480;
      ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(ex - 4, 23, 92, 13);
      ctx.fillStyle = SKILLS[k].color; ctx.fillRect(ex, 31, 84 * left / max, 3);
      ctx.fillStyle = '#000'; ctx.font = '6px "Press Start 2P", monospace'; ctx.fillText(SKILLS[k].name.slice(0, 13), ex, 29); ex += 98;
    }
    ctx.font = FONT;
    if (L.time) {
      const left = Math.max(0, L.time - Math.floor(G.levelT / 60));
      ctx.fillStyle = left < 20 ? C.red : '#000'; ctx.fillText(`⏱${left}`, VW / 2 - 16, 16);
    }
    if (G.levelT < 150) {
      const a = Math.min(1, (150 - G.levelT) / 30);
      ctx.globalAlpha = a; ctx.fillStyle = '#000'; ctx.fillRect(VW / 2 - 130, VH / 2 - 34, 260, 52);
      ctx.fillStyle = C.yellow; ctx.fillText(`УРОВЕНЬ 0${L.id}`, VW / 2 - 116, VH / 2 - 14);
      ctx.fillStyle = '#fff'; ctx.fillText(L.name, VW / 2 - 116, VH / 2);
      ctx.fillStyle = '#9ec2ff'; ctx.font = '6px "Press Start 2P", monospace'; ctx.fillText(L.sub, VW / 2 - 116, VH / 2 + 12);
      ctx.globalAlpha = 1;
    }
  }
  function draw() {
    drawBg();
    ctx.font = '6px "Press Start 2P", monospace';
    for (const s of L.signs) { const x = px(s.x - cam.x), y = px(s.y - cam.y); if (x < -200 || x > VW) continue; const w = s.text.length * 6 + 10; ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 16); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, 14); ctx.fillStyle = C.cobalt; ctx.fillText(s.text, x + 5, y + 10); }
    for (const c of L.checkpoints) { const x = px(c.x - cam.x), y = px(c.y - cam.y); if (x < -20 || x > VW + 20) continue; ctx.fillStyle = '#000'; ctx.fillRect(x - 6, y - 14, 12, 14); ctx.fillStyle = c.got ? C.yellow : '#fff'; ctx.fillRect(x - 5, y - 13, 10, 12); ctx.fillStyle = '#000'; ctx.fillRect(x + 5, y - 11, 3, 6); if (c.got && G.t % 30 < 15) { ctx.fillStyle = '#aaa'; ctx.fillRect(x - 2, y - 20, 1, 4); ctx.fillRect(x + 1, y - 22, 1, 4); } }
    drawTiles(); drawGoal();
    coins.forEach(c => !c.taken && drawCoin(c));
    skills.forEach(s => !s.taken && drawSkill(s));
    hearts.forEach(hh => !hh.taken && drawHeart(hh));
    enemies.forEach(e => e.alive && (e.type !== 'fly' || e.active) && drawBubble(e));
    drawPlayer();
    parts.forEach(p => { ctx.fillStyle = p.color; ctx.fillRect(px(p.x - cam.x), px(p.y - cam.y), 2, 2); });
    pops.forEach(p => { ctx.font = p.big ? FONT : '6px "Press Start 2P", monospace'; ctx.fillStyle = '#fff'; ctx.fillText(p.text, px(p.x - cam.x) + 1, px(p.y - cam.y) + 1); ctx.fillStyle = p.color; ctx.fillText(p.text, px(p.x - cam.x), px(p.y - cam.y)); });
    drawHUD();
  }

  /* ---------- screens ---------- */
  function screen(html) { scr.innerHTML = html; scr.hidden = !html; }
  function titleScreen() {
    G.state = 'title';
    screen(`<div class="gs gs--title"><p class="gs__kicker">игра про жизнь дизайнера</p><h2 class="gs__title">ЗАБЕГ <br>ДИЗАЙНЕРА</h2>
      <p class="gs__text">Собирай монеты и навыки. Лопай правки клиента, прыгая на них. Каждые 40 монет и каждое сердечко — ещё одна жизнь.</p>
      <button class="btn btn--yellow btn--big" type="button" data-g="start">Старт</button></div>`);
  }
  function levelDone() {
    sound.play('win');
    const bonus = L.time ? Math.max(0, L.time - Math.floor(G.levelT / 60)) * 5 : 0;
    G.score += bonus;
    if (G.levelIndex < LEVELS.length - 1) {
      G.state = 'between';
      const next = LEVELS[G.levelIndex + 1];
      screen(`<div class="gs"><p class="gs__kicker">уровень 0${L.id} пройден${bonus ? ` · бонус за время +${bonus}` : ''}</p><h2 class="gs__title gs__title--small">${esc(L.goal.label)}!</h2>
        <p class="gs__text">Монеты ${G.coins} · очки ${G.score} · навыки ${G.skillsGot.size}/6</p>
        <p class="gs__text">Жизни: ${Math.max(G.lives, 3)}${G.lives < 3 ? ' (пополнили до трёх)' : ''}</p>
        <p class="gs__text">Дальше: <b>УРОВЕНЬ 0${next.id} — ${esc(next.name)}</b></p>
        <button class="btn btn--yellow btn--big" type="button" data-g="next">Следующий уровень</button></div>`);
      $('[data-g="next"]', scr).focus();
    } else win();
  }
  function win() {
    G.state = 'won';
    const prevBest = best(); if (G.score > prevBest) lsSet('bg.run.best', G.score); showBest();
    const medal = { title: 'СДАНО v7', coins: G.coins, score: G.score, day: todayKey(), used: false };
    lsSet('bg.medal', medal);
    screen(`<div class="gs gs--win"><h2 class="gs__title gs__title--small">УРА!<br>КЛИЕНТУ НРАВИТСЯ.<br><span>ПОКА ЧТО.</span></h2>
      <p class="gs__text">Монеты ${G.coins} · очки ${G.score}${G.score > prevBest ? ' · новый рекорд!' : ''} · навыки ${G.skillsGot.size}/6</p>
      <div class="gs__medal"><img src="" alt="" id="medal-img" width="96" height="120"><p>Ты заработала стикер-медаль.</p></div>
      <div class="gs__btns"><button class="btn btn--yellow" type="button" data-g="medal">Повесить медаль на стену дня</button><button class="btn btn--ghost btn--onblue" type="button" data-g="again">Сыграть ещё</button></div></div>`);
    import('../stickers.js').then(m => { const i = $('#medal-img', scr); if (i) i.src = m.svgURL(m.medalSVG(medal)); });
    $('[data-g="medal"]', scr).focus();
  }
  function gameOver() {
    G.state = 'over'; sound.play('lose');
    const prevBest = best(); if (G.score > prevBest) lsSet('bg.run.best', G.score); showBest();
    screen(`<div class="gs gs--over"><h2 class="gs__title gs__title--small">КОНЕЦ ИГРЫ</h2><p class="gs__text">Клиент выбрал шаблон. «Заново» начнёт этот же уровень с тремя жизнями, монеты уровня обнулятся.</p>
      <p class="gs__text">Монеты ${G.coins} · очки ${G.score}</p>
      <div class="gs__btns"><button class="btn btn--yellow btn--big" type="button" data-g="restart">Заново</button><button class="btn btn--ghost btn--onblue" type="button" data-g="again">С первого уровня</button></div></div>`);
    $('[data-g="restart"]', scr).focus();
  }
  function pause(on) {
    if (G.state !== 'play' && G.state !== 'paused') return;
    G.state = on ? 'paused' : 'play';
    screen(on ? `<div class="gs"><h2 class="gs__title gs__title--small">ПАУЗА</h2><button class="btn btn--yellow btn--big" type="button" data-g="resume">Продолжить</button></div>` : '');
    if (on) $('[data-g="resume"]', scr).focus(); else box.focus();
  }
  function startGame(fromLevel = 0, keepScore = false) {
    if (!keepScore) { G.score = 0; G.coins = 0; G.skillsGot = new Set(); }
    G.lives = 3; loadLevel(fromLevel); G.state = 'play'; screen(''); box.focus(); sound.play('open');
  }
  scr.addEventListener('click', async e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const a = b.dataset.g;
    if (a === 'start' || a === 'again') startGame(0);
    if (a === 'next') { loadLevel(G.levelIndex + 1); G.state = 'play'; screen(''); box.focus(); }
    if (a === 'restart') { G.score = levelScore0; G.coins = levelCoins0; startGame(G.levelIndex, true); }
    if (a === 'resume') pause(false);
    if (a === 'medal') {
      b.disabled = true; b.textContent = 'Вешаю…';
      const m = lsGet('bg.medal', null);
      try {
        await wall.add({ day: todayKey(), kind: 'medal', x: Math.round(rand(300, WORLD.w - 500)), y: Math.round(rand(200, WORLD.h - 400)), w: 170, h: 212, rot: Math.round(rand(-10, 10)), z: Math.floor(Date.now() / 1000) % 1e9, data: { title: m.title, coins: m.coins } });
        m.used = true; lsSet('bg.medal', m);
        b.replaceWith(h('<a class="btn btn--yellow" href="#/wall">Медаль на стене — посмотреть</a>'));
        sound.play('pop');
      } catch (er) { toast(er.message || 'Медаль не приклеилась. Она сохранена — добавь её со стены позже.', true); b.disabled = false; b.textContent = 'Повесить медаль на стену дня'; }
    }
  });

  /* ---------- input ---------- */
  const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  const onKey = (e, down) => {
    if (typing()) return;
    const k = e.key.toLowerCase();
    let used = true;
    if (k === 'arrowleft' || k === 'a') keys.left = down;
    else if (k === 'arrowright' || k === 'd') keys.right = down;
    else if (k === ' ' || k === 'arrowup' || k === 'w') { if (down && !keys.jump) keys.jumpPressed = true; keys.jump = down; }
    else if ((k === 'p' || k === 'escape') && down) { if (G.state === 'play') pause(true); else if (G.state === 'paused') pause(false); else used = false; }
    else if (k === 'enter' && down && G.state === 'title') startGame(0);
    else used = false;
    if (used && (G.state === 'play' || G.state === 'paused') && !e.target.closest('button')) e.preventDefault();
    if (used && k === ' ' && G.state === 'play') e.preventDefault();
  };
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const padState = new Map();
  $('#pads', root).addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-pad]'); if (!b) return;
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    padState.set(e.pointerId, b.dataset.pad); b.classList.add('is-down');
    if (b.dataset.pad === 'jump') { keys.jumpPressed = true; keys.jump = true; } else keys[b.dataset.pad] = true;
    if (G.state === 'title') startGame(0);
  });
  const padUp = e => {
    const which = padState.get(e.pointerId); if (!which) return;
    padState.delete(e.pointerId);
    $$(`[data-pad="${which}"]`, root).forEach(b => b.classList.remove('is-down'));
    if (which === 'jump') keys.jump = false; else keys[which] = false;
  };
  $('#pads', root).addEventListener('pointerup', padUp);
  $('#pads', root).addEventListener('pointercancel', padUp);
  $('#pads', root).addEventListener('contextmenu', e => e.preventDefault());
  const onBlur = () => { keys.left = keys.right = keys.jump = false; if (G.state === 'play') pause(true); };
  window.addEventListener('blur', onBlur);
  const onVis = () => { if (document.hidden) onBlur(); };
  document.addEventListener('visibilitychange', onVis);
  const onResize = () => sizeCanvas();
  window.addEventListener('resize', onResize);

  /* ---------- loop ---------- */
  let raf = 0, last = performance.now(), acc = 0;
  loadLevel(0);
  const frame = now => {
    raf = requestAnimationFrame(frame);
    acc += Math.min(100, now - last); last = now;
    while (acc >= 1000 / 60) { if (G.state === 'play') step(); acc -= 1000 / 60; }
    draw();
  };
  if (document.fonts) document.fonts.load('8px "Press Start 2P"').catch(() => {});
  titleScreen();
  raf = requestAnimationFrame(frame);
  // test hook (used only by automated checks)
  root.__game = { G, get P() { return P; }, get L() { return L; }, get enemies() { return enemies; }, keys, startGame, tick: n => { for (let i = 0; i < n && G.state === 'play'; i++) step(); }, solid: (x, y) => solidAt(x, y), loadLevel: i => { loadLevel(i); G.state = 'play'; screen(''); }, finish: () => levelDone() };

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', onResize);
  };
}
