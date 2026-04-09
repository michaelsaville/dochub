import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { decrypt } from "@/lib/crypto"
import { dsmLogin, dsmLogout, dsmGetBackupJobs } from "@/lib/synology"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const config = await prisma.synologyConfig.findUnique({ where: { assetId: id } })
  if (!config) return NextResponse.json({ error: "No Synology config for this asset" }, { status: 404 })

  const asset = await prisma.asset.findUnique({ where: { id }, select: { ipAddress: true } })
  if (!asset?.ipAddress) return NextResponse.json({ error: "Asset has no IP address" }, { status: 400 })

  const password = decrypt(config.encryptedPassword)
  let sid: string
  try {
    sid = await dsmLogin(asset.ipAddress, config.port, config.useHttps, config.skipSslVerify, config.username, password)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }

  try {
    const jobs = await dsmGetBackupJobs(asset.ipAddress, config.port, config.useHttps, config.skipSslVerify, sid)

    for (const job of jobs) {
      await prisma.synologyBackupJob.upsert({
        where:  { configId_taskId: { configId: config.id, taskId: job.taskId } },
        create: { configId: config.id, ...job },
        update: { name: job.name, lastResult: job.lastResult, lastRunAt: job.lastRunAt, nextRunAt: job.nextRunAt, destination: job.destination },
      })
    }

    await prisma.synologyConfig.update({ where: { id: config.id }, data: { lastSyncedAt: new Date() } })

    return NextResponse.json({ success: true, jobs: jobs.length, results: jobs.map(j => ({ name: j.name, lastResult: j.lastResult })) })
  } finally {
    await dsmLogout(asset.ipAddress, config.port, config.useHttps, config.skipSslVerify, sid)
  }
}
