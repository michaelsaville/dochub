# DocHub Aux — iPad second-screen shell

A thin Capacitor wrapper around the live DocHub web app. It exists so the iPad
gets a real home-screen app (and, later, kiosk lock). **All the actual
behavior — the SSE connection and the auto-flip — lives in the DocHub web app**
(`components/AuxDisplayReceiver.tsx`), so this shell almost never changes.

## What it does

1. Loads `https://dochub.pcc2k.com` natively.
2. The tech signs into DocHub once (Azure SSO) — same account they use at their
   desk in TicketHub.
3. They tap the **📲 Aux Display** pill (bottom-left) once to arm it.
4. From then on, opening a ticket in TicketHub flips this iPad to that client's
   DocHub page automatically.

No pairing codes — the link is the shared Azure **email**. Desk session
(TicketHub) and iPad (DocHub) are the same person, so they find each other.

## You do NOT need this shell to use the feature today

The web app is a PWA. On the iPad, open `https://dochub.pcc2k.com` in Safari →
Share → **Add to Home Screen**. That gives you the full aux-display behavior
right now. The Capacitor build below only adds native niceties (guaranteed
stay-awake, kiosk/Guided Access, App Store / MDM distribution).

## Building the native app (requires macOS + Xcode)

This cannot be built on the Linux server — Apple's toolchain is Mac-only.

```bash
cd ipad-aux-app
npm install
npm run add:ios      # generates www/ + the ios/ Xcode project
npm run open         # opens Xcode
```

In Xcode:
- Set your Apple Developer **Team** (Signing & Capabilities) for the
  `com.pcc2k.dochub.aux` bundle id.
- Run on a connected iPad, or Archive → distribute via Ad Hoc / TestFlight /
  your MDM.

## Guided Access — lock the iPad to DocHub (no code change)

For a wall-mounted / counter display you usually want the iPad pinned to DocHub
with the screen always on. This is iPadOS Guided Access — the same steps are
shown to the tech in-app at **dochub.pcc2k.com/aux-display**.

1. **Settings → Accessibility → Guided Access** → turn it on.
2. **Passcode Settings** → set a passcode so it can't be exited without you
   (Face ID / Touch ID optional).
3. Open the DocHub home-screen app (or the native build), then **triple-click**
   the side/top button → in the bottom-left **Options**: keep **Touch** on, turn
   **Sleep/Wake** off, set **Time Limit** to none → **Start**.
4. To exit later: triple-click the button, enter the passcode → **End**.

Also set **Settings → Display & Brightness → Auto-Lock → Never** while on power
so it stays awake between tickets. For a fleet, an MDM kiosk profile applies all
of this centrally and can also push the native build.

## Pointing at staging

Edit `server.url` in `capacitor.config.ts`, then `npm run sync`.
