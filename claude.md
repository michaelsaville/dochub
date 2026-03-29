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

- **Framework:** Next.js 14 (App Router) — currently targeting Next.js 14/16
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
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}

// ❌ Wrong — breaks in Next.js 15+
export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
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
  return Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
}

// ❌ Wrong — breaks at build time
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
```

### 4. Prisma Schema Changes

Schema pushes must be run **from the host** with an explicit DATABASE_URL pointing to
`localhost:5432`. Do NOT run from inside the app container.

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/dochub" npx prisma db push
```

### 5. File Creation in Terminal

Use Python heredocs for all file creation to avoid terminal paste corruption:

```bash
python3 -c "
content = '''<file content here>'''
with open('filename.ts', 'w') as f:
    f.write(content)
"
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
    → Watchtower on Linode detects new image
    → Pulls and restarts container automatically
```

---

## Current Feature State

### ✅ Completed

- Microsoft SSO (Azure AD) authentication
- Navigation shell with sidebar (Dashboard / Clients / Runbooks / Alarms / Settings)
- Client list with search and add form
- Client detail page — tabbed interface:
  - Overview / Locations / Users / Assets / Contacts / Credentials / Licenses / Activity
- SyncroMSP sync engine (pulls clients, assets, contacts)
- Asset detail page with Syncro and Splashtop remote access links
- Credentials vault with AES-256-GCM encryption
- Inline client and location editing
- Nightly auto-sync cron endpoint (bearer token protected via `CRON_SECRET`)

### 🔄 In Progress / Known Issues

- Cron auto-sync endpoint was returning empty responses — likely needed a container
  restart to pick up `CRON_SECRET` env var. Verify this is resolved.

### 📋 Roadmap (rough priority order)

1. Vendor contacts model
2. Pax8 integration
3. Unifi integration
4. RBAC middleware
5. Client portal
6. Microsoft Teams webhook alarms engine
7. Runbooks build-out
8. Synology backup integration
9. Migration from Linode to Dell PowerEdge (close port 5432, production hardening)
10. Add Michael Frye StaffUser record

---

## Integrations

| Service | Status | Notes |
|---|---|---|
| SyncroMSP | ✅ Active | RMM/PSA — sync engine pulls clients, assets, contacts |
| Splashtop | ✅ Active | Remote access links on asset detail pages |
| Microsoft Azure AD | ✅ Active | SSO authentication |
| Pax8 | 📋 Planned | Licensing distributor |
| Unifi | 📋 Planned | Network device management |
| Sonicwall | 📋 Planned | Firewall management |
| HP Instant On | 📋 Planned | SMB networking gear |
| Gmail | 📋 Planned | Email integration |
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
CRON_SECRET             # Bearer token for /api/cron/sync endpoint
```

---

## Key File Locations

```
/app                    # Next.js app router pages and API routes
/app/api                # API route handlers
/app/clients            # Client list and detail pages
/prisma/schema.prisma   # Database schema
/lib                    # Shared utilities (auth, encryption, prisma client)
/components             # Shared UI components
```

---

## Notes for Claude Code Sessions

- Always check `params` handling when touching dynamic routes — must be awaited
- Do not install or reference `@next-auth/prisma-adapter`
- When adding new env vars, remind that a container restart is required on the server
- Prisma schema changes: remind to run `db push` from host, not container
- Keep encryption key usage inside functions, never at module scope
- The second technician (mfrye) does not yet have a StaffUser record — do not add it yet
