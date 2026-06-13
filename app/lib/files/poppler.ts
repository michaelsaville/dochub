import { spawn } from "child_process"
import { mkdtemp, writeFile, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

/**
 * PDF rendering / text extraction via poppler-utils (pdftoppm / pdftotext),
 * installed as a system package in the Docker runner stage.
 *
 * Replaces pdf-parse (pdfjs-dist + @napi-rs/canvas), whose prebuilt native
 * skia binary SIGILLs in this alpine/musl container — so every pdf-parse path
 * (thumbnails AND searchable-text OCR) was crashing in prod. poppler is a
 * battle-tested CLI with no native-node-binding fragility.
 */

/** Feed `input` on stdin, resolve stdout as a Buffer. Rejects on non-zero exit. */
function run(cmd: string, args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on("data", (d: Buffer) => out.push(d))
    child.stderr.on("data", (d: Buffer) => err.push(d))
    child.on("error", reject) // e.g. ENOENT if the binary is missing
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out))
      else reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(err).toString().slice(0, 200)}`))
    })
    child.stdin.on("error", () => {}) // swallow EPIPE if poppler exits early
    child.stdin.end(input)
  })
}

/**
 * Render page 1 of a PDF to PNG bytes (pdftoppm). pdftoppm only writes images
 * to a file root (its `-` stdout sink yields nothing), so this round-trips
 * through a temp dir. Returns null on any failure (encrypted / corrupt /
 * poppler missing) so the caller can fall back cleanly.
 */
export async function pdfFirstPagePng(pdf: Buffer, widthPx = 640): Promise<Buffer | null> {
  let dir: string | null = null
  try {
    dir = await mkdtemp(path.join(tmpdir(), "pdfthumb-"))
    const inPath = path.join(dir, "in.pdf")
    const outRoot = path.join(dir, "out") // pdftoppm appends ".png" (-singlefile)
    await writeFile(inPath, pdf)
    await run(
      "pdftoppm",
      ["-png", "-singlefile", "-f", "1", "-l", "1", "-scale-to-x", String(widthPx), "-scale-to-y", "-1", inPath, outRoot],
      Buffer.alloc(0),
    )
    const png = await readFile(`${outRoot}.png`)
    return png.length > 0 ? png : null
  } catch {
    return null
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Extract text from a PDF (pdftotext, stdin → stdout). Returns "" on failure. */
export async function pdfText(pdf: Buffer): Promise<string> {
  try {
    const out = await run("pdftotext", ["-q", "-", "-"], pdf)
    return out.toString("utf8")
  } catch {
    return ""
  }
}
