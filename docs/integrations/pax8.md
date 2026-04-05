# Pax8 Integration

Syncs cloud subscriptions from Pax8 into the **Subscriptions** tab of each mapped client. Each subscription appears with its status, quantity, billing term, monthly cost, and renewal date. You can assign a client user to each subscription directly from that tab.

**Data source tag:** `PAX8`

---

## What syncs

Each active Pax8 subscription syncs as a `License` record with `dataSource = PAX8`:

| Field | Source |
|---|---|
| Product name | `productName` |
| Vendor | `vendorName` |
| Status | `status` (Active, Suspended, Trial, PendingCancel, etc.) |
| Quantity (seats) | `quantity` |
| Billing term | `billingTerm` (Monthly, Annual, 2Year, 3Year) |
| Cost ($/mo) | `price × quantity`, normalised to monthly |
| Purchase date | `startDate` |
| Renewal date | `commitmentTerm.endDate` or `endDate` |

**Cancelled and Terminated** subscriptions are skipped — only active-state subscriptions are imported.

**Cost normalisation:** Pax8 returns a per-unit price. DocHub stores total monthly cost: `price × quantity` for monthly billing, divided by 12 for annual, 24 for 2-year, 36 for 3-year.

---

## Prerequisites

- A Pax8 Partner account
- OAuth2 API credentials from the Pax8 Partner Portal

---

## Creating API credentials in Pax8

1. Log in to the [Pax8 Partner Portal](https://app.pax8.com)
2. Go to **Admin → API Credentials** (or **Partner Tools → API**)
3. Create a new application / client
4. Note the **Client ID** and **Client Secret**
5. The grant type is `client_credentials` — no user login required

---

## Configuration

1. Go to **Settings → Pax8**
2. Enter your **Client ID** and **Client Secret**
3. Click **Save**, then **Load companies** — DocHub authenticates via OAuth2 and fetches your company list from Pax8
4. Map each Pax8 company to the corresponding DocHub client (or leave as "— skip —" to exclude)
5. Click **Save mapping**
6. Click **Run sync**

---

## Subscriptions tab

Synced subscriptions appear on the client page under the **Subscriptions** tab (separate from the Licenses tab which shows manually-entered licenses).

The tab groups subscriptions by vendor and shows a total monthly spend at the bottom.

**Assigning a user:** Use the dropdown on each subscription row to assign a client user. The assignment is saved immediately and is preserved across re-syncs.

---

## Sync behaviour

- Subscriptions are upserted by Pax8 subscription ID (`pax8Id`) + `clientId`
- Re-syncing a subscription updates all fields **except** `assignedUserId` — user assignments are preserved
- Cancelled and Terminated subscriptions are skipped; they remain in DocHub if previously synced (set to active) until manually removed
- All companies in the mapping are synced in a single run; errors on one company do not block others

---

## Sync endpoint

```
POST /api/integrations/pax8/sync
```

---

## OAuth2 token endpoint

```
POST https://id.pax8.com/auth/realms/pax8-b2b/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=...&client_secret=...
```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Pax8 auth failed: HTTP 401" | Wrong client ID or secret |
| "No access_token in Pax8 auth response" | API credentials not set to `client_credentials` grant type |
| Companies list empty | API key does not have access to any companies |
| Subscriptions not appearing | Company not mapped, or all subscriptions are Cancelled/Terminated |
| Cost shows $0.00 | Pax8 returned `price: 0` — may be a trial or internal line item |
