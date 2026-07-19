/**
 * Build-time access to the Sotto Voce tokens for surfaces that cannot use
 * CSS custom properties (theme-color metadata, the Open Graph image, the
 * favicon). Values are read from @sotto/ui/theme.css — the only file in
 * the repository allowed to contain raw hex — never restated here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Resolved on plain fs at build time (bundler-neutral): the package's own
// export map names the theme.css target, so this never hardcodes @sotto/ui
// internals.
const uiRoot = join(process.cwd(), "node_modules", "@sotto", "ui");
const uiExports = (
  JSON.parse(readFileSync(join(uiRoot, "package.json"), "utf8")) as {
    exports: Record<string, string | Record<string, string>>;
  }
).exports;
const themeCssTarget = uiExports["./theme.css"];
if (typeof themeCssTarget !== "string") {
  throw new Error("@sotto/ui does not export ./theme.css");
}
const themeCss = readFileSync(join(uiRoot, themeCssTarget), "utf8");

function block(selector: string): string {
  const start = themeCss.indexOf(selector);
  if (start === -1) throw new Error(`theme.css block missing: ${selector}`);
  const open = themeCss.indexOf("{", start);
  const close = themeCss.indexOf("}", open);
  return themeCss.slice(open + 1, close);
}

function token(blockCss: string, name: string): string {
  const match = blockCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`theme.css token missing: --${name}`);
  return match[1].trim();
}

const carta = block(":root");
const notte = block('[data-theme="dark"]');

export type ThemeTokens = Readonly<{
  canvas: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  lapis: string;
  verde: string;
  ametista: string;
  ambra: string;
}>;

function readTheme(source: string): ThemeTokens {
  return {
    canvas: token(source, "canvas"),
    surface: token(source, "surface"),
    ink: token(source, "ink"),
    muted: token(source, "muted"),
    line: token(source, "line"),
    lapis: token(source, "lapis"),
    verde: token(source, "verde"),
    ametista: token(source, "ametista"),
    ambra: token(source, "ambra"),
  };
}

export const cartaTokens: ThemeTokens = readTheme(carta);
export const notteTokens: ThemeTokens = readTheme(notte);
