import type { NextConfig } from "next";

// Background Sync — mutations that fail while offline get parked in the
// service worker's Workbox BackgroundSync queue ("dochub-mutations") and
// replayed when connectivity returns. This SW queue is the sole offline
// mechanism; plain fetch() mutations are intercepted transparently.
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
};

module.exports = withPWA(nextConfig);
