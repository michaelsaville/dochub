# Integrations

DocHub pulls data from external systems into a unified client record. All integrations are configured in **Settings → Integrations**.

---

## Available integrations

| Integration | Type | Data synced | Docs |
|---|---|---|---|
| SyncroMSP | Live sync (API) | Assets, contacts | [syncromsp.md](syncromsp.md) |
| Ubiquiti / Unifi | Live sync (API) | Network devices | [unifi.md](unifi.md) |
| Cisco Meraki | Live sync (API) | Network devices | [meraki.md](meraki.md) |
| HP Instant On / Aruba | Live sync (API) | Network devices | [hpinstanton.md](hpinstanton.md) |
| SonicWall | Live sync (API, per-appliance) | Firewall info | [sonicwall.md](sonicwall.md) |
| Pax8 | Live sync (OAuth2) | Subscriptions | [pax8.md](pax8.md) |
| ITFlow | One-time CSV import | Clients, contacts, assets, credentials, licenses | [itflow-import.md](itflow-import.md) |

---

## How data sources work

Every synced record carries a `dataSource` tag that identifies where it came from (`SYNCRO`, `UNIFI`, `MERAKI`, etc.). This tag appears as a small favicon badge on each row in the UI.

Source badge colours are configurable in **Settings → Data Sources**.

Re-syncing an integration **upserts** records — it updates existing ones matched by a stable external ID and creates new ones. It does not delete records that have disappeared from the source; those stay in DocHub until manually removed.

User-assigned data (e.g. which user is assigned to a Pax8 subscription) is **preserved across re-syncs**.

---

## Client mapping

Most integrations require a **client mapping** step: you load the list of companies/sites/networks from the external system and map each one to the corresponding DocHub client. This mapping is saved and reused on every sync.

The SonicWall integration is configured per-appliance (each device entry already names a client).

---

## Running syncs

Each integration has a **Run sync** button in its settings section. Syncs run on demand — there is no automatic schedule built in. Use a cron job or your own scheduler to call the sync API endpoint periodically if needed.

Sync endpoints (all `POST`, require auth session):

| Integration | Endpoint |
|---|---|
| SyncroMSP | `POST /api/sync/syncro` |
| Unifi | `POST /api/integrations/unifi/sync` |
| Meraki | `POST /api/integrations/meraki/sync` |
| HP Instant On | `POST /api/integrations/hpinstanton/sync` |
| SonicWall | `POST /api/integrations/sonicwall/sync` |
| Pax8 | `POST /api/integrations/pax8/sync` |
