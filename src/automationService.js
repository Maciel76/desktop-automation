const { spawnSync } = require('child_process');

// Maps friendly key names to SendKeys format
const KEY_MAP = {
  F1: '{F1}', F2: '{F2}', F3: '{F3}', F4: '{F4}',
  F5: '{F5}', F6: '{F6}', F7: '{F7}', F8: '{F8}',
  F9: '{F9}', F10: '{F10}', F11: '{F11}', F12: '{F12}',
  ENTER: '{ENTER}', TAB: '{TAB}', ESC: '{ESC}',
  SPACE: ' ', BACKSPACE: '{BACKSPACE}', DELETE: '{DELETE}',
  HOME: '{HOME}', END: '{END}', INSERT: '{INSERT}',
  PAGEUP: '{PGUP}', PAGEDOWN: '{PGDN}',
};

function toSendKeysFormat(key) {
  if (!key) return '{F5}';
  const upper = key.toUpperCase().trim();
  return KEY_MAP[upper] || `{${upper}}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes PowerShell automation:
 * 1. Move mouse to (x, y) and click
 * 2. Ctrl+A + Backspace to clear field
 * 3. Paste text via clipboard (Ctrl+V)
 * 4. Press configured key
 */
async function executeAutomation(codigo, config) {
  const {
    mouseX = 500,
    mouseY = 300,
    clickDelay = 200,
    clearDelay = 100,
    typeDelay = 200,
    keyAfterType = 'F5',
  } = config;

  const sendKey = toSendKeysFormat(keyAfterType);

  // Escape double quotes in codigo for PowerShell
  const safeCode = String(codigo).replace(/"/g, '""').replace(/'/g, "''");

  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Utils {
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, int dx, int dy, uint cButtons, IntPtr dwExtraInfo);
}
"@
Add-Type -AssemblyName System.Windows.Forms

# Move mouse and click
[Win32Utils]::SetCursorPos(${mouseX}, ${mouseY})
Start-Sleep -Milliseconds 100
[Win32Utils]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
[Win32Utils]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds ${clickDelay}

# Clear field
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 50
[System.Windows.Forms.SendKeys]::SendWait("{BACKSPACE}")
Start-Sleep -Milliseconds ${clearDelay}

# Type via clipboard to avoid character escaping issues
[System.Windows.Forms.Clipboard]::SetText("${safeCode}")
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds ${typeDelay}

# Press configured key
[System.Windows.Forms.SendKeys]::SendWait("${sendKey}")
`;

  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle', 'Hidden',
    '-Command', psScript,
  ], {
    encoding: 'utf8',
    timeout: 15000,
  });

  if (result.error) {
    throw new Error(`Erro ao executar PowerShell: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const errMsg = result.stderr || result.stdout || 'Erro desconhecido no PowerShell';
    throw new Error(`PowerShell falhou (código ${result.status}): ${errMsg.slice(0, 300)}`);
  }

  await delay(100);
}

module.exports = { executeAutomation, toSendKeysFormat };
