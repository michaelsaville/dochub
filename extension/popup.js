/* DocHub Browser Extension — popup (Manifest V3)
 *
 * API (API-key auth):
 *   GET /api/v1/credentials?search=…      metadata only (no secrets)
 *   GET /api/v1/credentials?clientId=…    metadata for one client
 *   GET /api/v1/credentials/:id/reveal    secrets, on demand; server enforces
 *                                         read-only keys + TECH allowTechReveal
 *
 * Secrets are never written to chrome.storage. Only ids/labels for
 * "last used on this site" are persisted. Revealed values in this popup are
 * wiped after REVEAL_TTL_MS or when the popup closes.
 */

const BASE_URL = "https://dochub.pcc2k.com"
const STORAGE_KEY_APIKEY = "dochub_api_key"
const STORAGE_KEY_LAST = "dochub_last_used"     // { [siteKey]: { credId, clientId, clientName, label, at } }
const REVEAL_TTL_MS = 60 * 1000
const MORE_FROM_CLIENT_LIMIT = 6

const D = self.DocHubDomain
const T = self.DocHubTotp

let apiKey = ""
let tabUrl = ""
let currentHost = ""
let currentSiteKey = ""
let currentTabId = null
let searchTimer = null
let autoQuery = ""          // the domain shown in the search box on open
let items = []              // flat list currently rendered (for keyboard nav)
let selected = 0
let revealed = {}           // credId → { password, totp, totpCode, wipeAt }
let tickTimer = null
let showGenerator = false
let renderSeq = 0

// ── Bootstrap ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY_APIKEY)
  apiKey = stored[STORAGE_KEY_APIKEY] || ""

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab) {
      currentTabId = tab.id
      tabUrl = tab.url || ""
      currentHost = D.hostOf(tabUrl)
      currentSiteKey = D.siteKey(tabUrl)
    }
  } catch {}

  if (!apiKey) renderSetup()
  else renderMain()
})

window.addEventListener("unload", wipeSecrets)

// ── Setup screen ──────────────────────────────────────────────────────────

const PINEAPPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="15" rx="5" ry="6.5"/><line x1="12" y1="10" x2="12" y2="19"/><line x1="8.5" y1="12" x2="15.5" y2="18"/><line x1="15.5" y1="12" x2="8.5" y2="18"/><path d="M12 8.5L12 4M12 8.5L9 5M12 8.5L15 5M9 5L7.5 3M15 5L16.5 3"/></svg>`

function renderSetup() {
  document.getElementById("app").innerHTML = `
    <div class="header">
      <div class="header-title"><div class="header-logo" style="background:none;width:auto;height:auto">${PINEAPPLE_SVG}</div>DocHub</div>
    </div>
    <div class="setup-section">
      <p style="color:#94a3b8;font-size:12px;margin-bottom:16px;line-height:1.6">
        Enter your DocHub API key to get started. You can create one in
        <strong style="color:#e2e8f0">Settings → API Keys</strong>.
      </p>
      <div class="label">API Key</div>
      <input id="api-key-input" class="input" type="password" placeholder="dhk_xxxxxxxx…" autofocus />
      <button class="btn" id="save-key-btn">Save & Connect</button>
    </div>
  `
  const input = document.getElementById("api-key-input")
  const save = async () => {
    const val = input.value.trim()
    if (!val) return
    const ok = await testApiKey(val)
    if (!ok) { toast("Invalid API key — check and try again", true); return }
    apiKey = val
    await chrome.storage.local.set({ [STORAGE_KEY_APIKEY]: val })
    renderMain()
  }
  document.getElementById("save-key-btn").addEventListener("click", save)
  input.addEventListener("keydown", e => { if (e.key === "Enter") save() })
  setTimeout(() => input.focus(), 30)
}

async function testApiKey(key) {
  try {
    const r = await fetch(`${BASE_URL}/api/v1/credentials?search=__dochub_key_check__`, {
      headers: { Authorization: `Bearer ${key}` }
    })
    return r.ok
  } catch {
    return false
  }
}

// ── Main screen ──────────────────────────────────────────────────────────

function renderMain() {
  const siteText = currentHost ? D.siteLabel(tabUrl) : ""
  document.getElementById("app").innerHTML = `
    <div class="header">
      <div class="header-title"><div class="header-logo" style="background:none;width:auto;height:auto">${PINEAPPLE_SVG}</div>DocHub</div>
      <div style="display:flex;align-items:center;gap:6px">
        ${siteText ? `<span class="header-domain" title="${esc(currentHost)}">${esc(siteText)}</span>` : ""}
        <button class="btn-sm" id="gen-toggle-btn" title="Password generator (Alt+G)">Gen</button>
        <button class="btn-sm" id="logout-btn" title="Change API key">Key</button>
      </div>
    </div>
    <div id="generator-section" class="gen-section" style="display:none">
      <div class="gen-row">
        <span id="gen-output" class="gen-output">Click Generate</span>
        <button class="btn-copy" id="gen-copy-btn">Copy</button>
        <button class="btn-copy btn-fill" id="gen-fill-btn" title="Fill into the password field on the page">Fill</button>
      </div>
      <div class="gen-opts">
        <label>Length <input type="range" id="gen-length" min="8" max="64" value="20"><span id="gen-length-val">20</span></label>
        <label><input type="checkbox" id="gen-upper" checked>A-Z</label>
        <label><input type="checkbox" id="gen-digits" checked>0-9</label>
        <label><input type="checkbox" id="gen-symbols" checked>!@#</label>
        <button class="btn" id="gen-btn" style="width:auto;padding:4px 12px;font-size:11px">Generate</button>
      </div>
    </div>
    <div class="search-bar">
      <input id="search-input" class="search-input" placeholder="Search credentials, clients, URLs…" autocomplete="off" spellcheck="false" autofocus />
    </div>
    <div id="pending-bar" class="pending-bar" style="display:none"></div>
    <div id="results" class="results" role="listbox" aria-label="Credentials">
      <div class="empty">Searching…</div>
    </div>
    <div class="status-bar">
      <span class="kbd-hints"><kbd>↑↓</kbd> select <kbd>Enter</kbd> fill all <kbd>Alt</kbd>+<kbd>U</kbd>/<kbd>P</kbd>/<kbd>T</kbd> copy</span>
      <span style="display:inline-flex;gap:8px;align-items:center">
        <a href="#" id="allow-sites" style="display:none;color:#64748b" title="Lets Fill all follow a login across redirects to any site (e.g. Okta, vendor SSO). Microsoft and Google sign-in pages work without this.">Allow all sites</a>
        <a href="${BASE_URL}" target="_blank" style="color:#64748b;text-decoration:none">DocHub ↗</a>
      </span>
    </div>
  `
  setupAllSitesLink()
  document.getElementById("logout-btn").addEventListener("click", () => {
    if (confirm("Clear API key?")) {
      apiKey = ""
      wipeSecrets()
      chrome.storage.local.remove(STORAGE_KEY_APIKEY)
      renderSetup()
    }
  })

  // Generator
  document.getElementById("gen-toggle-btn").addEventListener("click", toggleGenerator)
  document.getElementById("gen-length").addEventListener("input", e => {
    document.getElementById("gen-length-val").textContent = e.target.value
  })
  document.getElementById("gen-btn").addEventListener("click", () => {
    const len = parseInt(document.getElementById("gen-length").value)
    const upper = document.getElementById("gen-upper").checked
    const digits = document.getElementById("gen-digits").checked
    const symbols = document.getElementById("gen-symbols").checked
    document.getElementById("gen-output").textContent = generatePassword(len, upper, digits, symbols)
  })
  document.getElementById("gen-copy-btn").addEventListener("click", () => {
    const pw = document.getElementById("gen-output").textContent
    if (pw && pw !== "Click Generate") copyText(pw)
  })
  document.getElementById("gen-fill-btn").addEventListener("click", () => {
    const pw = document.getElementById("gen-output").textContent
    if (pw && pw !== "Click Generate" && currentTabId) fillGenerated(currentTabId, pw)
  })

  const searchInput = document.getElementById("search-input")
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer)
    const q = searchInput.value.trim()
    if (!q) {
      if (currentHost) { searchTimer = setTimeout(() => loadForSite(), 150); return }
      setResultsHtml('<div class="empty">Type to search credentials…</div>')
      items = []
      return
    }
    searchTimer = setTimeout(() => (q === autoQuery ? loadForSite() : doSearch(q)), 250)
  })
  searchInput.addEventListener("keydown", onSearchKeydown)
  document.addEventListener("keydown", onGlobalKeydown)

  // Event delegation — one listener for every result button.
  const results = document.getElementById("results")
  results.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]")
    const row = e.target.closest(".cred-item")
    if (row) setSelected(Number(row.dataset.index), false)
    if (btn) handleAction(btn.dataset.action, btn.dataset.id)
  })

  if (currentHost) {
    autoQuery = D.registrableDomain(currentHost)
    searchInput.value = autoQuery
    searchInput.select()
    loadForSite()
  } else {
    setResultsHtml('<div class="empty">Type to search credentials…</div>')
  }
  // Popups sometimes ignore autofocus — force it.
  setTimeout(() => searchInput.focus(), 30)

  refreshPendingBar()
  startTick()
}

const ALL_SITES = { origins: ["https://*/*", "http://*/*"] }

async function setupAllSitesLink() {
  const a = document.getElementById("allow-sites")
  if (!a || !chrome.permissions) return
  try { if (await chrome.permissions.contains(ALL_SITES)) return } catch { return }
  a.style.display = "inline"
  a.addEventListener("click", async e => {
    e.preventDefault()
    try {
      const ok = await chrome.permissions.request(ALL_SITES)
      if (ok) { a.style.display = "none"; toast("Fill all can now follow logins on any site") }
    } catch (err) { toast(err.message, true) }
  })
}

function toggleGenerator() {
  const sec = document.getElementById("generator-section")
  showGenerator = !showGenerator
  sec.style.display = showGenerator ? "block" : "none"
}

// ── Data loading ─────────────────────────────────────────────────────────

async function api(path) {
  const r = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (r.status === 401) throw new Error("API key rejected — click Key to update it")
  if (!r.ok) throw new Error(`DocHub returned ${r.status}`)
  const d = await r.json()
  return Array.isArray(d) ? d : (d.credentials || [])
}

const normalize = c => ({ ...c, clientName: c.clientName || c.client?.name || "" })

async function getLastUsedMap() {
  const s = await chrome.storage.local.get(STORAGE_KEY_LAST)
  return s[STORAGE_KEY_LAST] || {}
}

async function rememberUse(cred) {
  if (!currentSiteKey || !cred) return
  const map = await getLastUsedMap()
  map[currentSiteKey] = {
    credId: cred.id,
    clientId: cred.clientId || cred.client?.id || null,
    clientName: cred.clientName || "",
    label: cred.label || "",
    at: Date.now(),
  }
  // keep the map small: newest 300 sites
  const keys = Object.keys(map).sort((a, b) => (map[b].at || 0) - (map[a].at || 0))
  for (const k of keys.slice(300)) delete map[k]
  await chrome.storage.local.set({ [STORAGE_KEY_LAST]: map })
}

/** Auto mode: credentials for the current site + last used + same client. */
async function loadForSite() {
  const seq = ++renderSeq
  setResultsHtml('<div class="empty">Loading…</div>')
  try {
    const last = (await getLastUsedMap())[currentSiteKey] || null
    const terms = D.searchTermsFor(tabUrl)
    const fetches = terms.map(t => api(`/api/v1/credentials?search=${encodeURIComponent(t)}`).catch(() => []))
    if (last?.clientId) fetches.push(api(`/api/v1/credentials?clientId=${encodeURIComponent(last.clientId)}`).catch(() => []))
    const lists = await Promise.all(fetches)
    if (seq !== renderSeq) return

    const byId = new Map()
    for (const list of lists) for (const c of list) if (!byId.has(c.id)) byId.set(c.id, normalize(c))

    const lastCred = last ? byId.get(last.credId) || null : null
    const matches = []
    for (const c of byId.values()) {
      const m = D.matchScore(c.url, tabUrl)
      if (m.score > 0) matches.push({ ...c, _score: m.score, _reason: m.reason })
    }
    matches.sort((a, b) => b._score - a._score || (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0) || a.label.localeCompare(b.label))

    // "More from <client>": last-used client, else the top match's client.
    const moreClientId = last?.clientId || matches[0]?.clientId || null
    let more = []
    if (moreClientId) {
      let clientList = [...byId.values()].filter(c => c.clientId === moreClientId)
      if (!last?.clientId) {
        clientList = (await api(`/api/v1/credentials?clientId=${encodeURIComponent(moreClientId)}`).catch(() => [])).map(normalize)
        if (seq !== renderSeq) return
      }
      const shown = new Set(matches.map(c => c.id))
      if (lastCred) shown.add(lastCred.id)
      more = clientList.filter(c => !shown.has(c.id))
    }

    const sections = []
    if (lastCred) {
      const m = D.matchScore(lastCred.url, tabUrl)
      sections.push({ title: "Last used on this site", creds: [{ ...lastCred, _score: m.score, _reason: m.reason, _last: true }] })
    }
    const rest = matches.filter(c => !lastCred || c.id !== lastCred.id)
    if (rest.length) sections.push({ title: `Matches for ${D.siteLabel(tabUrl)}`, creds: rest })
    if (more.length) {
      const name = more[0].clientName || last?.clientName || "this client"
      sections.push({ title: `More from ${name}`, creds: more.slice(0, MORE_FROM_CLIENT_LIMIT), extra: Math.max(more.length - MORE_FROM_CLIENT_LIMIT, 0) })
    }

    if (!sections.length) {
      setResultsHtml(`<div class="empty">No saved credentials for ${esc(D.siteLabel(tabUrl))}.<br>Type a client or credential name to search.</div>`)
      items = []
      return
    }
    renderSections(sections)
  } catch (e) {
    if (seq === renderSeq) setResultsHtml(`<div class="empty">${esc(e.message)}</div>`)
  }
}

async function doSearch(query) {
  const seq = ++renderSeq
  setResultsHtml('<div class="empty">Loading…</div>')
  try {
    const list = (await api(`/api/v1/credentials?search=${encodeURIComponent(query)}`)).map(normalize)
    if (seq !== renderSeq) return
    if (!list.length) {
      setResultsHtml(`<div class="empty">No credentials found for "${esc(query)}"</div>`)
      items = []
      return
    }
    const last = (await getLastUsedMap())[currentSiteKey]
    const scored = list.map(c => {
      const m = currentHost ? D.matchScore(c.url, tabUrl) : { score: 0, reason: null }
      return { ...c, _score: m.score, _reason: m.reason, _last: !!last && last.credId === c.id }
    })
    scored.sort((a, b) => (b._last ? 1 : 0) - (a._last ? 1 : 0) || b._score - a._score)
    renderSections([{ title: null, creds: scored }])
  } catch (e) {
    if (seq === renderSeq) setResultsHtml(`<div class="empty">${esc(e.message)}</div>`)
  }
}

// ── Rendering ────────────────────────────────────────────────────────────

function setResultsHtml(html) {
  document.getElementById("results").innerHTML = html
}

function renderSections(sections) {
  items = []
  let html = ""
  for (const s of sections) {
    if (s.title) html += `<div class="section-title">${esc(s.title)}</div>`
    for (const c of s.creds) {
      html += credHtml(c, items.length)
      items.push(c)
    }
    if (s.extra) html += `<div class="section-more">+${s.extra} more — type the client name to see all</div>`
  }
  setResultsHtml(html)
  selected = 0
  setSelected(0, false)
}

const REASON_LABEL = { exact: "this site", subdomain: "this site", site: "same domain", microsoft: "Microsoft 365", google: "Google" }

function credHtml(c, index) {
  const rev = revealed[c.id]
  const reason = c._reason ? REASON_LABEL[c._reason] || c._reason : ""
  return `
    <div class="cred-item" id="cred-${esc(c.id)}" data-index="${index}" role="option" aria-selected="false">
      <div class="cred-header">
        <div style="min-width:0">
          <span class="cred-label">${esc(c.label)}</span>
          ${c._last ? ' <span class="tag-last">last used</span>' : ""}
          ${reason ? ` <span class="tag-autofill">${esc(reason)}</span>` : ""}
          ${c.hasTotp ? ' <span class="tag-totp">2FA</span>' : ""}
          ${c.notes ? ' <span class="tag-notes">notes</span>' : ""}
        </div>
        <span class="cred-client">${esc(c.clientName || "")}</span>
      </div>
      ${c.username ? `<div class="cred-username">${esc(c.username)}</div>` : ""}
      <div class="cred-actions">
        <button class="btn-copy btn-fill" data-action="fill-all" data-id="${esc(c.id)}" title="Fill username, password and 2FA code (Enter)">Fill all</button>
        ${c.username ? `<button class="btn-copy" data-action="copy-username" data-id="${esc(c.id)}" title="Alt+U">User</button>` : ""}
        <button class="btn-copy" data-action="copy-password" data-id="${esc(c.id)}" title="Alt+P">Pass</button>
        ${c.hasTotp ? `<button class="btn-copy" data-action="copy-totp" data-id="${esc(c.id)}" title="Alt+T">Code</button>` : ""}
        ${rev ? "" : `<button class="btn-copy" data-action="reveal" data-id="${esc(c.id)}" title="Alt+R">Reveal</button>`}
      </div>
      ${rev ? revealedHtml(c, rev) : ""}
      ${c.notes ? `<div class="cred-notes">${esc(c.notes)}</div>` : ""}
    </div>
  `
}

function revealedHtml(c, rev) {
  return `
    ${rev.password ? `
      <div class="secret-row">
        <span class="secret-val">${esc(rev.password)}</span>
      </div>` : ""}
    ${rev.code ? `
      <div class="secret-row">
        <span class="totp-code" id="totp-${esc(c.id)}">${esc(rev.code)}</span>
        <span class="totp-timer" id="totp-timer-${esc(c.id)}"></span>
      </div>` : ""}
    <div class="secret-hint">Hidden again in <span data-wipe="${esc(c.id)}"></span>s</div>
  `
}

function rerenderItem(id) {
  const idx = items.findIndex(c => c.id === id)
  const el = document.getElementById(`cred-${id}`)
  if (idx < 0 || !el) return
  el.outerHTML = credHtml(items[idx], idx)
  setSelected(selected, false)
}

function setSelected(i, scroll = true) {
  if (!items.length) return
  selected = Math.max(0, Math.min(items.length - 1, i))
  document.querySelectorAll(".cred-item").forEach(el => {
    const on = Number(el.dataset.index) === selected
    el.classList.toggle("selected", on)
    el.setAttribute("aria-selected", on ? "true" : "false")
    if (on && scroll) el.scrollIntoView({ block: "nearest" })
  })
}

// ── Keyboard ─────────────────────────────────────────────────────────────

function onSearchKeydown(e) {
  if (e.key === "ArrowDown") { e.preventDefault(); setSelected(selected + 1) }
  else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(selected - 1) }
  else if (e.key === "Enter") {
    e.preventDefault()
    const c = items[selected]
    if (c) handleAction("fill-all", c.id)
  } else if (e.key === "Escape") {
    const input = e.currentTarget
    if (input.value && input.value !== autoQuery) {
      e.preventDefault()
      input.value = autoQuery
      input.dispatchEvent(new Event("input"))
    }
    // otherwise let Escape close the popup
  }
}

function onGlobalKeydown(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return
  const k = e.key.toLowerCase()
  if (k === "g") { e.preventDefault(); toggleGenerator(); return }
  const c = items[selected]
  if (!c) return
  const map = { u: "copy-username", p: "copy-password", t: "copy-totp", r: "reveal" }
  // Alt+letter on macOS produces symbols in e.key — fall back to e.code.
  const action = map[k] || map[(e.code || "").replace(/^Key/, "").toLowerCase()]
  if (action) { e.preventDefault(); handleAction(action, c.id) }
}

// ── Actions ──────────────────────────────────────────────────────────────

async function revealNow(id) {
  const r = await fetch(`${BASE_URL}/api/v1/credentials/${encodeURIComponent(id)}/reveal`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  })
  if (!r.ok) {
    let msg = "Could not reveal credential"
    try { const d = await r.json(); if (d?.error) msg = d.error } catch {}
    throw new Error(msg)
  }
  return r.json()
}

async function currentCode(secret) {
  if (secret?.totp) {
    try { const t = await T.totp(secret.totp); if (t) return t.code } catch {}
  }
  return secret?.totpCode || null
}

async function handleAction(action, id) {
  const cred = items.find(c => c.id === id)
  if (!cred) return
  try {
    if (action === "copy-username") {
      if (!cred.username) { toast("No username saved", true); return }
      await copyText(cred.username, "Username copied")
      rememberUse(cred)
      return
    }

    if (action === "fill-all") {
      if (!currentTabId) { toast("No active tab", true); return }
      toast("Filling…")
      const res = await chrome.runtime.sendMessage({ type: "dochub:fillAll", tabId: currentTabId, credId: id, credUrl: cred.url || "" })
      if (!res?.ok) {
        const why = res?.error || (res?.reason === "no-fields" ? "No login fields found on this page" : "Could not fill — try copying instead")
        toast(why, true)
        return
      }
      rememberUse(cred)
      const parts = []
      if (res.filled.username) parts.push("username")
      if (res.filled.password) parts.push("password")
      if (res.filled.otp) parts.push("code")
      let msg = `Filled ${parts.join(" + ")}`
      if (res.pending?.length) msg += ` · ${res.pending.join(" + ")} on next step`
      toast(msg)
      // Get out of the way so the tech can click Next / Sign in.
      setTimeout(() => window.close(), res.pending?.length ? 1400 : 700)
      return
    }

    if (action === "copy-password" || action === "copy-totp" || action === "reveal") {
      let rev = revealed[id]
      if (!rev) {
        const s = await revealNow(id)
        rev = { password: s.password || "", totp: s.totp || null, totpCode: s.totpCode || null, wipeAt: Date.now() + REVEAL_TTL_MS }
        rev.code = await currentCode(rev)
        if (action === "reveal") {
          revealed[id] = rev
        }
      }
      rememberUse(cred)
      if (action === "reveal") { rerenderItem(id); return }
      if (action === "copy-password") {
        if (!rev.password) { toast("No password saved", true); return }
        await copyText(rev.password, "Password copied")
      } else {
        const code = await currentCode(rev)
        if (!code) { toast("No 2FA secret saved", true); return }
        await copyText(code, "2FA code copied")
      }
      // copied-but-not-revealed values are dropped right away
      if (!revealed[id]) rev = null
    }
  } catch (e) {
    toast(e.message, true)
  }
}

// ── Pending split-login indicator ────────────────────────────────────────

async function refreshPendingBar() {
  const bar = document.getElementById("pending-bar")
  if (!bar || currentTabId == null) return
  let p = null
  try { p = await chrome.runtime.sendMessage({ type: "dochub:getPending", tabId: currentTabId }) } catch {}
  if (!p) { bar.style.display = "none"; return }
  const secs = Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000))
  bar.innerHTML = `Waiting to fill <strong>${esc(p.kinds.join(" + "))}</strong> on the next step (${secs}s) <button class="btn-copy" id="pending-cancel">Cancel</button>`
  bar.style.display = "flex"
  document.getElementById("pending-cancel").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "dochub:cancelPending", tabId: currentTabId })
    bar.style.display = "none"
  })
}

// ── Timers: TOTP countdown + reveal wipe ─────────────────────────────────

function startTick() {
  if (tickTimer) clearInterval(tickTimer)
  let n = 0
  tickTimer = setInterval(async () => {
    const now = Date.now()
    const s = 30 - (Math.floor(now / 1000) % 30)
    for (const id of Object.keys(revealed)) {
      const rev = revealed[id]
      if (now >= rev.wipeAt) {
        delete revealed[id]
        rerenderItem(id)
        continue
      }
      const w = document.querySelector(`[data-wipe="${CSS.escape(id)}"]`)
      if (w) w.textContent = Math.ceil((rev.wipeAt - now) / 1000)
      const timer = document.getElementById(`totp-timer-${id}`)
      if (timer) { timer.textContent = `${s}s`; timer.style.color = s <= 5 ? "#f59e0b" : "#64748b" }
      if (rev.totp && (s === 30 || !rev.code)) {
        rev.code = await currentCode(rev)
        const el = document.getElementById(`totp-${id}`)
        if (el && rev.code) el.textContent = rev.code
      }
    }
    if (++n % 5 === 0) refreshPendingBar()
  }, 1000)
}

function wipeSecrets() {
  revealed = {}
}

// ── Helpers ───────────────────────────────────────────────────────────────

function esc(s) {
  if (s == null) return ""
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

async function copyText(text, msg = "Copied!") {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement("textarea")
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand("copy")
    document.body.removeChild(ta)
  }
  toast(msg)
}

// ── Password Generator ───────────────────────────────────────────────────

function generatePassword(length = 20, upper = true, digits = true, symbols = true) {
  let chars = "abcdefghijklmnopqrstuvwxyz"
  if (upper) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  if (digits) chars += "0123456789"
  if (symbols) chars += "!@#$%^&*()-_=+[]{}|;:,.<>?"
  // rejection sampling — no modulo bias
  const limit = Math.floor(0x100000000 / chars.length) * chars.length
  const out = []
  const buf = new Uint32Array(1)
  while (out.length < length) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) out.push(chars[buf[0] % chars.length])
  }
  return out.join("")
}

/** Generated password → the page's password field (top frame only). */
async function fillGenerated(tabId, pw) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["lib/fieldmatch.js"] })
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: p => self.DocHubFill.fill({ password: p }),
      args: [pw],
    })
    toast(res?.result?.password ? "Filled!" : "No password field found", !res?.result?.password)
  } catch {
    toast("Could not fill — try copying instead", true)
  }
}

let toastTimer = null
function toast(msg, isError = false) {
  const el = document.getElementById("toast")
  el.textContent = msg
  el.style.background = isError ? "#7f1d1d" : "#166534"
  el.style.display = "block"
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.style.display = "none" }, 2500)
}
