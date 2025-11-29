import { theme } from "../theme.ts"

interface InteractiveRowProps {
  label: string
  value: string
  valueSuffix?: string
  highlighted: boolean
}

export function InteractiveRow(props: InteractiveRowProps) {
  const background = () => (props.highlighted ? theme.accent : undefined)
  const labelColor = () => (props.highlighted ? theme.textOnAccent : theme.text)
  const labelAttrs = () => (props.highlighted ? 1 : 0)
  const valueColor = () => (props.highlighted ? theme.accentMuted : theme.textMuted)

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={background()}
    >
      <text fg={labelColor()} attributes={labelAttrs()}>
        {props.label}
      </text>
      <text fg={valueColor()}>
        {props.value}
        {props.valueSuffix ?? ""}
      </text>
    </box>
  )
}
