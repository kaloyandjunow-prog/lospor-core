/**
 * A planned procedure: the group a clinician chose, and optionally the exact
 * operation inside it.
 *
 * LOSPOR's procedure list is the 330 PRCCSR groups over ICD-10-PCS. Choosing a
 * group used to store the best-matching example code beside it, and that code
 * was nearly always the group's first: every cholecystectomy was saved as
 * 0FB40ZZ, an open *partial* excision, whatever was actually done. So a group
 * now stands on its own, under its own system, and an ICD-10-PCS code is
 * stored only when the clinician picks the exact operation. ICD-10-PCS is a
 * standard OMOP procedure vocabulary, so that code is also the research code.
 */

import type { ProcedureSearchRow } from "./search"

/** The system of a tag that names a LOSPOR procedure group and nothing finer. */
export const PROCEDURE_GROUP_SYSTEM = "LOSPOR_PROCEDURE_GROUP"

/** The system of a tag carrying an exact ICD-10-PCS code. */
export const ICD10PCS_SYSTEM = "ICD-10-PCS"

/** Seven characters from ICD-10-PCS's alphabet, which leaves out I and O. */
export function isIcd10PcsCode(code: unknown): code is string {
  return typeof code === "string" && /^[0-9A-HJ-NP-Z]{7}$/.test(code)
}

export type ProcedureTag = {
  label: string
  code: string
  system: string
  group: string
  domain?: string
  /** The ICD-10-PCS description, only on an exact operation. */
  description?: string
  sub?: string
}

/** A group chosen from the procedure search, with no operation implied. */
export function procedureGroupTag(row: Pick<ProcedureSearchRow, "group" | "domain">): ProcedureTag {
  return {
    label: row.group,
    code: row.group,
    system: PROCEDURE_GROUP_SYSTEM,
    group: row.group,
    ...(row.domain ? { domain: row.domain, sub: row.domain } : {}),
  }
}

/** The exact operation, keeping the group it was chosen from as the label. */
export function exactProcedureTag(row: Pick<ProcedureSearchRow, "code" | "group" | "domain" | "description">): ProcedureTag {
  return {
    label: row.group,
    code: row.code,
    system: ICD10PCS_SYSTEM,
    group: row.group,
    ...(row.domain ? { domain: row.domain } : {}),
    description: row.description,
    sub: `${row.code} · ${row.description}`,
  }
}

/** Whether a stored procedure carries a chosen ICD-10-PCS operation. */
export function isExactProcedure(tag: { system?: unknown; code?: unknown } | null | undefined): boolean {
  return tag?.system === ICD10PCS_SYSTEM && isIcd10PcsCode(tag.code)
}

/**
 * The group a stored procedure belongs to, for any shape it was saved in: the
 * explicit field, or the label every earlier tag carried the group in.
 */
export function procedureGroupOf(tag: { group?: unknown; label?: unknown; [key: string]: unknown } | null | undefined): string | null {
  const group = typeof tag?.group === "string" && tag.group.trim() ? tag.group.trim() : null
  if (group) return group
  return typeof tag?.label === "string" && tag.label.trim() ? tag.label.trim() : null
}

/**
 * Clinicians' words for an ICD-10-PCS approach. The classification says
 * "percutaneous endoscopic" for every laparoscopic, thoracoscopic and
 * arthroscopic operation, so a clinician typing the word they use found
 * nothing.
 */
const APPROACH_WORDS: readonly [RegExp, string][] = [
  [/^(lap|vats)$|^(laparoscop|thoracoscop|arthroscop|лапароскоп|торакоскоп|артроскоп)/, "percutaneous endoscopic"],
  [/^(endoscop|ендоскоп)/, "endoscopic"],
  [/^(open|отворен|laparotom|thoracotom|лапаротом|торакотом)/, "open"],
  [/^(percutaneous|перкутан)/, "percutaneous"],
]

/** The query words, with a clinician's approach word read as ICD-10-PCS says it. */
export function procedureQueryWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map(word => APPROACH_WORDS.find(([pattern]) => pattern.test(word))?.[1] ?? word)
}

export type ProcedureCodeRow = { code: string; description: string }

/**
 * The operations inside one group, narrowed by the words typed.
 *
 * Every word must appear in the description or start the code, so "lap
 * resection" narrows rather than widens. Ordered by code, which in ICD-10-PCS
 * keeps one body part and one operation together.
 */
export function filterProcedureCodes(
  rows: readonly ProcedureSearchRow[],
  group: string,
  query = "",
): ProcedureCodeRow[] {
  const words = procedureQueryWords(query)
  const wanted = group.trim().toLowerCase()
  return rows
    .filter(row => row.group.trim().toLowerCase() === wanted)
    .filter(row => {
      const description = row.description.toLowerCase()
      const code = row.code.toLowerCase()
      return words.every(word => description.includes(word) || code.startsWith(word))
    })
    .map(row => ({ code: row.code, description: row.description }))
    .sort((a, b) => a.code.localeCompare(b.code))
}
