import type { PrismaClient, TemplateKind } from "@prisma/client"

// =============================================================================
// Starter Template Library — the single source of truth for DocHub's seeded
// MSP documents + SOPs. Consumed by POST /api/templates/reseed (this module)
// and mirrored by the standalone scripts/seed-templates.mjs (which runs the
// same upsert-by-seedKey against DATABASE_URL directly, outside Next).
//
// Every row is idempotent by `seedKey`: re-running only creates what's missing
// and restores archived seeds (isArchived:false). Content is NOT overwritten
// unless force=true, so admin edits to a seeded template survive a re-seed.
// =============================================================================

export type TemplateSeedStep = { title: string; notes?: string }

export type TemplateSeed = {
  seedKey: string
  kind: TemplateKind
  name: string
  description?: string
  categoryName?: string // TemplateCategory to file this template under (library taxonomy)
  titleTemplate?: string // default title of the created record; supports {{client.name}} etc.
  summary?: string // RUNBOOK only
  content?: string // markdown body seed
  steps?: TemplateSeedStep[] // RUNBOOK checklist seed
  tagNames?: string[] // RUNBOOK tag names ensured on instantiate
  defaultCategoryName?: string // stamped on the created ClientDocument.category / RunbookCategory
}

export const TEMPLATE_CATEGORIES: { name: string; color: string; order: number }[] = [
  { name: "Onboarding & Offboarding", color: "#10b981", order: 1 },
  { name: "Documentation", color: "#3b82f6", order: 2 },
  { name: "Security", color: "#ef4444", order: 3 },
  { name: "Backup & DR", color: "#f59e0b", order: 4 },
  { name: "Operations", color: "#6366f1", order: 5 },
]

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  // ── Onboarding & Offboarding ───────────────────────────────────────────────
  {
    seedKey: "sop.client-onboarding",
    kind: "RUNBOOK",
    name: "New Client Onboarding Checklist",
    description: "End-to-end steps to bring a new managed-services client onto DocHub and under management.",
    categoryName: "Onboarding & Offboarding",
    titleTemplate: "{{client.name}} — Client Onboarding",
    summary: "Standard onboarding for a new managed client — documentation, access, monitoring and backup.",
    defaultCategoryName: "Onboarding & Offboarding",
    tagNames: ["onboarding", "client"],
    content: `# {{client.name}} — Client Onboarding

Owner: {{tech.name}}  ·  Started: {{date}}

Bring {{client.name}} fully under management. Work top to bottom — do not skip the discovery step, everything else depends on it.

## Goals
- Complete, accurate documentation in DocHub
- Monitoring + patching agents deployed to every endpoint
- Verified backups on all critical systems
- Vault populated with admin credentials (least-privilege)

## Notes
Record anything unusual (legacy apps, one-off vendor logins, on-prem line-of-business servers) directly on the relevant client records as you go.`,
    steps: [
      { title: "Sign MSA / service agreement and confirm billing terms", notes: "File the signed agreement under Documents." },
      { title: "Create the client record and primary/site contacts", notes: "Capture escalation order and after-hours contact." },
      { title: "Run network discovery and inventory all endpoints, servers and network gear" },
      { title: "Deploy RMM / monitoring agent to every managed device" },
      { title: "Deploy patch-management policy and confirm first check-in" },
      { title: "Deploy / verify endpoint protection (AV/EDR) on all endpoints" },
      { title: "Document the network: WAN, LAN, VLANs, firewall, wireless, ISP details" },
      { title: "Document M365 / Google tenant, domains and DNS" },
      { title: "Collect and vault admin credentials (rotate any shared passwords)", notes: "Use least-privilege accounts; enable MFA where possible." },
      { title: "Verify backups exist and pass a test restore on critical systems" },
      { title: "Document line-of-business applications and their vendors/support paths" },
      { title: "Schedule the kickoff / expectations call and hand off to the service desk" },
    ],
  },
  {
    seedKey: "sop.client-offboarding",
    kind: "RUNBOOK",
    name: "Client Offboarding Checklist",
    description: "Clean, auditable deprovisioning when a client relationship ends.",
    categoryName: "Onboarding & Offboarding",
    titleTemplate: "{{client.name}} — Client Offboarding",
    summary: "Deprovision access, hand off documentation and remove agents when a client departs.",
    defaultCategoryName: "Onboarding & Offboarding",
    tagNames: ["offboarding", "client"],
    content: `# {{client.name}} — Client Offboarding

Owner: {{tech.name}}  ·  Started: {{date}}

Offboard {{client.name}} cleanly and leave a defensible audit trail. Confirm the effective end date and data-handling terms from the contract before removing anything.

## Principles
- Nothing is deleted until documentation is exported and handed off
- Every credential we hold is revoked or handed over
- Keep a record of what was removed, when, and by whom`,
    steps: [
      { title: "Confirm effective end date and contractual data-handling / retention terms" },
      { title: "Export all client documentation and deliver to the client / new provider" },
      { title: "Hand off or securely destroy vaulted credentials per contract", notes: "Rotate any shared admin passwords the client keeps." },
      { title: "Remove RMM, patch and monitoring agents from all endpoints" },
      { title: "Remove endpoint-protection management (leave client-owned licenses intact)" },
      { title: "Revoke our access: delegated admin, VPN, remote tools, tenant partner relationships" },
      { title: "Transfer or release domains, DNS and SSL as agreed" },
      { title: "Final invoice / reconcile prepaid time and licensing" },
      { title: "Archive the client record in DocHub (do not hard-delete)" },
    ],
  },

  // ── Documentation ──────────────────────────────────────────────────────────
  {
    seedKey: "doc.network-documentation",
    kind: "DOCUMENT",
    name: "Network Documentation",
    description: "Structured record of a site's WAN/LAN, addressing, VLANs, wireless and key devices.",
    categoryName: "Documentation",
    titleTemplate: "{{client.name}} — Network Documentation",
    defaultCategoryName: "Network",
    content: `# {{client.name}} — Network Documentation

Last reviewed: {{date}} by {{tech.name}}

## Internet / WAN
| ISP | Circuit / Account # | Bandwidth | Static IP block | Gateway |
|-----|--------------------|-----------|-----------------|---------|
|     |                    |           |                 |         |

## LAN Addressing
| Subnet | VLAN | Purpose | Gateway | DHCP scope |
|--------|------|---------|---------|------------|
|        |      |         |         |            |

## Core Devices
| Role | Make / Model | Mgmt IP | Location | Notes |
|------|--------------|---------|----------|-------|
| Firewall |          |         |          |       |
| Core switch |       |         |          |       |
| Wireless controller | |       |          |       |

## Wireless
| SSID | VLAN | Auth | Notes |
|------|------|------|-------|
|      |      |      |       |

## DNS / DHCP / AD
- Domain:
- Domain controllers:
- Internal DNS servers:
- DHCP server(s):

## Remote Access
- VPN type / endpoint:
- Who has access:

> Credentials live in the Vault, never in this document.`,
  },
  {
    seedKey: "doc.m365-tenant",
    kind: "DOCUMENT",
    name: "Microsoft 365 Tenant Documentation",
    description: "Reference for a client's M365 tenant: domains, licensing, security posture and admin access.",
    categoryName: "Documentation",
    titleTemplate: "{{client.name}} — Microsoft 365 Tenant",
    defaultCategoryName: "M365",
    content: `# {{client.name}} — Microsoft 365 Tenant

Last reviewed: {{date}} by {{tech.name}}

## Tenant
- Tenant name / *.onmicrosoft.com:
- Tenant ID:
- Primary domain(s):
- Delegated / GDAP access: (yes / no — relationship)

## Domains & DNS
| Domain | Registrar | DNS host | MX | SPF | DKIM | DMARC |
|--------|-----------|----------|----|-----|------|-------|
|        |           |          |    |     |      |       |

## Licensing
| SKU | Assigned | Available |
|-----|----------|-----------|
|     |          |           |

## Security Posture
- MFA / Conditional Access:
- Security defaults or CA policies:
- Global admins (should be few, MFA-enforced):
- Breakglass account:  (vaulted)
- Litigation hold / retention:

## Email Protection
- Anti-spam / anti-phishing (Defender, third-party):
- External-sender warning banner:
- Safe Links / Safe Attachments:

> Admin credentials and the breakglass password live in the Vault.`,
  },
  {
    seedKey: "doc.firewall-config",
    kind: "DOCUMENT",
    name: "Firewall Configuration Documentation",
    description: "Record of a firewall's interfaces, policy intent, VPNs and published services.",
    categoryName: "Documentation",
    titleTemplate: "{{client.name}} — Firewall Configuration",
    defaultCategoryName: "Network",
    content: `# {{client.name}} — Firewall Configuration

Last reviewed: {{date}} by {{tech.name}}

## Device
- Make / model / firmware:
- Management IP / URL:
- Support / license expiry:

## Interfaces
| Interface | Zone | IP / subnet | Purpose |
|-----------|------|-------------|---------|
| WAN       |      |             |         |
| LAN       |      |             |         |
| DMZ       |      |             |         |

## Inbound (published) services
| Service | External IP:Port | Internal host:Port | Justification |
|---------|------------------|--------------------|---------------|
|         |                  |                    |               |

## Site-to-Site / Client VPN
| Type | Peer / endpoint | Subnets | Notes |
|------|-----------------|---------|-------|
|      |                 |         |       |

## Policy intent
- Default outbound posture:
- Content filtering / IPS:
- Logging / retention:

> Admin credentials are vaulted. Keep a current config backup attached to this record.`,
  },

  // ── Security ────────────────────────────────────────────────────────────────
  {
    seedKey: "sop.incident-response",
    kind: "RUNBOOK",
    name: "Security Incident Response Runbook",
    description: "First-response steps for a suspected security incident or breach.",
    categoryName: "Security",
    titleTemplate: "{{client.name}} — Security Incident Response",
    summary: "Contain, investigate, eradicate and recover from a suspected security incident.",
    defaultCategoryName: "Security",
    tagNames: ["security", "incident"],
    content: `# {{client.name}} — Security Incident Response

Responder: {{tech.name}}  ·  Opened: {{date}}

Follow the phases in order. Prioritise **containment over investigation** — stop the spread first, gather forensics as you go, and keep a timestamped log of every action.

## Severity
- SEV1: active spread / data exfiltration / ransomware
- SEV2: confined compromise, no active spread
- SEV3: suspicious activity, unconfirmed

## Communication
- Client contact notified: (who / when)
- Do NOT discuss details over potentially-compromised email or chat.

## Incident Log
Record each action with a UTC timestamp as you work.`,
    steps: [
      { title: "Declare the incident, assign a lead, and start the timestamped log" },
      { title: "Contain: isolate affected hosts from the network (do not power off — preserve memory)" },
      { title: "Disable/rotate compromised accounts and revoke active sessions/tokens" },
      { title: "Preserve evidence: logs, images, EDR timeline, email trace" },
      { title: "Determine scope: which accounts, hosts and data are affected" },
      { title: "Eradicate: remove malware/persistence, patch the entry vector" },
      { title: "Recover: restore from known-good backups, re-enable accounts with new credentials" },
      { title: "Notify per contract/regulation (client, cyber-insurance, legal, authorities)" },
      { title: "Monitor for recurrence for an agreed window" },
      { title: "Write the post-incident review and remediation actions" },
    ],
  },
  {
    seedKey: "doc.password-policy",
    kind: "DOCUMENT",
    name: "Password & Access Policy",
    description: "Baseline credential and access-control policy for a client environment.",
    categoryName: "Security",
    titleTemplate: "{{client.name}} — Password & Access Policy",
    defaultCategoryName: "Security",
    content: `# {{client.name}} — Password & Access Policy

Effective: {{date}}  ·  Maintained by: {{tech.name}}

## Passwords
- Minimum length: 14 characters (longer for admin/service accounts)
- Complexity: no forced periodic rotation for standard users (NIST 800-63B); rotate on suspicion of compromise
- No password reuse across systems; use the password manager
- Screened against known-breached password lists where supported

## Multi-Factor Authentication
- MFA required for: email, VPN, remote access, all admin consoles, the password manager
- Authenticator app or hardware key preferred over SMS

## Privileged Access
- Separate admin accounts, never used for daily work / email / browsing
- Least privilege; access granted by role and reviewed quarterly
- Break-glass account exists, vaulted, MFA-exempt, and its use is alerted

## Service & Shared Accounts
- Documented owner, long random secret, vaulted, rotation reviewed on staff change

## Offboarding
- Access revoked same-day on termination; shared secrets rotated

> This is a starting baseline — tailor to the client's compliance requirements.`,
  },
  {
    seedKey: "doc.email-security",
    kind: "DOCUMENT",
    name: "Email Security Baseline",
    description: "Standard anti-phishing / email-authentication configuration for a client tenant.",
    categoryName: "Security",
    titleTemplate: "{{client.name}} — Email Security Baseline",
    defaultCategoryName: "Security",
    content: `# {{client.name}} — Email Security Baseline

Last reviewed: {{date}} by {{tech.name}}

## Email Authentication
| Record | Status | Value / notes |
|--------|--------|---------------|
| SPF    |        | -all (hard fail) once senders enumerated |
| DKIM   |        | selector(s): |
| DMARC  |        | start p=none → p=quarantine → p=reject |

## Filtering / Protection
- Anti-spam & anti-phishing engine:
- Impersonation / spoof protection:
- Safe Links / URL rewriting:
- Safe Attachments / sandboxing:
- External-sender warning banner: enabled?

## Hygiene
- Legacy/basic auth disabled:
- Auto-forwarding to external addresses blocked:
- Mailbox audit logging on:
- Reporting: user "report phishing" button configured

## Known-good senders / allowlist
| Sender / domain | Reason |
|-----------------|--------|
|                 |        |

> Review after any new line-of-business app starts sending mail on the client's behalf.`,
  },

  // ── Backup & DR ─────────────────────────────────────────────────────────────
  {
    seedKey: "sop.backup-verification",
    kind: "RUNBOOK",
    name: "Backup Verification & Test Restore",
    description: "Periodic verification that backups exist, complete, and actually restore.",
    categoryName: "Backup & DR",
    titleTemplate: "{{client.name}} — Backup Verification",
    summary: "Verify backup completion and prove recoverability with a test restore.",
    defaultCategoryName: "Backup & DR",
    tagNames: ["backup", "dr"],
    content: `# {{client.name}} — Backup Verification

Performed by: {{tech.name}}  ·  Date: {{date}}

A backup you have not restored is a hope, not a backup. Confirm every protected system succeeded, then prove recoverability with an actual restore.

## Scope
List the protected systems and their RPO/RTO targets. Any job that has not completed successfully within its RPO is a finding.

## Result
- Failures found:
- Test restore target:
- Restore verified: (yes / no)`,
    steps: [
      { title: "Review last night's backup jobs for every protected system" },
      { title: "Confirm each critical system succeeded within its RPO window" },
      { title: "Investigate and note any failed, missed or partial jobs" },
      { title: "Check backup capacity / retention headroom" },
      { title: "Confirm at least one copy is offsite / immutable (3-2-1)" },
      { title: "Perform a test restore of a representative file/VM/mailbox" },
      { title: "Validate the restored data opens and is intact" },
      { title: "Record results and open tickets for any failures" },
    ],
  },
  {
    seedKey: "doc.dr-plan",
    kind: "DOCUMENT",
    name: "Disaster Recovery Plan",
    description: "Client DR plan: priorities, RPO/RTO, recovery order and contacts.",
    categoryName: "Backup & DR",
    titleTemplate: "{{client.name}} — Disaster Recovery Plan",
    defaultCategoryName: "Backup & DR",
    content: `# {{client.name}} — Disaster Recovery Plan

Last reviewed: {{date}} by {{tech.name}}

## Objectives
| System | Priority | RPO | RTO |
|--------|----------|-----|-----|
|        |          |     |     |

## Backup Architecture
- Onsite backup: (product, location, retention)
- Offsite / cloud copy: (product, location, retention)
- Immutability / air-gap:

## Recovery Order
1.
2.
3.

## Key Contacts
| Role | Name | Phone | Email |
|------|------|-------|-------|
| Client decision-maker |  |  |  |
| MSP lead |  |  |  |
| ISP |  |  |  |
| Backup vendor support |  |  |  |

## Declaration & Communication
- Who can declare a disaster:
- How staff/customers are notified:
- Alternate work location / method:

## Test History
| Date | Type | Result | Notes |
|------|------|--------|-------|
|      |      |        |       |

> Review at least annually and after any major infrastructure change.`,
  },

  // ── Operations ──────────────────────────────────────────────────────────────
  {
    seedKey: "sop.new-workstation-setup",
    kind: "RUNBOOK",
    name: "New Workstation Setup",
    description: "Standard build for a new end-user workstation.",
    categoryName: "Operations",
    titleTemplate: "{{client.name}} — New Workstation Setup",
    summary: "Provision, secure and deliver a new workstation to a standard managed baseline.",
    defaultCategoryName: "Operations",
    tagNames: ["workstation", "deployment"],
    content: `# {{client.name}} — New Workstation Setup

Technician: {{tech.name}}  ·  Date: {{date}}

Build to the standard managed baseline so every device looks the same to support. Capture the asset details in DocHub before it leaves the bench.

## Device
- User:
- Make / model / serial:
- Asset tag:`,
    steps: [
      { title: "Unbox, inventory, and record make/model/serial + asset tag in DocHub" },
      { title: "Install OS updates / firmware and set the power plan" },
      { title: "Join to domain / Entra and apply management policies (Intune/GPO)" },
      { title: "Deploy RMM, patch and endpoint-protection agents; confirm check-in" },
      { title: "Install the standard software set and required line-of-business apps" },
      { title: "Configure email, OneDrive/known-folder move, and printers" },
      { title: "Enable disk encryption (BitLocker/FileVault) and escrow the key" },
      { title: "Create/enable the user account with least privilege; enforce MFA" },
      { title: "Verify backup / file-sync is protecting user data" },
      { title: "Deliver to the user, confirm login and orient them" },
    ],
  },
  {
    seedKey: "sop.server-build",
    kind: "RUNBOOK",
    name: "Server Build",
    description: "Standard build and hardening steps for a new physical or virtual server.",
    categoryName: "Operations",
    titleTemplate: "{{client.name}} — Server Build",
    summary: "Provision, harden, monitor and back up a new server before it goes into production.",
    defaultCategoryName: "Operations",
    tagNames: ["server", "deployment"],
    content: `# {{client.name}} — Server Build

Technician: {{tech.name}}  ·  Date: {{date}}

Build to a documented, monitored, backed-up standard. Do not put the server into production until backup and monitoring are confirmed.

## Server
- Role / purpose:
- Physical / virtual (host):
- Hostname / IP / VLAN:`,
    steps: [
      { title: "Provision hardware/VM to spec; set BIOS/hypervisor and RAID as required" },
      { title: "Install OS, apply all updates, set static IP, hostname and time source" },
      { title: "Join domain / configure roles and features for its purpose" },
      { title: "Harden: disable unused services, configure firewall, least-privilege admins" },
      { title: "Deploy RMM, patch and endpoint-protection agents; confirm check-in" },
      { title: "Configure monitoring/alerting for disk, services and health" },
      { title: "Configure and verify backups; run a test restore" },
      { title: "Document the server, its roles, dependencies and admin access in DocHub" },
      { title: "Change-control sign-off before production cutover" },
    ],
  },
  {
    seedKey: "sop.patch-management",
    kind: "RUNBOOK",
    name: "Patch Management SOP",
    description: "Repeatable monthly patch cycle: approve, deploy, verify and report.",
    categoryName: "Operations",
    titleTemplate: "{{client.name}} — Patch Management",
    summary: "Approve, stage, deploy and verify OS and third-party patches on a monthly cadence.",
    defaultCategoryName: "Operations",
    tagNames: ["patching", "maintenance"],
    content: `# {{client.name}} — Patch Management

Cycle owner: {{tech.name}}  ·  Cycle: {{date}}

Keep systems current without breaking production. Stage before broad deployment and always confirm servers actually rebooted and came back healthy.

## Maintenance Windows
- Workstations:
- Servers:

## Result
- Compliance % this cycle:
- Failures / exclusions:`,
    steps: [
      { title: "Review released OS + third-party updates; note any known-bad patches" },
      { title: "Approve patches; hold or exclude any flagged as risky" },
      { title: "Deploy to a pilot ring and monitor for issues" },
      { title: "Deploy to workstations within the maintenance window" },
      { title: "Deploy to servers in dependency order during their window" },
      { title: "Confirm servers rebooted and all services/apps are healthy" },
      { title: "Chase down failed/pending endpoints and remediate" },
      { title: "Record compliance % and report exceptions" },
    ],
  },
  {
    seedKey: "sop.printer-setup",
    kind: "RUNBOOK",
    name: "Printer Setup",
    description: "Install and document a network printer for a client site.",
    categoryName: "Operations",
    titleTemplate: "{{client.name}} — Printer Setup",
    summary: "Configure, deploy and document a network printer.",
    defaultCategoryName: "Operations",
    tagNames: ["printer"],
    content: `# {{client.name}} — Printer Setup

Technician: {{tech.name}}  ·  Date: {{date}}

## Printer
- Make / model:
- Location:
- Static IP / hostname:
- Deployment method: (direct IP / print server / cloud print)`,
    steps: [
      { title: "Physically install; connect to network and assign a static IP (or DHCP reservation)" },
      { title: "Set a strong admin password on the printer web UI and disable unused protocols" },
      { title: "Install the correct driver on the print server or reference deployment" },
      { title: "Deploy the printer to the target users/groups" },
      { title: "Test print, scan-to-email/folder, and duplex/finishing options" },
      { title: "Document IP, driver, deployment method and consumables in DocHub" },
    ],
  },
  {
    seedKey: "sop.vpn-setup",
    kind: "RUNBOOK",
    name: "VPN / Remote Access Setup",
    description: "Provision secure remote access for a user or site.",
    categoryName: "Operations",
    titleTemplate: "{{client.name}} — VPN / Remote Access Setup",
    summary: "Configure and document secure remote access with MFA.",
    defaultCategoryName: "Operations",
    tagNames: ["vpn", "remote-access"],
    content: `# {{client.name}} — VPN / Remote Access Setup

Technician: {{tech.name}}  ·  Date: {{date}}

Remote access is a top attack vector — MFA is mandatory, and access is least-privilege by role.

## Details
- VPN type / product:
- Endpoint / hostname:
- Auth source (AD/Entra/RADIUS):
- User / group:`,
    steps: [
      { title: "Confirm the access request is approved and scoped to the right resources" },
      { title: "Create/assign the account or certificate for the user" },
      { title: "Enforce MFA on the VPN/remote-access login" },
      { title: "Apply least-privilege access rules (only the needed subnets/apps)" },
      { title: "Deploy the client config/profile to the user's device" },
      { title: "Test connectivity, MFA prompt, and access to required resources only" },
      { title: "Document the access grant and update the remote-access record in DocHub" },
    ],
  },
  {
    seedKey: "sop.quarterly-review",
    kind: "RUNBOOK",
    name: "Quarterly Business Review Checklist",
    description: "Preparation checklist for a client QBR / technology alignment review.",
    categoryName: "Operations",
    titleTemplate: "{{client.name}} — Quarterly Business Review",
    summary: "Prepare and run a quarterly review of health, risk, roadmap and budget.",
    defaultCategoryName: "Operations",
    tagNames: ["qbr", "review"],
    content: `# {{client.name}} — Quarterly Business Review

Prepared by: {{tech.name}}  ·  Quarter ending: {{date}}

A good QBR is prepared, not improvised. Pull the data, form recommendations, and lead with business outcomes rather than tickets.

## Agenda
1. Service summary (tickets, response, satisfaction)
2. Health & risk (patch compliance, backups, security posture)
3. Asset lifecycle & warranties expiring
4. Roadmap & recommendations
5. Budget & renewals

## Open recommendations carried forward`,
    steps: [
      { title: "Pull ticket volume, response/resolution times and CSAT for the quarter" },
      { title: "Review patch compliance, backup success and any security incidents" },
      { title: "Review asset lifecycle: aging hardware, warranties and licenses expiring" },
      { title: "Review documentation completeness and update stale records" },
      { title: "Form recommendations with business justification and rough budget" },
      { title: "Build the QBR deck / summary" },
      { title: "Schedule and run the review with the client decision-maker" },
      { title: "Log agreed actions and owners; create follow-up tickets/projects" },
    ],
  },
]

export type SeedResult = {
  categories: number
  created: number
  restored: number
  updated: number
  total: number
}

/**
 * Idempotent upsert of the starter library, keyed by seedKey.
 *
 *   - Missing categories/templates are created.
 *   - Existing seed templates are un-archived (restore), preserving admin edits.
 *   - force=true additionally overwrites content back to the seed default.
 */
export async function applyTemplateSeeds(
  db: PrismaClient,
  opts: { force?: boolean } = {},
): Promise<SeedResult> {
  const force = opts.force === true
  const catIdByName = new Map<string, string>()

  for (const cat of TEMPLATE_CATEGORIES) {
    const row = await db.templateCategory.upsert({
      where: { name: cat.name },
      create: { name: cat.name, color: cat.color, order: cat.order },
      update: { color: cat.color, order: cat.order },
    })
    catIdByName.set(cat.name, row.id)
  }

  let created = 0
  let restored = 0
  let updated = 0

  for (const s of TEMPLATE_SEEDS) {
    const categoryId = s.categoryName ? catIdByName.get(s.categoryName) ?? null : null
    const fields = {
      kind: s.kind,
      name: s.name,
      description: s.description ?? null,
      categoryId,
      titleTemplate: s.titleTemplate ?? null,
      summary: s.summary ?? null,
      content: s.content ?? null,
      stepsJson: s.steps ?? undefined,
      tagNames: s.tagNames ?? [],
      defaultCategoryName: s.defaultCategoryName ?? null,
    }

    const existing = await db.template.findUnique({
      where: { seedKey: s.seedKey },
      select: { id: true, isArchived: true },
    })

    if (!existing) {
      await db.template.create({
        data: { ...fields, isSeed: true, seedKey: s.seedKey, isPublished: true },
      })
      created++
    } else {
      await db.template.update({
        where: { seedKey: s.seedKey },
        data: force ? { ...fields, isArchived: false } : { isArchived: false },
      })
      if (force) updated++
      else if (existing.isArchived) restored++
    }
  }

  return {
    categories: TEMPLATE_CATEGORIES.length,
    created,
    restored,
    updated,
    total: TEMPLATE_SEEDS.length,
  }
}
