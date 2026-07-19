const WHITESPACE = /[\t\n\r ]/u;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

class StrictJsonScanner {
  private index = 0;
  private nodes = 0;

  constructor(
    private readonly source: string,
    private readonly maximumDepth: number,
    private readonly maximumNodes: number,
  ) {}

  scan(): void {
    this.value(0);
    this.space();
    if (this.index !== this.source.length) this.invalid();
  }

  private value(depth: number): void {
    if (depth > this.maximumDepth || ++this.nodes > this.maximumNodes) {
      throw new Error("JSON exceeds structural limits");
    }
    this.space();
    const token = this.source[this.index];
    if (token === "{") return this.object(depth + 1);
    if (token === "[") return this.array(depth + 1);
    if (token === '"') return void this.string();
    if (token === "t") return this.literal("true");
    if (token === "f") return this.literal("false");
    if (token === "n") return this.literal("null");
    NUMBER.lastIndex = this.index;
    const match = NUMBER.exec(this.source);
    if (match) {
      this.index = NUMBER.lastIndex;
      return;
    }
    this.invalid();
  }

  private object(depth: number): void {
    this.index++;
    this.space();
    if (this.take("}")) return;
    const keys = new Set<string>();
    while (true) {
      this.space();
      if (this.source[this.index] !== '"') this.invalid();
      const key = this.string();
      if (keys.has(key)) throw new Error("duplicate JSON key");
      keys.add(key);
      this.space();
      if (!this.take(":")) this.invalid();
      this.value(depth);
      this.space();
      if (this.take("}")) return;
      if (!this.take(",")) this.invalid();
    }
  }

  private array(depth: number): void {
    this.index++;
    this.space();
    if (this.take("]")) return;
    while (true) {
      this.value(depth);
      this.space();
      if (this.take("]")) return;
      if (!this.take(",")) this.invalid();
    }
  }

  private string(): string {
    const start = this.index++;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index++);
      if (code === 0x22) {
        try {
          return JSON.parse(this.source.slice(start, this.index)) as string;
        } catch {
          this.invalid();
        }
      }
      if (code < 0x20) this.invalid();
      if (code === 0x5c) {
        const escape = this.source[this.index++];
        if (escape === "u") {
          if (
            !/^[a-fA-F0-9]{4}$/u.test(
              this.source.slice(this.index, this.index + 4),
            )
          ) {
            this.invalid();
          }
          this.index += 4;
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) {
          this.invalid();
        }
      }
    }
    this.invalid();
  }

  private literal(value: string): void {
    if (!this.source.startsWith(value, this.index)) this.invalid();
    this.index += value.length;
  }

  private space(): void {
    while (WHITESPACE.test(this.source[this.index] ?? "")) this.index++;
  }

  private take(value: string): boolean {
    if (this.source[this.index] !== value) return false;
    this.index++;
    return true;
  }

  private invalid(): never {
    throw new Error("JSON is not strict");
  }
}

export function assertStrictJson(
  source: string,
  maximumDepth = 32,
  maximumNodes = 1_024,
): void {
  new StrictJsonScanner(source, maximumDepth, maximumNodes).scan();
}
