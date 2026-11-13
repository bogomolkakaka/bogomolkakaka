import { CONFIG } from '../config.js';
import { $, $$, esc, h, ICON, sound, toast, sleep, clamp, todayKey, fmtDay, download, resizeToBlob, fileToImage, rand, reducedMotion } from '../util.js';
import { FilterEngine, FILTERS } from '../booth-gl.js';
import { FRAMES, geometry, composeStrip, ensureFonts } from '../booth-strip.js';
import { BUILTIN, stickerURL } from '../stickers.js';
import { wall, upload, config, stickers as stickerStore, state as storeState } from '../store.js';
import { WORLD } from '../wallmini.js';

const FW = 800, FH = 600;
const TEXT_COLORS = ['#000000', '#ffffff', '#244EE7', '#E8291F', '#FFD84A', '#FF7AB6'];

export async function mount(root, params, { go }) {
  const B = { stage: 'idle', stream: null, facing: 'user', mirror: true, filter: 'digicam', frame: 'classic', raw: [], times: [], overlay: [], caption: '', seed: Math.floor(Math.random() * 1e6), sel: -1, cams: 0, busy: false, custom: [], framesOff: [] };
  let raf = 0, alive = true, composeToken = 0;

  root.innerHTML = `<div class="page booth-page">
    <div class="page-head">
      <div><a class="back" href="#/">${ICON.back}Back to the desk</a>
        <h1 class="page-title">Photo Booth</h1>
        <p class="page-sub">four snaps, one strip, zero retouching</p></div>
      <p class="booth-privacy">Photos stay in your browser. Nothing leaves your device unless you put the strip on the wall.</p>
    </div>
    <div class="booth">
      <div class="marquee" aria-hidden="true"><span>PHOTO</span><i></i><span>BOOTH</span></div>
      <div class="booth__body">
        <div class="booth__screen-col">
          <div class="screen" id="screen">
            <canvas id="live" width="${FW}" height="${FH}" aria-label="Camera preview"></canvas>
            <video id="video" playsinline muted autoplay></video>
            <div class="datestamp" id="datestamp" hidden></div>
            <div class="screen__idle" id="idle"></div>
            <div class="countdown" id="countdown" aria-live="assertive"></div>
            <div class="flash" id="flash"></div>
          </div>
          <ol class="slots" id="slots" aria-label="Your four shots">${[0, 1, 2, 3].map(i => `<li class="slot"><span>${i + 1}</span></li>`).join('')}</ol>
        </div>
        <div class="panel" id="panel"></div>
      </div>
    </div>
    <div class="editor" id="editor" hidden></div>
    <div class="polaroids" aria-hidden="true">
      <figure class="pola pola--1"><img src="assets/objects/pug-1.jpg" alt=""><figcaption>monday pug</figcaption></figure>
      <figure class="pola pola--2"><img src="assets/objects/bunny-pink-1.jpg" alt=""><figcaption>bun-bun ♡</figcaption></figure>
      <figure class="pola pola--3"><img src="assets/objects/ghost-1.jpg" alt=""><figcaption>boo</figcaption></figure>
    </div>
  </div>`;

  const live = $('#live', root), video = $('#video', root);
  const engine = new FilterEngine(live);
  const workCanvas = document.createElement('canvas'); workCanvas.width = FW; workCanvas.height = FH;
  const worker = new FilterEngine(workCanvas);
  const dateText = (() => { const [y, m, d] = todayKey().split('-'); return `'${y.slice(2)} ${m} ${d}`; })();
  $('#datestamp', root).textContent = dateText;

  try {
    const [cfg, custom] = await Promise.all([config.all(), stickerStore.list()]);
    B.framesOff = Array.isArray(cfg.frames_off) ? cfg.frames_off : [];
    B.custom = custom;
    if (B.framesOff.includes(B.frame)) B.frame = (FRAMES.find(f => !B.framesOff.includes(f.id)) || FRAMES[0]).id;
  } catch (e) { /* defaults */ }
  const frames = () => FRAMES.filter(f => !B.framesOff.includes(f.id));

  /* ---------- panel ---------- */
  function renderPanel() {
    const shooting = B.stage === 'shooting';
    $('#panel', root).innerHTML = `
      <div class="panel__group">
        <h2 class="panel__title" id="f-title">Filter</h2>
        <div class="filters" role="radiogroup" aria-labelledby="f-title">${FILTERS.map(f => `<button class="fchip" type="button" role="radio" aria-checked="${B.filter === f.id}" data-filter="${f.id}" ${shooting ? 'disabled' : ''}><b>${f.num}</b>${esc(f.name)}</button>`).join('')}</div>
      </div>
      <div class="panel__group">
        <h2 class="panel__title" id="fr-title">Frame</h2>
        <div class="frames" role="radiogroup" aria-labelledby="fr-title">${frames().map(f => `<button class="frchip frchip--${f.id}" type="button" role="radio" aria-checked="${B.frame === f.id}" data-frame="${f.id}" ${shooting ? 'disabled' : ''}><i aria-hidden="true"></i>${esc(f.name)}</button>`).join('')}</div>
      </div>
      <div class="panel__row">
        <label class="switch"><input type="checkbox" id="mirror" ${B.mirror ? 'checked' : ''} ${shooting ? 'disabled' : ''}><span aria-hidden="true"></span>Mirror</label>
        ${B.cams > 1 && B.stream ? `<button class="btn btn--ghost btn--small" type="button" data-act="flip" ${shooting ? 'disabled' : ''}>${ICON.redo}Switch camera</button>` : ''}
      </div>
      <div class="panel__go">
        ${B.stream ? `<button class="arcade arcade--red" type="button" data-act="shoot" ${shooting ? 'disabled' : ''}><span>${shooting ? 'Smile!' : 'Start shooting'}</span></button>`
          : `<button class="arcade arcade--yellow" type="button" data-act="camera"><span>Start camera</span></button>`}
        <label class="btn btn--text upload-link">${ICON.upload}Upload 1–4 photos instead<input type="file" id="upload" accept="image/*" multiple hidden></label>
      </div>`;
    $('#upload', root).addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) fromFiles(files); });
    $('#mirror', root).addEventListener('change', e => { B.mirror = e.target.checked; sound.play('click'); });
  }
  function renderIdle(msg = '') {
    const idle = $('#idle', root);
    idle.hidden = !!B.stream;
    if (B.stream) return;
    idle.innerHTML = `<div><p class="idle__big">Smile, you’re on the internet</p>
      ${msg ? `<p class="idle__err" role="alert">${msg}</p>` : `<p class="idle__small">Press <b>Start camera</b> and allow access. The picture stays on this device.</p>`}
      <div class="idle__btns"><button class="btn btn--yellow" type="button" data-act="camera">Start camera</button>
      <label class="btn btn--ghost btn--onblue">${ICON.upload}Upload photos<input type="file" accept="image/*" multiple hidden class="idle-upload"></label></div></div>`;
    $('.idle-upload', idle).addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) fromFiles(files); });
  }
  function renderSlots() {
    $$('.slot', root).forEach((li, i) => {
      li.innerHTML = '';
      const f = B.raw[i];
      if (f) { const c = document.createElement('canvas'); c.width = 160; c.height = 120; worker.render(f, B.filter, { time: B.times[i] || 1 }); c.getContext('2d').drawImage(workCanvas, 0, 0, 160, 120); li.appendChild(c); li.classList.add('is-full'); }
      else { li.innerHTML = `<span>${i + 1}</span>`; li.classList.remove('is-full'); }
    });
  }

  /* ---------- camera ---------- */
  async function startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      renderIdle('This browser can’t open the camera here. Open the site over https in Chrome, Safari or Firefox, or upload photos.');
      return;
    }
    stopCamera();
    $('#idle', root).innerHTML = '<div><p class="idle__big">Waking up the camera…</p></div>';
    try {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: B.facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }); }
      catch (e) { if (e.name === 'OverconstrainedError') stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); else throw e; }
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
      B.stream = stream;
      video.srcObject = stream;
      await video.play().catch(() => {});
      try { B.cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').length; } catch (e) { B.cams = 1; }
      B.stage = 'live';
      sound.play('open');
      renderIdle(); renderPanel();
      loop();
    } catch (e) {
      const msg = {
        NotAllowedError: 'Camera access is blocked. Allow it in the address bar (the camera icon), then press Start camera again. Or upload photos.',
        SecurityError: 'Camera access is blocked on this page. Upload photos instead.',
        NotFoundError: 'No camera found on this device. Upload photos instead.',
        NotReadableError: 'The camera is busy in another app. Close it and try again, or upload photos.'
      }[e.name] || 'The camera did not start. Try again or upload photos.';
      B.stream = null; renderIdle(msg); renderPanel();
    }
  }
  function stopCamera() {
    if (B.stream) { B.stream.getTracks().forEach(t => t.stop()); B.stream = null; }
    cancelAnimationFrame(raf);
  }
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!alive || !B.stream) return;
      if (video.readyState >= 2) engine.render(video, B.filter, { mirror: B.mirror });
      $('#datestamp', root).hidden = B.filter !== 'digicam';
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /* ---------- capture ---------- */
  function grabRaw(source, mirror) {
    const c = document.createElement('canvas'); c.width = FW; c.height = FH;
    const g = c.getContext('2d');
    const sw = source.videoWidth || source.naturalWidth || source.width, sh = source.videoHeight || source.naturalHeight || source.height;
    const outA = FW / FH, inA = sw / sh;
    let sx = 0, sy = 0, cw = sw, ch = sh;
    if (inA > outA) { cw = sh * outA; sx = (sw - cw) / 2; } else { ch = sw / outA; sy = (sh - ch) / 2; }
    if (mirror) { g.translate(FW, 0); g.scale(-1, 1); }
    g.drawImage(source, sx, sy, cw, ch, 0, 0, FW, FH);
    return c;
  }
  async function countdown(n) {
    const el = $('#countdown', root);
    for (let i = n; i > 0; i--) {
      if (!alive) return;
      el.innerHTML = `<span class="cd">${i}</span>`; sound.play('tick');
      await sleep(760);
    }
    el.innerHTML = '';
  }
  function flash() {
    const f = $('#flash', root);
    f.classList.remove('is-on'); void f.offsetWidth; f.classList.add('is-on');
    sound.play('shutter');
  }
  async function shoot() {
    if (!B.stream || B.stage === 'shooting') return;
    B.stage = 'shooting'; B.raw = []; B.times = []; renderSlots(); renderPanel();
    $('#screen', root).classList.add('is-shooting');
    await countdown(3);
    for (let i = 0; i < 4 && alive; i++) {
      if (i > 0) { $('#countdown', root).innerHTML = `<span class="cd cd--small">${i + 1} / 4</span>`; await sleep(reducedMotion() ? 500 : 1100); $('#countdown', root).innerHTML = ''; }
      flash();
      B.raw.push(grabRaw(video, B.mirror)); B.times.push(performance.now() / 1000);
      renderSlots();
    }
    $('#screen', root).classList.remove('is-shooting');
    if (!alive) return;
    B.stage = 'edit';
    await sleep(350);
    openEditor();
  }
  async function fromFiles(files) {
    const imgs = [];
    for (const f of files.slice(0, 4)) {
      try { imgs.push(await fileToImage(f)); } catch (e) { /* skip */ }
    }
    if (!imgs.length) { toast('These files are not pictures this browser can read. Try JPEG or PNG.', true); return; }
    B.raw = [0, 1, 2, 3].map(i => grabRaw(imgs[i % imgs.length], false));
    B.times = [1, 2, 3, 4];
    B.stage = 'edit';
    renderSlots();
    if (imgs.length < 4) toast(`Got ${imgs.length} photo${imgs.length > 1 ? 's' : ''}: repeating to fill four slots.`);
    openEditor();
  }

  /* ---------- editor ---------- */
  function filtered() {
    return B.raw.map((r, i) => {
      worker.render(r, B.filter, { time: B.times[i] || 1 });
      const c = document.createElement('canvas'); c.width = FW; c.height = FH;
      const g = c.getContext('2d'); g.drawImage(workCanvas, 0, 0);
      if (B.filter === 'digicam') {
        g.font = 'bold 30px "Press Start 2P", "Courier New", monospace'; g.textAlign = 'right';
        g.shadowColor = 'rgba(255,120,0,.9)'; g.shadowBlur = 10; g.fillStyle = '#FF9A2E'; g.fillText(dateText, FW - 34, FH - 34);
      }
      return c;
    });
  }
  const stripOpts = () => ({ caption: B.caption, date: fmtDay(todayKey(), { day: 'numeric', month: 'long', year: 'numeric' }), site: CONFIG.SITE_NAME, seed: B.seed, overlay: B.overlay });
  async function recompose() {
    const tok = ++composeToken;
    await ensureFonts();
    const cv = await composeStrip(filtered(), B.frame, { ...stripOpts(), overlay: [] }, 1);
    if (tok !== composeToken || !alive) return;
    const holder = $('#strip-canvas', root);
    if (!holder) return;
    holder.width = cv.width; holder.height = cv.height;
    holder.getContext('2d').drawImage(cv, 0, 0);
    const stage = $('#strip-stage', root);
    stage.style.aspectRatio = `${cv.width} / ${cv.height}`;
    stage.classList.toggle('is-wide', B.frame === 'idcard');
    sizeOverlay();
  }
  function openEditor() {
    stopCamera(); B.stage = 'edit';
    $('.booth', root).hidden = true;
    const ed = $('#editor', root);
    ed.hidden = false;
    const stickerBtns = [...BUILTIN.map(s => ({ id: s.id, src: stickerURL(s.id), name: s.name })), ...B.custom.map(s => ({ id: '', src: s.url, name: s.name || 'Sticker' }))];
    ed.innerHTML = `<div class="editor__grid">
      <div class="editor__preview">
        <div class="strip-stage" id="strip-stage"><canvas id="strip-canvas" aria-label="Your photo strip"></canvas><div class="overlay" id="overlay" aria-label="Stickers on the strip"></div></div>
      </div>
      <div class="editor__tools">
        <h2 class="editor__title">Decorate your strip</h2>
        <p class="editor__hint">Drag stickers and words around. Use the round handles to turn and resize. Change the filter or frame any time.</p>
        <div class="panel__group"><h3 class="panel__title">Filter</h3>
          <div class="filters filters--small" role="radiogroup" aria-label="Filter">${FILTERS.map(f => `<button class="fchip" type="button" role="radio" aria-checked="${B.filter === f.id}" data-efilter="${f.id}"><b>${f.num}</b>${esc(f.name)}</button>`).join('')}</div></div>
        <div class="panel__group"><h3 class="panel__title">Frame</h3>
          <div class="frames" role="radiogroup" aria-label="Frame">${frames().map(f => `<button class="frchip frchip--${f.id}" type="button" role="radio" aria-checked="${B.frame === f.id}" data-eframe="${f.id}"><i aria-hidden="true"></i>${esc(f.name)}</button>`).join('')}</div></div>
        <div class="field"><label for="caption">${B.frame === 'idcard' ? 'Name on the card' : 'Caption'}</label><input id="caption" maxlength="28" placeholder="${B.frame === 'idcard' ? 'Your name' : 'Write something short'}" value="${esc(B.caption)}"></div>
        <div class="panel__group"><h3 class="panel__title">Stickers</h3>
          <div class="tray" role="list">${stickerBtns.map(s => `<button class="tray__s" type="button" role="listitem" data-sticker="${esc(s.id)}" data-src="${esc(s.id ? '' : s.src)}" aria-label="Add sticker: ${esc(s.name)}" title="${esc(s.name)}"><img src="${esc(s.src)}" alt="" ${/^https?:/.test(s.src) ? 'crossorigin="anonymous"' : ''}></button>`).join('')}</div></div>
        <div class="panel__group"><h3 class="panel__title">Words</h3>
          <div class="textadd"><input class="input" id="t-text" maxlength="24" placeholder="hello!" aria-label="Text to add">
          <button class="btn btn--ink btn--small" type="button" data-act="addtext">${ICON.plus}Add</button></div>
          <div class="textopts"><div class="swatches" role="radiogroup" aria-label="Text colour">${TEXT_COLORS.map((c, i) => `<button type="button" role="radio" class="sw" style="--c:${c}" data-tcolor="${c}" aria-checked="${i === 0}" aria-label="Colour ${c}"></button>`).join('')}</div>
          <div class="seg" role="radiogroup" aria-label="Lettering"><button type="button" class="chip" role="radio" aria-checked="true" data-tfont="hand">handwritten</button><button type="button" class="chip" role="radio" aria-checked="false" data-tfont="display">BOLD</button></div></div></div>
        <div class="editor__actions">
          <button class="btn btn--primary btn--big" type="button" data-act="download">${ICON.download}Download PNG</button>
          ${navigator.canShare ? `<button class="btn btn--ghost" type="button" data-act="share">${ICON.share}Share</button>` : ''}
          <button class="btn btn--yellow" type="button" data-act="publish">${ICON.plus}Put on today’s wall</button>
          <button class="btn btn--ghost" type="button" data-act="retake">${ICON.redo}Retake</button>
        </div>
        <p class="editor__note">“Put on today’s wall” uploads a small copy of this strip so other visitors can see it today and in the archive.</p>
      </div></div>`;
    $('#caption', ed).addEventListener('input', e => { B.caption = e.target.value; clearTimeout(B.capT); B.capT = setTimeout(recompose, 250); });
    $('#t-text', ed).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addText(); } });
    B.tcolor = TEXT_COLORS[0]; B.tfont = 'hand';
    recompose().then(() => { renderOverlay(); ed.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); });
    sound.play('open');
  }
  function sizeOverlay() {
    const ov = $('#overlay', root);
    if (!ov) return;
    const r = ov.getBoundingClientRect();
    ov.style.setProperty('--cw', Math.min(r.width, r.height) + 'px');
  }
  function renderOverlay() {
    const ov = $('#overlay', root);
    if (!ov) return;
    sizeOverlay();
    ov.innerHTML = B.overlay.map((o, i) => `<div class="ov ov--${o.type === 'text' ? 'text' : 'img'}${B.sel === i ? ' is-sel' : ''}" tabindex="0" data-i="${i}" role="button" aria-label="${o.type === 'text' ? 'Text: ' + esc(o.text) : 'Sticker'}. Arrows move, plus and minus resize, Delete removes."
        style="left:${o.x * 100}%;top:${o.y * 100}%;--s:${o.size};transform:translate(-50%,-50%) rotate(${o.rot}deg)">
        ${o.type === 'text' ? `<span class="ov__t ov__t--${o.font}" style="color:${esc(o.color)}">${esc(o.text)}</span>` : `<img src="${esc(o.src || stickerURL(o.id))}" alt="" draggable="false">`}
        <button type="button" class="ovh ovh--del" data-h="del" aria-label="Remove">${ICON.close}</button>
        <span class="ovh ovh--rot" data-h="rot" aria-hidden="true">${ICON.rotate}</span>
        <span class="ovh ovh--size" data-h="size" aria-hidden="true">${ICON.resize}</span>
      </div>`).join('');
  }
  function addSticker(id, src) {
    B.overlay.push({ type: 'sticker', id, src, x: clamp(.5 + rand(-.18, .18), .15, .85), y: clamp(.25 + rand(0, .5), .1, .9), size: .3, rot: rand(-14, 14) });
    B.sel = B.overlay.length - 1; renderOverlay(); sound.play('pop');
  }
  function addText() {
    const inp = $('#t-text', root); const text = inp.value.trim();
    if (!text) { inp.focus(); toast('Type a word first.'); return; }
    B.overlay.push({ type: 'text', text, color: B.tcolor, font: B.tfont, x: .5, y: rand(.3, .7), size: .09, rot: rand(-8, 8) });
    inp.value = ''; B.sel = B.overlay.length - 1; renderOverlay(); sound.play('pop');
  }

  // overlay pointer handling: move / rotate / scale
  let drag = null;
  root.addEventListener('pointerdown', e => {
    const item = e.target.closest('.ov');
    if (!item) { if (B.sel >= 0 && e.target.closest('.overlay')) { B.sel = -1; renderOverlay(); } return; }
    const i = +item.dataset.i, o = B.overlay[i];
    const handle = e.target.closest('[data-h]');
    if (handle && handle.dataset.h === 'del') return;
    e.preventDefault();
    const box = $('#overlay', root).getBoundingClientRect();
    const cx = box.left + o.x * box.width, cy = box.top + o.y * box.height;
    drag = { i, mode: handle ? handle.dataset.h : 'move', box, x0: e.clientX, y0: e.clientY, ox: o.x, oy: o.y, size0: o.size, rot0: o.rot, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, id: e.pointerId };
    if (B.sel !== i) { B.sel = i; renderOverlay(); }
    const el = $(`.ov[data-i="${i}"]`, root); el.focus({ preventScroll: true });
    try { el.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
  });
  const onMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const o = B.overlay[drag.i];
    if (drag.mode === 'move') { o.x = clamp(drag.ox + (e.clientX - drag.x0) / drag.box.width, 0, 1); o.y = clamp(drag.oy + (e.clientY - drag.y0) / drag.box.height, 0, 1); }
    if (drag.mode === 'rot') { o.rot = drag.rot0 + (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) - drag.a0) * 180 / Math.PI; }
    if (drag.mode === 'size') { o.size = clamp(drag.size0 * Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) / drag.d0, .03, 1.2); }
    const el = $(`.ov[data-i="${drag.i}"]`, root);
    if (el) { el.style.left = o.x * 100 + '%'; el.style.top = o.y * 100 + '%'; el.style.setProperty('--s', o.size); el.style.transform = `translate(-50%,-50%) rotate(${o.rot}deg)`; }
  };
  const onUp = e => { if (drag && e.pointerId === drag.id) drag = null; };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  root.addEventListener('keydown', e => {
    const item = e.target.closest && e.target.closest('.ov');
    if (!item) return;
    const i = +item.dataset.i, o = B.overlay[i];
    const step = e.shiftKey ? .05 : .01;
    const k = e.key;
    if (k === 'ArrowLeft') o.x = clamp(o.x - step, 0, 1); else if (k === 'ArrowRight') o.x = clamp(o.x + step, 0, 1);
    else if (k === 'ArrowUp') o.y = clamp(o.y - step, 0, 1); else if (k === 'ArrowDown') o.y = clamp(o.y + step, 0, 1);
    else if (k === '+' || k === '=') o.size = clamp(o.size * 1.1, .03, 1.2); else if (k === '-') o.size = clamp(o.size / 1.1, .03, 1.2);
    else if (k === '[') o.rot -= 8; else if (k === ']') o.rot += 8;
    else if (k === 'Delete' || k === 'Backspace') { B.overlay.splice(i, 1); B.sel = -1; renderOverlay(); return; }
    else return;
    e.preventDefault(); B.sel = i; renderOverlay(); $(`.ov[data-i="${i}"]`, root).focus();
  });

  async function finalStrip(scale, type, quality) {
    await ensureFonts();
    const cv = await composeStrip(filtered(), B.frame, stripOpts(), scale);
    return new Promise(r => cv.toBlob(b => r({ blob: b, w: cv.width, h: cv.height }), type, quality));
  }
  async function doDownload() {
    if (B.busy) return; B.busy = true;
    try {
      const { blob } = await finalStrip(1.5, 'image/png');
      if (!blob) throw new Error('png');
      download(blob, `${CONFIG.SITE_NAME}-strip-${todayKey()}.png`);
      sound.play('win'); toast('Strip saved as PNG');
    } catch (e) { toast('The strip could not be saved. Try again, or remove custom stickers.', true); }
    B.busy = false;
  }
  async function doShare() {
    try {
      const { blob } = await finalStrip(1.5, 'image/png');
      const file = new File([blob], `${CONFIG.SITE_NAME}-strip.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'My photo strip' });
      else doDownload();
    } catch (e) { if (e && e.name !== 'AbortError') toast('Sharing did not work here. Use Download PNG.', true); }
  }
  async function doPublish(btn) {
    if (B.busy) return; B.busy = true; btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Posting…';
    try {
      const { blob, w, h: hh } = await finalStrip(.6, 'image/jpeg', .84);
      const url = await upload('wall', blob, 'jpg');
      const ww = B.frame === 'idcard' ? 420 : 230, wh = Math.round(ww * hh / w);
      await wall.add({ day: todayKey(), kind: 'strip', x: rand(300, WORLD.w - ww - 300), y: rand(120, Math.max(130, WORLD.h - wh - 80)), w: ww, h: wh, rot: rand(-7, 7), z: Math.floor(Date.now() / 1000) % 1e9, data: { src: url } });
      sound.play('win');
      btn.textContent = 'On the wall ✓';
      toast('Your strip is on today’s wall');
      const a = h(`<a class="btn btn--ink" href="#/wall">See it on the wall</a>`); btn.after(a);
      B.busy = false; return;
    } catch (e) { toast(e.message || 'Posting did not work. Try again.', true); btn.innerHTML = label; btn.disabled = false; }
    B.busy = false;
  }

  root.addEventListener('click', e => {
    const t = e.target;
    const f = t.closest('[data-filter]'); if (f) { B.filter = f.dataset.filter; sound.play('click'); renderPanel(); if (B.raw.length) renderSlots(); return; }
    const fr = t.closest('[data-frame]'); if (fr) { B.frame = fr.dataset.frame; sound.play('click'); renderPanel(); return; }
    const ef = t.closest('[data-efilter]'); if (ef) { B.filter = ef.dataset.efilter; $$('[data-efilter]', root).forEach(b => b.setAttribute('aria-checked', String(b === ef))); sound.play('click'); recompose(); renderSlots(); return; }
    const efr = t.closest('[data-eframe]'); if (efr) {
      B.frame = efr.dataset.eframe; $$('[data-eframe]', root).forEach(b => b.setAttribute('aria-checked', String(b === efr)));
      const lab = $('label[for="caption"]', root); if (lab) lab.textContent = B.frame === 'idcard' ? 'Name on the card' : 'Caption';
      sound.play('click'); recompose(); return;
    }
    const st = t.closest('[data-sticker]'); if (st) { addSticker(st.dataset.sticker, st.dataset.src || ''); return; }
    const tc = t.closest('[data-tcolor]'); if (tc) { B.tcolor = tc.dataset.tcolor; $$('[data-tcolor]', root).forEach(b => b.setAttribute('aria-checked', String(b === tc))); return; }
    const tf = t.closest('[data-tfont]'); if (tf) { B.tfont = tf.dataset.tfont; $$('[data-tfont]', root).forEach(b => b.setAttribute('aria-checked', String(b === tf))); return; }
    const hd = t.closest('[data-h="del"]'); if (hd) { const i = +hd.closest('.ov').dataset.i; B.overlay.splice(i, 1); B.sel = -1; renderOverlay(); sound.play('paper'); return; }
    const a = t.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'camera': startCamera(); break;
      case 'shoot': shoot(); break;
      case 'flip': B.facing = B.facing === 'user' ? 'environment' : 'user'; B.mirror = B.facing === 'user'; startCamera(); break;
      case 'addtext': addText(); break;
      case 'download': doDownload(); break;
      case 'share': doShare(); break;
      case 'publish': doPublish(a); break;
      case 'retake':
        B.raw = []; B.overlay = []; B.sel = -1; B.stage = 'idle';
        $('#editor', root).hidden = true; $('.booth', root).hidden = false; renderSlots(); renderPanel(); renderIdle();
        startCamera(); break;
    }
  });
  const onResize = () => sizeOverlay();
  window.addEventListener('resize', onResize);

  renderPanel(); renderIdle(); renderSlots();
  if (!engine.ok) toast('This browser has no WebGL, so filters are simplified.');

  return () => {
    alive = false; stopCamera();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('resize', onResize);
  };
}
