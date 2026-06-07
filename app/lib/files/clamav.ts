/**
 * Minimal clamd (ClamAV daemon) client speaking the INSTREAM protocol over
 * TCP. Used to scan every uploaded file before it is accepted.
 *
 * Config (env):
 *   CLAMAV_ENABLED  — "false" disables scanning entirely (default on)
 *   CLAMAV_HOST     — clamd host (default "clamav", the compose service name)
 *   CLAMAV_PORT     — clamd port (default 3310)
 *   CLAMAV_REQUIRED — "true" => reject uploads when clamd is unreachable
 *                     (fail-closed). Default fail-open: mark scan "skipped".
 */
import net from "net"

export type ScanResult =
  | { status: "clean" }
  | { status: "infected"; signature: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string }

const HOST = process.env.CLAMAV_HOST || "clamav"
const PORT = parseInt(process.env.CLAMAV_PORT || "3310", 10)
const ENABLED = process.env.CLAMAV_ENABLED !== "false"
const REQUIRED = process.env.CLAMAV_REQUIRED === "true"
const CHUNK = 64 * 1024

export async function scanBuffer(buffer: Buffer): Promise<ScanResult> {
  if (!ENABLED) return { status: "skipped", reason: "disabled" }

  return new Promise<ScanResult>((resolve) => {
    const socket = new net.Socket()
    let response = ""
    let settled = false

    const finish = (r: ScanResult) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(r)
    }

    socket.setTimeout(30_000)
    socket.on("timeout", () =>
      finish(unreachable("clamd scan timed out"))
    )
    socket.on("error", (e) => finish(unreachable(`clamd unreachable: ${e.message}`)))
    socket.on("data", (d) => {
      response += d.toString("utf8")
    })
    socket.on("close", () => {
      const text = response.replace(/\0/g, "").trim()
      if (!text) return finish(unreachable("clamd closed without a verdict"))
      if (/\bOK$/.test(text)) return finish({ status: "clean" })
      const m = text.match(/:\s*(.+)\s+FOUND$/)
      if (m) return finish({ status: "infected", signature: m[1] })
      finish({ status: "error", reason: text })
    })

    socket.connect(PORT, HOST, () => {
      socket.write("zINSTREAM\0")
      for (let i = 0; i < buffer.length; i += CHUNK) {
        const slice = buffer.subarray(i, i + CHUNK)
        const size = Buffer.alloc(4)
        size.writeUInt32BE(slice.length, 0)
        socket.write(size)
        socket.write(slice)
      }
      // zero-length chunk terminates the stream
      socket.write(Buffer.from([0, 0, 0, 0]))
    })
  })
}

function unreachable(reason: string): ScanResult {
  return REQUIRED ? { status: "error", reason } : { status: "skipped", reason }
}
