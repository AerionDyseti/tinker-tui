/**
 * @deprecated Use ConversationService from ./conversation-service.ts instead.
 * This file exists for backwards compatibility during migration.
 */

export {
  ConversationService,
  ConversationService as ActiveSession,
  createConversationService,
  createConversationService as createActiveSession,
} from "./conversation-service.ts"

export type {
  ConversationServiceConfig,
  ConversationServiceConfig as ActiveSessionConfig,
  SessionEvent,
} from "./conversation-service.ts"
