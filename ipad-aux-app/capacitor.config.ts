import type { CapacitorConfig } from '@capacitor/cli'

/**
 * DocHub iPad "Aux Display" — native Capacitor shell.
 *
 * This is a THIN wrapper: it loads the live DocHub web app (which already
 * contains the aux-display receiver pill and SSE client). The native shell
 * exists only to give the iPad a home-screen app, keep the screen awake, and
 * (optionally later) lock into kiosk/guided-access. All the realtime behavior
 * lives in the web app — nothing app-specific needs to be rebuilt here when
 * the feature evolves.
 *
 * Build steps (must run on macOS with Xcode — cannot be built on the Linux
 * server): see README.md in this folder.
 */
const config: CapacitorConfig = {
  appId: 'com.pcc2k.dochub.aux',
  appName: 'DocHub Aux',
  // No local web assets — we point straight at the deployed app.
  webDir: 'www',
  server: {
    url: 'https://dochub.pcc2k.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
}

export default config
