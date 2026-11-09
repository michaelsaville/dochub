import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/** Pending work across the three review queues that make up the Inbox. */
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  const [aiIntake, notesIntake, docReview] = await Promise.all([
    prisma.intakeSuggestion.count({ where: { status: "PENDING" } }).catch(() => 0),
    prisma.noteSuggestion.count({ where: { status: "PENDING" } }).catch(() => 0),
    prisma.clientDocument.count({ where: { needsReview: true } }).catch(() => 0),
  ])
  return NextResponse.json({ aiIntake, notesIntake, docReview, total: aiIntake + notesIntake + docReview })
}
