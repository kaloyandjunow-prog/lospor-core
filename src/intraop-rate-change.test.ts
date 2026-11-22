import { describe, expect, it } from "vitest"
import { intraopApplyRateChange } from "./intraop-edits"
import { projectIntraopEvents } from "./intraop-engine"
import type { LogEvent } from "./intraop-types"

const at = (m: number) => new Date(Date.UTC(2026, 10, 22, 10, m)).toISOString()
const chartStart = at(0)

// The dose change rule, one for both apps: the start cell edits the start, a cell with a change edits it.
describe("a dose change on a running infusion", () => {
  const start = { id: "s", ts: at(17), type: "infusion_start", infId: "i1", name: "Propofol", rate: "5", unit: "mL/h" } as LogEvent
  const later = { id: "c", ts: at(45), type: "infusion_rate", infId: "i1", rate: "10", unit: "mL/h" } as LogEvent
  const fields = { rate: "7", unit: "mL/h" }

  it("in the start cell replaces the start dose and keeps later changes", () => {
    const next = intraopApplyRateChange([start, later], { infId: "i1", at: at(15), chartStart, fields })!
    expect(next.find(event => event.id === "s")).toMatchObject({ rate: "7", ts: at(17) })
    expect(next.filter(event => event.type === "infusion_rate")).toHaveLength(1)
    const chart = projectIntraopEvents(next, { start: new Date(chartStart), openThrough: new Date(at(60)) } as never)
    expect(chart.infusions[0]!.rateChanges).toEqual([expect.objectContaining({ rate: 10, col: 9 })])
  })

  it("in a cell that already has a change replaces that change, not a second one", () => {
    const next = intraopApplyRateChange([start, later], { infId: "i1", at: at(47), chartStart, fields: { rate: "12", unit: "mL/h" } })!
    expect(next.filter(event => event.type === "infusion_rate")).toEqual([expect.objectContaining({ id: "c", rate: "12", ts: at(45) })])
  })

  it("elsewhere says a new change is to be written", () => {
    expect(intraopApplyRateChange([start], { infId: "i1", at: at(30), chartStart, fields })).toBeNull()
  })
})
