import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The marketing surface is fully static (every page is SSG), served by
  // `next start` in the container — the same uniform deploy model as the app
  // and docs. (`output: "export"` is incompatible with `next start`, which is
  // how every Sotto Next service boots under Nixpacks.)
  poweredByHeader: false,
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
};

export default nextConfig;
