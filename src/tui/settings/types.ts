export type FieldType = "select" | "text"

export interface FieldDefinition {
  id: string
  label: string
  type: FieldType
  options?: { label: string; value: string }[] // For select fields
  placeholder?: string // For text fields
  getValue: () => string
  setValue: (value: string) => void
}
