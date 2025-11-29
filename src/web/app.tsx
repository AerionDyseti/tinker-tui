/**
 * Tinker Web UI - Entry Point
 *
 * Minimal React app for the web frontend spike.
 */

import React from "react"
import { createRoot } from "react-dom/client"
import { Dialogue } from "./components/dialogue.tsx"

import "./styles.css"

function App() {
  return (
    <div className="app">
      <Dialogue />
    </div>
  )
}

const root = createRoot(document.getElementById("root")!)
root.render(<App />)
