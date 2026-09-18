// Plain-JS twin of lib/notes-intake-secrets.ts for host CLI scripts
// (notes-ingest.mjs, notes-ingest-files.mjs, backfill). Same AES-256-GCM
// format + "enc:v1:" marker as the vault (lib/crypto). Keep in sync.
import crypto from "node:crypto"

const ALG = "aes-256-gcm"
const PREFIX = "enc:v1:"
export const SECRET_KEYS_BY_KIND = { credential: ["password", "totp"], phone_extension: ["sipPassword"] }
const ALL = new Set(Object.values(SECRET_KEYS_BY_KIND).flat())

function key() {
  const k = process.env.ENCRYPTION_KEY
  if (!k) throw new Error("ENCRYPTION_KEY is not set")
  return Buffer.from(k, "hex")
}
export function isSealed(v) { return typeof v === "string" && v.startsWith(PREFIX) }
export function sealValue(plain) {
  if (plain == null || plain === "") return plain
  const s = String(plain)
  if (isSealed(s)) return s
  const iv = crypto.randomBytes(16)
  const c = crypto.createCipheriv(ALG, key(), iv)
  const enc = Buffer.concat([c.update(s, "utf8"), c.final()])
  const tag = c.getAuthTag()
  return PREFIX + [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":")
}
export function openValue(v) {
  if (!isSealed(v)) return v
  const [ivh, tagh, ench] = v.slice(PREFIX.length).split(":")
  const d = crypto.createDecipheriv(ALG, key(), Buffer.from(ivh, "hex"))
  d.setAuthTag(Buffer.from(tagh, "hex"))
  return Buffer.concat([d.update(Buffer.from(ench, "hex")), d.final()]).toString("utf8")
}
export function sealEntities(entities) {
  return (entities || []).map((e) => {
    const eid = e?.eid || crypto.randomUUID().slice(0, 8)
    const keys = SECRET_KEYS_BY_KIND[e?.kind] || []
    if (!keys.length || !e?.fields) return { ...e, eid }
    const f = { ...e.fields }
    for (const k of keys) if (f[k]) f[k] = sealValue(f[k])
    return { ...e, eid, fields: f }
  })
}
export { ALL as ALL_SECRET_KEYS }
