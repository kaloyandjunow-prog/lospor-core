import {
  normalizePediatricAge,
  type PediatricAgeInput,
  type PediatricRuleReviewStatus,
} from "./pediatric"
import {
  resolvePediatricDoseSuggestion,
  type PediatricDoseBasis,
  type PediatricDoseProfile,
  type PediatricDoseResolution,
} from "./pediatric-dose"
import { calculateMostellerBsa } from "./pediatric-calculators"
import { resolveIdealBodyWeight } from "./ideal-body-weight"
import { isBloodProductFluid } from "./intraop-fluids"
import {
  resolveDrugSelectionSurface,
  type DrugSelectionSurface,
} from "./drug-selection"
import {
  DRUG_CATALOG,
  FLUID_CATALOG,
  INFUSION_CATALOG,
  parseDoseProfile,
  type DoseProfile,
} from "./catalog"
import {
  canonicalDoseUnit,
  canonicalDoseProfileMetadata,
  canonicalizeDoseProfile,
  normalizeAdministrationRoute,
  type CanonicalDoseUnit,
} from "./clinical-rule-vocabulary"

export const CLINICAL_RULE_KINDS = [
  "PEDIATRIC_DRUG_DOSE",
  "PEDIATRIC_DRUG_PROFILE",
  "PEDIATRIC_DRUG_POLICY",
  "PEDIATRIC_FLUID_PROFILE",
  "PEDIATRIC_INFUSION_PROFILE",
  "ADULT_DRUG_PROFILE",
  "ADULT_INFUSION_PROFILE",
  "ADULT_FLUID_PROFILE",
] as const

export type ClinicalRuleKind = typeof CLINICAL_RULE_KINDS[number]

/** Legacy persisted kinds removed when equipment became fixed application guidance. */
export const LEGACY_EQUIPMENT_RULE_KINDS = [
  "ADULT_EQUIPMENT_PROFILE",
  "PEDIATRIC_EQUIPMENT",
  "PEDIATRIC_EQUIPMENT_POLICY",
] as const

export type LegacyEquipmentRuleKind = typeof LEGACY_EQUIPMENT_RULE_KINDS[number]

export const FIXED_EQUIPMENT_RULE_REJECTION_MESSAGE =
  "Equipment suggestions are globally fixed application guidance and cannot be edited through clinical rulesets."

export function isLegacyEquipmentRuleKind(value: unknown): value is LegacyEquipmentRuleKind {
  return typeof value === "string"
    && LEGACY_EQUIPMENT_RULE_KINDS.includes(value as LegacyEquipmentRuleKind)
}

type PediatricRuleAgeBand = {
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
}

export const DRUG_PROFILE_AVAILABILITIES = [
  "AUTO",
  "MANUAL",
  "LOCAL",
  "HIDDEN",
] as const

export type DrugProfileAvailability = typeof DRUG_PROFILE_AVAILABILITIES[number]

type PediatricRuleWeightBand = {
  minimumWeightKg?: number | null
  minimumWeightInclusive?: boolean
  maximumWeightKg?: number | null
  maximumWeightInclusive?: boolean
}

export type PediatricDrugDoseRulePayload = PediatricRuleAgeBand & {
  kind: "PEDIATRIC_DRUG_DOSE"
  medicationKey: string
  labelEn: string
  labelBg?: string | null
  inn?: string | null
  indication: string
  route: string
  basis: PediatricDoseBasis
  amountPerUnit?: number | null
  flatAmount?: number | null
  minimumAmount?: number | null
  maximumAmount?: number | null
  roundTo?: number | null
  doseUnit: string
}

export type PediatricDrugProfileRulePayload = PediatricRuleAgeBand & PediatricRuleWeightBand & {
  kind: "PEDIATRIC_DRUG_PROFILE"
  medicationKey: string
  labelEn: string
  labelBg?: string | null
  inn?: string | null
  category?: string | null
  /** Legacy stored profiles omit this and are interpreted as AUTO. */
  availability?: DrugProfileAvailability
  /** LOCAL/HIDDEN bands may deliberately have no platform selector surface. */
  profile: DoseProfile | null
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  manualUnit?: string | null
}

export type PediatricFluidProfileRulePayload = PediatricRuleAgeBand & {
  kind: "PEDIATRIC_FLUID_PROFILE"
  itemKey: string
  labelEn: string
  labelBg?: string | null
  category?: string | null
  profile: DoseProfile
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
}

export const PEDIATRIC_INFUSION_DISPOSITIONS = DRUG_PROFILE_AVAILABILITIES

export type PediatricInfusionDisposition =
  typeof PEDIATRIC_INFUSION_DISPOSITIONS[number]

/**
 * One non-overlapping pediatric infusion surface. Separate rows are used for
 * age/weight bands so institution and personal overrides keep normal rule-key
 * semantics instead of replacing an opaque nested matrix.
 */
export type PediatricInfusionProfileRulePayload = PediatricRuleAgeBand & {
  kind: "PEDIATRIC_INFUSION_PROFILE"
  itemKey: string
  labelEn: string
  labelBg?: string | null
  category?: string | null
  disposition: PediatricInfusionDisposition
  routeDispositions: Record<string, PediatricInfusionDisposition>
  manualEntryOnly: boolean
  routeManualEntryOnly: Record<string, boolean>
  /** LOCAL/HIDDEN rows may deliberately have no platform slider surface. */
  profile: DoseProfile | null
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  manualUnit?: string | null
  minimumWeightKg?: number | null
  minimumWeightInclusive?: boolean
  maximumWeightKg?: number | null
  maximumWeightInclusive?: boolean
  routineSuggestion?: boolean
  advisory?: string | null
}

export const PEDIATRIC_DRUG_POLICY_DISPOSITIONS = [
  "AUTOFILL_PROFILE",
  "MANUAL_PROFILE",
  "MANUAL_NO_PROFILE",
  "FORMULARY_REQUIRED",
  "SCHEMA_BLOCKED",
  "EXCLUDED",
  "PENDING_RESEARCH",
] as const

export type PediatricDrugPolicyDisposition =
  typeof PEDIATRIC_DRUG_POLICY_DISPOSITIONS[number]

export const PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES = [
  "PENDING",
  "EVIDENCE_REVIEWED",
  "LOCAL_POLICY_REQUIRED",
  "APPROVED",
] as const

export type PediatricDrugPolicyReviewStatus =
  typeof PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES[number]

/**
 * Draft/governance ledger entry for a catalog drug. Policy rows are deliberately
 * ignored by the runtime dose resolver; only PEDIATRIC_DRUG_PROFILE rows can
 * provide selector defaults, limits or pills.
 */
export type PediatricDrugPolicyRulePayload = {
  kind: "PEDIATRIC_DRUG_POLICY"
  medicationKey: string
  labelEn: string
  labelBg?: string | null
  inn?: string | null
  category?: string | null
  disposition: PediatricDrugPolicyDisposition
  reviewStatus: PediatricDrugPolicyReviewStatus
  rationaleEn: string
  rationaleBg?: string | null
}

export type AdultDoseProfileRuleKind =
  | "ADULT_DRUG_PROFILE"
  | "ADULT_INFUSION_PROFILE"
  | "ADULT_FLUID_PROFILE"

export type AdultDoseProfileRulePayload = {
  kind: AdultDoseProfileRuleKind
  itemKey: string
  labelEn: string
  labelBg?: string | null
  category?: string | null
  profile: DoseProfile
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  /** Only applies to ADULT_DRUG_PROFILE. Legacy rows default to AUTO. */
  availability?: DrugProfileAvailability
}

export type ClinicalRulePayload =
  | PediatricDrugDoseRulePayload
  | PediatricDrugProfileRulePayload
  | PediatricDrugPolicyRulePayload
  | PediatricFluidProfileRulePayload
  | PediatricInfusionProfileRulePayload
  | AdultDoseProfileRulePayload
export type PediatricClinicalRulePayload =
  | PediatricDrugDoseRulePayload
  | PediatricDrugProfileRulePayload
  | PediatricDrugPolicyRulePayload
  | PediatricFluidProfileRulePayload
  | PediatricInfusionProfileRulePayload
export type ClinicalPresetStatus = "DRAFT" | "PUBLISHED" | "RETIRED"
export type ClinicalRuleOrigin = "PLATFORM" | "INSTITUTION" | "USER" | "PRESET" | "INSTITUTION_OVERRIDE"
export type ClinicalRuleMode = "ADULT" | "PEDIATRIC"
export type ClinicalPresetScope = "PLATFORM" | "INSTITUTION" | "USER"

export type ClinicalPresetRule = {
  id: string
  ruleKey: string
  ruleVersion: string
  payload: ClinicalRulePayload
  sourceRefs: string[]
}

export type EffectiveClinicalRule = ClinicalPresetRule & {
  origin: ClinicalRuleOrigin
  presetId: string
  overrideId?: string | null
}

export type ClinicalPresetDto = {
  id: string
  key: string
  name: string
  description: string | null
  clinicalMode: ClinicalRuleMode
  scope: ClinicalPresetScope
  ownerInstitutionId: string | null
  ownerInstitutionName: string | null
  ownerUserId: string | null
  ownerUserName: string | null
  copiedFromPresetId: string | null
  copiedFromVersion: number | null
  version: number
  status: ClinicalPresetStatus
  rules: ClinicalPresetRule[]
  assignedInstitutionCount: number
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export type ClinicalRuleInstitutionDto = {
  id: string
  name: string
  city: string
  clinicalPresetId?: string
  clinicalPresetName?: string
}

export type ClinicalRulesetSelectionDto = {
  clinicalMode: ClinicalRuleMode
  platformPresetId: string | null
  institutionPresetId: string | null
  userPresetId: string | null
  effectivePresetId: string | null
  effectivePresetName: string | null
  effectiveScope: ClinicalPresetScope | null
  effectiveVersion: number | null
}

export type ClinicalRuleReviewerDto = {
  id: string
  name: string
  title: string | null
  role: string
}

export type InstitutionClinicalRuleOverrideDto = {
  id: string
  institutionId: string
  presetId: string
  ruleKey: string
  baseRuleVersion: string
  overrideVersion: string
  payload: ClinicalRulePayload
  sourceRefs: string[]
  rationale: string
  status: PediatricRuleReviewStatus
  proposedById: string | null
  proposedByName: string | null
  designatedReviewerId: string | null
  designatedReviewerName: string | null
  designatedReviewedAt: string | null
  hodApproverId: string | null
  hodApproverName: string | null
  hodApprovedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ClinicalRulesWorkbenchDto = {
  clinicalMode: ClinicalRuleMode
  actor: {
    id: string
    role: string
    institutionId: string | null
    institutionName: string | null
  }
  management: {
    activeScope: ClinicalPresetScope
    defaultScope: ClinicalPresetScope
    allowedScopes: ClinicalPresetScope[]
    ownerInstitutionId: string | null
    ownerInstitutionName: string | null
  }
  presets: ClinicalPresetDto[]
  institutions: ClinicalRuleInstitutionDto[]
  reviewers: ClinicalRuleReviewerDto[]
  overrides: InstitutionClinicalRuleOverrideDto[]
  effectiveRules: EffectiveClinicalRule[]
  selections: ClinicalRulesetSelectionDto[]
}

export type ClinicalRuleValidationIssue = { field: string; message: string }
export type ClinicalRuleValidation =
  | { valid: true; value: ClinicalRulePayload }
  | { valid: false; issues: ClinicalRuleValidationIssue[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function text(
  source: Record<string, unknown>,
  key: string,
  issues: ClinicalRuleValidationIssue[],
  options: { optional?: boolean; maximum?: number } = {},
): string | null {
  const raw = source[key]
  if (raw == null && options.optional) return null
  if (typeof raw !== "string" || !raw.trim()) {
    issues.push({ field: key, message: "Required text value" })
    return null
  }
  const value = raw.trim()
  if (value.length > (options.maximum ?? 200)) {
    issues.push({ field: key, message: `Must be at most ${options.maximum ?? 200} characters` })
  }
  return value
}

function numberValue(
  source: Record<string, unknown>,
  key: string,
  issues: ClinicalRuleValidationIssue[],
  options: { optional?: boolean; minimum?: number; exclusiveMinimum?: number } = {},
): number | null {
  const raw = source[key]
  if (raw == null && options.optional) return null
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    issues.push({ field: key, message: "Required finite number" })
    return null
  }
  if (options.minimum != null && raw < options.minimum) {
    issues.push({ field: key, message: `Must be at least ${options.minimum}` })
  }
  if (options.exclusiveMinimum != null && raw <= options.exclusiveMinimum) {
    issues.push({ field: key, message: `Must be greater than ${options.exclusiveMinimum}` })
  }
  return raw
}

function booleanValue(
  source: Record<string, unknown>,
  key: string,
  issues: ClinicalRuleValidationIssue[],
  fallback: boolean,
): boolean {
  const raw = source[key]
  if (raw == null) return fallback
  if (typeof raw !== "boolean") {
    issues.push({ field: key, message: "Must be a boolean" })
    return fallback
  }
  return raw
}

function validateAgeBand(
  source: Record<string, unknown>,
  issues: ClinicalRuleValidationIssue[],
): PediatricRuleAgeBand {
  const minimumAgeDays = numberValue(source, "minimumAgeDays", issues, { minimum: 0 }) ?? 0
  const maximumAgeDaysExclusive = numberValue(
    source,
    "maximumAgeDaysExclusive",
    issues,
    { exclusiveMinimum: 0 },
  ) ?? 0
  if (maximumAgeDaysExclusive <= minimumAgeDays) {
    issues.push({
      field: "maximumAgeDaysExclusive",
      message: "Must be greater than minimumAgeDays",
    })
  }
  return { minimumAgeDays, maximumAgeDaysExclusive }
}

function validateWeightBand(
  source: Record<string, unknown>,
  issues: ClinicalRuleValidationIssue[],
): Required<PediatricRuleWeightBand> {
  const minimumWeightKg = numberValue(source, "minimumWeightKg", issues, {
    optional: true,
    minimum: 0,
  })
  const maximumWeightKg = numberValue(source, "maximumWeightKg", issues, {
    optional: true,
    exclusiveMinimum: 0,
  })
  const minimumWeightInclusive = booleanValue(
    source,
    "minimumWeightInclusive",
    issues,
    true,
  )
  const maximumWeightInclusive = booleanValue(
    source,
    "maximumWeightInclusive",
    issues,
    false,
  )
  if (
    minimumWeightKg != null
    && maximumWeightKg != null
    && (
      maximumWeightKg < minimumWeightKg
      || (maximumWeightKg === minimumWeightKg
        && !(minimumWeightInclusive && maximumWeightInclusive))
    )
  ) {
    issues.push({
      field: "maximumWeightKg",
      message: "Weight band must contain at least one possible weight",
    })
  }
  return {
    minimumWeightKg,
    minimumWeightInclusive,
    maximumWeightKg,
    maximumWeightInclusive,
  }
}

export function validateClinicalRulePayload(input: unknown): ClinicalRuleValidation {
  if (!isRecord(input)) {
    return {
      valid: false,
      issues: [{ field: "payload", message: "Rule payload must be an object" }],
    }
  }
  const issues: ClinicalRuleValidationIssue[] = []
  const kind = input.kind
  if (isLegacyEquipmentRuleKind(kind)) {
    return {
      valid: false,
      issues: [{ field: "kind", message: FIXED_EQUIPMENT_RULE_REJECTION_MESSAGE }],
    }
  }
  if (!CLINICAL_RULE_KINDS.includes(kind as ClinicalRuleKind)) {
    return {
      valid: false,
      issues: [{ field: "kind", message: "Unknown clinical rule kind" }],
    }
  }

  if (
    kind === "ADULT_DRUG_PROFILE"
    || kind === "ADULT_INFUSION_PROFILE"
    || kind === "ADULT_FLUID_PROFILE"
  ) {
    const itemKey = text(input, "itemKey", issues) ?? ""
    const labelEn = text(input, "labelEn", issues) ?? ""
    let profile: DoseProfile | null = null
    try {
      const doseKind = kind === "ADULT_DRUG_PROFILE"
        ? "bolus"
        : kind === "ADULT_INFUSION_PROFILE"
          ? "infusion"
          : "fluid"
      const parsed = parseDoseProfile(labelEn || itemKey || "Clinical rule", doseKind, input.profile)
      if (!parsed.routes.some(route => normalizeAdministrationRoute(route))) {
        issues.push({ field: "profile.routes", message: "At least one supported route is required" })
      } else {
        profile = canonicalizeDoseProfile(parsed)
      }
    } catch (error) {
      issues.push({
        field: "profile",
        message: error instanceof Error ? error.message : "Invalid dose profile",
      })
    }
    if (!profile) return { valid: false, issues }
    const metadata = canonicalDoseProfileMetadata(profile)
    const value: AdultDoseProfileRulePayload = {
      kind,
      itemKey,
      labelEn,
      labelBg: text(input, "labelBg", issues, { optional: true }),
      category: text(input, "category", issues, { optional: true }),
      profile: metadata.profile,
      unit: metadata.unit,
      routeUnits: metadata.routeUnits,
      ...(kind === "ADULT_DRUG_PROFILE"
        ? {
            availability: DRUG_PROFILE_AVAILABILITIES.includes(
              input.availability as DrugProfileAvailability,
            )
              ? input.availability as DrugProfileAvailability
              : "AUTO" as const,
          }
        : {}),
    }
    if (
      kind === "ADULT_DRUG_PROFILE"
      && input.availability != null
      && !DRUG_PROFILE_AVAILABILITIES.includes(input.availability as DrugProfileAvailability)
    ) {
      issues.push({ field: "availability", message: "Unknown drug availability" })
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  if (kind === "PEDIATRIC_DRUG_POLICY") {
    const disposition = input.disposition
    if (!PEDIATRIC_DRUG_POLICY_DISPOSITIONS.includes(
      disposition as PediatricDrugPolicyDisposition,
    )) {
      issues.push({ field: "disposition", message: "Unknown pediatric drug disposition" })
    }
    const reviewStatus = input.reviewStatus
    if (!PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES.includes(
      reviewStatus as PediatricDrugPolicyReviewStatus,
    )) {
      issues.push({ field: "reviewStatus", message: "Unknown pediatric policy review status" })
    }
    const value: PediatricDrugPolicyRulePayload = {
      kind,
      medicationKey: text(input, "medicationKey", issues) ?? "",
      labelEn: text(input, "labelEn", issues) ?? "",
      labelBg: text(input, "labelBg", issues, { optional: true }),
      inn: text(input, "inn", issues, { optional: true }),
      category: text(input, "category", issues, { optional: true }),
      disposition: disposition as PediatricDrugPolicyDisposition,
      reviewStatus: reviewStatus as PediatricDrugPolicyReviewStatus,
      rationaleEn: text(input, "rationaleEn", issues, { maximum: 1000 }) ?? "",
      rationaleBg: text(input, "rationaleBg", issues, { optional: true, maximum: 1000 }),
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  const ageBand = validateAgeBand(input, issues)

  if (kind === "PEDIATRIC_INFUSION_PROFILE") {
    const itemKey = text(input, "itemKey", issues) ?? ""
    const labelEn = text(input, "labelEn", issues) ?? ""
    const disposition = input.disposition
    if (!PEDIATRIC_INFUSION_DISPOSITIONS.includes(
      disposition as PediatricInfusionDisposition,
    )) {
      issues.push({ field: "disposition", message: "Unknown pediatric infusion disposition" })
    }
    const routeDispositions: Record<string, PediatricInfusionDisposition> = {}
    if (!isRecord(input.routeDispositions)) {
      issues.push({ field: "routeDispositions", message: "Must be an object" })
    } else {
      for (const [rawRoute, rawDisposition] of Object.entries(input.routeDispositions)) {
        const route = normalizeAdministrationRoute(rawRoute)
        if (!route) {
          issues.push({ field: `routeDispositions.${rawRoute}`, message: "Unsupported route" })
          continue
        }
        if (!PEDIATRIC_INFUSION_DISPOSITIONS.includes(
          rawDisposition as PediatricInfusionDisposition,
        )) {
          issues.push({
            field: `routeDispositions.${rawRoute}`,
            message: "Unknown pediatric infusion disposition",
          })
          continue
        }
        routeDispositions[route] = rawDisposition as PediatricInfusionDisposition
      }
    }
    const routeManualEntryOnly: Record<string, boolean> = {}
    if (!isRecord(input.routeManualEntryOnly)) {
      issues.push({ field: "routeManualEntryOnly", message: "Must be an object" })
    } else {
      for (const [rawRoute, rawValue] of Object.entries(input.routeManualEntryOnly)) {
        const route = normalizeAdministrationRoute(rawRoute)
        if (!route) {
          issues.push({ field: `routeManualEntryOnly.${rawRoute}`, message: "Unsupported route" })
        } else if (typeof rawValue !== "boolean") {
          issues.push({ field: `routeManualEntryOnly.${rawRoute}`, message: "Must be a boolean" })
        } else {
          routeManualEntryOnly[route] = rawValue
        }
      }
    }
    let profile: DoseProfile | null = null
    if (input.profile != null) {
      try {
        const parsed = parseDoseProfile(
          labelEn || itemKey || "Pediatric infusion",
          "infusion",
          input.profile,
        )
        const unsupportedRoutes = parsed.routes.filter(route => !normalizeAdministrationRoute(route))
        if (unsupportedRoutes.length) {
          issues.push({
            field: "profile.routes",
            message: `Unsupported routes: ${unsupportedRoutes.join(", ")}`,
          })
        }
        profile = canonicalizeDoseProfile(parsed)
      } catch (error) {
        issues.push({
          field: "profile",
          message: error instanceof Error ? error.message : "Invalid pediatric infusion profile",
        })
      }
    }
    const typedDisposition = disposition as PediatricInfusionDisposition
    if (!profile && typedDisposition !== "LOCAL" && typedDisposition !== "HIDDEN") {
      issues.push({ field: "profile", message: "AUTO and MANUAL infusions require a selector profile" })
    }
    if (profile) {
      const knownRoutes = new Set(profile.routes)
      const unknownPolicyRoutes = Object.keys(routeDispositions)
        .filter(route => !knownRoutes.has(route))
      const unknownManualRoutes = Object.keys(routeManualEntryOnly)
        .filter(route => !knownRoutes.has(route))
      if (unknownPolicyRoutes.length || unknownManualRoutes.length) {
        issues.push({
          field: "routeDispositions",
          message: `Route policies must belong to profile routes: ${[
            ...unknownPolicyRoutes,
            ...unknownManualRoutes,
          ].join(", ")}`,
        })
      }
    }
    const manualUnit = text(input, "manualUnit", issues, { optional: true, maximum: 40 })
    if (manualUnit && !canonicalDoseUnit(manualUnit)) {
      issues.push({ field: "manualUnit", message: "Unsupported canonical dose/rate unit" })
    }
    const weightBand = validateWeightBand(input, issues)
    const metadata = profile
      ? canonicalDoseProfileMetadata(profile)
      : { profile: null, unit: null, routeUnits: {} }
    const value: PediatricInfusionProfileRulePayload = {
      kind,
      itemKey,
      labelEn,
      labelBg: text(input, "labelBg", issues, { optional: true }),
      category: text(input, "category", issues, { optional: true }),
      disposition: typedDisposition,
      routeDispositions,
      manualEntryOnly: booleanValue(input, "manualEntryOnly", issues, !profile),
      routeManualEntryOnly,
      profile: metadata.profile,
      unit: metadata.unit,
      routeUnits: metadata.routeUnits,
      manualUnit,
      ...weightBand,
      routineSuggestion: booleanValue(input, "routineSuggestion", issues, true),
      advisory: text(input, "advisory", issues, { optional: true, maximum: 1000 }),
      ...ageBand,
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  if (kind === "PEDIATRIC_FLUID_PROFILE") {
    const itemKey = text(input, "itemKey", issues) ?? ""
    const labelEn = text(input, "labelEn", issues) ?? ""
    const category = text(input, "category", issues, { optional: true })
    let profile: DoseProfile | null = null
    try {
      profile = canonicalizeDoseProfile(
        parseDoseProfile(labelEn || itemKey || "Pediatric fluid", "fluid", input.profile),
      )
      if (
        isBloodProductFluid({ name: labelEn || itemKey, category })
        && profile.fluidEntryModes?.includes("RATE")
      ) {
        issues.push({
          field: "profile.fluidEntryModes",
          message: "Blood products support volume entry only",
        })
      }
    } catch (error) {
      issues.push({
        field: "profile",
        message: error instanceof Error ? error.message : "Invalid pediatric fluid profile",
      })
    }
    if (!profile) return { valid: false, issues }
    const metadata = canonicalDoseProfileMetadata(profile)
    const value: PediatricFluidProfileRulePayload = {
      kind,
      itemKey,
      labelEn,
      labelBg: text(input, "labelBg", issues, { optional: true }),
      category,
      profile: metadata.profile,
      unit: metadata.unit,
      routeUnits: metadata.routeUnits,
      ...ageBand,
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  if (kind === "PEDIATRIC_DRUG_PROFILE") {
    const medicationKey = text(input, "medicationKey", issues) ?? ""
    const labelEn = text(input, "labelEn", issues) ?? ""
    const availability = input.availability == null
      ? "AUTO"
      : input.availability as DrugProfileAvailability
    if (!DRUG_PROFILE_AVAILABILITIES.includes(availability)) {
      issues.push({ field: "availability", message: "Unknown drug availability" })
    }
    let profile: DoseProfile | null = null
    if (input.profile != null) {
      try {
        const parsed = parseDoseProfile(labelEn || medicationKey || "Pediatric drug", "bolus", input.profile)
        const unsupportedRoutes = parsed.routes.filter(route => !normalizeAdministrationRoute(route))
        if (unsupportedRoutes.length) {
          issues.push({
            field: "profile.routes",
            message: `Unsupported routes: ${unsupportedRoutes.join(", ")}`,
          })
        }
        const canonicalRoutes = parsed.routes
          .map(route => normalizeAdministrationRoute(route))
          .filter((route): route is NonNullable<typeof route> => !!route)
        if (new Set(canonicalRoutes).size !== canonicalRoutes.length) {
          issues.push({ field: "profile.routes", message: "Routes must be unique after canonicalization" })
        }
        const routeModeRoutes = Object.keys(parsed.routeModes ?? {})
        const unknownModeRoutes = routeModeRoutes.filter(route => {
          const canonical = normalizeAdministrationRoute(route)
          return !canonical || !canonicalRoutes.includes(canonical)
        })
        if (unknownModeRoutes.length) {
          issues.push({
            field: "profile.routeModes",
            message: `Route profiles must belong to routes: ${unknownModeRoutes.join(", ")}`,
          })
        }
        profile = canonicalizeDoseProfile(parsed)
      } catch (error) {
        issues.push({
          field: "profile",
          message: error instanceof Error ? error.message : "Invalid pediatric drug profile",
        })
      }
    }
    if (!profile && availability !== "LOCAL" && availability !== "HIDDEN") {
      issues.push({ field: "profile", message: "AUTO and MANUAL drugs require a selector profile" })
    }
    if (profile && availability === "AUTO") {
      const defaultRoute = profile.defaultRoute || profile.routes[0]
      const defaultMode = defaultRoute ? profile.routeModes?.[defaultRoute] : undefined
      const calculation = defaultMode?.doseCalc
        ?? (defaultRoute ? profile.doseCalcByRoute?.[defaultRoute] : undefined)
        ?? profile.doseCalc
      if (!calculation) {
        issues.push({
          field: "profile.doseCalc",
          message: "AUTO drugs require a default dose calculation",
        })
      }
    }
    const manualUnit = text(input, "manualUnit", issues, { optional: true, maximum: 40 })
    if (manualUnit && !canonicalDoseUnit(manualUnit)) {
      issues.push({ field: "manualUnit", message: "Unsupported canonical dose unit" })
    }
    const weightBand = validateWeightBand(input, issues)
    const metadata = profile
      ? canonicalDoseProfileMetadata(profile)
      : { profile: null, unit: null, routeUnits: {} }
    const value: PediatricDrugProfileRulePayload = {
      kind,
      medicationKey,
      labelEn,
      labelBg: text(input, "labelBg", issues, { optional: true }),
      inn: text(input, "inn", issues, { optional: true }),
      category: text(input, "category", issues, { optional: true }),
      availability,
      profile: metadata.profile,
      unit: metadata.unit,
      routeUnits: metadata.routeUnits,
      manualUnit,
      ...weightBand,
      ...ageBand,
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  if (kind === "PEDIATRIC_DRUG_DOSE") {
    const basis = input.basis
    if (basis !== "TBW_KG" && basis !== "BSA_M2" && basis !== "FLAT") {
      issues.push({ field: "basis", message: "Unknown dose basis" })
    }
    const amountPerUnit = numberValue(input, "amountPerUnit", issues, {
      optional: basis === "FLAT",
      exclusiveMinimum: 0,
    })
    const flatAmount = numberValue(input, "flatAmount", issues, {
      optional: basis !== "FLAT",
      exclusiveMinimum: 0,
    })
    const minimumAmount = numberValue(input, "minimumAmount", issues, {
      optional: true,
      minimum: 0,
    })
    const maximumAmount = numberValue(input, "maximumAmount", issues, {
      optional: true,
      exclusiveMinimum: 0,
    })
    const roundTo = numberValue(input, "roundTo", issues, {
      optional: true,
      exclusiveMinimum: 0,
    })
    if (minimumAmount != null && maximumAmount != null && maximumAmount < minimumAmount) {
      issues.push({ field: "maximumAmount", message: "Must be at least minimumAmount" })
    }
    const value: PediatricDrugDoseRulePayload = {
      kind,
      medicationKey: text(input, "medicationKey", issues) ?? "",
      labelEn: text(input, "labelEn", issues) ?? "",
      labelBg: text(input, "labelBg", issues, { optional: true }),
      inn: text(input, "inn", issues, { optional: true }),
      indication: text(input, "indication", issues) ?? "",
      route: text(input, "route", issues) ?? "",
      basis: basis as PediatricDoseBasis,
      amountPerUnit,
      flatAmount,
      minimumAmount,
      maximumAmount,
      roundTo,
      doseUnit: text(input, "doseUnit", issues, { maximum: 40 }) ?? "",
      ...ageBand,
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  return {
    valid: false,
    issues: [{ field: "kind", message: "Unknown clinical rule kind" }],
  }
}

export type ClinicalRuleCollectionValidationIssue = {
  ruleKey?: string
  field: string
  message: string
}

export type ClinicalRuleCollectionValidation =
  | { valid: true; issues: [] }
  | { valid: false; issues: ClinicalRuleCollectionValidationIssue[] }

export function validateClinicalRuleCollection(
  rules: readonly Pick<ClinicalPresetRule, "ruleKey" | "payload">[],
): ClinicalRuleCollectionValidation {
  type PediatricProfileBandValidation = {
    ruleKey: string
    minimumAgeDays: number
    maximumAgeDaysExclusive: number
    minimumWeightKg: number | null
    minimumWeightInclusive: boolean
    maximumWeightKg: number | null
    maximumWeightInclusive: boolean
  }
  const issues: ClinicalRuleCollectionValidationIssue[] = []
  const keys = new Set<string>()
  const pediatricProfilesByItem = new Map<string, PediatricProfileBandValidation[]>()

  for (const rule of rules) {
    if (keys.has(rule.ruleKey)) {
      issues.push({ ruleKey: rule.ruleKey, field: "ruleKey", message: "Rule key must be unique" })
    }
    keys.add(rule.ruleKey)
    if (
      rule.payload.kind !== "PEDIATRIC_DRUG_PROFILE"
      && rule.payload.kind !== "PEDIATRIC_FLUID_PROFILE"
      && rule.payload.kind !== "PEDIATRIC_INFUSION_PROFILE"
    ) continue
    const payload = rule.payload
    const profile = payload.profile ? canonicalizeDoseProfile(payload.profile) : null
    if (profile) {
      if (!profile.defaultRoute || !profile.routes.includes(profile.defaultRoute)) {
        issues.push({
          ruleKey: rule.ruleKey,
          field: "profile.defaultRoute",
          message: "Default route must belong to routes",
        })
      }
      const hasBaseSurface = profile.min != null
        && profile.max != null
        && profile.unit != null
        && (profile.step != null || !!profile.variableStep?.length)
      for (const route of profile.routes) {
        if (!profile.routeModes?.[route] && !hasBaseSurface) {
          issues.push({
            ruleKey: rule.ruleKey,
            field: `profile.routeModes.${route}`,
            message: "Every route requires a complete route surface or a complete base surface",
          })
        }
      }
    }
    const itemKey = payload.kind === "PEDIATRIC_DRUG_PROFILE"
      ? payload.medicationKey
      : payload.itemKey
    const item = `${payload.kind}:${itemKey.trim().toUpperCase()}`
    const group = pediatricProfilesByItem.get(item) ?? []
    group.push({
      ruleKey: rule.ruleKey,
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      minimumWeightKg: payload.kind === "PEDIATRIC_INFUSION_PROFILE"
        || payload.kind === "PEDIATRIC_DRUG_PROFILE"
        ? payload.minimumWeightKg ?? null
        : null,
      minimumWeightInclusive: payload.kind === "PEDIATRIC_INFUSION_PROFILE"
        || payload.kind === "PEDIATRIC_DRUG_PROFILE"
        ? payload.minimumWeightInclusive ?? true
        : true,
      maximumWeightKg: payload.kind === "PEDIATRIC_INFUSION_PROFILE"
        || payload.kind === "PEDIATRIC_DRUG_PROFILE"
        ? payload.maximumWeightKg ?? null
        : null,
      maximumWeightInclusive: payload.kind === "PEDIATRIC_INFUSION_PROFILE"
        || payload.kind === "PEDIATRIC_DRUG_PROFILE"
        ? payload.maximumWeightInclusive ?? false
        : false,
    })
    pediatricProfilesByItem.set(item, group)
  }

  function weightContains(
    profile: PediatricProfileBandValidation,
    weightKg: number,
  ): boolean {
    const aboveMinimum = profile.minimumWeightKg == null
      || weightKg > profile.minimumWeightKg
      || (profile.minimumWeightInclusive && weightKg === profile.minimumWeightKg)
    const belowMaximum = profile.maximumWeightKg == null
      || weightKg < profile.maximumWeightKg
      || (profile.maximumWeightInclusive && weightKg === profile.maximumWeightKg)
    return aboveMinimum && belowMaximum
  }

  function weightBandsOverlap(
    left: PediatricProfileBandValidation,
    right: PediatricProfileBandValidation,
  ): boolean {
    const lower = Math.max(left.minimumWeightKg ?? -Infinity, right.minimumWeightKg ?? -Infinity)
    const upper = Math.min(left.maximumWeightKg ?? Infinity, right.maximumWeightKg ?? Infinity)
    return lower < upper || (lower === upper && weightContains(left, lower) && weightContains(right, lower))
  }

  for (const profiles of pediatricProfilesByItem.values()) {
    profiles.sort((left, right) =>
      left.minimumAgeDays - right.minimumAgeDays
      || (left.minimumWeightKg ?? -Infinity) - (right.minimumWeightKg ?? -Infinity),
    )
    for (let index = 0; index < profiles.length; index += 1) {
      const current = profiles[index]
      if (!current) continue
      for (let comparison = 0; comparison < index; comparison += 1) {
        const previous = profiles[comparison]
        if (
          previous
          && current.minimumAgeDays < previous.maximumAgeDaysExclusive
          && previous.minimumAgeDays < current.maximumAgeDaysExclusive
          && weightBandsOverlap(previous, current)
        ) {
        issues.push({
          ruleKey: current.ruleKey,
          field: "minimumAgeDays",
          message: `Age band overlaps ${previous.ruleKey}`,
        })
        }
      }
    }
  }

  return issues.length ? { valid: false, issues } : { valid: true, issues: [] }
}

/**
 * Additional governance checks used only at publication time. Drafts may keep
 * pending ledger entries while evidence and local policy are being completed.
 */
export function validateClinicalRuleCollectionForPublication(
  rules: readonly Pick<ClinicalPresetRule, "ruleKey" | "payload">[],
): ClinicalRuleCollectionValidation {
  const base = validateClinicalRuleCollection(rules)
  const issues: ClinicalRuleCollectionValidationIssue[] = base.valid ? [] : [...base.issues]
  const profiles = new Set(
    rules.flatMap(rule => rule.payload.kind === "PEDIATRIC_DRUG_PROFILE"
      ? [keySegment(rule.payload.medicationKey)]
      : []),
  )
  for (const rule of rules) {
    if (rule.payload.kind !== "PEDIATRIC_DRUG_POLICY") continue
    const payload = rule.payload
    if (payload.reviewStatus !== "APPROVED") {
      issues.push({
        ruleKey: rule.ruleKey,
        field: "reviewStatus",
        message: "Pediatric drug policy must be approved before publication",
      })
    }
    if (payload.disposition === "PENDING_RESEARCH") {
      issues.push({
        ruleKey: rule.ruleKey,
        field: "disposition",
        message: "Pending-research drugs must be resolved before publication",
      })
    }
    if (
      (payload.disposition === "AUTOFILL_PROFILE"
        || payload.disposition === "MANUAL_PROFILE")
      && !profiles.has(keySegment(payload.medicationKey))
    ) {
      issues.push({
        ruleKey: rule.ruleKey,
        field: "disposition",
        message: "Profile disposition requires a pediatric drug profile",
      })
    }
  }

  return issues.length ? { valid: false, issues } : { valid: true, issues: [] }
}

function keySegment(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function pediatricWeightBandKey(payload: PediatricRuleWeightBand): string {
  const minimum = payload.minimumWeightKg == null
    ? "ANY"
    : `${payload.minimumWeightInclusive === false ? "GT" : "GE"}${payload.minimumWeightKg}`
  const maximum = payload.maximumWeightKg == null
    ? "ANY"
    : `${payload.maximumWeightInclusive ? "LE" : "LT"}${payload.maximumWeightKg}`
  return `${minimum}-${maximum}`
}

export function clinicalRuleKey(payload: ClinicalRulePayload): string {
  if (
    payload.kind === "ADULT_DRUG_PROFILE"
    || payload.kind === "ADULT_INFUSION_PROFILE"
    || payload.kind === "ADULT_FLUID_PROFILE"
  ) {
    return `${payload.kind}:${keySegment(payload.itemKey)}`
  }
  if (payload.kind === "PEDIATRIC_DRUG_POLICY") {
    return `${payload.kind}:${keySegment(payload.medicationKey)}`
  }
  if (payload.kind === "PEDIATRIC_DRUG_PROFILE") {
    const base = [
      payload.kind,
      keySegment(payload.medicationKey),
      `${payload.minimumAgeDays}-${payload.maximumAgeDaysExclusive}`,
    ]
    if (payload.minimumWeightKg != null || payload.maximumWeightKg != null) {
      base.push(pediatricWeightBandKey(payload))
    }
    return base.join(":")
  }
  if (payload.kind === "PEDIATRIC_FLUID_PROFILE") {
    return [
      payload.kind,
      keySegment(payload.itemKey),
      `${payload.minimumAgeDays}-${payload.maximumAgeDaysExclusive}`,
    ].join(":")
  }
  if (payload.kind === "PEDIATRIC_INFUSION_PROFILE") {
    return [
      payload.kind,
      keySegment(payload.itemKey),
      `${payload.minimumAgeDays}-${payload.maximumAgeDaysExclusive}`,
      pediatricWeightBandKey(payload),
    ].join(":")
  }
  if (payload.kind === "PEDIATRIC_DRUG_DOSE") {
    return [
      payload.kind,
      keySegment(payload.medicationKey),
      keySegment(payload.indication),
      keySegment(payload.route),
      `${payload.minimumAgeDays}-${payload.maximumAgeDaysExclusive}`,
    ].join(":")
  }
  throw new Error(`Unsupported clinical rule kind: ${payload.kind}`)
}

export const LOSPOR_ADULT_RULESET_KEY = "LOSPOR_ADULTS" as const
export const LOSPOR_ADULT_RULESET_NAME = "LOSPORADULTS Rules" as const

function adultDosePayload(input: {
  kind: AdultDoseProfileRuleKind
  itemKey: string
  label: string
  category?: string | null
  profileKind: "bolus" | "infusion" | "fluid"
  profile: unknown
}): AdultDoseProfileRulePayload {
  const parsed = parseDoseProfile(input.label, input.profileKind, input.profile)
  const metadata = canonicalDoseProfileMetadata(parsed)
  return {
    kind: input.kind,
    itemKey: input.itemKey,
    labelEn: input.label,
    labelBg: input.label,
    category: input.category ?? null,
    profile: metadata.profile,
    unit: metadata.unit,
    routeUnits: metadata.routeUnits,
  }
}

export function createLosporAdultRulePayloads(): ClinicalRulePayload[] {
  const drugs = DRUG_CATALOG.map(entry => adultDosePayload({
    kind: "ADULT_DRUG_PROFILE",
    itemKey: entry.name,
    label: entry.name,
    category: entry.category,
    profileKind: "bolus",
    profile: entry.profile,
  }))
  const infusions = INFUSION_CATALOG.map(entry => adultDosePayload({
    kind: "ADULT_INFUSION_PROFILE",
    itemKey: entry.name,
    label: entry.name,
    profileKind: "infusion",
    profile: entry.profile,
  }))
  const fluids = FLUID_CATALOG.map(entry => adultDosePayload({
    kind: "ADULT_FLUID_PROFILE",
    itemKey: entry.name,
    label: entry.name,
    category: entry.category,
    profileKind: "fluid",
    profile: entry.profile,
  }))
  return [...drugs, ...infusions, ...fluids]
}

export type AdultDoseProfileRule = {
  ruleKey: string
  ruleVersion: string
  itemKey: string
  labelEn: string
  labelBg: string | null
  category: string | null
  kind: AdultDoseProfileRuleKind
  profile: DoseProfile
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  availability: DrugProfileAvailability
  origin: ClinicalRuleOrigin
  presetId: string
}

export function adultDoseProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): AdultDoseProfileRule[] {
  return rules.flatMap(rule => {
    const payload = rule.payload
    if (
      payload.kind !== "ADULT_DRUG_PROFILE"
      && payload.kind !== "ADULT_INFUSION_PROFILE"
      && payload.kind !== "ADULT_FLUID_PROFILE"
    ) return []
    return [{
      ruleKey: rule.ruleKey,
      ruleVersion: rule.ruleVersion,
      itemKey: payload.itemKey,
      labelEn: payload.labelEn,
      labelBg: payload.labelBg ?? null,
      category: payload.category ?? null,
      kind: payload.kind,
      profile: canonicalizeDoseProfile(payload.profile),
      unit: payload.unit,
      routeUnits: { ...payload.routeUnits },
      availability: payload.kind === "ADULT_DRUG_PROFILE"
        ? payload.availability ?? "AUTO"
        : "AUTO",
      origin: rule.origin,
      presetId: rule.presetId,
    }]
  })
}

function effectiveRuleSourceIds(rule: EffectiveClinicalRule): string[] {
  return [...new Set([
    `preset:${rule.presetId}`,
    `rule:${rule.id}`,
    ...rule.sourceRefs,
  ])]
}

export type PediatricDrugProfileRule = {
  ruleKey: string
  ruleVersion: string
  medicationKey: string
  labelEn: string
  labelBg: string | null
  inn: string | null
  category: string | null
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
  minimumWeightKg?: number | null
  minimumWeightInclusive?: boolean
  maximumWeightKg?: number | null
  maximumWeightInclusive?: boolean
  availability?: DrugProfileAvailability
  profile: DoseProfile | null
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  manualUnit?: string | null
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function pediatricDrugProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): PediatricDrugProfileRule[] {
  return rules.flatMap(rule => {
    const payload = rule.payload
    if (payload.kind !== "PEDIATRIC_DRUG_PROFILE") return []
    return [{
      ruleKey: rule.ruleKey,
      ruleVersion: rule.ruleVersion,
      medicationKey: payload.medicationKey,
      labelEn: payload.labelEn,
      labelBg: payload.labelBg ?? null,
      inn: payload.inn ?? null,
      category: payload.category ?? null,
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      minimumWeightKg: payload.minimumWeightKg ?? null,
      minimumWeightInclusive: payload.minimumWeightInclusive ?? true,
      maximumWeightKg: payload.maximumWeightKg ?? null,
      maximumWeightInclusive: payload.maximumWeightInclusive ?? false,
      availability: payload.availability ?? "AUTO",
      profile: payload.profile ? canonicalizeDoseProfile(payload.profile) : null,
      unit: payload.unit,
      routeUnits: { ...payload.routeUnits },
      manualUnit: payload.manualUnit ?? null,
      sourceIds: effectiveRuleSourceIds(rule),
      origin: rule.origin,
      presetId: rule.presetId,
    }]
  })
}

export type PediatricFluidProfileRule = {
  ruleKey: string
  ruleVersion: string
  itemKey: string
  labelEn: string
  labelBg: string | null
  category: string | null
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
  profile: DoseProfile
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function pediatricFluidProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): PediatricFluidProfileRule[] {
  return rules.flatMap(rule => {
    const payload = rule.payload
    if (payload.kind !== "PEDIATRIC_FLUID_PROFILE") return []
    return [{
      ruleKey: rule.ruleKey,
      ruleVersion: rule.ruleVersion,
      itemKey: payload.itemKey,
      labelEn: payload.labelEn,
      labelBg: payload.labelBg ?? null,
      category: payload.category ?? null,
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      profile: canonicalizeDoseProfile(payload.profile),
      unit: payload.unit,
      routeUnits: { ...payload.routeUnits },
      sourceIds: effectiveRuleSourceIds(rule),
      origin: rule.origin,
      presetId: rule.presetId,
    }]
  })
}

export type PediatricInfusionProfileRule = {
  ruleKey: string
  ruleVersion: string
  itemKey: string
  labelEn: string
  labelBg: string | null
  category: string | null
  disposition: PediatricInfusionDisposition
  routeDispositions: Record<string, PediatricInfusionDisposition>
  manualEntryOnly: boolean
  routeManualEntryOnly: Record<string, boolean>
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
  minimumWeightKg: number | null
  minimumWeightInclusive: boolean
  maximumWeightKg: number | null
  maximumWeightInclusive: boolean
  routineSuggestion: boolean
  advisory: string | null
  profile: DoseProfile | null
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  manualUnit: string | null
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function pediatricInfusionProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): PediatricInfusionProfileRule[] {
  return rules.flatMap(rule => {
    const payload = rule.payload
    if (payload.kind !== "PEDIATRIC_INFUSION_PROFILE") return []
    return [{
      ruleKey: rule.ruleKey,
      ruleVersion: rule.ruleVersion,
      itemKey: payload.itemKey,
      labelEn: payload.labelEn,
      labelBg: payload.labelBg ?? null,
      category: payload.category ?? null,
      disposition: payload.disposition,
      routeDispositions: { ...payload.routeDispositions },
      manualEntryOnly: payload.manualEntryOnly,
      routeManualEntryOnly: { ...payload.routeManualEntryOnly },
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      minimumWeightKg: payload.minimumWeightKg ?? null,
      minimumWeightInclusive: payload.minimumWeightInclusive ?? true,
      maximumWeightKg: payload.maximumWeightKg ?? null,
      maximumWeightInclusive: payload.maximumWeightInclusive ?? false,
      routineSuggestion: payload.routineSuggestion ?? true,
      advisory: payload.advisory ?? null,
      profile: payload.profile ? canonicalizeDoseProfile(payload.profile) : null,
      unit: payload.unit,
      routeUnits: { ...payload.routeUnits },
      manualUnit: payload.manualUnit ?? null,
      sourceIds: effectiveRuleSourceIds(rule),
      origin: rule.origin,
      presetId: rule.presetId,
    }]
  })
}

function pediatricWeightMatches(
  profile: PediatricRuleWeightBand,
  weightKg: number | null | undefined,
): boolean {
  if (profile.minimumWeightKg == null && profile.maximumWeightKg == null) return true
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return false
  const aboveMinimum = profile.minimumWeightKg == null
    || weightKg > profile.minimumWeightKg
    || ((profile.minimumWeightInclusive ?? true) && weightKg === profile.minimumWeightKg)
  const belowMaximum = profile.maximumWeightKg == null
    || weightKg < profile.maximumWeightKg
    || ((profile.maximumWeightInclusive ?? false) && weightKg === profile.maximumWeightKg)
  return aboveMinimum && belowMaximum
}

export function applicablePediatricInfusionProfiles(input: {
  itemKey: string
  age: PediatricAgeInput | null
  weightKg?: number | null
  profiles: readonly PediatricInfusionProfileRule[]
}): PediatricInfusionProfileRule[] {
  if (!input.age) return []
  const age = normalizePediatricAge(input.age)
  if (!age) return []
  const key = input.itemKey.trim().toUpperCase()
  return input.profiles
    .filter(profile =>
      (profile.itemKey.trim().toUpperCase() === key
        || profile.labelEn.trim().toUpperCase() === key)
      && age.approximateDays >= profile.minimumAgeDays
      && age.approximateDays < profile.maximumAgeDaysExclusive
      && pediatricWeightMatches(profile, input.weightKg)
    )
    .sort((left, right) =>
      left.minimumAgeDays - right.minimumAgeDays
      || (left.minimumWeightKg ?? -Infinity) - (right.minimumWeightKg ?? -Infinity),
    )
}

export type PediatricInfusionSelectionResolution = DrugSelectionSurface & {
  disposition: PediatricInfusionDisposition
  suggestedRate?: number
  manualEntryOnly: boolean
  routineSuggestion: boolean
  advisory: string | null
  ruleKey: string
  ruleVersion: string
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function resolvePediatricInfusionProfileSurface(input: {
  rule: PediatricInfusionProfileRule
  route?: string | null
}): PediatricInfusionSelectionResolution {
  const profile = input.rule.profile
  const requestedRoute = input.route ? normalizeAdministrationRoute(input.route) : null
  const route = requestedRoute && profile?.routes.includes(requestedRoute)
    ? requestedRoute
    : profile?.defaultRoute ?? profile?.routes[0] ?? requestedRoute ?? "IV"
  const disposition = input.rule.routeDispositions[route] ?? input.rule.disposition
  const manualEntryOnly = input.rule.routeManualEntryOnly[route]
    ?? input.rule.manualEntryOnly
  const surface = profile
    ? resolveDrugSelectionSurface({ profile, route })
    : {
        route,
        routes: Object.keys(input.rule.routeDispositions).length
          ? Object.keys(input.rule.routeDispositions)
          : [route],
        mode: "rate" as const,
        min: 0,
        max: 100_000,
        step: 0.1,
        quickValues: [],
        unit: input.rule.manualUnit ?? "",
        dose: "",
        concentrationOptions: [],
        concentration: "",
        formulationOptions: [],
      }
  const routeProfile = profile?.routeModes?.[surface.route]
  const suggestedRate = disposition === "AUTO"
    ? routeProfile?.suggestedRate ?? profile?.suggestedRate
    : undefined
  return {
    ...surface,
    disposition,
    ...(suggestedRate == null ? {} : { suggestedRate }),
    manualEntryOnly,
    routineSuggestion: input.rule.routineSuggestion,
    advisory: input.rule.advisory,
    ruleKey: input.rule.ruleKey,
    ruleVersion: input.rule.ruleVersion,
    sourceIds: [...input.rule.sourceIds],
    origin: input.rule.origin,
    presetId: input.rule.presetId,
  }
}

export function applicablePediatricFluidProfiles(input: {
  itemKey: string
  age: PediatricAgeInput | null
  profiles: readonly PediatricFluidProfileRule[]
}): PediatricFluidProfileRule[] {
  if (!input.age) return []
  const age = normalizePediatricAge(input.age)
  if (!age) return []
  const key = input.itemKey.trim().toUpperCase()
  return input.profiles
    .filter(profile =>
      (profile.itemKey.trim().toUpperCase() === key
        || profile.labelEn.trim().toUpperCase() === key)
      && age.approximateDays >= profile.minimumAgeDays
      && age.approximateDays < profile.maximumAgeDaysExclusive
    )
    .sort((left, right) => left.minimumAgeDays - right.minimumAgeDays)
}

export function applicablePediatricDrugProfiles(input: {
  medicationKey: string
  age: PediatricAgeInput | null
  weightKg?: number | null
  profiles: readonly PediatricDrugProfileRule[]
}): PediatricDrugProfileRule[] {
  if (!input.age) return []
  const age = normalizePediatricAge(input.age)
  if (!age) return []
  const key = input.medicationKey.trim().toUpperCase()
  return input.profiles
    .filter(profile =>
      (profile.medicationKey.trim().toUpperCase() === key
        || profile.labelEn.trim().toUpperCase() === key)
      && age.approximateDays >= profile.minimumAgeDays
      && age.approximateDays < profile.maximumAgeDaysExclusive
      && pediatricWeightMatches(profile, input.weightKg)
    )
    .sort((left, right) =>
      left.minimumAgeDays - right.minimumAgeDays
      || (left.minimumWeightKg ?? -Infinity) - (right.minimumWeightKg ?? -Infinity),
    )
}

export type PediatricDrugSelectionResolution = DrugSelectionSurface & {
  availability: DrugProfileAvailability
  manualEntryOnly: boolean
  ruleKey: string
  ruleVersion: string
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function resolvePediatricDrugProfileSurface(input: {
  rule: PediatricDrugProfileRule
  age: PediatricAgeInput
  route?: string | null
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
  idealBodyWeightKg?: number | null
  preterm?: boolean | null
}): PediatricDrugSelectionResolution | null {
  const availability = input.rule.availability ?? "AUTO"
  const age = normalizePediatricAge(input.age)
  if (
    !age
    || age.approximateDays < input.rule.minimumAgeDays
    || age.approximateDays >= input.rule.maximumAgeDaysExclusive
    || !pediatricWeightMatches(input.rule, input.weightKg)
    || availability === "HIDDEN"
  ) return null
  if (availability === "LOCAL" || !input.rule.profile) {
    const requestedRoute = input.route ? normalizeAdministrationRoute(input.route) : null
    const route = requestedRoute ?? "IV"
    return {
      route,
      routes: [route],
      mode: "dose",
      min: 0,
      max: 100_000,
      step: 0.1,
      quickValues: [],
      unit: input.rule.manualUnit ?? "",
      dose: "",
      concentrationOptions: [],
      concentration: "",
      formulationOptions: [],
      calculationUnavailableReason: "NO_AUTOFILL",
      availability,
      manualEntryOnly: true,
      ruleKey: input.rule.ruleKey,
      ruleVersion: input.rule.ruleVersion,
      sourceIds: [...input.rule.sourceIds],
      origin: input.rule.origin,
      presetId: input.rule.presetId,
    }
  }
  const bsa = input.heightCm != null && input.weightKg != null
    ? calculateMostellerBsa({ heightCm: input.heightCm, weightKg: input.weightKg })
    : null
  const resolvedIbw = input.idealBodyWeightKg == null
    ? resolveIdealBodyWeight({
        clinicalMode: "PEDIATRIC",
        heightCm: input.heightCm,
        sex: input.sex,
        age: input.age,
        preterm: input.preterm,
      })
    : null
  const idealBodyWeightKg = input.idealBodyWeightKg
    ?? (resolvedIbw?.available ? resolvedIbw.kilograms : null)
  const surface = resolveDrugSelectionSurface({
    profile: input.rule.profile,
    route: input.route,
    patient: {
      totalBodyWeightKg: input.weightKg,
      bodySurfaceAreaM2: bsa?.available ? bsa.value.squareMetres : null,
      idealBodyWeightKg,
      idealBodyWeightMethod: idealBodyWeightKg == null
        ? null
        : resolvedIbw?.available
          ? resolvedIbw.method
          : "MCLAREN_CDC_2000",
    },
  })
  return {
    ...surface,
    ...(availability === "MANUAL"
      ? {
          dose: "",
          calculation: undefined,
          calculationUnavailableReason: "NO_AUTOFILL" as const,
        }
      : {}),
    availability,
    manualEntryOnly: false,
    ruleKey: input.rule.ruleKey,
    ruleVersion: input.rule.ruleVersion,
    sourceIds: [...input.rule.sourceIds],
    origin: input.rule.origin,
    presetId: input.rule.presetId,
  }
}

export function applyAdultDoseProfilesToOptions<
  T extends { label: string; value?: string; metadata?: unknown },
>(
  options: readonly T[],
  rules: readonly AdultDoseProfileRule[],
  kind: AdultDoseProfileRuleKind,
): T[] {
  const hidden = new Set(
    rules
      .filter(rule => rule.kind === kind && rule.availability === "HIDDEN")
      .flatMap(rule => [rule.itemKey, rule.labelEn])
      .map(value => value.trim().toUpperCase()),
  )
  const profiles = new Map(
    rules
      .filter(rule => rule.kind === kind && rule.availability !== "HIDDEN")
      .flatMap(rule => {
        const keys = [rule.itemKey, rule.labelEn]
          .map(value => value.trim().toUpperCase())
          .filter(Boolean)
        return keys.map(key => [key, rule] as const)
      }),
  )
  return options.map(option => {
    const rule = profiles.get(option.label.trim().toUpperCase())
      ?? (option.value ? profiles.get(option.value.trim().toUpperCase()) : undefined)
    if (!rule) return option
    const profile = rule.profile
    const metadata = option.metadata && typeof option.metadata === "object" && !Array.isArray(option.metadata)
      ? option.metadata as Record<string, unknown>
      : {}
    return {
      ...option,
      metadata: {
        ...metadata,
        ...profile,
        clinicalRuleAvailability: rule.availability,
        manualEntryOnly: rule.availability === "LOCAL",
        ...(rule.availability === "MANUAL" || rule.availability === "LOCAL"
          ? { doseCalc: undefined, doseCalcByRoute: {} }
          : {}),
      },
    }
  }).filter(option => {
    const keys = [option.label, option.value]
      .filter((value): value is string => !!value)
      .map(value => value.trim().toUpperCase())
    return !keys.some(key => hidden.has(key))
  })
}

type OptionLike = { label: string; value?: string; metadata?: unknown }

function optionMetadata(option: OptionLike): Record<string, unknown> {
  return option.metadata && typeof option.metadata === "object" && !Array.isArray(option.metadata)
    ? option.metadata as Record<string, unknown>
    : {}
}

function optionKeys(option: OptionLike): string[] {
  return [option.label, option.value]
    .filter((value): value is string => !!value)
    .map(value => value.trim().toUpperCase())
}

/**
 * Pediatric counterpart to `applyAdultDoseProfilesToOptions`.
 *
 * Without this, pediatric availability only took effect once a drug sheet was
 * already open, so a band marked HIDDEN still appeared in the picker and a
 * MANUAL band still advertised autofill in the list. Selecting the band needs
 * the patient, so age (and weight) are required here.
 */
export function applyPediatricDrugProfilesToOptions<T extends OptionLike>(
  options: readonly T[],
  profiles: readonly PediatricDrugProfileRule[],
  age: PediatricAgeInput | null,
  weightKg?: number | null,
): T[] {
  if (!age || !profiles.length) return [...options]
  const result: T[] = []
  for (const option of options) {
    const [rule] = optionKeys(option).flatMap(key => applicablePediatricDrugProfiles({
      medicationKey: key,
      age,
      weightKg,
      profiles,
    }))
    if (!rule) {
      result.push(option)
      continue
    }
    const availability = rule.availability ?? "AUTO"
    const manualOnly = availability === "MANUAL" || availability === "LOCAL"
    result.push({
      ...option,
      metadata: {
        ...optionMetadata(option),
        ...(rule.profile ?? {}),
        clinicalRuleAvailability: availability,
        // Marked, never dropped: the option must stay in the lookup maps so an
        // already-recorded drug keeps its units, codes and colour. Pickers call
        // `visibleClinicalOptions`; search deliberately still finds it.
        clinicalRuleHidden: availability === "HIDDEN",
        manualEntryOnly: availability === "LOCAL",
        ...(manualOnly ? { doseCalc: undefined, doseCalcByRoute: {} } : {}),
      },
    })
  }
  return result
}

/**
 * Same idea for continuous infusions, which express availability as a
 * `disposition` rather than an `availability`.
 */
export function applyPediatricInfusionProfilesToOptions<T extends OptionLike>(
  options: readonly T[],
  profiles: readonly PediatricInfusionProfileRule[],
  age: PediatricAgeInput | null,
  weightKg?: number | null,
): T[] {
  if (!age || !profiles.length) return [...options]
  const result: T[] = []
  for (const option of options) {
    const [rule] = optionKeys(option).flatMap(key => applicablePediatricInfusionProfiles({
      itemKey: key,
      age,
      weightKg,
      profiles,
    }))
    if (!rule) {
      result.push(option)
      continue
    }
    const disposition = rule.disposition ?? "AUTO"
    const manualOnly = disposition === "MANUAL" || disposition === "LOCAL" || rule.manualEntryOnly
    result.push({
      ...option,
      metadata: {
        ...optionMetadata(option),
        ...(rule.profile ?? {}),
        clinicalRuleAvailability: disposition,
        clinicalRuleHidden: disposition === "HIDDEN",
        manualEntryOnly: disposition === "LOCAL" || !!rule.manualEntryOnly,
        ...(manualOnly ? { doseCalc: undefined, doseCalcByRoute: {} } : {}),
      },
    })
  }
  return result
}

/** True when a ruleset hides this option from the default picker. */
export function isClinicalRuleHidden(option: OptionLike): boolean {
  return optionMetadata(option).clinicalRuleHidden === true
}

/**
 * The options a picker should offer by default.
 *
 * Hidden items are deliberately kept in the full option list — they must stay
 * resolvable for drugs already recorded on a case, and must remain findable by
 * search so a clinician is never blocked from documenting what they gave.
 * Only the default picker view is trimmed.
 */
export function visibleClinicalOptions<T extends OptionLike>(options: readonly T[]): T[] {
  return options.filter(option => !isClinicalRuleHidden(option))
}

export function resolveEffectiveClinicalRules(
  presetId: string,
  presetRules: readonly ClinicalPresetRule[],
  overrides: readonly InstitutionClinicalRuleOverrideDto[],
): EffectiveClinicalRule[] {
  const effective = new Map<string, EffectiveClinicalRule>()
  for (const rule of presetRules) {
    effective.set(rule.ruleKey, {
      ...rule,
      sourceRefs: [...rule.sourceRefs],
      origin: "PRESET",
      presetId,
      overrideId: null,
    })
  }
  const approved = overrides
    .filter(item => item.presetId === presetId && item.status === "APPROVED")
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
  for (const item of approved) {
    effective.set(item.ruleKey, {
      id: item.id,
      ruleKey: item.ruleKey,
      ruleVersion: item.overrideVersion,
      payload: item.payload,
      sourceRefs: [...item.sourceRefs],
      origin: "INSTITUTION_OVERRIDE",
      presetId,
      overrideId: item.id,
    })
  }
  return [...effective.values()].sort((left, right) => left.ruleKey.localeCompare(right.ruleKey))
}

export function clinicalPresetRulesToEffective(
  presetId: string,
  scope: ClinicalPresetScope,
  rules: readonly ClinicalPresetRule[],
): EffectiveClinicalRule[] {
  const origin: ClinicalRuleOrigin = scope === "PLATFORM"
    ? "PLATFORM"
    : scope === "INSTITUTION"
      ? "INSTITUTION"
      : "USER"
  return rules
    .map(rule => ({
      ...rule,
      sourceRefs: [...rule.sourceRefs],
      origin,
      presetId,
      overrideId: null,
    }))
    .sort((left, right) => left.ruleKey.localeCompare(right.ruleKey))
}

export function pediatricDoseProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): PediatricDoseProfile[] {
  return rules.flatMap(rule => {
    if (rule.payload.kind !== "PEDIATRIC_DRUG_DOSE") return []
    const payload = rule.payload
    return [{
      key: rule.ruleKey,
      medicationKey: payload.medicationKey,
      inn: payload.inn ?? undefined,
      indication: payload.indication,
      route: payload.route,
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      basis: payload.basis,
      amountPerUnit: payload.amountPerUnit ?? undefined,
      flatAmount: payload.flatAmount ?? undefined,
      minimumAmount: payload.minimumAmount,
      maximumAmount: payload.maximumAmount,
      roundTo: payload.roundTo,
      doseUnit: payload.doseUnit,
      sourceIds: effectiveRuleSourceIds(rule),
      version: rule.ruleVersion,
      reviewStatus: "APPROVED" as const,
    }]
  })
}

export function applicablePediatricDoseProfiles(input: {
  medicationKey: string
  age: PediatricAgeInput | null
  profiles: readonly PediatricDoseProfile[]
}): PediatricDoseProfile[] {
  if (!input.age) return []
  const age = normalizePediatricAge(input.age)
  if (!age) return []
  return input.profiles
    .filter(profile =>
      profile.reviewStatus === "APPROVED"
      && profile.medicationKey === input.medicationKey
      && age.approximateDays >= profile.minimumAgeDays
      && age.approximateDays < profile.maximumAgeDaysExclusive
    )
    .sort((left, right) =>
      left.indication.localeCompare(right.indication)
      || left.route.localeCompare(right.route),
    )
}

export function resolvePediatricProfileDose(input: {
  profile: PediatricDoseProfile
  age: PediatricAgeInput
  weightKg?: number | null
  heightCm?: number | null
}): PediatricDoseResolution {
  const bsa = input.heightCm != null && input.weightKg != null
    ? calculateMostellerBsa({ heightCm: input.heightCm, weightKg: input.weightKg })
    : null
  return resolvePediatricDoseSuggestion({
    medicationKey: input.profile.medicationKey,
    indication: input.profile.indication,
    route: input.profile.route,
    age: input.age,
    totalBodyWeightKg: input.weightKg,
    bodySurfaceAreaM2: bsa?.available ? bsa.value.squareMetres : null,
  }, [input.profile])
}
export type ClinicalRulesRuntimeBundle = {
  mode?: ClinicalRuleMode
  preset: {
    id: string
    name: string
    version?: number
    scope?: ClinicalPresetScope
  } | null
  productionReady: boolean
  effectiveRules: EffectiveClinicalRule[]
  doseProfiles: PediatricDoseProfile[]
  pediatricDrugProfiles?: PediatricDrugProfileRule[]
  pediatricInfusionProfiles?: PediatricInfusionProfileRule[]
  pediatricFluidProfiles?: PediatricFluidProfileRule[]
  adultDoseProfiles?: AdultDoseProfileRule[]
}

export type ClinicalRulesRuntimeSnapshot = ClinicalRulesRuntimeBundle & {
  source: "server" | "cache"
  cachedAt: string
}

export type ClinicalRulesSnapshotStorage = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  delete: (key: string) => Promise<void>
}

type StoredClinicalRulesSnapshot = {
  cachedAt: string
  response: ClinicalRulesRuntimeBundle
}

function validRuntimeBundle(value: unknown): value is ClinicalRulesRuntimeBundle {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<ClinicalRulesRuntimeBundle>
  return (item.preset === null || (
    !!item.preset
    && typeof item.preset.id === "string"
    && typeof item.preset.name === "string"
  ))
    && typeof item.productionReady === "boolean"
    && Array.isArray(item.effectiveRules)
    && Array.isArray(item.doseProfiles)
    && (item.pediatricInfusionProfiles === undefined || Array.isArray(item.pediatricInfusionProfiles))
    && (item.pediatricFluidProfiles === undefined || Array.isArray(item.pediatricFluidProfiles))
}

function parseStoredRuntimeBundle(raw: string | null): StoredClinicalRulesSnapshot | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredClinicalRulesSnapshot>
    return typeof value.cachedAt === "string" && validRuntimeBundle(value.response)
      ? value as StoredClinicalRulesSnapshot
      : null
  } catch {
    return null
  }
}

export function createClinicalRulesSnapshotRepository(input: {
  cacheKey: string
  fetchRules: () => Promise<ClinicalRulesRuntimeBundle>
  storage: ClinicalRulesSnapshotStorage
  now?: () => Date
}) {
  let inFlight: Promise<ClinicalRulesRuntimeSnapshot> | null = null

  async function loadFresh(): Promise<ClinicalRulesRuntimeSnapshot> {
    try {
      const response = await input.fetchRules()
      if (!validRuntimeBundle(response)) {
        throw new Error("Invalid clinical-rules response")
      }
      const cachedAt = (input.now?.() ?? new Date()).toISOString()
      await input.storage.set(
        input.cacheKey,
        JSON.stringify({ cachedAt, response } satisfies StoredClinicalRulesSnapshot),
      )
      return { ...response, source: "server", cachedAt }
    } catch (error) {
      const stored = parseStoredRuntimeBundle(await input.storage.get(input.cacheKey))
      if (stored) {
        return { ...stored.response, source: "cache", cachedAt: stored.cachedAt }
      }
      throw error
    }
  }

  return {
    load(options: { force?: boolean } = {}) {
      if (options.force || !inFlight) {
        inFlight = loadFresh().finally(() => {
          inFlight = null
        })
      }
      return inFlight
    },
    clear() {
      return input.storage.delete(input.cacheKey)
    },
  }
}
