import { $ } from "bun"
import { platform, release } from "os"

export namespace Clipboard {
  /** Read plain text from the system clipboard, if possible. */
  export async function readText(): Promise<string | undefined> {
    const os = platform()

    // macOS
    if (os === "darwin") {
      const result = await $`pbpaste`.nothrow().text()
      const text = result.trim()
      return text.length ? text : undefined
    }

    // Windows or WSL (use powershell clipboard)
    if (os === "win32" || release().includes("WSL")) {
      const result = await $`powershell.exe -command Get-Clipboard`.nothrow().text()
      const text = result.trim()
      return text.length ? text : undefined
    }

    // Linux: try Wayland, then X11
    if (os === "linux") {
      const wl = await $`wl-paste`.nothrow().text()
      const wlText = wl.trim()
      if (wlText.length) return wlText

      const xclip = await $`xclip -selection clipboard -o`.nothrow().text()
      const xText = xclip.trim()
      if (xText.length) return xText
    }

    return undefined
  }
}
