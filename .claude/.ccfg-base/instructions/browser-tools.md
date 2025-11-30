# Browser Tools

This project includes browser automation and debugging tools.

## Playwright MCP (`mcp__playwright__*`)

Browser automation using Playwright's accessibility tree (no screenshots needed).

**Use for:**
- Navigating to URLs and interacting with web pages
- Filling forms, clicking buttons, selecting options
- Testing web application flows
- Scraping structured data from pages

**Key tools:**
- `browser_navigate` - Go to a URL
- `browser_click` - Click an element
- `browser_fill` - Fill a form field
- `browser_screenshot` - Capture the page

## Browser Tools MCP (`mcp__browser-tools__*`)

Monitor and debug browser activity via Chrome extension.

**Use for:**
- Viewing console logs from the browser
- Monitoring network requests
- Inspecting DOM elements
- Performance and accessibility audits

**Requirements:**
- Chrome extension must be installed
- `browser-tools-server` must be running (`npx @agentdeskai/browser-tools-server@latest`)

**Key tools:**
- `getConsoleLogs` - Get browser console output
- `getNetworkLogs` - See network requests
- `takeScreenshot` - Capture current page
- `runLighthouse` - Run performance/accessibility audit
