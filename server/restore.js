const { exec } = require('child_process');

/**
 * Launch Ghostty and resume a Claude Code session
 */
function restoreSession(sessionId, cwd) {
  return new Promise((resolve, reject) => {
    // AppleScript to open Ghostty, create a new window, cd to project dir, resume session
    const script = `
      tell application "Ghostty"
        activate
      end tell
      delay 0.5
      tell application "System Events"
        tell process "Ghostty"
          keystroke "n" using command down
          delay 0.3
          keystroke "cd ${cwd.replace(/"/g, '\\"')} && claude --resume ${sessionId}"
          key code 36
        end tell
      end tell
    `;

    exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Failed to restore session: ${err.message}`));
      } else {
        resolve({ success: true, sessionId, cwd });
      }
    });
  });
}

module.exports = { restoreSession };
