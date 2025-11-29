import type { JSX } from "solid-js"

// Generic text input for TUI: centralizes paste handling and (in the future)
// cursor/navigation behavior so callers don't have to reimplement it.

export type SmartInputProps = {
  value: string
  onChange: (next: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  // Common OpenTUI input props we care about
  backgroundColor?: any
  focusedBackgroundColor?: any
  textColor?: any
  focusedTextColor?: any
  placeholderColor?: any
  cursorColor?: any
  focused?: boolean
  // Optional callback to expose the underlying InputRenderable ref (used in
  // sandbox for experimental navigation behavior).
  inputRef?: (ref: any) => void
}

export function SmartInput(props: SmartInputProps) {
  let inputRef: any

  const {
    value,
    onChange,
    onSubmit,
    placeholder,
    backgroundColor,
    focusedBackgroundColor,
    textColor,
    focusedTextColor,
    placeholderColor,
    cursorColor,
    focused,
  } = props

  function findPrevWordOffset(text: string, offset: number): number {
    if (offset <= 0) return 0
    let i = offset
    // Step left once so we start from the character before the cursor
    i -= 1
    // Skip whitespace to the left
    while (i > 0 && /\s/.test(text.charAt(i))) i--
    // Skip non-whitespace (word) to the left
    while (i > 0 && !/\s/.test(text.charAt(i - 1))) i--
    return i
  }

  function findNextWordOffset(text: string, offset: number): number {
    if (offset >= text.length) return text.length
    let i = offset
    // Skip non-whitespace (current word tail)
    while (i < text.length && !/\s/.test(text.charAt(i))) i++
    // Skip whitespace to the start of next word
    while (i < text.length && /\s/.test(text.charAt(i))) i++
    return i
  }

  function toSingleLine(text: string): string {
    // Replace any CR/LF with spaces to keep word boundaries but enforce a
    // single visual line.
    return text.replace(/[\r\n]+/g, " ")
  }

  return (
    <input
      ref={(r) => {
        inputRef = r
        props.inputRef?.(r)
      }}
      value={value}
      placeholder={placeholder}
      backgroundColor={backgroundColor}
      focusedBackgroundColor={focusedBackgroundColor}
      textColor={textColor}
      focusedTextColor={focusedTextColor}
      placeholderColor={placeholderColor}
      cursorColor={cursorColor}
      focused={focused}
      onInput={(v: string) => onChange(toSingleLine(v))}
      onSubmit={onSubmit ? () => onSubmit(value) : undefined}
      onPaste={(event: any) => {
        // Normalize line endings from bracketed paste (CRLF/CR -> LF)
        const raw = event.text ?? ""
        const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        if (!normalized) return
        const singleLine = toSingleLine(normalized)
        if (!singleLine) return
        // Prefer to let the underlying InputRenderable handle text insertion
        // so that it stays in sync with its own cursor logic and then emits
        // an onInput event to update our state.
        if (inputRef && typeof inputRef.insertText === "function") {
          inputRef.insertText(singleLine)
        } else {
          // Fallback: just append to the controlled value if insertText is
          // not available for some reason.
          onChange(toSingleLine(value + singleLine))
        }
        event.preventDefault?.()
      }}
    />
  )
}
