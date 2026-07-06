const CLI_LINES = [
  "$ ./origin.sh --boot",
  "loading memory modules .......... ok",
  "mounting curiosity drive ........ ok",
  "scanning childhood artifacts .... 3 found",
  "",
  "> first computer: Pentium II tower",
  "> first ISP: AOL (free trial disc)",
  "> first website: hand-coded HTML",
  "",
  "status: ready for portfolio 2.0"
];

export class HUDController {
  constructor() {
    this.titleEl = document.getElementById("vignette-title");
    this.subtitleEl = document.getElementById("vignette-subtitle");
    this.progressEl = document.getElementById("scroll-progress");
    this.terminalPanel = document.getElementById("terminal-panel");
    this.terminalOutput = document.getElementById("terminal-output");
    this.terminalRun = document.getElementById("terminal-run");
    this._typingTimer = null;

    this.terminalRun?.addEventListener("click", () => this.runTerminalSequence());
  }

  setVignette(meta) {
    if (this.titleEl) this.titleEl.textContent = meta.title;
    if (this.subtitleEl) this.subtitleEl.textContent = meta.subtitle;
  }

  setProgress(progress) {
    if (this.progressEl) {
      this.progressEl.style.width = `${Math.round(progress * 100)}%`;
    }
  }

  showTerminal(forceRun = false) {
    if (!this.terminalPanel) return;
    this.terminalPanel.hidden = false;
    if (forceRun || !this.terminalOutput?.textContent) {
      this.runTerminalSequence();
    }
  }

  hideTerminal() {
    if (this.terminalPanel) this.terminalPanel.hidden = true;
  }

  runTerminalSequence() {
    if (!this.terminalOutput) return;
    window.clearInterval(this._typingTimer);
    this.terminalOutput.textContent = "";
    let lineIndex = 0;
    let charIndex = 0;

    this._typingTimer = window.setInterval(() => {
      const line = CLI_LINES[lineIndex] ?? "";
      this.terminalOutput.textContent += line.charAt(charIndex);
      charIndex += 1;
      if (charIndex >= line.length) {
        this.terminalOutput.textContent += "\n";
        lineIndex += 1;
        charIndex = 0;
      }
      if (lineIndex >= CLI_LINES.length) {
        window.clearInterval(this._typingTimer);
      }
    }, 18);
  }
}
