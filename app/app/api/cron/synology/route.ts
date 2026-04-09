import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { dsmLogin, dsmLogout, dsmGetBackupJobs } from "@/lib/synology"

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const configs = await prisma.synologyConfig.findMany({
    include: { asset: { select: { id: true, name: true, ipAddress: true, location: { select: { clientId: true, client: { select: { name: true } } } } } } },
  })

  const results: { asset: string; jobs: number; errors: number; error?: string }[] = []

  for (const config of configs) {
    const ip = config.asset.ipAddress
    if (!ip) { results.push({ asset: config.asset.name, jobs: 0, errors: 0, error: "No IP address" }); continue }

    const password = decrypt(config.encryptedPassword)
    let sid: string
    try {
      sid = await dsmLogin(ip, config.port, config.useHttps, config.skipSslVerify, config.username, password)
    } catch (e: any) {
      results.push({ asset: config.asset.name, jobs: 0, errors: 0, error: e.message })
      continue
    }

    try {
      const jobs = await dsmGetBackupJobs(ip, config.port, config.useHttps, config.skipSslVerify, sid)

      for (const job of jobs) {
        await prisma.synologyBackupJob.upsert({
          where:  { configId_taskId: { configId: config.id, taskId: job.taskId } },
          create: { configId: config.id, ...job },
          update: { name: job.name, lastResult: job.lastResult, lastRunAt: job.lastRunAt, nextRunAt: job.nextRunAt, destination: job.destination },
        })
      }

      await prisma.synologyConfig.update({ where: { id: config.id }, data: { lastSyncedAt: new Date() } })

      // Raise alarm for any failed jobs
      const failed = jobs.filter(j => j.lastResult === "error")
      const clientId = config.asset.location.clientId
      for (const job of failed) {
        await prisma.alarm.upsert({
          where: { id: `synology-${config.id}-${job.taskId}` },
          create: {
            id:       `synology-${config.id}-${job.taskId}`,
            clientId,
            severity: "CRITICAL",
            type:     "Backup Failure",
            message:  `Synology backup failed: ${job.name} on ${config.asset.name}`,
          },
          update: {
            status:   "ACTIVE",
            message:  `Synology backup failed: ${job.name} on ${config.asset.name}`,
          },
        }).catch(() => {
          // id collision unlikely but harmless — just create a new one
          prisma.alarm.create({
            data: { clientId, severity: "CRITICAL", type: "Backup Failure", message: `Synology backup failed: ${job.name} on ${config.asset.name}` }
          }).catch(() => {})
        })
      }

      const errors = failed.length
      results.push({ asset: config.asset.name, jobs: jobs.length, errors })
    } finally {
      await dsmLogout(ip, config.port, config.useHttps, config.skipSslVerify, sid)
    }
  }

  return NextResponse.json({ success: true, devices: results.length, results })
}
