import { prisma } from "@/lib/prisma"

/**
 * Extract the originating client IP from a request. Behind a reverse
 * proxy (Caddy/nginx), use the leftmost X-Forwarded-For entry. Falls back
 * to X-Real-IP, then unknown.
 */
export function extractRequestIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  const xri = headers.get("x-real-ip")
  if (xri) return xri.trim()
  return null
}

/**
 * Tailscale CGNAT range is always allowed so a broken allowlist can be
 * recovered from a trusted client on the tailnet.
 */
const TAILSCALE_CIDR = "100.64.0.0/10"

/**
 * Match a single IP against a CIDR (IPv4 or IPv6 unsupported — IPv4 only
 * for MVP). Returns true on CIDR hit. Accepts bare IPs (treated as /32).
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  if (!ip.includes(".")) return false // IPv6 — not implemented
  const [net, maskStr] = cidr.includes("/") ? cidr.split("/") : [cidr, "32"]
  const mask = parseInt(maskStr, 10)
  if (!Number.isFinite(mask) || mask < 0 || mask > 32) return false
  const ipInt = ipv4ToInt(ip)
  const netInt = ipv4ToInt(net)
  if (ipInt == null || netInt == null) return false
  if (mask === 0) return true
  const maskInt = (~0 << (32 - mask)) >>> 0
  return (ipInt & maskInt) === (netInt & maskInt)
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const o = parseInt(p, 10)
    if (!Number.isFinite(o) || o < 0 || o > 255) return null
    n = (n * 256) + o
  }
  return n >>> 0
}

/**
 * Is the request's IP allowed for this staff user? Always-true if the
 * global flag is off (or enforcement misconfigured) — we never lock out
 * on accident. When enforced: Tailscale always allowed; empty per-user
 * list means "no extra restriction beyond Tailscale" — i.e., only tailnet
 * access; non-empty list is the explicit allow.
 */
export async function isStaffIpAllowed(
  headers: Headers,
  user: { ipAllowlist: string[] } | null,
): Promise<{ allowed: boolean; reason?: string; ip: string | null }> {
  const flag = await prisma.appSetting.findUnique({
    where: { key: "security:staff_ip_allowlist_enabled" },
    select: { value: true },
  })
  const enforced = flag?.value === "true"
  const ip = extractRequestIp(headers)

  if (!enforced) return { allowed: true, ip }
  if (!user) return { allowed: false, reason: "Unknown user", ip }
  if (!ip) return { allowed: false, reason: "No origin IP on request", ip }

  if (ipInCidr(ip, TAILSCALE_CIDR)) return { allowed: true, ip }
  if (user.ipAllowlist.length === 0) {
    return { allowed: false, reason: "IP allowlist enforced but user has no entries and request is not on Tailscale", ip }
  }
  for (const cidr of user.ipAllowlist) {
    if (ipInCidr(ip, cidr)) return { allowed: true, ip }
  }
  return { allowed: false, reason: `IP ${ip} not in allowlist`, ip }
}
