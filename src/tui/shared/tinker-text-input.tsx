import type { JSX } from "solid-js"

/**
 * TinkerTextInput
 *
 * Wrapper around OpenTUI's textarea with a small, opinionated API:
 * - `stripNewlines` optionally collapses any newlines into spaces, so you can
 *   have logically single-line inputs while still using a textarea.
 * - `maxChars` provides a simple hard cap on content length.
 * - `minHeight`/`maxHeight` control the visual number of rows.
 *
 * NOTE: In practice, a `minHeight`/`maxHeight` of 1 "works", but the underlying
 * textarea was clearly not designed for true single-row usage. When the
 * content exceeds the visible width, cursor movement can look odd (jumping
 * between wrapped segments instead of smooth horizontal scrolling). To avoid
 * this looking too weird in real UIs, you should either:
 *   - keep `maxChars` low enough that a single logical line never overflows
 *     the visible width, or
 *   - use a taller `minHeight`/`maxHeight` (e.g. 2–3 rows) so wrapping is more
 *     visually obvious.
 */
export type TinkerTextInputProps = {
  value: string
  onChange: (next: string) => void

  // Content constraints / validation
  maxChars?: number

  // Visual sizing (in rows/lines)
  minHeight?: number
  maxHeight?: number

  placeholder?: string

  // Styling passthroughs matching OpenTUI textarea
  textColor?: any
  focusedTextColor?: any
  backgroundColor?: any
  focusedBackgroundColor?: any

  focused?: boolean

  // If true, strip any newlines from the underlying text (replace with
  // spaces). Useful for logically single-line inputs that still use a
  // textarea under the hood.
  stripNewlines?: boolean

  // Optional ref to underlying TextareaRenderable for callers that want
  // to attach additional keyboard behavior (word nav/delete, etc.).
  textareaRef?: (ref: any) => void

  // Additional props are allowed but ignored here
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

function applyConstraints(
  text: string,
  opts: {
    maxChars?: number
    stripNewlines?: boolean
  },
): string {
  const { maxChars, stripNewlines } = opts

  // Normalize line endings first
  let t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  if (stripNewlines) {
    // Preserve word boundaries but collapse any newlines into spaces
    t = t.replace(/\n+/g, " ")
  }

  if (maxChars && maxChars > 0 && t.length > maxChars) {
    t = t.slice(0, maxChars)
  }

  return t
}

export function TinkerTextInput(props: TinkerTextInputProps): JSX.Element {
  let internalRef: any

  const {
    value,
    onChange,
    mode = "multi-line",
    maxChars,
    minHeight,
    maxHeight,
    placeholder,
    textColor,
    focusedTextColor,
    backgroundColor,
    focusedBackgroundColor,
    focused,
    stripNewlines,
    textareaRef,
    ...rest
  } = props

  function syncFromTextarea() {
    const raw: string =
      typeof internalRef?.plainText === "string" ? internalRef.plainText : value ?? ""

    const constrained = applyConstraints(raw, {
      maxChars,
      stripNewlines,
    })

    if (constrained !== raw && internalRef) {
      // Best-effort way to update the underlying textarea content without
      // relying on a specific setter API. This keeps the visual content
      // in sync with the constrained value.
      if (typeof internalRef.clear === "function") {
        internalRef.clear()
      }
      if (typeof internalRef.insertText === "function") {
        internalRef.insertText(constrained)
      }
    }

    if (constrained !== value) {
      onChange(constrained)
    }
  }

  const effectiveMinHeight = typeof minHeight === "number" ? minHeight : 1
  const effectiveMaxHeight = typeof maxHeight === "number" ? maxHeight : undefined

  return (
    <textarea
      ref={(r: any) => {
        internalRef = r
        textareaRef?.(r)
      }}
      minHeight={effectiveMinHeight}
      maxHeight={effectiveMaxHeight}
      placeholder={placeholder}
      textColor={textColor}
      focusedTextColor={focusedTextColor}
      backgroundColor={backgroundColor}
      focusedBackgroundColor={focusedBackgroundColor}
      focused={focused}
      onContentChange={syncFromTextarea}
      {...rest}
    />
  )
}
