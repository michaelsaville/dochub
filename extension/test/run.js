// Pure-JS tests for the extension's matching logic. Run: node extension/test/run.js
// Covers lib/domain.js, the classification half of lib/fieldmatch.js, and lib/totp.js.
// The DOM half of fieldmatch.js (visibility, value setting, watcher) and all
// chrome.* wiring are NOT covered here — they need a real Chrome.
"use strict"
const assert = require("node:assert/strict")
const path = require("node:path")
const D = require(path.join(__dirname, "../lib/domain.js"))
const F = require(path.join(__dirname, "../lib/fieldmatch.js"))
const T = require(path.join(__dirname, "../lib/totp.js"))

let passed = 0, failed = 0
const pending = []
function test(name, fn) {
  pending.push((async () => {
    try { await fn(); passed++ } catch (e) { failed++; console.error(`✗ ${name}\n  ${e.message}`) }
  })())
}

// ── domain.js ───────────────────────────────────────────────────────────

test("hostOf normalises scheme-less, www, case, port, path", () => {
  assert.equal(D.hostOf("https://WWW.Example.com:8443/login?x=1"), "example.com")
  assert.equal(D.hostOf("portal.office.com/adminportal"), "portal.office.com")
  assert.equal(D.hostOf("192.168.1.1"), "192.168.1.1")
  assert.equal(D.hostOf("chrome://extensions"), "")
  assert.equal(D.hostOf("not a url"), "")
  assert.equal(D.hostOf(""), "")
  assert.equal(D.hostOf(null), "")
})

test("registrableDomain handles multi-label suffixes and tenants", () => {
  assert.equal(D.registrableDomain("app.foo.com"), "foo.com")
  assert.equal(D.registrableDomain("foo.com"), "foo.com")
  assert.equal(D.registrableDomain("a.b.foo.co.uk"), "foo.co.uk")
  assert.equal(D.registrableDomain("foo.co.uk"), "foo.co.uk")
  assert.equal(D.registrableDomain("shop.bar.com.au"), "bar.com.au")
  assert.equal(D.registrableDomain("contoso.sharepoint.com"), "contoso.sharepoint.com")
  assert.equal(D.registrableDomain("contoso-my.sharepoint.com"), "contoso-my.sharepoint.com")
  assert.equal(D.registrableDomain("x.contoso.sharepoint.com"), "contoso.sharepoint.com")
  assert.equal(D.registrableDomain("acme.my.salesforce.com"), "acme.my.salesforce.com")
  assert.equal(D.registrableDomain("10.0.0.5"), "10.0.0.5")
  assert.equal(D.registrableDomain("localhost"), "localhost")
})

test("matchScore: exact / subdomain / same site", () => {
  assert.equal(D.matchScore("https://foo.com/login", "https://foo.com/").score, D.SCORE.EXACT)
  assert.equal(D.matchScore("foo.com", "https://app.foo.com/x").score, D.SCORE.SUBDOMAIN)
  assert.equal(D.matchScore("https://app.foo.com", "https://foo.com").score, D.SCORE.SUBDOMAIN)
  assert.equal(D.matchScore("https://a.foo.com", "https://b.foo.com").score, D.SCORE.SITE)
  assert.equal(D.matchScore("https://192.168.1.1", "http://192.168.1.1/admin").score, D.SCORE.EXACT)
})

test("matchScore: no false positives", () => {
  assert.equal(D.matchScore("https://notoffice.com", "https://office.com").score, 0)
  assert.equal(D.matchScore("https://foo.co.uk", "https://bar.co.uk").score, 0)
  assert.equal(D.matchScore("https://contoso.sharepoint.com", "https://evilsharepoint.com").score, 0)
  assert.equal(D.matchScore("https://192.168.1.1", "https://192.168.1.2").score, 0)
  assert.equal(D.matchScore("", "https://foo.com").score, 0)
  assert.equal(D.matchScore("https://foo.com", "chrome://newtab").score, 0)
  // the Microsoft *store* isn't an M365 sign-in
  assert.equal(D.matchScore("https://www.microsoft.com/store", "https://login.microsoftonline.com/").score, 0)
})

test("matchScore: Microsoft 365 portals match the shared login page", () => {
  const login = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x"
  for (const cred of [
    "https://portal.office.com", "admin.microsoft.com", "https://contoso.sharepoint.com/sites/hr",
    "https://outlook.office.com/mail", "https://portal.azure.com/#home", "https://entra.microsoft.com",
    "https://intune.microsoft.com", "https://www.office.com", "https://login.live.com",
  ]) {
    const m = D.matchScore(cred, login)
    assert.ok(m.score > 0, `${cred} should match login.microsoftonline.com`)
    assert.equal(m.reason, "microsoft", cred)
  }
  assert.ok(D.matchScore("https://portal.office.com", "https://login.live.com/").score > 0)
  // tenants of the same platform are distinct sites but both Microsoft 365
  assert.equal(D.matchScore("https://contoso.sharepoint.com", "https://fabrikam.sharepoint.com").reason, "microsoft")
})

test("matchScore: Google admin/accounts", () => {
  assert.ok(D.matchScore("https://admin.google.com", "https://accounts.google.com/v3/signin/identifier").score > 0)
  assert.ok(D.matchScore("https://mail.google.com", "https://accounts.google.com/").score > 0)
  assert.equal(D.matchScore("gmail.com", "https://accounts.google.com/").reason, "google")
  assert.equal(D.matchScore("https://admin.google.com", "https://login.microsoftonline.com").score, 0)
})

test("siteKey groups identity providers; searchTermsFor includes aliases", () => {
  assert.equal(D.siteKey("https://login.microsoftonline.com/x"), "group:microsoft")
  assert.equal(D.siteKey("https://portal.office.com/"), "group:microsoft")
  assert.equal(D.siteKey("https://accounts.google.com/"), "group:google")
  assert.equal(D.siteKey("https://app.foo.co.uk/"), "foo.co.uk")
  assert.equal(D.siteKey("chrome://newtab"), "")
  const t = D.searchTermsFor("https://login.microsoftonline.com/")
  assert.ok(t.includes("microsoftonline.com") && t.includes("office") && t.includes("sharepoint"))
  assert.deepEqual(D.searchTermsFor("https://app.foo.com/x"), ["foo.com"])
  assert.equal(D.siteLabel("https://login.microsoftonline.com"), "Microsoft 365")
})

test("isContinuationHostAllowed: only credential / same site / known IdP, https", () => {
  const origin = "https://portal.contoso.com/login"
  const cred = "https://portal.office.com"
  assert.ok(D.isContinuationHostAllowed("https://login.microsoftonline.com/common/login", origin, cred))
  assert.ok(D.isContinuationHostAllowed("https://sso.contoso.com/pw", origin, "https://contoso.com"))
  assert.ok(D.isContinuationHostAllowed("https://contoso.okta.com/signin", origin, ""))
  assert.ok(D.isContinuationHostAllowed("https://accounts.google.com/", origin, ""))
  assert.ok(!D.isContinuationHostAllowed("https://evil.example/phish", origin, cred))
  assert.ok(!D.isContinuationHostAllowed("http://login.microsoftonline.com/", origin, cred), "http IdP")
  assert.ok(D.isContinuationHostAllowed("http://192.168.1.1/step2", "http://192.168.1.1/", ""), "same LAN host over http")
  assert.ok(!D.isContinuationHostAllowed("http://192.168.1.2/", "http://192.168.1.1/", ""))
  assert.ok(!D.isContinuationHostAllowed("javascript:alert(1)", origin, cred))
  assert.ok(!D.isContinuationHostAllowed("https://contoso.com.evil.net/", origin, "https://contoso.com"))
})

// ── fieldmatch.js (classification) ──────────────────────────────────────

const inp = (o) => ({ tag: "INPUT", type: "text", visible: true, ...o })
const kinds = (list) => list.map(d => ({ kind: F.classify(d), form: d.form ?? 0 })).filter(e => e.kind)
const pick = (list) => {
  const entries = kinds(list)
  const p = F.pickFields(entries)
  return {
    username: p.username >= 0 ? entries[p.username].kind : null,
    password: p.password >= 0,
    otp: p.otp >= 0 || p.otpDigits.length > 0,
    _p: p,
  }
}

test("Microsoft username step: loginfmt visible, decoy passwd hidden → username only", () => {
  const page = [
    inp({ type: "email", name: "loginfmt", id: "i0116", autocomplete: "username" }),
    inp({ type: "password", name: "passwd", visible: false }), // moveOffScreen decoy
    inp({ type: "hidden", name: "PPFT" }),
    inp({ type: "submit", id: "idSIButton9" }),
  ]
  const r = pick(page)
  assert.equal(r.username, "username")
  assert.equal(r.password, false)
  assert.equal(r.otp, false)
})

test("Microsoft password step and OTC step", () => {
  const pw = pick([
    inp({ type: "email", name: "loginfmt", visible: false }),
    inp({ type: "password", name: "passwd", id: "i0118", autocomplete: "current-password" }),
  ])
  assert.equal(pw.password, true)
  assert.equal(pw.username, null)
  assert.equal(F.classify(inp({ type: "tel", name: "otc", id: "idTxtBx_SAOTCC_OTC" })), "otp")
  assert.equal(F.classify(inp({ type: "text", name: "otc", autocomplete: "off" })), "otp")
})

test("Google identifier / Passwd / hiddenPassword / totpPin", () => {
  assert.equal(F.classify(inp({ type: "email", name: "identifier", id: "identifierId" })), "username")
  assert.equal(F.classify(inp({ type: "password", name: "Passwd" })), "password")
  assert.equal(F.classify(inp({ type: "password", name: "hiddenPassword", ariaHidden: true })), null)
  assert.equal(F.classify(inp({ type: "password", name: "hiddenPassword" })), null)
  assert.equal(F.classify(inp({ type: "tel", name: "totpPin", id: "totpPin" })), "otp")
  const step1 = pick([inp({ type: "email", name: "identifier" }), inp({ type: "password", name: "hiddenPassword", ariaHidden: true })])
  assert.equal(step1.username, "username")
  assert.equal(step1.password, false)
})

test("generic form: username + password in same form", () => {
  const r = pick([
    inp({ type: "search", name: "q", form: null }),
    inp({ type: "text", name: "j_username", form: 1 }),
    inp({ type: "password", name: "j_password", form: 1 }),
  ])
  assert.equal(r.username, "username")
  assert.equal(r.password, true)
})

test("generic form: unnamed text field before password is the username", () => {
  const entries = kinds([
    inp({ type: "text", name: "newsletter", form: 2 }),
    inp({ type: "text", name: "f1", form: 1 }),
    inp({ type: "password", name: "f2", form: 1 }),
  ])
  const p = F.pickFields(entries)
  assert.equal(p.username, 1)
  assert.equal(p.password, 2)
})

test("site search boxes are never the username", () => {
  assert.equal(F.classify(inp({ type: "text", name: "q" })), null)
  assert.equal(F.classify(inp({ type: "text", name: "search" })), null)
  assert.equal(F.classify(inp({ type: "search", name: "user" })), null)
})

test("username-only page: single generic text input is used, ambiguous pages are not", () => {
  const one = pick([inp({ type: "text", name: "uid" }), inp({ type: "submit" })])
  assert.equal(one.username, "text") // picked via the "only text input" rule
  const two = pick([inp({ type: "text", name: "firstName" }), inp({ type: "text", name: "lastName" })])
  assert.equal(two.username, null)
})

test("OTP detection: autocomplete, names, numeric code, segmented digits", () => {
  assert.equal(F.classify(inp({ autocomplete: "one-time-code" })), "otp")
  assert.equal(F.classify(inp({ name: "mfa_code" })), "otp")
  assert.equal(F.classify(inp({ name: "otpCode" })), "otp")
  assert.equal(F.classify(inp({ name: "verificationCode" })), "otp")
  assert.equal(F.classify(inp({ placeholder: "Enter 6-digit authenticator code" })), "otp")
  assert.equal(F.classify(inp({ name: "code", inputMode: "numeric" })), "otp")
  assert.equal(F.classify(inp({ name: "code", maxLength: 6 })), "otp")
  assert.equal(F.classify(inp({ type: "password", name: "totp" })), "otp")
  const boxes = Array.from({ length: 6 }, (_, i) => inp({ type: "tel", name: `d${i}`, maxLength: 1 }))
  const r = pick(boxes)
  assert.equal(r.otp, true)
  assert.equal(r._p.otpDigits.length, 6)
  assert.equal(r.username, null)
})

test("not OTP: zip / postal / promo / country code", () => {
  assert.notEqual(F.classify(inp({ name: "zip_code", maxLength: 5, inputMode: "numeric" })), "otp")
  assert.notEqual(F.classify(inp({ name: "postalCode" })), "otp")
  assert.notEqual(F.classify(inp({ name: "promo_code" })), "otp")
  assert.notEqual(F.classify(inp({ name: "countryCode", type: "tel" })), "otp")
})

test("ignored: hidden / disabled / readonly / invisible / non-text types", () => {
  assert.equal(F.classify(inp({ type: "hidden", name: "username" })), null)
  assert.equal(F.classify(inp({ name: "username", disabled: true })), null)
  assert.equal(F.classify(inp({ name: "username", readOnly: true })), null)
  assert.equal(F.classify(inp({ name: "username", visible: false })), null)
  assert.equal(F.classify(inp({ type: "checkbox", name: "remember" })), null)
  assert.equal(F.classify({ tag: "SELECT", name: "user" }), null)
})

test("email / autocomplete=username → username", () => {
  assert.equal(F.classify(inp({ type: "email", name: "x" })), "username")
  assert.equal(F.classify(inp({ autocomplete: "username" })), "username")
  assert.equal(F.classify(inp({ name: "Email" })), "username")
  assert.equal(F.classify(inp({ id: "login-name" })), "username")
})

// ── totp.js ─────────────────────────────────────────────────────────────

test("TOTP matches RFC 6238 SHA-1 vector", async () => {
  const seed = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" // "12345678901234567890"
  assert.equal((await T.totp(seed, 59_000)).code, "287082")
  assert.equal((await T.totp(seed, 1111111109_000)).code, "081804")
  assert.equal((await T.totp(`otpauth://totp/x?secret=${seed}&digits=8`, 59_000)).code, "94287082")
  assert.equal(await T.totp("", 0), null)
  assert.equal((await T.totp("gezd gnbv gy3t qojq gezd gnbv gy3t qojq", 59_000)).code, "287082")
})

Promise.all(pending).then(() => {
  console.log(`${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})
