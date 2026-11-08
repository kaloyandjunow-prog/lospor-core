import { clinicalDisplayLabel, type ClinicalLocale } from "./display"
import { resolveIntraopEventLabel } from "./clinical-display"
import { eventClockTimes } from "./intraop-summary"

/**
 * The written event list (10.2.0, the maintainer's choice B): every clinical event and complication in time order,
 * complications with their end time, and whether a time was charted afterwards ("≈"). The printed record shows it
 * under the timeline and the phone's case summary under its timetable card, from this one list.
 */
export type WrittenEventEntry = {
  id: string
  /** Time of day in the case's time zone (UTC when the case has none). */
  time: string
  /** A complication's end; absent while it is still open, and for a one-point event. */
  endTime?: string
  label: string
  complication: boolean
  /** A complication from the vital-sign questions that has not ended. */
  open: boolean
  approximate: boolean
}

type LogLike = { id?: unknown; ts?: unknown; type?: unknown; label?: unknown; endTs?: unknown; timeApproximate?: unknown; complicationSource?: unknown }

const utcClock = (ts: string) => {
  const date = new Date(ts)
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`
}
const validTime = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value))
/** An episode that has ended: its end is a real time after its start. A moment (end = start) has not got one to show, and is not open either. */
const validEnd = (event: LogLike & { ts: string }) => validTime(event.endTs) && Date.parse(event.endTs) >= Date.parse(event.ts)

export function writtenEventList(log: readonly unknown[] | null | undefined, timeZone: string | null | undefined, locale: string): WrittenEventEntry[] {
  const events = (Array.isArray(log) ? log : []) as LogLike[]
  const clock = (id: string, ts: string) => eventClockTimes([{ id, ts }], timeZone).get(id) ?? utcClock(ts)
  const lang: ClinicalLocale = locale === "bg" ? "bg" : "en"
  return events
    .filter((event): event is LogLike & { id: string; ts: string; label: string } =>
      (event.type === "clinical_event" || event.type === "complication")
      && typeof event.id === "string" && validTime(event.ts) && typeof event.label === "string" && event.label.length > 0)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .map(event => {
      const complication = event.type === "complication"
      // A complication logged as a moment has an end equal to its start; only a real episode shows an end.
      const endTs = complication && validTime(event.endTs) && Date.parse(event.endTs) > Date.parse(event.ts) ? event.endTs : null
      return {
        id: event.id,
        time: clock(event.id, event.ts),
        ...(endTs ? { endTime: clock(`${event.id}:end`, endTs) } : {}),
        label: complication
          ? clinicalDisplayLabel("complication", event.label, lang, { label: event.label })
          : resolveIntraopEventLabel(event.label, lang),
        complication,
        open: complication && !validEnd(event) && (event.complicationSource === "vitals" || event.complicationSource === "readings"),
        approximate: event.timeApproximate === true,
      }
    })
}

/** One entry as a line: "≈10:05 Adrenaline", "10:20–10:34 Hypotension". */
export function writtenEventTime(entry: WrittenEventEntry, ongoing: string): string {
  const end = entry.complication ? (entry.endTime ? `–${entry.endTime}` : entry.open ? ` (${ongoing})` : "") : ""
  return `${entry.approximate ? "≈" : ""}${entry.time}${end}`
}
