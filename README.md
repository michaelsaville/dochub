# DocHub

**DocHub** is a self-hosted MSP documentation platform built and maintained by PCC2K. It centralises everything a managed service provider needs to know about its clients — hardware, credentials, licenses, contacts, network infrastructure, phone systems, cameras, remote access, and runbooks — into a single, dark-themed, fast web application.

DocHub is not a ticketing system or a PSA. It is purpose-built documentation: the single source of truth your technicians reach for when they need to know a client's network layout, a server's serial number, or the password to the firewall.

---

## Features

| Area | What it does |
|---|---|
| **Clients** | Central record per client with a tabbed view covering every entity below |
| **Locations** | Multiple sites per client with address, ISP, WAN IP |
| **Users** | Client-side staff directory with M365 UPN, job title, location assignment |
| **Assets** | Hardware/software inventory with make, model, serial, IP, RDP/VNC launch links, Splashtop integration, driver URL lookup |
| **Contacts** | Vendor/escalation contacts per client |
| **Credentials** | AES-256-GCM encrypted password vault with per-user reveal, URL launch, favouriting, TOTP, expiry tracking |
| **Licenses** | Manual software license tracking with key vault and user assignment |
| **Subscriptions** | Pax8-synced cloud subscriptions with per-subscription user assignment and monthly cost rollup |
| **Applications** | Installed applications catalogue |
| **Domains** | Domain expiry monitoring with configurable alert threshold and DNS record snapshot |
| **Network** | Network devices (switches, APs, firewalls, racks), VLANs, subnets, file shares with AD domain credentials and drive letter, wireless PTP bridge links |
| **Remote Access** | VPN servers and client accessor records with user linking and credential vault integration |
| **Phone System** | PBX systems, extensions, SIP trunks (vendor-linked, structured DID management), POTS lines (FX port mapping) |
| **Cameras** | NVR/DVR systems with field-of-view thumbnails — manual upload or auto-synced from UniFi Protect |
| **Documents** | Rich-text client documents and file attachments |
| **SOPs** | Step-by-step runbooks, taggable and categorised, scoped global or per-client |
| **Dashboard** | Per-client quick-access dashboard with favourited assets and credentials |
| **Activity** | Audit log of all changes per client |

### Network — detail

- **Network Devices**: switches, APs, firewalls, servers, UPS, printers with rack visualisation and port documentation
- **VLANs & Subnets**: per-client IPAM with VLAN ID, subnet CIDR, gateway
- **File Shares**: SMB/NFS/DFS shares with AD domain join, mapped drive letter (D–Z), domain admin credentials stored in vault
- **Wireless PTP Bridges**: side A/B endpoint details (IP, MAC, serial, signal dBm, tx power), link-level frequency/channel/distance, signal quality colour coding (green ≥ −60 dBm → red < −80 dBm)

### Phone System — detail

- **Extensions**: number, display name, type (User/Ring Group/IVR/FAX/Paging/Conference), DID, linked client user, handset asset, SIP credential, voicemail credential
- **SIP Trunks**: optional vendor link (auto-fills carrier + support phone), account number, expandable DID list — each DID has number, designation, optional extension routing
- **POTS Lines**: same vendor-linking pattern, carrier, account number, circuit/billing ID, per-number FX port label, designation, optional extension routing

### Cameras — detail

- Field-of-view thumbnails: manual upload or automatically pulled from UniFi Protect API
- **UniFi Protect sync**: set `unifiCameraId` per camera; "Sync UniFi" button authenticates against the NVR and pulls a fresh JPEG snapshot for every configured camera
- Self-signed certificate support (UniFi default — no extra config needed)
- Monthly automated rotation via `GET /api/cron/camera-snapshots` (bearer-token protected)
- Sync timestamp shown on thumbnail ("Synced Apr 2026")

### Integrations

| Integration | What syncs |
|---|---|
| [SyncroMSP](docs/integrations/syncromsp.md) | Assets (with friendly name, Splashtop URL), contacts |
| [Ubiquiti / UniFi](docs/integrations/unifi.md) | Network devices (APs, switches, gateways); camera snapshot thumbnails via Protect API |
| [Cisco Meraki](docs/integrations/meraki.md) | Network devices with online/offline status |
| [HP Instant On / Aruba](docs/integrations/hpinstanton.md) | Network devices |
| [SonicWall](docs/integrations/sonicwall.md) | Firewall appliance info (model, serial, firmware) |
| [Pax8](docs/integrations/pax8.md) | Cloud subscriptions → Subscriptions tab |
| [ITFlow (import)](docs/integrations/itflow-import.md) | One-time CSV migration of clients, contacts, assets, credentials, licenses |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15+ (App Router) |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Auth | Microsoft Entra ID (NextAuth.js) |
| Reverse proxy | Caddy 2 (automatic HTTPS) |
| Container runtime | Docker + Docker Compose |
| Auto-updates | Watchtower |

---

## Deployment

DocHub ships as a Docker image (`ghcr.io/michaelsaville/dochub:latest`) and is deployed via Docker Compose with Caddy and Postgres.

### Prerequisites

- A Linux server with Docker and Docker Compose installed
- A domain name pointing at the server
- A Microsoft Entra ID (Azure AD) app registration for authentication

### Quick start

```bash
# 1. Clone the repo (or download docker-compose.yml + Caddyfile)
git clone https://github.com/michaelsaville/dochub.git
cd dochub

# 2. Copy and edit the environment file
cp .env.example .env
nano .env

# 3. Edit Caddyfile with your domain
nano Caddyfile

# 4. Start the stack
docker compose up -d

# 5. First run — push schema to the database
docker compose exec app npx prisma db push
```

### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string — set automatically via docker-compose |
| `NEXTAUTH_URL` | Full public URL of your DocHub instance, e.g. `https://dochub.example.com` |
| `NEXTAUTH_SECRET` | Random secret string (use `openssl rand -base64 32`) |
| `AZURE_AD_CLIENT_ID` | Entra ID app client ID |
| `AZURE_AD_CLIENT_SECRET` | Entra ID app client secret |
| `AZURE_AD_TENANT_ID` | Entra ID tenant ID |
| `ENCRYPTION_KEY` | 32-byte hex key for credential encryption (use `openssl rand -hex 32`) |
| `CRON_SECRET` | Bearer token for cron endpoints (`/api/cron/*`) — use `openssl rand -base64 32` |
| `POSTGRES_USER` | Postgres username (used by the `db` service) |
| `POSTGRES_PASSWORD` | Postgres password |
| `POSTGRES_DB` | Postgres database name |

### Caddyfile

```
dochub.example.com {
    reverse_proxy app:3000
}
```

Caddy handles TLS automatically via Let's Encrypt.

### Updates

Pushing to `master` triggers the GitHub Actions workflow, which builds the image
and pushes it to GHCR. To deploy that image to the server, run the deploy script
on the host:

```bash
~/dochub/deploy.sh
```

It logs into GHCR (refreshing the credential from the `gh` CLI token), pulls
`ghcr.io/michaelsaville/dochub:latest`, recreates the `app` container, and waits
for a healthy response before exiting.

> Watchtower used to do this automatically but was removed on 2026-05-29 — it
> was non-functional on this host's containerd image store (the poll loop never
> ran). Deploys are now explicit via `deploy.sh`.

---

## Configuration

### Monthly camera snapshot rotation (UniFi Protect)

Add a system cron on the Docker host to hit the camera snapshot endpoint monthly:

```bash
# /etc/cron.d/dochub-camera-snapshots
0 2 1 * * root curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://dochub.example.com/api/cron/camera-snapshots \
  >> /var/log/dochub-camera-sync.log 2>&1
```

Response: `{ "ok": true, "synced": 5, "failed": 0, "timestamp": "..." }`

Cameras must have their `unifiCameraId` field set (visible in UniFi Protect → Camera → device details). The camera system must have a management URL and linked credential configured.

---

## Microsoft Entra ID setup

1. Go to **Azure Portal → Entra ID → App registrations → New registration**
2. Name: `DocHub`
3. Redirect URI: `https://your-domain.com/api/auth/callback/azure-ad` (Web platform)
4. After creating: note the **Client ID** and **Tenant ID**
5. Under **Certificates & secrets** → create a new client secret, note the value
6. Under **API permissions** → add `User.Read` (Microsoft Graph, delegated) → Grant admin consent

Staff users must be members of your Entra ID tenant. Access is granted to anyone who can authenticate; role management (`ADMIN`, `TECH`) is handled inside DocHub.

---

## Development

```bash
cd app
cp .env.example .env.local   # fill in your local values
npm install
npx prisma db push
npm run dev
```

The dev server runs on `http://localhost:3000`. The database must be reachable — adjust `DATABASE_URL` to point at a local or remote Postgres instance.

### Schema changes

```bash
# After editing prisma/schema.prisma — run from host, not from inside the container
DATABASE_URL="postgresql://user:pass@localhost:5432/dochub" npx prisma db push
```

---

## Documentation

- [Integrations overview](docs/integrations/)
- [ITFlow migration guide](docs/integrations/itflow-import.md)
- [SyncroMSP](docs/integrations/syncromsp.md)
- [UniFi](docs/integrations/unifi.md)
- [Cisco Meraki](docs/integrations/meraki.md)
- [HP Instant On](docs/integrations/hpinstanton.md)
- [SonicWall](docs/integrations/sonicwall.md)
- [Pax8](docs/integrations/pax8.md)

---

## License

Internal tooling — PCC2K. Not licensed for external distribution.
