const api = window.overlayAPI;

const coordsEl = document.getElementById('coords');
const btnConfirm = document.getElementById('btn-confirm');
const btnCancel = document.getElementById('btn-cancel');

let currentCoords = { x: 0, y: 0 };
let pollInterval = null;
let confirmed = false;

// Poll cursor position every 50ms — no transparent overlay needed.
// The user moves the mouse, watches the live X/Y, then clicks Confirmar.
async function pollCoords() {
  try {
    const c = await api.getCursorPosition();
    currentCoords = c;
    coordsEl.textContent = `X: ${c.x}   Y: ${c.y}`;
  } catch {
    // ignore transient errors
  }
}

pollInterval = setInterval(pollCoords, 50);
pollCoords();

async function confirm() {
  if (confirmed) return;
  confirmed = true;
  clearInterval(pollInterval);
  btnConfirm.disabled = true;
  btnConfirm.textContent = '⏳ Salvando...';
  try {
    // Refresh coords one last time right before confirming
    const c = await api.getCursorPosition();
    currentCoords = c;
  } catch { /* use last polled value */ }
  await api.done(currentCoords);
}

async function cancel() {
  if (confirmed) return;
  confirmed = true;
  clearInterval(pollInterval);
  await api.cancel();
}

btnConfirm.addEventListener('click', confirm);
btnCancel.addEventListener('click', cancel);

window.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') await cancel();
  if (e.key === 'Enter') await confirm();
});
