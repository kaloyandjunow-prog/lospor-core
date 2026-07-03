export type CodedTag = { code?: string; sub?: string; label?: string }
export type CodedMed = { inn?: string; atcCode?: string; label?: string }
export type LabEntry = { test: string; value?: string; unit?: string }

function codesOf(tags: CodedTag[]): string[] {
  return tags.map(t => (t.code ?? t.sub ?? "").toUpperCase()).filter(Boolean)
}

function hasCodePrefix(tags: CodedTag[], prefixes: string[]): boolean {
  const codes = codesOf(tags)
  return prefixes.some(prefix => codes.some(code => code.startsWith(prefix)))
}

function hasAtcPrefix(meds: CodedMed[], prefixes: string[]): boolean {
  const codes = meds.map(m => (m.atcCode ?? "").toUpperCase()).filter(Boolean)
  return prefixes.some(prefix => codes.some(code => code.startsWith(prefix)))
}

export function suggestRcriIschemicHeart(comorbidities: CodedTag[]): boolean {
  return hasCodePrefix(comorbidities, ["I21", "I25"])
}

export function suggestRcriCHF(comorbidities: CodedTag[]): boolean {
  return hasCodePrefix(comorbidities, ["I50"])
}

export function suggestRcriCVD(comorbidities: CodedTag[]): boolean {
  return hasCodePrefix(comorbidities, ["I63", "I64", "G45"])
}

export function suggestRcriInsulinDM(comorbidities: CodedTag[], medications: CodedMed[]): boolean {
  return hasCodePrefix(comorbidities, ["E10"]) || hasAtcPrefix(medications, ["A10A"])
}

export function suggestRcriCreatinine(labResults: LabEntry[]): boolean {
  const entry = labResults.find(lab => lab.test === "Creatinine")
  if (!entry?.value) return false
  const value = parseFloat(entry.value)
  if (!Number.isFinite(value)) return false
  if (entry.unit === "mg/dL") return value > 2.0
  return value > 177
}

export function suggestStopBangBP(comorbidities: CodedTag[], medications: CodedMed[]): boolean {
  return hasCodePrefix(comorbidities, ["I10", "I11"]) || hasAtcPrefix(medications, ["C02", "C03", "C07", "C08", "C09"])
}

export type MedicationWarning = { key: string; label: string }

export function getMedicationWarnings(medications: CodedMed[]): MedicationWarning[] {
  const warnings: MedicationWarning[] = []
  if (hasAtcPrefix(medications, ["B01A"])) {
    warnings.push({ key: "anticoagulant", label: "Anticoagulant/antiplatelet \u2014 review neuraxial/regional bleeding risk" })
  }
  if (hasAtcPrefix(medications, ["H02"])) {
    warnings.push({ key: "steroid", label: "Chronic steroid use \u2014 consider perioperative steroid coverage" })
  }
  if (hasAtcPrefix(medications, ["C07"])) {
    warnings.push({ key: "betablocker", label: "Beta-blocker \u2014 continue perioperatively per protocol" })
  }
  return warnings
}

export type AirwayFindings = {
  mallampati?: string | null
  neckMobility?: string | null
  mouthOpeningCm?: number | null
  cormackLehane?: string | null
}

export function suggestsDifficultAirwayEquipment(findings: AirwayFindings): boolean {
  if (findings.mallampati === "III" || findings.mallampati === "IV") return true
  if (findings.neckMobility === "FIXED") return true
  if (findings.mouthOpeningCm != null && findings.mouthOpeningCm < 3) return true
  if (findings.cormackLehane && ["IIb", "III", "IV"].includes(findings.cormackLehane)) return true
  return false
}
