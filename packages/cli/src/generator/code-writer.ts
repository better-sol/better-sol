// ── CodeWriter: clean, indentation-aware Rust source generation ──

export class CodeWriter {
  readonly lines: string[] = [];
  private depth = 0;

  line(text = ""): this {
    this.lines.push("    ".repeat(this.depth) + text);
    return this;
  }

  blank(): this {
    this.lines.push("");
    return this;
  }

  block(header: string, fn: () => void): this {
    this.line(header + " {");
    this.depth++;
    fn();
    this.depth--;
    this.line("}");
    return this;
  }

  indent(level: number): this {
    this.depth = level;
    return this;
  }

  toString(): string {
    return this.lines.join("\n") + "\n";
  }
}
