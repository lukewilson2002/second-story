import type { NextConfig } from "next";

// scripts/isolated-server.ts sets these two so a second server (Playwright, or another agent's dev server)
// gets its own build folder and its own throwaway tsconfig. Next.js rewrites the tsconfig it is given to
// add the build folder's types, and that must not touch the shared tsconfig.json.
const isolatedDistDir = process.env.NEXT_DIST_DIR;
const isolatedTsconfig = process.env.NEXT_TSCONFIG_PATH;

const nextConfig: NextConfig = {
  ...(isolatedDistDir ? { distDir: isolatedDistDir } : {}),
  ...(isolatedTsconfig
    ? // `pnpm typecheck` is the type gate. Skipping it here keeps isolated builds fast.
      { typescript: { tsconfigPath: isolatedTsconfig, ignoreBuildErrors: true } }
    : {}),
  // PGlite loads its WebAssembly and data files from its own folder at runtime, which breaks if it is bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // PGlite is the local database. On Vercel the app refuses to start without DATABASE_URL, so PGlite is never loaded there.
  // Leaving it out takes about 20 MB off every function.
  // pnpm keeps the files under node_modules/.pnpm, and Turbopack adds a hashed link to them next to the package.
  // The link is left out too, so no function ships a link that points at nothing.
  ...(process.env.VERCEL
    ? {
        outputFileTracingExcludes: {
          "/*": [
            "node_modules/@electric-sql/pglite/**/*",
            "node_modules/@electric-sql/pglite-*",
            "node_modules/.pnpm/@electric-sql+pglite*/**/*",
          ],
        },
      }
    : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The app is never meant to be framed. This stops another site drawing its own page over the buttons.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // The dev badge sits over the phone bottom nav and the sidebar's Log out button, and blocks clicks on them.
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
