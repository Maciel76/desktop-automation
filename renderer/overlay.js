const api = window.overlayAPI;

const crosshairH  = document.getElementById('crosshair-h');
const crosshairV  = document.getElementById('crosshair-v');
const cursorDot   = document.getElementById('cursor-dot');
const coordsTip   = document.getElementById('coords-tip');
const btnCancel   = document.getElementById('btn-cancel');

let lastX = 0;
let lastY = 0;
let picking = true;

// ── Track mouse position ─────────────────────────────────────────────────────
window.addEventListener('mousemove', (e) => {
  lastX = e.clientX;
  lastY = e.clientY;

  // Crosshair lines
  crosshairH.style.top  = e.clientY + 'px';
  crosshairV.style.left = e.clientX + 'px';

  // Dot
  cursorDot.style.left = e.clientX + 'px';
  cursorDot.style.top  = e.clientY + 'px';

  // Coordinates tooltip — offset so it doesn't cover the cursor
  const offsetX = e.clientX + 20;
  const offsetY = e.clientY + 20;
  const tipW = 140;
  const tipH = 32;
  const finalX = (offsetX + tipW > window.innerWidth)  ? e.clientX - tipW - 14 : offsetX;
  const finalY = (offsetY + tipH > window.innerHeight) ? e.clientY - tipH - 14 : offsetY;
  coordsTip.style.left = finalX + 'px';
  coordsTip.style.top  = finalY + 'px';

  // We show the screen coords asynchronously but update display from mousemove
  // for smoothness — the actual capture uses getCursorPosition() on click
  coordsTip.textContent = `X: ${e.screenX}   Y: ${e.screenY}`;
});

// ── Click to pick ────────────────────────────────────────────────────────────
window.addEventListener('click', async (e) => {
  // Ignore clicks on the cancel button (handled separately)
  if (e.target === btnCancel) return;
  if (!picking) return;
  picking = false;

  // Flash feedback
  document.body.classList.add('flash');

  try {
    // Get precise screen coordinates from main process (handles DPI scaling)
    const coords = await api.getCursorPosition();
    await api.done(coords);
  } catch {
    await api.done({ x: e.screenX, y: e.screenY });
  }
}, { once: false });

// ── Cancel ───────────────────────────────────────────────────────────────────
btnCancel.addEventListener('click', async () => {
  picking = false;
  await api.cancel();
});

window.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    picking = false;
    await api.cancel();
  }
});
