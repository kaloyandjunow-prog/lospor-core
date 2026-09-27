import {
  intraopCascadeDeleteIds,
  intraopConfirmStop,
  intraopEventsAfter,
  intraopMoveToEnd,
  intraopUnconfirmedStops,
} from "./intraop-commands"
import { sortIntraopEvents } from "./intraop-engine"
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
  return items.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
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
