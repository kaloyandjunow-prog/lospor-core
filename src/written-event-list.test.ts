import { describe, expect, it } from "vitest"
import { writtenEventList, writtenEventTime } from "./written-event-list"

const log = [
  { id: "v", ts: "2026-11-07T08:01:00.000Z", type: "vital", systolic: 120 },
  { id: "c1", ts: "2026-11-07T08:30:00.000Z", type: "complication", label: "Hypotension", endTs: "2026-11-07T08:42:00.000Z" },
  { id: "e1", ts: "2026-11-07T08:05:00.000Z", type: "clinical_event", label: "Induction" },
  { id: "c2", ts: "2026-11-07T08:50:00.000Z", type: "complication", label: "Hypertension", complicationSource: "vitals" },
  { id: "d1", ts: "2026-11-07T08:55:00.000Z", type: "drug", name: "Epinephrine / Adrenaline", timeApproximate: true },
  { id: "e2", ts: "2026-11-07T09:10:00.000Z", type: "clinical_event", label: "ROSC", timeApproximate: true },
]

describe("the written event list (print and phone summary)", () => {
  it("lists events and complications in time order in the case's zone, without vitals or drugs", () => {
    const list = writtenEventList(log, "Europe/Sofia", "en")
    expect(list.map(entry => [entry.id, entry.time])).toEqual([["e1", "10:05"], ["c1", "10:30"], ["c2", "10:50"], ["e2", "11:10"]])
  })

  it("gives a complication its end, an open vitals episode 'ongoing', and marks an approximate time", () => {
    const list = writtenEventList(log, "Europe/Sofia", "bg")
    expect(writtenEventTime(list[1]!, "продължава")).toBe("10:30–10:42")
    expect(writtenEventTime(list[2]!, "продължава")).toBe("10:50 (продължава)")
    expect(writtenEventTime(list[3]!, "продължава")).toBe("≈11:10")
    expect(list[1]).toMatchObject({ complication: true, label: "Хипотенсия" })
  })

  it("falls back to UTC when the case has no zone, and to nothing for a log that is not a list", () => {
    expect(writtenEventList(log, null, "en")[0]?.time).toBe("08:05")
    expect(writtenEventList(null, "Europe/Sofia", "en")).toEqual([])
  })
})
