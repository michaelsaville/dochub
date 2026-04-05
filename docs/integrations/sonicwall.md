# SonicWall Integration

Syncs appliance information from individual SonicWall firewalls via the SonicOS REST API. Unlike other integrations, SonicWall is configured per-appliance rather than per-account — each device has its own credentials.

**Data source tag:** `SONICWALL`

---

## What syncs

Each SonicWall appliance syncs as a single `FIREWALL` type network device:

| Field | Source |
|---|---|
| Name | Friendly name override → model → "SonicWall" |
| Model | `reporting/device/current` → `model` |
| Serial | `reporting/device/current` → `serial_number` |
| Firmware version | `config/version` → `firmware_version.version_string` |
| Management URL | Configured host URL |
| IP address | Extracted from host URL |

---

## Prerequisites

- SonicOS firmware **6.5.4 or later**
- REST API enabled on the appliance
- Admin credentials (or a read-only account with API access)

### Enabling the REST API

On the SonicWall admin interface:

**Device → Administration → Management → REST API** → Enable REST API

---

## Configuration

SonicWall devices are configured individually. For each appliance:

1. Go to **Settings → SonicWall**
2. Click **Add device**
3. Fill in:
   - **Management URL** — full URL including protocol, e.g. `https://192.168.1.1`
   - **Username** — admin username
   - **Password** — admin password
   - **Friendly Name** — optional label (e.g. "ACME Main Firewall")
   - **Client** — which DocHub client this appliance belongs to
4. Click **Add device** to save
5. Repeat for each appliance
6. Click **Run sync**

Self-signed SSL certificates are handled automatically — DocHub bypasses certificate validation for SonicWall connections.

---

## Sync behaviour

- Each appliance is synced independently; errors on one device do not block others
- Devices are upserted by serial number + `clientId`, falling back to management URL + `clientId`
- The sync authenticates, fetches data, then logs out — it does not leave sessions open

---

## Sync endpoint

```
POST /api/integrations/sonicwall/sync
```

---

## Authentication flow

DocHub uses the SonicOS REST API v2 authentication sequence:

```
POST /api/sonicos/auth          (Basic auth → returns session cookie)
GET  /api/sonicos/config/version
GET  /api/sonicos/reporting/device/current
DELETE /api/sonicos/auth        (logout)
```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Auth failed: HTTP 401" | Wrong username or password |
| "Auth failed: HTTP 403" | REST API not enabled, or account lacks API access |
| Model/serial shows null | Firmware older than 6.5.4, or REST API not fully supported |
| Connection refused | Wrong management URL or firewall not reachable from DocHub host |
