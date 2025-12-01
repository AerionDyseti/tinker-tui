/**
 * Domain Ports — Interfaces that define external dependencies.
 *
 * These ports follow the hexagonal architecture pattern:
 * - Domain defines what it needs (ports)
 * - Infrastructure provides implementations (adapters)
 * - Application layer wires them together
 */

// Embedder port
export type { Embedder } from "./embedder.ts"

// Session and artifact repository ports
export type {
  SessionRepository,
  ArtifactRepository,
} from "./session-repository.ts"

// Knowledge repository port
export type { KnowledgeRepository } from "./knowledge-repository.ts"

// Context assembler port
export type {
  ContextAssembler,
  ContextAssemblyRequest,
  KnowledgeAwareAssembler,
} from "./context-assembler.ts"
