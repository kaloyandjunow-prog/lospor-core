import { describe, expect, it } from "vitest"
import { asaSuggestionRule, suggestASAFromTags } from "./asa"
import { asaAgreementByRule } from "./research"

describe("the ASA suggestion", () => {
  it("rises with the most severe coded condition", () => {
    expect(suggestASAFromTags([{ label: "Hypertension", code: "I10" }], 26)?.cls).toBe("II")
    expect(suggestASAFromTags([{ label: "COPD", code: "J44.9" }, { label: "Hypertension", code: "I10" }], 26)?.cls).toBe("III")
    expect(suggestASAFromTags([], 42)?.cls).toBe("III")
  })

  // Nothing coded and a normal BMI is missing information, not a healthy
  // patient: suggesting ASA I there contradicted clinicians choosing III.
  it("suggests nothing when there is nothing to base it on", () => {
    expect(suggestASAFromTags([], 27.1)).toBeNull()
    expect(suggestASAFromTags([], null)).toBeNull()
  })
})

describe("agreement with the ASA suggestion, per rule", () => {
  const rows = (count: number, suggested: string, chosen: string, reasons: string[]) =>
    Array.from({ length: count }, () => ({ suggested, chosen, reasons }))

  it("counts agreement and which way anaesthetists departed", () => {
    const [copd] = asaAgreementByRule([
      ...rows(6, "III", "III", ["copd"]),
      ...rows(9, "III", "II", ["copd"]),
      ...rows(5, "III", "IV", ["copd"]),
    ])
    expect(copd).toEqual({ reasonCode: "copd", suggested: "III", cases: 20, agreed: 6, choseLower: 9, choseHigher: 5, suppressed: false })
  })

  it("hides a small rule, and a small part with the next smallest", () => {
    const result = asaAgreementByRule([
      ...rows(3, "II", "II", ["asthma"]),
      ...rows(12, "II", "II", ["hypertension"]),
      ...rows(2, "II", "III", ["hypertension"]),
      ...rows(7, "II", "I", ["hypertension"]),
    ])
    expect(result.find(row => row.reasonCode === "asthma")).toMatchObject({ cases: null, agreed: null, suppressed: true })
    expect(result.find(row => row.reasonCode === "hypertension")).toMatchObject({ cases: 21, agreed: 12, choseLower: null, choseHigher: null, suppressed: true })
  })

  it("ignores cases with no suggestion or no chosen class", () => {
    expect(asaAgreementByRule([{ suggested: null, chosen: "II", reasons: [] }, { suggested: "II", chosen: null, reasons: ["asthma"] }])).toEqual([])
  })

  it("knows every reason code the suggestion can give", () => {
    expect(asaSuggestionRule("copd")).toEqual({ cls: "III", label: "COPD" })
    expect(asaSuggestionRule("morbid_obesity_bmi")?.cls).toBe("III")
    expect(asaSuggestionRule("comorbidities_present")?.cls).toBe("II")
    expect(asaSuggestionRule("nonsense")).toBeNull()
  })
})
