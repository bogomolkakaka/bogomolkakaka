import { CONFIG } from './config.js';
import { $, $$, esc, h, ICON, SECTIONS, sound, toast, zoned, reducedMotion, rand, closeTopModal } from './util.js';
import { initStore, state } from './store.js';
import { BUILTIN, stickerURL } from './stickers.js';

const VIEWS = {
  desk: () => import('./views/desk.js'),
  booth: () => import('./views/booth.js'),
  wall: () => import('./views/wall.js'),
  capsule: () => import('./views/capsule.js'),
  run: () => import('./views/run.js'),
  objects: () => import('./views/objects.js'),
  stuff: () => import('./views/stuff.js'),
  films: () => import('./views/films.js'),
  admin: () => import('./views/admin.js')
};
const TITLES = { desk: '', admin: 'Админка студии', ...Object.fromEntries(SECTIONS.map(s => [s.id, s.name])) };

let current = { id: null, mod: null, cleanup: null, token: 0 };

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
  let id = parts[0] || 'desk';
  if (!VIEWS[id]) id = 'desk';
  return { id, params: parts.slice(1) };
}

export function go(path) { location.hash = path.startsWith('#') ? path : '#/' + path.replace(/^\//, ''); }

async function route() {
  const { id, params } = parseRoute();
  closeMenu();
  if (current.id === id && current.mod && current.mod.update) { current.mod.update(params); renderTaskbar(); return; }
  const token = ++current.token;
  if (current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
  current.cleanup = null;
  document.documentElement.classList.remove('locked');
  const main = $('#main');
  let mod;
  try { mod = await VIEWS[id](); }
  catch (e) { console.error(e); main.innerHTML = `<p class="boot">Эта комната не открылась. Обнови страницу и попробуй ещё раз.</p>`; return; }
  if (token !== current.token) return;
  main.innerHTML = '';
  const root = h(`<div class="view view--${id}"></div>`);
  main.appendChild(root);
  current = { id, mod, cleanup: null, token };
  document.title = TITLES[id] ? `${TITLES[id]} · ${CONFIG.SITE_NAME}` : CONFIG.SITE_NAME;
  renderTaskbar();
  window.scrollTo(0, 0);
  try { current.cleanup = await mod.mount(root, params, { go }) || null; }
  catch (e) { console.error(e); root.innerHTML = `<div class="page"><p class="notice">Что-то сломалось при открытии комнаты: ${esc(e.message || e)}. Обнови страницу и попробуй ещё раз.</p></div>`; }
  if (token === current.token && id !== 'desk' && !params.length) main.focus({ preventScroll: true });
}

/* ---------- taskbar ---------- */
function renderTaskbar() {
  const bar = $('#taskbar');
  const id = current.id || parseRoute().id;
  const tabs = [{ id: 'desk', name: 'Стол', icon: 'desk' }, ...SECTIONS];
  bar.innerHTML = `
    <button class="tb-start" id="tb-start" type="button" aria-expanded="false" aria-controls="startmenu">${ICON.logo}<b>${esc(CONFIG.SITE_NAME)}</b></button>
    <div class="tb-tabs">${tabs.map(t => `<a class="tb-tab" href="#/${t.id === 'desk' ? '' : t.id}" ${t.id === id ? 'aria-current="page"' : ''} title="${esc(t.name)}">${ICON[t.icon]}<span>${esc(t.short || t.name)}</span></a>`).join('')}</div>
    <div class="tb-right">
      <button class="tb-icon" id="tb-sound" type="button" aria-pressed="${!sound.muted}" aria-label="${sound.muted ? 'Включить звук' : 'Выключить звук'}" title="${sound.muted ? 'Звук выключен' : 'Звук включён'}">${sound.muted ? ICON.mute : ICON.sound}</button>
      <span class="tb-clock" id="tb-clock" title="Время студии (${esc(CONFIG.TIMEZONE)})"></span>
    </div>`;
  tick();
}
function tick() {
  const c = $('#tb-clock');
  if (!c) return;
  const z = zoned();
  c.textContent = `${String(z.hh).padStart(2, '0')}:${String(z.mm).padStart(2, '0')}`;
}
setInterval(tick, 15000);

function openMenu() {
  if ($('#startmenu')) { closeMenu(); return; }
  sound.play('open');
  const m = h(`<div class="startmenu" id="startmenu" role="menu" aria-label="Все комнаты">
    <div class="startmenu__head"><b>${esc(CONFIG.SITE_NAME)}</b><span>маленькая студия в интернете</span></div>
    <ul>${[{ id: '', name: 'Рабочий стол', hint: 'Туда, где всё лежит', icon: 'desk' }, ...SECTIONS].map(s => `<li><a role="menuitem" href="#/${s.id}">${ICON[s.icon]}<span><b>${esc(s.name)}</b><small>${esc(s.hint)}</small></span></a></li>`).join('')}</ul>
    <div class="startmenu__foot"><a role="menuitem" href="#/admin">${ICON.admin}<span><b>Админка</b><small>${state.admin ? 'Ты вошла' : 'Для хозяйки студии'}</small></span></a></div>
  </div>`);
  document.body.appendChild(m);
  $('#tb-start').setAttribute('aria-expanded', 'true');
  $('a', m).focus();
}
function closeMenu() {
  const m = $('#startmenu');
  if (!m) return;
  m.remove();
  const b = $('#tb-start'); if (b) b.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', e => {
  if (e.target.closest('#tb-start')) { openMenu(); return; }
  if (e.target.closest('#tb-sound')) { sound.toggle(); renderTaskbar(); toast(sound.muted ? 'Звук выключен' : 'Звук включён'); return; }
  if ($('#startmenu') && !e.target.closest('#startmenu')) closeMenu();
  const a = e.target.closest('a[href^="#/"]');
  if (a && !e.defaultPrevented) sound.play('click');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#startmenu')) { closeMenu(); $('#tb-start').focus(); }
});

/* ---------- easter eggs ---------- */
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let keys = [];
let typed = '';
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey) return;
  keys = [...keys, e.key].slice(-KONAMI.length);
  if (keys.join() === KONAMI.join()) { keys = []; stickerRain(); }
  if (e.key.length === 1) {
    typed = (typed + e.key.toLowerCase()).slice(-12);
    if (typed.endsWith('kerning') || typed.endsWith('кернинг')) { typed = ''; kerning(); }
  }
});
export function stickerRain(n = 34) {
  if (reducedMotion()) { toast('★ ★ ★'); return; }
  sound.play('win');
  const rain = h('<div class="rain" aria-hidden="true"></div>');
  for (let i = 0; i < n; i++) {
    const img = document.createElement('img');
    img.src = stickerURL(BUILTIN[i % BUILTIN.length].id);
    img.alt = '';
    img.style.left = rand(-4, 96) + 'vw';
    img.style.width = rand(48, 110) + 'px';
    img.style.animationDuration = rand(2.2, 4.2) + 's';
    img.style.animationDelay = rand(0, 1.4) + 's';
    img.style.setProperty('--r', rand(-540, 540) + 'deg');
    rain.appendChild(img);
  }
  document.body.appendChild(rain);
  setTimeout(() => rain.remove(), 6500);
}
function kerning() {
  const els = $$('.page-title, .desk-title, h1');
  els.forEach(el => el.animate([{ letterSpacing: '0em' }, { letterSpacing: '.35em' }, { letterSpacing: '-.04em' }, { letterSpacing: '0em' }], { duration: reducedMotion() ? 1 : 1600, easing: 'cubic-bezier(.3,.7,.3,1)' }));
  sound.play('power');
  toast('Кернинг исправлен. Не благодари.');
}

/* ---------- boot ---------- */
window.addEventListener('hashchange', route);
(async () => {
  renderTaskbar();
  await initStore();
  route();
})();
