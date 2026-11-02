import type { LogEvent } from "../intraop-types"
import { cardAutomationId, labAutomationId, readingAutomationId, REMINDER_IDS, reverseAutomationId, timerAutomationId, AUTOMATION_IDS } from "./automations"
import { suggestionCardFor } from "./catalogue"
import type { TimerKind } from "./timers"

/**
 * What became of the suggestions on one case (10.2.0), read from the saved
 * chart alone: nothing extra is recorded to measure them. A suggestion that
 * was acted on leaves an entry carrying its tag; one put away leaves a
 * "Not now" answer. One never answered leaves nothing, so it counts as neither.
 *
 * - accepted: the question was answered yes (a complication made from it), or a
 *   card had an entry saved from one of its rows or was closed with Done. A card
 *   counts once per case, however many of its rows were used.
 * - dismissed: a "Not now" on a card, question, reminder or follow-up.
 *
 * Reminders and follow-ups open a sheet without tagging what is saved, so for
 * them only dismissals are seen; their acceptance is not measured.
 */
export type SuggestionOutcome = { id: string; outcome: "accepted" | "dismissed" }

const REMINDER_KIND: Record<string, string> = { ponv: REMINDER_IDS.ponv, glucose: REMINDER_IDS.glucose }

/** The automation a prompt answer's kind belongs to, or null for one this does not know. */
function automationOfAnswer(kind: string, answerFor: string | undefined, log: LogEvent[]): string | null {
  if (kind === "card") {
    const complication = log.find(event => event.id === answerFor && event.type === "complication")
    const def = suggestionCardFor(complication?.label)
    return def ? cardAutomationId(def.complications[0]!) : null
  }
  const [family, ...rest] = kind.split(":")
  const name = rest.join(":")
  if (family === "reverse") return reverseAutomationId(name)
  if (family === "reading") return readingAutomationId(name)
  if (family === "lab") return labAutomationId(name)
  if (family === "reminder") return REMINDER_KIND[name] ?? null
  if (family === "timer") return timerAutomationId(name as TimerKind)
  return null
}

/** The automation a suggestion tag names: a card row (card:Label:row) or a rule's own tag (reverse:lipid). */
function automationOfTag(tag: string): string | null {
  if (tag.startsWith("card:")) {
    const label = tag.slice("card:".length, tag.lastIndexOf(":"))
    const def = suggestionCardFor(label)
    return def ? cardAutomationId(def.complications[0]!) : null
  }
  return AUTOMATION_IDS.has(tag) ? tag : null
}

export function suggestionOutcomes(log: readonly LogEvent[]): SuggestionOutcome[] {
  const events = [...log]
  const outcomes: SuggestionOutcome[] = []
  const acceptedCards = new Set<string>()
  for (const event of events) {
    if (event.type === "prompt_answer" && event.answerKind) {
      const id = automationOfAnswer(event.answerKind, event.answerFor, events)
      if (!id || !AUTOMATION_IDS.has(id)) continue
      if (event.answer === "not_now") outcomes.push({ id, outcome: "dismissed" })
      else if (event.answer === "done" && event.answerKind === "card" && !acceptedCards.has(id)) { acceptedCards.add(id); outcomes.push({ id, outcome: "accepted" }) }
      continue
    }
    const tag = event.suggestion
    if (!tag) continue
    const id = automationOfTag(tag)
    if (!id) continue
    if (tag.startsWith("card:")) {
      if (acceptedCards.has(id)) continue
      acceptedCards.add(id)
    }
    outcomes.push({ id, outcome: "accepted" })
  }
  // A card closed with Not now after something was given from it was used, not put away.
  return outcomes.filter(item => !(item.outcome === "dismissed" && acceptedCards.has(item.id)))
}

/** Counts per automation, to add up over many cases. */
export type SuggestionCounts = Record<string, { accepted: number; dismissed: number }>

export function addOutcomes(counts: SuggestionCounts, outcomes: readonly SuggestionOutcome[]): SuggestionCounts {
  for (const { id, outcome } of outcomes) {
    const entry = (counts[id] ??= { accepted: 0, dismissed: 0 })
    entry[outcome] += 1
  }
  return counts
}
