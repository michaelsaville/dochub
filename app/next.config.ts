import type { NextConfig } from "next";

// Background Sync — mutations that fail while offline get parked in the
// service worker's sync queue and replayed when connectivity returns.
// The in-tab Dexie queue handles "offline mid-session"; API endpoints
// enforce clientOpId idempotency so double-replay is safe.
const MUTATION_PATTERN =
  /^https?:\/\/[^/]+\/api\/(clients|credentials|documents|assets|backups|applications|notes|share)(\/|$)/i

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Never precache API routes — the service worker must not intercept
  // /api/auth/callback/azure-ad (Entra codes are single-use).
  exclude: [/\/api\//, /middleware-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: MUTATION_PATTERN,
      method: "POST",
      handler: "NetworkOnly",
      options: {
        backgroundSync: {
          name: "dochub-mutations",
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    {
      urlPattern: MUTATION_PATTERN,
      method: "PATCH",
      handler: "NetworkOnly",
      options: {
        backgroundSync: {
          name: "dochub-mutations",
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    {
      urlPattern: MUTATION_PATTERN,
      method: "PUT",
      handler: "NetworkOnly",
      options: {
        backgroundSync: {
          name: "dochub-mutations",
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    {
      urlPattern: MUTATION_PATTERN,
      method: "DELETE",
      handler: "NetworkOnly",
      options: {
        backgroundSync: {
          name: "dochub-mutations",
          options: { maxRetentionTime: 24 * 60 },
        },
      },
    },
    // All other API requests — straight to network, no caching.
    {
      urlPattern: /^https?.*\/api\/.*$/i,
      handler: "NetworkOnly",
    },
  ],
})

const nextConfig: NextConfig = {
  output: "standalone",
  // pdf-parse (+ its pdfjs-dist and native @napi-rs/canvas deps) are reached
  // only via dynamic import() — for PDF text OCR (lib/files/ingest) and PDF
  // page-1 thumbnail rendering. The standalone file-tracer drops them, so they
  // were ABSENT from the deployed container and the PDF-OCR path silently
  // no-op'd. Externalizing them — the same mechanism that ships sharp — forces
  // them into the standalone bundle.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // serverExternalPackages keeps these out of the webpack bundle, but the
  // tracer copies only the files it can statically see — it misses pdfjs's
  // dynamically-loaded worker (legacy/build/pdf.worker.mjs) and the native
  // @napi-rs/canvas binary. Force-copy the full trees so both PDF OCR and PDF
  // thumbnail rendering work in standalone. (One route key is enough — the
  // standalone node_modules is shared across all routes; alpine installs only
  // the musl canvas binary, so no gnu bloat ships.)
  outputFileTracingIncludes: {
    "/api/attachments/**": [
      "./node_modules/pdf-parse/**",
      "./node_modules/pdfjs-dist/**",
      "./node_modules/@napi-rs/**",
    ],
  },
};

module.exports = withPWA(nextConfig);
