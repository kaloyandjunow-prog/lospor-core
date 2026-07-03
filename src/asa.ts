export type ASASuggestion = { cls: "I" | "II" | "III" | "IV"; reasons: string[] }

const ASA_RULES: [string, number, number, string][] = [
  ["N18.6", 5, 4, "End-stage renal disease (not on dialysis)"],
  ["N18.5", 5, 4, "Chronic kidney disease stage 5"],
  ["I50.2", 5, 4, "Systolic heart failure"],
  ["I50.3", 5, 4, "Diastolic heart failure"],
  ["I50", 3, 3, "Heart failure"],
  ["I21", 3, 3, "Acute MI"],
  ["I25", 3, 3, "Chronic ischaemic heart disease"],
  ["I63", 3, 3, "Cerebral infarction (stroke)"],
  ["I64", 3, 3, "Stroke / CVA"],
  ["G45", 3, 3, "TIA"],
  ["Z95.0", 5, 3, "Pacemaker / ICD"],
  ["Z95.1", 5, 3, "Implanted cardiac device"],
  ["J44", 3, 3, "COPD"],
  ["J45.5", 5, 3, "Severe persistent asthma"],
  ["E10", 3, 3, "Type 1 diabetes mellitus"],
  ["K70.3", 5, 3, "Alcoholic liver cirrhosis"],
  ["K74", 3, 3, "Cirrhosis of liver"],
  ["N18", 3, 3, "Chronic kidney disease"],
  ["Z99.2", 5, 3, "Dialysis"],
  ["E66.9", 5, 3, "Morbid obesity"],
  ["G20", 3, 3, "Parkinson's disease"],
  ["F10.2", 5, 3, "Alcohol dependence"],
  ["F19.2", 5, 3, "Substance dependence"],
  ["Z86.7", 5, 3, "History of MI/stroke > 3 months"],
  ["I10", 3, 2, "Hypertension"],
  ["I11", 3, 2, "Hypertensive heart disease"],
  ["I48", 3, 2, "Atrial fibrillation"],
  ["I49", 3, 2, "Arrhythmia"],
  ["I73", 3, 2, "Peripheral vascular disease"],
  ["I83", 3, 2, "Varicose veins / CVI"],
  ["I82", 3, 2, "DVT history"],
  ["J45", 3, 2, "Asthma"],
  ["E11", 3, 2, "Type 2 diabetes mellitus"],
  ["E03", 3, 2, "Hypothyroidism"],
  ["E05", 3, 2, "Hyperthyroidism"],
  ["E04", 3, 2, "Thyroid disease"],
  ["G40", 3, 2, "Epilepsy"],
  ["G43", 3, 2, "Migraine"],
  ["F32", 3, 2, "Depressive episode"],
  ["F33", 3, 2, "Recurrent depression"],
  ["F41", 3, 2, "Anxiety disorder"],
  ["K29", 3, 2, "Gastritis / peptic ulcer"],
  ["K57", 3, 2, "Diverticular disease"],
  ["K21", 3, 2, "GERD"],
  ["K73", 3, 2, "Chronic hepatitis"],
  ["D50", 3, 2, "Anaemia (iron deficiency)"],
  ["D51", 3, 2, "Vitamin B12 deficiency anaemia"],
  ["D64", 3, 2, "Anaemia"],
  ["M05", 3, 2, "Rheumatoid arthritis"],
  ["M06", 3, 2, "Rheumatoid arthritis"],
  ["M81", 3, 2, "Osteoporosis"],
  ["Z87.3", 5, 2, "History of musculoskeletal disease"],
  ["F17.2", 5, 2, "Nicotine dependence (smoker)"],
]

export function suggestASAFromTags(tags: { label: string; code?: string }[], bmi: number | null): ASASuggestion | null {
  if (tags.length === 0 && !bmi) return null
  const r4: string[] = []
  const r3: string[] = []
  const r2: string[] = []
  for (const tag of tags) {
    const code = (tag.code ?? "").toUpperCase()
    for (const [prefix, minLen, cls, label] of ASA_RULES) {
      if (code.startsWith(prefix.toUpperCase()) && code.length >= minLen) {
        if (cls === 4) r4.push(label)
        else if (cls === 3 && !r3.includes(label)) r3.push(label)
        else if (cls === 2 && !r2.includes(label)) r2.push(label)
        break
      }
    }
  }
  if (bmi && bmi >= 40) r3.push(`Morbid obesity (BMI ${bmi.toFixed(1)})`)
  else if (bmi && bmi >= 30) r2.push(`Obesity (BMI ${bmi.toFixed(1)})`)
  if (r4.length > 0) return { cls: "IV", reasons: r4 }
  if (r3.length > 0) return { cls: "III", reasons: r3.slice(0, 4) }
  if (r2.length > 0) return { cls: "II", reasons: r2.slice(0, 4) }
  if (tags.length > 0) return { cls: "II", reasons: ["Comorbidities present"] }
  return { cls: "I", reasons: [] }
}
