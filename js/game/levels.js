// Level data for DESIGNER RUN, built with a tiny builder so the jumps stay fair.
export const T = 16, ROWS = 17, GROUND = 14;
export const EDITS = ['СДЕЛАЙ КРУПНЕЕ!', 'ПОЯРЧЕ!', 'А МОЖНО БЕСПЛАТНО?', 'ЕЩЁ ОДНА ПРАВОЧКА', 'СРОЧНО!!!', 'А МОЙ КУЗЕН ДИЗАЙНЕР', 'ЛОГОТИП ПОКРУПНЕЕ?'];
export const SKILLS = {
  typography: { name: 'ТИПОГРАФИКА', note: '+500 очков', color: '#000000' },
  color: { name: 'ТЕОРИЯ ЦВЕТА', note: 'щит на 8 с', color: '#E8291F' },
  figma: { name: 'FIGMA', note: 'ускорение', color: '#244EE7' },
  creativity: { name: 'КРЕАТИВ', note: '+1 жизнь', color: '#FFB8D9' },
  composition: { name: 'КОМПОЗИЦИЯ', note: 'магнит для монет', color: '#FFD84A' },
  deadline: { name: 'МАСТЕР СРОКОВ', note: 'правки тормозят', color: '#7FB2FF' }
};

class Builder {
  constructor(cols) { this.cols = cols; this.grid = Array.from({ length: ROWS }, () => new Array(cols).fill('.')); this.coins = []; this.skills = []; this.enemies = []; this.signs = []; this.checkpoints = []; this.hearts = []; this.goal = null; this.start = { x: 2, y: GROUND - 2 }; }
  fill(x0, x1, y0, y1, ch = '#') { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && x < this.cols && y >= 0 && y < ROWS) this.grid[y][x] = ch; return this; }
  ground(x0, x1, top = GROUND) { return this.fill(x0, x1, top, ROWS - 1, '#'); }
  step(x0, x1, height) { return this.fill(x0, x1, GROUND - height, GROUND - 1, '#'); }
  plat(x0, len, y, ch = '=') { return this.fill(x0, x0 + len - 1, y, y, ch); }
  block(x0, len, y0, y1) { return this.fill(x0, x0 + len - 1, y0, y1, 'B'); }
  coin(x, y) { this.coins.push({ x: x * T + 8, y: y * T + 8 }); return this; }
  coinRow(x0, n, y, dx = 1) { for (let i = 0; i < n; i++) this.coin(x0 + i * dx, y); return this; }
  coinArc(x0, n, y, hgt = 2) { for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) : .5; this.coins.push({ x: (x0 + i) * T + 8, y: (y - Math.sin(t * Math.PI) * hgt) * T + 8 }); } return this; }
  spring(x) { this.grid[GROUND - 1][x] = 'J'; return this; }
  heart(x, y) { this.hearts.push({ x: x * T + 8, y: y * T + 8 }); return this; }
  skill(x, y, type) { this.skills.push({ x: x * T + 8, y: y * T + 8, type }); return this; }
  patrol(x0, x1, y, text, speed = .6) { this.enemies.push({ type: 'patrol', x0: x0 * T, x1: x1 * T, y: y * T, text, speed }); return this; }
  bob(x, y, amp, text, speed = .03) { this.enemies.push({ type: 'bob', x0: x * T, y: y * T, amp: amp * T, text, speed }); return this; }
  flyer(x, y, text, speed = 1.2, loop = false) { this.enemies.push({ type: 'fly', x0: x * T, y: y * T, text, speed, loop }); return this; }
  sign(x, y, text) { this.signs.push({ x: x * T, y: y * T, text }); return this; }
  check(x) { this.checkpoints.push({ x: x * T + 8, y: (GROUND) * T }); return this; }
  done(meta) { return { ...meta, cols: this.cols, rows: ROWS, grid: this.grid.map(r => r.join('')), coins: this.coins, skills: this.skills, enemies: this.enemies, signs: this.signs, checkpoints: this.checkpoints, hearts: this.hearts, goal: this.goal, start: this.start }; }
}

function level1() {
  const b = new Builder(132);
  b.ground(0, 40).sign(2, 9, '← → или A D: идти').coinRow(6, 5, 12)
    .step(15, 16, 2).coinRow(15, 2, 10).sign(13, 7, 'ПРОБЕЛ: прыжок')
    .patrol(21, 29, GROUND - 2, 'СДЕЛАЙ КРУПНЕЕ!', .45).sign(24, 7, 'прыгай НА правки — они лопнут')
    .plat(32, 5, 10).skill(34, 8, 'typography').coinRow(32, 2, 12)
    .coinArc(40, 4, 11, 2)
    .ground(43, 72).plat(47, 4, 11).coinRow(47, 4, 10).plat(53, 4, 8).coinRow(53, 4, 7)
    .patrol(58, 67, GROUND - 2, 'ПОЯРЧЕ!', .55).plat(61, 4, 9).skill(63, 7, 'color')
    .coinArc(72, 5, 11, 2.5).check(76)
    .ground(76, 131).step(82, 86, 2).coinRow(82, 5, 10).patrol(90, 101, GROUND - 3, 'А МОЖНО БЕСПЛАТНО?', .6)
    .plat(104, 4, 10).coinRow(104, 4, 9).heart(106, 7).step(110, 111, 3).coinRow(113, 6, 12).sign(118, 8, 'бриф вон там →');
  b.goal = { x: 126 * T, y: GROUND * T, label: 'БРИФ ОК' };
  return b.done({ id: 1, name: 'БРИФ', sub: 'осваиваемся и собираем первые монеты', theme: 'brief', time: 0 });
}
function level2() {
  const b = new Builder(176);
  b.ground(0, 22).coinRow(4, 4, 12).patrol(9, 18, GROUND - 2, 'СРОЧНО!!!', .6)
    .ground(26, 50).coinArc(22, 4, 11, 2).plat(29, 4, 10).skill(31, 8, 'figma').coinRow(35, 6, 12)
    .flyer(46, 10, 'ЕЩЁ ОДНА ПРАВОЧКА', 1.1).patrol(38, 48, GROUND - 2, 'ПОЯРЧЕ!', .7)
    .plat(51, 3, 11).plat(56, 3, 9).plat(61, 3, 11).coinRow(51, 3, 10).coinRow(56, 3, 8).coinRow(61, 3, 10)
    .bob(58, 11, 1.6, 'СДЕЛАЙ КРУПНЕЕ!', .035).heart(57, 6)
    .ground(65, 100).check(66).step(70, 72, 2).coinRow(70, 3, 10).patrol(74, 86, GROUND - 2, 'А МОЙ КУЗЕН ДИЗАЙНЕР', .75)
    .plat(84, 5, 9).skill(86, 7, 'composition').coinRow(88, 8, 12).flyer(98, 9, 'СРОЧНО!!!', 1.25)
    .coinArc(100, 4, 11, 2.2).ground(104, 132).block(108, 2, 11, 13).coinRow(108, 2, 10).block(114, 2, 10, 13).coinRow(114, 2, 9)
    .patrol(117, 128, GROUND - 2, 'А МОЖНО БЕСПЛАТНО?', .8).check(122)
    .plat(133, 3, 11).skill(134, 9, 'deadline').coinRow(129, 3, 12).ground(136, 175)
    .check(140).flyer(150, 11, 'СДЕЛАЙ КРУПНЕЕ!', 1.3).flyer(164, 8, 'ЕЩЁ ОДНА ПРАВОЧКА', 1.2).bob(146, 10, 2, 'ПОЯРЧЕ!', .04)
    .coinRow(140, 5, 12).coinRow(155, 6, 12).step(158, 160, 2);
  b.goal = { x: 170 * T, y: GROUND * T, label: 'УСПЕЛИ!' };
  return b.done({ id: 2, name: 'ДЕДЛАЙН', sub: 'правок больше, времени меньше', theme: 'deadline', time: 150 });
}
function level3() {
  const b = new Builder(214);
  b.ground(0, 26).coinRow(4, 6, 12).patrol(12, 24, GROUND - 2, 'ЛОГОТИП ПОКРУПНЕЕ?', .75)
    .plat(27, 3, 11).plat(32, 3, 9).plat(37, 3, 11).coinRow(27, 3, 10).coinRow(32, 3, 8).coinRow(37, 3, 10)
    .ground(41, 71).skill(44, 11, 'creativity').flyer(50, 9, 'СРОЧНО!!!', 1.25).bob(52, 9, 2, 'ПОЯРЧЕ!', .04).patrol(55, 68, GROUND - 2, 'А МОЙ КУЗЕН ДИЗАЙНЕР', .85)
    .flyer(70, 10, 'ЕЩЁ ОДНА ПРАВОЧКА', 1.35).coinRow(58, 8, 12).check(72)
    .ground(72, 104).step(78, 81, 2).step(84, 87, 3).coinRow(84, 4, 9).patrol(89, 102, GROUND - 2, 'СДЕЛАЙ КРУПНЕЕ!', .9)
    .plat(96, 5, 9).skill(98, 7, 'color').heart(100, 6).flyer(118, 10, 'СРОЧНО!!!', 1.4)
    .coinArc(104, 4, 11, 2.5).ground(108, 140).check(110).bob(115, 10, 2, 'А МОЖНО БЕСПЛАТНО?', .04).block(120, 3, 11, 13).coinRow(120, 3, 10)
    .patrol(124, 136, GROUND - 2, 'ЕЩЁ ОДНА ПРАВОЧКА', .95).check(139)
    .plat(141, 3, 11).plat(146, 3, 9).plat(151, 3, 7).skill(152, 5, 'deadline').plat(156, 3, 9).plat(160, 4, 11).heart(147, 7)
    .bob(149, 12, 1.5, 'ПОЯРЧЕ!', .04)
    .ground(164, 213).check(166).flyer(180, 9, 'СДЕЛАЙ КРУПНЕЕ!', 1.45).flyer(196, 11, 'ЛОГОТИП ПОКРУПНЕЕ?', 1.35)
    .patrol(170, 182, GROUND - 2, 'ПОЯРЧЕ!', 1).patrol(188, 200, GROUND - 2, 'А МОЙ КУЗЕН ДИЗАЙНЕР', 1.05)
    .coinRow(166, 10, 12).coinRow(186, 10, 12).step(202, 203, 2).sign(196, 6, 'последняя мелочь →');
  b.goal = { x: 208 * T, y: GROUND * T, label: 'СДАНО' };
  return b.done({ id: 3, name: 'FINAL FINAL V7', sub: 'режим хаоса. сдавай.', theme: 'final', time: 0 });
}
// Chapter two. Same gentle ramp as 1→3: a little faster each level, never endless swarms, a checkpoint every ~35 columns.
function level4() {
  const b = new Builder(190);
  b.ground(0, 30).coinRow(4, 5, 12).sign(5, 7, 'жёлтый батут подбросит высоко').spring(14).coin(14, 7).coin(14, 5).coin(14, 3)
    .patrol(18, 28, GROUND - 2, 'НУЖНО ВЧЕРА', .7).plat(22, 4, 10).coinRow(22, 4, 9)
    .ground(34, 70).step(38, 40, 2).coinRow(38, 3, 10).patrol(44, 54, GROUND - 2, 'ДОБАВЬ ВОЗДУХА', .8).flyer(58, 9, 'ЕЩЁ ВАРИАНТ', 1.2)
    .check(60).plat(62, 4, 9).skill(64, 7, 'figma').coinRow(66, 4, 12)
    .plat(72, 3, 11).coinRow(72, 3, 10)
    .ground(76, 120).spring(80).coin(80, 7).coin(80, 5).coin(80, 3).block(86, 2, 11, 13).coinRow(86, 2, 10)
    .bob(92, 10, 1.6, 'А ЕСЛИ ЗЕЛЁНЫЙ?', .035).check(98).patrol(100, 112, GROUND - 2, 'ШРИФТ ПОМОДНЕЕ', .85)
    .plat(106, 4, 10).heart(108, 8).coinArc(118, 4, 11, 2)
    .ground(124, 189).check(127).step(130, 132, 2).coinRow(130, 3, 10).flyer(146, 10, 'НУЖНО ВЧЕРА', 1.3)
    .patrol(146, 160, GROUND - 2, 'СДЕЛАЙ КАК У ВСЕХ', .9).plat(150, 4, 9).skill(152, 7, 'composition')
    .coinRow(164, 8, 12).sign(174, 8, 'питч уже близко →');
  b.goal = { x: 184 * T, y: GROUND * T, label: 'ПИТЧ ОК' };
  return b.done({ id: 4, name: 'ПИТЧ', sub: 'покажи идею и не моргни', theme: 'pitch', time: 0 });
}
function level5() {
  const b = new Builder(200);
  b.ground(0, 24).coinRow(4, 5, 12).patrol(10, 22, GROUND - 2, 'ДАВАЙТЕ КАК БЫЛО', .8)
    .ground(28, 60).step(31, 33, 2).coinRow(31, 3, 10).check(36).bob(40, 10, 1.6, 'А ПОЧЕМУ ТАК?', .04)
    .spring(46).coin(46, 7).coin(46, 5).coin(46, 3).patrol(48, 58, GROUND - 2, 'ЕЩЁ ВАРИАНТ', .85)
    .plat(62, 3, 11).plat(67, 3, 9).heart(68, 7).coinRow(62, 3, 10)
    .ground(72, 110).check(74).skill(80, 11, 'deadline').block(88, 2, 11, 13).coinRow(88, 2, 10).flyer(96, 10, 'НУЖНО ВЧЕРА', 1.3)
    .patrol(94, 108, GROUND - 2, 'ЛОГО НА ВЕСЬ ЭКРАН', .9)
    .ground(114, 150).check(116).plat(120, 5, 10).coinRow(120, 5, 9).bob(126, 9, 1.8, 'ДОБАВЬ ВОЗДУХА', .04)
    .patrol(130, 148, GROUND - 2, 'А ЕСЛИ ЗЕЛЁНЫЙ?', .95).plat(134, 4, 9).skill(136, 7, 'color')
    .plat(152, 3, 11).plat(157, 3, 9).plat(162, 3, 11).heart(158, 7).coinRow(152, 3, 10).coinRow(162, 3, 10).bob(155, 13, 1.2, 'ШРИФТ ПОМОДНЕЕ', .035)
    .ground(166, 199).check(168).coinRow(168, 6, 12).flyer(182, 9, 'СДЕЛАЙ КАК У ВСЕХ', 1.35).patrol(180, 190, GROUND - 2, 'НУЖНО ВЧЕРА', 1);
  b.goal = { x: 194 * T, y: GROUND * T, label: 'ПРИНЯТО' };
  return b.done({ id: 5, name: 'ПРАВКИ', sub: 'правка на правку и ещё одна', theme: 'revisions', time: 0 });
}
function level6() {
  const b = new Builder(210);
  b.ground(0, 28).coinRow(4, 6, 12).patrol(12, 26, GROUND - 2, 'ЛОГО НА ВЕСЬ ЭКРАН', .85).flyer(38, 9, 'НУЖНО ВЧЕРА', 1.3)
    .ground(32, 66).spring(36).coin(36, 7).coin(36, 5).coin(36, 3).step(42, 44, 3).coinRow(42, 3, 9).check(46)
    .bob(50, 10, 1.6, 'ЕЩЁ ВАРИАНТ', .045).patrol(52, 64, GROUND - 2, 'А ПОЧЕМУ ТАК?', .95)
    .plat(68, 3, 11).plat(73, 3, 8).plat(78, 3, 11).heart(74, 6).coinRow(68, 3, 10).coinRow(78, 3, 10)
    .ground(82, 120).check(84).skill(88, 11, 'creativity').block(96, 2, 11, 13).block(102, 2, 10, 13).coinRow(102, 2, 9)
    .flyer(108, 10, 'ДАВАЙТЕ КАК БЫЛО', 1.4).patrol(106, 118, GROUND - 2, 'СДЕЛАЙ КАК У ВСЕХ', 1)
    .ground(125, 160).check(127).spring(132).coin(132, 7).coin(132, 5).coin(132, 3).bob(140, 10, 1.8, 'ШРИФТ ПОМОДНЕЕ', .045)
    .patrol(142, 158, GROUND - 2, 'ДОБАВЬ ВОЗДУХА', 1.05).plat(146, 4, 9).skill(148, 7, 'typography').heart(150, 7)
    .ground(164, 209).check(166).coinRow(166, 5, 12).patrol(172, 184, GROUND - 2, 'НУЖНО ВЧЕРА', 1.05).flyer(184, 9, 'А ЕСЛИ ЗЕЛЁНЫЙ?', 1.45)
    .patrol(188, 198, GROUND - 2, 'ЕЩЁ ВАРИАНТ', 1.1).coinRow(186, 6, 12).sign(194, 6, 'жми «Сдать» →');
  b.goal = { x: 204 * T, y: GROUND * T, label: 'СДАТЬ', send: true };
  return b.done({ id: 6, name: 'РЕЛИЗ', sub: 'последний рывок до запуска', theme: 'launch', time: 0 });
}
export const LEVELS = [level1(), level2(), level3(), level4(), level5(), level6()];
