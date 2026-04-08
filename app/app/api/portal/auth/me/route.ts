import { NextResponse } from "next/server"
import { getPortalSession, getPermissions } from "@/lib/portal-auth"

export async function GET() {
  try {
    const user = await getPortalSession()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      client: user.client,
      permissions: getPermissions(user),
    })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
