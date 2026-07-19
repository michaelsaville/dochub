import { execFile } from "child_process"
import { promisify } from "util"
import { mkdtemp, readFile, writeFile, rm, readdir } from "fs/promises"
import os from "os"
import path from "path"

const execFileP = promisify(execFile)

export type RenderedImage = { base64: string; mediaType: "image/jpeg" }

// Render an image-based PDF (scanned config, Freeform board, confirmation page)
// to bounded JPEG page images for Claude vision. Used when a PDF has no
// extractable text. Requires poppler's pdftoppm (present in the app image).
export async function renderPdfToImages(buffer: Buffer, maxPages = 5): Promise<RenderedImage[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ni-pdf-"))
  try {
    const inPath = path.join(dir, "in.pdf")
    await writeFile(inPath, buffer)
    await execFileP("pdftoppm", ["-png", "-r", "200", "-f", "1", "-l", String(maxPages), inPath, path.join(dir, "pg")], { maxBuffer: 64 * 1024 * 1024 })
    const files = (await readdir(dir)).filter((f) => f.startsWith("pg") && f.endsWith(".png")).sort()
    const sharp = (await import("sharp")).default
    const out: RenderedImage[] = []
    for (const f of files) {
      const png = await readFile(path.join(dir, f))
      const jpg = await sharp(png).resize(1568, 1568, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
      out.push({ base64: jpg.toString("base64"), mediaType: "image/jpeg" })
    }
    return out
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
