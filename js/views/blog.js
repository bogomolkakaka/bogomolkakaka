// «Из спора в блог»: a separate comic walk-through game, apart from the Games tab.
// The game itself is a standalone page in blog/index.html; here it opens inside the studio,
// so the taskbar and the CD player keep working while you play.
export function mount(root) {
  root.innerHTML = `<style>
      .view--blog { animation: none; }
      .blogframe { display: block; width: 100%; border: 0; background: #ECECEC;
        height: calc(100vh - var(--bar) - env(safe-area-inset-bottom));
        height: calc(100dvh - var(--bar) - env(safe-area-inset-bottom)); }
    </style>
    <iframe class="blogframe" src="blog/index.html" title="Из спора в блог: бродилка в пяти кадрах" allow="autoplay; fullscreen"></iframe>`;
  const frame = root.querySelector('iframe');
  frame.addEventListener('load', () => { try { frame.contentWindow.focus(); } catch (_) {} });
  return () => { root.innerHTML = ''; };
}
