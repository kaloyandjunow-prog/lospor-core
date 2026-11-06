import { describe, expect, it } from "vitest"
import type { LogEvent } from "../intraop-types"
import { parseIntraopAutomation } from "../intraop-automation"
import { CONTEXT_LINK_IDS } from "./automations"
import { contextLinkAnswerOps, contextLinkSuggestions, INDUCTION_AGENT_NAMES } from "./context-links"
import { suggestionOutcomes } from "./acceptance"

const T = "2026-11-05T10:00:00.000Z"
const settings = parseIntraopAutomation({ enabled: true, groups: { reminders: true } })
const contextLines = Object.fromEntries(Object.values(CONTEXT_LINK_IDS).map(id => [id, true]))
const user = { automationLines: contextLines }

const context = (techniques: string[] = []) => ({ settings, user, techniques, now: T })

describe("context links", () => {
  it("keeps new context lines opt-in for a clinician even when reminders are on", () => {
    const log: LogEvent = { id: "la", ts: T, type: "drug", name: "Bupivacaine", dose: "20", unit: "mg", drugRoute: "EPIDURAL" }
    expect(contextLinkSuggestions([log], { settings, techniques: [], now: T })).toEqual([])
    expect(contextLinkSuggestions([log], context())).toMatchObject([
      { automationId: CONTEXT_LINK_IDS.epiduralLocalAnaesthetic, kind: "route", source: { id: "la" } },
    ])
  })

  it("offers the exact block and side after a generic Block done event", () => {
    const source: LogEvent = { id: "block", ts: T, type: "clinical_event", label: "Block done" }
    const [link] = contextLinkSuggestions([source], context())
      .filter(item => item.automationId === CONTEXT_LINK_IDS.blockEventTechnique)
    expect(link?.techniqueChoices.some(choice => choice.value === "BLOCK_FEMORAL")).toBe(true)

    const ops = contextLinkAnswerOps(link!, { type: "technique", code: "BLOCK_FEMORAL", side: "LEFT", at: T }, T)
    expect(ops.add).toHaveLength(1)
    expect(ops.update).toHaveLength(1)
    expect(ops.update[0]).toMatchObject({
      label: "Block done", suggestion: CONTEXT_LINK_IDS.blockEventTechnique, ts: T,
    })
    expect(ops.add.find(event => event.type === "prompt_answer")).toMatchObject({
      answer: "done", value: "technique:BLOCK_FEMORAL:LEFT",
      intraopPatch: { techniques: ["BLOCK_FEMORAL"], techniqueSides: { BLOCK_FEMORAL: "LEFT" } },
    })
  })

  it("turns an induction agent into an exact technique and airway record", () => {
    expect(INDUCTION_AGENT_NAMES).toEqual([
      "Propofol", "Etomidate", "Ketamine", "Esketamine", "Thiopental", "Methohexital",
    ])
    const source: LogEvent = { id: "propofol", ts: T, type: "drug", name: "Propofol", category: "Induction", dose: "100", unit: "mg" }
    const [link] = contextLinkSuggestions([source], context())
      .filter(item => item.automationId === CONTEXT_LINK_IDS.inductionAgent)
    expect(link?.techniqueChoices.map(choice => choice.value)).toEqual(expect.arrayContaining(["SEDATION_DEEP", "GENERAL_TIVA"]))

    const ops = contextLinkAnswerOps(link!, { type: "induction", code: "GENERAL_TIVA", airwayDevice: "ORAL_ETT", at: T }, T)
    expect(ops.add.find(event => event.type === "clinical_event" && event.label === "Induction")).toMatchObject({
      suggestion: CONTEXT_LINK_IDS.inductionAgent,
      intraopPatch: { techniques: ["GENERAL_TIVA"], airwayDevices: ["ORAL_ETT"] },
    })
    expect(ops.add.some(event => event.type === "clinical_event" && event.label === "Intubated")).toBe(true)
    expect(ops.add.find(event => event.type === "prompt_answer")).toMatchObject({ answer: "done", value: "induction:GENERAL_TIVA:ORAL_ETT" })
  })

  it("persists a definitive dismissal and Status can count it", () => {
    const source: LogEvent = { id: "epidural", ts: T, type: "clinical_event", label: "Epidural in" }
    const [link] = contextLinkSuggestions([source], context())
      .filter(item => item.automationId === CONTEXT_LINK_IDS.epiduralEventTechnique)
    const dismissal = contextLinkAnswerOps(link!, { type: "dismiss" }, T).add[0]!
    expect(dismissal).toMatchObject({
      type: "prompt_answer", answerKind: CONTEXT_LINK_IDS.epiduralEventTechnique,
      answerFor: source.id, answer: "dismissed", suggestion: CONTEXT_LINK_IDS.epiduralEventTechnique,
    })
    expect(suggestionOutcomes([dismissal])).toEqual([{ id: CONTEXT_LINK_IDS.epiduralEventTechnique, outcome: "dismissed" }])
  })
})
