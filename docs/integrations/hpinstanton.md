# HP Instant On / Aruba Integration

Syncs network devices from HP Instant On sites into the Network tab of each mapped client.

**Data source tag:** `HPINSTANTON`

---

## What syncs

| Device type | DocHub device type |
|---|---|
| Access points (AP series) | `ACCESS_POINT` |
| Switches (1930, 1960 series) | `SWITCH` |
| Gateways / routers | `ROUTER` |
| Other | `ACCESS_POINT` (default — Instant On is primarily APs) |

Fields synced per device: name, model, IP address, MAC address, serial number, firmware version.

---

## Prerequisites

- An HP Instant On account
- A bearer token obtained from the Instant On web app (see below)

---

## Obtaining a bearer token

HP Instant On does not currently offer a formal API key. The bearer token must be extracted from an authenticated browser session:

1. Log in to [app.arubainstanton.com](https://app.arubainstanton.com)
2. Open browser DevTools (F12) → **Network** tab
3. Perform any action (e.g. navigate to a site)
4. Find any API request to `api.arubainstanton.com`
5. Copy the `Authorization: Bearer ...` header value

> **Note:** These tokens expire. You will need to refresh the token periodically (typically every few hours to a few days depending on session settings). Re-paste the new token in Settings and run sync again.

---

## Configuration

1. Go to **Settings → HP Instant On**
2. Paste the **bearer token**
3. Click **Load sites** — DocHub fetches your site list from `api.arubainstanton.com/v1/customer/sites`
4. Map each site to the appropriate DocHub client
5. Click **Save mapping**
6. Click **Run sync**

---

## Sync behaviour

- Devices are upserted by Instant On device ID + `clientId`
- MAC address is used as a fallback match key
- Devices removed from Instant On are not automatically deleted from DocHub

---

## Sync endpoint

```
POST /api/integrations/hpinstanton/sync
```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| HTTP 401 on Load sites | Token expired — extract a fresh token from the browser |
| Sites not loading | Bearer token malformed (ensure you copied only the token value, not the `Bearer ` prefix) |
| No devices synced for a site | Site has no devices, or device API returned unexpected format |
