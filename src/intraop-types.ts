export type EventType =
  | "drug" | "vital" | "clinical_event"
  | "infusion_start" | "infusion_rate" | "infusion_stop"
  | "fluid_start" | "fluid_end"
  | "agent_start" | "agent_stop"
  | "gas_start" | "gas_change" | "gas_stop"

export type LogEvent = {
  id: string
  ts: string
  type: EventType
  name?: string
  dose?: string
  unit?: string
  category?: string
  color?: string
  systolic?: number
  diastolic?: number
  heartRate?: number
  spO2?: number
  etco2?: number
  temp?: number
  bgl?: number
  label?: string
  value?: string
  infId?: string
  rate?: string
  fluidId?: string
  volume?: string
  drugRoute?: string
  concentration?: string
  atcCode?: string
  drugId?: string
  inn?: string
  fgf?: number
  carrierGas?: string | null
  fio2?: number
  fiAir?: number
  fiN2O?: number
  syncStatus?: "pending" | "failed"
}

export type ActiveInfusion = {
  infId: string
  name: string
  rate: string
  unit: string
  color: string
  concentration?: string
  route?: string
  drugId?: string
  atcCode?: string
  inn?: string
}

export type ActiveFluid = {
  fluidId: string
  name: string
  volume: string
  color: string
}

export type ActiveGasSettings = {
  fgf: number
  carrierGas: string | null
  fio2: number
  fiAir?: number
  fiN2O?: number
} | null

