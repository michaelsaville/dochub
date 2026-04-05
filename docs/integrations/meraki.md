# Cisco Meraki Integration

Syncs network devices from a Meraki organisation into the Network tab of each mapped client. Fetches device inventory and live status in a single API call.

**Data source tag:** `MERAKI`

---

## What syncs

| Meraki product type | DocHub device type |
|---|---|
| Wireless (MR, CW series) | `ACCESS_POINT` |
| Switch (MS series) | `SWITCH` |
| Appliance / Security (MX, Z series) | `FIREWALL` |
| Cellular Gateway | `ROUTER` |

Fields synced per device: name, model, serial, LAN IP, MAC address, firmware version, online/offline status. Offline devices have their status noted in the `notes` field.

---

## Prerequisites

- A Meraki Dashboard account
- A Meraki API key (Dashboard → My Profile → API access)
- Organisation ID (visible in the Dashboard URL or via the API)

---

## Configuration

1. Go to **Settings → Cisco Meraki**
2. Enter your **API key**
3. Optionally enter your **Organisation ID** — if left blank, DocHub will fetch all organisations your API key has access to and prompt you to select one
4. Click **Load networks**
5. Map each network to the appropriate DocHub client
6. Click **Save mapping**
7. Click **Run sync**

---

## Sync behaviour

- Devices are upserted by Meraki serial number + `clientId`
- MAC address is used as a fallback match key
- All devices and their statuses are fetched in parallel (two API calls per sync)
- Devices not in a mapped network are ignored
- Devices removed from Meraki are not automatically deleted from DocHub

---

## Sync endpoint

```
POST /api/integrations/meraki/sync
```

---

## API reference

- Auth header: `X-Cisco-Meraki-API-Key`
- Base URL: `https://api.meraki.com/api/v1`
- Meraki uses standard HTTPS with valid certificates — no special SSL handling required

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Meraki API key and org ID required" | Credentials not saved |
| "No networks mapped to clients" | Network mapping step not completed |
| Devices show wrong type | Meraki product type not recognised — check model prefix |
| All devices show as offline | Status fetch failed; check API key permissions |
