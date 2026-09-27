import type { TimetableData } from "./intraop-types"

/**
 * Whether each thing on the intraoperative chart has reached the server
 * (9.13.0). One rule for both apps, so an item looks queued, sending or
 * refused the same way on the PWA and the web.
 *
 * Display only. Nothing here is read by a total, a dose or a duration: an
 * item not yet on the server was still given, so it counts, and a total only
 * gains a mark saying part of it is unconfirmed. The one way saving changes a
 * number is a refusal, and that happens by the refused event leaving the log.
 */

export type ItemSaveState = "queued" | "sending" | "refused"

export type IntraopSaveInput = {
  queuedEventIds: readonly string[]
  sendingEventId: string | null
  refused: readonly { eventId: string }[]
}

type Segmentish = {
  startEventId?: string
  stopEventId?: string
  rateChanges?: readonly { eventId?: string }[]
  settingsChanges?: readonly { eventId?: string }[]
}

/** Every event a drawn item came from: start, each change, stop. */
export function segmentEventIds(segment: Segmentish): string[] {
  return [
    segment.startEventId,
    ...(segment.rateChanges ?? []).map(change => change.eventId),
    ...(segment.settingsChanges ?? []).map(change => change.eventId),
    segment.stopEventId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0)
}

/** The state of something made of these events: refused, then sending, then queued. */
export function eventsSaveState(eventIds: readonly (string | undefined)[], input: IntraopSaveInput): ItemSaveState | null {
  const ids = eventIds.filter((id): id is string => !!id)
  if (ids.some(id => input.refused.some(item => item.eventId === id))) return "refused"
  if (input.sendingEventId && ids.includes(input.sendingEventId)) return "sending"
  if (ids.some(id => input.queuedEventIds.includes(id))) return "queued"
  return null
}

/**
 * True when a total on the chart includes something not yet on the server:
 * the total is shown with "≈" until it is. The number itself is unchanged.
 */
export function totalsProvisional(
  timetable: Pick<TimetableData, "drugs" | "infusions" | "fluids">,
  input: IntraopSaveInput,
): boolean {
  if (input.queuedEventIds.length === 0 && !input.sendingEventId) return false
  const ids = [
    ...timetable.drugs.map(drug => drug.eventId),
    ...timetable.infusions.flatMap(segmentEventIds),
    ...timetable.fluids.flatMap(segmentEventIds),
  ]
  const state = eventsSaveState(ids, { ...input, refused: [] })
  return state === "queued" || state === "sending"
}
