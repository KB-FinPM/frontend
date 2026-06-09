/**
 * @typedef {Object} ChatActionCommand
 * @property {"CONFIRM_PENDING_ACTION"|"CANCEL_PENDING_ACTION"} type
 * @property {string=} action_id
 * @property {Record<string, unknown>=} payload
 */

/**
 * @typedef {Object} ChatResponse
 * @property {boolean} success
 * @property {string} message
 * @property {string} conversation_id
 * @property {string=} message_id
 * @property {string} state
 * @property {Record<string, unknown>=} pending_action
 * @property {Array<Record<string, unknown>>=} suggested_actions
 * @property {Record<string, unknown>=} result
 */

export const DOCUMENT_TYPES = Object.freeze({
  CONSTRUCTION_REQUIREMENT_DEFINITION: "CONSTRUCTION_REQUIREMENT_DEFINITION",
  REQUIREMENT_SPEC: "REQUIREMENT_SPEC",
  MEETING_NOTES: "MEETING_NOTES",
  UNKNOWN: "UNKNOWN",
});

export const DOCUMENT_TYPE_OPTIONS = Object.freeze([
  {
    value: DOCUMENT_TYPES.CONSTRUCTION_REQUIREMENT_DEFINITION,
    label: "구축요건정의서",
  },
  {
    value: DOCUMENT_TYPES.REQUIREMENT_SPEC,
    label: "요구사항 명세서",
  },
  {
    value: DOCUMENT_TYPES.MEETING_NOTES,
    label: "회의록",
  },
  {
    value: DOCUMENT_TYPES.UNKNOWN,
    label: "기타",
  },
]);

export const CHAT_STATES = Object.freeze({
  IDLE: "IDLE",
  WAITING_REQUIRED_INFO: "WAITING_REQUIRED_INFO",
  WAITING_CONFIRMATION: "WAITING_CONFIRMATION",
  EXECUTING_ACTION: "EXECUTING_ACTION",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

export const CHAT_ACTION_COMMAND_TYPES = Object.freeze({
  CONFIRM_PENDING_ACTION: "CONFIRM_PENDING_ACTION",
  CANCEL_PENDING_ACTION: "CANCEL_PENDING_ACTION",
});
