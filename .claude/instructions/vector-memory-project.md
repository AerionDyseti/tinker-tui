# Project Memory Server

You have access to `vector-memory-project` for storing project-specific memories that sync across machines.

**Use `mcp__vector-memory-project__*` tools for:**
- Architecture decisions and rationale
- Design patterns used in the codebase
- Implementation decisions and why they were made
- Project conventions and coding standards
- Session handoffs and continuity context
- Bug investigations and resolutions
- Feature planning and requirements

**Do NOT use vector-memory-project for:**
- Machine-specific paths or configurations
- Local environment details
- Personal preferences that vary by machine

**Memory Best Practices:**

1. **Record Decisions Made**
   - When choosing between approaches, store the decision and reasoning

2. **Document Outcomes**
   - When tasks are completed, store what was accomplished

3. **Track Next Steps**
   - Store identified improvements or follow-up work needed

4. **Learn from Experience**
   - Before starting work, search memory for similar past tasks
   - Build on previous context rather than starting fresh

**Examples of good project memories:**
- "Chose React Query over SWR for data fetching because of better devtools and mutation support"
- "Authentication flow uses JWT with refresh tokens stored in httpOnly cookies"
- "Database migrations use the timestamp prefix pattern: YYYYMMDDHHMMSS_description.sql"
- "Nov 2024 session: Refactored auth module, next step is to add rate limiting"
