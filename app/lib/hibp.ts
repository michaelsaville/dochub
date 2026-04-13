import crypto from "crypto"

// HaveIBeenPwned Pwned Passwords API — k-anonymity model.
// We SHA-1 the password, send only the first 5 hex chars of the hash to HIBP,
// and scan the returned suffix list for our own suffix. The plaintext never
// leaves this server.

type CacheEntry = { count: number; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const TTL_MS = 24 * 60 * 60 * 1000 // 24h

export async function checkPasswordBreach(plaintext: string): Promise<number> {
  if (!plaintext) return 0

  const hash = crypto.createHash("sha1").update(plaintext).digest("hex").toUpperCase()
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)

  const cached = cache.get(hash)
  if (cached && cached.expiresAt > Date.now()) return cached.count

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "DocHub-MSP" },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return -1 // -1 = check failed, caller decides how to display
    const body = await res.text()
    let count = 0
    for (const line of body.split("\n")) {
      const [s, c] = line.trim().split(":")
      if (s === suffix) { count = parseInt(c, 10) || 0; break }
    }
    cache.set(hash, { count, expiresAt: Date.now() + TTL_MS })
    return count
  } catch {
    return -1
  }
}
