// Game progress for this browser: levels done in each game, unlocked games and reward stickers.
// Every three levels finished in a game give one reward sticker; some milestones open the next game.
import { lsGet, lsSet, esc, ICON, openModal, sound } from './util.js';
import { REWARD, stickerURL } from './stickers.js';

export const GAMES = [
  { id: 'run', name: 'Забег дизайнера', short: 'Забег', href: '#/run', levels: 6 },
  { id: 'memory', name: 'Мемори', short: 'Мемори', href: '#/memory', levels: 6, unlock: { game: 'run', level: 3 } },
  { id: 'snake', name: 'Змейка', short: 'Змейка', href: '#/snake', levels: 6, unlock: { game: 'run', level: 6 } },
  { id: 'quiz', name: 'Тренажёр', short: 'Тренажёр', href: '#/quiz', levels: 6, unlock: { game: 'memory', level: 3 } }
];
const KEY = 'bg.progress';
const gameById = id => GAMES.find(g => g.id === id);

export function progress() {
  const p = lsGet(KEY, {}) || {};
  const out = { stars: p.stars && typeof p.stars === 'object' ? p.stars : {} };
  GAMES.forEach(g => { out[g.id] = Math.max(0, Math.min(g.levels, p[g.id] | 0)); });
  return out;
}
export const levelsDone = id => progress()[id];
export function isUnlocked(id, p = progress()) {
  const g = gameById(id);
  return !g || !g.unlock || p[g.unlock.game] >= g.unlock.level;
}
export function unlockHint(id) {
  const g = gameById(id); if (!g || !g.unlock) return '';
  const src = gameById(g.unlock.game);
  return `Пройди уровни ${g.unlock.level - 2}–${g.unlock.level} в игре «${src.name}», чтобы открыть.`;
}
export const earned = (p = progress()) => REWARD.filter(r => p[r.game] >= r.at);
export const earnedIds = () => earned().map(r => r.id);

// Marks a level as done; returns what this unlocked so the game can celebrate it.
export function complete(game, level, stars = 0) {
  const before = progress();
  const raw = lsGet(KEY, {}) || {};
  raw[game] = Math.max(raw[game] | 0, level);
  if (stars) { raw.stars = raw.stars || {}; raw.stars[`${game}-${level}`] = Math.max(raw.stars[`${game}-${level}`] | 0, stars); }
  lsSet(KEY, raw);
  const after = progress();
  const had = new Set(earned(before).map(r => r.id));
  return {
    stickers: earned(after).filter(r => !had.has(r.id)),
    games: GAMES.filter(g => !isUnlocked(g.id, before) && isUnlocked(g.id, after))
  };
}
export const starsFor = (game, level) => progress().stars[`${game}-${level}`] | 0;

// A block for end-of-level screens: new sticker and newly opened games.
export function rewardHTML(res, { dark = false } = {}) {
  if (!res || (!res.stickers.length && !res.games.length)) return '';
  return `<div class="reward${dark ? ' reward--dark' : ''}" role="status">
    ${res.stickers.map(s => `<div class="reward__sticker"><img src="${stickerURL(s.id)}" alt="" width="84" height="84"><p><b>Новый стикер: «${esc(s.name)}»</b>Он уже в наборе стикеров фотобудки и стены дня.</p></div>`).join('')}
    ${res.games.map(g => `<a class="reward__game" href="${g.href}">${ICON.run}<span>Открыта новая игра: <b>${esc(g.name)}</b></span></a>`).join('')}
  </div>`;
}

// Celebration popup for a new sticker and/or a newly opened game.
export function celebrate(res) {
  if (!res || (!res.stickers.length && !res.games.length)) return null;
  sound.play('win');
  const title = res.stickers.length ? 'Новый стикер!' : 'Новая игра открыта!';
  const m = openModal(`<div class="prize"><h2>${title}</h2>${rewardHTML({ stickers: res.stickers, games: [] })}${res.games.map(g => `<p class="prize__game">${ICON.run}<span>Открыта новая игра: <b>${esc(g.name)}</b></span></p>`).join('')}
    <div class="modal__actions">${res.games.map(g => `<a class="btn btn--primary" href="${g.href}" data-close>Играть: ${esc(g.name)}</a>`).join('')}<button class="btn btn--ghost" type="button" data-close>Дальше</button></div></div>`, { label: title });
  return m;
}

// Strip of games with locks, shown at the top of every game page.
export function gamesNavHTML(current) {
  const p = progress();
  return `<nav class="gamesnav" aria-label="Игры">${GAMES.map(g => {
    const open = isUnlocked(g.id, p);
    const done = p[g.id];
    return `<a class="gamesnav__tab${g.id === current ? ' is-current' : ''}${open ? '' : ' is-locked'}" href="${g.href}" ${g.id === current ? 'aria-current="page"' : ''}>
      ${open ? '' : `<span class="gamesnav__lock">${ICON.lock}</span>`}<b>${esc(g.short)}</b><small>${open ? `${done} / ${g.levels}` : 'закрыто'}</small></a>`;
  }).join('')}</nav>`;
}

// Album of all reward stickers: earned ones in colour, the rest as hints.
export function albumHTML() {
  const p = progress(), have = new Set(earned(p).map(r => r.id));
  return `<section class="album" aria-labelledby="album-t"><h2 id="album-t">Стикеры за игры <small>${have.size} из ${REWARD.length}</small></h2>
    <ul class="album__grid">${REWARD.map(r => {
      const g = gameById(r.game), got = have.has(r.id);
      return `<li class="album__item${got ? ' is-got' : ''}"><img src="${stickerURL(r.id)}" alt="" width="72" height="72"><b>${got ? esc(r.name) : '???'}</b><small>${esc(g.name)}, <span class="nw">уровни ${r.at - 2}–${r.at}</span></small></li>`;
    }).join('')}</ul>
    <p class="album__note">Заработанные стикеры появляются в фотобудке и на стене дня. Прогресс хранится в этом браузере.</p></section>`;
}
