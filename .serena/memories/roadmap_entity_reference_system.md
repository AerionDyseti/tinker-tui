# Roadmap: Entity Reference System

## Vision
Generalize CodeReference to EntityReference - a relationship graph that tracks entities important to the conversation context. This enables tinker-tui to serve both coding and roleplay use cases with the same underlying abstraction.

## Domain Model

```
Knowledge        → extracted facts (stateless, searchable)
EntityReference  → pointer to something with identity
  ├── entityType: "file" | "function" | "character" | "location" | ...
  ├── entityId: string
  ├── relationships: Relationship[]
  └── metadata: domain-specific details
```

## Use Case Mapping

| Coding | Roleplay |
|--------|----------|
| Files, functions, classes | Characters, locations, items |
| Import/call relationships | Character relationships, plot connections |
| "This function calls that one" | "This character knows that one" |
| Code context window | Scene/lore context window |

## Architecture

- **Domain layer**: EntityReference, Relationship types
- **Infrastructure layer**: Entity resolvers
  - Coding mode: Code indexer (inspired by Serena MCP's approach to agentic coding artifacts)
  - Roleplay mode: World/character database
  
## Capabilities This Enables

- **Graph queries**: "What entities are related to X?"
- **Context assembly**: "Pull in entities within N hops of the current focus"
- **Cross-session continuity**: Entities persist across sessions
- **FileContent as Knowledge**: File contents might just be another kind of knowledge, with EntityReference pointing to the file entity

## Open Questions

- How deep to go on Serena-style code understanding vs simpler file references?
- Graph storage: LanceDB? Dedicated graph DB? In-memory for session scope?
- How do relationships get created? Manual? Automatic extraction? Both?

## Status
Planning - captured during domain model discussion (2025-11-29)
