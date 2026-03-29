import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const res = await fetch("http://localhost:3000/api/sync/syncro", { method: "POST" })
    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
