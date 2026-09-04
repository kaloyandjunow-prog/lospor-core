import { describe, expect, it } from "vitest"
import {
  LAB_LIBRARY,
  formatLabReferenceRange,
  getLabByName,
  getLabFlag,
  groupLabsByDraw,
  searchLabs,
  type LabResult,
} from "./labs"

describe("lab catalog", () => {
  it("contains unique named tests", () => {
    const names = LAB_LIBRARY.map(test => test.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("uses trimmed search and returns no rows for an empty query", () => {
    expect(searchLabs("   ")).toEqual([])
    expect(searchLabs("  creatinine ")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ test: expect.objectContaining({ name: "Creatinine" }) }),
      ]),
    )
  })

  it("looks up, flags and formats canonical ranges", () => {
    const creatinine = getLabByName("Creatinine")
    expect(creatinine).toBeDefined()
    expect(getLabFlag(creatinine!, 999)).toBe("high")
    expect(formatLabReferenceRange(creatinine!)).toBeTruthy()
  })
})

describe("grouping results into draws", () => {
  const lab = (test: string, takenAt?: string): LabResult =>
    ({ test, value: "1", unit: "g/L", ...(takenAt ? { takenAt } : {}) })

  it("puts every result sharing an instant into one draw", () => {
    // The point of the whole feature: fifteen rows stamped 09:42 are one
    // blood sample, not fifteen independent facts.
    const draws = groupLabsByDraw([
      lab("Haemoglobin (Hb)", "2026-06-01T09:42:00Z"),
      lab("Platelets", "2026-06-01T09:42:00Z"),
      lab("Creatinine", "2026-06-01T09:42:00Z"),
    ])
    expect(draws).toHaveLength(1)
    expect(draws[0].takenAt).toBe("2026-06-01T09:42:00Z")
    expect(draws[0].results.map(r => r.test)).toEqual([
      "Haemoglobin (Hb)", "Platelets", "Creatinine",
    ])
  })

  it("orders draws newest first", () => {
    // During a case the most recent gas is the one being acted on. It must not
    // be at the bottom of a growing list.
    const draws = groupLabsByDraw([
      lab("Haemoglobin (Hb)", "2026-06-01T08:00:00Z"),
      lab("Haemoglobin (Hb)", "2026-06-01T10:00:00Z"),
      lab("Haemoglobin (Hb)", "2026-06-01T09:00:00Z"),
    ])
    expect(draws.map(d => d.takenAt)).toEqual([
      "2026-06-01T10:00:00Z",
      "2026-06-01T09:00:00Z",
      "2026-06-01T08:00:00Z",
    ])
  })

  it("does not merge draws a minute apart", () => {
    // No tolerance window: two samples really drawn a minute apart are two
    // samples, and merging them would erase a distinction the clinician made.
    const draws = groupLabsByDraw([
      lab("Haemoglobin (Hb)", "2026-06-01T09:42:00Z"),
      lab("Haemoglobin (Hb)", "2026-06-01T09:43:00Z"),
    ])
    expect(draws).toHaveLength(2)
  })

  it("collects undated results into one draw, sorted last", () => {
    // Preop labs typed by hand routinely carry no draw time. Dropping them, or
    // scattering them through the timeline, would both be worse than saying
    // plainly that the time is unknown.
    const draws = groupLabsByDraw([
      lab("Creatinine"),
      lab("Haemoglobin (Hb)", "2026-06-01T09:00:00Z"),
      lab("Platelets"),
    ])
    expect(draws).toHaveLength(2)
    expect(draws[0].takenAt).toBe("2026-06-01T09:00:00Z")
    expect(draws[1].takenAt).toBeNull()
    expect(draws[1].results).toHaveLength(2)
  })

  it("returns nothing for no results", () => {
    expect(groupLabsByDraw([])).toEqual([])
  })
})
