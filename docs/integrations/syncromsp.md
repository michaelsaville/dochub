# SyncroMSP Integration

Syncs assets and contacts from your SyncroMSP account into DocHub. Assets carry the Syncro `friendlyName`, `splashtopUrl`, and a link back to the Syncro asset record.

**Data source tag:** `SYNCRO`

---

## What syncs

| Data | DocHub destination | Notes |
|---|---|---|
| Assets (endpoints) | Assets tab | Hostname → `name`, display name → `friendlyName`, Splashtop UUID → `splashtopUrl` |
| Contacts | Contacts tab | Matched by Syncro contact ID |

---

## Prerequisites

- A Syncro account with API access
- A Syncro API key (Admin → API Tokens)

---

## Configuration

1. Go to **Settings → SyncroMSP**
2. Enter your **Syncro subdomain** (the part before `.syncromsp.com`)
3. Enter your **API key**
4. Save credentials
5. Click **Run sync**

Syncro does not have a site/network concept — client matching is done by Syncro's own customer ID, which DocHub links to clients via the `syncroId` field on the `Client` model. Ensure clients are pre-created in DocHub with matching Syncro IDs, or run an initial sync and manually link any unmatched records.

---

## Sync behaviour

- Assets are upserted by `syncroAssetId` (unique per Syncro account)
- Contacts are upserted by `syncroContactId`
- Re-sync updates all fields; manual edits to synced fields will be overwritten on next sync
- Assets not returned by the API are not deleted from DocHub

---

## Sync endpoint

```
POST /api/sync/syncro
```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Syncro API key not configured" | Credentials not saved in Settings |
| Assets syncing to wrong client | Syncro customer ID not matched to a DocHub client |
| Friendly name missing | Syncro asset has no display name set |
