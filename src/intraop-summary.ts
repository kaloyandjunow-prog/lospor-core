import type {
  LogEvent,
  NumericText,
  TimetableData,
  TimetableInfusion,
  VitalsEntry,
} from "./intraop-types"

export type DrugTotal = {
  name: string
  unit: string
  total: number
}

export type DrugLogEntry = {
  column: number
  time: string
  name: string
  dose: string
  unit: string
}

export type RunningItem =
  | { kind: "agent"; id: string; name: string; color: string }
  | { kind: "gas"; id: string; fgf: number; fio2: number; color: string }
  | { kind: "infusion"; id: string; name: string; rate: NumericText; unit: string; color: string }
  | { kind: "fluid"; id: string; name: string; volume: string; color: string }

export type RowSummary = {
  criticalParts: string[]
  normalParts: string[]
  eventParts: string[]
  hasCritical: boolean
  hasUnsynced: boolean
}

function numeric(value: NumericText | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function calculateDrugTotals(
  timetable: Pick<TimetableData, "drugs"> | null | undefined,
): DrugTotal[] {
  const totals = new Map<string, DrugTotal>()
  for (const drug of timetable?.drugs ?? []) {
    const key = `${drug.name}\u0000${drug.unit}`
    const existing = totals.get(key) ?? { name: drug.name, unit: drug.unit, total: 0 }
    existing.total += numeric(drug.dose)
    totals.set(key, existing)
  }
  return [...totals.values()].map(total => ({
    ...total,
    total: Math.round(total.total * 1000) / 1000,
  }))
}

export function rateAtColumn(
  infusion: TimetableInfusion,
  column: number,
): { rate: NumericText; unit: string } {
  const latest = (infusion.rateChanges ?? [])
    .filter(change => change.col <= column)
    .sort((a, b) => b.col - a.col)[0]
  return {
    rate: latest?.rate ?? infusion.rate,
    unit: latest?.unit ?? infusion.unit,
  }
}

export function runningItemsAt(
  timetable: TimetableData,
  column: number,
): RunningItem[] {
  const items: RunningItem[] = []
  for (const agent of timetable.agents) {
    if (column >= agent.startCol && column <= agent.endCol) {
      items.push({
        kind: "agent",
        id: `agent-${agent.name}`,
        name: agent.name,
        color: agent.color ?? "#a78bfa",
      })
    }
  }
  for (const gas of timetable.gasSettings ?? []) {
    if (column < gas.startCol || column > gas.endCol) continue
    const latest = (gas.settingsChanges ?? [])
      .filter(change => change.col <= column)
      .sort((a, b) => b.col - a.col)[0]
    items.push({
      kind: "gas",
      id: gas.id || "gas-settings",
      fgf: latest?.fgf ?? gas.fgf,
      fio2: latest?.fio2 ?? gas.fio2,
      color: "#818cf8",
    })
  }
  for (const infusion of timetable.infusions) {
    if (column < infusion.startCol || column > infusion.endCol) continue
    const activeRate = rateAtColumn(infusion, column)
    items.push({
      kind: "infusion",
      id: `inf-${infusion.id}`,
      name: infusion.name,
      rate: activeRate.rate,
      unit: activeRate.unit,
      color: infusion.color ?? "#3b82f6",
    })
  }
  for (const fluid of timetable.fluids) {
    if (column >= fluid.startCol && column <= fluid.endCol) {
      items.push({
        kind: "fluid",
        id: `fluid-${fluid.id}`,
        name: fluid.name,
        volume: fluid.volume,
        color: fluid.color ?? "#38bdf8",
      })
    }
  }
  return items
}

export function runningItemsByColumn(
  timetable: TimetableData,
  columns: number[],
): Map<number, RunningItem[]> {
  const rows = new Map(columns.map(column => [column, [] as RunningItem[]]))
  const push = (column: number, item: RunningItem) => {
    rows.get(column)?.push(item)
  }

  for (const agent of timetable.agents) {
    for (const column of columns) {
      if (column >= agent.startCol && column <= agent.endCol) {
        push(column, {
          kind: "agent",
          id: `agent-${agent.name}`,
          name: agent.name,
          color: agent.color ?? "#a78bfa",
        })
      }
    }
  }

  for (const gas of timetable.gasSettings ?? []) {
    const changes = [...(gas.settingsChanges ?? [])]
      .sort((a, b) => a.col - b.col)
    for (const column of columns) {
      if (column < gas.startCol || column > gas.endCol) continue
      let latest = changes[0]?.col <= column ? changes[0] : undefined
      for (let index = 1; index < changes.length; index += 1) {
        if (changes[index].col > column) break
        latest = changes[index]
      }
      push(column, {
        kind: "gas",
        id: gas.id || "gas-settings",
        fgf: latest?.fgf ?? gas.fgf,
        fio2: latest?.fio2 ?? gas.fio2,
        color: "#818cf8",
      })
    }
  }

  for (const infusion of timetable.infusions) {
    const changes = [...(infusion.rateChanges ?? [])]
      .sort((a, b) => a.col - b.col)
    for (const column of columns) {
      if (column < infusion.startCol || column > infusion.endCol) continue
      let latest = changes[0]?.col <= column ? changes[0] : undefined
      for (let index = 1; index < changes.length; index += 1) {
        if (changes[index].col > column) break
        latest = changes[index]
      }
      push(column, {
        kind: "infusion",
        id: `inf-${infusion.id}`,
        name: infusion.name,
        rate: latest?.rate ?? infusion.rate,
        unit: latest?.unit ?? infusion.unit,
        color: infusion.color ?? "#3b82f6",
      })
    }
  }

  for (const fluid of timetable.fluids) {
    for (const column of columns) {
      if (column >= fluid.startCol && column <= fluid.endCol) {
        push(column, {
          kind: "fluid",
          id: `fluid-${fluid.id}`,
          name: fluid.name,
          volume: fluid.volume,
          color: fluid.color ?? "#38bdf8",
        })
      }
    }
  }

  return rows
}

export function formatColumnTime(
  column: number,
  start: Date | string | number | null | undefined,
  intervalMinutes = 5,
  clock: "local" | "utc" = "local",
): string {
  if (start == null) return `+${column * intervalMinutes}m`
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime()
  if (!Number.isFinite(startMs)) return `+${column * intervalMinutes}m`
  const date = new Date(startMs + column * intervalMinutes * 60_000)
  const hours = clock === "utc" ? date.getUTCHours() : date.getHours()
  const minutes = clock === "utc" ? date.getUTCMinutes() : date.getMinutes()
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

export function buildDrugLogEntries(
  timetable: Pick<TimetableData, "drugs">,
  start?: Date | string | number | null,
  clock: "local" | "utc" = "local",
): DrugLogEntry[] {
  return [...timetable.drugs]
    .sort((a, b) => a.colIdx - b.colIdx)
    .map(drug => ({
      column: drug.colIdx,
      time: formatColumnTime(drug.colIdx, start, 5, clock),
      name: drug.name,
      dose: drug.dose,
      unit: drug.unit,
    }))
}

export function naturalTimetableColumnCount(
  timetable: Partial<TimetableData>,
  minimumColumns = 0,
  trailingColumns = 0,
): number {
  const columns = [0]
  for (const [column, vital] of (timetable.vitals ?? []).entries()) {
    if (vital && Object.values(vital).some(value => value != null)) columns.push(column)
  }
  for (const drug of timetable.drugs ?? []) columns.push(drug.colIdx)
  for (const event of timetable.clinicalEvents ?? []) columns.push(event.colIdx)
  for (const segment of [
    ...(timetable.infusions ?? []),
    ...(timetable.fluids ?? []),
    ...(timetable.agents ?? []),
    ...(timetable.gasSettings ?? []),
    ...(timetable.positions ?? []),
    ...(timetable.phases ?? []),
  ]) {
    columns.push(segment.startCol, segment.endCol)
  }
  return Math.max(Math.max(...columns) + 1, minimumColumns) + trailingColumns
}

export function vitalSummaryParts(vital?: VitalsEntry): string[] {
  if (!vital) return []
  const parts: string[] = []
  if (vital.systolic != null && vital.diastolic != null) {
    parts.push(`${vital.systolic}/${vital.diastolic}`)
  }
  if (vital.heartRate != null) parts.push(`HR ${vital.heartRate}`)
  if (vital.spO2 != null) parts.push(`SpO2 ${vital.spO2}`)
  if (vital.etco2 != null) parts.push(`CO2 ${vital.etco2}`)
  return parts
}

export function buildRowSummary(
  vital: VitalsEntry | undefined,
  rowEvents: LogEvent[],
  labelOf: (event: LogEvent) => string,
): RowSummary {
  const criticalParts: string[] = []
  const normalParts: string[] = []
  if (vital?.systolic != null) {
    const value = `BP ${vital.systolic}/${vital.diastolic ?? "?"}`
    ;(vital.systolic < 90 ? criticalParts : normalParts).push(value)
  }
  if (vital?.heartRate != null) {
    const value = `HR ${vital.heartRate}`
    ;(vital.heartRate < 50 || vital.heartRate > 130 ? criticalParts : normalParts).push(value)
  }
  if (vital?.spO2 != null) {
    const value = `SpO2 ${vital.spO2}`
    ;(vital.spO2 < 95 ? criticalParts : normalParts).push(value)
  }
  if (vital?.temp != null) {
    const value = `T ${vital.temp}`
    ;(vital.temp < 35 ? criticalParts : normalParts).push(value)
  }
  if (vital?.etco2 != null) normalParts.push(`CO2 ${vital.etco2}`)

  const eventParts = rowEvents
    .filter(event => event.type === "drug" || event.type === "clinical_event")
    .slice(0, 4)
    .map(labelOf)
  return {
    criticalParts,
    normalParts,
    eventParts,
    hasCritical: criticalParts.length > 0,
    hasUnsynced: rowEvents.some(event => event.syncStatus != null),
  }
}
