/* DocHub Extension — Background Service Worker (MV3)
 *
 * Owns "Fill all", including split logins (Microsoft 365 / Entra, Google,
 * generic username-then-password pages):
 *
 *   popup  ──dochub:fillAll──▶  background: scan frames (no secrets) → reveal
 *                                credential on demand → fill matching frames.
 *   If a step is still missing (password / TOTP), background records a
 *   PENDING entry for that tab — ids + URLs only, never secrets — in
 *   chrome.storage.session (memory-only, not readable by content scripts),
 *   and injects a small watcher into the tab's frames.
 *   watcher ──dochub:stepReady──▶ background: re-checks tab / expiry / host,
 *   reveals again (fresh from the server, so RBAC + audit log apply per
 *   step), fills that one field in that one frame, forgets the secret.
 *
 * Pending fills expire after 2 minutes, on tab close, or once complete.
 */

importScripts("lib/domain.js", "lib/totp.js")

const BASE_URL = "https://dochub.pcc2k.com"
const STORAGE_KEY_APIKEY = "dochub_api_key"
const PENDING_TTL_MS = 2 * 60 * 1000
const FILL_FILES = ["lib/fieldmatch.js"]

chrome.runtime.onInstalled.addListener(() => {
  console.log("DocHub extension installed")
})

// ── API ───────────────────────────────────────────────────────────────────

async function getApiKey() {
  const s = await chrome.storage.local.get(STORAGE_KEY_APIKEY)
  return s[STORAGE_KEY_APIKEY] || ""
}

/** Reveal on demand. Server enforces API-key scope + TECH allowTechReveal. */
async function reveal(credId) {
  const key = await getApiKey()
  if (!key) throw new Error("No API key")
  const r = await fetch(`${BASE_URL}/api/v1/credentials/${encodeURIComponent(credId)}/reveal`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  })
  if (!r.ok) {
    let msg = `Reveal failed (${r.status})`
    try { const d = await r.json(); if (d && d.error) msg = d.error } catch {}
    throw new Error(msg)
  }
  return r.json()
}

async function otpFor(secret) {
  if (secret && secret.totp) {
    try { const t = await DocHubTotp.totp(secret.totp); if (t) return t.code } catch {}
  }
  return (secret && secret.totpCode) || null
}

// ── Pending split-login state (ids/urls only) ────────────────────────────

const pendingKey = tabId => `pending:${tabId}`

async function getPending(tabId) {
  const k = pendingKey(tabId)
  const s = await chrome.storage.session.get(k)
  const p = s[k]
  if (!p) return null
  if (Date.now() > p.expiresAt || !p.kinds || !p.kinds.length) {
    await chrome.storage.session.remove(k)
    return null
  }
  return p
}

async function setPending(tabId, p) {
  await chrome.storage.session.set({ [pendingKey(tabId)]: p })
}

async function clearPending(tabId) {
  await chrome.storage.session.remove(pendingKey(tabId))
}

// ── Script injection helpers ─────────────────────────────────────────────

/** Run `func` in all permitted frames; falls back to the top frame only. */
async function runInFrames(tabId, func, args, frameIds) {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true }
  try {
    await chrome.scripting.executeScript({ target, files: FILL_FILES })
    return await chrome.scripting.executeScript({ target, func, args: args || [] })
  } catch (e) {
    if (frameIds) throw e
    const top = { tabId, frameIds: [0] }
    await chrome.scripting.executeScript({ target: top, files: FILL_FILES })
    return await chrome.scripting.executeScript({ target: top, func, args: args || [] })
  }
}

async function startWatcher(tabId, kinds, ttlMs) {
  try {
    await runInFrames(tabId, (k, ttl) => self.DocHubFill.watch(k, ttl), [kinds, ttlMs])
  } catch {
    // no permission on this page (yet) — onUpdated will retry after navigation
  }
}

// ── Fill all (from popup) ─────────────────────────────────────────────────

async function fillAll({ tabId, credId, credUrl }) {
  const tab = await chrome.tabs.get(tabId)
  const originUrl = tab.url || ""

  // 1. Which frames have which fields? (no secrets sent)
  const scans = await runInFrames(tabId, () => self.DocHubFill.scan())
  const frames = scans
    .filter(r => r && r.result)
    .map(r => ({ frameId: r.frameId, ...r.result }))
    .filter(f => f.username || f.password || f.otp)
    // Top frame: the tech picked this credential for this page. Sub-frames
    // must match the credential / the page's site / a known IdP login host.
    .filter(f => f.frameId === 0 || DocHubDomain.isContinuationHostAllowed(f.url, originUrl, credUrl))

  // Nothing to fill here (yet) — don't reveal (each reveal is audit-logged).
  if (!frames.length) return { ok: false, reason: "no-fields" }

  // 2. Reveal only now, only once.
  let secret = await reveal(credId)
  const hasTotp = !!(secret.totp || secret.totpCode)
  const done = { username: false, password: false, otp: false }
  try {
    for (const f of frames) {
      const values = {
        username: f.username ? secret.username : null,
        password: f.password ? secret.password : null,
        otp: f.otp && hasTotp ? await otpFor(secret) : null,
        overwriteUsername: true,
      }
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [f.frameId] },
          func: v => self.DocHubFill.fill(v),
          args: [values],
        })
        const r = res && res.result
        if (r) { done.username ||= r.username; done.password ||= r.password; done.otp ||= r.otp }
      } catch {}
    }
  } finally {
    secret = null
  }

  if (!done.username && !done.password && !done.otp) {
    return { ok: false, reason: "fill-failed" }
  }

  // 3. Anything left for a later step?
  const kinds = []
  if (!done.password && !done.otp) kinds.push("password")
  if (hasTotp && !done.otp) kinds.push("otp")
  if (kinds.length) {
    await setPending(tabId, { credId, credUrl: credUrl || "", originUrl, kinds, expiresAt: Date.now() + PENDING_TTL_MS })
    await startWatcher(tabId, kinds, PENDING_TTL_MS)
  } else {
    await clearPending(tabId)
  }
  return { ok: true, filled: done, pending: kinds }
}

// ── Next step appeared (from injected watcher) ───────────────────────────

async function onStepReady(kind, sender) {
  const tabId = sender.tab && sender.tab.id
  if (tabId == null || (kind !== "password" && kind !== "otp")) return
  const p = await getPending(tabId)
  if (!p || !p.kinds.includes(kind)) return
  const frameUrl = sender.url || ""
  if (!DocHubDomain.isContinuationHostAllowed(frameUrl, p.originUrl, p.credUrl)) return

  // Claim the step before the network round-trip so a duplicate report can't double-fill.
  const rest = p.kinds.filter(k => k !== kind)
  if (rest.length) await setPending(tabId, { ...p, kinds: rest })
  else await clearPending(tabId)

  let secret = null
  try {
    secret = await reveal(p.credId)
    const values = kind === "password"
      ? { password: secret.password }
      : { otp: await otpFor(secret) }
    if (!values.password && !values.otp) return
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [sender.frameId || 0] },
      func: v => self.DocHubFill.fill(v),
      args: [values],
    })
    // password typed for the user → the 2FA step may follow on the next page
  } catch (e) {
    console.warn("DocHub step fill failed:", e && e.message)
  } finally {
    secret = null
  }
}

// ── Wiring ───────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string" || sender.id !== chrome.runtime.id) return false
  // Extension pages (the popup) have our chrome-extension:// origin; content
  // scripts report the web page's URL instead.
  const fromExtensionPage = typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""))

  if (msg.type === "dochub:fillAll") {
    // Only the extension's own popup may start a fill.
    if (!fromExtensionPage) return false
    fillAll(msg).then(sendResponse, e => sendResponse({ ok: false, reason: "error", error: e.message }))
    return true
  }

  if (msg.type === "dochub:cancelPending") {
    if (!fromExtensionPage) return false
    clearPending(msg.tabId).then(() => sendResponse({ ok: true }))
    return true
  }

  if (msg.type === "dochub:getPending") {
    if (!fromExtensionPage) return false
    getPending(msg.tabId).then(p => sendResponse(p ? { kinds: p.kinds, expiresAt: p.expiresAt } : null))
    return true
  }

  if (msg.type === "dochub:stepReady") {
    if (fromExtensionPage || !sender.tab) return false
    onStepReady(msg.kind, sender)
    return false
  }
  return false
})

// Full-page navigation (redirect to login.microsoftonline.com, password page
// on a new URL…): re-inject the watcher with whatever is still pending.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return
  const p = await getPending(tabId)
  if (!p) return
  await startWatcher(tabId, p.kinds, Math.max(p.expiresAt - Date.now(), 1000))
})

chrome.tabs.onRemoved.addListener(tabId => { clearPending(tabId) })
