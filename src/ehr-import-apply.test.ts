import { describe, expect, it } from "vitest"

import { normalizeEhrImport } from "./ehr-import"
import { buildEhrReviewPlan, ehrItemKey, type EhrReviewInput } from "./ehr-import-review"
import { applyEhrSelections } from "./ehr-import-apply"

function accept(
  fields: Record<string, unknown>,
  selectedKeys: string[] | "preselected",
  rest: Partial<Omit<EhrReviewInput, "canonical">> = {},
) {
  const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields })
  const current = rest.current ?? {}
  const plan = buildEhrReviewPlan({ canonical, current, ...rest })
  return applyEhrSelections({
    plan,
    selectedKeys: selectedKeys === "preselected" ? plan.preselectedKeys : selectedKeys,
    current,
  })
}

describe("the patch is an ordinary case edit", () => {
  it("writes canonical field names and nothing else", () => {
    // What comes out has to be indistinguishable from the clinician typing it,
    // because that is the route it travels and the audit it lands in.
    const result = accept({ weightKg: 80, heightCm: 175 }, "preselected")

    expect(result.patch).toEqual({ weightKg: 80, heightCm: 175 })
    expect(result.refused).toEqual([])
  })

  it("writes nothing when nothing is ticked", () => {
    expect(accept({ weightKg: 80 }, []).patch).toEqual({})
  })

  it("cannot carry clinical mode, whatever a client sends", () => {
    // Absent from the importable list, so it cannot reach a plan, so it cannot
    // reach a patch. Belt and braces on the failure this design exists around.
    const result = accept({ clinicalMode: "PEDIATRIC", weightKg: 80 }, "preselected")

    expect(result.patch).not.toHaveProperty("clinicalMode")
    expect(Object.keys(result.patch)).toEqual(["weightKg"])
  })
})

describe("the selection arriving from a client is not trusted", () => {
  it("refuses a key the plan never offered", () => {
    const result = accept({ weightKg: 80 }, ["clinicalMode", "aiOptIn"])

    expect(result.patch).toEqual({})
    expect(result.refused).toEqual([
      { itemKey: "clinicalMode", reason: "unknown" },
      { itemKey: "aiOptIn", reason: "unknown" },
    ])
  })

  it("refuses a previously rejected item even when ticked", () => {
    // A refusal is not undone by a client asking again.
    const key = ehrItemKey("diagnoses", { code: "K35" })
    const result = accept(
      { diagnoses: [{ label: "Acute appendicitis", code: "K35" }] },
      [key],
      { declinedKeys: [key] },
    )

    expect(result.patch).toEqual({})
    expect(result.refused).toEqual([{ itemKey: key, reason: "declined" }])
  })

  it("refuses an age that would imply a mode change, even ticked deliberately", () => {
    // There is no sequence of clicks that writes an age into a case whose mode
    // disagrees with it. The clinician changes mode, the plan is rebuilt, and
    // the age becomes an ordinary proposal.
    const result = accept({ ageYears: 7 }, ["ageYears"], { currentClinicalMode: "ADULT" })

    expect(result.patch).toEqual({})
    expect(result.refused).toEqual([{ itemKey: "ageYears", reason: "needs-mode-decision" }])
  })

  it("accepts the same age once the case is in paediatric mode", () => {
    expect(accept({ ageYears: 7 }, ["ageYears"], { currentClinicalMode: "PEDIATRIC" }).patch)
      .toEqual({ ageYears: 7 })
  })

  it("applies the good keys alongside the refused ones", () => {
    const result = accept({ weightKg: 80 }, ["weightKg", "nonsense"])

    expect(result.patch).toEqual({ weightKg: 80 })
    expect(result.appliedKeys).toEqual(["weightKg"])
    expect(result.refused).toHaveLength(1)
  })
})

describe("a deliberate reach past the default is allowed", () => {
  it("takes a conflicting value when the clinician chooses it", () => {
    // They have seen their own value beside the proposal.
    const result = accept({ weightKg: 80 }, ["weightKg"], { current: { weightKg: 75 } })

    expect(result.patch).toEqual({ weightKg: 80 })
  })

  it("takes an older lab when the clinician opens the collapse", () => {
    const older = "labResults|hb|2026-08-29T08:00:00.000Z"
    const result = accept({
      labResults: [
        { test: "Hb", value: "120", takenAt: "2026-08-29T08:00:00Z" },
        { test: "Hb", value: "89", takenAt: "2026-09-01T08:00:00Z" },
      ],
    }, [older])

    expect((result.patch.labResults as unknown[])).toHaveLength(1)
    expect((result.patch.labResults as { value: string }[])[0].value).toBe("120")
  })
})

describe("accepting into a list never drops what the clinician typed", () => {
  it("keeps their diagnoses and appends the imported one", () => {
    const typed = { label: "Hypertension", code: "I10", source: "manual" }
    const result = accept(
      { diagnoses: [{ label: "Acute appendicitis", code: "K35" }] },
      "preselected",
      { current: { diagnoses: [typed] } },
    )

    const diagnoses = result.patch.diagnoses as { label: string; source: string }[]
    expect(diagnoses).toHaveLength(2)
    expect(diagnoses[0]).toEqual(typed)
    expect(diagnoses[1]).toMatchObject({ code: "K35", source: "import" })
  })

  it("leaves their own provenance untouched", () => {
    // Their entry stays theirs. Only the appended item is marked imported.
    const result = accept(
      { comorbidities: [{ label: "Asthma" }] },
      "preselected",
      { current: { comorbidities: [{ label: "Diabetes", source: "ai-scan" }] } },
    )

    const list = result.patch.comorbidities as { source: string }[]
    expect(list.map(c => c.source)).toEqual(["ai-scan", "import"])
  })

  it("does not touch a list nothing was accepted from", () => {
    const result = accept(
      { weightKg: 80, diagnoses: [{ code: "K35", label: "Acute appendicitis" }] },
      ["weightKg"],
      { current: { diagnoses: [{ code: "I10", label: "Hypertension" }] } },
    )

    expect(result.patch).toEqual({ weightKg: 80 })
    expect(result.patch).not.toHaveProperty("diagnoses")
  })

  it("appends two accepted items to one list in a single patch", () => {
    const result = accept({
      diagnoses: [
        { code: "K35", label: "Acute appendicitis" },
        { code: "I10", label: "Hypertension" },
      ],
    }, "preselected")

    expect(result.patch.diagnoses as unknown[]).toHaveLength(2)
  })

  it("ignores a duplicated key rather than appending twice", () => {
    const key = ehrItemKey("diagnoses", { code: "K35" })
    const result = accept(
      { diagnoses: [{ code: "K35", label: "Acute appendicitis" }] },
      [key, key],
    )

    expect(result.patch.diagnoses as unknown[]).toHaveLength(1)
  })
})
