/* DocHub Browser Extension — Manifest V3
 * Uses /api/v1/credentials (list + reveal) with API key auth
 */

const BASE_URL = "https://dochub.pcc2k.com"
const STORAGE_KEY_APIKEY = "dochub_api_key"

let apiKey = ""
let currentDomain = ""
let currentTabId = null
let searchTimer = null
let revealedData = {}   // credId → { password, totpCode, totpSecret }
let totpTimer = null
let showGenerator = false

// ── Bootstrap ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY_APIKEY)
  apiKey = stored[STORAGE_KEY_APIKEY] || ""

  // Get current tab domain for auto-search
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.url) {
      const url = new URL(tab.url)
      currentDomain = url.hostname.replace(/^www\./, "")
      currentTabId = tab.id
    }
  } catch {}

  if (!apiKey) {
    renderSetup()
  } else {
    renderMain()
  }
})

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
      <input id="api-key-input" class="input" type="password" placeholder="dh_xxxxxxxx…" />
      <button class="btn" id="save-key-btn">Save & Connect</button>
    </div>
  `
  document.getElementById("save-key-btn").addEventListener("click", async () => {
    const val = document.getElementById("api-key-input").value.trim()
    if (!val) return
    // Validate by fetching credentials
    const ok = await testApiKey(val)
    if (!ok) {
      toast("Invalid API key — check and try again", true)
      return
    }
    apiKey = val
    await chrome.storage.local.set({ [STORAGE_KEY_APIKEY]: val })
    renderMain()
  })
}

async function testApiKey(key) {
  try {
    const r = await fetch(`${BASE_URL}/api/v1/credentials?limit=1`, {
      headers: { Authorization: `Bearer ${key}` }
    })
    return r.ok
  } catch {
    return false
  }
}

// ── Main screen ──────────────────────────────────────────────────────────

function renderMain() {
  document.getElementById("app").innerHTML = `
    <div class="header">
      <div class="header-title"><div class="header-logo" style="background:none;width:auto;height:auto">${PINEAPPLE_SVG}</div>DocHub</div>
      <div style="display:flex;align-items:center;gap:6px">
        ${currentDomain ? `<span class="header-domain">${currentDomain}</span>` : ""}
        <button class="btn-sm" id="gen-toggle-btn" title="Password Generator">Gen</button>
        <button class="btn-sm" id="logout-btn">Key</button>
      </div>
    </div>
    <div id="generator-section" class="gen-section" style="display:none">
      <div class="gen-row">
        <span id="gen-output" class="gen-output">Click Generate</span>
        <button class="btn-copy" id="gen-copy-btn">Copy</button>
        <button class="btn-copy btn-fill" id="gen-fill-btn" title="Fill into active page">Fill</button>
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
      <input id="search-input" class="search-input" placeholder="Search credentials…" autofocus />
    </div>
    <div id="results" class="results">
      <div class="empty">Searching…</div>
    </div>
    <div class="status-bar">
      <span>DocHub · PCC2K</span>
      <a href="${BASE_URL}" target="_blank" style="color:#64748b;text-decoration:none">Open DocHub ↗</a>
    </div>
  `
  document.getElementById("logout-btn").addEventListener("click", () => {
    if (confirm("Clear API key?")) {
      apiKey = ""
      chrome.storage.local.remove(STORAGE_KEY_APIKEY)
      renderSetup()
    }
  })

  // Generator
  document.getElementById("gen-toggle-btn").addEventListener("click", () => {
    const sec = document.getElementById("generator-section")
    showGenerator = !showGenerator
    sec.style.display = showGenerator ? "block" : "none"
  })
  document.getElementById("gen-length").addEventListener("input", (e) => {
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
    if (pw && pw !== "Click Generate" && currentTabId) {
      fillInPage(currentTabId, { password: pw })
    }
  })

  const searchInput = document.getElementById("search-input")

  // Auto-search by domain on load
  if (currentDomain) {
    searchInput.value = currentDomain
    doSearch(currentDomain)
  } else {
    document.getElementById("results").innerHTML = '<div class="empty">Type to search credentials…</div>'
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer)
    const q = searchInput.value.trim()
    if (!q) {
      document.getElementById("results").innerHTML = '<div class="empty">Type to search credentials…</div>'
      return
    }
    searchTimer = setTimeout(() => doSearch(q), 300)
  })

  // TOTP auto-refresh
  startTotpTimer()
}

// ── Search ────────────────────────────────────────────────────────────────

async function doSearch(query) {
  document.getElementById("results").innerHTML = '<div class="empty">Loading…</div>'
  try {
    // Try URL-based autofill first if query looks like a domain
    let creds = []
    if (currentDomain && query === currentDomain) {
      const r = await fetch(`${BASE_URL}/api/v1/credentials/search?url=${encodeURIComponent("https://" + currentDomain)}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      if (r.ok) {
        const d = await r.json()
        creds = Array.isArray(d) ? d : (d.credentials || [])
        creds = creds.map(c => ({ ...c, clientName: c.client?.name }))
      }
    }
    if (!creds.length) {
      const r = await fetch(`${BASE_URL}/api/v1/credentials?search=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      if (!r.ok) { renderResults([], query); return }
      creds = await r.json()
    }
    renderResults(creds, query)
  } catch (e) {
    document.getElementById("results").innerHTML = `<div class="empty">Error: ${e.message}</div>`
  }
}

function renderResults(creds, query) {
  const el = document.getElementById("results")
  if (!creds.length) {
    el.innerHTML = `<div class="empty">No credentials found for "${query}"</div>`
    return
  }
  el.innerHTML = creds.map(c => credHtml(c)).join("")
  // Attach click handlers
  el.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => handleAction(btn.dataset.action, btn.dataset.id, btn.dataset.field, creds))
  })
}

function credHtml(c) {
  const rev = revealedData[c.id]
  const isAutofill = currentDomain && c.url && c.url.includes(currentDomain)
  return `
    <div class="cred-item" id="cred-${c.id}">
      <div class="cred-header">
        <div>
          <span class="cred-label">${esc(c.label)}</span>
          ${isAutofill ? ' <span class="tag-autofill">autofill</span>' : ""}
          ${c.notes ? ' <span class="tag-notes">notes</span>' : ""}
        </div>
        <span class="cred-client">${esc(c.clientName || "")}</span>
      </div>
      ${c.username ? `<div class="cred-username">${esc(c.username)}</div>` : ""}
      <div class="cred-actions">
        ${c.username ? `<button class="btn-copy" data-action="copy-username" data-id="${c.id}" data-field="${esc(c.username)}">Copy user</button>` : ""}
        ${rev ? `
          ${rev.password ? `
            <div class="secret-row">
              <span class="secret-val">${esc(rev.password)}</span>
              <button class="btn-copy" data-action="copy-val" data-id="${c.id}" data-field="${esc(rev.password)}">Copy</button>
              <button class="btn-copy btn-fill" data-action="fill" data-id="${c.id}">Fill</button>
            </div>
          ` : ""}
          ${rev.totpCode ? `
            <div class="secret-row">
              <span class="totp-code" id="totp-${c.id}">${esc(rev.totpCode)}</span>
              <span class="totp-timer" id="totp-timer-${c.id}"></span>
              <button class="btn-copy" data-action="copy-val" data-id="${c.id}" data-field="${esc(rev.totpCode)}">Copy</button>
            </div>
          ` : ""}
        ` : `
          <button class="btn-copy" data-action="reveal" data-id="${c.id}">Reveal</button>
        `}
      </div>
      ${c.notes ? `<div class="cred-notes">${esc(c.notes)}</div>` : ""}
    </div>
  `
}

async function handleAction(action, id, field, creds) {
  if (action === "copy-username" || action === "copy-val") {
    await copyText(field)
    return
  }
  if (action === "fill") {
    const rev = revealedData[id]
    const cred = creds.find(c => c.id === id)
    if (rev && currentTabId) {
      fillInPage(currentTabId, { username: cred?.username, password: rev.password })
    }
    return
  }
  if (action === "reveal") {
    try {
      const r = await fetch(`${BASE_URL}/api/v1/credentials/${id}/reveal`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      if (!r.ok) { toast("Could not reveal credential", true); return }
      const d = await r.json()
      revealedData[id] = d
      // Re-render the specific credential
      const item = document.getElementById(`cred-${id}`)
      if (item) {
        const cred = creds.find(c => c.id === id)
        if (cred) {
          item.outerHTML = credHtml(cred)
          // Re-attach handlers for all
          document.querySelectorAll("[data-action]").forEach(btn => {
            btn.addEventListener("click", () => handleAction(btn.dataset.action, btn.dataset.id, btn.dataset.field, creds))
          })
        }
      }
    } catch (e) {
      toast(e.message, true)
    }
  }
}

// ── TOTP Timer ────────────────────────────────────────────────────────────

function startTotpTimer() {
  if (totpTimer) clearInterval(totpTimer)
  totpTimer = setInterval(() => {
    const epoch = Math.floor(Date.now() / 1000)
    const s = 30 - (epoch % 30)
    // Update all visible TOTP timers
    document.querySelectorAll("[id^='totp-timer-']").forEach(el => {
      el.textContent = `${s}s`
      el.style.color = s <= 5 ? "#f59e0b" : "#64748b"
    })
    document.querySelectorAll("[id^='totp-']").forEach(el => {
      if (el.id.startsWith("totp-timer-")) return
      if (s <= 5) el.style.color = "#f59e0b"
      else el.style.color = "#e2e8f0"
    })
    // Refresh TOTP codes at boundary
    if (s === 30) {
      Object.keys(revealedData).forEach(async id => {
        if (revealedData[id].totpCode) {
          try {
            const r = await fetch(`${BASE_URL}/api/v1/credentials/${id}/reveal`, {
              headers: { Authorization: `Bearer ${apiKey}` }
            })
            if (r.ok) {
              const d = await r.json()
              revealedData[id] = d
              const el = document.getElementById(`totp-${id}`)
              if (el && d.totpCode) el.textContent = d.totpCode
            }
          } catch {}
        }
      })
    }
  }, 1000)
}

// ── Helpers ───────────────────────────────────────────────────────────────

function esc(s) {
  if (!s) return ""
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast("Copied!")
  } catch {
    // Fallback
    const ta = document.createElement("textarea")
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand("copy")
    document.body.removeChild(ta)
    toast("Copied!")
  }
}

// ── Password Generator ───────────────────────────────────────────────────

function generatePassword(length = 20, upper = true, digits = true, symbols = true) {
  let chars = "abcdefghijklmnopqrstuvwxyz"
  if (upper) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  if (digits) chars += "0123456789"
  if (symbols) chars += "!@#$%^&*()-_=+[]{}|;:,.<>?"
  const arr = new Uint32Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, v => chars[v % chars.length]).join("")
}

// ── Inline Autofill (inject into active tab) ─────────────────────────────

async function fillInPage(tabId, { username, password }) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (user, pass) => {
        // Find username and password fields on the page
        const inputs = document.querySelectorAll("input")
        let userField = null
        let passField = null
        for (const input of inputs) {
          const type = (input.type || "").toLowerCase()
          const name = (input.name || "").toLowerCase()
          const id = (input.id || "").toLowerCase()
          const auto = (input.autocomplete || "").toLowerCase()
          if (type === "password" || auto === "current-password" || auto === "new-password") {
            passField = passField || input
          } else if (type === "text" || type === "email" || auto === "username" || auto === "email" ||
                     name.includes("user") || name.includes("email") || name.includes("login") ||
                     id.includes("user") || id.includes("email") || id.includes("login")) {
            userField = userField || input
          }
        }
        if (user && userField) {
          userField.value = user
          userField.dispatchEvent(new Event("input", { bubbles: true }))
          userField.dispatchEvent(new Event("change", { bubbles: true }))
        }
        if (pass && passField) {
          passField.value = pass
          passField.dispatchEvent(new Event("input", { bubbles: true }))
          passField.dispatchEvent(new Event("change", { bubbles: true }))
        }
        return !!(userField || passField)
      },
      args: [username || null, password || null],
    })
    toast("Filled!")
  } catch (e) {
    toast("Could not fill — try copying instead", true)
  }
}

function toast(msg, isError = false) {
  const el = document.getElementById("toast")
  el.textContent = msg
  el.style.background = isError ? "#7f1d1d" : "#166534"
  el.style.display = "block"
  setTimeout(() => { el.style.display = "none" }, 2500)
}
