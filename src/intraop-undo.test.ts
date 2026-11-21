import { describe, expect, it } from "vitest"
import { EMPTY_INTRAOP_HISTORY, intraopApplyRedo, intraopApplyUndo, intraopHistoryPush, intraopHistoryRedo, intraopHistoryUndo, intraopUndoEntry } from "./intraop-undo"
import type { LogEvent } from "./intraop-types"

const a: LogEvent = { id: "a", ts: "2026-11-21T08:00:00.000Z", type: "drug", name: "Fentanyl", dose: "100" }
const b: LogEvent = { id: "b", ts: "2026-11-21T08:05:00.000Z", type: "drug", name: "Propofol", dose: "150" }

describe("intraop undo", () => {
  it("keeps only what an edit touched, and undoes and redoes it", () => {
    const moved = { ...a, ts: "2026-11-21T08:10:00.000Z" }
    const entry = intraopUndoEntry([a, b], [moved, b], "Fentanyl moved")!
    expect(entry.before).toEqual([a])
    expect(entry.after).toEqual([moved])
    expect(intraopApplyUndo([moved, b], entry)).toEqual([b, a])
    expect(intraopApplyRedo([b, a], entry)).toEqual([b, moved])
  })

  it("undoes an addition and a deletion", () => {
    const added = intraopUndoEntry([a], [a, b], "added")!
    expect(intraopApplyUndo([a, b], added)).toEqual([a])
    const removed = intraopUndoEntry([a, b], [a], "removed")!
    expect(intraopApplyUndo([a], removed)).toEqual([a, b])
    expect(intraopUndoEntry([a], [a], "nothing")).toBeNull()
  })

  it("walks a history of many steps and clears redo on a new edit", () => {
    let history = intraopHistoryPush(EMPTY_INTRAOP_HISTORY, intraopUndoEntry([], [a], "1"))
    history = intraopHistoryPush(history, intraopUndoEntry([a], [a, b], "2"))
    const one = intraopHistoryUndo(history, [a, b])!
    expect(one.events).toEqual([a])
    const two = intraopHistoryUndo(one.history, one.events)!
    expect(two.events).toEqual([])
    const again = intraopHistoryRedo(two.history, two.events)!
    expect(again.events).toEqual([a])
    expect(intraopHistoryPush(again.history, intraopUndoEntry([a], [], "3")).undone).toEqual([])
  })
})
