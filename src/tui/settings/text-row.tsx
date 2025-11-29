import { theme } from "../theme.ts"
import { InteractiveRow } from "../shared/interactive-row.tsx"
import { TinkerTextInput } from "../shared/tinker-text-input.tsx"

interface TextRowControlProps {
  label: string
  /** Display value when not editing (may be masked, e.g. API key) */
  value: string
  /** Actual editable text value while in edit mode */
  editValue: string
  placeholder?: string
  isSelected: boolean
  isEditing: boolean
  onTextInput: (value: string) => void
}

export function TextRowControl(props: TextRowControlProps) {
  return (
    <box flexDirection="column">
      <InteractiveRow
        label={props.label}
        value={props.value}
        highlighted={props.isSelected && !props.isEditing}
      />
      {props.isEditing && (
        <box
          paddingLeft={2}
          paddingRight={2}
          height={4}
          borderStyle="single"
          borderColor={theme.borderFocus}
        >
          <TinkerTextInput
            value={props.editValue}
            onChange={props.onTextInput}
            maxChars={1024}
            stripNewlines
            minHeight={2}
            maxHeight={2}
            placeholder={props.placeholder}
            textColor={theme.text}
            focusedTextColor={theme.text}
            backgroundColor={theme.background}
            focusedBackgroundColor={theme.backgroundPanel}
            focused
          />
        </box>
      )}
    </box>
  )
}
