import { prisma } from "@/lib/prisma"

/**
 * Lifecycle-triggered runbook spawning. Each helper looks up the
 * client's configured template (if any), then creates a RunbookRun
 * row in IN_PROGRESS state ready for a tech to walk through. Activity
 * event is recorded so the dashboard surfaces the trigger.
 *
 * Designed to be called fire-and-forget from API routes — failures are
 * logged but never thrown, so a typo in a runbook title can't block the
 * underlying Person/Client mutation.
 */

export async function maybeTriggerOnboardingRunbook(
  personId: string,
  triggeredByName?: string | null,
): Promise<void> {
  try {
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: {
        name: true,
        clientId: true,
        client: { select: { onboardingRunbookId: true, name: true } },
      },
    })
    if (!person?.client?.onboardingRunbookId) return
    await spawnRun({
      runbookId: person.client.onboardingRunbookId,
      clientId: person.clientId,
      triggerLabel: `Onboarding ${person.name}`,
      triggeredByName,
      eventTitle: `Onboarding triggered for ${person.name}`,
      eventBody: `Person activated → enqueued onboarding runbook`,
    })
  } catch (e) {
    console.error("[runbook-triggers] onboarding failed", personId, e)
  }
}

export async function maybeTriggerOffboardingRunbook(
  personId: string,
  triggeredByName?: string | null,
): Promise<void> {
  try {
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: {
        name: true,
        clientId: true,
        client: { select: { offboardingRunbookId: true, name: true } },
      },
    })
    if (!person?.client?.offboardingRunbookId) return
    await spawnRun({
      runbookId: person.client.offboardingRunbookId,
      clientId: person.clientId,
      triggerLabel: `Offboarding ${person.name}`,
      triggeredByName,
      eventTitle: `Offboarding triggered for ${person.name}`,
      eventBody: `Person deactivated → enqueued offboarding runbook`,
    })
  } catch (e) {
    console.error("[runbook-triggers] offboarding failed", personId, e)
  }
}

export async function maybeTriggerNewClientRunbook(
  clientId: string,
  triggeredByName?: string | null,
): Promise<void> {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, newClientRunbookId: true },
    })
    if (!client?.newClientRunbookId) return
    await spawnRun({
      runbookId: client.newClientRunbookId,
      clientId,
      triggerLabel: `New client setup: ${client.name}`,
      triggeredByName,
      eventTitle: `New-client runbook spawned`,
      eventBody: `Client created → enqueued new-client runbook`,
    })
  } catch (e) {
    console.error("[runbook-triggers] new-client failed", clientId, e)
  }
}

async function spawnRun(args: {
  runbookId: string
  clientId: string
  triggerLabel: string
  triggeredByName?: string | null
  eventTitle: string
  eventBody: string
}): Promise<void> {
  const run = await prisma.runbookRun.create({
    data: {
      runbookId: args.runbookId,
      clientId: args.clientId,
      status: "IN_PROGRESS",
      startedBy: args.triggeredByName ?? "Lifecycle automation",
      notes: args.triggerLabel,
    },
  })
  await prisma.activityEvent.create({
    data: {
      clientId: args.clientId,
      eventType: "TECH_NOTE",
      title: args.eventTitle,
      body: `${args.eventBody} (run ${run.id})`,
    },
  }).catch(() => {})
}
