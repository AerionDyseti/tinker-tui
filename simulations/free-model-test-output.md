# Simulation: free-model-test

**Turns:** 2
**Duration:** 6.0s

---

**User:**
Hey, I'm looking at this TypeScript project and I'm confused about how the session artifacts work. Can you explain?

**Agent:**
In TypeScript, session artifacts are special variables that maintain state between multiple requests of an HTTP client. They are objects that can store data that persists across requests, allowing you to keep track of session-specific information. To create a session artifact, you typically create a new object that inherits from `Cookie` or uses `@types/cookies` to work with cookie-based session management.

**User:**
What is the difference between a session artifact and a cookie?

**Agent:**
A cookie is a small text file sent by a server to a client's browser, which stores data about the client's interaction with the site. A session artifact, on the other hand, is an object that stores data about the client's session, typically on the client-side (in the browser), and is often used in conjunction with cookies to manage session state.
