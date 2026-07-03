export type LibraryOption = {
  id: string
  value: string
  label: string
  labelBg: string | null
  group: string | null
  parentId: string | null
  color: string | null
  description: string | null
  drugId: string | null
  atcCode: string | null
  inn: string | null
  metadata: Record<string, any> | null
}

export type RangeSpec = {
  min: number
  max: number
  step: number
  precision?: number
  unit: string
}

export function metadataArray(option: LibraryOption, key: string): string[] {
  const value = option.metadata?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export function metadataRecord<T>(option: LibraryOption, key: string): Record<string, T> {
  const value = option.metadata?.[key]
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, T> : {}
}

export function optionByLabel(options: LibraryOption[]): Record<string, LibraryOption> {
  return Object.fromEntries(options.map(option => [option.label, option]))
}

type Meta = Record<string, any> | null | undefined
const meta = (option: LibraryOption): Meta => option.metadata as Meta

export type RouteProfile = {
  mode?: string
  min: number
  max: number
  step: number
  quickValues: number[]
  unit: string
  concentrationOptions?: string[]
  suggestedRate?: number
  suggestedConcentration?: string
}

export type DoseCalcRule = {
  perKg?: number
  flat?: number
  basis?: string
  roundTo?: number
  cap?: number
}

export type DoseCalcEntry = DoseCalcRule & {
  hint: string
  byRoute?: Record<string, DoseCalcRule>
}

export type NumberRange = { min: number; max: number; step: number }

export function quickNumberMap(options: LibraryOption[]): Record<string, number[]> {
  const map: Record<string, number[]> = {}
  for (const option of options) {
    const quickValues = meta(option)?.quickValues
    if (Array.isArray(quickValues) && quickValues.length) map[option.label] = quickValues
  }
  return map
}

export function quickStringMap(options: LibraryOption[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const option of options) {
    const quickValues = meta(option)?.quickValues
    if (Array.isArray(quickValues) && quickValues.length) map[option.label] = quickValues.map(String)
  }
  return map
}

export function routesMap(options: LibraryOption[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const option of options) map[option.label] = meta(option)?.routes ?? ["IV"]
  return map
}

export function concentrationsMap(options: LibraryOption[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const option of options) {
    const concentrations = meta(option)?.concentrationOptions
    if (Array.isArray(concentrations) && concentrations.length) map[option.label] = concentrations
  }
  return map
}

export function defaultConcentrationMap(options: LibraryOption[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const option of options) {
    const concentration = meta(option)?.defaultConcentration
    if (concentration) map[option.label] = concentration
  }
  return map
}

export function suggestedRateMap(options: LibraryOption[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const option of options) {
    const rate = meta(option)?.suggestedRate
    if (rate != null) map[option.label] = String(rate)
  }
  return map
}

export function strictRangeMap(options: LibraryOption[]): Record<string, NumberRange> {
  const map: Record<string, NumberRange> = {}
  for (const option of options) {
    const metadata = meta(option)
    if (metadata?.min != null && metadata?.max != null && metadata?.step != null) {
      map[option.label] = { min: metadata.min, max: metadata.max, step: metadata.step }
    }
  }
  return map
}

export function defaultedRangeMap(options: LibraryOption[]): Record<string, NumberRange> {
  const map: Record<string, NumberRange> = {}
  for (const option of options) {
    const metadata = meta(option)
    map[option.label] = { min: metadata?.min ?? 0, max: metadata?.max ?? 100, step: metadata?.step ?? 1 }
  }
  return map
}

function profileFrom(profile: any): RouteProfile | null {
  if (profile?.min == null || profile?.max == null || !profile?.unit) return null
  return {
    mode: profile.mode,
    min: profile.min,
    max: profile.max,
    step: profile.step ?? profile.variableStep?.[0]?.step ?? 1,
    quickValues: profile.quickValues ?? [],
    unit: profile.unit,
    concentrationOptions: profile.concentrationOptions,
    suggestedRate: profile.suggestedRate,
    suggestedConcentration: profile.suggestedConcentration,
  }
}

export function routeProfilesMap(options: LibraryOption[]): Record<string, Record<string, RouteProfile>> {
  const map: Record<string, Record<string, RouteProfile>> = {}
  for (const option of options) {
    const routeModes = meta(option)?.routeModes
    if (!routeModes || typeof routeModes !== "object") continue
    map[option.label] = {}
    for (const [route, profile] of Object.entries(routeModes as Record<string, any>)) {
      const routeProfile = profileFrom(profile)
      if (routeProfile) map[option.label][route] = routeProfile
    }
  }
  return map
}

export function baseProfilesMap(options: LibraryOption[]): Record<string, RouteProfile> {
  const map: Record<string, RouteProfile> = {}
  for (const option of options) {
    const profile = profileFrom(meta(option))
    if (profile) map[option.label] = profile
  }
  return map
}

export function doseCalcMap(options: LibraryOption[]): Record<string, DoseCalcEntry> {
  const map: Record<string, DoseCalcEntry> = {}
  for (const option of options) {
    const metadata = meta(option)
    const doseCalc: DoseCalcRule | undefined = metadata?.doseCalc
    const byRoute: Record<string, DoseCalcRule> = {}
    if (metadata?.doseCalcByRoute) {
      for (const [route, value] of Object.entries(metadata.doseCalcByRoute as Record<string, DoseCalcRule>)) {
        if (value) byRoute[route] = value
      }
    }
    if (metadata?.routeModes) {
      for (const [route, profile] of Object.entries(metadata.routeModes as Record<string, { doseCalc?: DoseCalcRule }>)) {
        if (profile?.doseCalc) byRoute[route] = profile.doseCalc
      }
    }
    const hasByRoute = Object.keys(byRoute).length > 0
    if (doseCalc || metadata?.hint || hasByRoute) {
      map[option.label] = { hint: metadata?.hint ?? "", ...doseCalc, ...(hasByRoute ? { byRoute } : {}) }
    }
  }
  return map
}

export function codesMap(options: LibraryOption[]): Record<string, { drugId?: string; atcCode?: string; inn?: string }> {
  const map: Record<string, { drugId?: string; atcCode?: string; inn?: string }> = {}
  for (const option of options) {
    map[option.label] = {
      drugId: option.drugId ?? undefined,
      atcCode: option.atcCode ?? undefined,
      inn: option.inn ?? undefined,
    }
  }
  return map
}

export type DrugCategory = {
  cat: string
  color: string
  drugs: { name: string; unit: string }[]
}

export function groupDrugCategories(
  options: LibraryOption[],
  colorFor: (category: string) => string,
): DrugCategory[] {
  const byGroup = new Map<string, DrugCategory>()
  for (const option of options) {
    const category = option.group ?? "Other"
    if (!byGroup.has(category)) byGroup.set(category, { cat: category, color: colorFor(category), drugs: [] })
    byGroup.get(category)!.drugs.push({
      name: option.label,
      unit: meta(option)?.unit ?? meta(option)?.defaultUnit ?? "mg",
    })
  }
  return [...byGroup.values()]
}

export type ClinicalEventCategory = {
  cat: string
  color: string
  isComplication?: boolean
  events: { label: string; color: string }[]
}

export function groupClinicalEvents(options: LibraryOption[]): ClinicalEventCategory[] {
  const byGroup = new Map<string, ClinicalEventCategory>()
  for (const option of options) {
    const category = option.group ?? "Other"
    if (!byGroup.has(category)) {
      byGroup.set(category, {
        cat: category,
        color: meta(option)?.categoryColor ?? "#64748b",
        isComplication: !!meta(option)?.isComplication,
        events: [],
      })
    }
    byGroup.get(category)!.events.push({ label: option.label, color: option.color ?? "#64748b" })
  }
  return [...byGroup.values()]
}

export function canStartDrugAsInfusion(
  drug: { name?: string } | null | undefined,
  infusionDrugs: { name: string }[],
): boolean {
  return !!drug?.name && infusionDrugs.some(entry => entry.name === drug.name)
}

export type PositionOption = { code: string; label: string; desc: string; color: string }
export type MonitoringOption = { label: string; field: string; section: string }
export type AirwayOption = { code: string; label: string }
export type PremedicationDrug = {
  name: string
  dose: number
  unit: string
  min: number
  max: number
  step: number
  routes: string[]
  defaultRoute: string
  hint: string
}
export type PremedicationCategory = { category: string; drugs: PremedicationDrug[] }

export function mapPositionOptions(
  options: LibraryOption[],
  colorByCode: Record<string, string> = {},
): PositionOption[] {
  return options.map(option => ({
    code: option.value,
    label: option.label,
    desc: option.description ?? "",
    color: colorByCode[option.value] ?? "#64748b",
  }))
}

export function mapMonitoringOptions(options: LibraryOption[]): MonitoringOption[] {
  return options.map(option => ({
    label: option.label,
    field: option.value,
    section: option.group ?? "other",
  }))
}

export function mapAirwayOptions(options: LibraryOption[], group: "Instrument" | "Device"): AirwayOption[] {
  return options
    .filter(option => option.group === group)
    .map(option => ({ code: option.value, label: option.label }))
}

export function mapPremedicationCategories(options: LibraryOption[]): PremedicationCategory[] {
  const byGroup = new Map<string, PremedicationCategory>()
  for (const option of options) {
    const category = option.group ?? "Other"
    if (!byGroup.has(category)) byGroup.set(category, { category, drugs: [] })
    const metadata = option.metadata ?? {}
    byGroup.get(category)!.drugs.push({
      name: option.label,
      dose: metadata.dose ?? 1,
      unit: metadata.unit ?? "mg",
      min: metadata.min ?? 0,
      max: metadata.max ?? 100,
      step: metadata.step ?? 1,
      routes: metadata.routes ?? ["PO"],
      defaultRoute: metadata.defaultRoute ?? "PO",
      hint: metadata.hint ?? "",
    })
  }
  return [...byGroup.values()]
}
