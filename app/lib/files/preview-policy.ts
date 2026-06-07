/**
 * Central policy for how an uploaded file may be served and previewed.
 *
 * SECURITY: the stored `mimeType` on a ClientAttachment is CLIENT-SUPPLIED
 * (it comes straight from the browser's `File.type`). It must never be
 * trusted to decide inline serving — a file claiming `image/png` could be
 * HTML/SVG that runs script in the dochub.pcc2k.com origin. DocHub already
 * ate a stored-XSS-via-attachment P0 once; the forced `attachment`
 * disposition was the only thing saving us. This module is the single place
 * that decides what is safe to serve `inline`, re-deriving the Content-Type
 * from a server-controlled allow-list rather than echoing the stored value.
 */

/** Mimes we will serve with `Content-Disposition: inline`, mapped to the
 *  canonical Content-Type we send back (never the stored one). SVG and HTML
 *  are deliberately absent — they can execute script and must download. */
const INLINE_ALLOW: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
  "image/bmp": "image/bmp",
  "application/pdf": "application/pdf",
  "text/plain": "text/plain; charset=utf-8",
}

export type PreviewKind = "image" | "pdf" | "text" | "docx" | "xlsx" | "csv" | "none"

/** What kind of in-app preview the UI can offer for this content type.
 *  `image|pdf|text` are served inline by the browser; `docx|xlsx|csv` are
 *  fetched as bytes and rendered client-side (mammoth / SheetJS / parse). */
export function previewKind(mime: string | null | undefined): PreviewKind {
  const m = (mime || "").toLowerCase().split(";")[0].trim()
  if (m.startsWith("image/") && m !== "image/svg+xml") return "image"
  if (m === "application/pdf") return "pdf"
  if (m === "text/csv") return "csv"
  if (m === "text/plain" || m === "text/markdown" || m === "application/json") return "text"
  if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx"
  if (m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx"
  return "none"
}

/** True if this (already magic-byte-verified) mime may be streamed inline. */
export function isInlineSafe(detectedMime: string | null | undefined): boolean {
  const m = (detectedMime || "").toLowerCase().split(";")[0].trim()
  return m in INLINE_ALLOW
}

/** The Content-Type to send when serving inline. Null if not inline-safe. */
export function inlineContentType(detectedMime: string | null | undefined): string | null {
  const m = (detectedMime || "").toLowerCase().split(";")[0].trim()
  return INLINE_ALLOW[m] ?? null
}

/** Whether the UI should expose a Preview affordance at all. Based on the
 *  server-verified mime so a renamed/forged file can't claim previewability. */
export function isPreviewable(detectedMime: string | null | undefined): boolean {
  return previewKind(detectedMime) !== "none"
}

/** Hardening headers applied to EVERY served file (inline or download). */
export function baseFileHeaders(): Record<string, string> {
  return {
    // Never let the browser MIME-sniff a download into something executable.
    "X-Content-Type-Options": "nosniff",
    // Even if something slips through, this response can't run script,
    // load remote resources, or be framed by another origin.
    "Content-Security-Policy":
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; object-src 'none'; frame-ancestors 'self'; sandbox",
    "Referrer-Policy": "no-referrer",
  }
}

/** RFC 5987 filename so non-ASCII names survive the header without injection. */
export function contentDisposition(disposition: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  const encoded = encodeURIComponent(filename)
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
