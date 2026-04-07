# DocHub — Claude Code Project Context

## What This Is

DocHub is a self-hosted MSP documentation platform for **PCC2K** (a two-technician shop).
It centralizes client management, asset tracking, credentials, runbooks, and third-party
integrations. It is a self-hosted alternative to commercial MSP tools like IT Glue / Hudu.

**Technicians:**
- Michael Saville — ADMIN, primary developer
- Michael Frye (mfrye@pcc2k.com) — second technician, StaffUser record deferred until platform is stable

---

## Infrastructure

| Item | Value |
|---|---|
| Server | Linode 4GB, Ubuntu 24.04, IP 45.79.134.250 |
| Tailscale IP | 100.123.99.52 (server only accessible via Tailscale) |
| Domain | dochub.pcc2k.com |
| Reverse proxy | Caddy |
| Container runtime | Docker + Watchtower (auto-deploy on image update) |
| Database | PostgreSQL 16, port 5432 (intentionally open during dev, harden before prod migration) |
| CI/CD | GitHub Actions → ghcr.io/michaelsaville/dochub:latest |
| Repo | github.com/michaelsaville/dochub.git (private) |

---

## Stack

- **Framework:** Next.js 15+ (App Router)
- **ORM:** Prisma 6
- **Database:** PostgreSQL 16
- **Auth:** NextAuth.js with Microsoft Azure AD SSO — JWT sessions with manual Prisma lookup
- **Encryption:** AES-256-GCM for credentials vault
- **Deployment:** Docker, Watchtower, Caddy, GitHub Actions

---

## Critical Patterns — Read Before Touching Any Code

### 1. Next.js 15+ Dynamic Route Params Must Be Awaited

Dynamic route `params` must be typed as `Promise<{ id: string }>` and awaited.
This applies to **both page components and API route handlers**.

```ts
// ✅ Correct
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}

// ❌ Wrong — breaks in Next.js 15+
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { id } = params
}
```

### 2. Auth Pattern — JWT Sessions, NOT Prisma Adapter

The Prisma adapter is **incompatible** with Next.js 15+ / Prisma 6+.

**Correct pattern:**
- Use JWT sessions (`strategy: "jwt"` in NextAuth config)
- Manually look up the user in Prisma inside the `jwt` and `session` callbacks
- Do NOT use `@next-auth/prisma-adapter`

### 3. Encryption Key — Lazy Initialization Only

The AES-256-GCM encryption key **must** be lazy-initialized inside functions, not at module
load time. Module-level initialization causes build-time failures.

```ts
// ✅ Correct
function getKey() {
  return Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
}

// ❌ Wrong — breaks at build time
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
```

### 4. Prisma Schema Changes

Schema pushes must be run **from the host** with an explicit DATABASE_URL pointing to
the DB IP. Do NOT run from inside the app container.

```bash
DATABASE_URL="postgresql://dochub:changeme_before_production@172.18.0.3:5432/dochub" npx prisma db push
```

### 5. Named Prisma Relations

When a model has **multiple FK relationships to the same target model**, Prisma requires
named relations on both sides. Example:

```prisma
model SipTrunk {
  vendor   Vendor? @relation("VendorSipTrunks", fields: [vendorId], references: [id])
}
model Vendor {
  sipTrunks SipTrunk[] @relation("VendorSipTrunks")
}
```

### 6. Environment Variable Changes Require Container Restart

If behavior is unexpected after an env var change, always restart the container first
before debugging further.

---

## Deployment Flow

```
Local code change
    → git push to github.com/michaelsaville/dochub
    → GitHub Actions builds Docker image
    → Pushes to ghcr.io/michaelsaville/dochub:latest
    → Watchtower on Linode detects new image (polls every 30s)
    → Pulls and restarts container automatically
```

**After schema changes:** must also run `prisma db push` on the live database:
```bash
# From local machine with DB accessible
DATABASE_URL="postgresql://dochub:changeme_before_production@172.18.0.3:5432/dochub" npx prisma db push
# OR from the Linode host:
docker compose exec app npx prisma db push
```

---

## Current Feature State

### ✅ Completed & Shipped

- Microsoft SSO (Azure AD) authentication
- Navigation shell with sidebar
- Client list with search and add form
- Client detail page — tabbed interface:
  - Dashboard, Locations, Users, Assets, Contacts, Credentials, Licenses, Subscriptions, Applications, Domains, Network, Remote Access, Phone System, Cameras, Documents, SOPs, Activity
- Credential vault — AES-256-GCM, per-user reveal, favouriting, TOTP, URL launch, expiry
- Assets — hardware inventory, Splashtop/RDP links, Syncro integration
- Domains — expiry monitoring, DNS snapshot
- Network tab:
  - Network devices with rack visualisation and port documentation
  - VLANs, subnets (IPAM)
  - File shares with mapped drive letter (D–Z), AD domain join, domain admin credential in vault
  - Wireless PTP bridge links with side A/B endpoint details and signal quality colour coding
- Remote Access:
  - VPN servers with linked asset + credential
  - VPN accessors with client user linking, credential vault integration (pick existing or create new)
- Phone System:
  - PBX systems (Grandstream UCM, FreePBX, 3CX, etc.)
  - Extensions — type, DID, client user link, handset asset, SIP cred, voicemail cred
  - SIP Trunks — optional vendor link (auto-fills carrier + support phone), account number, expandable DID list with number, designation, extension routing
  - POTS Lines — vendor link, carrier, account number, circuit ID, per-number FX port label, designation, extension routing
- Cameras:
  - Camera systems (UniFi Protect NVR, Hikvision, Dahua, etc.)
  - Per-camera field-of-view thumbnails (manual upload or UniFi Protect API sync)
  - UniFi Protect snapshot sync — "Sync UniFi" button on system header, self-signed cert support
  - Monthly cron endpoint: `GET /api/cron/camera-snapshots` (Bearer token auth via `CRON_SECRET`)
- SyncroMSP sync engine (assets, contacts)
- Unifi network device sync
- Cisco Meraki network device sync
- HP Instant On network device sync
- SonicWall firewall info sync
- Pax8 subscription sync
- ITFlow one-time import
- Nightly auto-sync cron endpoint (bearer token protected via `CRON_SECRET`)
- Runbooks/SOPs — global and per-client, taggable

### 📋 Roadmap

1. Migration from Linode to Dell PowerEdge (close port 5432, production hardening)
2. RBAC middleware — restrict TECH users from sensitive credential fields
3. Microsoft Teams webhook alarms engine (domain expiry, credential expiry)
4. Client portal (read-only view for client staff)
5. Synology backup monitoring integration
6. Add Michael Frye StaffUser record (deferred until platform stable)

---

## Integrations

| Service | Status | Notes |
|---|---|---|
| SyncroMSP | ✅ Active | RMM/PSA — sync engine pulls clients, assets, contacts |
| Splashtop | ✅ Active | Remote access links on asset detail pages |
| Microsoft Azure AD | ✅ Active | SSO authentication |
| Unifi (network) | ✅ Active | Network device sync |
| Unifi Protect (cameras) | ✅ Active | Camera snapshot thumbnail sync |
| Cisco Meraki | ✅ Active | Network device sync |
| HP Instant On | ✅ Active | Network device sync |
| SonicWall | ✅ Active | Firewall info sync |
| Pax8 | ✅ Active | Subscription sync |
| Microsoft Teams | 📋 Planned | Webhook alarms engine |
| Synology | 📋 Planned | Backup monitoring |

---

## Environment Variables

```
DATABASE_URL
NEXTAUTH_URL
NEXTAUTH_SECRET
AZURE_AD_CLIENT_ID
AZURE_AD_CLIENT_SECRET
AZURE_AD_TENANT_ID
ENCRYPTION_KEY          # 32-byte hex string, lazy-init only
SYNCRO_API_KEY
SYNCRO_SUBDOMAIN
CRON_SECRET             # Bearer token for /api/cron/* endpoints
```

---

## Key File Locations

```
app/                          Next.js app router pages and API routes
app/api/                      API route handlers
app/api/camera-systems/[id]/sync-unifi/route.ts   UniFi Protect snapshot sync
app/api/cron/camera-snapshots/route.ts            Monthly camera snapshot cron
app/clients/[id]/page.tsx     Main client detail page (all tabs)
prisma/schema.prisma          Database schema
lib/                          Shared utilities (auth, encryption, prisma client)
lib/crypto.ts                 AES-256-GCM encrypt/decrypt
components/                   Shared UI components
components/CameraPanel.tsx    Camera system + UniFi sync UI
components/PhonePanel.tsx     Phone system, SIP trunks, POTS lines UI
components/PtpPanel.tsx       Wireless PTP bridge UI
components/FileSharesPanel.tsx File shares + AD domain + drive letter UI
components/VpnPanel.tsx       VPN gateway + accessor + user link UI
```

---

## Notes for Claude Code Sessions

- Always `await params` in dynamic route handlers — Next.js 15+ requirement
- Do not install or reference `@next-auth/prisma-adapter`
- Encryption key must be inside functions, never at module scope
- Schema changes: run `db push` from host, not container
- Named Prisma relations required when model has multiple FKs to same target
- When SIP trunk `didRange` is referenced anywhere old — it was removed; replaced with `SipDid` table
- The second technician (mfrye) does not yet have a StaffUser record — do not add it yet
- UniFi Protect camera sync uses Node `https` module directly (not fetch) to support self-signed certs
