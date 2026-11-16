// Bound both history and partial human-readable frames, including malformed input.
export class SerialLogBuffer {
  private history: string[] = [];
  private frameLines: string[] = [];
  private latestLine = "";
  private latestFrame = "";
  private version = 0;
  append(line: string) {
    this.latestLine = line;
    this.history.push(line);
    if (this.history.length > 200) this.history.shift();
    if (this.frameLines[this.frameLines.length - 1] !== line) this.frameLines.push(line);
    if (this.frameLines.length > 200) this.frameLines.shift();
    if (line.includes("{") && line.includes("}")) {
      this.latestFrame = this.frameLines.join("\n"); this.frameLines = [];
    }
    this.version++;
  }
  readFrame() {
    const frame = this.latestFrame || this.latestLine;
    this.latestFrame = "";
    return frame;
  }
  readHistory(sinceVersion = -1) { return sinceVersion === this.version ? null : { version: this.version, lines: [...this.history] }; }
  clearHistory() { this.history = []; this.version++; }
  clear() { this.clearHistory(); this.frameLines = []; this.latestLine = ""; this.latestFrame = ""; }
}
