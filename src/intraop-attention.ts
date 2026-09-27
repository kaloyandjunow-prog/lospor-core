import {
  intraopCascadeDeleteIds,
  intraopItemRef,
  intraopConfirmStop,
  intraopEventsAfter,
  intraopMoveToEnd,
  intraopUnconfirmedStops,
} from "./intraop-commands"
import { sortIntraopEvents } from "./intraop-engine"
import { resolveIntraopEventLabel } from "./clinical-display"
import { clinicalDisplayLabel } from "./display"
import type { ClinicalDisplayDomain, ClinicalLocale } from "./display/types"
import type { IntraopEventOps } from "./intraop-timetable-edit"
import type { LogEvent } from "./intraop-types"

/**
 * What on the intraoperative timeline is waiting for a clinician's answer, and
 * what each answer writes (9.13.0).
 *
 * The one place this is decided. The PWA and the web app list exactly these
 * items and write exactly these operations through their save path; neither
 * works out its own. Before 9.13.0 each app had its own after-end list -- the
 * web one built from the drawn chart, the PWA one from the events -- and they
 * disagreed: a planned rate change after the end was on one and not the other.
 *
 * - An unconfirmed stop (entered ahead of its time, time reached): it
 *   stopped, or it is still running.
 * - An entry dated after the case end: it happened (moved to the end), or it
 *   did not (deleted, with whatever depends on it).
 */

export type IntraopAttentionKind = "unconfirmed_stop" | "after_end"

export type IntraopAttentionAction = "stopped" | "still_running" | "happened" | "did_not_happen"

export type IntraopAttentionItem = {
  /** The event's id: stable while the item waits. */
  key: string
  kind: IntraopAttentionKind
  event: LogEvent
  /**
   * What the question is about: the drug, fluid or agent named when it was
   * started. A stop event carries no name of its own, and "Infusion stopped"
   * does not say which one.
   */
  subject?: string
  actions: readonly IntraopAttentionAction[]
}

export type IntraopAttentionContext = {
  /** The reading time (server-corrected "now"). */
  now: Date | string | number
  /** The case end, once ended. */
  endedAt?: Date | string | number | null
}

const STOP_ACTIONS = ["stopped", "still_running"] as const
const AFTER_END_ACTIONS = ["happened", "did_not_happen"] as const

export function intraopAttentionItems(log: LogEvent[], context: IntraopAttentionContext): IntraopAttentionItem[] {
  const ended = context.endedAt != null
  const asOf = ended ? context.endedAt! : context.now
  const items: IntraopAttentionItem[] = []
  const listed = new Set<string>()
  for (const event of intraopUnconfirmedStops(log, asOf)) {
    items.push({ key: event.id, kind: "unconfirmed_stop", event, actions: STOP_ACTIONS })
    listed.add(event.id)
  }
  if (ended) {
    for (const event of intraopEventsAfter(log, context.endedAt!)) {
      if (listed.has(event.id)) continue
      items.push({ key: event.id, kind: "after_end", event, actions: AFTER_END_ACTIONS })
    }
  }
  const order = new Map(sortIntraopEvents(log).map((event, index) => [event.id, index]))
  const names = new Map<string, string>()
  for (const event of sortIntraopEvents(log)) {
    const ref = intraopItemRef(event)
    if (ref?.role === "start" && event.name) names.set(`${ref.kind}:${ref.key}`, event.name)
  }
  return items
    .map(item => {
      const ref = intraopItemRef(item.event)
      const subject = item.event.name ?? (ref ? names.get(`${ref.kind}:${ref.key}`) : undefined)
      return subject ? { ...item, subject } : item
    })
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
}

/**
 * The operations one answer writes. Empty when the item is no longer waiting
 * (answered on another screen meanwhile) or the answer does not fit it.
 */
export function intraopResolveAttention(
  log: LogEvent[],
  key: string,
  action: IntraopAttentionAction,
  context: IntraopAttentionContext,
): IntraopEventOps {
  const none: IntraopEventOps = { add: [], update: [], remove: [] }
  const item = intraopAttentionItems(log, context).find(candidate => candidate.key === key)
  if (!item || !item.actions.includes(action)) return none
  const recordedAt = new Date(context.now).toISOString()
  switch (action) {
    case "stopped":
      return { ...none, update: [{ ...intraopConfirmStop(item.event), recordedAt: item.event.recordedAt ?? recordedAt }] }
    case "still_running":
      // Withdrawing the stop is exactly how Resume removes one: the item runs on.
      return { ...none, remove: [item.event.id] }
    case "did_not_happen":
      // A planned start takes its changes and stop with it.
      return { ...none, remove: intraopCascadeDeleteIds(log, item.event.id) }
    case "happened": {
      const moved = intraopMoveToEnd(item.event, context.endedAt ?? context.now)
      const { stopConfirmed: _confirmed, ...rest } = moved
      return { ...none, update: [{ ...rest, recordedAt }] }
    }
  }
}

// Event-type terms whose change events are named for the item they change.
const EVENT_TERM: Partial<Record<LogEvent["type"], string>> = { infusion_rate: "infusion_change" }

const SUBJECT_DOMAIN: Partial<Record<string, ClinicalDisplayDomain>> = {
  infusion: "option:INTRAOP_INFUSION",
  fluid: "option:INTRAOP_FLUID",
  agent: "option:INHALATIONAL_AGENT",
}

/**
 * The line each app shows for a question, in the language of the screen
 * (9.13.0): what it is about and what was entered -- "Remifentanil ·
 * Спиране на инфузия". One function, so the PWA and the web app say the
 * same thing in the same words, in Bulgarian as in English.
 */
export function intraopAttentionText(item: IntraopAttentionItem, locale: string): string {
  const language: ClinicalLocale = locale === "bg" ? "bg" : "en"
  const event = item.event
  if (event.type === "drug") {
    const name = event.name ? clinicalDisplayLabel("option:INTRAOP_DRUG", event.name, language, { label: event.name }) : ""
    return `${name} ${event.dose ?? ""} ${event.unit ?? ""}`.trim()
  }
  if (event.type === "clinical_event" && event.label) return resolveIntraopEventLabel(event.label, language)
  const ref = intraopItemRef(event)
  const domain = ref ? SUBJECT_DOMAIN[ref.kind] : undefined
  const subject = item.subject
    ? domain ? clinicalDisplayLabel(domain, item.subject, language, { label: item.subject }) : item.subject
    : null
  const what = clinicalDisplayLabel("eventType", EVENT_TERM[event.type] ?? event.type, language, { label: event.type })
  const value = event.rate != null
    ? ` ${event.rate} ${event.unit ?? ""}`.trimEnd()
    : event.type === "gas_change" && event.fgf != null ? ` FGF ${event.fgf} · FiO₂ ${event.fio2 ?? ""}%` : ""
  return [subject, `${what}${value}`].filter(Boolean).join(" · ")
}
