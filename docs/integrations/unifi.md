# Ubiquiti / Unifi Integration

Syncs network devices from a Unifi controller into the Network tab of each mapped client. Supports both self-hosted controllers and UniFi OS devices (UDM, UDR, Cloud Key Gen2+).

**Data source tag:** `UNIFI`

---

## What syncs

| Data | DocHub destination | Notes |
|---|---|---|
| Access Points | Network Devices | Type: `ACCESS_POINT` |
| Switches | Network Devices | Type: `SWITCH` |
| Gateways / UDM | Network Devices | Type: `ROUTER` |
| Other devices | Network Devices | Type: `OTHER` |

Fields synced per device: name, model, IP address, MAC address, firmware version, uptime (seconds), connected client count, last seen timestamp.

---

## Prerequisites

- A Unifi controller reachable from the DocHub host
- A local controller admin username and password
- Self-signed SSL certificates are supported (DocHub bypasses certificate validation for Unifi connections)

---

## Controller types

| Type | When to use |
|---|---|
| `network_application` | Self-hosted Unifi Network Application (port 8443) |
| `unifi_os` | UDM, UDR, UDM-Pro, Cloud Key Gen2+ (port 443, `/proxy/network/` prefix) |

---

## Configuration

1. Go to **Settings → Ubiquiti / Unifi**
2. Enter the **Controller URL** (e.g. `https://192.168.1.1` or `https://unifi.example.com:8443`)
3. Enter the **Username** and **Password**
4. Select the **Controller type**
5. Click **Load sites** — DocHub authenticates and fetches the site list
6. Map each site to the appropriate DocHub client
7. Click **Save mapping**
8. Click **Run sync**

---

## Sync behaviour

- Devices are upserted by Unifi internal `_id` + `clientId`
- MAC address is used as a fallback match key
- Uptime is stored in seconds; the UI formats it as `Xd Yh`
- Devices removed from the controller are not automatically deleted from DocHub
- Re-sync preserves any manual notes or edits to non-synced fields

---

## Sync endpoint

```
POST /api/integrations/unifi/sync
```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| SSL/certificate errors | Controller using self-signed cert — should be handled automatically |
| "Auth failed" | Wrong username/password or controller URL |
| Sites not loading | Wrong controller type selected (try switching between `network_application` and `unifi_os`) |
| Devices appear under wrong client | Check site mapping in Settings |

---

## Camera Snapshot Sync (UniFi Protect)

DocHub can pull field-of-view thumbnail snapshots directly from a UniFi Protect NVR and store them against each camera record.

### Setup

1. On the Camera System record, set:
   - **Type**: `Unifi Protect NVR`
   - **Management URL**: the NVR base URL (e.g. `https://192.168.1.1`)
   - **Admin Credential**: a credential from the vault with username and password
2. On each Camera record within that system, set the **UniFi Camera ID** — find this in UniFi Protect → select the camera → device info panel (a hex string like `6a1b2c3d4e5f...`)

### Manual sync

Click **Sync UniFi** on the camera system header. DocHub authenticates against the NVR, fetches a JPEG snapshot for every camera with a `unifiCameraId` set, saves it to `/uploads`, and updates the record. A "Synced Month Year" badge appears on each thumbnail.

Self-signed TLS certificates are handled automatically.

### Automated monthly rotation

Call `GET /api/cron/camera-snapshots` with the `Authorization: Bearer <CRON_SECRET>` header from a system cron. See the main README for a ready-to-use cron entry.

### API endpoints

```
POST /api/camera-systems/{id}/sync-unifi   — sync all cameras in one system
GET  /api/cron/camera-snapshots            — sync all UniFi NVR systems (cron, bearer auth)
```

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| "No credential configured" | Camera system has no linked credential |
| "UniFi auth failed: HTTP 401" | Wrong username/password in the linked credential |
| "UniFi snapshot failed: HTTP 404" | `unifiCameraId` is wrong or camera is offline |
| Snapshot saved but image broken | Camera returned non-image data — verify the camera is active in Protect |
