import { describe, expect, it } from "vitest"
import {
  BUNDLED_CONSENT_TEMPLATES,
  CONSENT_BLANK,
  canonicalConsentText,
  consentPopulationForAge,
  consentSigners,
  consentTextProblems,
  effectivePreopDocumentSettings,
  fillConsentFields,
  parseConsentText,
  unknownConsentFields,
} from "./preop-documents"

describe("who consents (Закон за здравето чл. 87)", () => {
  it("gives a child under 14 the children's text, signed by a parent", () => {
    expect(consentPopulationForAge(7)).toBe("PEDIATRIC")
    expect(consentPopulationForAge(13.9)).toBe("PEDIATRIC")
    expect(consentSigners(7)).toEqual(["PARENT", "ANAESTHETIST"])
  })

  it("gives 14 to 18 the adult text, signed by the patient and a parent", () => {
    expect(consentPopulationForAge(14)).toBe("ADULT")
    expect(consentSigners(16)).toEqual(["PATIENT", "PARENT", "ANAESTHETIST"])
  })

  it("leaves the parent line off for an adult, and keeps it when the age is unknown", () => {
    expect(consentSigners(18)).toEqual(["PATIENT", "ANAESTHETIST"])
    expect(consentPopulationForAge(null)).toBe("ADULT")
    expect(consentSigners(null)).toEqual(["PATIENT", "PARENT", "ANAESTHETIST"])
  })
})

describe("the consent text format", () => {
  it("reads headings, paragraphs, lists and bold", () => {
    const blocks = parseConsentText("## Обща анестезия\n\n**Какво правим.** Ще Ви приспим.\nВтори ред.\n\nНе трябва да приемате:\n- вода — 2 часа;\n- храна — 8 часа.")
    expect(blocks).toEqual([
      { kind: "heading", text: [{ text: "Обща анестезия", bold: false }] },
      { kind: "paragraph", text: [{ text: "Какво правим.", bold: true }, { text: " Ще Ви приспим. Втори ред.", bold: false }] },
      { kind: "paragraph", text: [{ text: "Не трябва да приемате:", bold: false }] },
      { kind: "list", items: [[{ text: "вода — 2 часа;", bold: false }], [{ text: "храна — 8 часа.", bold: false }]] },
    ])
  })

  it("fills the case's fields, and leaves a line for the pen where there is no value", () => {
    expect(fillConsentFields("Операция: {{procedure}}. Хирург: {{surgeon}}. Дата: {{ date }}.", { procedure: "Херниотомия" }))
      .toBe(`Операция: Херниотомия. Хирург: {{surgeon}}. Дата: ${CONSENT_BLANK}.`)
    expect(unknownConsentFields("{{procedure}} {{surgeon}} {{surgeon}}")).toEqual(["surgeon"])
  })

  it("takes the fingerprint of one canonical form, whatever the line endings", () => {
    expect(canonicalConsentText("\r\nРед 1  \r\nРед 2\r\n\r\n")).toBe("Ред 1\nРед 2")
  })

  it("refuses an empty, overlong or unknown-field text", () => {
    expect(consentTextProblems({ title: "Съгласие", body: "Текст" })).toEqual([])
    expect(consentTextProblems({ title: " ", body: "" })).toEqual(["TITLE_EMPTY", "EMPTY"])
    expect(consentTextProblems({ title: "Съгласие", body: "x".repeat(40_001) })).toEqual(["TOO_LONG"])
    expect(consentTextProblems({ title: "Съгласие", body: "{{surgeon}}" })).toEqual(["UNKNOWN_FIELD"])
  })
})

describe("the bundled texts", () => {
  it("are valid as Status would save them, and end with a declaration", () => {
    for (const template of Object.values(BUNDLED_CONSENT_TEMPLATES)) {
      expect(consentTextProblems(template)).toEqual([])
      const blocks = parseConsentText(template.body)
      expect(blocks.filter(block => block.kind === "heading").length).toBeGreaterThanOrEqual(9)
      expect(blocks[blocks.length - 2]).toEqual({ kind: "heading", text: [{ text: "Декларация", bold: false }] })
    }
  })

  it("speak to the parent in the children's text and to the patient in the adult one", () => {
    expect(BUNDLED_CONSENT_TEMPLATES.PEDIATRIC.body).toContain("Вашето дете")
    expect(BUNDLED_CONSENT_TEMPLATES.ADULT.body).not.toContain("Вашето дете")
    expect(BUNDLED_CONSENT_TEMPLATES.PEDIATRIC.body).toContain("кърма — 4 часа")
  })
})

describe("the hospital's switches", () => {
  it("are off by default, and the consent needs the summary", () => {
    expect(effectivePreopDocumentSettings(null)).toEqual({ summaryEnabled: false, consentEnabled: false })
    expect(effectivePreopDocumentSettings({ consentEnabled: true })).toEqual({ summaryEnabled: false, consentEnabled: false })
    expect(effectivePreopDocumentSettings({ summaryEnabled: true, consentEnabled: true })).toEqual({ summaryEnabled: true, consentEnabled: true })
  })
})
