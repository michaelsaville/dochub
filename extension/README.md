# DocHub browser extension (Chrome / Edge, Manifest V3)

Credential search, one-click **Fill all** (username → password → 2FA code, across
split logins), TOTP codes and a password generator, backed by the DocHub API.

## Install / update

1. In DocHub: **Settings → API Keys** → *Download extension (.zip)*, then unzip it
   (or use this `extension/` folder directly from the repo).
2. Open `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode**,
   click **Load unpacked**, and pick the folder containing `manifest.json`.
3. Generate an API key in **Settings → API Keys** and paste it into the popup.
   A key with *read* scope can search but cannot reveal or fill secrets.

**Upgrading from 2.0.x:** 2.1.0 adds host permissions for the Microsoft and
Google sign-in pages (`login.microsoftonline.com`, `login.live.com`,
`login.microsoft.com`, `login.windows.net`, `account.live.com`,
`accounts.google.com`). After *Reload*, Chrome may disable the extension until
you accept the new permissions on `chrome://extensions`.

Optional: the **Allow all sites** link in the popup footer grants
`https://*/*` so Fill all can also follow a login through redirects to other
SSO providers (Okta, OneLogin, vendor portals). Without it, the extension only
touches a page when you open the popup on it (`activeTab`) plus the Microsoft /
Google sign-in hosts above.

Keyboard: **Alt+Shift+D** opens the popup (change at `chrome://extensions/shortcuts`).
In the popup the search box is focused: **↑/↓** select, **Enter** = Fill all,
**Alt+U / Alt+P / Alt+T** copy username / password / 2FA code, **Alt+R** reveal,
**Alt+G** password generator, **Esc** resets the search (press again to close).

## How it works

- **Matching** (`lib/domain.js`): credentials match the page by exact host,
  subdomain, or same registrable domain (eTLD+1, with a short multi-label suffix
  list — `co.uk`, `com.au`, … and tenant platforms like `sharepoint.com`).
  Microsoft 365 portals (portal.office.com, admin.microsoft.com, *.sharepoint.com,
  outlook.office.com, portal.azure.com, entra.microsoft.com, …) also match the
  shared sign-in pages (login.microsoftonline.com, login.live.com); Google
  admin / Gmail credentials match accounts.google.com.
- **Last used on this site**: the popup remembers (in `chrome.storage.local`)
  the credential id, label and client last used per site — ids and labels only,
  never secrets — and shows it first, followed by site matches and more
  credentials from the same client (`/api/v1/credentials?clientId=`).
- **Fill all** (`background.js` + `lib/fieldmatch.js`): the background scans the
  tab's frames for login fields (no secrets), then reveals the credential via
  `/api/v1/credentials/:id/reveal` and fills the frames that have fields. If only
  a username field exists (split login), it records a *pending* fill for that
  tab — credential id + URLs only, in memory-only `chrome.storage.session` — and
  watches for the password step (in-page SPA step or a new page in the same tab,
  for up to 2 minutes). When the password or 2FA field appears it reveals again
  (so server-side RBAC, read-only key scope and the reveal audit log apply to
  every step), fills that one field, and drops the secret. Continuation only
  fills frames whose host matches the credential, the original site, or a known
  identity-provider sign-in host, over HTTPS.
- **TOTP** codes are computed locally from the revealed seed (`lib/totp.js`).
  Revealed values in the popup are wiped after 60 s or when it closes.

## Tests

```sh
node extension/test/run.js
```

Pure-JS tests for domain matching, field classification (Microsoft / Google /
generic / OTP) and TOTP (RFC 6238 vectors). The DOM fill and chrome.* wiring are
not covered by these tests.

## Rebuilding the download zip

The Settings page serves `app/public/dochub-extension.zip` (files at the zip root):

```sh
python3 -c "import zipfile,os;z=zipfile.ZipFile('app/public/dochub-extension.zip','w',zipfile.ZIP_DEFLATED)
for r,d,f in os.walk('extension'):
  d[:]=[x for x in d if x!='test']
  [z.write(os.path.join(r,n),os.path.relpath(os.path.join(r,n),'extension')) for n in sorted(f)]
z.close()"
```

(run from the repo root; `zip` isn't installed on the DocHub box)

Bump `version` in `manifest.json` and the version label in
`app/app/settings/page.tsx` together.
