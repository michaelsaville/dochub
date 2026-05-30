import "server-only"
import { randomInt } from "crypto"

/**
 * Minimal Microsoft Graph client for app-only (client credentials) flows.
 * Reuses the existing Entra app registration that powers DocHub SSO; the
 * extra Application permission needed for password rotation is
 * `User-PasswordProfile.ReadWrite.All` (admin consent required).
 *
 * Tokens are cached in-process for ~50 minutes (Graph tokens last 60).
 */

interface GraphConfig {
  tenantId: string
  clientId: string
  clientSecret: string
}

function getConfig(): GraphConfig | null {
  const tenantId = process.env.AZURE_AD_TENANT_ID
  const clientId = process.env.AZURE_AD_CLIENT_ID
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) return null
  return { tenantId, clientId, clientSecret }
}

export function graphConfigured(): boolean {
  return getConfig() !== null
}

let _tokenCache: { token: string; expiresAt: number } | null = null

async function getAppToken(): Promise<string> {
  const cfg = getConfig()
  if (!cfg) throw new Error("Microsoft Graph not configured")

  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.token
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: "https://graph.microsoft.com/.default",
  })

  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Graph token request failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = await res.json() as { access_token: string; expires_in: number }
  _tokenCache = {
    token: json.access_token,
    expiresAt: now + (json.expires_in - 60) * 1000,
  }
  return json.access_token
}

/**
 * Rotate a user's password via Graph. The new password must satisfy
 * Microsoft's policy (8+ chars, 3 of 4 char classes). Returns the new
 * password on success — caller persists the encrypted copy.
 *
 * `forceChangePasswordNextSignIn: false` keeps the rotation invisible
 * to the user — they don't get prompted to change it on next login. Set
 * to `true` if you want to force them to set their own.
 */
export async function rotateUserPassword(args: {
  upn: string
  newPassword: string
  forceChangeNextSignIn?: boolean
}): Promise<void> {
  const token = await getAppToken()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(args.upn)}`,
    {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        passwordProfile: {
          password: args.newPassword,
          forceChangePasswordNextSignIn: !!args.forceChangeNextSignIn,
        },
      }),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Graph PATCH /users failed (${res.status}): ${text.slice(0, 300)}`)
  }
}

/**
 * Generate a strong password that satisfies Microsoft password policy
 * (8+ chars, 3 of: upper, lower, digit, symbol). Defaults to 20 chars
 * for entropy. Avoids glyphs that frequently break copy/paste.
 */
export function generateStrongPassword(length = 20): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"   // omit I, O for clarity
  const lower = "abcdefghijkmnopqrstuvwxyz"  // omit l
  const digit = "23456789"                    // omit 0, 1
  const symbol = "!#$%*+-=?@^_~"
  const all = upper + lower + digit + symbol
  // CSPRNG — these are real Entra account passwords, never Math.random.
  const pick = (chars: string) => chars[randomInt(chars.length)]

  // Guarantee one of each class.
  const required = [pick(upper), pick(lower), pick(digit), pick(symbol)]
  const rest = Array.from({ length: Math.max(8, length) - required.length }, () => pick(all))
  // Fisher-Yates shuffle with a CSPRNG.
  const arr = [...required, ...rest]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join("")
}
