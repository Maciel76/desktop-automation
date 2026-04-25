const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

// Maps friendly key names to SendKeys format
const KEY_MAP = {
  F1: "{F1}",
  F2: "{F2}",
  F3: "{F3}",
  F4: "{F4}",
  F5: "{F5}",
  F6: "{F6}",
  F7: "{F7}",
  F8: "{F8}",
  F9: "{F9}",
  F10: "{F10}",
  F11: "{F11}",
  F12: "{F12}",
  ENTER: "{ENTER}",
  TAB: "{TAB}",
  ESC: "{ESC}",
  SPACE: " ",
  BACKSPACE: "{BACKSPACE}",
  DELETE: "{DELETE}",
  HOME: "{HOME}",
  END: "{END}",
  INSERT: "{INSERT}",
  PAGEUP: "{PGUP}",
  PAGEDOWN: "{PGDN}",
};

function toSendKeysFormat(key) {
  if (!key) return "{F5}";
  const upper = key.toUpperCase().trim();
  return KEY_MAP[upper] || `{${upper}}`;
}

/**
 * Executes PowerShell automation:
 * 1. Move mouse to (x, y) and click
 * 2. Ctrl+A + Backspace to clear field
 * 3. Paste text via clipboard (Ctrl+V)
 * 4. Press configured key
 *
 * Uses a temp .ps1 file to avoid command-line length limits and
 * PowerShell string-interpolation issues (e.g. $ in product codes).
 * Uses async spawn to avoid blocking the Electron main thread.
 */
async function executeAutomation(codigo, config) {
  const {
    mouseX = 500,
    mouseY = 300,
    clickDelay = 200,
    clearDelay = 100,
    typeDelay = 200,
    keyAfterType = "F5",
  } = config;

  const sendKey = toSendKeysFormat(keyAfterType);

  // Script uses param block — code is passed as a separate argument,
  // so no string-interpolation or escaping issues regardless of content.
  const psScript = `
param(
  [string]$Code,
  [int]$X,
  [int]$Y,
  [int]$ClickDelay,
  [int]$ClearDelay,
  [int]$TypeDelay,
  [string]$SendKey
)

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
[Win32Utils]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 100
[Win32Utils]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
[Win32Utils]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds $ClickDelay

# Clear field
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 50
[System.Windows.Forms.SendKeys]::SendWait("{BACKSPACE}")
Start-Sleep -Milliseconds $ClearDelay

# Paste via clipboard — code passed as param, safe for any content
[System.Windows.Forms.Clipboard]::SetText($Code)
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds $TypeDelay

# Press configured key
[System.Windows.Forms.SendKeys]::SendWait($SendKey)
`;

  const tempFile = path.join(
    os.tmpdir(),
    `automation_${process.pid}_${Date.now()}.ps1`,
  );
  fs.writeFileSync(tempFile, psScript, "utf8");

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, val) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        fn(val);
      }
    };

    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      tempFile,
      "-Code",
      String(codigo),
      "-X",
      String(mouseX),
      "-Y",
      String(mouseY),
      "-ClickDelay",
      String(clickDelay),
      "-ClearDelay",
      String(clearDelay),
      "-TypeDelay",
      String(typeDelay),
      "-SendKey",
      sendKey,
    ]);

    let stderr = "";
    ps.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    ps.on("close", (code) => {
      try {
        fs.unlinkSync(tempFile);
      } catch {
        /* ignore cleanup errors */
      }
      if (code !== 0) {
        settle(
          reject,
          new Error(
            `PowerShell falhou (código ${code}): ${(stderr || "Erro desconhecido").slice(0, 300)}`,
          ),
        );
      } else {
        settle(resolve, undefined);
      }
    });

    ps.on("error", (err) => {
      try {
        fs.unlinkSync(tempFile);
      } catch {
        /* ignore */
      }
      settle(reject, new Error(`Erro ao executar PowerShell: ${err.message}`));
    });

    const timer = setTimeout(() => {
      ps.kill();
      try {
        fs.unlinkSync(tempFile);
      } catch {
        /* ignore */
      }
      settle(reject, new Error("PowerShell timeout após 15 segundos"));
    }, 15000);
  });
}

module.exports = { executeAutomation, toSendKeysFormat };
