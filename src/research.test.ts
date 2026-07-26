import { describe, expect, it } from "vitest"
import {
  RESEARCH_DEFAULT_PAGE_SIZE,
  RESEARCH_MAX_PAGE_SIZE,
  activeResearchFilterCount,
  makeResearchPagination,
  normalizeResearchCohort,
  normalizeResearchPagination,
  researchPercent,
  shouldSuppressResearchCell,
} from "./research"

describe("research contracts", () => {
  it("normalizes an empty cohort to complete cases", () => {
    expect(normalizeResearchCohort()).toEqual({
      version: 1,
      filters: expect.objectContaining({ statuses: ["COMPLETE"] }),
    })
  })

  it("trims and deduplicates controlled filter values", () => {
    const result = normalizeResearchCohort({
      filters: {
        statuses: ["COMPLETE"],
        diagnosisCodes: [" C61 ", "C61", ""],
        diagnosisText: " prostate ",
        ageYears: { min: 90, max: 20 },
        minimumCompleteness: 140,
      },
    })

    expect(result.filters.diagnosisCodes).toEqual(["C61"])
    expect(result.filters.diagnosisText).toBe("prostate")
    expect(result.filters.ageYears).toEqual({ min: 20, max: 90 })
    expect(result.filters.minimumCompleteness).toBe(100)
  })

  it("enforces safe pagination bounds", () => {
    expect(normalizeResearchPagination()).toEqual({ skip: 0, take: RESEARCH_DEFAULT_PAGE_SIZE })
    expect(normalizeResearchPagination({ skip: -4, take: 1000 })).toEqual({
      skip: 0,
      take: RESEARCH_MAX_PAGE_SIZE,
    })
    expect(makeResearchPagination(75, { skip: 50, take: 25 })).toEqual({
      total: 75,
      skip: 50,
      take: 25,
      hasMore: false,
    })
  })

  it("suppresses only non-zero small cells", () => {
    expect(shouldSuppressResearchCell(0)).toBe(false)
    expect(shouldSuppressResearchCell(1)).toBe(true)
    expect(shouldSuppressResearchCell(4)).toBe(true)
    expect(shouldSuppressResearchCell(5)).toBe(false)
  })

  it("calculates percentages without invalid denominators", () => {
    expect(researchPercent(1, 4)).toBe(25)
    expect(researchPercent(2, 3)).toBe(66.7)
    expect(researchPercent(1, 0)).toBeNull()
  })

  it("counts only active non-default filters", () => {
    expect(activeResearchFilterCount(normalizeResearchCohort())).toBe(0)
    expect(activeResearchFilterCount(normalizeResearchCohort({
      filters: { statuses: ["COMPLETE"], emergency: true, asa: ["III"] },
    }))).toBe(2)
  })
})
