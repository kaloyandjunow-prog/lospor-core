import type { LogEvent } from "./intraop-types"

export type AutoFillVitalKey = "etco2" | "temp" | "spO2" | "systolic" | "diastolic" | "heartRate"

export function latestVitalEvent(log: LogEvent[]): LogEvent | undefined {
  return log.find(event => event.type === "vital")
}

export function previousVitalAfterIndex(log: LogEvent[], index: number): LogEvent | undefined {
  for (let i = index + 1; i < log.length; i += 1) {
    if (log[i].type === "vital") return log[i]
  }
}

export function autoFillVitalKeys(includeBloodPressure: boolean): AutoFillVitalKey[] {
  return includeBloodPressure
    ? ["etco2", "temp", "spO2", "systolic", "diastolic", "heartRate"]
    : ["etco2", "temp", "spO2"]
}

export function timetableColumnForTimestamp(chartStart: Date, timestampMs: number): number {
  return Math.max(0, Math.floor((timestampMs - chartStart.getTime()) / (5 * 60_000)))
}

export function latestVitalColumn(log: LogEvent[], chartStart: Date): number | null {
  const vitalColumns = log
    .filter(event => event.type === "vital")
    .map(event => timetableColumnForTimestamp(chartStart, new Date(event.ts).getTime()))
  return vitalColumns.length > 0 ? Math.max(...vitalColumns) : null
}

export function buildAutoFilledVitalEvent(
  source: LogEvent,
  includeBloodPressure: boolean,
): Omit<LogEvent, "id" | "ts"> | null {
  const copied: Omit<LogEvent, "id" | "ts"> = { type: "vital" }
  const keys = autoFillVitalKeys(includeBloodPressure)
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number") copied[key] = value
  }
  return keys.some(key => typeof copied[key] === "number") ? copied : null
}

export function vitalFieldVisibility(
  isGeneralAnesthesiaCase: boolean,
  monitoringLabels: string[],
): { showEtco2: boolean; showTemperature: boolean; showGlucose: boolean } {
  return {
    showEtco2: isGeneralAnesthesiaCase || monitoringLabels.some(label => label.includes("EtCO")),
    showTemperature: isGeneralAnesthesiaCase || monitoringLabels.some(label => label.includes("Temperature")),
    showGlucose: monitoringLabels.some(label => label.includes("glucose")),
  }
}

