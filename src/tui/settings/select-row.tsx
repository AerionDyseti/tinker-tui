import { For, Show } from "solid-js"
import { theme } from "../theme.ts"
import { InteractiveRow } from "../shared/interactive-row.tsx"

interface SelectRowControlProps {
  label: string
  value: string
  isSelected: boolean
  dialogOpen: boolean
  options: { label: string; value: string }[]
  selectedIndex: number
}

export function SelectRowControl(props: SelectRowControlProps) {
  return (
    <>
      <InteractiveRow
        label={props.label}
        value={props.value}
        valueSuffix=" ▼"
        highlighted={props.isSelected && !props.dialogOpen}
      />
      <Show when={props.dialogOpen && props.isSelected}>
        <box
          position="absolute"
          top={6}
          left={4}
          width={50}
          borderStyle="rounded"
          borderColor={theme.accent}
          backgroundColor={theme.backgroundPanel}
          flexDirection="column"
          paddingTop={1}
          paddingBottom={1}
        >
          <text fg={theme.accent} attributes={1} paddingLeft={1} paddingBottom={1}>
            Select Option
          </text>
          <For each={props.options}>
            {(option, index) => {
              const isSelected = () => index() === props.selectedIndex
              return (
                <box
                  flexDirection="row"
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected() ? theme.accent : undefined}
                >
                  <text fg={isSelected() ? theme.textOnAccent : theme.text} attributes={isSelected() ? 1 : 0}>
                    {option.label}
                  </text>
                </box>
              )
            }}
          </For>
          <text fg={theme.textMuted} paddingLeft={1} paddingTop={1}>
            ↑↓ Navigate | Enter Select | ESC Cancel
          </text>
        </box>
      </Show>
    </>
  )
}
