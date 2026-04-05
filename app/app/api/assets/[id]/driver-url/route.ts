import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Maps normalised make strings to a function that builds a support/driver URL.
// Returned URLs go directly to the manufacturer's driver search or download page.
const MANUFACTURER_MAP: Record<string, (make: string, model: string) => string> = {
  dell: (_, m) =>
    `https://www.dell.com/support/home/en-us/product-support/product/${encodeURIComponent(m)}/drivers`,
  "dell technologies": (_, m) =>
    `https://www.dell.com/support/home/en-us/product-support/product/${encodeURIComponent(m)}/drivers`,

  hp: (_, m) =>
    `https://support.hp.com/us-en/drivers/setup/${encodeURIComponent(m)}`,
  "hewlett-packard": (_, m) =>
    `https://support.hp.com/us-en/drivers/setup/${encodeURIComponent(m)}`,
  "hp inc": (_, m) =>
    `https://support.hp.com/us-en/drivers/setup/${encodeURIComponent(m)}`,
  hpe: (_, m) =>
    `https://support.hpe.com/connect/s/search#q=${encodeURIComponent(m)}&t=DriversandSoftware`,
  "hewlett packard enterprise": (_, m) =>
    `https://support.hpe.com/connect/s/search#q=${encodeURIComponent(m)}&t=DriversandSoftware`,

  lenovo: (_, m) =>
    `https://pcsupport.lenovo.com/us/en/search?q=${encodeURIComponent(m)}`,
  thinkpad: (_, m) =>
    `https://pcsupport.lenovo.com/us/en/search?q=${encodeURIComponent(m)}`,

  asus: (mk, m) =>
    `https://www.asus.com/support/Download-Center/`,
  "asus tek": (mk, m) =>
    `https://www.asus.com/support/Download-Center/`,

  acer: (_, m) =>
    `https://www.acer.com/us-en/support/product-support.aspx?query=${encodeURIComponent(m)}`,

  apple: () => "https://support.apple.com/downloads",

  microsoft: (mk, m) =>
    `https://www.microsoft.com/en-us/download/search.aspx?q=${encodeURIComponent(`${mk} ${m}`)}`,
  surface: (mk, m) =>
    `https://www.microsoft.com/en-us/download/search.aspx?q=${encodeURIComponent(`surface ${m}`)}`,

  samsung: (mk, m) =>
    `https://www.samsung.com/us/support/search/?searchTerm=${encodeURIComponent(m)}`,

  toshiba: (mk, m) =>
    `https://support.dynabook.com/support/modelList?q=${encodeURIComponent(m)}`,
  dynabook: (mk, m) =>
    `https://support.dynabook.com/support/modelList?q=${encodeURIComponent(m)}`,

  brother: (_, m) =>
    `https://support.brother.com/g/b/productsearch.aspx?q=${encodeURIComponent(m)}`,

  epson: (_, m) =>
    `https://epson.com/Support/sl/${encodeURIComponent(m)}/s`,

  canon: () =>
    "https://www.usa.canon.com/support/consumer/products/printers",

  xerox: (mk, m) =>
    `https://www.support.xerox.com/en-us/product/${encodeURIComponent(m)}/downloads`,

  kyocera: (mk, m) =>
    `https://www.kyoceradocumentsolutions.us/en/support/downloads.html`,

  ricoh: (mk, m) =>
    `https://www.ricoh-usa.com/en/support-and-download/downloads.html`,

  fujitsu: (mk, m) =>
    `https://www.fujitsu.com/global/support/products/software/manual/`,

  panasonic: (mk, m) =>
    `https://panasonic.net/cns/pcc/support/pc/dl/`,

  msi: (mk, m) =>
    `https://www.msi.com/support/search#q=${encodeURIComponent(m)}`,

  gigabyte: (mk, m) =>
    `https://www.gigabyte.com/Support`,

  intel: (mk, m) =>
    `https://www.intel.com/content/www/us/en/download-center/home.html`,

  amd: (mk, m) =>
    `https://www.amd.com/en/support`,

  nvidia: (mk, m) =>
    `https://www.nvidia.com/en-us/drivers/`,

  synology: (mk, m) =>
    `https://www.synology.com/en-us/support/download/${encodeURIComponent(m)}`,

  qnap: (mk, m) =>
    `https://www.qnap.com/en/download?model=${encodeURIComponent(m)}`,

  ubiquiti: () =>
    "https://community.ui.com/releases",

  "ubiquiti networks": () =>
    "https://community.ui.com/releases",

  cisco: (mk, m) =>
    `https://software.cisco.com/download/home`,

  netgear: (mk, m) =>
    `https://www.netgear.com/support/product/${encodeURIComponent(m)}.aspx`,

  "tp-link": (mk, m) =>
    `https://www.tp-link.com/us/support/download/${encodeURIComponent(m)}/`,

  aruba: () =>
    "https://asp.arubanetworks.com/downloads",

  fortinet: () =>
    "https://support.fortinet.com/Download/FirmwareImages.aspx",

  sonicwall: () =>
    "https://www.sonicwall.com/support/technical-documentation/",

  paloalto: () =>
    "https://support.paloaltonetworks.com/Support/Index",
  "palo alto": () =>
    "https://support.paloaltonetworks.com/Support/Index",
  "palo alto networks": () =>
    "https://support.paloaltonetworks.com/Support/Index",
}

function lookupDriverUrl(make: string, model: string): { url: string; source: "manufacturer" | "search" } {
  const key = make.toLowerCase().trim()

  // Try exact match first, then partial match
  const exactFn = MANUFACTURER_MAP[key]
  if (exactFn) return { url: exactFn(make, model), source: "manufacturer" }

  // Try if any map key is contained within the make string
  for (const [mapKey, fn] of Object.entries(MANUFACTURER_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) {
      return { url: fn(make, model), source: "manufacturer" }
    }
  }

  // Fall back to Google search
  const query = encodeURIComponent(`${make} ${model} drivers download`)
  return {
    url: `https://www.google.com/search?q=${query}`,
    source: "search",
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { make: true, model: true, name: true },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const make = asset.make?.trim() || ""
    const model = (asset.model?.trim() || asset.name?.trim() || "").trim()

    if (!make) {
      return NextResponse.json({ error: "Asset has no make — cannot look up drivers" }, { status: 422 })
    }

    const result = lookupDriverUrl(make, model)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 })
  }
}
