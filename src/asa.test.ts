import { describe, expect, it } from "vitest"
import { suggestASAFromTags } from "./asa"

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
