import { sendChatMessage } from "../api/finpmApi.js";
import { formatDateTime } from "./dateTime.js";

export const createChatId = (role) =>
  `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getResponseActionId = (response) =>
  response?.action_id ??
  response?.result?.action_id ??
  response?.result?.job_id ??
  response?.pending_action?.action_id ??
  response?.pending_action?.payload?.action_id ??
  "";

export const createAssistantMessageFromResponse = (response) => ({
  id: response.message_id ?? createChatId("assistant"),
  role: "assistant",
  content: response.message ?? "처리 결과를 받았습니다.",
  createdAt: formatDateTime(),
  metadata: {
    conversationId: response.conversation_id,
    messageId: response.message_id,
    state: response.state,
    actionId: getResponseActionId(response),
    pendingAction: response.pending_action ?? null,
    suggestedActions: Array.isArray(response.suggested_actions)
      ? response.suggested_actions
      : [],
    result: response.result ?? {},
    uploadRequest: response.result?.upload_request ?? null,
    documentChoiceRequest: response.result?.document_choice_request ?? null,
    startDateRequest: response.result?.start_date_request ?? null,
    wbsPrecheckRequest: response.result?.wbs_precheck ?? null,
    commandActions: Array.isArray(response.result?.command_actions)
      ? response.result.command_actions
      : [],
    corrections: Array.isArray(response.corrections)
      ? response.corrections
      : Array.isArray(response.result?.corrections)
        ? response.result.corrections
        : [],
    downloadFiles: Array.isArray(response.download_files)
      ? response.download_files
      : Array.isArray(response.result?.download_files)
        ? response.result.download_files
        : [],
    rawResponse: response,
  },
});

export const sendProjectMessage = async (payload) => {
  const response = await sendChatMessage(payload);
  return createAssistantMessageFromResponse(response);
};
