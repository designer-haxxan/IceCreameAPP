// Small celebration effects: confetti after a sale and a floating "+1" when a menu item is tapped.
// Everything is skipped when the user has asked the system for reduced motion.

const COLORS = ['#db2777', '#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#ffffff'];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function celebrate(count = 54) {
  if (reduceMotion()) return;
  const host = document.createElement('div');
  host.className = 'confetti';
  host.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = COLORS[i % COLORS.length];
    piece.style.animationDelay = `${(Math.random() * 0.3).toFixed(2)}s`;
    piece.style.animationDuration = `${(1.6 + Math.random() * 1.1).toFixed(2)}s`;
    piece.style.setProperty('--drift', `${(Math.random() * 160 - 80).toFixed(0)}px`);
    if (i % 3 === 0) piece.style.borderRadius = '50%';
    host.appendChild(piece);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 3200);
}

export function floatText(anchor, text) {
  if (reduceMotion() || !anchor) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'float-plus';
  el.textContent = text;
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top + r.height * 0.3}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// Restart a CSS animation class on an element (e.g. a "tap" bounce on a product tile).
export function pulse(el, cls = 'pop') {
  if (!el || reduceMotion()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
