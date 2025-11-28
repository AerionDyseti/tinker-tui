/**
 * TUI Theme System
 *
 * Defines semantic color tokens for consistent styling across the TUI.
 * Colors are organized by purpose, not appearance.
 */

export interface Theme {
  // Base colors
  background: string
  backgroundPanel: string // Elevated surfaces (dialogs, cards)
  backgroundHighlight: string // Hover/selection background

  // Text colors
  text: string // Primary text
  textMuted: string // Secondary/help text
  textOnAccent: string // Text on accent-colored backgrounds

  // Accent colors
  accent: string // Primary accent (buttons, focus, highlights)
  accentMuted: string // Dimmed accent for descriptions on accent bg

  // Semantic colors
  border: string // Default borders
  borderFocus: string // Focused element borders

  // Status colors (for future use)
  success: string
  error: string
  warning: string
  info: string
}

/**
 * Default dark theme
 */
export const darkTheme: Theme = {
  // Base
  background: "#0d0d1a",
  backgroundPanel: "#222222",
  backgroundHighlight: "#333333",

  // Text
  text: "#FFFFFF",
  textMuted: "#888888",
  textOnAccent: "#000000",

  // Accent - Orange/amber
  accent: "#FFAA00",
  accentMuted: "#442200",

  // Borders
  border: "#444444",
  borderFocus: "#FFAA00",

  // Status
  success: "#00FF00",
  error: "#FF6666",
  warning: "#FFAA00",
  info: "#00FFFF",
}

/**
 * Chat-specific colors (extend base theme)
 */
export const chatColors = {
  userMessage: "#00FFFF",
  assistantMessage: "#00FF00",
  systemMessage: "#FF6666",
  inputBorder: "#00FF00",
  inputBorderDisabled: "#666666",
} as const

/**
 * Current active theme
 * TODO: Make this reactive and configurable
 */
export const theme = darkTheme
