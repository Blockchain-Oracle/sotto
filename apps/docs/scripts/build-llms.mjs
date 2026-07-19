// Generates llms.txt (index) and llms-full.txt (all content) from
// content/docs so AI agents can consume the documentation directly.
// Runs after `next build` (see the package build script).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const contentDir = path.join(root, "content/docs");
const site = process.env.NEXT_PUBLIC_DOCS_ORIGIN ?? "https://docs.usesotto.xyz";

const pages = [];
for await (const entry of glob("**/*.mdx", { cwd: contentDir })) {
  const raw = readFileSync(path.join(contentDir, entry), "utf8");
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/u);
  const title = fm?.[1].match(/^title:\s*(.+)$/mu)?.[1] ?? entry;
  const description = fm?.[1].match(/^description:\s*(.+)$/mu)?.[1] ?? "";
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/u, "").trim();
  const slug = entry.replace(/\.mdx$/u, "").replace(/(^|\/)index$/u, "");
  const url = `${site}/docs${slug ? `/${slug}` : ""}`;
  pages.push({ body, description, entry, title, url });
}
pages.sort((a, b) => a.entry.localeCompare(b.entry));

const index = [
  "# Sotto",
  "",
  "> The marketplace, execution surface, and evidence layer for x402-paid " +
    "APIs on Canton. Exact human-approved paid calls, settled on Five North " +
    "Canton DevNet with public explorer evidence; settlement and delivery " +
    "always recorded separately. DevNet only — no production claim.",
  "",
  "## Docs",
  "",
  ...pages.map((page) => `- [${page.title}](${page.url}): ${page.description}`),
].join("\n");

const full = pages
  .map(
    (page) =>
      `# ${page.title}\nURL: ${page.url}\n${page.description}\n\n${page.body}`,
  )
  .join("\n\n---\n\n");

for (const dir of ["public", ".next/static"]) {
  const target = path.join(root, dir);
  if (!existsSync(target)) continue;
  writeFileSync(path.join(target, "llms.txt"), `${index}\n`);
  writeFileSync(path.join(target, "llms-full.txt"), `${full}\n`);
}

console.log(`llms.txt: ${pages.length} pages indexed`);
