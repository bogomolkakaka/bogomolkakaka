// МЕМОРИ: find pairs of the site's stickers. Six levels, more cards each time, no way to lose.
import { $, $$, esc, ICON, sound, reducedMotion, plural, sleep } from '../util.js';
import { BUILTIN, stickerURL } from '../stickers.js';
import { complete, celebrate, gamesNavHTML, albumHTML, isUnlocked, unlockHint, levelsDone, starsFor } from '../progress.js';

const LEVELS = [
  { pairs: 4, cols: 4, mcols: 4, peek: 1800 },
  { pairs: 6, cols: 4, mcols: 4, peek: 1800 },
  { pairs: 8, cols: 4, mcols: 4, peek: 2000 },
  { pairs: 10, cols: 5, mcols: 4, peek: 2200 },
  { pairs: 12, cols: 6, mcols: 4, peek: 2400 },
  { pairs: 15, cols: 6, mcols: 5, peek: 2600 }
];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const starsOf = (moves, pairs) => moves <= Math.ceil(pairs * 1.6) ? 3 : moves <= Math.ceil(pairs * 2.3) ? 2 : 1;
const starLine = n => '★'.repeat(n) + '☆'.repeat(3 - n);

export async function mount(root) {
  let S = null, alive = true;
  root.innerHTML = `<div class="page game-page">
    <div class="page-head"><div><a class="back" href="#/">${ICON.back}На рабочий стол</a>
      <h1 class="page-title">Мемори</h1><p class="page-sub">найди пары стикеров: с каждым уровнем карточек больше</p></div></div>
    <div id="gamesnav">${gamesNavHTML('memory')}</div>
    <div id="mem-body"></div>
    <div id="album">${albumHTML()}</div>
  </div>`;
  const body = $('#mem-body', root);
  if (!isUnlocked('memory')) {
    body.innerHTML = `<div class="lockcard">${ICON.lock}<h2>Игра пока закрыта</h2><p>${esc(unlockHint('memory'))}</p><a class="btn btn--yellow" href="#/run">Играть в Забег дизайнера</a></div>`;
    return () => { alive = false; };
  }

  function levelBar() {
    const done = levelsDone('memory');
    return `<div class="lvlbar" role="group" aria-label="Уровни">${LEVELS.map((L, i) => {
      const open = i <= done, st = starsFor('memory', i + 1);
      return `<button class="lvl${S && S.li === i ? ' is-current' : ''}" type="button" data-lvl="${i}" ${open ? '' : 'disabled'} aria-label="Уровень ${i + 1}${open ? '' : ', закрыт'}${st ? `, ${st} из 3 звёзд` : ''}"><b>${i + 1}</b><small>${open ? (st ? starLine(st) : `${L.pairs} пар`) : ICON.lock}</small></button>`;
    }).join('')}</div>`;
  }
  function stats() {
    const L = LEVELS[S.li];
    return `Уровень ${S.li + 1} · ходов ${S.moves} · пар ${S.found} из ${L.pairs}`;
  }
  function render() {
    const L = LEVELS[S.li];
    body.innerHTML = `${levelBar()}
      <div class="mem">
        <p class="mem-stats" id="mem-stats" aria-live="polite">${stats()}</p>
        <div class="mem-board" id="mem-board" style="--cols:${L.cols};--mcols:${L.mcols}">${S.deck.map((c, i) => `<button class="mcard" type="button" data-i="${i}" aria-label="Карточка ${i + 1}, закрыта"><span class="mcard__in"><span class="mcard__back">${ICON.logo}</span><span class="mcard__face"><img src="${stickerURL(c)}" alt="" draggable="false"></span></span></button>`).join('')}</div>
        <div class="mem-over" id="mem-over" hidden></div>
      </div>`;
  }
  async function start(li) {
    const L = LEVELS[li];
    const ids = shuffle(BUILTIN.map(b => b.id)).slice(0, L.pairs);
    S = { li, deck: shuffle([...ids, ...ids]), open: [], done: new Set(), moves: 0, found: 0, lock: true, token: (S ? S.token : 0) + 1 };
    const my = S.token;
    render();
    // a short look at all the cards before they turn over
    $$('.mcard', body).forEach(b => b.classList.add('is-open'));
    $('#mem-stats', body).textContent = 'Запоминай…';
    await sleep(reducedMotion() ? L.peek + 400 : L.peek);
    if (!alive || S.token !== my) return;
    $$('.mcard', body).forEach(b => b.classList.remove('is-open'));
    $('#mem-stats', body).textContent = stats();
    S.lock = false;
  }
  function label(i) {
    const b = $(`.mcard[data-i="${i}"]`, body); if (!b) return;
    const name = (BUILTIN.find(x => x.id === S.deck[i]) || {}).name || '';
    b.setAttribute('aria-label', S.done.has(i) ? `Карточка ${i + 1}: ${name}, пара найдена` : b.classList.contains('is-open') ? `Карточка ${i + 1}: ${name}` : `Карточка ${i + 1}, закрыта`);
  }
  function flip(i) {
    if (S.lock || S.done.has(i)) return;
    if (S.open.length === 2) {
      // two wrong cards are still showing: close them at once; a tap on one of them keeps it as the first card of a new try
      clearTimeout(S.t);
      const keep = S.open.includes(i);
      S.open.forEach(j => { if (j !== i) { $(`.mcard[data-i="${j}"]`, body).classList.remove('is-open'); label(j); } });
      S.open = keep ? [i] : [];
      if (keep) return;
    }
    if (S.open.includes(i)) return;
    const b = $(`.mcard[data-i="${i}"]`, body);
    b.classList.add('is-open'); S.open.push(i); label(i); sound.play('click');
    if (S.open.length < 2) return;
    S.moves++;
    const [a, c] = S.open;
    if (S.deck[a] === S.deck[c]) {
      S.done.add(a); S.done.add(c); S.found++; S.open = [];
      [a, c].forEach(j => { const el = $(`.mcard[data-i="${j}"]`, body); el.classList.add('is-done'); label(j); });
      sound.play('coin');
      if (S.found === LEVELS[S.li].pairs) won();
    } else {
      S.t = setTimeout(() => { if (!alive) return; S.open.forEach(j => { const el = $(`.mcard[data-i="${j}"]`, body); if (el) el.classList.remove('is-open'); label(j); }); S.open = []; }, 900);
    }
    $('#mem-stats', body).textContent = stats();
  }
  function won() {
    S.lock = true;
    const L = LEVELS[S.li], stars = starsOf(S.moves, L.pairs);
    const res = complete('memory', S.li + 1, stars);
    $('#gamesnav', root).innerHTML = gamesNavHTML('memory'); $('#album', root).innerHTML = albumHTML();
    const last = S.li === LEVELS.length - 1;
    const over = $('#mem-over', body);
    over.hidden = false;
    over.innerHTML = `<div class="mem-over__card" role="status"><p class="mem-over__stars" aria-label="${stars} из 3 звёзд">${starLine(stars)}</p>
      <h2>${last ? 'Все уровни пройдены!' : `Уровень ${S.li + 1} пройден`}</h2>
      <p>${S.moves} ${plural(S.moves, ['ход', 'хода', 'ходов'])}. ${stars < 3 ? `Три звезды — если уложиться в ${Math.ceil(L.pairs * 1.6)} ${plural(Math.ceil(L.pairs * 1.6), ['ход', 'хода', 'ходов'])}.` : 'Отличная память.'}</p>
      <div class="mem-over__btns">${last ? '' : `<button class="btn btn--yellow" type="button" data-act="next">Уровень ${S.li + 2}</button>`}<button class="btn btn--ghost" type="button" data-act="again">Ещё раз</button></div></div>`;
    $(last ? '[data-act="again"]' : '[data-act="next"]', over).focus();
    $('.lvlbar', body).outerHTML = levelBar();
    setTimeout(() => celebrate(res), 500);
  }
  body.addEventListener('click', e => {
    const c = e.target.closest('.mcard'); if (c) { flip(+c.dataset.i); return; }
    const l = e.target.closest('[data-lvl]'); if (l && !l.disabled) { start(+l.dataset.lvl); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'next') start(S.li + 1);
    if (a.dataset.act === 'again') start(S.li);
  });
  const first = Math.min(levelsDone('memory'), LEVELS.length - 1);
  start(first);
  // test hook (automated checks only)
  root.__memory = { get S() { return S; }, flip, start };
  return () => { alive = false; if (S) clearTimeout(S.t); };
}
