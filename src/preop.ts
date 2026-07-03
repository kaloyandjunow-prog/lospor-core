export type TaggedClinicalItem = {
  label: string
  code?: string
  sub?: string
  system?: string
  sourceVocabulary?: string
  sourceCode?: string
  standardConceptId?: number
  mappingStatus?: string
}

export function getIcd10BodySystem(code: string): string {
  if (!code) return "Other"
  const p1 = code.trim().charAt(0).toUpperCase()
  const num = parseInt(code.trim().slice(1, 3), 10) || 0
  if (p1 === "I") return "Cardiovascular"
  if (p1 === "J") return "Respiratory"
  if (p1 === "G" || p1 === "F") return "Neurological / Psychiatric"
  if (p1 === "E") return "Endocrine / Metabolic"
  if (p1 === "K") return "Gastrointestinal / Hepatic"
  if (p1 === "N") return "Renal / Urological"
  if (p1 === "C") return "Neoplasms"
  if (p1 === "D") return num >= 50 && num <= 89 ? "Haematological" : "Neoplasms"
  if (p1 === "M") return "Musculoskeletal"
  if (p1 === "A" || p1 === "B") return "Infectious diseases"
  if (p1 === "H") return "Ophthalmological / ENT"
  if (p1 === "O") return "Obstetric"
  if (p1 === "Q") return "Congenital"
  return "Other"
}
