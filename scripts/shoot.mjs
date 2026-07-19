// Design QA gate (DESIGN.md §9): screenshot every surface in light + dark
// (+ optional reduced-motion) into .shots/ for diffing against the dated
// baseline. Servers expected: site :4101, app :4102, docs :4103.
// Usage: node scripts/shoot.mjs [outDir] [--reduced-motion] [--width=1280]
/* global document, window */ // page.evaluate bodies run in the browser
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv
  .slice(2)
  .filter((a) => a !== "--reduced-motion" && !a.startsWith("--width"));
const reducedMotion = process.argv.includes("--reduced-motion");
const widthArg = process.argv.find((a) => a.startsWith("--width="));
const width = widthArg ? Number(widthArg.split("=")[1]) : 1280;
const OUT = resolve(args[0] ?? ".shots/current");
mkdirSync(OUT, { recursive: true });

const targets = [
  ["site-landing", "http://localhost:4101/"],
  ["app-marketplace", "http://localhost:4102/"],
  ["app-composer", "http://localhost:4102/composer"],
  ["app-scan", "http://localhost:4102/scan"],
  ["app-stats", "http://localhost:4102/stats"],
  ["app-add-api", "http://localhost:4102/add-api"],
  ["app-manage", "http://localhost:4102/manage"],
  ["app-ops", "http://localhost:4102/ops/listings"],
  ["docs-home", "http://localhost:4103/"],
];

async function reachable(url) {
  try {
    await fetch(new URL(url).origin, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

const live = [];
for (const target of targets) {
  if (await reachable(target[1])) live.push(target);
  else console.log(`skip ${target[0]}: server not running`);
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    // Browser binaries are not downloaded at install; use system Chrome.
    return chromium.launch({ channel: "chrome" });
  }
}

const browser = await launch();
let failures = 0;
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: scheme,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  for (const [name, url] of live) {
    const suffix = `${scheme}${reducedMotion ? "-rm" : ""}-${width}`;
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(1000);
      // Walk the page so lazily observed content settles before capture.
      await page.evaluate(async () => {
        for (let y = 0; y <= document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((done) => setTimeout(done, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `${OUT}/${name}-${suffix}.png`,
        fullPage: true,
      });
      console.log(`ok ${name}-${suffix}`);
    } catch (error) {
      failures += 1;
      const message = String(error?.message ?? error).split("\n")[0];
      console.log(`FAIL ${name}-${suffix}: ${message}`);
    }
  }
  await ctx.close();
}
await browser.close();
process.exit(failures > 0 ? 1 : 0);
