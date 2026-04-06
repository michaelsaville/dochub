import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const { sourceId, targetId, preview } = await req.json()

    if (!sourceId || !targetId) {
      return NextResponse.json({ error: "sourceId and targetId are required" }, { status: 400 })
    }
    if (sourceId === targetId) {
      return NextResponse.json({ error: "Source and target must be different clients" }, { status: 400 })
    }

    // Verify both clients exist
    const [source, target] = await Promise.all([
      prisma.client.findUnique({ where: { id: sourceId }, select: { id: true, name: true, syncroId: true } }),
      prisma.client.findUnique({ where: { id: targetId }, select: { id: true, name: true } }),
    ])
    if (!source) return NextResponse.json({ error: "Source client not found" }, { status: 404 })
    if (!target) return NextResponse.json({ error: "Target client not found" }, { status: 404 })

    // Count everything that will be moved
    const [
      locationCount,
      userCount,
      contactCount,
      credentialCount,
      licenseCount,
      subscriptionCount,
      applicationCount,
      documentCount,
      attachmentCount,
      runbookCount,
      websiteCount,
      networkDeviceCount,
      subnetCount,
      alarmCount,
      activityCount,
      adDomainCount,
      shareCount,
      vpnCount,
      phoneCount,
      cameraCount,
      wifiCount,
      vlanCount,
      vendorRows,
    ] = await Promise.all([
      prisma.location.count({ where: { clientId: sourceId } }),
      prisma.clientUser.count({ where: { clientId: sourceId } }),
      prisma.contact.count({ where: { clientId: sourceId } }),
      prisma.credential.count({ where: { clientId: sourceId } }),
      prisma.license.count({ where: { clientId: sourceId } }),
      prisma.license.count({ where: { clientId: sourceId } }), // same table, just labelled differently in UI
      prisma.application.count({ where: { clientId: sourceId } }),
      prisma.clientDocument.count({ where: { clientId: sourceId } }),
      prisma.clientAttachment.count({ where: { clientId: sourceId } }),
      prisma.runbook.count({ where: { clientId: sourceId } }),
      prisma.website.count({ where: { clientId: sourceId } }),
      prisma.networkDevice.count({ where: { clientId: sourceId, isActive: true } }),
      prisma.subnet.count({ where: { clientId: sourceId } }),
      prisma.alarm.count({ where: { clientId: sourceId } }),
      prisma.activityEvent.count({ where: { clientId: sourceId } }),
      prisma.adDomain.count({ where: { clientId: sourceId } }),
      prisma.networkShare.count({ where: { clientId: sourceId } }),
      prisma.vpnGateway.count({ where: { clientId: sourceId } }),
      prisma.phoneSystem.count({ where: { clientId: sourceId } }),
      prisma.cameraSystem.count({ where: { clientId: sourceId } }),
      prisma.wifiController.count({ where: { clientId: sourceId } }),
      prisma.vlan.count({ where: { clientId: sourceId } }),
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM "_ClientVendors" WHERE "A" = ${sourceId}`,
    ])

    // Count assets via locations
    const sourceLocations = await prisma.location.findMany({ where: { clientId: sourceId }, select: { id: true } })
    const locationIds = sourceLocations.map(l => l.id)
    const assetCount = locationIds.length > 0
      ? await prisma.asset.count({ where: { locationId: { in: locationIds } } })
      : 0

    const vendorCount = Number((vendorRows[0] as any)?.count ?? 0)

    const counts = {
      locations: locationCount,
      assets: assetCount,
      users: userCount,
      contacts: contactCount,
      credentials: credentialCount,
      licenses: licenseCount,
      applications: applicationCount,
      documents: documentCount,
      attachments: attachmentCount,
      runbooks: runbookCount,
      websites: websiteCount,
      networkDevices: networkDeviceCount,
      subnets: subnetCount,
      vlans: vlanCount,
      alarms: alarmCount,
      activity: activityCount,
      adDomains: adDomainCount,
      fileShares: shareCount,
      vpnGateways: vpnCount,
      phoneSystems: phoneCount,
      cameraSystems: cameraCount,
      wifiControllers: wifiCount,
      vendors: vendorCount,
    }

    if (preview) {
      return NextResponse.json({ source: source.name, target: target.name, counts })
    }

    // ── Execute merge ──────────────────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {

      // 1. Handle VLAN number conflicts before moving VLANs
      const sourceVlans = await tx.vlan.findMany({ where: { clientId: sourceId } })
      const targetVlans = await tx.vlan.findMany({ where: { clientId: targetId }, select: { id: true, vlanNumber: true } })
      const targetVlanByNumber = new Map(targetVlans.map(v => [v.vlanNumber, v.id]))

      for (const sv of sourceVlans) {
        const conflictTargetId = targetVlanByNumber.get(sv.vlanNumber)
        if (conflictTargetId) {
          // Re-point switch ports and interfaces to target VLAN, then delete source VLAN
          await tx.switchPort.updateMany({ where: { vlanId: sv.id }, data: { vlanId: conflictTargetId } })
          await tx.assetInterface.updateMany({ where: { vlanId: sv.id }, data: { vlanId: conflictTargetId } })
          await tx.vlan.delete({ where: { id: sv.id } })
        }
        // Non-conflicting VLANs will be handled by the bulk updateMany below
      }

      // 2. Move all direct clientId records
      await tx.location.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.clientUser.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.contact.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.credential.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.license.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.application.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.clientDocument.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.clientAttachment.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.runbook.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.website.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.networkDevice.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.vlan.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } }) // remaining non-conflicting
      await tx.subnet.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.alarm.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.activityEvent.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.adDomain.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.networkShare.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.vpnGateway.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.phoneSystem.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.cameraSystem.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })
      await tx.wifiController.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })

      // 3. Vendor many-to-many: insert missing rows then delete source rows
      // Insert vendor links that don't already exist on target
      await tx.$executeRaw`
        INSERT INTO "_ClientVendors" ("A", "B")
        SELECT ${targetId}, "B" FROM "_ClientVendors"
        WHERE "A" = ${sourceId}
          AND "B" NOT IN (SELECT "B" FROM "_ClientVendors" WHERE "A" = ${targetId})
      `
      await tx.$executeRaw`DELETE FROM "_ClientVendors" WHERE "A" = ${sourceId}`

      // 4. Clear syncroId on source to avoid unique constraint if it had one
      if (source.syncroId) {
        await tx.client.update({ where: { id: sourceId }, data: { syncroId: null } })
      }

      // 5. Mark source client inactive
      await tx.client.update({
        where: { id: sourceId },
        data: {
          isActive: false,
          name: `${source.name} (merged → ${target.name})`,
        },
      })

      // 6. Log activity on target client
      await tx.activityEvent.create({
        data: {
          clientId: targetId,
          eventType: "TECH_NOTE",
          title: "Client records merged",
          body: `All records from "${source.name}" were merged into this client.`,
          isPinned: false,
          visibleToClient: false,
        },
      })
    }, { timeout: 30000 })

    return NextResponse.json({ success: true, source: source.name, target: target.name, counts })
  } catch (e: any) {
    console.error("Merge error:", e)
    return NextResponse.json({ error: e?.message || "Merge failed" }, { status: 500 })
  }
}
