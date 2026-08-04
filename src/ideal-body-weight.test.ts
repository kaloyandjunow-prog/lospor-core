import { describe, expect, it } from "vitest"
import {
  CDC_CHILD_MEDIAN_STATURE_CM,
  CDC_CHILD_MEDIAN_WEIGHT_KG,
  CDC_INFANT_MEDIAN_LENGTH_CM,
  CDC_INFANT_MEDIAN_WEIGHT_KG,
} from "./cdc-growth-reference"
import {
  calculateDevineIdealBodyWeight,
  calculateMcLarenIdealBodyWeight,
  resolveIdealBodyWeight,
} from "./ideal-body-weight"

function pointAt(
  rows: readonly (readonly [number, number])[],
  ageMonths: number,
): readonly [number, number] {
  const point = rows.find(row => row[0] === ageMonths)
  if (!point) throw new Error(`Missing reference point at ${ageMonths} months`)
  return point
}

describe("ideal body weight", () => {
  it("uses Devine for adults without assigning OTHER to a sex curve", () => {
    expect(calculateDevineIdealBodyWeight({ heightCm: 180, sex: "MALE" })).toMatchObject({
      available: true,
      method: "DEVINE_1974",
      roundedKg: 75,
    })
    expect(calculateDevineIdealBodyWeight({ heightCm: 180, sex: "OTHER" })).toEqual(
      expect.objectContaining({ available: false, reason: "UNSUPPORTED_SEX" }),
    )
  })

  it("maps a child median stature to the matching CDC median weight", () => {
    const [, stature] = pointAt(CDC_CHILD_MEDIAN_STATURE_CM.MALE, 120.5)
    const [, weight] = pointAt(CDC_CHILD_MEDIAN_WEIGHT_KG.MALE, 120.5)
    const result = calculateMcLarenIdealBodyWeight({
      age: { value: 10, unit: "YEARS" },
      heightCm: stature,
      sex: "MALE",
    })
    expect(result).toMatchObject({
      available: true,
      method: "MCLAREN_CDC_2000",
      referenceAgeMonths: 120.5,
      kilograms: weight,
    })
  })

  it("interpolates both height-age and median weight", () => {
    const lowerHeight = pointAt(CDC_CHILD_MEDIAN_STATURE_CM.FEMALE, 100.5)
    const upperHeight = pointAt(CDC_CHILD_MEDIAN_STATURE_CM.FEMALE, 101.5)
    const lowerWeight = pointAt(CDC_CHILD_MEDIAN_WEIGHT_KG.FEMALE, 100.5)
    const upperWeight = pointAt(CDC_CHILD_MEDIAN_WEIGHT_KG.FEMALE, 101.5)
    const result = calculateMcLarenIdealBodyWeight({
      age: { value: 8, unit: "YEARS" },
      heightCm: (lowerHeight[1] + upperHeight[1]) / 2,
      sex: "FEMALE",
    })
    expect(result.available).toBe(true)
    if (result.available) {
      expect(result.referenceAgeMonths).toBeCloseTo(101, 8)
      expect(result.kilograms).toBeCloseTo((lowerWeight[1] + upperWeight[1]) / 2, 8)
    }
  })

  it("uses infant length tables below 24 months and child stature tables at 24 months", () => {
    const infantLength = pointAt(CDC_INFANT_MEDIAN_LENGTH_CM.MALE, 23.5)
    const infantWeight = pointAt(CDC_INFANT_MEDIAN_WEIGHT_KG.MALE, 23.5)
    expect(calculateMcLarenIdealBodyWeight({
      age: { value: 23, unit: "MONTHS" },
      heightCm: infantLength[1],
      sex: "MALE",
    })).toMatchObject({ available: true, kilograms: infantWeight[1], referenceMeasurement: "LENGTH" })

    const childStature = pointAt(CDC_CHILD_MEDIAN_STATURE_CM.MALE, 24)
    const childWeight = pointAt(CDC_CHILD_MEDIAN_WEIGHT_KG.MALE, 24)
    expect(calculateMcLarenIdealBodyWeight({
      age: { value: 24, unit: "MONTHS" },
      heightCm: childStature[1],
      sex: "MALE",
    })).toMatchObject({ available: true, kilograms: childWeight[1], referenceMeasurement: "STATURE" })
  })

  it("does not extrapolate or silently substitute another method", () => {
    expect(calculateMcLarenIdealBodyWeight({
      age: { value: 10, unit: "YEARS" },
      heightCm: 220,
      sex: "MALE",
    })).toEqual(expect.objectContaining({ available: false, reason: "OUTSIDE_REFERENCE_HEIGHT" }))
    expect(resolveIdealBodyWeight({
      clinicalMode: "PEDIATRIC",
      age: { value: 10, unit: "YEARS" },
      heightCm: 140,
      sex: "OTHER",
    })).toEqual(expect.objectContaining({ available: false, method: "MCLAREN_CDC_2000" }))
  })
})
