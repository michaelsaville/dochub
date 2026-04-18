import Anthropic from "@anthropic-ai/sdk"

let singleton: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!singleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set")
    singleton = new Anthropic({ apiKey })
  }
  return singleton
}

export function isIntakeEnabled(): boolean {
  return process.env.AI_INTAKE_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY
}

export const INTAKE_MODEL = "claude-opus-4-7"
