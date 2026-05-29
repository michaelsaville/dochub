import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * Reverse-link lookup for a credential: every record that references it.
 * Used by the credential row "What uses this?" expander so techs can see
 * exactly which systems will break if the password changes.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const cred = await prisma.credential.findUnique({
    where: { id },
    include: {
      asset: { select: { id: true, name: true, friendlyName: true } },
      person: { select: { id: true, name: true } },
      vpnGateways: { select: { id: true, name: true, clientId: true } },
      vpnAccessors: { select: { id: true, vendor: { select: { id: true, name: true } } } },
      phoneSystems: { select: { id: true, name: true, clientId: true } },
      phoneExtensions: { select: { id: true, extension: true, displayName: true } },
      voicemailExtensions: { select: { id: true, extension: true, displayName: true } },
      wifiControllers: { select: { id: true, name: true, clientId: true } },
      wifiNetworks: { select: { id: true, ssid: true, controller: { select: { clientId: true } } } },
      cameraSystems: { select: { id: true, name: true, clientId: true } },
      internetCircuits: { select: { id: true, label: true, clientId: true } },
      adDomains: { select: { id: true, name: true, clientId: true } },
      ptpLinks: { select: { id: true, name: true, clientId: true } },
      assetInterfaces: { select: { id: true, name: true, asset: { select: { id: true, name: true, friendlyName: true } } } },
    },
  })
  if (!cred) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    asset: cred.asset,
    person: cred.person,
    vpnGateways: cred.vpnGateways,
    vpnAccessors: cred.vpnAccessors,
    phoneSystems: cred.phoneSystems,
    phoneExtensions: cred.phoneExtensions,
    voicemailExtensions: cred.voicemailExtensions,
    wifiControllers: cred.wifiControllers,
    wifiNetworks: cred.wifiNetworks,
    cameraSystems: cred.cameraSystems,
    internetCircuits: cred.internetCircuits,
    adDomains: cred.adDomains,
    ptpLinks: cred.ptpLinks,
    assetInterfaces: cred.assetInterfaces,
    total:
      (cred.asset ? 1 : 0) +
      (cred.person ? 1 : 0) +
      cred.vpnGateways.length +
      cred.vpnAccessors.length +
      cred.phoneSystems.length +
      cred.phoneExtensions.length +
      cred.voicemailExtensions.length +
      cred.wifiControllers.length +
      cred.wifiNetworks.length +
      cred.cameraSystems.length +
      cred.internetCircuits.length +
      cred.adDomains.length +
      cred.ptpLinks.length +
      cred.assetInterfaces.length,
  })
}
