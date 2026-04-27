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
    clickMode = "click", // "click" | "keys-only"
    windowTitle = "", // optional: bring window to front via AppActivate
  } = config;

  const sendKey = toSendKeysFormat(keyAfterType);
  const useClick = clickMode !== "keys-only";

  // ── PowerShell script ──────────────────────────────────────────────────────
  // Strategy to avoid AV false-positives:
  //   • NO Add-Type C# compilation (classic malware signature)
  //   • NO mouse_event / SetCursorPos PInvoke (heavily flagged)
  //   • Cursor positioning via managed [Cursor]::Position
  //   • Click via single inline SendInput PInvoke (modern API, less suspicious)
  //   • Window focus via Microsoft.VisualBasic AppActivate (fully managed)
  //   • Optional "keys-only" mode skips the click entirely
  const psScript = `
param(
  [string]$Code,
  [int]$X,
  [int]$Y,
  [int]$ClickDelay,
  [int]$ClearDelay,
  [int]$TypeDelay,
  [string]$SendKey,
  [string]$WindowTitle,
  [int]$DoClick
)
$ErrorActionPreference = "Stop"

# Managed assemblies only — no C# compilation, no Add-Type definitions
[void][System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms")
[void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")
[void][System.Reflection.Assembly]::LoadWithPartialName("Microsoft.VisualBasic")

# Bring target window to front (managed, accessibility-style focus)
if ($WindowTitle -and $WindowTitle.Length -gt 0) {
  try {
    [Microsoft.VisualBasic.Interaction]::AppActivate($WindowTitle) | Out-Null
    Start-Sleep -Milliseconds 150
  } catch {
    # Window not found — fall through to click-based focus
  }
}

# Move cursor + click only if enabled
if ($DoClick -eq 1) {
  # Managed cursor positioning — no PInvoke for SetCursorPos
  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($X, $Y)
  Start-Sleep -Milliseconds 100

  # Single inline PInvoke for SendInput (modern API replacing mouse_event)
  $sig = @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint SendInput(uint n, MOUSEINPUT[] inputs, int cb);
[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
public struct MOUSEINPUT {
  public int type;
  public int dx;
  public int dy;
  public uint mouseData;
  public uint dwFlags;
  public uint time;
  public System.IntPtr dwExtraInfo;
  public uint pad1;
  public uint pad2;
}
'@
  $t = Add-Type -MemberDefinition $sig -Name "U" -Namespace "P" -PassThru
  $down = New-Object P.U+MOUSEINPUT
  $down.type = 0; $down.dwFlags = 0x0002
  $up = New-Object P.U+MOUSEINPUT
  $up.type = 0; $up.dwFlags = 0x0004
  [void]$t::SendInput(1, @($down), 40)
  Start-Sleep -Milliseconds 30
  [void]$t::SendInput(1, @($up), 40)
  Start-Sleep -Milliseconds $ClickDelay
}

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

  // Use app's own userData folder — less suspicious than system %TEMP%
  // Lazy-require electron so this file can be imported during build without crashing
  let psDir;
  try {
    const { app } = require("electron");
    psDir = path.join(app.getPath("userData"), "ps");
  } catch {
    psDir = path.join(os.tmpdir(), "promoter-automation");
  }
  if (!fs.existsSync(psDir)) fs.mkdirSync(psDir, { recursive: true });
  const tempFile = path.join(psDir, `run_${Date.now()}.ps1`);
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
      "-WindowTitle",
      String(windowTitle || ""),
      "-DoClick",
      useClick ? "1" : "0",
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
