const api = window.overlayAPI;

const crosshairH = document.getElementById("crosshair-h");
const crosshairV = document.getElementById("crosshair-v");
const cursorDot = document.getElementById("cursor-dot");
const coordsTip = document.getElementById("coords-tip");
const btnCancel = document.getElementById("btn-cancel");

let lastX = 0;
let lastY = 0;
let picking = true;

// Request focus as soon as the page loads — helps Windows route input here
window.focus();
document.body.focus();

// ── Track mouse position ─────────────────────────────────────────────────────
window.addEventListener("mousemove", (e) => {
  lastX = e.clientX;
  lastY = e.clientY;

  // Crosshair lines
  crosshairH.style.top = e.clientY + "px";
  crosshairV.style.left = e.clientX + "px";

  // Dot
  cursorDot.style.left = e.clientX + "px";
  cursorDot.style.top = e.clientY + "px";

  // Coordinates tooltip — offset so it doesn't cover the cursor
  const offsetX = e.clientX + 20;
  const offsetY = e.clientY + 20;
  const tipW = 140;
  const tipH = 32;
  const finalX =
    offsetX + tipW > window.innerWidth ? e.clientX - tipW - 14 : offsetX;
  const finalY =
    offsetY + tipH > window.innerHeight ? e.clientY - tipH - 14 : offsetY;
  coordsTip.style.left = finalX + "px";
  coordsTip.style.top = finalY + "px";

  coordsTip.textContent = `X: ${e.screenX}   Y: ${e.screenY}`;
});

// ── Click to pick ─────────────────────────────────────────────────────────────
// Use mousedown (not click) — on transparent Windows windows, the mousedown/mouseup
// pair can be split between windows, preventing 'click' from ever firing.
window.addEventListener("mousedown", async (e) => {
  // Only left button; ignore the cancel button
  if (e.button !== 0) return;
  if (e.target === btnCancel) return;
  if (!picking) return;
  picking = false;

  // Flash feedback
  document.body.classList.add("flash");

  // Always close overlay; fall back through multiple strategies
  try {
    const coords = await api.getCursorPosition();
    await api.done(coords);
  } catch {
    try {
      await api.done({ x: e.screenX, y: e.screenY });
    } catch {
      try {
        await api.cancel();
      } catch {
        /* overlay will be closed by globalShortcut or manually */
      }
    }
  }
});

// ── Cancel button ─────────────────────────────────────────────────────────────
btnCancel.addEventListener("mousedown", async (e) => {
  e.stopPropagation();
  picking = false;
  try {
    await api.cancel();
  } catch {
    /* globalShortcut ESC is fallback */
  }
});

// ── ESC key (renderer-side, works when window has focus) ─────────────────────
window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    picking = false;
    try {
      await api.cancel();
    } catch {
      /* globalShortcut ESC is fallback */
    }
  }
});

window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    picking = false;
    await api.cancel();
  }
});
