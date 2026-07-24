export type ClinicalSection = "preop" | "intraop" | "postop"
export type ClinicalIssueSeverity = "error" | "warning"

export type ClinicalIssueCode =
  | "invalid_type"
  | "invalid_value"
  | "out_of_range"
  | "too_long"
  | "missing_age"
  | "missing_sex"
  | "missing_height"
  | "missing_weight"
  | "missing_diagnosis"
  | "missing_procedure"
  | "missing_blood_pressure"
  | "missing_heart_rate"
  | "missing_respiratory_rate"
  | "missing_airway"
  | "missing_asa"
  | "missing_preop"
  | "missing_intraop"
  | "missing_technique"
  | "invalid_intraop_times"
  | "missing_postop"
  | "missing_aldrete"
  | "missing_disposition"

export type ClinicalIssue = {
  code: ClinicalIssueCode
  path: string[]
  severity: ClinicalIssueSeverity
  min?: number
  max?: number
  allowed?: readonly string[]
}

export type ClinicalValidationResult = {
  valid: boolean
  issues: ClinicalIssue[]
}

type NumberRule = { min: number; max: number; integer?: boolean }

const NUMBER_RULES: Record<ClinicalSection, Record<string, NumberRule>> = {
  preop: {
    ageYears: { min: 0, max: 149, integer: true },
    heightCm: { min: 30, max: 280 },
    weightKg: { min: 0.1, max: 700 },
    bmi: { min: 0, max: 500 },
    bpSystolic: { min: 40, max: 300, integer: true },
    bpDiastolic: { min: 20, max: 200, integer: true },
    heartRate: { min: 10, max: 350, integer: true },
    spO2: { min: 0, max: 100 },
    temperature: { min: 25, max: 45 },
    respiratoryRate: { min: 0, max: 100, integer: true },
    mouthOpeningCm: { min: 0, max: 10 },
    thyromental: { min: 0, max: 15 },
    rcriScore: { min: 0, max: 6, integer: true },
    gutaScore: { min: 0, max: 100 },
    apfelScore: { min: 0, max: 4, integer: true },
    stopBangScore: { min: 0, max: 8, integer: true },
  },
  intraop: {
    durationMinutes: { min: 0, max: 1440, integer: true },
    tubeSize: { min: 2, max: 12 },
    peepCmH2O: { min: 0, max: 40 },
    lmaSize: { min: 1, max: 5 },
    oralTubeSize: { min: 2, max: 10 },
    nasalTubeSize: { min: 2, max: 10 },
    dltSize: { min: 20, max: 50 },
    endobronchialSize: { min: 2, max: 10 },
    crystalloidsMl: { min: 0, max: 50_000, integer: true },
    colloidsMl: { min: 0, max: 20_000, integer: true },
    bloodMl: { min: 0, max: 20_000, integer: true },
    urineMl: { min: 0, max: 20_000, integer: true },
  },
  postop: {
    aldreteActivity: { min: 0, max: 2, integer: true },
    aldreteRespiration: { min: 0, max: 2, integer: true },
    aldreteCirculation: { min: 0, max: 2, integer: true },
    aldreteConsciousness: { min: 0, max: 2, integer: true },
    aldreteSpO2: { min: 0, max: 2, integer: true },
    aldreteTotal: { min: 0, max: 10, integer: true },
    recoveryBpSystolic: { min: 40, max: 300, integer: true },
    recoveryBpDiastolic: { min: 20, max: 200, integer: true },
    recoveryHeartRate: { min: 10, max: 350, integer: true },
    recoverySpO2: { min: 0, max: 100 },
    painScoreNRS: { min: 0, max: 10, integer: true },
    temperatureCelsius: { min: 25, max: 45 },
  },
}

export const CLINICAL_NUMBER_RULES: Readonly<Record<ClinicalSection, Readonly<Record<string, NumberRule>>>> = NUMBER_RULES

const ENUM_RULES: Record<ClinicalSection, Record<string, readonly string[]>> = {
  preop: {
    sex: ["MALE", "FEMALE", "OTHER", "UNKNOWN"],
    bloodType: ["A", "B", "AB", "O"],
    rhFactor: ["POSITIVE", "NEGATIVE"],
    mallampati: ["I", "II", "III", "IV"],
    neckMobility: ["FULL", "LIMITED", "FIXED"],
    upperLipBiteTest: ["CLASS_I", "CLASS_II", "CLASS_III"],
    cormackLehane: ["I", "IIa", "IIb", "III", "IV"],
    asaScore: ["I", "II", "III", "IV", "V", "VI"],
  },
  intraop: {
    airwayDevice: ["FACE_MASK", "LMA", "ORAL_ETT", "NASAL_ETT", "SURGICAL_AIRWAY"],
    volatileAgent: ["SEVOFLURANE", "DESFLURANE", "ISOFLURANE"],
    plexusBlock: [
      "AXILLARY", "INTERSCALENE", "SUPRACLAVICULAR", "INFRACLAVICULAR",
      "FEMORAL", "SCIATIC", "POPLITEAL", "TAP", "ERECTOR_SPINAE",
    ],
    cvkSite: ["INTERNAL_JUGULAR", "EXTERNAL_JUGULAR", "SUBCLAVIAN", "FEMORAL"],
    arterialLineSite: ["RADIAL", "DORSALIS_PEDIS", "FEMORAL", "BRACHIAL"],
    cormackLehane: ["I", "IIa", "IIb", "III", "IV"],
  },
  postop: {
    disposition: ["WARD", "PACU", "ICU"],
  },
}

export const CLINICAL_ENUM_RULES: Readonly<Record<ClinicalSection, Readonly<Record<string, readonly string[]>>>> = ENUM_RULES

const STRING_MAX: Record<ClinicalSection, Record<string, number>> = {
  preop: {
    diagnosis: 1000,
    plannedProcedure: 1000,
    icdCode: 20,
    teamNotes: 500,
    physicalExamReport: 500,
    notes: 2000,
    familyAnesthesiaDetails: 500,
    difficultAirwayNotes: 500,
  },
  intraop: {
    airwayNotes: 2000,
    dltType: 50,
    dltSide: 20,
    premedicationEvening: 500,
    premedicationMorning: 500,
    bloodProductsNote: 1000,
    complications: 2000,
  },
  postop: {
    complications: 2000,
    dispositionNotes: 1000,
  },
}

export const CLINICAL_STRING_LIMITS: Readonly<Record<ClinicalSection, Readonly<Record<string, number>>>> = STRING_MAX

const BOOLEAN_FIELDS: Record<ClinicalSection, Set<string>> = {
  preop: new Set([
    "aiOptIn", "allergies", "latexAllergy", "familyAnesthesiaProblems",
    "dentalProsthetics", "looseTeeth", "smoking", "substanceAbuse",
    "heartArrhythmia", "bpUnobtainable", "heartRateUnobtainable",
    "spO2Unobtainable", "temperatureUnobtainable",
    "respiratoryRateUnobtainable", "retrognathia", "prominentIncisors",
    "facialHair", "difficultAirwayHistory", "airwayUnobtainable",
    "elective", "emergencySurgery",
  ]),
  intraop: new Set([
    "cuffed", "ippv", "jetVentilation", "fob", "oralCuffed", "nasalCuffed",
    "ecg", "urinaryCatheter", "stomachTube", "spO2Monitor", "invasiveBP",
    "cvpMonitor", "bglMonitor", "bloodGasMonitor", "neuroMonitor", "nbpMonitor",
    "etco2Monitor", "tempMonitor", "paCatheter", "tee", "bis",
    "entropyMonitor", "nirsMonitor", "evokedPotentials", "tofMonitor",
  ]),
  postop: new Set([
    "ponv", "recoveryBpUnobtainable", "recoveryHeartRateUnobtainable",
    "recoverySpO2Unobtainable", "recoveryTemperatureUnobtainable",
  ]),
}

function issue(
  code: ClinicalIssueCode,
  path: string,
  extra: Partial<ClinicalIssue> = {},
): ClinicalIssue {
  return { code, path: [path], severity: "error", ...extra }
}

function validatePatch(section: ClinicalSection, patch: Record<string, unknown>): ClinicalValidationResult {
  const issues: ClinicalIssue[] = []
  for (const [field, rule] of Object.entries(NUMBER_RULES[section])) {
    const raw = patch[field]
    if (raw === undefined || raw === null || raw === "") continue
    const value = typeof raw === "number" ? raw : Number(raw)
    if (!Number.isFinite(value)) {
      issues.push(issue("invalid_type", field))
      continue
    }
    const normalized = rule.integer ? Math.round(value) : value
    if (normalized < rule.min || normalized > rule.max) {
      issues.push(issue("out_of_range", field, { min: rule.min, max: rule.max }))
    }
  }
  for (const [field, allowed] of Object.entries(ENUM_RULES[section])) {
    const value = patch[field]
    if (value === undefined || value === null || value === "") continue
    if (typeof value !== "string" || !allowed.includes(value)) {
      issues.push(issue("invalid_value", field, { allowed }))
    }
  }
  for (const [field, max] of Object.entries(STRING_MAX[section])) {
    const value = patch[field]
    if (value === undefined || value === null) continue
    if (typeof value !== "string") issues.push(issue("invalid_type", field))
    else if (value.length > max) issues.push(issue("too_long", field, { max }))
  }
  for (const field of BOOLEAN_FIELDS[section]) {
    const value = patch[field]
    if (value !== undefined && value !== null && typeof value !== "boolean") {
      issues.push(issue("invalid_type", field))
    }
  }
  return { valid: issues.length === 0, issues }
}

export const validatePreopPatch = (patch: Record<string, unknown>) => validatePatch("preop", patch)
export const validateIntraopPatch = (patch: Record<string, unknown>) => validatePatch("intraop", patch)
export const validatePostopPatch = (patch: Record<string, unknown>) => validatePatch("postop", patch)

function isFilledNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value)
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

export function evaluatePreopReadiness(preop: Record<string, unknown> | null | undefined): ClinicalValidationResult {
  if (!preop) return { valid: false, issues: [issue("missing_preop", "preop")] }
  const issues: ClinicalIssue[] = []
  if (!isFilledNumber(preop.ageYears)) issues.push(issue("missing_age", "ageYears"))
  if (preop.sex == null || preop.sex === "" || preop.sex === "UNKNOWN") issues.push(issue("missing_sex", "sex"))
  if (!isFilledNumber(preop.heightCm)) issues.push(issue("missing_height", "heightCm"))
  if (!isFilledNumber(preop.weightKg)) issues.push(issue("missing_weight", "weightKg"))
  if (!isNonEmptyArray(preop.diagnoses) && !String(preop.diagnosis ?? "").trim()) {
    issues.push(issue("missing_diagnosis", "diagnoses"))
  }
  if (!isNonEmptyArray(preop.procedures) && !String(preop.plannedProcedure ?? "").trim()) {
    issues.push(issue("missing_procedure", "procedures"))
  }
  if (
    preop.bpUnobtainable !== true
    && (!isFilledNumber(preop.bpSystolic) || !isFilledNumber(preop.bpDiastolic))
  ) {
    issues.push(issue("missing_blood_pressure", "bpSystolic"))
  }
  if (preop.heartRateUnobtainable !== true && !isFilledNumber(preop.heartRate)) {
    issues.push(issue("missing_heart_rate", "heartRate"))
  }
  if (preop.respiratoryRateUnobtainable !== true && !isFilledNumber(preop.respiratoryRate)) {
    issues.push(issue("missing_respiratory_rate", "respiratoryRate"))
  }
  if (preop.airwayUnobtainable !== true && !preop.mallampati) {
    issues.push(issue("missing_airway", "mallampati"))
  }
  if (!preop.asaScore) issues.push(issue("missing_asa", "asaScore"))
  return { valid: issues.length === 0, issues }
}

export function evaluateIntraopReadiness(intraop: Record<string, unknown> | null | undefined): ClinicalValidationResult {
  if (!intraop || !intraop.startTime) {
    return { valid: false, issues: [issue("missing_intraop", "intraop.startTime")] }
  }
  const issues: ClinicalIssue[] = []
  if (!isNonEmptyArray(intraop.techniques)) {
    issues.push(issue("missing_technique", "intraop.techniques"))
  }
  if (
    intraop.endTime
    && new Date(String(intraop.startTime)).getTime() >= new Date(String(intraop.endTime)).getTime()
  ) {
    issues.push(issue("invalid_intraop_times", "intraop.endTime"))
  }
  return { valid: issues.length === 0, issues }
}

export function evaluatePostopReadiness(postop: Record<string, unknown> | null | undefined): ClinicalValidationResult {
  if (!postop) return { valid: false, issues: [issue("missing_postop", "postop")] }
  const issues: ClinicalIssue[] = []
  const hasAldrete = [
    "aldreteActivity",
    "aldreteRespiration",
    "aldreteCirculation",
    "aldreteConsciousness",
    "aldreteSpO2",
  ].some(field => postop[field] != null)
  if (!hasAldrete) issues.push(issue("missing_aldrete", "postop.aldreteActivity"))
  if (!postop.disposition) issues.push(issue("missing_disposition", "postop.disposition"))
  return { valid: issues.length === 0, issues }
}

export type CaseReadinessInput = {
  preop?: Record<string, unknown> | null
  intraop?: Record<string, unknown> | null
  postop?: Record<string, unknown> | null
}

export function evaluateCaseFinalization(input: CaseReadinessInput): ClinicalValidationResult {
  const issues: ClinicalIssue[] = []
  if (!input.preop) {
    issues.push(issue("missing_preop", "preop"))
  }
  issues.push(...evaluateIntraopReadiness(input.intraop).issues)
  issues.push(...evaluatePostopReadiness(input.postop).issues)
  return { valid: issues.length === 0, issues }
}
