import {
  type DocsCollection,
  defineConfig,
  defineDocs,
  type frontmatterSchema,
  type metaSchema,
} from "fumadocs-mdx/config";

// Explicit annotation: pnpm's isolated node_modules makes the inferred
// zod-based type non-portable for declaration emit.
export const docs: DocsCollection<typeof frontmatterSchema, typeof metaSchema> =
  defineDocs({
    dir: "content/docs",
  });

export default defineConfig();
