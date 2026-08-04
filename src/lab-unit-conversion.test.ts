import { describe, expect, it } from "vitest"
import { convertLabValue, isConfidentConversion } from "./lab-unit-conversion"

/**
 * These cases exist because the previous implementation inferred the source unit
 * from the size of the number. Every "already canonical" case below was
 * corrupted by that heuristic — most dangerously the neonatal creatinine, which
 * became 884 µmol/L and read as renal failure in a well baby.
 */
describe("values already in the canonical unit are left alone", () => {
  const untouched: [string, string, string, number][] = [
    ["CRP", "5", "mg/L", 5],
    ["Total bilirubin", "10", "μmol/L", 10],
    ["Urea (BUN)", "7", "mmol/L", 7],
    ["Creatinine", "10", "μmol/L", 10],      // neonate — the 884 case
    ["Creatinine", "72", "μmol/L", 72],      // adult
    ["Glucose", "5.4", "mmol/L", 5.4],
    ["Haemoglobin (Hb)", "135", "g/L", 135],
    ["Calcium (Ca²⁺)", "2.4", "mmol/L", 2.4],
  ]
  for (const [test, value, unit, expected] of untouched) {
    it(`${test} ${value} ${unit}`, () => {
      const result = convertLabValue(test, value, unit)
      expect(result.status).toBe("already-canonical")
      if (result.status === "already-canonical") expect(result.value).toBe(expected)
    })
  }
})

describe("conventional units convert once, from the printed unit", () => {
  const converted: [string, string, string, number][] = [
    ["Creatinine", "1.0", "mg/dL", 88.4],
    ["Creatinine", "0.3", "mg/dL", 26.52],
    ["CRP", "0.5", "mg/dL", 5],
    ["Total bilirubin", "1.0", "mg/dL", 17.1],
    ["Urea (BUN)", "20", "mg/dL", 7.14],
    ["Glucose", "97", "mg/dL", 5.39],
    ["Haemoglobin (Hb)", "13.5", "g/dL", 135],
    ["Haematocrit (Hct)", "0.42", "L/L", 42],
    ["MCHC", "34", "g/dL", 340],
    ["Calcium (Ca²⁺)", "9.6", "mg/dL", 2.4],
  ]
  for (const [test, value, unit, expected] of converted) {
    it(`${test} ${value} ${unit} -> ${expected}`, () => {
      const result = convertLabValue(test, value, unit)
      expect(result.status).toBe("converted")
      if (result.status === "converted") {
        expect(result.value).toBeCloseTo(expected, 2)
        expect(result.sourceValue).toBeCloseTo(Number(value), 4)
        expect(result.sourceUnit).toBe(unit)
      }
    })
  }
})

describe("unit spellings", () => {
  it("accepts the micro sign and Greek mu interchangeably", () => {
    expect(convertLabValue("Creatinine", "80", "µmol/L").status).toBe("already-canonical")
    expect(convertLabValue("Creatinine", "80", "μmol/L").status).toBe("already-canonical")
    expect(convertLabValue("Creatinine", "80", "umol/l").status).toBe("already-canonical")
  })
  it("ignores case and spacing", () => {
    expect(convertLabValue("Creatinine", "1.0", " MG/DL ").status).toBe("converted")
  })
})

describe("refuses to guess", () => {
  it("reports an unrecognised unit rather than converting", () => {
    const result = convertLabValue("Creatinine", "10", "furlongs")
    expect(result.status).toBe("unknown-unit")
    if (result.status === "unknown-unit") {
      expect(result.sourceValue).toBe(10)
      expect(result.canonicalUnit).toBe("μmol/L")
    }
  })

  it("reports an unknown test rather than storing it", () => {
    expect(convertLabValue("Not A Real Test", "5", "mg/L").status).toBe("unknown-test")
  })

  it("reports an unparsable number", () => {
    expect(convertLabValue("CRP", "positive", "mg/L").status).toBe("unparsable")
  })

  it("never pre-selects a row it could not convert confidently", () => {
    expect(isConfidentConversion(convertLabValue("Creatinine", "10", "μmol/L"))).toBe(true)
    expect(isConfidentConversion(convertLabValue("Creatinine", "1.0", "mg/dL"))).toBe(true)
    expect(isConfidentConversion(convertLabValue("Creatinine", "10", "furlongs"))).toBe(false)
    expect(isConfidentConversion(convertLabValue("CRP", "positive", "mg/L"))).toBe(false)
  })
})

describe("the specific corruptions the old heuristic produced", () => {
  // Each of these was silently multiplied or divided because the number fell
  // inside a range the old code assumed meant "conventional units".
  it("CRP 5 mg/L stays 5, not 50", () => {
    const r = convertLabValue("CRP", "5", "mg/L")
    expect(r.status !== "unparsable" && "value" in r ? r.value : null).toBe(5)
  })
  it("bilirubin 10 µmol/L stays 10, not 171", () => {
    const r = convertLabValue("Total bilirubin", "10", "μmol/L")
    expect(r.status !== "unparsable" && "value" in r ? r.value : null).toBe(10)
  })
  it("urea 7 mmol/L stays 7, not 2.5", () => {
    const r = convertLabValue("Urea (BUN)", "7", "mmol/L")
    expect(r.status !== "unparsable" && "value" in r ? r.value : null).toBe(7)
  })
  it("neonatal creatinine 10 µmol/L stays 10, not 884", () => {
    const r = convertLabValue("Creatinine", "10", "μmol/L")
    expect(r.status !== "unparsable" && "value" in r ? r.value : null).toBe(10)
  })
})
