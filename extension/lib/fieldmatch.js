/* DocHub extension — login field detection + fill (injected into pages).
 *
 * Injected with chrome.scripting.executeScript({ files: ["lib/fieldmatch.js"] })
 * into the ISOLATED world of each frame, then driven by small func calls
 * (DocHubFill.scan / .fill / .watch). Also require()-able from node so the
 * pure classification logic (classify / pickFields) is unit-tested.
 *
 * Never holds secrets: fill() receives values for one call and drops them.
 */
;(function (root, factory) {
  const api = factory(root)
  if (typeof module === "object" && module.exports) module.exports = api
  else root.DocHubFill = api
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict"

  const NON_TEXT_TYPES = new Set([
    "hidden", "submit", "button", "checkbox", "radio", "file", "image", "reset",
    "range", "color", "date", "datetime-local", "month", "week", "time", "search",
  ])

  // One-time-code hints. Leading boundary only so "otpCode"/"mfa_code" match;
  // deliberately excludes zip/postal/promo/country "code".
  const OTP_RE = /(^|[^a-z])(otp|totp|one[-_ ]?time|2fa|mfa|two[-_ ]?factor|2[-_ ]?step|verification[-_ ]?code|verify[-_ ]?code|verificationcode|auth(entication|enticator)?[-_ ]?code|security[-_ ]?code|passcode|otc|sms[-_ ]?code|totppin|idvpin|tfa)/
  const NOT_OTP_RE = /(zip|postal|post[-_ ]?code|promo|coupon|country|area[-_ ]?code|discount|gift|referral|captcha)/
  const USER_RE = /(user|e-?mail|login|logon|account|identifier|uname|signin|sign-in|principal|upn|loginfmt)/
  const SEARCH_RE = /(^|[^a-z])(search|query|q)([^a-z]|$)/

  function lc(v) { return v == null ? "" : String(v).toLowerCase() }

  /**
   * Classify one input from a plain descriptor:
   *   { tag, type, name, id, autocomplete, placeholder, ariaLabel, inputMode,
   *     maxLength, visible, disabled, readOnly, ariaHidden }
   * → "username" | "password" | "otp" | "text" (generic text, needs context) | null
   */
  function classify(d) {
    if (!d || lc(d.tag || "input") !== "input") return null
    const type = lc(d.type) || "text"
    if (NON_TEXT_TYPES.has(type)) return null
    if (d.disabled || d.readOnly || d.visible === false || d.ariaHidden) return null

    const name = lc(d.name)
    const id = lc(d.id)
    const ac = lc(d.autocomplete).split(/\s+/).filter(Boolean)
    const hints = [name, id, lc(d.placeholder), lc(d.ariaLabel)].join(" ")

    // ── Vendor-specific (Microsoft / Google) ──
    if (name === "hiddenpassword") return null // Google's decoy
    if (name === "loginfmt") return "username" // login.microsoftonline.com, login.live.com
    if (name === "otc" || id === "idtxtbx_saotcc_otc" || name === "totppin" || id === "totppin" || name === "idvpin") return "otp"
    if (name === "passwd") return type === "password" ? "password" : null // MS passwd, Google Passwd
    if (name === "identifier" || id === "identifierid") return "username" // accounts.google.com

    // ── autocomplete tokens (most reliable generic signal) ──
    if (ac.includes("one-time-code")) return "otp"
    if (ac.includes("current-password") || ac.includes("new-password")) return type === "password" ? "password" : null
    if (type === "password") {
      if (OTP_RE.test(name) || OTP_RE.test(id)) return "otp"
      return "password"
    }
    if (ac.includes("username") || ac.includes("email")) return "username"

    // ── text-like inputs ──
    if (!["text", "email", "tel", "number", "url", ""].includes(type)) return null
    if (SEARCH_RE.test(name) || SEARCH_RE.test(id)) return null
    if (OTP_RE.test(hints) && !NOT_OTP_RE.test(hints)) return "otp"
    const numeric = type === "tel" || type === "number" || lc(d.inputMode) === "numeric"
    const ml = Number(d.maxLength)
    if ((name === "code" || id === "code" || /(^|[^a-z])code([^a-z]|$)/.test(hints)) &&
        !NOT_OTP_RE.test(hints) && (numeric || (ml >= 4 && ml <= 8))) return "otp"
    if (numeric && ml === 1) return "otp-digit" // segmented 6-box OTP widgets
    if (type === "email") return "username"
    if (USER_RE.test(hints) && !NOT_OTP_RE.test(hints)) return "username"
    if (type === "tel" || type === "number") return null
    return "text"
  }

  /**
   * Pick the fields to fill from classified inputs in document order.
   * entries: [{ kind, form }] where `form` is any per-form key (index / null).
   * Returns indexes: { username, password, otp, otpDigits: [] } (-1 = none).
   */
  function pickFields(entries) {
    const out = { username: -1, password: -1, otp: -1, otpDigits: [] }
    out.password = entries.findIndex(e => e.kind === "password")
    out.otp = entries.findIndex(e => e.kind === "otp")
    const digits = entries.map((e, i) => (e.kind === "otp-digit" ? i : -1)).filter(i => i >= 0)
    if (digits.length >= 4 && digits.length <= 8) out.otpDigits = digits

    if (out.password >= 0) {
      const pf = entries[out.password].form
      // explicit username in the same form, nearest before the password
      for (let i = out.password - 1; i >= 0; i--) {
        if (entries[i].kind === "username" && entries[i].form === pf) { out.username = i; break }
      }
      if (out.username < 0) {
        // nearest generic text before the password, same form
        for (let i = out.password - 1; i >= 0; i--) {
          if (entries[i].kind === "text" && entries[i].form === pf) { out.username = i; break }
        }
      }
      if (out.username < 0) out.username = entries.findIndex(e => e.kind === "username")
    } else {
      // username-only step (split login): explicit username, or the ONLY text input
      out.username = entries.findIndex(e => e.kind === "username")
      if (out.username < 0) {
        const texts = entries.map((e, i) => (e.kind === "text" ? i : -1)).filter(i => i >= 0)
        if (texts.length === 1 && out.otp < 0 && !out.otpDigits.length) out.username = texts[0]
      }
    }
    return out
  }

  // ───────────────────────── DOM side (browser only) ─────────────────────────

  function isVisible(el) {
    try {
      if (!el.getClientRects().length) return false
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return false
      if (r.right <= 0 || r.bottom <= 0) return false // MS "moveOffScreen" decoys
      const cs = root.getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.visibility === "collapse" || cs.display === "none") return false
      if (Number(cs.opacity) === 0) return false
      return true
    } catch {
      return false
    }
  }

  function collectInputs(doc) {
    const out = []
    const seen = new Set()
    let budget = 8000
    const walk = (scope) => {
      scope.querySelectorAll("input").forEach(el => { if (!seen.has(el)) { seen.add(el); out.push(el) } })
      const all = scope.querySelectorAll("*")
      for (const el of all) {
        if (--budget <= 0) return
        if (el.shadowRoot) walk(el.shadowRoot)
      }
    }
    walk(doc)
    // shadow-root inputs were appended after light-DOM ones; keep doc order for light DOM
    return out
  }

  function describe(el) {
    return {
      tag: el.tagName,
      type: el.getAttribute("type") || el.type,
      name: el.getAttribute("name"),
      id: el.id,
      autocomplete: el.getAttribute("autocomplete"),
      placeholder: el.getAttribute("placeholder"),
      ariaLabel: el.getAttribute("aria-label"),
      inputMode: el.getAttribute("inputmode"),
      maxLength: el.maxLength > 0 ? el.maxLength : null,
      visible: isVisible(el),
      disabled: el.disabled,
      readOnly: el.readOnly,
      ariaHidden: el.getAttribute("aria-hidden") === "true" || !!el.closest?.("[aria-hidden='true']"),
    }
  }

  function analyse(doc) {
    const els = collectInputs(doc || root.document)
    const entries = []
    const elements = []
    const forms = new Map()
    for (const el of els) {
      const kind = classify(describe(el))
      if (!kind) continue
      const f = el.form || null
      if (f && !forms.has(f)) forms.set(f, forms.size)
      entries.push({ kind, form: f ? forms.get(f) : null })
      elements.push(el)
    }
    const pick = pickFields(entries)
    const get = i => (i >= 0 ? elements[i] : null)
    return {
      username: get(pick.username),
      password: get(pick.password),
      otp: get(pick.otp),
      otpDigits: pick.otpDigits.map(i => elements[i]),
    }
  }

  /** What login fields are visible in this frame right now? (no secrets) */
  function scan() {
    const a = analyse()
    return {
      url: root.location.href,
      username: !!a.username,
      password: !!a.password,
      otp: !!(a.otp || a.otpDigits.length),
    }
  }

  function setValue(el, value) {
    try { el.focus({ preventScroll: true }) } catch {}
    // Native setter so React's value tracker sees a change; works for
    // Angular/Vue/Knockout too since they listen for input/change.
    const proto = Object.getPrototypeOf(el)
    const desc = Object.getOwnPropertyDescriptor(proto, "value") ||
                 Object.getOwnPropertyDescriptor(root.HTMLInputElement.prototype, "value")
    if (desc && desc.set) desc.set.call(el, value)
    else el.value = value
    el.dispatchEvent(new root.Event("input", { bubbles: true, composed: true }))
    el.dispatchEvent(new root.Event("change", { bubbles: true, composed: true }))
    try { el.dispatchEvent(new root.KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" })) } catch {}
  }

  /**
   * Fill whatever of { username, password, otp } is present and visible.
   * Only fills empty username fields unless `overwriteUsername` (popup click).
   * Returns which kinds were filled. Values are not retained.
   */
  function fill(values) {
    const v = values || {}
    const a = analyse()
    const done = { url: root.location.href, username: false, password: false, otp: false }
    if (v.username && a.username && (v.overwriteUsername || !a.username.value)) {
      setValue(a.username, v.username); done.username = true
    }
    if (v.password && a.password) {
      setValue(a.password, v.password); done.password = true
    }
    if (v.otp) {
      if (a.otp) { setValue(a.otp, v.otp); done.otp = true }
      else if (a.otpDigits.length && a.otpDigits.length === String(v.otp).length) {
        a.otpDigits.forEach((el, i) => setValue(el, String(v.otp)[i]))
        done.otp = true
      }
    }
    // focus the next thing the tech needs to act on
    try {
      const last = done.otp ? a.otp : done.password ? a.password : done.username ? a.username : null
      if (last) last.focus({ preventScroll: true })
    } catch {}
    return done
  }

  /**
   * Watch this frame for the next login step (SPA step changes, e.g. the
   * Microsoft username → password → code views) and tell the background which
   * kind appeared. Background decides whether to fill; no secrets here.
   */
  function watch(kinds, ttlMs) {
    const until = Date.now() + Math.min(ttlMs || 120000, 120000)
    const state = root.__dochubWatch
    if (state && state.until > Date.now()) {
      state.kinds = new Set(kinds)
      state.until = until
      return true
    }
    const s = { kinds: new Set(kinds), reported: new Set(), until, timer: null }
    root.__dochubWatch = s
    const tick = () => {
      if (Date.now() > s.until || !s.kinds.size) { clearInterval(s.timer); root.__dochubWatch = null; return }
      let r
      try { r = scan() } catch { return }
      for (const k of ["password", "otp"]) {
        if (s.kinds.has(k) && r[k] && !s.reported.has(k)) {
          s.reported.add(k)
          s.kinds.delete(k)
          try { root.chrome.runtime.sendMessage({ type: "dochub:stepReady", kind: k }) } catch {}
        }
      }
    }
    s.timer = setInterval(tick, 500)
    tick()
    return true
  }

  return { classify, pickFields, OTP_RE, USER_RE, scan, fill, watch }
})
