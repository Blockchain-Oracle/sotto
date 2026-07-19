import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The product reads everything from the Sotto API at request time in the
  // browser; pages themselves are static shells around client data views.
  poweredByHeader: false,
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
};

export default nextConfig;
