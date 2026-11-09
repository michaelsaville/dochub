/* DocHub extension — RFC 6238 TOTP via WebCrypto (popup + background + node test).
 * Accepts a bare base32 seed or an otpauth:// URI (secret/digits/period/algorithm).
 * The seed is passed in per call and never stored.
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module === "object" && module.exports) module.exports = api
  else root.DocHubTotp = api
})(typeof self !== "undefined" ? self : this, function () {
  "use strict"

  function base32Decode(s) {
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    const clean = String(s).toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "")
    let bits = 0, value = 0
    const out = []
    for (const ch of clean) {
      const idx = alpha.indexOf(ch)
      if (idx === -1) continue
      value = (value << 5) | idx
      bits += 5
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
    }
    return new Uint8Array(out)
  }

  function parseSeed(seed) {
    const s = String(seed || "").trim()
    if (/^otpauth:\/\//i.test(s)) {
      try {
        const u = new URL(s)
        const p = u.searchParams
        const algo = (p.get("algorithm") || "SHA1").toUpperCase().replace("-", "")
        return {
          secret: p.get("secret") || "",
          digits: Math.min(Math.max(parseInt(p.get("digits") || "6", 10) || 6, 6), 8),
          period: Math.max(parseInt(p.get("period") || "30", 10) || 30, 1),
          hash: algo === "SHA256" ? "SHA-256" : algo === "SHA512" ? "SHA-512" : "SHA-1",
        }
      } catch {}
    }
    return { secret: s, digits: 6, period: 30, hash: "SHA-1" }
  }

  /** → { code, remaining } or null if the seed is unusable. */
  async function totp(seed, nowMs) {
    const cfg = parseSeed(seed)
    const key = base32Decode(cfg.secret)
    if (!key.length) return null
    const subtle = (globalThis.crypto && globalThis.crypto.subtle)
    if (!subtle) return null
    const now = Math.floor((nowMs ?? Date.now()) / 1000)
    let counter = Math.floor(now / cfg.period)
    const msg = new Uint8Array(8)
    for (let i = 7; i >= 0; i--) { msg[i] = counter & 0xff; counter = Math.floor(counter / 256) }
    const k = await subtle.importKey("raw", key, { name: "HMAC", hash: cfg.hash }, false, ["sign"])
    const h = new Uint8Array(await subtle.sign("HMAC", k, msg))
    const off = h[h.length - 1] & 0xf
    const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
    const code = String(bin % 10 ** cfg.digits).padStart(cfg.digits, "0")
    return { code, remaining: cfg.period - (now % cfg.period), period: cfg.period }
  }

  return { totp, base32Decode, parseSeed }
})
