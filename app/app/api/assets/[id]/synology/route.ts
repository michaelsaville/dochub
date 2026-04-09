import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt, decrypt } from "@/lib/crypto"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const config = await prisma.synologyConfig.findUnique({
    where: { assetId: id },
    include: { backupJobs: { orderBy: { name: "asc" } } },
  })
  if (!config) return NextResponse.json(null)
  // Never return the encrypted password
  const { encryptedPassword, ...safe } = config
  return NextResponse.json({ ...safe, hasPassword: !!encryptedPassword })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const { port, useHttps, skipSslVerify, username, password } = await req.json()

  const data: any = {
    port:         port ?? 5001,
    useHttps:     useHttps ?? true,
    skipSslVerify: skipSslVerify ?? true,
    username:     username?.trim(),
  }
  if (password?.trim()) data.encryptedPassword = encrypt(password.trim())

  const config = await prisma.synologyConfig.upsert({
    where:  { assetId: id },
    create: { assetId: id, encryptedPassword: encrypt(password?.trim() ?? ""), ...data },
    update: data,
  })
  const { encryptedPassword, ...safe } = config
  return NextResponse.json({ ...safe, hasPassword: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  await prisma.synologyConfig.deleteMany({ where: { assetId: id } })
  return NextResponse.json({ success: true })
}
