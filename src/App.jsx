import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  LoaderCircle,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Pencil,
  PlusCircle,
  Save,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  addMessageToConversation,
  addMessagesToConversation,
  clearRecentProjectId,
  createProject,
  deleteConversation,
  getActiveConversationId,
  getProjectById,
  getRecentProjectId,
  setActiveConversationId,
  setRecentProjectId,
  updateConversationMessage,
  updateConversationTitle,
  updateProject,
} from "./services/projectService.js";
import { createChatId, sendProjectMessage } from "./services/chatService.js";
import {
  getCommandRecommendations,
  saveCommandUsage,
} from "./services/commandRecommendationService.js";
import {
  getAgentStatusLabel,
  getGenerationAgentItems,
} from "./services/generationAgentStatusService.js";
import {
  getGenerationStageStepIndex,
  getGenerationProgressPayload,
  normalizeGenerationProgressPayload,
} from "./services/generationProgressService.js";
import {
  commitProjectTodoImport,
  deleteArtifactFile,
  deleteProjectFile,
  deleteProjectTodo,
  downloadArtifactFile,
  downloadProjectFile,
  getChatActionStatus,
  listProjectFiles,
  listProjectTodos,
  previewProjectTodoImport,
  updateArtifactFileName,
  updateProjectFileName,
  updateProjectTodo,
  uploadDocument,
} from "./api/finpmApi.js";
import {
  CHAT_ACTION_COMMAND_TYPES,
  CHAT_STATES,
  DOCUMENT_TYPES,
} from "./types/api.js";
import { formatDateTime } from "./services/dateTime.js";
import AgentProgress from "./components/AgentProgress.jsx";
import ProgressBar from "./components/ProgressBar.jsx";

const DEFAULT_DOCUMENT_TYPE =
  DOCUMENT_TYPES.CONSTRUCTION_REQUIREMENT_DEFINITION;
const DOCUMENT_UPLOAD_ACCEPTED_TYPES = [
  ".pdf",
  "application/pdf",
  ".docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls",
  "application/vnd.ms-excel",
  ".md",
  ".txt",
  "text/plain",
  ".csv",
  ".json",
  "application/json",
  ".log",
];
const TODO_IMPORT_ACCEPTED_TYPES = [
  ".docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls",
  "application/vnd.ms-excel",
  ".pdf",
  "application/pdf",
  ".txt",
  "text/plain",
  ".md",
  ".csv",
  ".json",
  "application/json",
  ".log",
];
const PROJECT_START_DATE_ERROR =
  "프로젝트 시작일은 YYYY-MM-DD 형식으로 입력해주세요.";
const PROJECT_CREATE_RESPONSE_ERROR_MESSAGE =
  "프로젝트 생성 응답에서 프로젝트 ID를 확인하지 못했습니다. 다시 시도해주세요.";
const GENERATION_REQUEST_TYPES = Object.freeze({
  REQUIREMENT_SPEC: "REQUIREMENT_SPEC",
  WBS_CREATE: "WBS_CREATE",
  WBS_REFERENCE: "WBS_REFERENCE",
  SCREEN_DESIGN_CREATE: "SCREEN_DESIGN_CREATE",
  UNIT_TEST_CREATE: "UNIT_TEST_CREATE",
});
const DOCUMENT_CONTEXT_REQUEST_TYPES = Object.freeze({
  MEETING_TODO_EXTRACTION: "MEETING_TODO_EXTRACTION",
});
const FILE_MANAGER_TABS = Object.freeze({
  UPLOADED: "uploaded",
  GENERATED: "generated",
});
const WORKSPACE_TABS = Object.freeze({
  DOCUMENTS: "documents",
  SCHEDULE: "schedule",
  TODAY: "today",
});
const SCHEDULE_REGISTRATION_MODES = Object.freeze({
  MANUAL: "manual",
  EXISTING: "existing",
  UPLOAD: "upload",
});
const CALENDAR_VIEW_MODES = Object.freeze({
  MONTH: "month",
  WEEK: "week",
});
const FILE_KINDS = Object.freeze({
  UPLOADED: "uploaded",
  GENERATED: "generated",
});
const TODO_STATUS_FILTERS = Object.freeze([
  { value: "", label: "전체" },
  { value: "NOT_STARTED", label: "진행전" },
  { value: "IN_PROGRESS", label: "진행중" },
  { value: "DONE", label: "완료" },
]);
const TODO_STATUS_OPTIONS = TODO_STATUS_FILTERS.filter((option) => option.value);
const TODO_SOURCE_FILTERS = Object.freeze([
  { value: "", label: "전체" },
  { value: "WBS", label: "WBS" },
  { value: "MEETING_NOTES", label: "회의록" },
  { value: "MANUAL", label: "직접 등록" },
]);
const TODO_IMPORT_DOCUMENT_TYPES = Object.freeze([
  { value: "MEETING_NOTES", label: "회의록" },
  { value: "WBS", label: "WBS" },
]);
const DOCUMENT_GENERATION_COPY = Object.freeze({
  existingChoice: "기준 문서를 선택해주세요.",
  uploadOrCreate: "생성 기준 문서를 업로드해주세요.",
  start: "문서 생성을 시작하겠습니다.",
  uploadLabel: "기준 문서 업로드",
  generate: "생성",
});
const GENERATION_JOB_STATUS = Object.freeze({
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});
const DOCUMENT_HUB_DEFAULT_NODE_ID = "requirement-spec";
const DOCUMENT_HUB_SOURCE_NODE_IDS = Object.freeze([
  "requirement-definition",
  "meeting-notes",
]);
const DOCUMENT_HUB_NODES = Object.freeze([
  {
    id: "requirement-definition",
    label: "구축요건정의서",
    documentType: DOCUMENT_TYPES.CONSTRUCTION_REQUIREMENT_DEFINITION,
    kind: "source",
    positionClass: "document-map__node--requirement-definition",
    description: "요구사항명세서를 만들기 위한 기준 문서입니다.",
    basisLabel: "업로드 문서",
    nextNodeIds: ["requirement-spec"],
  },
  {
    id: "meeting-notes",
    label: "기술협상회의록",
    documentType: DOCUMENT_TYPES.MEETING_NOTES,
    kind: "optional",
    positionClass: "document-map__node--meeting-notes",
    description: "요구사항명세서 생성 시 함께 반영할 수 있는 선택 자료입니다.",
    basisLabel: "선택 자료",
    nextNodeIds: ["requirement-spec"],
  },
  {
    id: "requirement-spec",
    label: "요구사항명세서",
    documentType: DOCUMENT_TYPES.REQUIREMENT_SPEC,
    artifactType: "REQUIREMENT_SPEC",
    requestType: GENERATION_REQUEST_TYPES.REQUIREMENT_SPEC,
    kind: "target",
    positionClass: "document-map__node--requirement-spec",
    basisLabel: "구축요건정의서",
    requiredNodeIds: ["requirement-definition"],
    optionalNodeIds: ["meeting-notes"],
    nextNodeIds: ["screen-design", "wbs"],
  },
  {
    id: "screen-design",
    label: "화면설계서",
    documentType: DOCUMENT_TYPES.SCREEN_DESIGN,
    artifactType: "SCREEN_DESIGN",
    requestType: GENERATION_REQUEST_TYPES.SCREEN_DESIGN_CREATE,
    kind: "target",
    positionClass: "document-map__node--screen-design",
    basisLabel: "요구사항명세서",
    requiredNodeIds: ["requirement-spec"],
    nextNodeIds: ["unit-test"],
  },
  {
    id: "wbs",
    label: "WBS",
    documentType: DOCUMENT_TYPES.WBS,
    artifactType: "WBS",
    requestType: GENERATION_REQUEST_TYPES.WBS_CREATE,
    kind: "target",
    positionClass: "document-map__node--wbs",
    basisLabel: "요구사항명세서",
    requiredNodeIds: ["requirement-spec"],
    nextNodeIds: [],
  },
  {
    id: "unit-test",
    label: "단위테스트케이스",
    artifactType: "UNITTEST_SPEC",
    requestType: GENERATION_REQUEST_TYPES.UNIT_TEST_CREATE,
    kind: "target",
    positionClass: "document-map__node--unit-test",
    basisLabel: "화면설계서",
    requiredNodeIds: ["screen-design"],
    nextNodeIds: [],
  },
]);
const DOCUMENT_HUB_NODE_BY_ID = Object.freeze(
  DOCUMENT_HUB_NODES.reduce((nodeMap, node) => {
    nodeMap[node.id] = node;
    return nodeMap;
  }, {}),
);
const DOCUMENT_HUB_NODE_ID_BY_REQUEST_TYPE = Object.freeze(
  DOCUMENT_HUB_NODES.reduce((nodeMap, node) => {
    if (node.requestType) {
      nodeMap[node.requestType] = node.id;
    }
    return nodeMap;
  }, {}),
);
const OUTPUT_FORMAT_LABELS = Object.freeze({
  xlsx: "Excel(.xlsx)",
  pptx: "PowerPoint(.pptx)",
});
const GENERATION_DOCUMENT_RELATIONS = Object.freeze({
  [GENERATION_REQUEST_TYPES.REQUIREMENT_SPEC]: {
    targetArtifactType: "REQUIREMENT_SPEC",
    targetLabel: "요구사항명세서",
    primarySource: {
      documentType: DOCUMENT_TYPES.CONSTRUCTION_REQUIREMENT_DEFINITION,
      label: "구축요건정의서",
      keywords: ["구축요건", "요건정의", "rfp", "제안요청"],
      required: true,
    },
    optionalSources: [
      {
        documentType: DOCUMENT_TYPES.MEETING_NOTES,
        label: "기술협상회의록",
        keywords: ["기술협상", "회의록", "meeting"],
        optional: true,
      },
    ],
    outputFormats: [{ value: "xlsx", label: OUTPUT_FORMAT_LABELS.xlsx }],
  },
  [GENERATION_REQUEST_TYPES.SCREEN_DESIGN_CREATE]: {
    targetArtifactType: "SCREEN_DESIGN",
    targetLabel: "화면설계서",
    primarySource: {
      documentType: DOCUMENT_TYPES.REQUIREMENT_SPEC,
      label: "요구사항명세서",
      keywords: ["요구사항", "요구사항명세", "요구사항정의"],
      required: true,
    },
    optionalSources: [],
    outputFormats: [{ value: "pptx", label: OUTPUT_FORMAT_LABELS.pptx }],
  },
  [GENERATION_REQUEST_TYPES.WBS_CREATE]: {
    targetArtifactType: "WBS",
    targetLabel: "WBS",
    primarySource: {
      documentType: DOCUMENT_TYPES.REQUIREMENT_SPEC,
      label: "요구사항명세서",
      keywords: ["요구사항", "요구사항명세", "요구사항정의"],
      required: true,
    },
    optionalSources: [],
    outputFormats: [{ value: "xlsx", label: OUTPUT_FORMAT_LABELS.xlsx }],
  },
  [GENERATION_REQUEST_TYPES.UNIT_TEST_CREATE]: {
    targetArtifactType: "UNITTEST_SPEC",
    targetLabel: "단위테스트케이스",
    primarySource: {
      documentType: DOCUMENT_TYPES.SCREEN_DESIGN,
      label: "화면설계서",
      keywords: ["화면설계", "화면정의", "screen"],
      required: true,
    },
    optionalSources: [],
    outputFormats: [{ value: "xlsx", label: OUTPUT_FORMAT_LABELS.xlsx }],
  },
});
const GENERATION_PROGRESS_INITIAL_VALUE = 5;
const GENERATION_PROGRESS_LABEL = "요구사항명세서 생성 중";
const GENERATION_JOB_POLL_INTERVAL_MS = 3000;
const GENERATION_JOB_MAX_POLLS = 800;
const GENERATION_POLL_CANCELLED_ERROR = "GenerationPollingCancelled";
const GENERATION_ACTION_STATUS = Object.freeze({
  EXECUTING: "EXECUTING",
  EXECUTED: "EXECUTED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
});
const SHOULD_LOG_UI_ERRORS = Boolean(import.meta.env?.DEV);

const reportUiError = (scope, error, detail = {}) => {
  if (!SHOULD_LOG_UI_ERRORS || typeof console === "undefined") return;
  console.error(`[PM Agent UI ERROR] ${scope}`, {
    ...detail,
    error,
  });
};

const GENERATION_PROGRESS_STEPS = [
  {
    name: "요청 확인 중",
    completedName: "요청 확인 완료",
    role: "PM Agent",
    message: "생성 요청과 업로드 문서를 확인하고 있습니다.",
    progress: 10,
  },
  {
    name: "Input Agent 문서 분석 중",
    completedName: "Input Agent 문서 분석 완료",
    role: "Input Agent",
    message: "구축요건 정의서에서 요구사항 후보를 추출하고 있습니다.",
    progress: 25,
  },
  {
    name: "Core Agent 요구사항 추출 중",
    completedName: "Core Agent 요구사항 추출 완료",
    role: "Core Agent",
    message: "요구사항 정의서 항목을 정리하고 있습니다.",
    progress: 45,
  },
  {
    name: "Validation Agent 검증 중",
    completedName: "Validation Agent 검증 완료",
    role: "Validation Agent",
    message: "누락 항목과 표현을 점검하고 있습니다.",
    progress: 65,
  },
  {
    name: "Output Agent 엑셀 작성 중",
    completedName: "Output Agent 엑셀 작성 완료",
    role: "Output Agent",
    message: "엑셀 파일과 다운로드 버튼을 준비하고 있습니다.",
    progress: 85,
  },
  {
    name: "문서 생성 완료",
    completedName: "문서 생성 완료",
    role: "PM Agent",
    message: "요구사항 정의서 생성이 완료되었습니다.",
    progress: 100,
  },
];
const EXECUTABLE_ACTION_TYPES = new Set([
  CHAT_ACTION_COMMAND_TYPES.CONFIRM_PENDING_ACTION,
  CHAT_ACTION_COMMAND_TYPES.CANCEL_PENDING_ACTION,
]);

const getActionId = (message, action) =>
  action?.action_id ??
  action?.payload?.action_id ??
  message?.metadata?.pendingAction?.action_id ??
  "";

const getActionMessage = (action) =>
  action?.type === CHAT_ACTION_COMMAND_TYPES.CANCEL_PENDING_ACTION
    ? "취소"
    : action?.label || "생성하기";

const getAssistantActionId = (assistantMessage) =>
  assistantMessage?.metadata?.actionId ??
  assistantMessage?.metadata?.result?.action_id ??
  assistantMessage?.metadata?.result?.job_id ??
  assistantMessage?.metadata?.pendingAction?.action_id ??
  assistantMessage?.metadata?.rawResponse?.action_id ??
  assistantMessage?.metadata?.rawResponse?.result?.action_id ??
  assistantMessage?.metadata?.rawResponse?.result?.job_id ??
  "";

const isGenerationPendingAction = (pendingAction) =>
  String(pendingAction?.action_type ?? "").startsWith("GENERATE_") ||
  Boolean(pendingAction?.payload?.target_artifact_type);

const normalizeCommandText = (value = "") =>
  String(value)
    .replace(/\s+/g, "")
    .toLowerCase();

const hasGenerationSignal = (normalized = "") =>
  normalized.includes("생성") ||
  normalized.includes("만들") ||
  normalized.includes("만드") ||
  normalized.includes("작성") ||
  normalized.includes("정리") ||
  normalized.includes("추출") ||
  normalized.includes("초안");

const isMeetingTodoExtractionRequest = (value = "") => {
  const normalized = normalizeCommandText(value);
  const hasMeetingSource =
    normalized.includes("회의록") ||
    normalized.includes("회의내용") ||
    normalized.includes("미팅") ||
    normalized.includes("meeting");
  const hasTodoTarget =
    normalized.includes("todo") ||
    normalized.includes("할일") ||
    normalized.includes("해야할일") ||
    normalized.includes("액션아이템") ||
    normalized.includes("후속작업") ||
    normalized.includes("업무");
  const hasExtractionAction =
    normalized.includes("뽑") ||
    normalized.includes("추출") ||
    normalized.includes("extract");

  return hasMeetingSource && hasTodoTarget && hasExtractionAction;
};

const getGenerationRequestType = (value = "") => {
  const normalized = normalizeCommandText(value);
  const hasRequirementTarget =
    normalized.includes("요구사항명세서") ||
    normalized.includes("요구사항정의서") ||
    normalized.includes("요구사항") ||
    normalized.includes("요건정의서") ||
    normalized.includes("requirement");
  const hasWbsTarget = normalized.includes("wbs");
  const hasScreenDesignTarget =
    normalized.includes("화면설계서") ||
    normalized.includes("화면설계") ||
    normalized.includes("화면정의서") ||
    normalized.includes("화면정의") ||
    normalized.includes("screendesign");
  const hasUnitTestTarget =
    normalized.includes("단위테스트계획서") ||
    normalized.includes("단위테스트계획") ||
    normalized.includes("단위테스트케이스") ||
    normalized.includes("테스트계획서") ||
    normalized.includes("테스트케이스") ||
    normalized.includes("unittest");
  const isGeneration = hasGenerationSignal(normalized);

  if (hasUnitTestTarget && isGeneration) {
    return GENERATION_REQUEST_TYPES.UNIT_TEST_CREATE;
  }
  if (hasScreenDesignTarget && isGeneration) {
    return GENERATION_REQUEST_TYPES.SCREEN_DESIGN_CREATE;
  }
  if (hasWbsTarget && isGeneration) {
    return GENERATION_REQUEST_TYPES.WBS_CREATE;
  }
  if (hasWbsTarget) {
    return GENERATION_REQUEST_TYPES.WBS_REFERENCE;
  }
  if (hasRequirementTarget && isGeneration) {
    return GENERATION_REQUEST_TYPES.REQUIREMENT_SPEC;
  }
  return "";
};

const getMessageDocumentRequestType = (value = "") => {
  const generationRequestType = getGenerationRequestType(value);
  if (generationRequestType) return generationRequestType;
  if (isMeetingTodoExtractionRequest(value)) {
    return DOCUMENT_CONTEXT_REQUEST_TYPES.MEETING_TODO_EXTRACTION;
  }
  return "";
};

const DOCUMENT_DESCRIPTION_CTA_ACTIONS = Object.freeze({
  REQUIREMENT_SPEC: {
    label: "요구사항명세서 생성",
    message: "요구사항명세서 생성해줘",
  },
  CONSTRUCTION_REQUIREMENT_DEFINITION: {
    label: "요구사항명세서 생성",
    message: "요구사항명세서 생성해줘",
  },
  WBS: {
    label: "WBS 생성",
    message: "WBS 생성해줘",
  },
  SCREEN_DESIGN: {
    label: "화면설계서 생성",
    message: "화면설계서 생성해줘",
  },
  UNITTEST_SPEC: {
    label: "단위테스트케이스 생성",
    message: "단위테스트케이스 생성해줘",
  },
});

const getDocumentDescriptionCtaAction = (message) => {
  if (message?.role !== "assistant") return null;
  const metadata = message.metadata ?? {};
  if (metadata.state !== CHAT_STATES.IDLE) return null;
  if (
    metadata.documentChoiceRequest ||
    metadata.uploadRequest ||
    metadata.generationProgress
  ) {
    return null;
  }

  const topic = String(metadata.result?.topic || "").toUpperCase();
  const action = DOCUMENT_DESCRIPTION_CTA_ACTIONS[topic];
  return action ? { ...action, type: "document-description-cta" } : null;
};

const DOCUMENT_TYPE_LABELS = Object.freeze({
  [DOCUMENT_TYPES.CONSTRUCTION_REQUIREMENT_DEFINITION]: "구축요건정의서",
  CONSTRUCTION_UNITTEST_DEFINITION: "단위테스트정의서",
  [DOCUMENT_TYPES.MEETING_NOTES]: "기술협상회의록",
  [DOCUMENT_TYPES.REQUIREMENT_SPEC]: "요구사항명세서",
  [DOCUMENT_TYPES.SCREEN_DESIGN]: "화면설계서",
  [DOCUMENT_TYPES.WBS]: "WBS",
  [DOCUMENT_TYPES.UNKNOWN]: "기타",
});

const ARTIFACT_TYPE_LABELS = Object.freeze({
  REQUIREMENT_SPEC: "요구사항명세서",
  SCREEN_DESIGN: "화면설계서",
  WBS: "WBS",
  UNITTEST_SPEC: "단위테스트케이스",
  ACTION_ITEMS: "액션아이템",
});

const getDocumentDisplayLabel = (documentType) =>
  DOCUMENT_TYPE_LABELS[documentType] || DOCUMENT_TYPE_LABELS[DOCUMENT_TYPES.UNKNOWN];

const getArtifactDisplayLabel = (artifactType) =>
  ARTIFACT_TYPE_LABELS[artifactType] || "기타";

const ARTIFACT_SOURCE_DOCUMENT_TYPES = Object.freeze({
  REQUIREMENT_SPEC: DOCUMENT_TYPES.REQUIREMENT_SPEC,
  SCREEN_DESIGN: DOCUMENT_TYPES.SCREEN_DESIGN,
  WBS: DOCUMENT_TYPES.WBS,
});

const getRelation = (requestType) => GENERATION_DOCUMENT_RELATIONS[requestType] ?? null;

const getOutputFormats = (relation) =>
  Array.isArray(relation?.outputFormats) && relation.outputFormats.length
    ? relation.outputFormats
    : [{ value: "xlsx", label: OUTPUT_FORMAT_LABELS.xlsx }];

const getDefaultOutputFormat = (relation) => getOutputFormats(relation)[0]?.value || "xlsx";

const MEETING_TODO_DOCUMENT_CONFIG = Object.freeze({
  requestType: DOCUMENT_CONTEXT_REQUEST_TYPES.MEETING_TODO_EXTRACTION,
  targetArtifactType: "ACTION_ITEMS",
  targetLabel: "회의록 할일",
  panelTitle: "회의록 할일 추출",
  actionLabel: "할일 추출하기",
  primarySource: {
    documentType: DOCUMENT_TYPES.MEETING_NOTES,
    label: "기술협상회의록",
    keywords: ["기술협상", "회의록", "미팅", "meeting"],
    required: true,
  },
  optionalSources: [],
  outputFormats: [],
  defaultOutputFormat: "",
  hideOutputFormat: true,
  message:
    "회의록에서 할일을 추출하려면 회의록 내용을 붙여넣거나 파일을 업로드해 주세요.",
  existingMessage:
    "이미 업로드된 회의록이 있습니다. 기존 회의록을 사용하거나 새 회의록을 업로드해 주세요.",
  startMessage: "회의록에서 할일을 추출하고 있습니다.",
  label: "회의록 업로드",
  documentTypes: [DOCUMENT_TYPES.MEETING_NOTES],
  keywords: ["기술협상", "회의록", "미팅", "meeting"],
  documentType: DOCUMENT_TYPES.MEETING_NOTES,
  commandActions: [],
});

const getGenerationAssistantMessage = ({
  requestType,
  relation,
  hasPrimaryDocument,
}) => {
  if (
    requestType === GENERATION_REQUEST_TYPES.REQUIREMENT_SPEC ||
    relation?.targetArtifactType === "REQUIREMENT_SPEC"
  ) {
    if (!hasPrimaryDocument) {
      return [
        "요구사항명세서를 생성하려면 구축요건정의서가 필요합니다.",
        "기술협상회의록은 선택사항이며, 있으면 추가 자료로 반영할 수 있어요.",
      ].join("\n");
    }

    return [
      "요구사항명세서는 구축요건정의서를 기준으로 생성합니다.",
      "기술협상회의록이 있으면 추가 자료로 함께 반영할 수 있어요.",
      "기준 문서와 파일 형식을 확인한 뒤 생성해 주세요.",
    ].join("\n");
  }

  if (requestType === GENERATION_REQUEST_TYPES.SCREEN_DESIGN_CREATE) {
    return [
      "화면설계서는 요구사항명세서를 기준으로 생성합니다.",
      "기준 문서와 파일 형식을 확인한 뒤 생성해 주세요.",
    ].join("\n");
  }

  if (requestType === GENERATION_REQUEST_TYPES.WBS_CREATE) {
    return [
      "WBS는 요구사항명세서를 기준으로 생성합니다.",
      "기준 문서와 파일 형식을 확인한 뒤 생성해 주세요.",
    ].join("\n");
  }

  if (requestType === GENERATION_REQUEST_TYPES.UNIT_TEST_CREATE) {
    return [
      "단위테스트케이스는 화면설계서를 기준으로 생성합니다.",
      "기준 문서와 파일 형식을 확인한 뒤 생성해 주세요.",
    ].join("\n");
  }

  return [
    `${relation?.targetLabel || "산출물"}는 ${
      relation?.primarySource?.label || "기준 문서"
    }를 기준으로 생성합니다.`,
    "기준 문서와 파일 형식을 확인한 뒤 생성해 주세요.",
  ].join("\n");
};

const getDocumentContextAssistantMessage = ({
  requestType,
  documentConfig,
  relation,
  hasPrimaryDocument,
}) => {
  if (requestType === DOCUMENT_CONTEXT_REQUEST_TYPES.MEETING_TODO_EXTRACTION) {
    return hasPrimaryDocument
      ? documentConfig.existingMessage || MEETING_TODO_DOCUMENT_CONFIG.existingMessage
      : documentConfig.message || MEETING_TODO_DOCUMENT_CONFIG.message;
  }

  return getGenerationAssistantMessage({
    requestType,
    relation,
    hasPrimaryDocument,
  });
};

const getOutputFormatLabel = (formats, value) =>
  formats.find((format) => format.value === value)?.label ||
  OUTPUT_FORMAT_LABELS[value] ||
  value;

const toDocumentContext = (document) => {
  const documentType =
    document.document_type ?? document.documentType ?? DOCUMENT_TYPES.UNKNOWN;
  return {
    document_id: document.document_id ?? document.documentId,
    file_name: document.file_name ?? document.fileName ?? "",
    document_type: documentType,
    display_label:
      document.display_label ??
      document.displayLabel ??
      getDocumentDisplayLabel(documentType),
  };
};

const toAttachmentDocument = (document) => {
  const documentType =
    document.document_type ?? document.documentType ?? DOCUMENT_TYPES.UNKNOWN;
  return {
    documentId: document.document_id ?? document.documentId,
    fileName:
      document.file_name ??
      document.fileName ??
      getDocumentDisplayLabel(documentType),
    documentType,
    createdAt: document.created_at ?? document.createdAt ?? "",
    displayLabel:
      document.display_label ??
      document.displayLabel ??
      getDocumentDisplayLabel(documentType),
  };
};

const normalizeDocumentListResponse = (response) => {
  const documents =
    (Array.isArray(response) && response) ||
    response?.documents ||
    response?.items ||
    response?.data ||
    response?.result?.documents ||
    [];

  return (Array.isArray(documents) ? documents : [])
    .map(toAttachmentDocument)
    .filter((document) => document.documentId || document.fileName);
};

const getFileExtension = (fileName = "") => {
  const name = String(fileName ?? "");
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex + 1).toUpperCase() : "";
};

const MIME_FILE_TYPE_LABELS = Object.freeze({
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  "application/haansofthwp": "HWP",
  "application/x-hwp": "HWP",
  "text/plain": "TXT",
  "text/csv": "CSV",
});

const formatFileType = (fileName = "", fallback = "") => {
  const extension = getFileExtension(fileName);
  if (extension) return extension;

  const fallbackValue = String(fallback || "").trim();
  if (!fallbackValue) return "기타";

  const normalizedFallback = fallbackValue.toLowerCase();
  if (MIME_FILE_TYPE_LABELS[normalizedFallback]) {
    return MIME_FILE_TYPE_LABELS[normalizedFallback];
  }

  if (normalizedFallback.includes("/")) return "기타";
  return fallbackValue.toUpperCase();
};

const formatFileSize = (value) => {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return "파일크기 정보 없음";
  const units = ["B", "KB", "MB", "GB"];
  let nextSize = size;
  let unitIndex = 0;
  while (nextSize >= 1024 && unitIndex < units.length - 1) {
    nextSize /= 1024;
    unitIndex += 1;
  }
  return `${nextSize.toFixed(nextSize >= 10 || unitIndex === 0 ? 0 : 1)} ${
    units[unitIndex]
  }`;
};

const formatFileUploadedAt = (value, label = "업로드 시간") => {
  if (!value) return `${label} 정보 없음`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getFileActionKey = (file, fileKind) =>
  `${fileKind || "file"}:${file?.fileId || ""}`;

const normalizeUploadedFile = (file) => {
  const documentType =
    file.document_type ??
    file.documentType ??
    file.document_type_value ??
    DOCUMENT_TYPES.UNKNOWN;
  const fileName =
    file.file_name ??
    file.fileName ??
    file.name ??
    file.original_file_name ??
    "업로드 파일";
  const fileId =
    file.file_id ??
    file.fileId ??
    file.document_id ??
    file.documentId ??
    file.id ??
    "";
  const resolvedFileType =
    file.file_type ??
    file.fileType ??
    file.content_type ??
    file.contentType;
  const fileType = formatFileType(fileName, resolvedFileType);

  return {
    fileId,
    fileName,
    fileType,
    fileSize:
      file.file_size ??
      file.fileSize ??
      file.size ??
      file.file_size_bytes ??
      file.size_bytes ??
      file.byte_size ??
      file.content_length ??
      null,
    uploadedAt:
      file.uploaded_at ??
      file.uploadedAt ??
      file.created_at ??
      file.createdAt ??
      "",
    documentType,
    documentLabel:
      file.display_label ??
      file.displayLabel ??
      getDocumentDisplayLabel(documentType),
    raw: file,
  };
};

const normalizeUploadedFileListResponse = (response) => {
  const files =
    (Array.isArray(response) && response) ||
    response?.uploaded_files ||
    response?.uploadedFiles ||
    response?.files ||
    response?.items ||
    response?.documents ||
    response?.data ||
    response?.result?.files ||
    response?.result?.documents ||
    [];

  return (Array.isArray(files) ? files : [])
    .map(normalizeUploadedFile)
    .filter((file) => file.fileId || file.fileName);
};

const normalizeGeneratedFile = (file) => {
  const fileName =
    file.file_name ??
    file.fileName ??
    file.name ??
    file.artifact_name ??
    "생성 파일";
  const artifactType = file.artifact_type ?? file.artifactType ?? "";
  const artifactLabel =
    file.display_label ?? file.displayLabel ?? getArtifactDisplayLabel(artifactType);
  return {
    fileId: file.artifact_id ?? file.artifactId ?? file.file_id ?? file.id ?? "",
    fileName,
    fileType: formatFileType(
      fileName,
      file.file_type ?? file.fileType ?? file.content_type ?? file.contentType,
    ),
    artifactType,
    fileSize:
      file.file_size ??
      file.fileSize ??
      file.size ??
      file.file_size_bytes ??
      file.size_bytes ??
      file.byte_size ??
      file.byteSize ??
      file.content_length ??
      file.contentLength ??
      null,
    documentLabel: artifactLabel,
    createdAt: file.created_at ?? file.createdAt ?? "",
    updatedAt: file.updated_at ?? file.updatedAt ?? "",
    generatedDocumentId:
      file.generated_document_id ??
      file.generatedDocumentId ??
      file.generated_document?.document_id ??
      file.generatedDocument?.documentId ??
      "",
    raw: file,
  };
};

const normalizeGeneratedFileListResponse = (response) => {
  const files =
    response?.generated_files ||
    response?.generatedFiles ||
    response?.artifacts ||
    response?.result?.generated_files ||
    [];
  return (Array.isArray(files) ? files : [])
    .map(normalizeGeneratedFile)
    .filter((file) => file.fileId || file.fileName);
};

const normalizeProjectFileBuckets = (response) => ({
  uploaded: normalizeUploadedFileListResponse({
    uploaded_files:
      response?.uploaded_files ??
      response?.uploadedFiles ??
      (Array.isArray(response) ? response : []),
  }),
  generated: normalizeGeneratedFileListResponse({
    generated_files:
      response?.generated_files ??
      response?.generatedFiles ??
      response?.artifacts ??
      response?.result?.generated_files ??
      [],
  }),
});

const getCandidateTimestamp = (document) => {
  const value =
    document?.updatedAt ??
    document?.updated_at ??
    document?.generatedAt ??
    document?.generated_at ??
    document?.uploadedAt ??
    document?.uploaded_at ??
    document?.createdAt ??
    document?.created_at ??
    "";
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const sortDocumentsByLatest = (documents = []) =>
  [...documents].sort((left, right) => {
    const timeDiff = getCandidateTimestamp(right) - getCandidateTimestamp(left);
    if (timeDiff) return timeDiff;
    return String(left.fileName || "").localeCompare(String(right.fileName || ""), "ko");
  });

const normalizeGeneratedSourceDocument = (file) => {
  const normalizedFile = normalizeGeneratedFile(file);
  const documentType =
    file.document_type ??
    file.documentType ??
    ARTIFACT_SOURCE_DOCUMENT_TYPES[normalizedFile.artifactType] ??
    DOCUMENT_TYPES.UNKNOWN;
  if (!normalizedFile.generatedDocumentId || documentType === DOCUMENT_TYPES.UNKNOWN) {
    return null;
  }

  return {
    documentId: normalizedFile.generatedDocumentId,
    fileName: normalizedFile.fileName,
    documentType,
    createdAt: normalizedFile.createdAt,
    updatedAt: normalizedFile.updatedAt,
    displayLabel: DOCUMENT_TYPE_LABELS[documentType] || "기타",
  };
};

const normalizeProjectDocumentCandidates = (response) => {
  const buckets = normalizeProjectFileBuckets(response);
  const uploadedDocuments = buckets.uploaded.map((file) => ({
    documentId: file.fileId,
    fileName: file.fileName,
    documentType: file.documentType,
    createdAt: file.uploadedAt,
    updatedAt: file.raw?.updated_at ?? file.raw?.updatedAt ?? "",
    displayLabel:
      file.documentLabel ||
      DOCUMENT_TYPE_LABELS[file.documentType] ||
      DOCUMENT_TYPE_LABELS[DOCUMENT_TYPES.UNKNOWN],
  }));
  const generatedDocuments = buckets.generated
    .map((file) => normalizeGeneratedSourceDocument(file.raw ?? file))
    .filter(Boolean);

  return sortDocumentsByLatest(
    uniqueDocumentsById([...uploadedDocuments, ...generatedDocuments]),
  );
};

const getDocumentHubCandidates = (fileBuckets = {}) => {
  const uploadedDocuments = (fileBuckets.uploaded ?? []).map((file) => ({
    documentId: file.fileId,
    fileName: file.fileName,
    documentType: file.documentType,
    createdAt: file.uploadedAt,
    updatedAt: file.raw?.updated_at ?? file.raw?.updatedAt ?? "",
    displayLabel:
      file.documentLabel ||
      DOCUMENT_TYPE_LABELS[file.documentType] ||
      DOCUMENT_TYPE_LABELS[DOCUMENT_TYPES.UNKNOWN],
    sourceKind: FILE_KINDS.UPLOADED,
  }));
  const generatedDocuments = (fileBuckets.generated ?? [])
    .map((file) => normalizeGeneratedSourceDocument(file.raw ?? file))
    .filter(Boolean)
    .map((document) => ({
      ...document,
      sourceKind: FILE_KINDS.GENERATED,
    }));

  return sortDocumentsByLatest(
    uniqueDocumentsById([...uploadedDocuments, ...generatedDocuments]),
  );
};

const getLatestHubDocument = (documents, documentType) =>
  sortDocumentsByLatest(
    documents.filter((document) => document.documentType === documentType),
  )[0] ?? null;

const getLatestGeneratedArtifact = (fileBuckets = {}, artifactType) =>
  sortDocumentsByLatest(
    (fileBuckets.generated ?? []).filter(
      (file) => file.artifactType === artifactType,
    ),
  )[0] ?? null;

const buildDocumentHubNodes = ({ fileBuckets, documents }) => {
  const nodeReadiness = DOCUMENT_HUB_NODES.reduce((readiness, node) => {
    const latestDocument = node.documentType
      ? getLatestHubDocument(documents, node.documentType)
      : null;
    const latestArtifact = node.artifactType
      ? getLatestGeneratedArtifact(fileBuckets, node.artifactType)
      : null;
    readiness[node.id] = Boolean(latestDocument || latestArtifact);
    return readiness;
  }, {});

  return DOCUMENT_HUB_NODES.map((node) => {
    const latestDocument = node.documentType
      ? getLatestHubDocument(documents, node.documentType)
      : null;
    const latestArtifact = node.artifactType
      ? getLatestGeneratedArtifact(fileBuckets, node.artifactType)
      : null;
    const isReady = Boolean(latestDocument || latestArtifact);
    const requiredNodeIds = node.requiredNodeIds ?? [];
    const missingRequiredNodes = requiredNodeIds
      .map((nodeId) => DOCUMENT_HUB_NODE_BY_ID[nodeId])
      .filter((requiredNode) => requiredNode && !nodeReadiness[requiredNode.id]);
    const hasRequiredDocuments = missingRequiredNodes.length === 0;
    const isGeneratable = Boolean(node.requestType && !isReady && hasRequiredDocuments);
    let statusLabel = "대기중";
    let statusTone = "waiting";
    let actionLabel = "";

    if (node.kind === "source") {
      statusLabel = isReady ? "준비됨" : "업로드 필요";
      statusTone = isReady ? "ready" : "blocked";
      actionLabel = "요구사항명세서 생성하기";
    } else if (node.kind === "optional") {
      statusLabel = isReady ? "선택 자료 있음" : "대기중";
      statusTone = isReady ? "optional" : "waiting";
      actionLabel = "요구사항명세서에 반영";
    } else if (isReady) {
      statusLabel = "생성 완료";
      statusTone = "completed";
      actionLabel = "다시 생성";
    } else if (isGeneratable) {
      statusLabel = "생성 가능";
      statusTone = "generatable";
      actionLabel = "생성하기";
    } else {
      statusLabel = "기준 문서 필요";
      statusTone = "blocked";
      actionLabel = missingRequiredNodes[0]
        ? `${missingRequiredNodes[0].label} 생성하기`
        : "기준 문서 확인";
    }

    return {
      ...node,
      latestDocument,
      latestArtifact,
      isReady,
      isGeneratable,
      missingRequiredNodes,
      statusLabel,
      statusTone,
      actionLabel,
      nextNodes: (node.nextNodeIds ?? [])
        .map((nodeId) => DOCUMENT_HUB_NODE_BY_ID[nodeId])
        .filter(Boolean),
    };
  });
};

const buildDocumentHubChoiceRequest = ({ requestType, documents }) => {
  const documentConfig = getRequiredDocumentConfig(requestType);
  if (!documentConfig) return null;
  const matchingDocuments = getMatchingDocuments(documents, documentConfig);
  const optionalDocuments = (documentConfig.optionalSources ?? [])
    .flatMap((source) =>
      getMatchingDocuments(documents, {
        documentTypes: [source.documentType],
        keywords: source.keywords ?? [],
      }),
    )
    .filter(
      (document) =>
        !matchingDocuments.some(
          (primaryDocument) =>
            primaryDocument.documentId === document.documentId,
        ),
    );

  return {
    originalMessage: `${documentConfig.targetLabel} 생성해줘`,
    documentConfig: {
      ...documentConfig,
      panelTitle: `${documentConfig.targetLabel} 생성`,
      actionLabel: `${documentConfig.targetLabel} 생성`,
    },
    documents: matchingDocuments,
    optionalDocuments: uniqueDocumentsById(optionalDocuments),
    defaultDocumentId: matchingDocuments[0]?.documentId || "",
    defaultOptionalDocumentIds: uniqueDocumentsById(optionalDocuments)
      .map((document) => document.documentId)
      .filter(Boolean),
    outputFormats: documentConfig.outputFormats,
    outputFormat: documentConfig.defaultOutputFormat,
  };
};

const padDatePart = (value) => String(value).padStart(2, "0");

const getTodayIsoDate = () => {
  const today = new Date();
  return [
    today.getFullYear(),
    padDatePart(today.getMonth() + 1),
    padDatePart(today.getDate()),
  ].join("-");
};

const parseIsoDate = (dateText = getTodayIsoDate()) => {
  const normalizedDate = normalizeTodoDueDate(dateText, { defaultToday: true });
  const [year, month, day] = normalizedDate.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const formatIsoDate = (dateValue = new Date()) =>
  [
    dateValue.getFullYear(),
    padDatePart(dateValue.getMonth() + 1),
    padDatePart(dateValue.getDate()),
  ].join("-");

const addDaysToIsoDate = (dateText = getTodayIsoDate(), offset = 0) => {
  const dateValue = parseIsoDate(dateText);
  dateValue.setDate(dateValue.getDate() + offset);
  return formatIsoDate(dateValue);
};

const buildIsoDate = (year, month, day) => {
  const dateValue = new Date(year, month - 1, day);
  if (
    dateValue.getFullYear() !== year ||
    dateValue.getMonth() !== month - 1 ||
    dateValue.getDate() !== day
  ) {
    return "";
  }
  return [year, padDatePart(month), padDatePart(day)].join("-");
};

const normalizeTodoDueDate = (value, { defaultToday = false } = {}) => {
  const text = String(value ?? "").trim();
  if (!text) return defaultToday ? getTodayIsoDate() : "";
  if (["NONE", "NULL", "TBD", "N/A", "NA", "미정"].includes(text.toUpperCase())) {
    return defaultToday ? getTodayIsoDate() : "";
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return buildIsoDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const yearFirstMatch = text.match(
    /(\d{4})\s*(?:[./-]|년)\s*(\d{1,2})\s*(?:[./-]|월)\s*(\d{1,2})/,
  );
  if (yearFirstMatch) {
    return buildIsoDate(
      Number(yearFirstMatch[1]),
      Number(yearFirstMatch[2]),
      Number(yearFirstMatch[3]),
    );
  }

  const yearlessMatch = text.match(
    /(?:^|\D)(\d{1,2})\s*(?:[./-]|월)\s*(\d{1,2})\s*(?:일)?(?:\D|$)/,
  );
  if (yearlessMatch) {
    return buildIsoDate(
      new Date().getFullYear(),
      Number(yearlessMatch[1]),
      Number(yearlessMatch[2]),
    );
  }

  return defaultToday ? getTodayIsoDate() : "";
};

const getTodoDeadlineDate = (todo = {}) =>
  normalizeTodoDueDate(
    todo.due_date ??
      todo.dueDate ??
      todo.due_date_text ??
      todo.dueDateText ??
      todo.end_date ??
      todo.endDate ??
      todo.planned_end ??
      todo.plannedEnd ??
      todo.planned_end_date ??
      todo.plannedEndDate,
    { defaultToday: false },
  );

const getTodoSourceValue = (todo = {}) =>
  String(
    todo.source_type ??
      todo.sourceType ??
      todo.origin ??
      todo.related_document_type ??
      todo.relatedDocumentType ??
      todo.document_type ??
      todo.documentType ??
      todo.source_document_type ??
      todo.sourceDocumentType ??
      todo.raw?.source_type ??
      todo.raw?.sourceType ??
      "",
  ).toUpperCase();

const getTodoSourceKind = (todo = {}) => {
  const source = getTodoSourceValue(todo);
  if (source.includes("WBS")) return "wbs";
  if (
    source.includes("MEETING") ||
    source.includes("MINUTES") ||
    source.includes("NEGOTIATION")
  ) {
    return "meeting";
  }
  if (source.includes("MANUAL") || source.includes("DIRECT")) return "manual";
  return "unknown";
};

const getTodoSourcePriority = (todo = {}) => {
  const sourceKind = getTodoSourceKind(todo);
  if (sourceKind === "wbs") return 1;
  if (sourceKind === "meeting") return 2;
  if (sourceKind === "manual") return 3;
  return 4;
};

const getTodoSourceFilterValue = (todo = {}) => {
  const sourceKind = getTodoSourceKind(todo);
  if (sourceKind === "wbs") return "WBS";
  if (sourceKind === "meeting") return "MEETING_NOTES";
  if (sourceKind === "manual") return "MANUAL";
  return "UNKNOWN";
};

const getTodoSourceLabel = (todo = {}) => {
  const sourceKind = getTodoSourceKind(todo);
  if (sourceKind === "wbs") return "WBS";
  if (sourceKind === "meeting") return "회의록";
  if (sourceKind === "manual") return "직접";
  return "기타";
};

const getTodoDeadlineDiffDays = (todo = {}) => {
  const deadline = getTodoDeadlineDate(todo);
  if (!deadline) return null;
  return Math.round((parseIsoDate(deadline) - parseIsoDate(getTodayIsoDate())) / 86400000);
};

const getTodoDeadlineSortGroup = (todo = {}) => {
  const diffDays = getTodoDeadlineDiffDays(todo);
  if (diffDays === null) return 1;
  return diffDays < 0 ? 2 : 0;
};

const getTodoDdayLabel = (todo = {}) => {
  const diffDays = getTodoDeadlineDiffDays(todo);
  if (diffDays === null) return "";
  if (diffDays === 0) return "D-Day";
  return diffDays > 0 ? `D-${diffDays}` : "마감 지남";
};

const getTodoSummaryDeadlineLabel = (todo = {}) =>
  getTodoDdayLabel(todo) || "마감 미정";

const isTodoDeadlineSoon = (todo = {}) => {
  const diffDays = getTodoDeadlineDiffDays(todo);
  return diffDays !== null && diffDays >= 0 && diffDays <= 14;
};

const isTodoOverdue = (todo = {}) => {
  const diffDays = getTodoDeadlineDiffDays(todo);
  return diffDays !== null && diffDays < 0;
};

const getTodoScheduleClassNames = (todo = {}) =>
  [
    `is-source-${getTodoSourceKind(todo)}`,
    isTodoDeadlineSoon(todo) ? "is-deadline-soon" : "",
    isTodoOverdue(todo) ? "is-overdue" : "",
  ]
    .filter(Boolean)
    .join(" ");

const formatTodoDeadlineWithDday = (todo = {}) => {
  const deadline = getTodoDeadlineDate(todo) || formatScheduleRangeLabel(todo);
  const ddayLabel = getTodoDdayLabel(todo);
  return ddayLabel ? `${deadline} · ${ddayLabel}` : deadline;
};

const compareTodosForSchedule = (left = {}, right = {}) => {
  const leftSortGroup = getTodoDeadlineSortGroup(left);
  const rightSortGroup = getTodoDeadlineSortGroup(right);
  if (leftSortGroup !== rightSortGroup) return leftSortGroup - rightSortGroup;

  const leftDeadline = getTodoDeadlineDate(left);
  const rightDeadline = getTodoDeadlineDate(right);

  if (
    leftSortGroup === 0 &&
    leftDeadline &&
    rightDeadline &&
    leftDeadline !== rightDeadline
  ) {
    return leftDeadline.localeCompare(rightDeadline);
  }

  const sourceDiff = getTodoSourcePriority(left) - getTodoSourcePriority(right);
  if (sourceDiff !== 0) return sourceDiff;

  if (leftDeadline && rightDeadline && leftDeadline !== rightDeadline) {
    return leftDeadline.localeCompare(rightDeadline);
  }

  return String(left.title || "").localeCompare(String(right.title || ""), "ko");
};

const getMonthKeyFromDate = (dateValue = new Date()) =>
  `${dateValue.getFullYear()}-${padDatePart(dateValue.getMonth() + 1)}`;

const getMonthKeyFromIsoDate = (dateText = getTodayIsoDate()) => {
  const normalizedDate = normalizeTodoDueDate(dateText, { defaultToday: true });
  return normalizedDate.slice(0, 7);
};

const addMonthsToMonthKey = (monthKey, offset) => {
  const [year, month] = String(monthKey || getMonthKeyFromDate())
    .split("-")
    .map(Number);
  const dateValue = new Date(year, (month || 1) - 1 + offset, 1);
  return getMonthKeyFromDate(dateValue);
};

const formatMonthLabel = (monthKey = getMonthKeyFromDate()) => {
  const [year, month] = String(monthKey).split("-");
  return `${year}년 ${Number(month)}월`;
};

const formatWeekLabel = (dateText = getTodayIsoDate()) => {
  const normalizedDate = normalizeTodoDueDate(dateText, { defaultToday: true });
  const [year, month, day] = normalizedDate.split("-").map(Number);
  const firstDate = new Date(year, (month || 1) - 1, 1);
  const leadingDays = (firstDate.getDay() + 6) % 7;
  const weekNumber = Math.floor(((day || 1) + leadingDays - 1) / 7) + 1;
  return `${year}년 ${Number(month)}월 ${weekNumber}주차`;
};

const formatWeekdayHeader = (dateText = getTodayIsoDate()) => {
  const dateValue = parseIsoDate(dateText);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][dateValue.getDay()];
  return `${dateValue.getMonth() + 1}/${dateValue.getDate()}(${weekday})`;
};

const formatDateLabel = (dateText = "") => {
  const normalizedDate = normalizeTodoDueDate(dateText);
  if (!normalizedDate) return "날짜 미정";
  const [year, month, day] = normalizedDate.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
};

const getCalendarWeeks = (monthKey = getMonthKeyFromDate()) => {
  const [year, month] = String(monthKey).split("-").map(Number);
  const firstDate = new Date(year, (month || 1) - 1, 1);
  const cells = [];
  const leadingDays = firstDate.getDay();
  const totalCells = 42;

  for (let index = 0; index < totalCells; index += 1) {
    const dayOffset = index - leadingDays + 1;
    const dateValue = new Date(year, (month || 1) - 1, dayOffset);
    const dateText = [
      dateValue.getFullYear(),
      padDatePart(dateValue.getMonth() + 1),
      padDatePart(dateValue.getDate()),
    ].join("-");
    cells.push({
      dateText,
      day: dateValue.getDate(),
      isCurrentMonth: dateValue.getMonth() === (month || 1) - 1,
    });
  }

  return Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  ).filter((week) => week.some((cell) => cell.isCurrentMonth));
};

const getCalendarWeek = (dateText = getTodayIsoDate()) => {
  const anchorDate = parseIsoDate(dateText);
  const startDate = new Date(anchorDate);
  startDate.setDate(anchorDate.getDate() - ((anchorDate.getDay() + 6) % 7));
  const anchorMonth = anchorDate.getMonth();

  return Array.from({ length: 7 }, (_, index) => {
    const dateValue = new Date(startDate);
    dateValue.setDate(startDate.getDate() + index);
    return {
      dateText: formatIsoDate(dateValue),
      day: dateValue.getDate(),
      month: dateValue.getMonth() + 1,
      isCurrentMonth: dateValue.getMonth() === anchorMonth,
    };
  });
};

const getTodoScheduleRange = (todo = {}) => {
  const dueDate = getTodoDeadlineDate(todo);
  let startDate = normalizeTodoDueDate(
    todo.startDate ||
      todo.start_date ||
      todo.planned_start ||
      todo.plannedStartDate ||
      todo.planned_start_date,
  );
  let endDate = normalizeTodoDueDate(
    todo.endDate ||
      todo.end_date ||
      todo.planned_end ||
      todo.plannedEndDate ||
      todo.planned_end_date,
  );

  if (!startDate && !endDate && dueDate) {
    startDate = dueDate;
    endDate = dueDate;
  } else if (startDate && !endDate) {
    endDate = startDate;
  } else if (endDate && !startDate) {
    startDate = endDate;
  }

  if (!startDate || !endDate) return null;
  if (endDate < startDate) {
    return { startDate: endDate, endDate: startDate };
  }
  return { startDate, endDate };
};

const isDateInTodoScheduleRange = (todo, dateText) => {
  const range = getTodoScheduleRange(todo);
  return Boolean(range && range.startDate <= dateText && dateText <= range.endDate);
};

const formatScheduleRangeLabel = (todo = {}) => {
  const range = getTodoScheduleRange(todo);
  if (!range) return "기한 미정";
  if (range.startDate === range.endDate) return range.endDate;
  return `${range.startDate} ~ ${range.endDate}`;
};

const getWeekScheduleSegments = (week = [], todos = [], maxRows = 3) => {
  const weekStart = week[0]?.dateText;
  const weekEnd = week[6]?.dateText;
  if (!weekStart || !weekEnd) return { visibleSegments: [], hiddenCount: 0 };

  const segments = todos
    .map((todo) => {
      const range = getTodoScheduleRange(todo);
      if (!range || range.endDate < weekStart || range.startDate > weekEnd) {
        return null;
      }
      const segmentStart = range.startDate < weekStart ? weekStart : range.startDate;
      const segmentEnd = range.endDate > weekEnd ? weekEnd : range.endDate;
      const startIndex = week.findIndex((cell) => cell.dateText === segmentStart);
      const endIndex = week.findIndex((cell) => cell.dateText === segmentEnd);
      if (startIndex < 0 || endIndex < 0) return null;
      return {
        todo,
        range,
        segmentStart,
        segmentEnd,
        startCol: startIndex + 1,
        endCol: endIndex + 1,
        duration: endIndex - startIndex + 1,
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.startCol - right.startCol ||
        compareTodosForSchedule(left.todo, right.todo) ||
        right.duration - left.duration ||
        String(left.todo.title || "").localeCompare(String(right.todo.title || "")),
    );

  const laneEndColumns = [];
  const visibleSegments = [];
  let hiddenCount = 0;

  segments.forEach((segment) => {
    let lane = laneEndColumns.findIndex((endCol) => segment.startCol > endCol);
    if (lane < 0) lane = laneEndColumns.length;
    if (lane >= maxRows) {
      hiddenCount += 1;
      return;
    }
    laneEndColumns[lane] = segment.endCol;
    visibleSegments.push({ ...segment, lane });
  });

  return { visibleSegments, hiddenCount };
};

const normalizeTodo = (item = {}) => {
  const todoId =
    item.todo_id ??
    item.todoId ??
    item.id ??
    item.client_import_id ??
    item.clientImportId ??
    "";
  const sourceType =
    item.source_type ??
    item.sourceType ??
    item.origin ??
    item.related_document_type ??
    item.relatedDocumentType ??
    item.document_type ??
    item.documentType ??
    item.source_document_type ??
    item.sourceDocumentType ??
    "";
  const dueDate = getTodoDeadlineDate(item);
  const normalizedRange = getTodoScheduleRange({
    startDate:
      item.start_date ??
      item.startDate ??
      item.planned_start_date ??
      item.plannedStartDate,
    endDate:
      item.end_date ??
      item.endDate ??
      item.planned_end_date ??
      item.plannedEndDate,
    dueDate,
  });
  return {
    todoId,
    clientImportId:
      item.client_import_id ?? item.clientImportId ?? (todoId ? `IMPORT-${todoId}` : ""),
    title: item.title ?? "",
    assignee: item.assignee ?? "",
    startDate: normalizedRange?.startDate || "",
    endDate: normalizedRange?.endDate || "",
    dueDate: normalizedRange?.endDate || dueDate,
    dueDateText: normalizedRange?.endDate || dueDate,
    status: item.status ?? "NOT_STARTED",
    sourceType,
    sourceDocumentId: item.source_document_id ?? item.sourceDocumentId ?? "",
    sourceDocumentName:
      item.source_document_name ?? item.sourceDocumentName ?? item.related_document ?? "",
    description: item.description ?? "",
    sourceSentence: item.source_sentence ?? item.sourceSentence ?? "",
    createdAt: item.created_at ?? item.createdAt ?? "",
    updatedAt: item.updated_at ?? item.updatedAt ?? "",
    raw: item,
  };
};

const normalizeTodoListResponse = (response) => {
  const items =
    (Array.isArray(response) && response) ||
    response?.items ||
    response?.todos ||
    response?.result?.items ||
    response?.result?.todos ||
    [];
  return (Array.isArray(items) ? items : [])
    .map(normalizeTodo)
    .filter((item) => item.todoId || item.title)
    .sort(compareTodosForSchedule);
};

const hasScheduleTodoTarget = (normalized = "") =>
  normalized.includes("할일") ||
  normalized.includes("해야할일") ||
  normalized.includes("액션아이템") ||
  normalized.includes("후속작업") ||
  normalized.includes("업무") ||
  normalized.includes("일정") ||
  normalized.includes("마감") ||
  normalized.includes("기한") ||
  normalized.includes("todo") ||
  normalized.includes("schedule");

const hasScheduleReadOnlySignal = (normalized = "") =>
  normalized.includes("알려") ||
  normalized.includes("보여") ||
  normalized.includes("조회") ||
  normalized.includes("확인") ||
  normalized.includes("목록") ||
  normalized.includes("뭐") ||
  normalized.includes("어떤") ||
  normalized.includes("있") ||
  normalized.includes("오늘") ||
  normalized.includes("내일") ||
  normalized.includes("이번주") ||
  normalized.includes("다음주") ||
  normalized.includes("차주") ||
  normalized.includes("마감임박") ||
  normalized.includes("임박") ||
  normalized.includes("미완료") ||
  normalized.includes("완료안") ||
  normalized.includes("wbs") ||
  normalized.includes("회의록") ||
  normalized.includes("미팅");

const isScheduleTodoMutationRequest = (value = "") => {
  const normalized = normalizeCommandText(value);
  if (!hasScheduleTodoTarget(normalized)) return false;

  return (
    normalized.includes("추출") ||
    normalized.includes("뽑") ||
    normalized.includes("등록") ||
    normalized.includes("추가") ||
    normalized.includes("생성") ||
    normalized.includes("만들") ||
    normalized.includes("수정") ||
    normalized.includes("변경") ||
    normalized.includes("바꿔") ||
    normalized.includes("삭제") ||
    normalized.includes("지워") ||
    normalized.includes("제거") ||
    normalized.includes("완료처리") ||
    normalized.includes("완료해") ||
    normalized.includes("완료로") ||
    normalized.includes("체크해") ||
    normalized.includes("체크")
  );
};

const isScheduleTodoReadOnlyQuery = (value = "") => {
  const normalized = normalizeCommandText(value);
  return (
    hasScheduleTodoTarget(normalized) &&
    hasScheduleReadOnlySignal(normalized) &&
    !isScheduleTodoMutationRequest(value)
  );
};

const getWeekRangeFromIsoDate = (dateText = getTodayIsoDate(), weekOffset = 0) => {
  const dateValue = parseIsoDate(dateText);
  const mondayOffset = (dateValue.getDay() + 6) % 7;
  dateValue.setDate(dateValue.getDate() - mondayOffset + weekOffset * 7);
  const startDate = formatIsoDate(dateValue);
  dateValue.setDate(dateValue.getDate() + 6);
  return { startDate, endDate: formatIsoDate(dateValue) };
};

const isTodoCompleted = (todo = {}) =>
  ["DONE", "COMPLETED"].includes(String(todo.status || "").toUpperCase());

const getTodoQueryRange = (todo = {}) => {
  const range = getTodoScheduleRange(todo);
  const deadline = getTodoDeadlineDate(todo);
  const startDate = range?.startDate || deadline || "";
  const endDate = range?.endDate || deadline || startDate;
  return startDate ? { startDate, endDate } : null;
};

const isTodoInDateRange = (todo = {}, startDate = "", endDate = "") => {
  const todoRange = getTodoQueryRange(todo);
  if (!todoRange) return false;
  return todoRange.startDate <= endDate && todoRange.endDate >= startDate;
};

const getScheduleChatAssignee = (messageText = "", todos = []) => {
  const normalized = normalizeCommandText(messageText);
  const assignees = Array.from(
    new Set(
      todos
        .map((todo) => sanitizeTodoText(todo.assignee))
        .filter(Boolean),
    ),
  ).sort((left, right) => right.length - left.length);
  return assignees.find((assignee) =>
    normalized.includes(normalizeCommandText(assignee)),
  ) || "";
};

const getScheduleChatQuery = (messageText = "", todos = []) => {
  const normalized = normalizeCommandText(messageText);
  const today = getTodayIsoDate();
  const query = {
    dateRange: null,
    deadlineSoon: false,
    overdueOnly: false,
    incompleteOnly: false,
    completedOnly: false,
    sourceKind: "",
    assignee: getScheduleChatAssignee(messageText, todos),
    label: "일정/할일",
  };

  if (normalized.includes("오늘")) {
    query.dateRange = { startDate: today, endDate: today };
    query.label = "오늘 할일";
  } else if (normalized.includes("내일")) {
    const tomorrow = addDaysToIsoDate(today, 1);
    query.dateRange = { startDate: tomorrow, endDate: tomorrow };
    query.label = "내일 할일";
  } else if (normalized.includes("다음주") || normalized.includes("차주")) {
    query.dateRange = getWeekRangeFromIsoDate(today, 1);
    query.label = "다음 주 일정";
  } else if (normalized.includes("이번주")) {
    query.dateRange = getWeekRangeFromIsoDate(today, 0);
    query.label = "이번 주 일정";
  }

  if (normalized.includes("마감임박") || normalized.includes("임박")) {
    query.deadlineSoon = true;
    query.label = "마감 임박 할일";
  }
  if (normalized.includes("기한지난") || normalized.includes("지난할일") || normalized.includes("overdue")) {
    query.overdueOnly = true;
    query.label = "기한 지난 할일";
  }
  if (
    normalized.includes("미완료") ||
    normalized.includes("완료안") ||
    normalized.includes("남은") ||
    normalized.includes("진행중")
  ) {
    query.incompleteOnly = true;
  }
  if (
    !query.incompleteOnly &&
    (normalized.includes("완료된") || normalized.includes("완료한"))
  ) {
    query.completedOnly = true;
  }
  if (normalized.includes("wbs")) {
    query.sourceKind = "wbs";
  } else if (normalized.includes("회의록") || normalized.includes("미팅")) {
    query.sourceKind = "meeting";
  }

  const prefixes = [];
  if (query.assignee) prefixes.push(`${query.assignee} 담당`);
  if (query.sourceKind === "wbs") prefixes.push("WBS 기반");
  if (query.sourceKind === "meeting") prefixes.push("회의록 기반");
  if (prefixes.length) {
    query.label = `${prefixes.join(" ")} ${query.label}`;
  }

  return query;
};

const filterScheduleChatTodos = (todos = [], query = {}) =>
  todos
    .filter((todo) => {
      if (query.dateRange && !isTodoInDateRange(todo, query.dateRange.startDate, query.dateRange.endDate)) {
        return false;
      }
      if (query.deadlineSoon && !isTodoDeadlineSoon(todo)) return false;
      if (query.overdueOnly && !isTodoOverdue(todo)) return false;
      if (query.incompleteOnly && isTodoCompleted(todo)) return false;
      if (query.completedOnly && !isTodoCompleted(todo)) return false;
      if (query.sourceKind && getTodoSourceKind(todo) !== query.sourceKind) {
        return false;
      }
      if (
        query.assignee &&
        normalizeCommandText(todo.assignee) !== normalizeCommandText(query.assignee)
      ) {
        return false;
      }
      return true;
    })
    .sort(compareTodosForSchedule);

const buildScheduleChatResponseContent = (query = {}, todos = []) => {
  if (!todos.length) {
    return `${query.label || "일정/할일"}이 없습니다. 등록이나 수정은 왼쪽 [프로젝트 일정] 또는 [할일 관리]에서 진행해 주세요.`;
  }
  return `${query.label || "일정/할일"}은 ${todos.length}건입니다. 아래 목록에서 마감일, D-Day, 출처를 확인해 주세요. 상세 수정은 왼쪽 [프로젝트 일정] 또는 [할일 관리]에서 진행해 주세요.`;
};

const TODO_MUTATION_BLOCK_MESSAGE =
  "할일 등록/수정/삭제/완료 처리와 회의록/WBS 기반 할일 추출은 왼쪽 [프로젝트 일정] 또는 [할일 관리]에서 진행해 주세요. 챗봇에서는 일정 조회만 지원합니다.";

const normalizeTodoImportPreview = (response) => {
  const newItems = Array.isArray(response?.new_items)
    ? response.new_items
    : response?.newItems ?? [];
  const duplicateItems = Array.isArray(response?.duplicate_items)
    ? response.duplicate_items
    : response?.duplicateItems ?? [];
  return {
    newItems: (Array.isArray(newItems) ? newItems : []).map(normalizeTodo),
    duplicateItems: (Array.isArray(duplicateItems) ? duplicateItems : []).map(
      (item) => ({
        candidate: normalizeTodo(item.candidate ?? {}),
        matchedExisting: normalizeTodo(
          item.matched_existing ?? item.matchedExisting ?? {},
        ),
        duplicateLevel:
          item.duplicate_level ?? item.duplicateLevel ?? "DUPLICATE_POSSIBLE",
      }),
    ),
  };
};

const toTodoImportPayload = (item) => {
  const raw = item.raw ?? {};
  const range = getTodoScheduleRange(item);
  return {
    todo_id: item.todoId || item.clientImportId || raw.todo_id || "",
    client_import_id: item.clientImportId || raw.client_import_id || item.todoId,
    title: item.title,
    assignee: item.assignee || null,
    start_date: range?.startDate || null,
    end_date: range?.endDate || null,
    due_date: range?.endDate || null,
    status: item.status || "NOT_STARTED",
    source_type: item.sourceType,
    source_document_id: item.sourceDocumentId || null,
    source_document_name: item.sourceDocumentName || null,
    description: item.description || null,
    source_sentence: item.sourceSentence || null,
  };
};

const getTodoImportDocuments = (fileBuckets = {}) => {
  const uploadedDocuments = (fileBuckets.uploaded ?? []).map((file) => ({
    documentId: file.fileId,
    fileName: file.fileName,
    documentType: file.documentType,
    createdAt: file.uploadedAt,
    updatedAt: file.raw?.updated_at ?? file.raw?.updatedAt ?? "",
    displayLabel: file.documentLabel || getDocumentDisplayLabel(file.documentType),
  }));
  const generatedDocuments = (fileBuckets.generated ?? [])
    .map((file) => {
      if (!file.generatedDocumentId) return null;
      const documentType =
        ARTIFACT_SOURCE_DOCUMENT_TYPES[file.artifactType] ?? DOCUMENT_TYPES.UNKNOWN;
      return {
        documentId: file.generatedDocumentId,
        fileName: file.fileName,
        documentType,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        displayLabel: getDocumentDisplayLabel(documentType),
      };
    })
    .filter(Boolean);
  return sortDocumentsByLatest(
    uniqueDocumentsById([...uploadedDocuments, ...generatedDocuments]).filter(
      (document) =>
        document.documentId &&
        [DOCUMENT_TYPES.MEETING_NOTES, DOCUMENT_TYPES.WBS].includes(
          document.documentType,
        ),
    ),
  );
};

const compactText = (value = "") =>
  String(value)
    .replace(/\s+/g, "")
    .toLowerCase();

const getDocumentSearchText = (document) =>
  compactText(
    [
      document.documentType,
      document.fileName,
      document.displayLabel,
      document.documentId,
    ].join(" "),
  );

const getMatchingDocuments = (documents, config) =>
  sortDocumentsByLatest(documents.filter((document) => {
    const documentType = document.documentType ?? "";
    if (config.documentTypes?.includes(documentType)) return true;

    const searchText = getDocumentSearchText(document);
    return (config.keywords ?? []).some((keyword) =>
      searchText.includes(compactText(keyword)),
    );
  }));

const uniqueDocumentsById = (documents = []) => {
  const seen = new Set();
  return documents.filter((document) => {
    const documentId = document?.documentId;
    if (!documentId || seen.has(documentId)) return false;
    seen.add(documentId);
    return true;
  });
};

const normalizeDocumentIds = (documentIds = []) =>
  Array.from(new Set(documentIds.filter(Boolean)));

const getUploadResumeDocuments = (uploadRequest, uploadedDocument) => {
  const beforeDocuments = Array.isArray(uploadRequest?.resumeDocumentsBefore)
    ? uploadRequest.resumeDocumentsBefore
    : [];
  const afterDocuments = Array.isArray(uploadRequest?.resumeDocumentsAfter)
    ? uploadRequest.resumeDocumentsAfter
    : [];

  if (beforeDocuments.length || afterDocuments.length) {
    return uniqueDocumentsById([
      ...beforeDocuments,
      uploadedDocument,
      ...afterDocuments,
    ]);
  }

  return [uploadedDocument];
};

const getRequiredDocumentConfig = (requestType) => {
  const relation = getRelation(requestType);
  if (!relation || requestType === GENERATION_REQUEST_TYPES.WBS_REFERENCE) {
    return null;
  }
  const outputFormats = getOutputFormats(relation);
  const missingMessage = getGenerationAssistantMessage({
    requestType,
    relation,
    hasPrimaryDocument: false,
  });
  const existingMessage = getGenerationAssistantMessage({
    requestType,
    relation,
    hasPrimaryDocument: true,
  });

  return {
    requestType,
    relation,
    targetArtifactType: relation.targetArtifactType,
    targetLabel: relation.targetLabel,
    primarySource: relation.primarySource,
    optionalSources: relation.optionalSources ?? [],
    outputFormats,
    defaultOutputFormat: getDefaultOutputFormat(relation),
    message: missingMessage,
    existingMessage,
    label: `${relation.primarySource.label} 업로드`,
    documentTypes: [relation.primarySource.documentType],
    keywords: relation.primarySource.keywords ?? [],
    documentType: relation.primarySource.documentType,
    optionalDocumentTypes: (relation.optionalSources ?? []).map(
      (source) => source.documentType,
    ),
    optionalKeywords: (relation.optionalSources ?? []).flatMap(
      (source) => source.keywords ?? [],
    ),
    commandActions: [],
  };
};

const getDocumentContextConfig = (requestType) => {
  if (requestType === DOCUMENT_CONTEXT_REQUEST_TYPES.MEETING_TODO_EXTRACTION) {
    return MEETING_TODO_DOCUMENT_CONFIG;
  }
  return getRequiredDocumentConfig(requestType);
};

const getGenerationTargetInfo = (requestType = "") => {
  const documentConfig = getDocumentContextConfig(requestType);
  const relation = getRelation(requestType);
  return {
    requestType,
    targetArtifactType:
      documentConfig?.targetArtifactType || relation?.targetArtifactType || "",
    targetDocumentLabel:
      documentConfig?.targetLabel || relation?.targetLabel || "문서",
  };
};

const normalizeDownloadFile = (file = {}) => ({
  ...file,
  artifact_id:
    file.artifact_id ?? file.artifactId ?? file.file_id ?? file.fileId ?? "",
  file_name:
    file.file_name ?? file.fileName ?? file.name ?? file.original_file_name ?? "",
});

const getGenerationDownloadFiles = (statusResponse = {}) => {
  const downloadFileLists = [
    statusResponse.download_files,
    statusResponse.downloadFiles,
    statusResponse.result?.download_files,
    statusResponse.result?.downloadFiles,
  ];
  const files = downloadFileLists.find(Array.isArray) ?? [];
  return files.map(normalizeDownloadFile).filter((file) => file.artifact_id);
};

const getProjectStartDate = (project) =>
  project?.projectStartDate ?? project?.start_date ?? project?.startDate ?? "";

const getProjectAuthor = (project) =>
  String(
    project?.author ||
      project?.documentAuthor ||
      project?.document_author ||
      project?.writer ||
      project?.createdBy ||
      project?.created_by ||
      project?.userName ||
      project?.userId ||
      project?.user_id ||
      "",
  ).trim();

const sanitizeProjectStartDateInput = (value = "") => {
  const text = String(value ?? "");
  const [year = "", month = "", day = ""] = text.split("-");
  const safeYear = year.replace(/\D/g, "").slice(0, 4);
  const safeMonth = month.replace(/\D/g, "").slice(0, 2);
  const safeDay = day.replace(/\D/g, "").slice(0, 2);
  return [safeYear, safeMonth, safeDay]
    .filter((part, index) => part || index === 0)
    .join("-")
    .slice(0, 10);
};

const isValidProjectStartDate = (value = "") => {
  const text = String(value ?? "").trim();
  if (!text) return true;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const buildProjectContext = (
  targetProject,
  documents = [],
  { includeDocumentIdAliases = false, extraContext = {} } = {},
) => {
  const selectedDocuments = documents.filter(Boolean);
  const selectedDocumentIds = selectedDocuments
    .map((document) => document.documentId)
    .filter(Boolean);
  const author = getProjectAuthor(targetProject);
  const writer = String(targetProject?.writer || author || "").trim();
  const createdBy = String(
    targetProject?.createdBy ?? targetProject?.created_by ?? "",
  ).trim();
  const userId = String(
    targetProject?.userId ?? targetProject?.user_id ?? "",
  ).trim();
  const createdByValue = createdBy || author;
  const userIdValue = userId || createdByValue;

  const context = {
    selected_document_ids: selectedDocumentIds,
    selected_documents: selectedDocuments.map(toDocumentContext),
    source_document_type: selectedDocuments[0]?.documentType,
    project_name: targetProject.projectName || "",
    author,
    writer,
    created_by: createdByValue,
    user_id: userIdValue,
    project: {
      project_id: targetProject.projectId,
      name: targetProject.projectName || "",
      start_date: getProjectStartDate(targetProject),
      end_date: targetProject.projectEndDate || "",
      author,
      writer,
      created_by: createdByValue,
      user_id: userIdValue,
    },
  };

  if (includeDocumentIdAliases) {
    const requirementDefinitionDocument = selectedDocuments.find(
      (document) => document.documentType === DEFAULT_DOCUMENT_TYPE,
    );
    const technicalNegotiationMinutesDocuments = selectedDocuments.filter(
      (document) => document.documentType === DOCUMENT_TYPES.MEETING_NOTES,
    );
    const technicalNegotiationMinutesDocumentIds =
      technicalNegotiationMinutesDocuments
        .map((document) => document.documentId)
        .filter(Boolean);

    context.source_document_ids = selectedDocumentIds;
    context.document_ids = selectedDocumentIds;
    context.requirement_definition_document_id =
      requirementDefinitionDocument?.documentId ?? null;
    context.technical_negotiation_minutes_document_ids =
      technicalNegotiationMinutesDocumentIds;
    context.technical_negotiation_minutes_document_id =
      technicalNegotiationMinutesDocumentIds[0] ?? null;
  }

  return {
    ...context,
    ...extraContext,
  };
};

const sanitizeTodoText = (value = "") =>
  String(value ?? "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();

const truncateTodoText = (value = "", maxLength = 90) => {
  const text = sanitizeTodoText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
};

const buildGenerationProgress = (progress, status = "RUNNING") => {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const activeIndex = GENERATION_PROGRESS_STEPS.findIndex(
    (step) => safeProgress <= step.progress,
  );
  const runningIndex =
    safeProgress >= 100
      ? GENERATION_PROGRESS_STEPS.length
      : activeIndex === -1
      ? GENERATION_PROGRESS_STEPS.length - 1
      : activeIndex;

  return {
    progress: safeProgress,
    steps: GENERATION_PROGRESS_STEPS.map((step, index) => {
      if (safeProgress >= 100 || index < runningIndex) {
        return {
          ...step,
          name: step.completedName || step.name,
          status: "COMPLETED",
        };
      }
      if (index === runningIndex) {
        return { ...step, status };
      }
      return { ...step, status: "WAITING" };
    }),
  };
};

const getGenerationStepIndex = (progress) => {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const activeIndex = GENERATION_PROGRESS_STEPS.findIndex(
    (step) => safeProgress <= step.progress,
  );
  if (safeProgress >= 100) return GENERATION_PROGRESS_STEPS.length - 1;
  return activeIndex === -1
    ? GENERATION_PROGRESS_STEPS.length - 2
    : Math.max(0, activeIndex);
};

const getGenerationStepIndexFromStatus = (statusResponse, fallbackProgress) => {
  const stageIndex = getGenerationStageStepIndex(statusResponse);
  if (stageIndex !== null) return stageIndex;

  return getGenerationStepIndex(fallbackProgress);
};

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const normalizedValue =
    typeof value === "string" ? value.trim().replace(/\s*%$/, "") : value;
  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const toProgressPercent = (value) => {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null) return null;
  return Math.max(0, Math.min(100, numericValue));
};

const formatProgressCount = (value) => {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null) return "";
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(1);
};

const hasPercentNumberText = (value = "") =>
  /\d+(?:\.\d+)?\s*%/.test(String(value));

const getGenerationProgressDisplayText = (generationProgress) => {
  const progressText = String(
    generationProgress?.progress_text ?? "",
  ).trim();
  if (progressText && !hasPercentNumberText(progressText)) {
    return progressText;
  }

  const current = toFiniteNumber(generationProgress?.current);
  const total = toFiniteNumber(generationProgress?.total);
  if (current !== null && total !== null && total > 0) {
    return `${formatProgressCount(current)}/${formatProgressCount(total)}`;
  }

  return "";
};

const getGenerationProgressValue = (
  generationProgress,
  fallbackProgress = GENERATION_PROGRESS_INITIAL_VALUE,
) => {
  const explicitProgress = toProgressPercent(generationProgress?.progress);
  if (explicitProgress !== null) return explicitProgress;

  const current = toFiniteNumber(generationProgress?.current);
  const total = toFiniteNumber(generationProgress?.total);
  if (current !== null && total !== null && total > 0) {
    return Math.max(0, Math.min(100, (current / total) * 100));
  }

  return fallbackProgress;
};

const buildGenerationProgressFromStatus = (
  statusResponse,
  status = "RUNNING",
  fallbackProgress,
) => {
  const generationProgress = getGenerationProgressPayload(statusResponse);
  const normalizedProgress = normalizeGenerationProgressPayload(
    generationProgress,
    fallbackProgress,
  );
  const progress = normalizedProgress.progress;

  return {
    ...buildGenerationProgress(progress, status),
    stage: normalizedProgress.stage,
    displayText:
      normalizedProgress.displayText ||
      getGenerationProgressDisplayText(generationProgress),
    label: GENERATION_PROGRESS_LABEL,
    rawProgress: generationProgress,
    subProgressItems: normalizedProgress.subProgressItems,
    largeDocumentHint: normalizedProgress.largeDocumentHint,
  };
};

const createGenerationPollingCancelledError = () => {
  const error = new Error("진행 상태 확인이 중단되었습니다.");
  error.name = GENERATION_POLL_CANCELLED_ERROR;
  return error;
};

const isGenerationPollingCancelledError = (error) =>
  error?.name === GENERATION_POLL_CANCELLED_ERROR;

const getGenerationFriendlyErrorMessage = (error) => {
  const errorText = String(error?.message ?? error ?? "").toLowerCase();
  if (
    errorText.includes("failed to fetch") ||
    errorText.includes("network") ||
    errorText.includes("load failed") ||
    errorText.includes("err_connection")
  ) {
    return "서버와 연결이 불안정해 진행 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (
    errorText.includes("timeout") ||
    errorText.includes("timed out") ||
    errorText.includes("polling timed out")
  ) {
    return "요구사항명세서 생성 시간이 예상보다 길어지고 있습니다. 잠시 후 다시 확인해주세요.";
  }

  return "요구사항명세서 생성 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
};

const buildGenerationFailureProgress = (failedIndex, sourceProgress = null) => {
  const boundedFailedIndex = Math.max(
    0,
    Math.min(failedIndex, GENERATION_PROGRESS_STEPS.length - 2),
  );
  const failedStep = GENERATION_PROGRESS_STEPS[boundedFailedIndex];

  return {
    progress: sourceProgress?.progress ?? failedStep.progress,
    displayText: sourceProgress?.displayText || "생성 실패",
    label: sourceProgress?.label || GENERATION_PROGRESS_LABEL,
    rawProgress: sourceProgress?.rawProgress ?? null,
    subProgressItems: sourceProgress?.subProgressItems ?? [],
    largeDocumentHint: sourceProgress?.largeDocumentHint ?? false,
    steps: GENERATION_PROGRESS_STEPS.map((step, index) => {
      if (index < boundedFailedIndex) {
        return {
          ...step,
          name: step.completedName || step.name,
          status: "COMPLETED",
        };
      }
      if (index === boundedFailedIndex) {
        return {
          ...step,
          name: `${step.name.replace(/ 중$/, "")} 중 오류 발생`,
          message:
            "이 단계에서 문제가 발생했습니다. 문서를 확인한 뒤 다시 시도해주세요.",
          status: "FAILED",
        };
      }
      return { ...step, status: "WAITING" };
    }),
  };
};

const wait = (delay) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delay);
  });

const stripProgressPercentPrefix = (value = "") =>
  String(value).replace(/^\s*\d+%\s*/, "");

const getInitialActiveConversationId = (loadedProject) => {
  const savedConversationId = getActiveConversationId(loadedProject.projectId);
  const hasSavedConversation = loadedProject.conversations.some(
    (conversation) => conversation.conversationId === savedConversationId,
  );

  return hasSavedConversation
    ? savedConversationId
    : loadedProject.conversations[0]?.conversationId ?? "";
};

const PROJECT_ROUTE_PREFIX = "/projects/";

const getProjectPath = (projectId) =>
  `${PROJECT_ROUTE_PREFIX}${encodeURIComponent(String(projectId ?? ""))}`;

const getProjectIdFromPathname = (pathname = "") => {
  if (!pathname.startsWith(PROJECT_ROUTE_PREFIX)) return "";

  const encodedProjectId = pathname
    .slice(PROJECT_ROUTE_PREFIX.length)
    .split("/")[0];
  if (!encodedProjectId) return "";

  try {
    return decodeURIComponent(encodedProjectId);
  } catch {
    return encodedProjectId;
  }
};

const getCurrentRouteProjectId = () => {
  if (typeof window === "undefined") return "";
  return getProjectIdFromPathname(window.location.pathname);
};

const syncProjectRoute = (projectId, { replace = false } = {}) => {
  const normalizedProjectId = String(projectId ?? "").trim();
  if (typeof window === "undefined" || !normalizedProjectId) return;

  const nextPath = getProjectPath(normalizedProjectId);
  if (window.location.pathname === nextPath) return;

  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", nextPath);
};

const syncEntryRoute = () => {
  if (typeof window === "undefined" || window.location.pathname === "/") return;
  window.history.pushState({}, "", "/");
};

function App() {
  const [entryProjectId, setEntryProjectId] = useState("");
  const [entryError, setEntryError] = useState("");
  const [pendingNewProjectId, setPendingNewProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectStartDate, setNewProjectStartDate] = useState(getTodayIsoDate());
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectError, setNewProjectError] = useState("");
  const [project, setProject] = useState(null);
  const [activeConversationId, setActiveConversationIdState] = useState("");
  const [composerValue, setComposerValue] = useState("");
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [isChatPopupOpen, setIsChatPopupOpen] = useState(false);
  const [selectedDocumentHubNodeId, setSelectedDocumentHubNodeId] = useState(
    DOCUMENT_HUB_DEFAULT_NODE_ID,
  );
  const [isDocumentGenerationModalOpen, setIsDocumentGenerationModalOpen] =
    useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsStartDate, setSettingsStartDate] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState("");
  const [editingConversationTitle, setEditingConversationTitle] = useState("");
  const [deletingConversationId, setDeletingConversationId] = useState("");
  const [conversationActionError, setConversationActionError] = useState("");
  const [commandRecommendations, setCommandRecommendations] = useState([]);
  const [lastCommandInfo, setLastCommandInfo] = useState(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [documentError, setDocumentError] = useState("");
  const [documentStatusMessage, setDocumentStatusMessage] = useState("");
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(null);
  const [generationJob, setGenerationJob] = useState(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [isProgressMinimized, setIsProgressMinimized] = useState(false);
  const isProgressMinimizedRef = useRef(false);
  const setProgressMinimizedState = (nextValue) => {
    isProgressMinimizedRef.current = nextValue;
    setIsProgressMinimized(nextValue);
  };
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [fileBuckets, setFileBuckets] = useState({ uploaded: [], generated: [] });
  const [activeFileManagerTab, setActiveFileManagerTab] = useState(
    FILE_MANAGER_TABS.UPLOADED,
  );
  const [isLoadingUploadedFiles, setIsLoadingUploadedFiles] = useState(false);
  const [fileManagerError, setFileManagerError] = useState("");
  const [fileActionError, setFileActionError] = useState("");
  const [pendingDeleteFile, setPendingDeleteFile] = useState(null);
  const [deletingFileId, setDeletingFileId] = useState("");
  const [downloadingFileId, setDownloadingFileId] = useState("");
  const [editingFileTarget, setEditingFileTarget] = useState(null);
  const [renamingFileKey, setRenamingFileKey] = useState("");
  const [fileNameDraft, setFileNameDraft] = useState("");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState(
    WORKSPACE_TABS.DOCUMENTS,
  );
  const [scheduleMonth, setScheduleMonth] = useState(() =>
    getMonthKeyFromIsoDate(getTodayIsoDate()),
  );
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(getTodayIsoDate());
  const [calendarViewMode, setCalendarViewMode] = useState(
    CALENDAR_VIEW_MODES.MONTH,
  );
  const [isScheduleDayModalOpen, setIsScheduleDayModalOpen] = useState(false);
  const [isScheduleRegistrationOpen, setIsScheduleRegistrationOpen] =
    useState(false);
  const [scheduleRegistrationMode, setScheduleRegistrationMode] = useState(
    SCHEDULE_REGISTRATION_MODES.MANUAL,
  );
  const [scheduleDraft, setScheduleDraft] = useState({
    title: "",
    assignee: "",
    startDate: getTodayIsoDate(),
    endDate: getTodayIsoDate(),
    status: "NOT_STARTED",
    description: "",
  });
  const [isTodoManagerOpen, setIsTodoManagerOpen] = useState(false);
  const [todoItems, setTodoItems] = useState([]);
  const [todoStatusFilter, setTodoStatusFilter] = useState("");
  const [todoSourceFilter, setTodoSourceFilter] = useState("");
  const [todoTitleFilter, setTodoTitleFilter] = useState("");
  const [todoAssigneeFilter, setTodoAssigneeFilter] = useState("");
  const [todoDateFilter, setTodoDateFilter] = useState("");
  const [isLoadingTodos, setIsLoadingTodos] = useState(false);
  const [todoError, setTodoError] = useState("");
  const [todoActionError, setTodoActionError] = useState("");
  const [savingTodoId, setSavingTodoId] = useState("");
  const [selectedTodoIds, setSelectedTodoIds] = useState([]);
  const [bulkTodoStatus, setBulkTodoStatus] = useState("IN_PROGRESS");
  const [isBulkTodoActionRunning, setIsBulkTodoActionRunning] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState("");
  const [todoEditDraft, setTodoEditDraft] = useState({
    title: "",
    assignee: "",
    startDate: "",
    endDate: "",
    dueDate: "",
    description: "",
    status: "NOT_STARTED",
  });
  const [isTodoImportOpen, setIsTodoImportOpen] = useState(false);
  const [isChatMaximized, setIsChatMaximized] = useState(false);
  const [todoImportDocumentType, setTodoImportDocumentType] = useState(
    DOCUMENT_TYPES.MEETING_NOTES,
  );
  const [todoImportUseExisting, setTodoImportUseExisting] = useState(true);
  const [todoImportDocumentId, setTodoImportDocumentId] = useState("");
  const [todoImportFile, setTodoImportFile] = useState(null);
  const [todoImportStatusMessage, setTodoImportStatusMessage] = useState("");
  const [isUploadingTodoImportDocument, setIsUploadingTodoImportDocument] =
    useState(false);
  const [isPreviewingTodoImport, setIsPreviewingTodoImport] = useState(false);
  const [isCommittingTodoImport, setIsCommittingTodoImport] = useState(false);
  const [todoImportPreview, setTodoImportPreview] = useState(null);
  const [selectedTodoImportIds, setSelectedTodoImportIds] = useState([]);
  const scrollRef = useRef(null);
  const pollingTimerRef = useRef(null);
  const pollingRejectRef = useRef(null);
  const pollingRunIdRef = useRef(0);
  const progressStepIndexRef = useRef(0);

  const conversations = project?.conversations ?? [];
  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.conversationId === activeConversationId,
      ) ?? null,
    [activeConversationId, conversations],
  );
  const activeMessages = activeConversation?.messages ?? [];
  const documentHubDocuments = useMemo(
    () => getDocumentHubCandidates(fileBuckets),
    [fileBuckets],
  );
  const documentHubNodes = useMemo(
    () =>
      buildDocumentHubNodes({
        fileBuckets,
        documents: documentHubDocuments,
      }),
    [documentHubDocuments, fileBuckets],
  );
  const selectedDocumentHubNode =
    documentHubNodes.find((node) => node.id === selectedDocumentHubNodeId) ??
    documentHubNodes.find((node) => node.id === DOCUMENT_HUB_DEFAULT_NODE_ID) ??
    documentHubNodes[0];
  const selectedDocumentHubRequest = useMemo(
    () =>
      selectedDocumentHubNode?.requestType
        ? buildDocumentHubChoiceRequest({
            requestType: selectedDocumentHubNode.requestType,
            documents: documentHubDocuments,
          })
        : null,
    [documentHubDocuments, selectedDocumentHubNode],
  );
  const todoImportDocuments = useMemo(
    () => getTodoImportDocuments(fileBuckets),
    [fileBuckets],
  );
  const filteredTodoImportDocuments = useMemo(
    () =>
      todoImportDocuments.filter(
        (document) => document.documentType === todoImportDocumentType,
      ),
    [todoImportDocuments, todoImportDocumentType],
  );
  const selectedScheduleTodos = useMemo(
    () =>
      todoItems.filter((todo) =>
        isDateInTodoScheduleRange(todo, selectedScheduleDate),
      ).sort(compareTodosForSchedule),
    [selectedScheduleDate, todoItems],
  );

  useEffect(() => {
    if (activeWorkspaceTab !== WORKSPACE_TABS.SCHEDULE) return;
    if (!project?.projectId) return;
    loadTodos({ status: "" });
    loadUploadedFiles(project);
  }, [activeWorkspaceTab, project?.projectId]);

  useEffect(() => {
    if (!isTodoImportOpen || !todoImportUseExisting) return;
    const hasSelectedDocument = filteredTodoImportDocuments.some(
      (document) => document.documentId === todoImportDocumentId,
    );
    if (!hasSelectedDocument) {
      setTodoImportDocumentId(filteredTodoImportDocuments[0]?.documentId || "");
    }
  }, [
    filteredTodoImportDocuments,
    isTodoImportOpen,
    todoImportDocumentId,
    todoImportUseExisting,
  ]);

  const resetFileManagerState = ({ resetBuckets = true } = {}) => {
    setIsFileManagerOpen(false);
    if (resetBuckets) {
      setFileBuckets({ uploaded: [], generated: [] });
    }
    setIsLoadingUploadedFiles(false);
    setFileManagerError("");
    setFileActionError("");
    setPendingDeleteFile(null);
    setDeletingFileId("");
    setDownloadingFileId("");
    setEditingFileTarget(null);
    setRenamingFileKey("");
    setFileNameDraft("");
  };

  const resetTodoManagerState = () => {
    setIsTodoManagerOpen(false);
    setTodoItems([]);
    setTodoStatusFilter("");
    setTodoSourceFilter("");
    setIsLoadingTodos(false);
    setTodoError("");
    setTodoActionError("");
    setSavingTodoId("");
    setEditingTodoId("");
    setTodoEditDraft({
      title: "",
      assignee: "",
      startDate: "",
      endDate: "",
      dueDate: "",
      description: "",
      status: "NOT_STARTED",
    });
    setIsTodoImportOpen(false);
    setTodoImportDocumentType(DOCUMENT_TYPES.MEETING_NOTES);
    setTodoImportUseExisting(true);
    setTodoImportDocumentId("");
    setTodoImportFile(null);
    setTodoImportStatusMessage("");
    setIsUploadingTodoImportDocument(false);
    setIsPreviewingTodoImport(false);
    setIsCommittingTodoImport(false);
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
  };

  const clearGenerationPolling = ({ rejectPending = false } = {}) => {
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (rejectPending && pollingRejectRef.current) {
      pollingRejectRef.current(createGenerationPollingCancelledError());
    }
    pollingRejectRef.current = null;
    pollingRunIdRef.current += 1;
  };

  const resetGenerationState = () => {
    clearGenerationPolling({ rejectPending: true });
    setGenerationProgress(null);
    setGenerationJob(null);
    setIsProgressModalOpen(false);
    setProgressMinimizedState(false);
    setSelectedDocumentIds([]);
    setDocumentStatusMessage("");
  };

  const startGenerationProgress = (requestType = "") => {
    clearGenerationPolling({ rejectPending: true });
    progressStepIndexRef.current = 0;
    const initialProgress = {
      ...buildGenerationProgress(GENERATION_PROGRESS_INITIAL_VALUE),
      displayText: "",
      label: GENERATION_PROGRESS_LABEL,
    };
    const targetInfo = getGenerationTargetInfo(requestType);
    setGenerationProgress(initialProgress);
    setGenerationJob({
      ...targetInfo,
      actionId: "",
      status: GENERATION_JOB_STATUS.RUNNING,
      progressState: initialProgress,
      downloadFiles: [],
      errorMessage: "",
    });
    setIsDocumentGenerationModalOpen(false);
    setIsProgressModalOpen(true);
    setProgressMinimizedState(false);
  };

  const completeGenerationProgress = (statusResponse = null, requestType = "") => {
    clearGenerationPolling();
    const sourceProgress = statusResponse
      ? buildGenerationProgressFromStatus(statusResponse, "COMPLETED", 100)
      : null;
    const completedProgress = {
      ...buildGenerationProgress(100, "COMPLETED"),
      displayText: "완료",
      label: `${
        getGenerationTargetInfo(requestType).targetDocumentLabel
      } 생성 완료`,
      rawProgress: sourceProgress?.rawProgress ?? null,
      subProgressItems: sourceProgress?.subProgressItems ?? [],
      largeDocumentHint: sourceProgress?.largeDocumentHint ?? false,
    };
    const downloadFiles = getGenerationDownloadFiles(statusResponse ?? {});
    setGenerationProgress(completedProgress);
    setGenerationJob((currentJob) => ({
      ...(currentJob ?? getGenerationTargetInfo(requestType)),
      status: GENERATION_JOB_STATUS.COMPLETED,
      progressState: completedProgress,
      downloadFiles,
      errorMessage: "",
    }));
    if (isProgressMinimizedRef.current) {
      setIsProgressModalOpen(false);
      setProgressMinimizedState(true);
    } else {
      setIsProgressModalOpen(true);
      setProgressMinimizedState(false);
    }
    return completedProgress;
  };

  const failGenerationProgress = (statusResponse = null, requestType = "") => {
    clearGenerationPolling();
    const sourceProgress = statusResponse
      ? buildGenerationProgressFromStatus(
          statusResponse,
          "FAILED",
          generationProgress?.progress ?? GENERATION_PROGRESS_INITIAL_VALUE,
        )
      : null;
    if (statusResponse) {
      progressStepIndexRef.current = getGenerationStepIndexFromStatus(
        statusResponse,
        sourceProgress?.progress ?? GENERATION_PROGRESS_INITIAL_VALUE,
      );
    } else if (sourceProgress) {
      progressStepIndexRef.current = getGenerationStepIndex(sourceProgress.progress);
    }
    const failedProgress = buildGenerationFailureProgress(
      progressStepIndexRef.current,
      sourceProgress,
    );
    setGenerationProgress(failedProgress);
    setGenerationJob((currentJob) => ({
      ...(currentJob ?? getGenerationTargetInfo(requestType)),
      status: GENERATION_JOB_STATUS.FAILED,
      progressState: failedProgress,
      downloadFiles: [],
      errorMessage:
        statusResponse?.message ||
        "문서 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    }));
    setIsProgressModalOpen(true);
    setProgressMinimizedState(false);
    return failedProgress;
  };

  const updateGenerationProgressFromStatus = (statusResponse) => {
    setGenerationProgress((currentProgressState) => {
      const nextProgress = buildGenerationProgressFromStatus(
        statusResponse,
        "RUNNING",
        currentProgressState?.progress ?? GENERATION_PROGRESS_INITIAL_VALUE,
      );
      progressStepIndexRef.current = getGenerationStepIndex(
        nextProgress.progress,
      );
      setGenerationJob((currentJob) =>
        currentJob
          ? {
              ...currentJob,
              status: GENERATION_JOB_STATUS.RUNNING,
              progressState: nextProgress,
              errorMessage: "",
            }
          : currentJob,
      );
      return nextProgress;
    });
  };

  const pollGenerationActionStatus = ({ projectId, actionId }) =>
    new Promise((resolve, reject) => {
      if (!projectId || !actionId) {
        reject(new Error("진행 상태를 확인할 작업 ID를 찾지 못했습니다."));
        return;
      }

      clearGenerationPolling({ rejectPending: true });

      const runId = pollingRunIdRef.current;
      let pollCount = 0;
      let isPolling = false;

      const stopPolling = () => {
        if (pollingTimerRef.current) {
          window.clearInterval(pollingTimerRef.current);
          pollingTimerRef.current = null;
        }
        pollingRejectRef.current = null;
      };

      const resolvePolling = (statusResponse) => {
        stopPolling();
        resolve(statusResponse);
      };

      const rejectPolling = (error) => {
        stopPolling();
        reject(error);
      };

      const pollOnce = async () => {
        if (isPolling || pollingRunIdRef.current !== runId) return;
        isPolling = true;
        pollCount += 1;

        try {
          const statusResponse = await getChatActionStatus({
            projectId,
            actionId,
          });

          if (pollingRunIdRef.current !== runId) return;

          if (statusResponse?.status === GENERATION_ACTION_STATUS.EXECUTING) {
            updateGenerationProgressFromStatus(statusResponse);
          }

          if (
            statusResponse?.status === GENERATION_ACTION_STATUS.EXECUTED ||
            statusResponse?.status === GENERATION_ACTION_STATUS.FAILED ||
            statusResponse?.status === GENERATION_ACTION_STATUS.CANCELLED
          ) {
            resolvePolling(statusResponse);
            return;
          }

          if (pollCount >= GENERATION_JOB_MAX_POLLS) {
            rejectPolling(
              new Error("Generation job status polling timed out."),
            );
          }
        } catch (error) {
          if (pollingRunIdRef.current === runId) {
            rejectPolling(error);
          }
        } finally {
          isPolling = false;
        }
      };

      pollingRejectRef.current = rejectPolling;
      pollingTimerRef.current = window.setInterval(
        pollOnce,
        GENERATION_JOB_POLL_INTERVAL_MS,
      );
      pollOnce();
    });

  const resolveGenerationStartedAssistantMessage = async (
    assistantMessage,
    { projectId, requestType },
  ) => {
    if (!getRequiredDocumentConfig(requestType)) {
      return assistantMessage;
    }

    const pollingActionId = getAssistantActionId(assistantMessage);
    if (!pollingActionId) {
      const failedProgress = failGenerationProgress({
        status: GENERATION_ACTION_STATUS.FAILED,
        message: "문서 생성 진행 상태를 확인할 작업 ID가 없습니다.",
      }, requestType);
      return {
        ...assistantMessage,
        content:
          "문서 생성 요청은 전달됐지만 진행 상태를 확인하지 못했습니다. 다시 시도해주세요.",
        metadata: {
          ...assistantMessage.metadata,
          state: CHAT_STATES.FAILED,
          generationProgress: failedProgress,
          pendingAction: null,
          suggestedActions: [],
        },
      };
    }
    setGenerationJob((currentJob) =>
      currentJob ? { ...currentJob, actionId: pollingActionId } : currentJob,
    );

    if (assistantMessage.metadata?.state === CHAT_STATES.FAILED) {
      const failedProgress = failGenerationProgress(null, requestType);
      return {
        ...assistantMessage,
        metadata: {
          ...assistantMessage.metadata,
          actionId: pollingActionId,
          generationProgress: failedProgress,
          pendingAction: null,
          suggestedActions: [],
        },
      };
    }

    const statusResponse = await pollGenerationActionStatus({
      projectId,
      actionId: pollingActionId,
    });
    if (
      statusResponse.status === GENERATION_ACTION_STATUS.FAILED ||
      statusResponse.status === GENERATION_ACTION_STATUS.CANCELLED
    ) {
      const failedProgress = failGenerationProgress(statusResponse, requestType);
      return {
        ...assistantMessage,
        content:
          statusResponse.message ||
          "문서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
        metadata: {
          ...assistantMessage.metadata,
          state: CHAT_STATES.FAILED,
          actionId: pollingActionId,
          generationProgress: failedProgress,
          result: statusResponse.result ?? {},
          downloadFiles: [],
          pendingAction: null,
          suggestedActions: [],
          rawResponse: statusResponse,
        },
      };
    }

    const completedProgress = completeGenerationProgress(statusResponse, requestType);
    return {
      ...assistantMessage,
      content: statusResponse.message || assistantMessage.content,
      metadata: {
        ...assistantMessage.metadata,
        state: statusResponse.state ?? CHAT_STATES.COMPLETED,
        actionId: pollingActionId,
        generationProgress: completedProgress,
        result: statusResponse.result ?? {},
        downloadFiles: Array.isArray(statusResponse.download_files)
          ? statusResponse.download_files
          : [],
        pendingAction: null,
        suggestedActions: [],
        rawResponse: statusResponse,
      },
    };
  };

  const clearMessageActions = async ({ conversationId, message }) => {
    if (!project || !conversationId || !message?.id) return null;

    const result = await updateConversationMessage(
      project.projectId,
      conversationId,
      message.id,
      (currentMessage) => ({
        ...currentMessage,
        metadata: {
          ...(currentMessage.metadata ?? {}),
          actionResolved: true,
          uploadRequest: null,
          documentChoiceRequest: null,
          pendingAction: null,
          suggestedActions: [],
          commandActions: [],
        },
      }),
    );
    setProject(result.project);
    return result.project;
  };

  const enterProject = useCallback(
    (loadedProject, { replaceHistory = false } = {}) => {
      const nextActiveConversationId = getInitialActiveConversationId(
        loadedProject,
      );

      setProject(loadedProject);
      setActiveConversationIdState(nextActiveConversationId);
      setComposerValue("");
      setEntryProjectId(loadedProject.projectId);
      setPendingNewProjectId("");
      setNewProjectName("");
      setNewProjectStartDate(getTodayIsoDate());
      setNewProjectDescription("");
      setNewProjectError("");
      setConversationActionError("");
      setDeletingConversationId("");
      setLastCommandInfo(null);
      setSelectedDocumentIds([]);
      setSelectedDocumentHubNodeId(DOCUMENT_HUB_DEFAULT_NODE_ID);
      setIsDocumentGenerationModalOpen(false);
      setIsChatPopupOpen(false);
      setDocumentError("");
      setDocumentStatusMessage("");
      resetFileManagerState();
      resetTodoManagerState();
      resetGenerationState();
      setRecentProjectId(loadedProject.projectId);
      syncProjectRoute(loadedProject.projectId, { replace: replaceHistory });

      if (nextActiveConversationId) {
        setActiveConversationId(
          loadedProject.projectId,
          nextActiveConversationId,
        );
      }
    },
    [],
  );

  const lookupProject = useCallback(
    async (projectId, { replaceHistory = false } = {}) => {
      const nextProjectId = projectId.trim();

      if (!nextProjectId) {
        setEntryError("프로젝트 ID를 입력해주세요.");
        setPendingNewProjectId("");
        return;
      }

      setIsLoadingProject(true);
      setEntryError("");
      setNewProjectError("");

      try {
        const loadedProject = await getProjectById(nextProjectId);

        if (loadedProject) {
          enterProject(loadedProject, { replaceHistory });
          return;
        }

        setPendingNewProjectId(nextProjectId);
        setNewProjectName("");
        setNewProjectStartDate(getTodayIsoDate());
        setNewProjectDescription("");
      } catch (error) {
        reportUiError("lookupProject", error, { projectId: nextProjectId });
        setEntryError(
          error instanceof Error
            ? error.message
            : "프로젝트 데이터를 확인하지 못했습니다.",
        );
      } finally {
        setIsLoadingProject(false);
      }
    },
    [enterProject],
  );

  useEffect(() => {
    const routeProjectId = getCurrentRouteProjectId();
    if (routeProjectId) {
      setEntryProjectId(routeProjectId);
      lookupProject(routeProjectId, { replaceHistory: true });
      return;
    }

    const recentProjectId = getRecentProjectId();
    if (recentProjectId) {
      setEntryProjectId(recentProjectId);
    }
  }, [lookupProject]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    activeConversationId,
    activeMessages.length,
    generationProgress?.displayText,
    generationProgress?.progress,
    isResponding,
  ]);

  useEffect(
    () => () => {
      clearGenerationPolling({ rejectPending: true });
    },
    [],
  );

  useEffect(() => {
    if (!isSidebarDrawerOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsSidebarDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarDrawerOpen]);

  useEffect(() => {
    let shouldIgnore = false;

    if (!project) {
      setCommandRecommendations([]);
      return () => {
        shouldIgnore = true;
      };
    }

    getCommandRecommendations(
      project.projectId,
      activeConversationId,
      lastCommandInfo,
    )
      .then((recommendations) => {
        if (!shouldIgnore) {
          setCommandRecommendations(recommendations);
        }
      })
      .catch(() => {
        if (!shouldIgnore) {
          setCommandRecommendations([]);
        }
      });

    return () => {
      shouldIgnore = true;
    };
  }, [project, activeConversationId, lastCommandInfo]);

  const handleEntryProjectIdChange = (value) => {
    setEntryProjectId(value);
    setEntryError("");

    if (pendingNewProjectId && value.trim() !== pendingNewProjectId) {
      setPendingNewProjectId("");
      setNewProjectName("");
      setNewProjectStartDate(getTodayIsoDate());
      setNewProjectDescription("");
      setNewProjectError("");
    }
  };

  const handleEntrySubmit = (event) => {
    event.preventDefault();
    lookupProject(entryProjectId);
  };

  const handleCreateProject = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedProjectName = String(formData.get("projectName") ?? "");
    const submittedProjectStartDate = String(
      formData.get("start_date") ?? "",
    );
    const submittedProjectDescription = String(
      formData.get("projectDescription") ?? "",
    );

    if (!submittedProjectName.trim()) {
      setNewProjectError("프로젝트명을 입력해주세요.");
      return;
    }
    if (!isValidProjectStartDate(submittedProjectStartDate)) {
      setNewProjectError(PROJECT_START_DATE_ERROR);
      return;
    }

    setIsCreatingProject(true);
    setNewProjectError("");

    try {
      const createdProject = await createProject(
        pendingNewProjectId,
        submittedProjectName,
        submittedProjectDescription,
        submittedProjectStartDate,
      );
      if (!createdProject?.projectId) {
        throw new Error(PROJECT_CREATE_RESPONSE_ERROR_MESSAGE);
      }
      enterProject(createdProject);
    } catch (error) {
      reportUiError("handleCreateProject", error, {
        projectId: pendingNewProjectId,
        projectName: submittedProjectName,
      });
      setNewProjectError(
        error instanceof Error
          ? error.message
          : "신규 프로젝트를 생성하지 못했습니다.",
      );
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleNewChat = () => {
    if (!project) return;

    setActiveConversationIdState("");
    setActiveConversationId(project.projectId, "");
    setComposerValue("");
    setConversationActionError("");
    setEditingConversationId("");
    setEditingConversationTitle("");
    setDeletingConversationId("");
    setLastCommandInfo(null);
    setSelectedDocumentIds([]);
    setIsDocumentGenerationModalOpen(false);
    setIsChatPopupOpen(true);
    setDocumentError("");
    setDocumentStatusMessage("");
    setIsSidebarDrawerOpen(false);
  };

  const handleSelectConversation = (conversationId) => {
    if (!project) return;
    if (conversationId === activeConversationId) {
      setIsSidebarDrawerOpen(false);
      return;
    }

    setActiveConversationIdState(conversationId);
    setActiveConversationId(project.projectId, conversationId);
    setComposerValue("");
    setConversationActionError("");
    setDeletingConversationId("");
    setLastCommandInfo(null);
    setSelectedDocumentIds([]);
    setIsDocumentGenerationModalOpen(false);
    setIsChatPopupOpen(true);
    setDocumentError("");
    setDocumentStatusMessage("");
    setIsSidebarDrawerOpen(false);
  };

  const loadProjectDocuments = async (projectId) => {
    try {
      const response = await listProjectFiles(projectId);
      const candidates = normalizeProjectDocumentCandidates(response);
      if (candidates.length) {
        return candidates;
      }
      return normalizeDocumentListResponse(response);
    } catch {
      return [];
    }
  };

  const loadUploadedFiles = async (targetProject = project) => {
    if (!targetProject?.projectId) {
      setFileBuckets({ uploaded: [], generated: [] });
      setFileManagerError("프로젝트를 먼저 선택해주세요.");
      return;
    }

    setIsLoadingUploadedFiles(true);
    setFileManagerError("");
    setFileActionError("");

    try {
      const response = await listProjectFiles(targetProject.projectId);
      setFileBuckets(normalizeProjectFileBuckets(response));
    } catch {
      setFileBuckets({ uploaded: [], generated: [] });
      setFileManagerError(
        "파일 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setIsLoadingUploadedFiles(false);
    }
  };

  const openFileManager = () => {
    setIsFileManagerOpen(true);
    setActiveFileManagerTab(FILE_MANAGER_TABS.UPLOADED);
    setPendingDeleteFile(null);
    setEditingFileTarget(null);
    setFileNameDraft("");
    if (!project) {
      setFileBuckets({ uploaded: [], generated: [] });
      setFileManagerError("프로젝트를 먼저 선택해주세요.");
      return;
    }
    loadUploadedFiles(project);
  };

  const closeFileManager = () => {
    setIsFileManagerOpen(false);
    setFileActionError("");
    setPendingDeleteFile(null);
    setEditingFileTarget(null);
    setFileNameDraft("");
  };

  useEffect(() => {
    if (!project?.projectId) {
      setFileBuckets({ uploaded: [], generated: [] });
      return;
    }
    loadUploadedFiles(project);
  }, [project?.projectId]);

  const handleDownloadUploadedFile = async (file) => {
    if (!project?.projectId) {
      setFileActionError("프로젝트를 먼저 선택해주세요.");
      return;
    }
    if (!file?.fileId) {
      setFileActionError("다운로드할 파일 정보를 확인하지 못했습니다.");
      return;
    }

    setDownloadingFileId(getFileActionKey(file, FILE_KINDS.UPLOADED));
    setFileActionError("");

    try {
      await downloadProjectFile({
        projectId: project.projectId,
        fileId: file.fileId,
        fileName: file.fileName,
      });
    } catch {
      setFileActionError("파일 다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloadingFileId("");
    }
  };

  const handleRequestDeleteUploadedFile = (file) => {
    setPendingDeleteFile({ ...file, fileKind: FILE_KINDS.UPLOADED });
    setFileActionError("");
  };

  const handleRequestDeleteGeneratedFile = (file) => {
    setPendingDeleteFile({ ...file, fileKind: FILE_KINDS.GENERATED });
    setFileActionError("");
  };

  const handleCancelDeleteUploadedFile = () => {
    setPendingDeleteFile(null);
    setFileActionError("");
  };

  const handleConfirmDeleteFile = async () => {
    if (!project?.projectId) {
      setFileActionError("프로젝트를 먼저 선택해주세요.");
      return;
    }
    if (!pendingDeleteFile?.fileId) {
      setFileActionError("삭제할 파일 정보를 확인하지 못했습니다.");
      return;
    }

    const fileKind = pendingDeleteFile.fileKind || FILE_KINDS.UPLOADED;
    setDeletingFileId(getFileActionKey(pendingDeleteFile, fileKind));
    setFileActionError("");

    try {
      if (fileKind === FILE_KINDS.GENERATED) {
        await deleteArtifactFile({
          projectId: project.projectId,
          artifactId: pendingDeleteFile.fileId,
        });
      } else {
        await deleteProjectFile({
          projectId: project.projectId,
          fileId: pendingDeleteFile.fileId,
        });
      }
      setFileBuckets((currentBuckets) => ({
        ...currentBuckets,
        [fileKind]: currentBuckets[fileKind].filter(
          (file) => file.fileId !== pendingDeleteFile.fileId,
        ),
      }));
      setPendingDeleteFile(null);
    } catch {
      setFileActionError("파일 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingFileId("");
    }
  };

  const handleDownloadGeneratedFile = async (file) => {
    if (!project?.projectId) {
      setFileActionError("프로젝트를 먼저 선택해주세요.");
      return;
    }
    if (!file?.fileId) {
      setFileActionError("다운로드할 생성 파일 정보를 확인하지 못했습니다.");
      return;
    }

    setDownloadingFileId(getFileActionKey(file, FILE_KINDS.GENERATED));
    setFileActionError("");

    try {
      await downloadArtifactFile({
        projectId: project.projectId,
        artifactId: file.fileId,
        fileName: file.fileName,
      });
    } catch {
      setFileActionError("생성 파일 다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloadingFileId("");
    }
  };

  const handleDownloadDocumentNodeArtifact = async (node) => {
    const latestArtifact = node?.latestArtifact;
    if (!project?.projectId || !latestArtifact?.fileId) {
      setDocumentError(
        "다운로드할 생성 파일을 찾을 수 없습니다. 파일 목록에서 다시 확인해 주세요.",
      );
      return;
    }

    setDocumentError("");
    try {
      await downloadArtifactFile({
        projectId: project.projectId,
        artifactId: latestArtifact.fileId,
        fileName: latestArtifact.fileName,
      });
    } catch (error) {
      reportUiError("handleDownloadDocumentNodeArtifact", error, {
        projectId: project?.projectId,
        artifactId: latestArtifact.fileId,
      });
      setDocumentError(
        error instanceof Error
          ? error.message
          : "다운로드할 생성 파일을 찾을 수 없습니다. 파일 목록에서 다시 확인해 주세요.",
      );
    }
  };

  const handleStartFileRename = (file, fileKind) => {
    setEditingFileTarget({ fileId: file.fileId, fileKind });
    setFileNameDraft(file.fileName || "");
    setFileActionError("");
  };

  const handleCancelFileRename = () => {
    setEditingFileTarget(null);
    setFileNameDraft("");
    setFileActionError("");
  };

  const handleSaveFileRename = async (file, fileKind) => {
    if (!project?.projectId || !file?.fileId) {
      setFileActionError("수정할 파일 정보를 확인하지 못했습니다.");
      return;
    }

    const nextFileName = fileNameDraft.trim();
    if (!nextFileName) {
      setFileActionError("파일명을 입력해주세요.");
      return;
    }

    setRenamingFileKey(getFileActionKey(file, fileKind));
    setFileActionError("");

    try {
      const updatedFile =
        fileKind === FILE_KINDS.GENERATED
          ? normalizeGeneratedFile(
              await updateArtifactFileName({
                projectId: project.projectId,
                artifactId: file.fileId,
                fileName: nextFileName,
              }),
            )
          : normalizeUploadedFile(
              await updateProjectFileName({
                projectId: project.projectId,
                fileId: file.fileId,
                fileName: nextFileName,
              }),
            );
      setFileBuckets((currentBuckets) => ({
        ...currentBuckets,
        [fileKind]: currentBuckets[fileKind].map((currentFile) =>
          currentFile.fileId === file.fileId ? updatedFile : currentFile,
        ),
      }));
      setEditingFileTarget(null);
      setFileNameDraft("");
    } catch (error) {
      setFileActionError(
        error instanceof Error
          ? error.message
          : "파일명을 수정하지 못했습니다.",
      );
    } finally {
      setRenamingFileKey("");
    }
  };

  const loadTodos = async ({ status = "" } = {}) => {
    if (!project?.projectId) {
      setTodoItems([]);
      setSelectedTodoIds([]);
      setTodoError("프로젝트를 먼저 선택해 주세요.");
      return;
    }

    setIsLoadingTodos(true);
    setTodoError("");
    try {
      const response = await listProjectTodos(project.projectId, {
        status,
      });
      const nextItems = normalizeTodoListResponse(response);
      const nextTodoIdSet = new Set(
        nextItems.map((item) => item.todoId).filter(Boolean),
      );
      setTodoItems(nextItems);
      setSelectedTodoIds((currentIds) =>
        currentIds.filter((todoId) => nextTodoIdSet.has(todoId)),
      );
    } catch (error) {
      setTodoItems([]);
      setSelectedTodoIds([]);
      setTodoError(
        error instanceof Error
          ? error.message
          : "할일 목록을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingTodos(false);
    }
  };

  const openTodoManager = () => {
    setIsTodoManagerOpen(true);
    setIsSidebarDrawerOpen(false);
    setTodoActionError("");
    setTodoError("");
    setIsTodoImportOpen(false);
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    setSelectedTodoIds([]);
    setBulkTodoStatus("IN_PROGRESS");
    setIsBulkTodoActionRunning(false);
    setTodoStatusFilter("");
    setTodoSourceFilter("");
    setTodoTitleFilter("");
    setTodoAssigneeFilter("");
    setTodoDateFilter("");
    if (!project?.projectId) {
      setTodoItems([]);
      setTodoError("프로젝트를 먼저 선택해 주세요.");
      return;
    }
    loadTodos({ status: "" });
    loadUploadedFiles(project);
  };

  const closeTodoManager = () => {
    setIsTodoManagerOpen(false);
    setTodoActionError("");
    setTodoError("");
    setEditingTodoId("");
    setSavingTodoId("");
    setSelectedTodoIds([]);
    setBulkTodoStatus("IN_PROGRESS");
    setIsBulkTodoActionRunning(false);
    setTodoStatusFilter("");
    setTodoSourceFilter("");
    setTodoTitleFilter("");
    setTodoAssigneeFilter("");
    setTodoDateFilter("");
    setIsTodoImportOpen(false);
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
  };

  const handleTodoStatusFilterChange = (value) => {
    setTodoStatusFilter(value);
    setSelectedTodoIds([]);
  };

  const handleTodoSourceFilterChange = (value) => {
    setTodoSourceFilter(value);
    setSelectedTodoIds([]);
  };

  const handleTodoFilterReset = () => {
    setTodoStatusFilter("");
    setTodoSourceFilter("");
    setTodoTitleFilter("");
    setTodoAssigneeFilter("");
    setTodoDateFilter("");
    setSelectedTodoIds([]);
  };

  const getSelectedVisibleTodoIds = () => {
    const visibleTodoIdSet = new Set(
      todoItems.map((item) => item.todoId).filter(Boolean),
    );
    return selectedTodoIds.filter((todoId) => visibleTodoIdSet.has(todoId));
  };

  const handleToggleTodoSelection = (todoId) => {
    if (!todoId || isBulkTodoActionRunning) return;

    setSelectedTodoIds((currentIds) =>
      currentIds.includes(todoId)
        ? currentIds.filter((currentTodoId) => currentTodoId !== todoId)
        : [...currentIds, todoId],
    );
  };

  const handleSelectAllTodos = (visibleTodoIdsOverride = null) => {
    if (isBulkTodoActionRunning) return;

    const visibleTodoIds = Array.isArray(visibleTodoIdsOverride)
      ? visibleTodoIdsOverride.filter(Boolean)
      : todoItems.map((item) => item.todoId).filter(Boolean);
    if (!visibleTodoIds.length) return;

    setSelectedTodoIds((currentIds) => {
      const visibleTodoIdSet = new Set(visibleTodoIds);
      const isAllVisibleSelected = visibleTodoIds.every((todoId) =>
        currentIds.includes(todoId),
      );
      if (isAllVisibleSelected) {
        return currentIds.filter((todoId) => !visibleTodoIdSet.has(todoId));
      }
      return Array.from(new Set([...currentIds, ...visibleTodoIds]));
    });
  };

  const handleClearTodoSelection = () => {
    if (isBulkTodoActionRunning) return;
    setSelectedTodoIds([]);
  };

  const handleTodoStatusChange = async (todo, status) => {
    if (!project?.projectId || !todo?.todoId || todo.status === status) return;

    const previousTodos = todoItems;
    setSavingTodoId(todo.todoId);
    setTodoActionError("");
    setTodoItems((currentItems) =>
      currentItems.map((item) =>
        item.todoId === todo.todoId ? { ...item, status } : item,
      ),
    );

    try {
      const updatedTodo = normalizeTodo(
        await updateProjectTodo({
          projectId: project.projectId,
          todoId: todo.todoId,
          payload: { status },
        }),
      );
      setTodoItems((currentItems) =>
        currentItems.map((item) =>
          item.todoId === todo.todoId ? updatedTodo : item,
        ),
      );
      await loadTodos();
    } catch (error) {
      setTodoItems(previousTodos);
      setTodoActionError(
        error instanceof Error
          ? error.message
          : "할일 상태를 저장하지 못했습니다.",
      );
    } finally {
      setSavingTodoId("");
    }
  };

  const handleStartTodoEdit = (todo) => {
    const range = getTodoScheduleRange(todo);
    setEditingTodoId(todo.todoId);
    setTodoEditDraft({
      title: todo.title || "",
      assignee: todo.assignee || "",
      startDate: range?.startDate || "",
      endDate: range?.endDate || "",
      dueDate: range?.endDate || "",
      description: todo.description || "",
      status: todo.status || "NOT_STARTED",
    });
    setTodoActionError("");
  };

  const handleCancelTodoEdit = () => {
    setEditingTodoId("");
    setTodoActionError("");
  };

  const handleTodoEditDraftChange = (field, value) => {
    setTodoEditDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
      ...(field === "dueDate"
        ? { startDate: value, endDate: value }
        : {}),
    }));
  };

  const handleSaveTodoEdit = async (todo) => {
    if (!project?.projectId || !todo?.todoId) return;
    const nextTitle = todoEditDraft.title.trim();
    if (!nextTitle) {
      setTodoActionError("할일명을 입력해 주세요.");
      return;
    }
    const nextStartDate = normalizeTodoDueDate(
      todoEditDraft.startDate || todoEditDraft.dueDate,
      { defaultToday: false },
    );
    const nextEndDate = normalizeTodoDueDate(
      todoEditDraft.endDate || todoEditDraft.dueDate || todoEditDraft.startDate,
      { defaultToday: false },
    );
    if ((nextStartDate && nextEndDate && nextEndDate < nextStartDate)) {
      setTodoActionError("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    setSavingTodoId(todo.todoId);
    setTodoActionError("");
    try {
      const updatedTodo = normalizeTodo(
        await updateProjectTodo({
          projectId: project.projectId,
          todoId: todo.todoId,
          payload: {
            title: nextTitle,
            assignee: todoEditDraft.assignee.trim() || null,
            start_date: nextStartDate || null,
            end_date: nextEndDate || null,
            due_date: nextEndDate || null,
            status: todoEditDraft.status || "NOT_STARTED",
            description: todoEditDraft.description.trim() || null,
          },
        }),
      );
      setTodoItems((currentItems) =>
        currentItems.map((item) =>
          item.todoId === todo.todoId ? updatedTodo : item,
        ),
      );
      setEditingTodoId("");
      await loadTodos();
    } catch (error) {
      await loadTodos();
      setTodoActionError(
        error instanceof Error
          ? error.message
          : "할일 정보를 저장하지 못했습니다.",
      );
    } finally {
      setSavingTodoId("");
    }
  };

  const handleDeleteTodo = async (todo) => {
    if (!project?.projectId || !todo?.todoId) return;
    if (!window.confirm(`"${todo.title}" 할일을 삭제할까요?`)) return;

    setSavingTodoId(todo.todoId);
    setTodoActionError("");
    try {
      await deleteProjectTodo({
        projectId: project.projectId,
        todoId: todo.todoId,
      });
      setTodoItems((currentItems) =>
        currentItems.filter((item) => item.todoId !== todo.todoId),
      );
      setSelectedTodoIds((currentIds) =>
        currentIds.filter((todoId) => todoId !== todo.todoId),
      );
      await loadTodos();
    } catch (error) {
      await loadTodos();
      if (error instanceof Error && error.message === "TODO not found") {
        error.message = "할일을 삭제하지 못했습니다. 목록을 다시 확인해주세요.";
      }
      setTodoActionError(
        error instanceof Error ? error.message : "할일을 삭제하지 못했습니다.",
      );
    } finally {
      setSavingTodoId("");
    }
  };

  const handleBulkDeleteTodos = async () => {
    if (!project?.projectId || isBulkTodoActionRunning) return;

    const targetTodoIds = getSelectedVisibleTodoIds();
    if (!targetTodoIds.length) return;
    if (!window.confirm(`선택한 ${targetTodoIds.length}개의 할일을 삭제할까요?`)) {
      return;
    }

    setIsBulkTodoActionRunning(true);
    setTodoActionError("");
    try {
      const results = await Promise.allSettled(
        targetTodoIds.map((todoId) =>
          deleteProjectTodo({
            projectId: project.projectId,
            todoId,
          }),
        ),
      );
      const failedTodoIds = targetTodoIds.filter(
        (_, index) => results[index].status === "rejected",
      );

      await loadTodos();
      setSelectedTodoIds(failedTodoIds);

      if (failedTodoIds.length) {
        const successCount = targetTodoIds.length - failedTodoIds.length;
        setTodoActionError(
          successCount
            ? `선택한 할일 중 ${successCount}개는 삭제했고 ${failedTodoIds.length}개는 실패했습니다.`
            : "선택한 할일을 삭제하지 못했습니다.",
        );
      }
    } finally {
      setIsBulkTodoActionRunning(false);
    }
  };

  const handleBulkTodoStatusApply = async () => {
    if (!project?.projectId || isBulkTodoActionRunning) return;

    const targetTodoIds = getSelectedVisibleTodoIds();
    if (!targetTodoIds.length || !bulkTodoStatus) return;

    const statusLabel =
      TODO_STATUS_OPTIONS.find((option) => option.value === bulkTodoStatus)
        ?.label || "선택한 상태";

    setIsBulkTodoActionRunning(true);
    setTodoActionError("");
    try {
      const results = await Promise.allSettled(
        targetTodoIds.map((todoId) =>
          updateProjectTodo({
            projectId: project.projectId,
            todoId,
            payload: { status: bulkTodoStatus },
          }),
        ),
      );
      const failedTodoIds = targetTodoIds.filter(
        (_, index) => results[index].status === "rejected",
      );

      await loadTodos();
      setSelectedTodoIds(failedTodoIds);

      if (failedTodoIds.length) {
        const successCount = targetTodoIds.length - failedTodoIds.length;
        setTodoActionError(
          successCount
            ? `선택한 할일 중 ${successCount}개는 ${statusLabel}로 변경했고 ${failedTodoIds.length}개는 실패했습니다.`
            : "선택한 할일의 진행상태를 변경하지 못했습니다.",
        );
      }
    } finally {
      setIsBulkTodoActionRunning(false);
    }
  };

  const handleOpenTodoImport = () => {
    setIsTodoImportOpen((currentValue) => !currentValue);
    setTodoActionError("");
    setTodoImportStatusMessage("");
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    if (
      todoImportUseExisting &&
      !todoImportDocumentId &&
      filteredTodoImportDocuments[0]?.documentId
    ) {
      setTodoImportDocumentId(filteredTodoImportDocuments[0].documentId);
    }
    if (project?.projectId) {
      loadUploadedFiles(project);
    }
  };

  const handleTodoImportDocumentTypeChange = (value) => {
    const nextType =
      TODO_IMPORT_DOCUMENT_TYPES.some((option) => option.value === value)
        ? value
        : DOCUMENT_TYPES.MEETING_NOTES;
    const nextDocument = getTodoImportDocuments(fileBuckets).find(
      (document) => document.documentType === nextType,
    );
    setTodoImportDocumentType(nextType);
    setTodoImportDocumentId(todoImportUseExisting ? nextDocument?.documentId || "" : "");
    setTodoImportFile(null);
    setTodoImportStatusMessage("");
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    setTodoActionError("");
  };

  const handleTodoImportUseExistingChange = (useExisting) => {
    setTodoImportUseExisting(useExisting);
    setTodoImportDocumentId(
      useExisting ? filteredTodoImportDocuments[0]?.documentId || "" : "",
    );
    setTodoImportFile(null);
    setTodoImportStatusMessage("");
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    setTodoActionError("");
  };

  const handleTodoImportDocumentChange = (documentId) => {
    setTodoImportDocumentId(documentId);
    setTodoImportStatusMessage("");
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    setTodoActionError("");
  };

  const handleTodoImportFileChange = (file) => {
    setTodoImportFile(file);
    setTodoImportDocumentId("");
    setTodoImportStatusMessage(file ? `${file.name} 선택됨` : "");
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    setTodoActionError("");
  };

  const previewTodoImport = async ({ documentId, documentType }) => {
    setIsPreviewingTodoImport(true);
    setTodoActionError("");
    setTodoImportStatusMessage("문서에서 할일 후보를 불러오는 중입니다.");
    try {
      const preview = normalizeTodoImportPreview(
        await previewProjectTodoImport({
          projectId: project.projectId,
          documentId,
          documentType,
        }),
      );
      setTodoImportPreview(preview);
      setSelectedTodoImportIds(
        preview.newItems
          .map((item) => item.clientImportId || item.todoId)
          .filter(Boolean),
      );
      const candidateCount =
        preview.newItems.length + preview.duplicateItems.length;
      setTodoImportStatusMessage(
        candidateCount
          ? `할일 후보 ${candidateCount}개를 불러왔습니다. 저장할 항목을 확인해 주세요.`
          : "문서에서 불러올 할일 후보가 없습니다.",
      );
      return preview;
    } catch (error) {
      setTodoImportPreview(null);
      setSelectedTodoImportIds([]);
      setTodoActionError(
        error instanceof Error
          ? error.message
          : "문서에서 할일을 미리보기하지 못했습니다.",
      );
      setTodoImportStatusMessage("");
      return null;
    } finally {
      setIsPreviewingTodoImport(false);
    }
  };

  const handleUploadTodoImportDocument = async () => {
    if (!project?.projectId || !todoImportFile) {
      setTodoActionError("할일을 불러올 문서를 업로드해 주세요.");
      return;
    }

    setIsUploadingTodoImportDocument(true);
    setTodoActionError("");
    setTodoImportStatusMessage("문서를 업로드하는 중입니다.");
    try {
      const response = await uploadDocument({
        projectId: project.projectId,
        documentType: todoImportDocumentType,
        file: todoImportFile,
      });
      const uploadedDocument = response?.document ?? {};
      const uploadedDocumentId =
        uploadedDocument.document_id ?? uploadedDocument.documentId ?? "";
      if (!uploadedDocumentId) {
        throw new Error("업로드된 문서 ID를 확인하지 못했습니다.");
      }
      await loadUploadedFiles(project);
      setTodoImportDocumentId(uploadedDocumentId);
      setTodoImportFile(null);
      setTodoImportStatusMessage("업로드한 문서에서 할일 후보를 불러오는 중입니다.");
      await previewTodoImport({
        documentId: uploadedDocumentId,
        documentType: todoImportDocumentType,
      });
    } catch (error) {
      setTodoImportPreview(null);
      setSelectedTodoImportIds([]);
      setTodoImportStatusMessage("");
      setTodoActionError(
        error instanceof Error ? error.message : "문서를 업로드하지 못했습니다.",
      );
    } finally {
      setIsUploadingTodoImportDocument(false);
    }
  };

  const handlePreviewTodoImport = async () => {
    if (!project?.projectId) return;
    if (!todoImportUseExisting) {
      await handleUploadTodoImportDocument();
      return;
    }
    if (!todoImportDocumentId) {
      setTodoActionError("할일을 불러올 기존 문서를 선택해 주세요.");
      return;
    }

    const selectedDocument = todoImportDocuments.find(
      (document) => document.documentId === todoImportDocumentId,
    );
    const documentType = selectedDocument?.documentType || todoImportDocumentType;

    await previewTodoImport({
      documentId: todoImportDocumentId,
      documentType,
    });
  };

  const handleToggleTodoImportItem = (itemId) => {
    setSelectedTodoImportIds((currentIds) =>
      currentIds.includes(itemId)
        ? currentIds.filter((currentId) => currentId !== itemId)
        : [...currentIds, itemId],
    );
  };

  const handleSelectTodoImportMode = (mode) => {
    if (!todoImportPreview) return;
    const newIds = todoImportPreview.newItems
      .map((item) => item.clientImportId || item.todoId)
      .filter(Boolean);
    const duplicateIds = todoImportPreview.duplicateItems
      .map((item) => item.candidate.clientImportId || item.candidate.todoId)
      .filter(Boolean);
    if (mode === "all") {
      setSelectedTodoImportIds([...newIds, ...duplicateIds]);
      return;
    }
    if (mode === "none") {
      setSelectedTodoImportIds([]);
      return;
    }
    setSelectedTodoImportIds(newIds);
  };

  const handleCommitTodoImport = async () => {
    if (!project?.projectId || !todoImportPreview) return;

    const allCandidates = [
      ...todoImportPreview.newItems,
      ...todoImportPreview.duplicateItems.map((item) => item.candidate),
    ];
    const items = allCandidates.map(toTodoImportPayload);
    const duplicateDecisions = items.map((item) => ({
      client_import_id: item.client_import_id,
      decision: selectedTodoImportIds.includes(item.client_import_id)
        ? "ADD"
        : "SKIP",
    }));

    setIsCommittingTodoImport(true);
    setTodoActionError("");
    try {
      await commitProjectTodoImport({
        projectId: project.projectId,
        items,
        duplicateDecisions,
      });
      setTodoImportPreview(null);
      setSelectedTodoImportIds([]);
      setIsTodoImportOpen(false);
      setTodoImportStatusMessage("");
      if (isScheduleRegistrationOpen) {
        setIsScheduleRegistrationOpen(false);
      }
      await loadTodos({ status: "" });
    } catch (error) {
      setTodoActionError(
        error instanceof Error ? error.message : "할일을 저장하지 못했습니다.",
      );
    } finally {
      setIsCommittingTodoImport(false);
    }
  };

  const handleWorkspaceTabChange = (tab) => {
    setActiveWorkspaceTab(tab);
    if (
      (tab === WORKSPACE_TABS.SCHEDULE || tab === WORKSPACE_TABS.TODAY) &&
      project?.projectId
    ) {
      loadTodos({ status: "" });
    }
    if (tab === WORKSPACE_TABS.SCHEDULE && project?.projectId) {
      loadUploadedFiles(project);
    }
  };

  const handleScheduleDateSelect = (dateText) => {
    const normalizedDate = normalizeTodoDueDate(dateText, { defaultToday: true });
    setSelectedScheduleDate(normalizedDate);
    setScheduleMonth(getMonthKeyFromIsoDate(normalizedDate));
    setEditingTodoId("");
    setTodoActionError("");
    setIsScheduleDayModalOpen(true);
  };

  const handleScheduleMonthChange = (offset) => {
    setScheduleMonth((currentMonth) => addMonthsToMonthKey(currentMonth, offset));
  };

  const handleSchedulePeriodChange = (offset) => {
    if (calendarViewMode === CALENDAR_VIEW_MODES.WEEK) {
      const nextDate = addDaysToIsoDate(selectedScheduleDate, offset * 7);
      setSelectedScheduleDate(nextDate);
      setScheduleMonth(getMonthKeyFromIsoDate(nextDate));
      return;
    }
    handleScheduleMonthChange(offset);
  };

  const handleCalendarViewModeChange = (nextMode) => {
    if (nextMode === calendarViewMode) return;
    setCalendarViewMode(nextMode);
    if (nextMode === CALENDAR_VIEW_MODES.WEEK) {
      const firstDateOfMonth = `${scheduleMonth}-01`;
      setSelectedScheduleDate(firstDateOfMonth);
      return;
    }
    if (nextMode === CALENDAR_VIEW_MODES.MONTH) {
      setScheduleMonth(getMonthKeyFromIsoDate(selectedScheduleDate));
    }
  };

  const resetScheduleRegistrationImportState = () => {
    setIsTodoImportOpen(true);
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    setTodoImportStatusMessage("");
    setTodoActionError("");
    setTodoImportFile(null);
  };

  const handleOpenScheduleRegistration = () => {
    const initialDate = selectedScheduleDate || getTodayIsoDate();
    setScheduleDraft({
      title: "",
      assignee: "",
      startDate: initialDate,
      endDate: initialDate,
      status: "NOT_STARTED",
      description: "",
    });
    setScheduleRegistrationMode(SCHEDULE_REGISTRATION_MODES.MANUAL);
    setTodoImportUseExisting(true);
    resetScheduleRegistrationImportState();
    if (
      !todoImportDocumentId &&
      filteredTodoImportDocuments[0]?.documentId
    ) {
      setTodoImportDocumentId(filteredTodoImportDocuments[0].documentId);
    }
    if (project?.projectId) {
      loadUploadedFiles(project);
    }
    setIsScheduleRegistrationOpen(true);
  };

  const handleCloseScheduleRegistration = () => {
    setIsScheduleRegistrationOpen(false);
    setTodoActionError("");
    setTodoImportStatusMessage("");
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    setTodoImportFile(null);
  };

  const handleScheduleRegistrationModeChange = (mode) => {
    setScheduleRegistrationMode(mode);
    const useExisting = mode === SCHEDULE_REGISTRATION_MODES.EXISTING;
    setTodoImportUseExisting(useExisting);
    resetScheduleRegistrationImportState();
    setTodoImportDocumentId(
      useExisting ? filteredTodoImportDocuments[0]?.documentId || "" : "",
    );
  };

  const handleScheduleDraftChange = (field, value) => {
    setScheduleDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  };

  const handleCreateManualSchedule = async (event) => {
    event.preventDefault();
    if (!project?.projectId || isCommittingTodoImport) return;

    const title = scheduleDraft.title.trim();
    const startDate = normalizeTodoDueDate(scheduleDraft.startDate);
    const endDate = normalizeTodoDueDate(scheduleDraft.endDate || scheduleDraft.startDate);
    if (!title) {
      setTodoActionError("할일명을 입력해 주세요.");
      return;
    }
    if (!startDate || !endDate) {
      setTodoActionError("캘린더에 표시할 시작일과 종료일을 선택해 주세요.");
      return;
    }
    if (endDate < startDate) {
      setTodoActionError("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    const clientImportId = `MANUAL-${Date.now()}`;
    setIsCommittingTodoImport(true);
    setTodoActionError("");
    try {
      await commitProjectTodoImport({
        projectId: project.projectId,
        items: [
          {
            todo_id: clientImportId,
            client_import_id: clientImportId,
            title,
            assignee: scheduleDraft.assignee.trim() || null,
            start_date: startDate,
            end_date: endDate,
            due_date: endDate,
            status: scheduleDraft.status || "NOT_STARTED",
            source_type: "MANUAL",
            description: scheduleDraft.description.trim() || null,
          },
        ],
        duplicateDecisions: [
          {
            client_import_id: clientImportId,
            decision: "ADD",
          },
        ],
      });
      setSelectedScheduleDate(startDate);
      setScheduleMonth(getMonthKeyFromIsoDate(startDate));
      handleCloseScheduleRegistration();
      await loadTodos({ status: "" });
    } catch (error) {
      setTodoActionError(
        error instanceof Error ? error.message : "일정을 등록하지 못했습니다.",
      );
    } finally {
      setIsCommittingTodoImport(false);
    }
  };

  const handleSelectDocumentHubNode = (nodeId) => {
    if (!DOCUMENT_HUB_NODE_BY_ID[nodeId]) return;
    setSelectedDocumentHubNodeId(nodeId);
    setIsDocumentGenerationModalOpen(true);
    setDocumentError("");
    setDocumentStatusMessage("");
  };

  const handleCloseDocumentGenerationModal = () => {
    if (isResponding || isUploadingDocument) return;
    setIsDocumentGenerationModalOpen(false);
    setDocumentError("");
    setDocumentStatusMessage("");
  };

  const handleHubUploadFiles = async (files, uploadRequest = {}) => {
    if (!project?.projectId || isUploadingDocument) return;
    const uploadFiles = Array.from(files ?? []).filter(Boolean);
    if (!uploadFiles.length) return;

    const requestedDocumentType =
      uploadRequest.documentType || DEFAULT_DOCUMENT_TYPE;
    const canUploadMultiple =
      Boolean(uploadRequest.allowMultiple) ||
      (uploadRequest.documentChoiceSlot === "optional" &&
        requestedDocumentType === DOCUMENT_TYPES.MEETING_NOTES);
    const filesToUpload = canUploadMultiple
      ? uploadFiles
      : uploadFiles.slice(0, 1);
    const uploadLabel =
      filesToUpload.length > 1
        ? `${uploadRequest.displayLabel || getDocumentDisplayLabel(requestedDocumentType)} ${filesToUpload.length}개`
        : filesToUpload[0].name;
    setIsUploadingDocument(true);
    setDocumentError("");
    setDocumentStatusMessage(`${uploadLabel} 업로드 중입니다.`);

    try {
      for (const file of filesToUpload) {
        let response;
        try {
          response = await uploadDocument({
            projectId: project.projectId,
            documentType: requestedDocumentType,
            file,
          });
        } catch (uploadError) {
          const message =
            uploadError instanceof Error
              ? uploadError.message
              : "문서를 업로드하지 못했습니다.";
          throw new Error(`${file.name}: ${message}`);
        }
        const document = response?.document ?? {};
        const uploadedDocumentId =
          document.document_id ?? document.documentId ?? "";
        if (!uploadedDocumentId) {
          throw new Error(`${file.name}: 업로드된 문서 정보를 확인하지 못했습니다.`);
        }
      }
      await loadUploadedFiles(project);
      setDocumentStatusMessage(
        `${uploadLabel} 업로드가 완료되었습니다. 기준 문서를 확인한 뒤 생성해 주세요.`,
      );
    } catch (error) {
      setDocumentError(
        error instanceof Error ? error.message : "문서를 업로드하지 못했습니다.",
      );
      setDocumentStatusMessage("");
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleHubDocumentChoice = async ({
    documentId,
    optionalDocumentIds = [],
    outputFormat = "",
  }) => {
    if (
      !project?.projectId ||
      isResponding ||
      isUploadingDocument ||
      !selectedDocumentHubRequest
    ) {
      return;
    }

    const request = selectedDocumentHubRequest;
    const requestType = request.documentConfig?.requestType || "";
    const selectedDocument =
      request.documents.find((document) => document.documentId === documentId) ??
      request.documents.find(
        (document) => document.documentId === request.defaultDocumentId,
      ) ??
      request.documents[0];
    const selectedOptionalDocuments = request.optionalDocuments.filter((document) =>
      optionalDocumentIds.includes(document.documentId),
    );
    const selectedDocuments = uniqueDocumentsById([
      selectedDocument,
      ...selectedOptionalDocuments,
    ]);
    const relation = getRelation(requestType);
    const selectedOutputFormat =
      outputFormat ||
      request.outputFormat ||
      request.documentConfig?.defaultOutputFormat ||
      getDefaultOutputFormat(relation);

    if (!selectedDocument?.documentId) {
      setDocumentError(
        `${request.documentConfig?.primarySource?.label || "기준 문서"}를 선택하거나 업로드해 주세요.`,
      );
      return;
    }

    const messageText =
      request.originalMessage ||
      `${request.documentConfig?.targetLabel || "산출물"} 생성해줘`;
    const userMessage = {
      id: createChatId("user"),
      role: "user",
      content: messageText,
      createdAt: formatDateTime(),
    };

    setIsResponding(true);
    setConversationActionError("");
    setDocumentError("");
    setDocumentStatusMessage(
      request.documentConfig?.startMessage || DOCUMENT_GENERATION_COPY.start,
    );

    try {
      const backendResult = await sendBackendConversationMessage({
        targetProject: project,
        targetConversationId: activeConversationId,
        messageText,
        userMessage,
        documents: selectedDocuments,
        requestType,
        extraContext: {
          document_generation_mode: "use_existing",
          output_format: selectedOutputFormat,
        },
      });
      await saveCommandUsage(project.projectId, messageText);
      setLastCommandInfo({ commandText: messageText });
      await loadUploadedFiles(backendResult.project ?? project);
      setIsDocumentGenerationModalOpen(false);
    } catch (error) {
      reportUiError("handleHubDocumentChoice", error, {
        projectId: project?.projectId,
        requestType,
        documentId,
        optionalDocumentIds,
      });
      setDocumentError(
        error instanceof Error
          ? error.message
          : "선택한 문서로 생성을 진행하지 못했습니다.",
      );
    } finally {
      setIsResponding(false);
    }
  };

  const sendLocalRequiredInfoMessage = async ({
    targetProject,
    targetConversationId,
    userMessage,
    content,
    metadata,
  }) => {
    const localConversationId =
      targetConversationId || createChatId("conversation");
    const assistantMessage = {
      id: createChatId("assistant"),
      role: "assistant",
      content,
      createdAt: formatDateTime(),
      metadata: {
        conversationId: localConversationId,
        state: CHAT_STATES.WAITING_REQUIRED_INFO,
        ...metadata,
      },
    };
    const messageResult = await addMessagesToConversation(
      targetProject.projectId,
      localConversationId,
      userMessage ? [userMessage, assistantMessage] : [assistantMessage],
    );

    setProject(messageResult.project);
    setActiveConversationIdState(localConversationId);
    setActiveConversationId(targetProject.projectId, localConversationId);
    if (userMessage) {
      await saveCommandUsage(targetProject.projectId, userMessage.content);
      setLastCommandInfo({ commandText: userMessage.content });
    }
    setSelectedDocumentIds([]);
    setDocumentStatusMessage("");

    return {
      project: messageResult.project,
      conversationId: localConversationId,
    };
  };

  const sendLocalChatMessage = async ({
    targetProject,
    targetConversationId,
    userMessage,
    content,
    metadata = {},
  }) => {
    const localConversationId =
      targetConversationId || createChatId("conversation");
    const assistantMessage = {
      id: createChatId("assistant"),
      role: "assistant",
      content,
      createdAt: formatDateTime(),
      metadata: {
        conversationId: localConversationId,
        state: CHAT_STATES.IDLE,
        suggestedActions: [],
        commandActions: [],
        ...metadata,
      },
    };
    const messageResult = await addMessagesToConversation(
      targetProject.projectId,
      localConversationId,
      userMessage ? [userMessage, assistantMessage] : [assistantMessage],
    );

    setProject(messageResult.project);
    setActiveConversationIdState(localConversationId);
    setActiveConversationId(targetProject.projectId, localConversationId);
    if (userMessage) {
      await saveCommandUsage(targetProject.projectId, userMessage.content);
      setLastCommandInfo({ commandText: userMessage.content });
      const nextRecommendations = await getCommandRecommendations(
        targetProject.projectId,
        localConversationId,
        { commandText: userMessage.content },
      );
      setCommandRecommendations(nextRecommendations);
    }
    setSelectedDocumentIds([]);
    setDocumentStatusMessage("");
    setIsChatPopupOpen(true);

    return {
      project: messageResult.project,
      conversationId: localConversationId,
    };
  };

  const getLatestTodosForScheduleChat = async (targetProject) => {
    try {
      const response = await listProjectTodos(targetProject.projectId, {
        status: "",
      });
      const nextItems = normalizeTodoListResponse(response);
      const nextTodoIdSet = new Set(
        nextItems.map((item) => item.todoId).filter(Boolean),
      );
      setTodoItems(nextItems);
      setSelectedTodoIds((currentIds) =>
        currentIds.filter((todoId) => nextTodoIdSet.has(todoId)),
      );
      setTodoError("");
      return nextItems;
    } catch (error) {
      if (todoItems.length) return todoItems;
      throw error;
    }
  };

  const sendBackendConversationMessage = async ({
    targetProject,
    targetConversationId,
    messageText,
    userMessage = null,
    documents = [],
    requestType = "",
    extraContext = {},
  }) => {
    const includeDocumentIdAliases =
      requestType === GENERATION_REQUEST_TYPES.REQUIREMENT_SPEC;
    const shouldTrackGeneration = Boolean(getRequiredDocumentConfig(requestType));
    if (shouldTrackGeneration) {
      startGenerationProgress(requestType);
    }
    try {
      let assistantMessage = await sendProjectMessage({
        project_id: targetProject.projectId,
        conversation_id: targetConversationId || null,
        message: messageText,
        context: buildProjectContext(targetProject, documents, {
          includeDocumentIdAliases,
          extraContext,
        }),
      });
      const backendConversationId =
        assistantMessage.metadata?.conversationId ?? targetConversationId;
      if (!backendConversationId) {
        throw new Error("백엔드 대화 ID를 확인하지 못했습니다.");
      }
      assistantMessage = await resolveGenerationStartedAssistantMessage(
        assistantMessage,
        {
          projectId: targetProject.projectId,
          requestType,
        },
      );

      const messageResult = await addMessagesToConversation(
        targetProject.projectId,
        backendConversationId,
        userMessage ? [userMessage, assistantMessage] : [assistantMessage],
      );
      const selectedIds = documents
        .map((document) => document.documentId)
        .filter(Boolean);

      setProject(messageResult.project);
      setActiveConversationIdState(backendConversationId);
      setActiveConversationId(targetProject.projectId, backendConversationId);
      setSelectedDocumentIds(selectedIds);
      setDocumentStatusMessage("");

      return {
        project: messageResult.project,
        conversationId: backendConversationId,
        assistantMessage,
      };
    } catch (error) {
      if (shouldTrackGeneration && !isGenerationPollingCancelledError(error)) {
        failGenerationProgress(null, requestType);
      }
      throw error;
    }
  };

  const prepareMessageRequest = async ({ messageText, targetProject }) => {
    const requestType = getMessageDocumentRequestType(messageText);

    const requiredDocumentConfig = getDocumentContextConfig(requestType);
    if (!requiredDocumentConfig) {
      return { status: "READY", documents: [], requestType };
    }

    const documents = await loadProjectDocuments(targetProject.projectId);
    const matchingDocuments = getMatchingDocuments(
      documents,
      requiredDocumentConfig,
    );
    const optionalDocuments = (requiredDocumentConfig.optionalSources ?? [])
      .flatMap((source) =>
        getMatchingDocuments(documents, {
          documentTypes: [source.documentType],
          keywords: source.keywords ?? [],
        }),
      )
      .filter(
        (document) =>
          !matchingDocuments.some(
            (primaryDocument) =>
              primaryDocument.documentId === document.documentId,
          ),
      );
    const uniqueOptionalDocuments = uniqueDocumentsById(optionalDocuments);
    const matchedDocument = matchingDocuments[0] ?? null;
    const buildAssistantMessage = (hasPrimaryDocument) =>
      getDocumentContextAssistantMessage({
        requestType,
        documentConfig: requiredDocumentConfig,
        relation: requiredDocumentConfig.relation,
        hasPrimaryDocument,
      });

    if (matchedDocument) {
      return {
        status: "DOCUMENT_CHOICE_REQUIRED",
        documents: matchingDocuments,
        optionalDocuments: uniqueOptionalDocuments,
        defaultDocument: matchedDocument,
        documentConfig: requiredDocumentConfig,
        assistantMessage: buildAssistantMessage(true),
        requestType,
      };
    }

    return {
      status: "UPLOAD_REQUIRED",
      documentConfig: requiredDocumentConfig,
      documents: [],
      optionalDocuments: uniqueOptionalDocuments,
      assistantMessage: buildAssistantMessage(false),
      requestType,
    };
  };

  const sendMessage = async (messageText) => {
    if (!project || isResponding) return;

    const trimmedValue = messageText.trim();
    if (!trimmedValue) return;

    setComposerValue("");
    setIsResponding(true);
    setConversationActionError("");
    setDocumentError("");

    let targetProject = project;
    let targetConversationId = activeConversationId;

    try {
      const userMessage = {
        id: createChatId("user"),
        role: "user",
        content: trimmedValue,
        createdAt: formatDateTime(),
      };

      if (isScheduleTodoMutationRequest(trimmedValue)) {
        await sendLocalChatMessage({
          targetProject,
          targetConversationId,
          userMessage,
          content: TODO_MUTATION_BLOCK_MESSAGE,
        });
        return;
      }

      if (isScheduleTodoReadOnlyQuery(trimmedValue)) {
        const latestTodos = await getLatestTodosForScheduleChat(targetProject);
        const query = getScheduleChatQuery(trimmedValue, latestTodos);
        const scheduleTodos = filterScheduleChatTodos(latestTodos, query);
        await sendLocalChatMessage({
          targetProject,
          targetConversationId,
          userMessage,
          content: buildScheduleChatResponseContent(query, scheduleTodos),
          metadata: {
            result: {
              type: "schedule_query",
              query,
              items: scheduleTodos,
            },
          },
        });
        return;
      }

      const preparedRequest = await prepareMessageRequest({
        messageText: trimmedValue,
        targetProject,
      });
      const openDocumentGenerationModalFromChat = async () => {
        const nodeId =
          DOCUMENT_HUB_NODE_ID_BY_REQUEST_TYPE[preparedRequest.requestType];
        if (!nodeId) return false;

        const localConversationId =
          targetConversationId || createChatId("conversation");
        const targetLabel =
          preparedRequest.documentConfig?.targetLabel || "문서";
        const assistantMessage = {
          id: createChatId("assistant"),
          role: "assistant",
          content: `${targetLabel} 생성 팝업을 열었습니다. 기준 문서와 파일 형식을 확인한 뒤 생성해 주세요.`,
          createdAt: formatDateTime(),
          metadata: {
            conversationId: localConversationId,
            state: CHAT_STATES.IDLE,
            suggestedActions: [],
            commandActions: [],
          },
        };
        const messageResult = await addMessagesToConversation(
          targetProject.projectId,
          localConversationId,
          [userMessage, assistantMessage],
        );
        targetProject = messageResult.project;
        targetConversationId = localConversationId;
        setProject(messageResult.project);
        setActiveConversationIdState(localConversationId);
        setActiveConversationId(targetProject.projectId, localConversationId);
        await saveCommandUsage(targetProject.projectId, trimmedValue);
        setLastCommandInfo({ commandText: trimmedValue });
        setSelectedDocumentIds([]);
        setSelectedDocumentHubNodeId(nodeId);
        setIsDocumentGenerationModalOpen(true);
        setDocumentStatusMessage("");
        setIsChatPopupOpen(true);
        return true;
      };

      if (preparedRequest.status === "UPLOAD_REQUIRED") {
        if (await openDocumentGenerationModalFromChat()) {
          return;
        }
        await sendLocalRequiredInfoMessage({
          targetProject,
          targetConversationId,
          userMessage,
          content:
            preparedRequest.assistantMessage ||
            preparedRequest.documentConfig.message,
          metadata: {
            documentChoiceRequest: {
              originalMessage: trimmedValue,
              documentConfig: preparedRequest.documentConfig,
              documents: preparedRequest.documents,
              optionalDocuments: preparedRequest.optionalDocuments,
              defaultDocumentId: "",
              outputFormats: preparedRequest.documentConfig.outputFormats,
              outputFormat: preparedRequest.documentConfig.defaultOutputFormat,
            },
            commandActions: [],
          },
        });
        return;
      }

      if (preparedRequest.status === "DOCUMENT_CHOICE_REQUIRED") {
        if (await openDocumentGenerationModalFromChat()) {
          return;
        }
        await sendLocalRequiredInfoMessage({
          targetProject,
          targetConversationId,
          userMessage,
          content:
            preparedRequest.assistantMessage ||
            preparedRequest.documentConfig.existingMessage ||
            "이미 업로드된 문서가 있습니다. 이 문서를 기준으로 진행할까요?",
          metadata: {
            documentChoiceRequest: {
              originalMessage: trimmedValue,
              documentConfig: preparedRequest.documentConfig,
              documents: preparedRequest.documents,
              optionalDocuments: preparedRequest.optionalDocuments,
              defaultDocumentId: preparedRequest.defaultDocument?.documentId,
              outputFormats: preparedRequest.documentConfig.outputFormats,
              outputFormat: preparedRequest.documentConfig.defaultOutputFormat,
            },
          },
        });
        return;
      }

      const backendResult = await sendBackendConversationMessage({
        targetProject,
        targetConversationId,
        messageText: trimmedValue,
        userMessage,
        documents: preparedRequest.documents,
        requestType: preparedRequest.requestType,
      });
      targetProject = backendResult.project;
      targetConversationId = backendResult.conversationId;
      await saveCommandUsage(targetProject.projectId, trimmedValue);
      setLastCommandInfo({ commandText: trimmedValue });

      const nextRecommendations = await getCommandRecommendations(
        targetProject.projectId,
        targetConversationId,
        { commandText: trimmedValue },
      );
      setCommandRecommendations(nextRecommendations);
      setSelectedDocumentIds([]);
      setDocumentStatusMessage("");
    } catch (error) {
      reportUiError("sendMessage", error, {
        projectId: targetProject?.projectId,
        conversationId: targetConversationId,
        messageText: trimmedValue,
      });
      const fallbackMessage = {
        id: createChatId("assistant"),
        role: "assistant",
        content:
          error instanceof Error
            ? error.message
            : "응답을 생성하지 못했습니다. 잠시 후 다시 입력해주세요.",
        createdAt: formatDateTime(),
      };

      if (targetConversationId) {
        const fallbackResult = await addMessageToConversation(
          targetProject.projectId,
          targetConversationId,
          fallbackMessage,
        );
        setProject(fallbackResult.project);
      } else {
        setConversationActionError(fallbackMessage.content);
      }
    } finally {
      setIsResponding(false);
    }
  };

  const handleMessageSubmit = (event) => {
    event.preventDefault();
    sendMessage(composerValue);
  };

  const handleCommandRecommendationClick = (commandText) => {
    setComposerValue(commandText);
    sendMessage(commandText);
  };

  const handleAgentUploadFiles = async ({
    message,
    files,
    uploadRequest: uploadRequestOverride = null,
  }) => {
    if (!project || isUploadingDocument) return;

    const uploadFiles = Array.from(files ?? []).filter(Boolean);
    if (!uploadFiles.length) return;

    setIsUploadingDocument(true);
    setDocumentError("");
    setDocumentStatusMessage("");
    let requestedDocumentTypeForError = uploadRequestOverride?.documentType;

    try {
      const documentChoiceRequest =
        message.metadata?.documentChoiceRequest ?? null;
      const documentChoiceConfig =
        documentChoiceRequest?.documentConfig ?? null;
      const uploadRequest =
        uploadRequestOverride ??
        message.metadata?.uploadRequest ??
        (documentChoiceRequest
          ? {
              label: documentChoiceConfig?.label || "새 문서 업로드",
              acceptedTypes: DOCUMENT_UPLOAD_ACCEPTED_TYPES,
              documentType:
                documentChoiceConfig?.documentType || DEFAULT_DOCUMENT_TYPE,
              originalMessage:
                documentChoiceRequest.originalMessage ||
                "업로드한 문서를 기준으로 진행해줘",
              resumeAfterUpload: true,
              requestType: documentChoiceConfig?.requestType || "",
              outputFormats:
                documentChoiceRequest.outputFormats ??
                documentChoiceConfig?.outputFormats,
              outputFormat:
                documentChoiceRequest.outputFormat ??
                documentChoiceConfig?.defaultOutputFormat,
            }
          : {});
      const requestedDocumentType =
        uploadRequest.documentType || DEFAULT_DOCUMENT_TYPE;
      requestedDocumentTypeForError = requestedDocumentType;
      const canUploadMultipleChoiceDocuments =
        Boolean(uploadRequest.allowMultiple) ||
        (uploadRequest.documentChoiceSlot === "optional" &&
          requestedDocumentType === DOCUMENT_TYPES.MEETING_NOTES);
      const filesToUpload = canUploadMultipleChoiceDocuments
        ? uploadFiles
        : uploadFiles.slice(0, 1);
      const uploadLabel =
        filesToUpload.length > 1
          ? `${uploadRequest.displayLabel || getDocumentDisplayLabel(requestedDocumentType)} ${filesToUpload.length}개`
          : filesToUpload[0].name;
      const uploadedDocuments = [];
      setDocumentStatusMessage(`${uploadLabel} 업로드 중입니다.`);

      for (const file of filesToUpload) {
        let response;
        try {
          response = await uploadDocument({
            projectId: project.projectId,
            documentType: requestedDocumentType,
            file,
          });
        } catch (uploadError) {
          const message =
            uploadError instanceof Error
              ? uploadError.message
              : "문서를 업로드하지 못했습니다.";
          throw new Error(`${file.name}: ${message}`);
        }
        const document = response?.document;

        if (!document?.document_id) {
          throw new Error(`${file.name}: 업로드된 문서 정보를 확인하지 못했습니다.`);
        }

        uploadedDocuments.push({
          ...toAttachmentDocument(document),
          documentType:
            document.document_type ??
            document.documentType ??
            requestedDocumentType,
          displayLabel:
            uploadRequest.displayLabel ??
            document.display_label ??
            document.displayLabel ??
            getDocumentDisplayLabel(requestedDocumentType),
        });
      }

      const uploadedDocument = uploadedDocuments[0];
      if (!uploadedDocument?.documentId) {
        throw new Error("업로드된 문서 정보를 확인하지 못했습니다.");
      }

      if (uploadRequest.documentChoiceSlot) {
        const targetConversationId =
          message.metadata?.conversationId || activeConversationId;
        if (!targetConversationId) {
          throw new Error("업로드한 문서를 반영할 대화 정보를 확인하지 못했습니다.");
        }
        const result = await updateConversationMessage(
          project.projectId,
          targetConversationId,
          message.id,
          (currentMessage) => {
            const currentMetadata = currentMessage.metadata ?? {};
            const currentChoiceRequest =
              currentMetadata.documentChoiceRequest ?? documentChoiceRequest ?? {};
            const nextChoiceRequest = {
              ...currentChoiceRequest,
              outputFormat:
                uploadRequest.outputFormat ?? currentChoiceRequest.outputFormat,
            };
            if (uploadRequest.documentChoiceSlot === "optional") {
              const currentOptionalDocuments =
                currentChoiceRequest.optionalDocuments ?? [];
              const currentDefaultOptionalIds =
                currentChoiceRequest.defaultOptionalDocumentIds ?? [];
              const selectedOptionalIdsFromRequest = Array.isArray(
                uploadRequest.selectedOptionalDocumentIds,
              )
                ? uploadRequest.selectedOptionalDocumentIds
                : currentDefaultOptionalIds;
              const currentSelectedOptionalDocuments =
                currentOptionalDocuments.filter((item) =>
                  selectedOptionalIdsFromRequest.includes(item.documentId),
                );
              nextChoiceRequest.optionalDocuments = uniqueDocumentsById([
                ...uploadedDocuments,
                ...currentOptionalDocuments,
              ]);
              nextChoiceRequest.defaultOptionalDocumentIds = uniqueDocumentsById([
                ...uploadedDocuments,
                ...currentSelectedOptionalDocuments,
              ])
                .map((item) => item.documentId)
                .filter(Boolean);
            } else {
              nextChoiceRequest.documents = uniqueDocumentsById([
                uploadedDocument,
                ...(currentChoiceRequest.documents ?? []),
              ]);
              nextChoiceRequest.defaultDocumentId = uploadedDocument.documentId;
            }
            const nextRequestType =
              nextChoiceRequest.documentConfig?.requestType ||
              uploadRequest.requestType;
            const nextRelation =
              nextChoiceRequest.documentConfig?.relation ??
              getRelation(nextRequestType);
            const nextDocuments = Array.isArray(nextChoiceRequest.documents)
              ? nextChoiceRequest.documents
              : [];
            return {
              ...currentMessage,
              content: getDocumentContextAssistantMessage({
                requestType: nextRequestType,
                documentConfig: nextChoiceRequest.documentConfig ?? {},
                relation: nextRelation,
                hasPrimaryDocument: nextDocuments.some(
                  (documentItem) => documentItem?.documentId,
                ),
              }),
              metadata: {
                ...currentMetadata,
                documentChoiceRequest: nextChoiceRequest,
              },
            };
          },
        );
        setProject(result.project);
        setDocumentStatusMessage(
          `${uploadLabel} 업로드가 완료되었습니다. 생성 버튼을 눌러 진행해주세요.`,
        );
        await loadUploadedFiles(project);
        return;
      }
      await loadUploadedFiles(project);
      await clearMessageActions({
        conversationId:
          message.metadata?.conversationId || activeConversationId,
        message,
      });
      const originalMessage =
        uploadRequest.originalMessage || "업로드한 문서를 기준으로 진행해줘";
      const shouldResumeAfterUpload =
        uploadRequest.resumeAfterUpload ||
        requestedDocumentType === DEFAULT_DOCUMENT_TYPE ||
        requestedDocumentType === DOCUMENT_TYPES.WBS ||
        requestedDocumentType === DOCUMENT_TYPES.MEETING_NOTES;
      if (shouldResumeAfterUpload) {
        const resumeDocuments = getUploadResumeDocuments(
          uploadRequest,
          uploadedDocument,
        );
        const isMeetingTodoUpload =
          requestedDocumentType === DOCUMENT_TYPES.MEETING_NOTES;
        setDocumentStatusMessage(
          uploadRequest.startMessage ||
            (isMeetingTodoUpload
              ? MEETING_TODO_DOCUMENT_CONFIG.startMessage
              : DOCUMENT_GENERATION_COPY.start),
        );
        const targetConversationId =
          message.metadata?.conversationId || activeConversationId;
        await sendBackendConversationMessage({
          targetProject: project,
          targetConversationId,
          messageText: originalMessage,
          documents: resumeDocuments,
          requestType: uploadRequest.requestType,
          extraContext: isMeetingTodoUpload
            ? { schedule_action: "EXTRACT_TODOS_FROM_MEETING" }
            : {
                output_format:
                  uploadRequest.outputFormat ||
                  getDefaultOutputFormat(getRelation(uploadRequest.requestType)),
                document_generation_mode: "upload",
              },
        });
        await saveCommandUsage(project.projectId, originalMessage);
        setLastCommandInfo({ commandText: originalMessage });
      } else {
        setDocumentStatusMessage(
          `${uploadedDocument.fileName} 업로드가 완료되었습니다.`,
        );
      }
    } catch (error) {
      reportUiError("handleAgentUploadFiles", error, {
        projectId: project?.projectId,
        documentType: requestedDocumentTypeForError,
      });
      setDocumentError(
        error instanceof Error
          ? error.message
          : "문서를 업로드하지 못했습니다.",
      );
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleDocumentChoice = async ({
    message,
    choice,
    documentId,
    optionalDocumentIds = [],
    outputFormat = "",
  }) => {
    if (!project || isResponding || isUploadingDocument) return;

    const targetConversationId =
      message.metadata?.conversationId || activeConversationId;
    const choiceRequest = message.metadata?.documentChoiceRequest ?? {};
    const documents = Array.isArray(choiceRequest.documents)
      ? choiceRequest.documents
      : [];
    const originalMessage =
      choiceRequest.originalMessage || "선택한 문서를 기준으로 진행해줘";
    const requestType = choiceRequest.documentConfig?.requestType || "";
    const isMeetingTodoRequest =
      requestType === DOCUMENT_CONTEXT_REQUEST_TYPES.MEETING_TODO_EXTRACTION;
    const selectedOutputFormat = isMeetingTodoRequest
      ? ""
      : outputFormat ||
        choiceRequest.outputFormat ||
        choiceRequest.documentConfig?.defaultOutputFormat ||
        getDefaultOutputFormat(getRelation(requestType));

    if (!targetConversationId) {
      setConversationActionError("문서를 선택할 대화 정보를 확인하지 못했습니다.");
      return;
    }

    const selectedDocument =
      documents.find((document) => document.documentId === documentId) ??
      documents.find(
        (document) => document.documentId === choiceRequest.defaultDocumentId,
      ) ??
      documents[0];
    const optionalDocuments = Array.isArray(choiceRequest.optionalDocuments)
      ? choiceRequest.optionalDocuments
      : [];
    const selectedOptionalDocuments = optionalDocuments.filter((document) =>
      optionalDocumentIds.includes(document.documentId),
    );
    const selectedDocuments = uniqueDocumentsById([
      selectedDocument,
      ...selectedOptionalDocuments,
    ]);

    if (!selectedDocument?.documentId) {
      setDocumentError("선택할 문서 정보를 확인하지 못했습니다.");
      return;
    }

    setIsResponding(true);
    setConversationActionError("");
    setDocumentError("");
    setDocumentStatusMessage(
      choiceRequest.documentConfig?.startMessage || DOCUMENT_GENERATION_COPY.start,
    );

    try {
      await clearMessageActions({
        conversationId: targetConversationId,
        message,
      });
      const backendResult = await sendBackendConversationMessage({
        targetProject: project,
        targetConversationId,
        messageText: originalMessage,
        documents: selectedDocuments,
        requestType,
        extraContext: isMeetingTodoRequest
          ? { schedule_action: "EXTRACT_TODOS_FROM_MEETING" }
          : {
              document_generation_mode: "use_existing",
              output_format: selectedOutputFormat,
            },
      });
      await saveCommandUsage(project.projectId, originalMessage);
      setLastCommandInfo({ commandText: originalMessage });
      setSelectedDocumentIds(
        selectedDocuments.map((document) => document.documentId),
      );
      setProject(backendResult.project);
    } catch (error) {
      reportUiError("handleDocumentChoice", error, {
        projectId: project?.projectId,
        documentId,
        optionalDocumentIds,
      });
      setDocumentError(
        error instanceof Error
          ? error.message
          : "선택한 문서로 요청을 진행하지 못했습니다.",
      );
    } finally {
      setIsResponding(false);
    }
  };

  const handleSuggestedActionClick = async (message, action) => {
    if (
      !project ||
      isResponding ||
      !EXECUTABLE_ACTION_TYPES.has(action?.type)
    ) {
      return;
    }

    const targetConversationId =
      message.metadata?.conversationId || activeConversationId;
    const actionId = getActionId(message, action);
    const actionMessage = getActionMessage(action);
    const pendingAction = message.metadata?.pendingAction;
    const isConfirmGenerationAction =
      action.type === CHAT_ACTION_COMMAND_TYPES.CONFIRM_PENDING_ACTION &&
      isGenerationPendingAction(pendingAction);
    const shouldResetGenerationState =
      isConfirmGenerationAction ||
      action.type === CHAT_ACTION_COMMAND_TYPES.CANCEL_PENDING_ACTION;

    if (!targetConversationId || !actionId) {
      setConversationActionError("실행할 대기 작업을 확인하지 못했습니다.");
      return;
    }

    setIsResponding(true);
    setConversationActionError("");
    if (isConfirmGenerationAction) {
      startGenerationProgress(
        pendingAction?.requestType ||
          pendingAction?.request_type ||
          pendingAction?.payload?.requestType ||
          pendingAction?.payload?.request_type ||
          GENERATION_REQUEST_TYPES.REQUIREMENT_SPEC,
      );
    }

    try {
      await clearMessageActions({
        conversationId: targetConversationId,
        message,
      });
      const userMessage = {
        id: createChatId("user"),
        role: "user",
        content: actionMessage,
        createdAt: formatDateTime(),
      };
      let assistantMessage = await sendProjectMessage({
        project_id: project.projectId,
        conversation_id: targetConversationId,
        message: actionMessage,
        context: {},
        action: {
          type: action.type,
          action_id: actionId,
          payload: {
            ...(action.payload ?? {}),
            action_id: actionId,
          },
        },
      });
      const backendConversationId =
        assistantMessage.metadata?.conversationId ?? targetConversationId;
      if (isConfirmGenerationAction) {
        const pollingActionId = getAssistantActionId(assistantMessage) || actionId;
        setGenerationJob((currentJob) =>
          currentJob ? { ...currentJob, actionId: pollingActionId } : currentJob,
        );
        if (assistantMessage.metadata?.state === CHAT_STATES.FAILED) {
          const failedProgress = failGenerationProgress();
          assistantMessage = {
            ...assistantMessage,
            content:
              "요구사항 정의서 생성 중 문제가 발생했습니다.\n업로드한 구축요건 정의서를 확인한 뒤 다시 시도해주세요.",
            metadata: {
              ...assistantMessage.metadata,
              actionId: pollingActionId,
              generationProgress: failedProgress,
              pendingAction: null,
              suggestedActions: [],
            },
          };
        } else {
          const statusResponse = await pollGenerationActionStatus({
            projectId: project.projectId,
            actionId: pollingActionId,
          });
          if (
            statusResponse.status === GENERATION_ACTION_STATUS.FAILED ||
            statusResponse.status === GENERATION_ACTION_STATUS.CANCELLED
          ) {
            const failedProgress = failGenerationProgress(statusResponse);
            assistantMessage = {
              ...assistantMessage,
              content:
                statusResponse.message ||
                "요구사항명세서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
              metadata: {
                ...assistantMessage.metadata,
                state: CHAT_STATES.FAILED,
                actionId: pollingActionId,
                generationProgress: failedProgress,
                result: statusResponse.result ?? {},
                downloadFiles: [],
                pendingAction: null,
                suggestedActions: [],
                rawResponse: statusResponse,
              },
            };
          } else {
            const completedProgress = completeGenerationProgress(statusResponse);
            assistantMessage = {
              ...assistantMessage,
              content: statusResponse.message || assistantMessage.content,
              metadata: {
                ...assistantMessage.metadata,
                state: statusResponse.state ?? CHAT_STATES.COMPLETED,
                actionId: pollingActionId,
                generationProgress: completedProgress,
                result: statusResponse.result ?? {},
                downloadFiles: Array.isArray(statusResponse.download_files)
                  ? statusResponse.download_files
                  : [],
                pendingAction: null,
                suggestedActions: [],
                rawResponse: statusResponse,
              },
            };
          }
        }
      }
      const messageResult = await addMessagesToConversation(
        project.projectId,
        backendConversationId,
        [userMessage, assistantMessage],
      );

      setProject(messageResult.project);
      setActiveConversationIdState(backendConversationId);
      setActiveConversationId(project.projectId, backendConversationId);
      setLastCommandInfo({ commandText: actionMessage });
      if (isConfirmGenerationAction) {
        await loadUploadedFiles(project);
      }
    } catch (error) {
      if (isConfirmGenerationAction && isGenerationPollingCancelledError(error)) {
        return;
      }
      reportUiError("handleSuggestedActionClick", error, {
        projectId: project?.projectId,
        actionId,
        isConfirmGenerationAction,
      });
      const failedProgress = isConfirmGenerationAction
        ? failGenerationProgress()
        : null;
      if (isConfirmGenerationAction) {
        await wait(400);
      }
      const fallbackContent = isConfirmGenerationAction
        ? getGenerationFriendlyErrorMessage(error)
        : error instanceof Error
        ? error.message
        : "대기 작업을 처리하지 못했습니다.";
      const fallbackMessage = {
        id: createChatId("assistant"),
        role: "assistant",
        content: fallbackContent,
        createdAt: formatDateTime(),
        metadata: failedProgress
          ? {
              state: CHAT_STATES.FAILED,
              generationProgress: failedProgress,
              suggestedActions: [],
              pendingAction: null,
            }
          : {},
      };
      const fallbackResult = await addMessageToConversation(
        project.projectId,
        targetConversationId,
        fallbackMessage,
      );
      setProject(fallbackResult.project);
    } finally {
      setIsResponding(false);
      if (shouldResetGenerationState) {
        clearGenerationPolling({ rejectPending: true });
        if (action.type === CHAT_ACTION_COMMAND_TYPES.CANCEL_PENDING_ACTION) {
          setGenerationProgress(null);
          setGenerationJob(null);
          setIsProgressModalOpen(false);
          setProgressMinimizedState(false);
        }
        setSelectedDocumentIds([]);
        setDocumentStatusMessage("");
      }
    }
  };

  const handleCommandActionClick = async (message, action) => {
    if (!project || isResponding) return;

    const commandText = String(
      action?.message || action?.command || action?.label || "",
    ).trim();
    if (!commandText) return;

    const targetConversationId =
      message.metadata?.conversationId || activeConversationId;
    if (targetConversationId) {
      await clearMessageActions({
        conversationId: targetConversationId,
        message,
      });
    }
    sendMessage(commandText);
  };

  const handleDownloadFile = async (file) => {
    if (!project || !file?.artifact_id) {
      setDocumentError("다운로드할 파일 정보를 확인하지 못했습니다.");
      return;
    }

    setDocumentError("");
    try {
      await downloadArtifactFile({
        projectId: project.projectId,
        artifactId: file.artifact_id,
        fileName: file.file_name || "요구사항명세서.xlsx",
      });
    } catch (error) {
      reportUiError("handleDownloadGeneratedFile", error, {
        projectId: project?.projectId,
        artifactId: file.artifact_id,
      });
      setDocumentError(
        error instanceof Error
          ? error.message
          : "파일을 다운로드하지 못했습니다.",
      );
    }
  };

  const handleDownloadGenerationJob = async () => {
    const downloadFile = generationJob?.downloadFiles?.[0];
    if (downloadFile?.artifact_id) {
      await handleDownloadFile(downloadFile);
      return;
    }

    const latestArtifact = generationJob?.targetArtifactType
      ? getLatestGeneratedArtifact(fileBuckets, generationJob.targetArtifactType)
      : null;
    if (latestArtifact?.fileId) {
      await handleDownloadDocumentNodeArtifact({ latestArtifact });
      return;
    }

    setDocumentError(
      "다운로드할 생성 파일을 찾을 수 없습니다. 파일 목록에서 다시 확인해 주세요.",
    );
  };

  const handleMinimizeProgressModal = () => {
    if (!generationJob) return;
    setIsProgressModalOpen(false);
    setProgressMinimizedState(true);
  };

  const handleRestoreProgressModal = () => {
    if (!generationJob) return;
    setIsProgressModalOpen(true);
    setProgressMinimizedState(false);
  };

  const handleCloseProgressModal = () => {
    if (generationJob?.status === GENERATION_JOB_STATUS.RUNNING) {
      handleMinimizeProgressModal();
      return;
    }
    setIsProgressModalOpen(false);
    setProgressMinimizedState(false);
  };

  const handleConversationTitleEditStart = (conversation) => {
    setEditingConversationId(conversation.conversationId);
    setEditingConversationTitle(conversation.title);
    setDeletingConversationId("");
    setConversationActionError("");
  };

  const handleConversationTitleSubmit = async (event) => {
    event.preventDefault();

    if (!project || !editingConversationId) return;

    try {
      const { project: updatedProject } = await updateConversationTitle(
        project.projectId,
        editingConversationId,
        editingConversationTitle,
      );
      setProject(updatedProject);
      setEditingConversationId("");
      setEditingConversationTitle("");
    } catch (error) {
      reportUiError("handleConversationTitleSubmit", error, {
        projectId: project?.projectId,
        conversationId: editingConversationId,
      });
      setConversationActionError(
        error instanceof Error
          ? error.message
          : "대화 제목을 저장하지 못했습니다.",
      );
    }
  };

  const handleDeleteConversation = async (conversationId) => {
    if (!project) return;

    try {
      const {
        project: updatedProject,
        activeConversationId: nextConversationId,
      } = await deleteConversation(project.projectId, conversationId);
      setProject(updatedProject);
      setActiveConversationIdState(nextConversationId);
      setComposerValue("");
      setDeletingConversationId("");

      if (editingConversationId === conversationId) {
        setEditingConversationId("");
        setEditingConversationTitle("");
      }
    } catch (error) {
      reportUiError("handleDeleteConversation", error, {
        projectId: project?.projectId,
        conversationId,
      });
      setConversationActionError(
        error instanceof Error ? error.message : "대화를 삭제하지 못했습니다.",
      );
    }
  };

  const handleChangeProject = () => {
    clearRecentProjectId();
    syncEntryRoute();
    setProject(null);
    setActiveConversationIdState("");
    setComposerValue("");
    setEntryError("");
    setPendingNewProjectId("");
    setNewProjectName("");
    setNewProjectStartDate(getTodayIsoDate());
    setNewProjectDescription("");
    setNewProjectError("");
    setIsSettingsOpen(false);
    setConversationActionError("");
    setEditingConversationId("");
    setEditingConversationTitle("");
    setDeletingConversationId("");
    setCommandRecommendations([]);
    setLastCommandInfo(null);
    setSelectedDocumentIds([]);
    setDocumentError("");
    setDocumentStatusMessage("");
    resetGenerationState();
    setIsSidebarDrawerOpen(false);
  };

  const openSettings = () => {
    if (!project) return;
    setSettingsName(project.projectName ?? "");
    setSettingsStartDate(getProjectStartDate(project) || getTodayIsoDate());
    setSettingsDescription(project.projectDescription ?? "");
    setSettingsError("");
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
    setSettingsError("");
  };

  const handleSettingsSubmit = async (event) => {
    event.preventDefault();

    if (!project) return;
    const formData = new FormData(event.currentTarget);
    const submittedProjectName = String(formData.get("projectName") ?? "");
    const submittedProjectStartDate = String(
      formData.get("start_date") ?? "",
    );
    const submittedProjectDescription = String(
      formData.get("projectDescription") ?? "",
    );

    if (!submittedProjectName.trim()) {
      setSettingsError("프로젝트명을 입력해주세요.");
      return;
    }
    if (!isValidProjectStartDate(submittedProjectStartDate)) {
      setSettingsError(PROJECT_START_DATE_ERROR);
      return;
    }

    setIsSavingSettings(true);
    setSettingsError("");

    try {
      const updatedProject = await updateProject(project.projectId, {
        projectName: submittedProjectName,
        projectDescription: submittedProjectDescription,
        start_date: submittedProjectStartDate,
      });
      setProject(updatedProject);
      setIsSettingsOpen(false);
    } catch (error) {
      reportUiError("handleSettingsSubmit", error, {
        projectId: project?.projectId,
      });
      setSettingsError(
        error instanceof Error
          ? error.message
          : "프로젝트 설정을 저장하지 못했습니다.",
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (!project) {
    return (
      <ProjectEntry
        projectId={entryProjectId}
        error={entryError}
        pendingNewProjectId={pendingNewProjectId}
        newProjectName={newProjectName}
        newProjectStartDate={newProjectStartDate}
        newProjectDescription={newProjectDescription}
        newProjectError={newProjectError}
        isLoading={isLoadingProject}
        isCreating={isCreatingProject}
        onProjectIdChange={handleEntryProjectIdChange}
        onNewProjectNameChange={setNewProjectName}
        onNewProjectStartDateChange={setNewProjectStartDate}
        onNewProjectDescriptionChange={setNewProjectDescription}
        onSubmit={handleEntrySubmit}
        onCreateProject={handleCreateProject}
      />
    );
  }

  return (
    <main
      className={`chat-app-shell ${
        isSidebarDrawerOpen ? "is-sidebar-open" : ""
      } ${isSidebarCollapsed ? "is-sidebar-collapsed" : ""}`}
    >
      <button
        className="sidebar-backdrop"
        type="button"
        aria-label="프로젝트 및 대화 목록 닫기"
        onClick={() => setIsSidebarDrawerOpen(false)}
      />
      <ProjectSidebar
        project={project}
        conversations={conversations}
        activeConversationId={activeConversationId}
        editingConversationId={editingConversationId}
        editingConversationTitle={editingConversationTitle}
        deletingConversationId={deletingConversationId}
        conversationActionError={conversationActionError}
        onChangeProject={handleChangeProject}
        onOpenFileManager={openFileManager}
        onOpenTodoManager={openTodoManager}
        onOpenSettings={openSettings}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onEditConversation={handleConversationTitleEditStart}
        onEditingConversationTitleChange={setEditingConversationTitle}
        onConversationTitleSubmit={handleConversationTitleSubmit}
        onCancelConversationTitleEdit={() => {
          setEditingConversationId("");
          setEditingConversationTitle("");
        }}
        onRequestDeleteConversation={setDeletingConversationId}
        onCancelDeleteConversation={() => setDeletingConversationId("")}
        onDeleteConversation={handleDeleteConversation}
        onCloseDrawer={() => setIsSidebarDrawerOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() =>
          setIsSidebarCollapsed((currentCollapsed) => !currentCollapsed)
        }
      />

      {activeWorkspaceTab === WORKSPACE_TABS.DOCUMENTS && (
        <DocumentGenerationHub
          project={project}
          nodes={documentHubNodes}
          selectedNode={selectedDocumentHubNode}
          isSidebarDrawerOpen={isSidebarDrawerOpen}
          activeTab={activeWorkspaceTab}
          onTabChange={handleWorkspaceTabChange}
          onOpenSidebar={() => setIsSidebarDrawerOpen(true)}
          onSelectNode={handleSelectDocumentHubNode}
          onDownloadNodeArtifact={handleDownloadDocumentNodeArtifact}
        />
      )}
      {activeWorkspaceTab === WORKSPACE_TABS.SCHEDULE && (
        <ProjectScheduleCalendar
          project={project}
          todos={todoItems}
          scheduleMonth={scheduleMonth}
          selectedDate={selectedScheduleDate}
          calendarViewMode={calendarViewMode}
          isSidebarDrawerOpen={isSidebarDrawerOpen}
          isLoading={isLoadingTodos}
          error={todoError}
          activeTab={activeWorkspaceTab}
          onTabChange={handleWorkspaceTabChange}
          onOpenSidebar={() => setIsSidebarDrawerOpen(true)}
          onDateSelect={handleScheduleDateSelect}
          onPeriodChange={handleSchedulePeriodChange}
          onViewModeChange={handleCalendarViewModeChange}
          onOpenRegistration={handleOpenScheduleRegistration}
        />
      )}
      {activeWorkspaceTab === WORKSPACE_TABS.TODAY && (
        <TodayTasksView
          project={project}
          todos={todoItems}
          isSidebarDrawerOpen={isSidebarDrawerOpen}
          isLoading={isLoadingTodos}
          error={todoError}
          actionError={todoActionError}
          savingTodoId={savingTodoId}
          editingTodoId={editingTodoId}
          editDraft={todoEditDraft}
          activeTab={activeWorkspaceTab}
          onTabChange={handleWorkspaceTabChange}
          onOpenSidebar={() => setIsSidebarDrawerOpen(true)}
          onStatusChange={handleTodoStatusChange}
          onStartEdit={handleStartTodoEdit}
          onCancelEdit={handleCancelTodoEdit}
          onEditDraftChange={handleTodoEditDraftChange}
          onSaveEdit={handleSaveTodoEdit}
          onDelete={handleDeleteTodo}
        />
      )}

      {isDocumentGenerationModalOpen && (
        <DocumentGenerationModal
          selectedNode={selectedDocumentHubNode}
          selectedRequest={selectedDocumentHubRequest}
          isResponding={isResponding}
          isUploadingDocument={isUploadingDocument}
          generationProgress={generationProgress}
          isLoadingDocuments={isLoadingUploadedFiles}
          documentError={documentError}
          documentStatusMessage={documentStatusMessage}
          onClose={handleCloseDocumentGenerationModal}
          onSelectNode={handleSelectDocumentHubNode}
          onGenerate={handleHubDocumentChoice}
          onUploadFiles={handleHubUploadFiles}
        />
      )}

      <GenerationProgressSurface
        job={generationJob}
        isOpen={isProgressModalOpen}
        isMinimized={isProgressMinimized}
        onRestore={handleRestoreProgressModal}
        onClose={handleCloseProgressModal}
        onDownload={handleDownloadGenerationJob}
      />

      <FloatingChatButton
        isOpen={isChatPopupOpen}
        onClick={() => {
          if (isChatPopupOpen) {
            setIsChatMaximized(false);
          }
          setIsChatPopupOpen((isOpen) => !isOpen);
        }}
      />

      {isChatPopupOpen && (
        <ChatPopup
          project={project}
          activeConversation={activeConversation}
          activeMessages={activeMessages}
          isResponding={isResponding}
          isUploadingDocument={isUploadingDocument}
          composerValue={composerValue}
          documentError={documentError}
          documentStatusMessage={documentStatusMessage}
          commandRecommendations={commandRecommendations}
          scrollRef={scrollRef}
          onClose={() => {
            setIsChatPopupOpen(false);
            setIsChatMaximized(false);
          }}
          isMaximized={isChatMaximized}
          onToggleMaximized={() =>
            setIsChatMaximized((currentMaximized) => !currentMaximized)
          }
          conversations={conversations}
          activeConversationId={activeConversationId}
          editingConversationId={editingConversationId}
          editingConversationTitle={editingConversationTitle}
          deletingConversationId={deletingConversationId}
          conversationActionError={conversationActionError}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onEditConversation={handleConversationTitleEditStart}
          onEditingConversationTitleChange={setEditingConversationTitle}
          onConversationTitleSubmit={handleConversationTitleSubmit}
          onCancelConversationTitleEdit={() => {
            setEditingConversationId("");
            setEditingConversationTitle("");
          }}
          onRequestDeleteConversation={setDeletingConversationId}
          onCancelDeleteConversation={() => setDeletingConversationId("")}
          onDeleteConversation={handleDeleteConversation}
          onComposerChange={setComposerValue}
          onMessageSubmit={handleMessageSubmit}
          onCommandRecommendationClick={handleCommandRecommendationClick}
          onAgentUploadFiles={handleAgentUploadFiles}
          onDownloadFile={handleDownloadFile}
          onDocumentChoice={handleDocumentChoice}
          onSuggestedActionClick={handleSuggestedActionClick}
          onCommandActionClick={handleCommandActionClick}
        />
      )}

      {isSettingsOpen && (
        <ProjectSettingsModal
          project={project}
          projectName={settingsName}
          projectStartDate={settingsStartDate}
          projectDescription={settingsDescription}
          error={settingsError}
          isSaving={isSavingSettings}
          onProjectNameChange={setSettingsName}
          onProjectStartDateChange={setSettingsStartDate}
          onProjectDescriptionChange={setSettingsDescription}
          onClose={closeSettings}
          onSubmit={handleSettingsSubmit}
        />
      )}
      {isFileManagerOpen && (
        <FileManagerModal
          project={project}
          fileBuckets={fileBuckets}
          activeTab={activeFileManagerTab}
          isLoading={isLoadingUploadedFiles}
          error={fileManagerError}
          actionError={fileActionError}
          pendingDeleteFile={pendingDeleteFile}
          deletingFileId={deletingFileId}
          downloadingFileId={downloadingFileId}
          editingFileTarget={editingFileTarget}
          renamingFileKey={renamingFileKey}
          fileNameDraft={fileNameDraft}
          onFileNameDraftChange={setFileNameDraft}
          onTabChange={setActiveFileManagerTab}
          onClose={closeFileManager}
          onDownloadUploaded={handleDownloadUploadedFile}
          onDownloadGenerated={handleDownloadGeneratedFile}
          onRequestDelete={handleRequestDeleteUploadedFile}
          onRequestGeneratedDelete={handleRequestDeleteGeneratedFile}
          onCancelDelete={handleCancelDeleteUploadedFile}
          onConfirmDelete={handleConfirmDeleteFile}
          onStartRename={handleStartFileRename}
          onCancelRename={handleCancelFileRename}
          onSaveRename={handleSaveFileRename}
        />
      )}
      {isTodoManagerOpen && (
        <TodoManagerModal
          project={project}
          todoItems={todoItems}
          statusFilter={todoStatusFilter}
          sourceFilter={todoSourceFilter}
          titleFilter={todoTitleFilter}
          assigneeFilter={todoAssigneeFilter}
          dateFilter={todoDateFilter}
          isLoading={isLoadingTodos}
          error={todoError}
          actionError={todoActionError}
          savingTodoId={savingTodoId}
          selectedTodoIds={selectedTodoIds}
          bulkStatus={bulkTodoStatus}
          isBulkActionRunning={isBulkTodoActionRunning}
          editingTodoId={editingTodoId}
          editDraft={todoEditDraft}
          isImportOpen={isTodoImportOpen}
          importDocuments={filteredTodoImportDocuments}
          importDocumentType={todoImportDocumentType}
          importUseExisting={todoImportUseExisting}
          importDocumentId={todoImportDocumentId}
          importFile={todoImportFile}
          importStatusMessage={todoImportStatusMessage}
          importPreview={todoImportPreview}
          selectedImportIds={selectedTodoImportIds}
          isLoadingDocuments={isLoadingUploadedFiles}
          isUploadingImportDocument={isUploadingTodoImportDocument}
          isPreviewingImport={isPreviewingTodoImport}
          isCommittingImport={isCommittingTodoImport}
          onClose={closeTodoManager}
          onStatusFilterChange={handleTodoStatusFilterChange}
          onSourceFilterChange={handleTodoSourceFilterChange}
          onTitleFilterChange={setTodoTitleFilter}
          onAssigneeFilterChange={setTodoAssigneeFilter}
          onDateFilterChange={setTodoDateFilter}
          onFilterReset={handleTodoFilterReset}
          onStatusChange={handleTodoStatusChange}
          onToggleTodoSelection={handleToggleTodoSelection}
          onSelectAllTodos={handleSelectAllTodos}
          onClearTodoSelection={handleClearTodoSelection}
          onBulkStatusChange={setBulkTodoStatus}
          onApplyBulkStatus={handleBulkTodoStatusApply}
          onBulkDelete={handleBulkDeleteTodos}
          onStartEdit={handleStartTodoEdit}
          onCancelEdit={handleCancelTodoEdit}
          onEditDraftChange={handleTodoEditDraftChange}
          onSaveEdit={handleSaveTodoEdit}
          onDelete={handleDeleteTodo}
          onToggleImport={handleOpenTodoImport}
          onImportDocumentTypeChange={handleTodoImportDocumentTypeChange}
          onImportUseExistingChange={handleTodoImportUseExistingChange}
          onImportDocumentChange={handleTodoImportDocumentChange}
          onImportFileChange={handleTodoImportFileChange}
          onUploadImportDocument={handleUploadTodoImportDocument}
          onPreviewImport={handlePreviewTodoImport}
          onToggleImportItem={handleToggleTodoImportItem}
          onSelectImportMode={handleSelectTodoImportMode}
          onCommitImport={handleCommitTodoImport}
        />
      )}
      {isScheduleDayModalOpen && (
        <ScheduleDayModal
          dateText={selectedScheduleDate}
          todos={selectedScheduleTodos}
          actionError={todoActionError}
          savingTodoId={savingTodoId}
          editingTodoId={editingTodoId}
          editDraft={todoEditDraft}
          onClose={() => {
            setIsScheduleDayModalOpen(false);
            setEditingTodoId("");
            setTodoActionError("");
          }}
          onStatusChange={handleTodoStatusChange}
          onStartEdit={handleStartTodoEdit}
          onCancelEdit={handleCancelTodoEdit}
          onEditDraftChange={handleTodoEditDraftChange}
          onSaveEdit={handleSaveTodoEdit}
          onDelete={handleDeleteTodo}
        />
      )}
      {isScheduleRegistrationOpen && (
        <ScheduleRegistrationModal
          mode={scheduleRegistrationMode}
          draft={scheduleDraft}
          importDocuments={filteredTodoImportDocuments}
          importDocumentType={todoImportDocumentType}
          importDocumentId={todoImportDocumentId}
          importFile={todoImportFile}
          importStatusMessage={todoImportStatusMessage}
          importPreview={todoImportPreview}
          selectedImportIds={selectedTodoImportIds}
          isLoadingDocuments={isLoadingUploadedFiles}
          isUploadingImportDocument={isUploadingTodoImportDocument}
          isPreviewingImport={isPreviewingTodoImport}
          isCommittingImport={isCommittingTodoImport}
          actionError={todoActionError}
          onClose={handleCloseScheduleRegistration}
          onModeChange={handleScheduleRegistrationModeChange}
          onDraftChange={handleScheduleDraftChange}
          onCreateManual={handleCreateManualSchedule}
          onImportDocumentTypeChange={handleTodoImportDocumentTypeChange}
          onImportDocumentChange={handleTodoImportDocumentChange}
          onImportFileChange={handleTodoImportFileChange}
          onPreviewImport={handlePreviewTodoImport}
          onToggleImportItem={handleToggleTodoImportItem}
          onSelectImportMode={handleSelectTodoImportMode}
          onCommitImport={handleCommitTodoImport}
        />
      )}
    </main>
  );
}

function DocumentGenerationHub({
  project,
  nodes,
  selectedNode,
  isSidebarDrawerOpen,
  activeTab,
  onTabChange,
  onOpenSidebar,
  onSelectNode,
  onDownloadNodeArtifact,
}) {
  return (
    <div className="document-hub-panel" role="main" aria-label="문서 생성 허브">
      <header className="document-hub-header">
        <button
          className="sidebar-menu-button"
          type="button"
          aria-label="프로젝트 및 대화 목록 열기"
          aria-expanded={isSidebarDrawerOpen}
          onClick={onOpenSidebar}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <div className="assistant-avatar">
          <BriefcaseBusiness size={20} aria-hidden="true" />
        </div>
        <div className="document-hub-title">
          <strong>문서 생성</strong>
          <span>문서 간 관계를 확인하고 생성할 문서를 선택하세요.</span>
        </div>
      </header>
      <WorkspaceTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="document-hub-scroll">
        <DocumentRelationMap
          nodes={nodes}
          selectedNodeId={selectedNode?.id}
          onSelectNode={onSelectNode}
          onDownloadNodeArtifact={onDownloadNodeArtifact}
        />
      </div>
    </div>
  );
}

function WorkspaceTabs({ activeTab, onTabChange }) {
  return (
    <nav className="workspace-tabs" aria-label="프로젝트 작업 탭">
      <button
        className={activeTab === WORKSPACE_TABS.DOCUMENTS ? "is-active" : ""}
        type="button"
        aria-current={activeTab === WORKSPACE_TABS.DOCUMENTS ? "page" : undefined}
        onClick={() => onTabChange(WORKSPACE_TABS.DOCUMENTS)}
      >
        <FileText size={16} aria-hidden="true" />
        문서 생성
      </button>
      <button
        className={activeTab === WORKSPACE_TABS.SCHEDULE ? "is-active" : ""}
        type="button"
        aria-current={activeTab === WORKSPACE_TABS.SCHEDULE ? "page" : undefined}
        onClick={() => onTabChange(WORKSPACE_TABS.SCHEDULE)}
      >
        <CalendarDays size={16} aria-hidden="true" />
        프로젝트 일정
      </button>
      <button
        className={activeTab === WORKSPACE_TABS.TODAY ? "is-active" : ""}
        type="button"
        aria-current={activeTab === WORKSPACE_TABS.TODAY ? "page" : undefined}
        onClick={() => onTabChange(WORKSPACE_TABS.TODAY)}
      >
        <Check size={16} aria-hidden="true" />
        오늘의 할일
      </button>
    </nav>
  );
}

const getTodoStatusTone = (status = "") => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "DONE" || normalized === "COMPLETED") return "done";
  if (normalized === "IN_PROGRESS") return "in-progress";
  return "not-started";
};

const getTodoStatusLabel = (status = "") =>
  TODO_STATUS_OPTIONS.find((option) => option.value === status)?.label || "진행전";

function TodoSourceBadge({ todo }) {
  return (
    <span className={`todo-source-badge is-source-${getTodoSourceKind(todo)}`}>
      {getTodoSourceLabel(todo)}
    </span>
  );
}

function TodoDdayChip({ todo }) {
  const label = getTodoDdayLabel(todo);
  if (!label) return null;
  return (
    <span
      className={[
        "todo-dday-chip",
        isTodoDeadlineSoon(todo) ? "is-deadline-soon" : "",
        isTodoOverdue(todo) ? "is-overdue" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </span>
  );
}

function TodoScheduleBadges({ todo }) {
  return (
    <div className="todo-schedule-badges">
      <TodoSourceBadge todo={todo} />
      <span>{formatScheduleRangeLabel(todo)}</span>
      <TodoDdayChip todo={todo} />
    </div>
  );
}

function ScheduleStatusPicker({
  status,
  disabled = false,
  ariaLabel = "진행상태",
  onChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const currentStatus = status || "NOT_STARTED";

  const handleSelect = (value) => {
    setIsOpen(false);
    if (value !== currentStatus) {
      onChange(value);
    }
  };

  return (
    <div
      className="schedule-status-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        className={`schedule-status is-${getTodoStatusTone(currentStatus)}`}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentOpen) => !currentOpen)}
      >
        <span>{getTodoStatusLabel(currentStatus)}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="schedule-status-menu" role="listbox" aria-label={ariaLabel}>
          {TODO_STATUS_OPTIONS.map((option) => (
            <button
              className={option.value === currentStatus ? "is-selected" : ""}
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === currentStatus}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectScheduleCalendar({
  project,
  todos,
  scheduleMonth,
  selectedDate,
  calendarViewMode,
  isSidebarDrawerOpen,
  isLoading,
  error,
  activeTab,
  onTabChange,
  onOpenSidebar,
  onDateSelect,
  onPeriodChange,
  onViewModeChange,
  onOpenRegistration,
}) {
  const isWeekView = calendarViewMode === CALENDAR_VIEW_MODES.WEEK;
  const weeks = isWeekView
    ? [getCalendarWeek(selectedDate)]
    : getCalendarWeeks(scheduleMonth);
  const datedTodos = useMemo(
    () => todos.filter((todo) => getTodoScheduleRange(todo)),
    [todos],
  );
  const today = getTodayIsoDate();
  const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
  const calendarWeekdayHeaders = isWeekView
    ? weeks[0].map((cell) => formatWeekdayHeader(cell.dateText))
    : weekdayLabels;
  const calendarTitle = isWeekView
    ? formatWeekLabel(selectedDate)
    : formatMonthLabel(scheduleMonth);
  const navigationLabelPrefix = isWeekView ? "주" : "달";

  return (
    <div className="document-hub-panel schedule-panel" role="main" aria-label="프로젝트 일정">
      <header className="document-hub-header">
        <button
          className="sidebar-menu-button"
          type="button"
          aria-label="프로젝트 및 대화 목록 열기"
          aria-expanded={isSidebarDrawerOpen}
          onClick={onOpenSidebar}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <div className="assistant-avatar">
          <CalendarDays size={20} aria-hidden="true" />
        </div>
        <div className="document-hub-title">
          <strong>프로젝트 일정</strong>
          <span>{project.projectName}의 할일과 주요 일정을 월간 캘린더로 확인하세요.</span>
        </div>
      </header>
      <WorkspaceTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="schedule-scroll">
        <section className="schedule-month-header" aria-label="캘린더 일정 도구">
          <div className="schedule-month-header__left">
            <div className="schedule-view-toggle" role="group" aria-label="캘린더 보기 방식">
              <button
                className={calendarViewMode === CALENDAR_VIEW_MODES.MONTH ? "is-active" : ""}
                type="button"
                aria-pressed={calendarViewMode === CALENDAR_VIEW_MODES.MONTH}
                onClick={() => onViewModeChange(CALENDAR_VIEW_MODES.MONTH)}
              >
                월간
              </button>
              <button
                className={calendarViewMode === CALENDAR_VIEW_MODES.WEEK ? "is-active" : ""}
                type="button"
                aria-pressed={calendarViewMode === CALENDAR_VIEW_MODES.WEEK}
                onClick={() => onViewModeChange(CALENDAR_VIEW_MODES.WEEK)}
              >
                주간
              </button>
            </div>
          </div>
          <h2 className="schedule-month-header__title">{calendarTitle}</h2>
          <div className="schedule-month-header__right">
            <button
              className="primary-button schedule-register-button"
              type="button"
              onClick={onOpenRegistration}
            >
              <PlusCircle size={16} aria-hidden="true" />
              일정 등록
            </button>
          </div>
        </section>

        {error && <p className="form-error">{error}</p>}
        {isLoading && <p className="schedule-loading">일정을 불러오는 중입니다.</p>}

        <div className="schedule-calendar-shell">
          <button
            className="schedule-month-hit-zone schedule-month-hit-zone--prev"
            type="button"
            aria-label={`이전 ${navigationLabelPrefix} 보기`}
            onClick={() => onPeriodChange(-1)}
          >
            <ChevronLeft size={30} aria-hidden="true" />
          </button>
          <section
            className={`schedule-calendar ${isWeekView ? "is-week-view" : "is-month-view"}`}
            aria-label={`${calendarTitle} 캘린더`}
          >
            <div className="schedule-calendar__weekdays">
              {calendarWeekdayHeaders.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div
              className="schedule-calendar__weeks"
              style={{ "--schedule-week-count": String(weeks.length) }}
            >
              {weeks.map((week) => (
                <ScheduleWeekRow
                  key={week[0]?.dateText}
                  week={week}
                  todos={datedTodos}
                  today={today}
                  selectedDate={selectedDate}
                  isWeekView={isWeekView}
                  onDateSelect={onDateSelect}
                />
              ))}
            </div>
          </section>
          <button
            className="schedule-month-hit-zone schedule-month-hit-zone--next"
            type="button"
            aria-label={`다음 ${navigationLabelPrefix} 보기`}
            onClick={() => onPeriodChange(1)}
          >
            <ChevronRight size={30} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TodayTasksView({
  project,
  todos,
  isSidebarDrawerOpen,
  isLoading,
  error,
  actionError,
  savingTodoId,
  editingTodoId,
  editDraft,
  activeTab,
  onTabChange,
  onOpenSidebar,
  onStatusChange,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onSaveEdit,
  onDelete,
}) {
  const today = getTodayIsoDate();
  const todayTasks = useMemo(() => {
    return todos
      .filter((todo) => isDateInTodoScheduleRange(todo, today))
      .sort(compareTodosForSchedule);
  }, [todos, today]);
  const doneCount = todayTasks.filter(
    (todo) => getTodoStatusTone(todo.status) === "done",
  ).length;
  const activeCount = todayTasks.length - doneCount;

  return (
    <div className="document-hub-panel today-tasks-panel" role="main" aria-label="오늘의 할일">
      <header className="document-hub-header">
        <button
          className="sidebar-menu-button"
          type="button"
          aria-label="프로젝트 및 대화 목록 열기"
          aria-expanded={isSidebarDrawerOpen}
          onClick={onOpenSidebar}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <div className="assistant-avatar">
          <Check size={20} aria-hidden="true" />
        </div>
        <div className="document-hub-title">
          <strong>오늘의 할일</strong>
          <span>{project.projectName}의 오늘 진행할 할일을 카드로 확인하세요.</span>
        </div>
      </header>
      <WorkspaceTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="today-tasks-scroll">
        <section className="today-tasks-summary" aria-label="오늘 할일 요약">
          <div>
            <span>오늘</span>
            <h2>{formatDateLabel(today)}</h2>
            <p>
              오늘 진행해야 할 일정 {todayTasks.length}건
              {doneCount ? ` · 완료 ${doneCount}건` : ""}
            </p>
          </div>
          <div className="today-tasks-counter" aria-label={`진행 대상 ${activeCount}건`}>
            <strong>{activeCount}</strong>
            <span>진행 대상</span>
          </div>
        </section>

        {(error || actionError) && (
          <p className="form-error">{actionError || error}</p>
        )}
        {isLoading && <p className="schedule-loading">오늘의 할일을 불러오는 중입니다.</p>}

        {todayTasks.length ? (
          <ul className="today-task-list" aria-label="오늘의 할일 목록">
            {todayTasks.map((todo) => {
              const isEditing = editingTodoId === todo.todoId;
              const isSaving = savingTodoId === todo.todoId;
              return (
                <li
                  className={[
                    "today-task-card",
                    `is-${getTodoStatusTone(todo.status)}`,
                    getTodoScheduleClassNames(todo),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={todo.todoId || todo.title}
                >
                  <div className="today-task-card__content">
                    <div className="today-task-card__title">
                      <div>
                        <strong>{todo.title || "제목 없음"}</strong>
                        <TodoScheduleBadges todo={todo} />
                      </div>
                      <ScheduleStatusPicker
                        status={todo.status}
                        disabled={isSaving}
                        ariaLabel={`${todo.title || "제목 없음"} 진행상태`}
                        onChange={(status) => onStatusChange(todo, status)}
                      />
                    </div>

                    {isEditing ? (
                      <div className="schedule-edit-panel">
                        <label>
                          할일명
                          <input
                            type="text"
                            value={editDraft.title}
                            onChange={(event) => onEditDraftChange("title", event.target.value)}
                          />
                        </label>
                        <label>
                          담당자
                          <input
                            type="text"
                            value={editDraft.assignee}
                            onChange={(event) =>
                              onEditDraftChange("assignee", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          시작일
                          <input
                            type="date"
                            value={editDraft.startDate}
                            onInput={(event) =>
                              onEditDraftChange("startDate", event.currentTarget.value)
                            }
                            onChange={(event) =>
                              onEditDraftChange("startDate", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          종료일
                          <input
                            type="date"
                            value={editDraft.endDate}
                            onInput={(event) =>
                              onEditDraftChange("endDate", event.currentTarget.value)
                            }
                            onChange={(event) =>
                              onEditDraftChange("endDate", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          진행상태
                          <select
                            value={editDraft.status}
                            onChange={(event) => onEditDraftChange("status", event.target.value)}
                          >
                            {TODO_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="schedule-edit-description">
                          상세내용
                          <textarea
                            rows={3}
                            value={editDraft.description}
                            onChange={(event) =>
                              onEditDraftChange("description", event.target.value)
                            }
                          />
                        </label>
                        <div className="schedule-row-actions">
                          <button className="secondary-button" type="button" onClick={onCancelEdit}>
                            취소
                          </button>
                          <button
                            className="primary-button"
                            type="button"
                            disabled={isSaving}
                            onClick={() => onSaveEdit(todo)}
                          >
                            <Save size={14} aria-hidden="true" />
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <dl className="today-task-meta">
                          <div>
                            <dt>담당자</dt>
                            <dd>{todo.assignee || "미정"}</dd>
                          </div>
                          <div>
                            <dt>기한</dt>
                            <dd>{formatTodoDeadlineWithDday(todo)}</dd>
                          </div>
                          <div>
                            <dt>출처</dt>
                            <dd><TodoSourceBadge todo={todo} /></dd>
                          </div>
                        </dl>
                        <p>{todo.description || "상세내용이 없습니다."}</p>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="schedule-row-actions">
                      <button
                        className="inline-icon-button"
                        type="button"
                        title="할일 수정"
                        aria-label={`${todo.title || "제목 없음"} 할일 수정`}
                        onClick={() => onStartEdit(todo)}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        className="inline-icon-button"
                        type="button"
                        title="할일 삭제"
                        aria-label={`${todo.title || "제목 없음"} 할일 삭제`}
                        onClick={() => onDelete(todo)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          !isLoading && (
            <section className="today-tasks-empty" aria-label="오늘의 할일 없음">
              <Check size={22} aria-hidden="true" />
              <strong>오늘 진행할 할일이 없습니다.</strong>
              <p>프로젝트 일정에서 일정을 등록하거나 문서에서 할일을 불러올 수 있습니다.</p>
            </section>
          )
        )}
      </div>
    </div>
  );
}

function ScheduleWeekRow({
  week,
  todos,
  today,
  selectedDate,
  isWeekView = false,
  onDateSelect,
}) {
  const maxRows = isWeekView ? 8 : 3;
  const { visibleSegments, hiddenCount } = getWeekScheduleSegments(
    week,
    todos,
    maxRows,
  );

  return (
    <div className={`schedule-week-row ${isWeekView ? "is-week-view" : ""}`}>
      <div className="schedule-week-days">
        {week.map((cell) => (
          <button
            key={cell.dateText}
            className={[
              "schedule-day",
              !isWeekView && !cell.isCurrentMonth ? "is-outside-month" : "",
              cell.dateText === today ? "is-today" : "",
              cell.dateText === selectedDate ? "is-selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            aria-label={`${formatDateLabel(cell.dateText)} 일정 보기`}
            onClick={() => onDateSelect(cell.dateText)}
          >
            {!isWeekView && (
              <span className="schedule-day__number">{cell.day}</span>
            )}
          </button>
        ))}
      </div>
      <div className="schedule-event-layer">
        {visibleSegments.map((segment) => (
          <button
            className={[
              "calendar-event-bar",
              `calendar-event-bar--${getTodoStatusTone(segment.todo.status)}`,
              getTodoScheduleClassNames(segment.todo),
            ]
              .filter(Boolean)
              .join(" ")}
            key={`${segment.todo.todoId || segment.todo.title}-${segment.segmentStart}`}
            style={{
              gridColumn: `${segment.startCol} / ${segment.endCol + 1}`,
              gridRow: segment.lane + 1,
            }}
            title={`${formatTodoDeadlineWithDday(segment.todo)} · ${
              segment.todo.title || "제목 없음"
            }`}
            type="button"
            onClick={() => onDateSelect(segment.segmentStart)}
          >
            <span className="calendar-event-status">
              {getTodoStatusLabel(segment.todo.status)}
            </span>
            <span className="calendar-event-title">
              {segment.todo.title || "제목 없음"}
            </span>
            <span className="calendar-event-dday">
              {getTodoDdayLabel(segment.todo)}
            </span>
          </button>
        ))}
        {hiddenCount > 0 && (
          <button
            className="schedule-event-more"
            style={{ gridColumn: "1 / -1", gridRow: maxRows + 1 }}
            type="button"
            onClick={() => onDateSelect(week[0].dateText)}
          >
            +{hiddenCount}개 더
          </button>
        )}
      </div>
    </div>
  );
}

function ScheduleDayModal({
  dateText,
  todos,
  actionError,
  savingTodoId,
  editingTodoId,
  editDraft,
  onClose,
  onStatusChange,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onSaveEdit,
  onDelete,
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="schedule-day-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-day-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span>프로젝트 일정</span>
            <h2 id="schedule-day-title">{formatDateLabel(dateText)} 일정</h2>
          </div>
          <button className="icon-button" type="button" aria-label="일정 팝업 닫기" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="schedule-day-modal__body">
          {actionError && <p className="form-error">{actionError}</p>}
          {todos.length ? (
            <ul className="schedule-day-list">
              {todos.map((todo) => {
                const isEditing = editingTodoId === todo.todoId;
                const isSaving = savingTodoId === todo.todoId;
                return (
                  <li
                    className={`schedule-day-item ${getTodoScheduleClassNames(todo)}`}
                    key={todo.todoId || todo.title}
                  >
                    <div className="schedule-day-item__main">
                      <div className="schedule-day-item__title">
                        <div>
                          <strong>{todo.title || "제목 없음"}</strong>
                          <TodoScheduleBadges todo={todo} />
                        </div>
                        <ScheduleStatusPicker
                          status={todo.status}
                          disabled={isSaving}
                          ariaLabel={`${todo.title || "제목 없음"} 진행상태`}
                          onChange={(status) => onStatusChange(todo, status)}
                        />
                      </div>
                      {!isEditing && (
                        <>
                          <dl className="schedule-day-meta">
                            <div>
                              <dt>담당자</dt>
                              <dd>{todo.assignee || "미정"}</dd>
                            </div>
                            <div>
                              <dt>기간</dt>
                              <dd>{formatTodoDeadlineWithDday(todo)}</dd>
                            </div>
                            <div>
                              <dt>출처</dt>
                              <dd><TodoSourceBadge todo={todo} /></dd>
                            </div>
                          </dl>
                          {todo.description && <p>{todo.description}</p>}
                        </>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="schedule-edit-panel">
                        <label>
                          할일명
                          <input
                            type="text"
                            value={editDraft.title}
                            onChange={(event) => onEditDraftChange("title", event.target.value)}
                          />
                        </label>
                        <label>
                          담당자
                          <input
                            type="text"
                            value={editDraft.assignee}
                            onChange={(event) => onEditDraftChange("assignee", event.target.value)}
                          />
                        </label>
                        <label>
                          시작일
                          <input
                            type="date"
                            value={editDraft.startDate}
                            onInput={(event) => onEditDraftChange("startDate", event.currentTarget.value)}
                            onChange={(event) => onEditDraftChange("startDate", event.target.value)}
                          />
                        </label>
                        <label>
                          종료일
                          <input
                            type="date"
                            value={editDraft.endDate}
                            onInput={(event) => onEditDraftChange("endDate", event.currentTarget.value)}
                            onChange={(event) => onEditDraftChange("endDate", event.target.value)}
                          />
                        </label>
                        <label>
                          진행상태
                          <select
                            value={editDraft.status}
                            onChange={(event) => onEditDraftChange("status", event.target.value)}
                          >
                            {TODO_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="schedule-edit-description">
                          상세내용
                          <textarea
                            rows={3}
                            value={editDraft.description}
                            onChange={(event) => onEditDraftChange("description", event.target.value)}
                          />
                        </label>
                        <div className="schedule-row-actions">
                          <button className="secondary-button" type="button" onClick={onCancelEdit}>
                            취소
                          </button>
                          <button
                            className="primary-button"
                            type="button"
                            disabled={isSaving}
                            onClick={() => onSaveEdit(todo)}
                          >
                            <Save size={14} aria-hidden="true" />
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="schedule-row-actions">
                        <button
                          className="inline-icon-button"
                          type="button"
                          title="일정 수정"
                          aria-label={`${todo.title} 일정 수정`}
                          onClick={() => onStartEdit(todo)}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          className="inline-icon-button"
                          type="button"
                          title="일정 삭제"
                          aria-label={`${todo.title} 일정 삭제`}
                          onClick={() => onDelete(todo)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-state">선택한 날짜에 등록된 일정이 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function ScheduleRegistrationModal({
  mode,
  draft,
  importDocuments,
  importDocumentType,
  importDocumentId,
  importFile,
  importStatusMessage,
  importPreview,
  selectedImportIds,
  isLoadingDocuments,
  isUploadingImportDocument,
  isPreviewingImport,
  isCommittingImport,
  actionError,
  onClose,
  onModeChange,
  onDraftChange,
  onCreateManual,
  onImportDocumentTypeChange,
  onImportDocumentChange,
  onImportFileChange,
  onPreviewImport,
  onToggleImportItem,
  onSelectImportMode,
  onCommitImport,
}) {
  const isImportMode = mode !== SCHEDULE_REGISTRATION_MODES.MANUAL;
  const candidateCount =
    (importPreview?.newItems?.length || 0) +
    (importPreview?.duplicateItems?.length || 0);
  const selectedCount = selectedImportIds.length;
  const registrationModeOptions = [
    {
      value: SCHEDULE_REGISTRATION_MODES.MANUAL,
      title: "직접 등록",
      description: "할일을 직접 입력합니다.",
    },
    {
      value: SCHEDULE_REGISTRATION_MODES.EXISTING,
      title: "기존 문서 사용",
      description: "등록된 회의록/WBS에서 불러옵니다.",
    },
    {
      value: SCHEDULE_REGISTRATION_MODES.UPLOAD,
      title: "문서 업로드",
      description: "새 문서를 업로드해 불러옵니다.",
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="schedule-registration-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-registration-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header schedule-registration-header">
          <div className="modal-header__copy">
            <h2 id="schedule-registration-title">일정 등록</h2>
            <p>직접 입력하거나 문서에서 할일을 불러와 등록합니다.</p>
          </div>
          <button className="icon-button" type="button" aria-label="일정 등록 닫기" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="schedule-registration-body">
          <fieldset
            className="schedule-registration-mode"
            role="radiogroup"
            aria-label="등록 방식"
          >
            <legend>등록 방식</legend>
            {registrationModeOptions.map((option) => (
              <label
                className={`registration-mode-card ${
                  mode === option.value ? "is-selected" : ""
                }`}
                key={option.value}
              >
                <input
                  type="radio"
                  name="schedule-registration-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => onModeChange(option.value)}
                />
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </label>
            ))}
          </fieldset>

          {actionError && <p className="form-error">{actionError}</p>}

          {mode === SCHEDULE_REGISTRATION_MODES.MANUAL ? (
            <form className="schedule-manual-form" onSubmit={onCreateManual}>
              <label>
                할일명
                <input
                  type="text"
                  value={draft.title}
                  onChange={(event) => onDraftChange("title", event.target.value)}
                  placeholder="예: 요구사항 누락 항목 검토"
                />
              </label>
              <label>
                담당자
                <input
                  type="text"
                  value={draft.assignee}
                  onChange={(event) => onDraftChange("assignee", event.target.value)}
                  placeholder="담당자"
                />
              </label>
              <label>
                시작일
                <input
                  type="date"
                  value={draft.startDate}
                  onInput={(event) => onDraftChange("startDate", event.currentTarget.value)}
                  onChange={(event) => onDraftChange("startDate", event.target.value)}
                />
              </label>
              <label>
                종료일
                <input
                  type="date"
                  value={draft.endDate}
                  onInput={(event) => onDraftChange("endDate", event.currentTarget.value)}
                  onChange={(event) => onDraftChange("endDate", event.target.value)}
                />
              </label>
              <label>
                진행상태
                <select
                  value={draft.status}
                  onChange={(event) => onDraftChange("status", event.target.value)}
                >
                  {TODO_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="schedule-manual-description">
                상세내용
                <textarea
                  rows={4}
                  value={draft.description}
                  onChange={(event) => onDraftChange("description", event.target.value)}
                  placeholder="상세 내용을 입력하세요."
                />
              </label>
              <button className="primary-button" type="submit" disabled={isCommittingImport}>
                {isCommittingImport ? "등록 중" : "등록"}
              </button>
            </form>
          ) : (
            <div className="schedule-import-panel">
              <div className="schedule-import-grid">
                <label>
                  문서 유형
                  <select
                    value={importDocumentType}
                    onChange={(event) => onImportDocumentTypeChange(event.target.value)}
                  >
                    {TODO_IMPORT_DOCUMENT_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {mode === SCHEDULE_REGISTRATION_MODES.EXISTING ? (
                  <label>
                    기존 문서
                    <select
                      value={importDocumentId}
                      disabled={isLoadingDocuments || !importDocuments.length}
                      onChange={(event) => onImportDocumentChange(event.target.value)}
                    >
                      {importDocuments.length ? (
                        importDocuments.map((document) => (
                          <option key={document.documentId} value={document.documentId}>
                            {document.fileName}
                          </option>
                        ))
                      ) : (
                        <option value="">선택 가능한 문서가 없습니다</option>
                      )}
                    </select>
                  </label>
                ) : (
                  <label
                    className="schedule-upload-control"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      onImportFileChange(event.dataTransfer.files?.[0] || null);
                    }}
                  >
                    파일 업로드
                    <input
                      type="file"
                      accept=".doc,.docx,.xls,.xlsx,.pdf,.txt"
                      onChange={(event) =>
                        onImportFileChange(event.target.files?.[0] || null)
                      }
                    />
                    <span>{importFile?.name || "파일 선택 또는 드래그 앤 드롭"}</span>
                  </label>
                )}
              </div>
              <button
                className="primary-button"
                type="button"
                disabled={
                  isPreviewingImport ||
                  isUploadingImportDocument ||
                  (mode === SCHEDULE_REGISTRATION_MODES.EXISTING && !importDocumentId) ||
                  (mode === SCHEDULE_REGISTRATION_MODES.UPLOAD && !importFile)
                }
                onClick={onPreviewImport}
              >
                {isPreviewingImport || isUploadingImportDocument
                  ? "불러오는 중"
                  : "할일 불러오기"}
              </button>
              {importStatusMessage && (
                <p className="todo-import-status" role="status">
                  {importStatusMessage}
                </p>
              )}
              {importPreview && (
                <div className="schedule-preview-panel">
                  <div className="todo-preview-header">
                    <div>
                      <strong>불러온 할일</strong>
                      <span>
                        후보 {candidateCount}개 · 선택 {selectedCount}개
                      </span>
                    </div>
                    <div>
                      <button className="mini-action-button" type="button" onClick={() => onSelectImportMode("new")}>
                        중복 제외
                      </button>
                      <button className="mini-action-button" type="button" onClick={() => onSelectImportMode("all")}>
                        모두 선택
                      </button>
                    </div>
                  </div>
                  <ScheduleImportPreviewList
                    preview={importPreview}
                    selectedIds={selectedImportIds}
                    onToggleItem={onToggleImportItem}
                  />
                  <button
                    className="primary-button schedule-preview-submit"
                    type="button"
                    disabled={!selectedCount || isCommittingImport}
                    onClick={onCommitImport}
                  >
                    {isCommittingImport
                      ? "등록 중"
                      : `선택한 ${selectedCount}개 등록`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ScheduleImportPreviewList({ preview, selectedIds, onToggleItem }) {
  const rows = [
    ...(preview?.newItems || []).map((item) => ({ item, duplicate: null })),
    ...(preview?.duplicateItems || []).map((duplicate) => ({
      item: duplicate.candidate,
      duplicate,
    })),
  ].sort((left, right) => compareTodosForSchedule(left.item, right.item));
  if (!rows.length) {
    return <p className="empty-state">문서에서 불러올 할일이 없습니다.</p>;
  }

  return (
    <ul className="schedule-preview-list">
      {rows.map(({ item, duplicate }) => {
        const itemId = item.clientImportId || item.todoId;
        return (
          <li
            className={[
              duplicate ? "is-duplicate" : "",
              getTodoScheduleClassNames(item),
            ]
              .filter(Boolean)
              .join(" ")}
            key={itemId || item.title}
          >
            <label>
              <input
                type="checkbox"
                checked={selectedIds.includes(itemId)}
                onChange={() => onToggleItem(itemId)}
              />
              <span>
                <strong>{item.title || "제목 없음"}</strong>
                <TodoScheduleBadges todo={item} />
                <small>
                  담당자: {item.assignee || "미정"} · 기간:{" "}
                  {formatTodoDeadlineWithDday(item)} · 상태:{" "}
                  {getTodoStatusLabel(item.status)}
                </small>
                {duplicate && (
                  <em>
                    중복 가능 · 기존 항목:{" "}
                    {duplicate.matchedExisting?.title || "유사 할일"}
                  </em>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function DocumentRelationMap({
  nodes,
  selectedNodeId,
  onSelectNode,
  onDownloadNodeArtifact,
}) {
  return (
    <section className="document-map" aria-label="문서 관계도">
      <div className="document-map__header">
        <div>
          <h2>문서 관계도</h2>
          <p>카드를 클릭하면 해당 문서 생성 팝업이 열립니다.</p>
        </div>
      </div>
      <div className="document-map__body">
        <div className="document-map__canvas">
          <svg
            className="document-map__edges"
            viewBox="0 0 1320 540"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="document-map-arrow"
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="6"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path
                  d="M2 2L10 6L2 10"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.4"
                />
              </marker>
            </defs>
            <path
              className="document-map__edge is-required"
              d="M262 202 C310 202 330 230 382 230"
            />
            <path
              className="document-map__edge is-optional"
              d="M262 418 C318 418 328 280 382 260"
            />
            <path
              className="document-map__edge is-required"
              d="M682 230 C742 230 756 180 800 180"
            />
            <path
              className="document-map__edge is-required"
              d="M682 258 C742 292 756 406 800 406"
            />
            <path
              className="document-map__edge is-required"
              d="M1022 180 C1062 180 1082 180 1120 180"
            />
          </svg>
          {nodes.map((node) => (
            <DocumentNodeCard
              key={node.id}
              node={node}
              isSelected={node.id === selectedNodeId}
              onSelectNode={onSelectNode}
              onDownloadNodeArtifact={onDownloadNodeArtifact}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function DocumentNodeCard({
  node,
  isSelected,
  onSelectNode,
  onDownloadNodeArtifact,
}) {
  const handleSelect = () => onSelectNode(node.id);
  const hasDownload = Boolean(node.latestArtifact?.fileId);
  const handleActionClick = (event) => {
    event.stopPropagation();
    handleSelect();
  };
  const handleDownloadClick = (event) => {
    event.stopPropagation();
    onDownloadNodeArtifact?.(node);
  };

  return (
    <article
      className={[
        "document-node",
        "document-map__node",
        node.positionClass,
        isSelected ? "is-selected" : "",
        node.isGeneratable ? "is-generatable" : "",
        node.isReady ? "is-ready" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-current={isSelected ? "true" : undefined}
      onClick={handleSelect}
    >
      <div className="document-node__header">
        <DocumentStatusChip label={node.statusLabel} tone={node.statusTone} />
        <strong>{node.label}</strong>
      </div>
      <p>{getDocumentNodeDescription(node)}</p>
      <dl className="document-node__meta">
        {node.latestArtifact && (
          <div>
            <dt>최근 파일</dt>
            <dd>{node.latestArtifact.fileName || "생성 파일"}</dd>
          </div>
        )}
        <div>
          <dt>{node.kind === "target" ? "기준" : "역할"}</dt>
          <dd>{node.basisLabel}</dd>
        </div>
      </dl>
      <div className="document-node__actions">
        <button
          className="document-node__action is-primary"
          type="button"
          onClick={handleActionClick}
        >
          {node.actionLabel}
        </button>
        {hasDownload && (
          <button
            className="document-node__action is-secondary"
            type="button"
            onClick={handleDownloadClick}
          >
            <Download size={14} aria-hidden="true" />
            다운로드
          </button>
        )}
      </div>
    </article>
  );
}

function getDocumentNodeDescription(node) {
  if (node.kind === "optional") {
    return node.isReady
      ? "요구사항명세서 생성 시 함께 반영할 수 있습니다."
      : "없어도 요구사항명세서 생성은 가능합니다.";
  }
  if (node.kind === "source") {
    return node.isReady
      ? "기준 문서가 준비되어 요구사항명세서를 생성할 수 있습니다."
      : "요구사항명세서 생성을 위해 업로드가 필요합니다.";
  }
  if (node.isReady) {
    return "문서가 준비되어 다음 산출물의 기준으로 사용할 수 있습니다.";
  }
  if (node.isGeneratable) {
    return `${node.basisLabel}가 준비되어 바로 생성할 수 있습니다.`;
  }
  const missingLabel = node.missingRequiredNodes[0]?.label || node.basisLabel;
  return `${missingLabel}가 필요합니다. 먼저 선행 문서를 준비해 주세요.`;
}

function DocumentStatusChip({ label, tone }) {
  return (
    <span className={`document-status-chip is-${tone}`}>
      <span className="document-status-light" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function DocumentGenerationModal({
  selectedNode,
  selectedRequest,
  isResponding,
  isUploadingDocument,
  generationProgress,
  isLoadingDocuments,
  documentError,
  documentStatusMessage,
  onClose,
  onSelectNode,
  onGenerate,
  onUploadFiles,
}) {
  const prerequisiteNode = selectedNode?.missingRequiredNodes?.[0];
  const shouldShowPrerequisiteGuide = Boolean(
    selectedNode?.requestType &&
      selectedNode.id !== DOCUMENT_HUB_DEFAULT_NODE_ID &&
      selectedNode.missingRequiredNodes?.length &&
      !selectedNode.isReady &&
      !selectedRequest?.documents?.length,
  );
  const modalTitle = selectedNode?.requestType
    ? `${selectedNode.label} 생성`
    : selectedNode?.label || "문서 생성";
  const isCloseDisabled = isResponding || isUploadingDocument;

  return (
    <div className="modal-backdrop document-generation-modal-backdrop">
      <section
        className="document-generation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-generation-modal-title"
      >
        <header className="document-generation-modal__header">
          <div>
            <span>문서 생성</span>
            <h2 id="document-generation-modal-title">{modalTitle}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={isCloseDisabled}
            aria-label="문서 생성 팝업 닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="document-generation-modal__body">
          <div className="document-generation-modal__status">
            {(documentError || documentStatusMessage || isUploadingDocument) && (
              <div
                className={`attachment-status ${documentError ? "is-error" : ""}`}
                role="status"
              >
                {isUploadingDocument
                  ? "파일을 업로드하는 중입니다."
                  : documentError || documentStatusMessage}
              </div>
            )}
            {isResponding && generationProgress && (
              <GenerationSubProgress progressState={generationProgress} />
            )}
          </div>

          {DOCUMENT_HUB_SOURCE_NODE_IDS.includes(selectedNode?.id) ? (
            <SourceDocumentPanel node={selectedNode} onSelectNode={onSelectNode} />
          ) : shouldShowPrerequisiteGuide ? (
            <BlockedDocumentPanel
              node={selectedNode}
              prerequisiteNode={prerequisiteNode}
              onSelectNode={onSelectNode}
            />
          ) : selectedRequest ? (
            <div className="document-generation-modal__choice">
              {isLoadingDocuments && (
                <div className="file-manager-loading" role="status">
                  <LoaderCircle size={18} aria-hidden="true" />
                  문서 상태를 불러오는 중입니다.
                </div>
              )}
              <DefaultDocumentChoicePanel
                request={selectedRequest}
                isDisabled={isResponding}
                isUploading={isUploadingDocument}
                onChoice={onGenerate}
                onUploadFiles={onUploadFiles}
              />
            </div>
          ) : (
            <SourceDocumentPanel node={selectedNode} onSelectNode={onSelectNode} />
          )}
        </div>
      </section>
    </div>
  );
}

function getGenerationJobProgress(job) {
  return Math.max(
    0,
    Math.min(100, Math.round(job?.progressState?.progress ?? 0)),
  );
}

function getGenerationJobStageText(job) {
  if (!job) return "";
  if (job.status === GENERATION_JOB_STATUS.COMPLETED) {
    return "생성 완료";
  }
  if (job.status === GENERATION_JOB_STATUS.FAILED) {
    return job.errorMessage || "문서 생성 중 오류가 발생했습니다.";
  }
  const progressState = job.progressState ?? {};
  const runningStep = (progressState.steps ?? []).find(
    (step) => step.status === "RUNNING" || step.status === "EXECUTING",
  );
  return (
    progressState.displayText ||
    runningStep?.message ||
    runningStep?.name ||
    progressState.label ||
    "진행 상태를 확인하고 있습니다."
  );
}

function GenerationStagePanel({ status, stageText }) {
  const isRunning = status === GENERATION_JOB_STATUS.RUNNING;
  const isCompleted = status === GENERATION_JOB_STATUS.COMPLETED;
  const isFailed = status === GENERATION_JOB_STATUS.FAILED;

  return (
    <section className="generation-progress-section generation-progress-current-stage">
      <span>현재 단계</span>
      <strong>
        {isRunning && (
          <LoaderCircle
            className="generation-progress-spinner"
            size={18}
            aria-hidden="true"
          />
        )}
        {isCompleted && <Check size={18} aria-hidden="true" />}
        {isFailed && <X size={18} aria-hidden="true" />}
        {stageText}
      </strong>
    </section>
  );
}

function GenerationAgentStatusList({ items }) {
  if (!items.length) return null;
  return (
    <section className="generation-progress-section generation-agent-status">
      <span>에이전트 수행 상태</span>
      <div className="generation-agent-status__list">
        {items.map((item) => (
          <div
            className={`generation-agent-status__item is-${item.status}`}
            key={`${item.label}-${item.status}`}
          >
            <span className="generation-agent-status__indicator" aria-hidden="true">
              {item.status === "completed" && <Check size={13} />}
              {item.status === "running" && (
                <LoaderCircle className="generation-progress-spinner" size={13} />
              )}
              {item.status === "failed" && <X size={13} />}
            </span>
            <div className="generation-agent-status__content">
              <strong>{item.label}</strong>
              {item.detail && (
                <p className="generation-agent-status__detail">{item.detail}</p>
              )}
              {item.unitItems?.length > 0 && (
                <div className="generation-agent-status__units">
                  <span>
                    {item.status === "failed"
                      ? "실패 위치"
                      : item.status === "completed"
                        ? "처리 완료"
                        : "상세 처리단위"}
                  </span>
                  <div>
                    {item.unitItems.map((unitItem) => (
                      <strong key={unitItem.key || unitItem.label}>
                        {unitItem.text}
                      </strong>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <small>{getAgentStatusLabel(item.status)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function GenerationProgressSurface({
  job,
  isOpen,
  isMinimized,
  onRestore,
  onClose,
  onDownload,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!job) return null;

  const progress = getGenerationJobProgress(job);
  const stageText = getGenerationJobStageText(job);
  const targetLabel = job.targetDocumentLabel || "문서";
  const isRunning = job.status === GENERATION_JOB_STATUS.RUNNING;
  const isCompleted = job.status === GENERATION_JOB_STATUS.COMPLETED;
  const isFailed = job.status === GENERATION_JOB_STATUS.FAILED;
  const agentItems = getGenerationAgentItems(
    job.progressState,
    job.status,
    stageText,
  );
  const title = isCompleted
    ? `${targetLabel} 생성 완료`
    : isFailed
    ? `${targetLabel} 생성 실패`
    : `${targetLabel} 생성 중`;
  const toastTitle = isCompleted
    ? "문서 생성 완료"
    : isFailed
    ? "문서 생성 실패"
    : "문서 생성 중";

  return (
    <>
      {isOpen && (
        <div
          className="modal-backdrop generation-progress-backdrop"
          onClick={onClose}
        >
          <section
            className={`generation-progress-modal is-${job.status.toLowerCase()}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="generation-progress-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="generation-progress-modal__header">
              <div>
                <span>진행상황</span>
                <h2 id="generation-progress-title">{title}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={onClose}
                aria-label={
                  isRunning ? "진행상황 팝업 최소화" : "진행상황 팝업 닫기"
                }
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="generation-progress-modal__body">
              <GenerationStagePanel status={job.status} stageText={stageText} />
              <section className="generation-progress-section generation-progress-overall">
                <ProgressBar
                  progress={progress}
                  label={`${progress}%`}
                  title="전체 진행률"
                />
              </section>
              <GenerationAgentStatusList items={agentItems} />
            </div>

            {isCompleted && (
              <footer className="generation-progress-modal__actions">
                <button
                  className="message-upload-button generation-progress-modal__download"
                  type="button"
                  onClick={onDownload}
                >
                  <Download size={16} aria-hidden="true" />
                  다운로드
                </button>
              </footer>
            )}
          </section>
        </div>
      )}

      {isMinimized && (
        <button
          className={`generation-progress-toast is-${job.status.toLowerCase()}`}
          type="button"
          onClick={onRestore}
        >
          <span className="generation-progress-toast__title">
            {isRunning && (
              <LoaderCircle
                className="generation-progress-spinner"
                size={17}
                aria-hidden="true"
              />
            )}
            {isCompleted && <Check size={17} aria-hidden="true" />}
            {isFailed && <X size={17} aria-hidden="true" />}
            <span>
              {toastTitle} · {stageText}
            </span>
          </span>
          <span className="generation-progress-toast__bar" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        </button>
      )}
    </>
  );
}

function SourceDocumentPanel({ node, onSelectNode }) {
  const targetNode = DOCUMENT_HUB_NODE_BY_ID[node?.nextNodeIds?.[0]];
  return (
    <div className="document-panel-guide">
      <div>
        <span>{node?.statusLabel}</span>
        <h2>{node?.label}</h2>
        <p>{getDocumentNodeDescription(node)}</p>
      </div>
      {targetNode && (
        <button
          className="message-upload-button"
          type="button"
          onClick={() => onSelectNode(targetNode.id)}
        >
          {targetNode.label} 생성 패널 열기
        </button>
      )}
    </div>
  );
}

function BlockedDocumentPanel({ node, prerequisiteNode, onSelectNode }) {
  return (
    <div className="document-panel-guide is-blocked">
      <div>
        <span>기준 문서 필요</span>
        <h2>{node.label} 생성</h2>
        <p>
          {node.label}를 생성하려면 {prerequisiteNode?.label || node.basisLabel}가
          필요합니다. 먼저 선행 문서를 준비해 주세요.
        </p>
      </div>
      {prerequisiteNode && (
        <button
          className="message-upload-button"
          type="button"
          onClick={() => onSelectNode(prerequisiteNode.id)}
        >
          {prerequisiteNode.label} 생성하기
        </button>
      )}
    </div>
  );
}

function FloatingChatButton({ isOpen, onClick }) {
  return (
    <button
      className={`floating-chat-button ${isOpen ? "is-open" : ""}`}
      type="button"
      aria-label={isOpen ? "채팅 팝업 닫기" : "채팅 팝업 열기"}
      aria-pressed={isOpen}
      onClick={onClick}
    >
      <Bot size={22} aria-hidden="true" />
    </button>
  );
}

function ChatPopup({
  project,
  activeConversation,
  activeMessages,
  isResponding,
  isUploadingDocument,
  composerValue,
  documentError,
  documentStatusMessage,
  commandRecommendations,
  scrollRef,
  onClose,
  isMaximized,
  onToggleMaximized,
  conversations,
  activeConversationId,
  editingConversationId,
  editingConversationTitle,
  deletingConversationId,
  conversationActionError,
  onNewChat,
  onSelectConversation,
  onEditConversation,
  onEditingConversationTitleChange,
  onConversationTitleSubmit,
  onCancelConversationTitleEdit,
  onRequestDeleteConversation,
  onCancelDeleteConversation,
  onDeleteConversation,
  onComposerChange,
  onMessageSubmit,
  onCommandRecommendationClick,
  onAgentUploadFiles,
  onDownloadFile,
  onDocumentChoice,
  onSuggestedActionClick,
  onCommandActionClick,
}) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const handleSelectConversation = (conversationId) => {
    setIsHistoryOpen(false);
    onSelectConversation(conversationId);
  };

  return (
    <div className={`chat-popup-shell ${isMaximized ? "is-maximized" : ""}`}>
      <nav className="chat-bookmark-rail" aria-label="채팅 빠른 메뉴">
        <button
          type="button"
          onClick={() => setIsHistoryOpen((isOpen) => !isOpen)}
          aria-expanded={isHistoryOpen}
        >
          <FolderOpen size={15} aria-hidden="true" />
          이전
        </button>
        <button type="button" onClick={onNewChat}>
          <PlusCircle size={15} aria-hidden="true" />
          새로
        </button>
      </nav>

      {isHistoryOpen && (
        <section className="chat-history-bookmark-panel" aria-label="이전 대화">
          <div className="chat-history-bookmark-panel__header">
            <strong>이전 대화</strong>
            <button
              className="icon-button"
              type="button"
              aria-label="이전 대화 닫기"
              onClick={() => setIsHistoryOpen(false)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {conversationActionError && (
            <p className="sidebar-error">{conversationActionError}</p>
          )}
          {conversations.length ? (
            <ul className="conversation-list">
              {conversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.conversationId}
                  conversation={conversation}
                  isActive={conversation.conversationId === activeConversationId}
                  isEditing={
                    conversation.conversationId === editingConversationId
                  }
                  isDeleting={
                    conversation.conversationId === deletingConversationId
                  }
                  editingTitle={editingConversationTitle}
                  onSelect={() =>
                    handleSelectConversation(conversation.conversationId)
                  }
                  onEdit={() => onEditConversation(conversation)}
                  onEditingTitleChange={onEditingConversationTitleChange}
                  onTitleSubmit={onConversationTitleSubmit}
                  onCancelEdit={onCancelConversationTitleEdit}
                  onRequestDelete={() =>
                    onRequestDeleteConversation(conversation.conversationId)
                  }
                  onCancelDelete={onCancelDeleteConversation}
                  onDelete={() => onDeleteConversation(conversation.conversationId)}
                />
              ))}
            </ul>
          ) : (
            <p className="conversation-empty">아직 대화가 없습니다.</p>
          )}
        </section>
      )}

      <aside
        className="chat-popup"
        role="dialog"
        aria-modal="false"
        aria-label="PM Agent 채팅"
      >
      <header className="chat-popup__header">
        <div>
          <span>Chat</span>
          <strong>{activeConversation?.title ?? "새 채팅"}</strong>
          <small>
            {project.projectName} · {project.projectId}
          </small>
        </div>
        <div className="chat-popup__header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={onToggleMaximized}
            aria-label={isMaximized ? "채팅 작게 보기" : "채팅 크게 보기"}
            title={isMaximized ? "채팅 작게 보기" : "채팅 크게 보기"}
          >
            {isMaximized ? (
              <Minimize2 size={17} aria-hidden="true" />
            ) : (
              <Maximize2 size={17} aria-hidden="true" />
            )}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="채팅 팝업 닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="chat-popup__thread">
        {activeConversation ? (
          activeMessages.length ? (
            activeMessages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                isResponding={isResponding}
                isUploadingDocument={isUploadingDocument}
                onAgentUploadFiles={onAgentUploadFiles}
                onDownloadFile={onDownloadFile}
                onDocumentChoice={onDocumentChoice}
                onSuggestedActionClick={onSuggestedActionClick}
                onCommandActionClick={onCommandActionClick}
              />
            ))
          ) : (
            <EmptyChatState
              title="새 채팅을 시작해보세요."
              description="요구사항 정의서 생성, WBS 일정 확인, 주간보고서 작성 등을 요청할 수 있습니다."
            />
          )
        ) : (
          <EmptyChatState
            title="새 채팅을 시작해보세요."
            description="요구사항 정의서 생성, WBS 일정 확인, 주간보고서 작성 등을 요청할 수 있습니다."
          />
        )}
        {isResponding && <TypingMessage />}
        <div ref={scrollRef} />
      </div>

      <footer className="chat-popup__footer">
        {(documentError || documentStatusMessage || isUploadingDocument) && (
          <div
            className={`attachment-status ${documentError ? "is-error" : ""}`}
            role="status"
          >
            {isUploadingDocument
              ? "파일을 업로드하는 중입니다."
              : documentError || documentStatusMessage}
          </div>
        )}
        <CommandRecommendationBar
          recommendations={commandRecommendations}
          isDisabled={isResponding}
          onSelect={onCommandRecommendationClick}
        />
        <form className="chat-composer" onSubmit={onMessageSubmit}>
          <textarea
            value={composerValue}
            placeholder="PM 산출물, 요구사항, 일정 관련 메시지를 입력하세요."
            rows={1}
            disabled={isResponding}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            aria-label="메시지 입력"
          />
          <button
            className={`send-button ${composerValue.trim() ? "" : "is-empty"}`}
            type="submit"
            disabled={!composerValue.trim() || isResponding || isUploadingDocument}
            aria-label="메시지 보내기"
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        </form>
      </footer>
    </aside>
    </div>
  );
}

function ProjectEntry({
  projectId,
  error,
  pendingNewProjectId,
  newProjectName,
  newProjectStartDate,
  newProjectDescription,
  newProjectError,
  isLoading,
  isCreating,
  onProjectIdChange,
  onNewProjectNameChange,
  onNewProjectStartDateChange,
  onNewProjectDescriptionChange,
  onSubmit,
  onCreateProject,
}) {
  const isNewProject = Boolean(pendingNewProjectId);

  return (
    <main className="entry-shell">
      <section className="entry-panel" aria-label="프로젝트 입장">
        <div className="entry-brand">
          <img
            className="entry-brand-logo"
            src="/assets/brand/KB_SymbolMark.png"
            alt="KB"
          />
          <span>FinPM Agent</span>
        </div>

        <div className="entry-copy">
          <p className="eyebrow">Project Workspace</p>
          <h1>FinPM Agent</h1>
        </div>

        <form className="entry-form" onSubmit={onSubmit}>
          <label htmlFor="project-id">프로젝트 ID</label>
          <div className="entry-input-row">
            <div className="entry-input">
              <input
                id="project-id"
                value={projectId}
                placeholder="project-001"
                autoComplete="off"
                onChange={(event) => onProjectIdChange(event.target.value)}
              />
            </div>
            <button
              className="primary-button"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <LoaderCircle size={18} aria-hidden="true" />
                  확인 중
                </>
              ) : (
                "프로젝트 입장"
              )}
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>

        <form
          className={`new-project-panel ${isNewProject ? "is-open" : ""}`}
          onSubmit={onCreateProject}
          aria-hidden={!isNewProject}
        >
          <div className="new-project-content">
            <div className="new-project-notice">
              <PlusCircle size={18} aria-hidden="true" />
              <div>
                <strong>신규 프로젝트입니다.</strong>
                <p>
                  {pendingNewProjectId} 프로젝트의 이름과 설명을 입력한 후
                  입장하세요.
                </p>
              </div>
            </div>

            <label htmlFor="new-project-name">프로젝트명</label>
            <input
              id="new-project-name"
              name="projectName"
              value={newProjectName}
              placeholder="예: 차세대 PM Agent 구축"
              required
              disabled={!isNewProject}
              onChange={(event) => onNewProjectNameChange(event.target.value)}
            />

            <label htmlFor="new-project-start-date">
              프로젝트 시작일 <span>선택</span>
            </label>
            <input
              id="new-project-start-date"
              name="start_date"
              type="date"
              value={newProjectStartDate}
              disabled={!isNewProject}
              onChange={(event) =>
                onNewProjectStartDateChange(
                  sanitizeProjectStartDateInput(event.target.value),
                )
              }
              max="9999-12-31"
              pattern="\d{4}-\d{2}-\d{2}"
            />

            <label htmlFor="new-project-description">
              프로젝트 설명 <span>선택</span>
            </label>
            <textarea
              id="new-project-description"
              name="projectDescription"
              value={newProjectDescription}
              placeholder="프로젝트 목적, 범위, 주요 산출물 등을 간단히 적어주세요."
              rows={3}
              disabled={!isNewProject}
              onChange={(event) =>
                onNewProjectDescriptionChange(event.target.value)
              }
            />

            {newProjectError && <p className="form-error">{newProjectError}</p>}

            <button
              className="primary-button"
              type="submit"
              disabled={!isNewProject || isCreating || !newProjectName.trim()}
            >
              {isCreating ? (
                <>
                  <LoaderCircle size={18} aria-hidden="true" />
                  생성 중
                </>
              ) : (
                "프로젝트 생성 후 입장"
              )}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function ProjectSidebar({
  project,
  conversations,
  activeConversationId,
  editingConversationId,
  editingConversationTitle,
  deletingConversationId,
  conversationActionError,
  onChangeProject,
  onOpenFileManager,
  onOpenTodoManager,
  onOpenSettings,
  onNewChat,
  onSelectConversation,
  onEditConversation,
  onEditingConversationTitleChange,
  onConversationTitleSubmit,
  onCancelConversationTitleEdit,
  onRequestDeleteConversation,
  onCancelDeleteConversation,
  onDeleteConversation,
  onCloseDrawer,
  isCollapsed,
  onToggleCollapsed,
}) {
  return (
    <aside
      className={`project-sidebar ${isCollapsed ? "is-collapsed" : ""}`}
      aria-label="프로젝트 정보"
    >
      <div className="sidebar-brand">
        <div className="app-brand" aria-label="KB FinPM Agent">
          <img
            className="app-brand-logo"
            src="/assets/brand/KB_SymbolMark.png"
            alt="KB"
          />
          <div className="app-brand-copy">
            <strong>FinPM Agent</strong>
            <span>KB Hackathon</span>
          </div>
        </div>
        <button
          className="sidebar-close-button"
          type="button"
          aria-label="프로젝트 및 대화 목록 닫기"
          onClick={onCloseDrawer}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <button
        className="sidebar-collapse-handle"
        type="button"
        aria-label={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
        title={isCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
        onClick={onToggleCollapsed}
      >
        {isCollapsed ? (
          <ChevronRight size={20} aria-hidden="true" />
        ) : (
          <ChevronLeft size={20} aria-hidden="true" />
        )}
      </button>

      <section className="project-info">
        <div className="project-info-title">
          <FolderOpen size={18} aria-hidden="true" />
          <span>현재 프로젝트</span>
          <button
            className="settings-button"
            type="button"
            onClick={onOpenSettings}
            aria-label="프로젝트 설정 열기"
            title="프로젝트 설정"
          >
            <Settings size={16} aria-hidden="true" />
          </button>
        </div>
        <strong>{project.projectName}</strong>
        <dl>
          <div>
            <dt>Project ID</dt>
            <dd>{project.projectId}</dd>
          </div>
          <div>
            <dt>프로젝트 시작일</dt>
            <dd>{getProjectStartDate(project) || "미입력"}</dd>
          </div>
        </dl>
        <p>{project.projectDescription || "프로젝트 설명이 아직 없습니다."}</p>
      </section>

      <button
        className="secondary-button"
        type="button"
        onClick={onOpenFileManager}
        title="업로드 파일 목록"
      >
        <FileText size={16} aria-hidden="true" />
        <span className="sidebar-action-label">업로드 파일 목록</span>
      </button>

      <button
        className="secondary-button"
        type="button"
        onClick={onOpenTodoManager}
        title="할일 관리"
      >
        <Check size={16} aria-hidden="true" />
        <span className="sidebar-action-label">할일 관리</span>
      </button>

      <button
        className="secondary-button"
        type="button"
        onClick={onChangeProject}
        title="프로젝트 변경"
      >
        <LogOut size={16} aria-hidden="true" />
        <span className="sidebar-action-label">프로젝트 변경</span>
      </button>
    </aside>
  );
}

function ConversationListItem({
  conversation,
  isActive,
  isEditing,
  isDeleting,
  editingTitle,
  onSelect,
  onEdit,
  onEditingTitleChange,
  onTitleSubmit,
  onCancelEdit,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}) {
  if (isEditing) {
    return (
      <li className="conversation-item is-editing">
        <form className="conversation-edit-form" onSubmit={onTitleSubmit}>
          <input
            value={editingTitle}
            autoFocus
            onChange={(event) => onEditingTitleChange(event.target.value)}
            aria-label="대화 제목 수정"
          />
          <div>
            <button className="mini-action-button primary" type="submit">
              저장
            </button>
            <button
              className="mini-action-button"
              type="button"
              onClick={onCancelEdit}
            >
              취소
            </button>
          </div>
        </form>
      </li>
    );
  }

  if (isDeleting) {
    return (
      <li className="conversation-item is-confirming-delete">
        <div className="conversation-delete-confirm">
          <p>이 대화를 삭제하시겠습니까?</p>
          <div>
            <button
              className="mini-action-button danger"
              type="button"
              onClick={onDelete}
            >
              삭제
            </button>
            <button
              className="mini-action-button"
              type="button"
              onClick={onCancelDelete}
            >
              취소
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className={`conversation-item ${isActive ? "is-active" : ""}`}>
      <button className="conversation-select" type="button" onClick={onSelect}>
        <span>{conversation.title}</span>
        <small>{conversation.updatedAt}</small>
      </button>
      <div className="conversation-actions">
        <button
          className="conversation-icon-button"
          type="button"
          onClick={onEdit}
          aria-label={`${conversation.title} 제목 수정`}
          title="대화 제목 수정"
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button
          className="conversation-icon-button danger"
          type="button"
          onClick={onRequestDelete}
          aria-label={`${conversation.title} 삭제`}
          title="대화 삭제"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function ProjectSettingsModal({
  project,
  projectName,
  projectStartDate,
  projectDescription,
  error,
  isSaving,
  onProjectNameChange,
  onProjectStartDateChange,
  onProjectDescriptionChange,
  onClose,
  onSubmit,
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
      >
        <header className="settings-modal-header">
          <div>
            <span>설정</span>
            <h2 id="project-settings-title">프로젝트 설정</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="설정 닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="settings-form" onSubmit={onSubmit}>
          <div className="readonly-field">
            <span>Project ID</span>
            <strong>{project.projectId}</strong>
          </div>

          <label htmlFor="settings-project-name">프로젝트명</label>
          <input
            id="settings-project-name"
            name="projectName"
            value={projectName}
            required
            onChange={(event) => onProjectNameChange(event.target.value)}
          />

          <label htmlFor="settings-project-start-date">
            프로젝트 시작일 <span>선택</span>
          </label>
          <input
            id="settings-project-start-date"
            name="start_date"
            type="date"
            value={projectStartDate}
            onChange={(event) =>
              onProjectStartDateChange(
                sanitizeProjectStartDateInput(event.target.value),
              )
            }
            max="9999-12-31"
            pattern="\d{4}-\d{2}-\d{2}"
          />

          <label htmlFor="settings-project-description">
            프로젝트 설명 <span>선택</span>
          </label>
          <textarea
            id="settings-project-description"
            name="projectDescription"
            value={projectDescription}
            rows={4}
            onChange={(event) => onProjectDescriptionChange(event.target.value)}
          />

          {error && <p className="form-error">{error}</p>}

          <div className="settings-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isSaving}
              onClick={onClose}
            >
              취소
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={isSaving || !projectName.trim()}
            >
              {isSaving ? (
                <>
                  <LoaderCircle size={18} aria-hidden="true" />
                  저장 중
                </>
              ) : (
                <>
                  <Save size={18} aria-hidden="true" />
                  저장
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TodoManagerModal({
  project,
  todoItems,
  statusFilter,
  sourceFilter,
  titleFilter,
  assigneeFilter,
  dateFilter,
  isLoading,
  error,
  actionError,
  savingTodoId,
  selectedTodoIds = [],
  bulkStatus = "IN_PROGRESS",
  isBulkActionRunning = false,
  editingTodoId,
  editDraft,
  isImportOpen,
  importDocuments,
  importDocumentType,
  importUseExisting,
  importDocumentId,
  importFile,
  importStatusMessage,
  importPreview,
  selectedImportIds,
  isLoadingDocuments,
  isUploadingImportDocument,
  isPreviewingImport,
  isCommittingImport,
  onClose,
  onStatusFilterChange,
  onSourceFilterChange,
  onTitleFilterChange,
  onAssigneeFilterChange,
  onDateFilterChange,
  onFilterReset,
  onStatusChange,
  onToggleTodoSelection,
  onSelectAllTodos,
  onClearTodoSelection,
  onBulkStatusChange,
  onApplyBulkStatus,
  onBulkDelete,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onSaveEdit,
  onDelete,
  onToggleImport,
  onImportDocumentTypeChange,
  onImportUseExistingChange,
  onImportDocumentChange,
  onImportFileChange,
  onUploadImportDocument,
  onPreviewImport,
  onToggleImportItem,
  onSelectImportMode,
  onCommitImport,
}) {
  const uploadInputId = useId();
  const [isImportDragOver, setIsImportDragOver] = useState(false);
  const hasProject = Boolean(project?.projectId);
  const previewNewItems = importPreview?.newItems ?? [];
  const previewDuplicateItems = importPreview?.duplicateItems ?? [];
  const previewCount = previewNewItems.length + previewDuplicateItems.length;
  const selectedCount = selectedImportIds.length;
  const selectedTodoIdSet = useMemo(
    () => new Set(selectedTodoIds),
    [selectedTodoIds],
  );
  const filteredTodoItems = useMemo(() => {
    const normalizeSearchText = (value = "") =>
      String(value ?? "").replace(/\s+/g, "").toLowerCase();
    const normalizedTitle = normalizeSearchText(titleFilter);
    const normalizedAssignee = normalizeSearchText(assigneeFilter);
    const normalizedDate = normalizeTodoDueDate(dateFilter);

    return todoItems.filter((todo) => {
      if (
        normalizedTitle &&
        !normalizeSearchText(todo.title).includes(normalizedTitle)
      ) {
        return false;
      }
      if (
        normalizedAssignee &&
        !normalizeSearchText(todo.assignee).includes(normalizedAssignee)
      ) {
        return false;
      }
      if (statusFilter && (todo.status || "NOT_STARTED") !== statusFilter) {
        return false;
      }
      if (sourceFilter && getTodoSourceFilterValue(todo) !== sourceFilter) {
        return false;
      }
      if (normalizedDate && !isDateInTodoScheduleRange(todo, normalizedDate)) {
        return false;
      }
      return true;
    }).sort(compareTodosForSchedule);
  }, [assigneeFilter, dateFilter, sourceFilter, statusFilter, titleFilter, todoItems]);
  const visibleTodoIds = useMemo(
    () => filteredTodoItems.map((todo) => todo.todoId).filter(Boolean),
    [filteredTodoItems],
  );
  const selectedVisibleTodoIds = useMemo(
    () => visibleTodoIds.filter((todoId) => selectedTodoIdSet.has(todoId)),
    [selectedTodoIdSet, visibleTodoIds],
  );
  const selectedVisibleCount = selectedVisibleTodoIds.length;
  const isAllVisibleSelected =
    visibleTodoIds.length > 0 && selectedVisibleCount === visibleTodoIds.length;
  const isPartiallySelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleTodoIds.length;
  const selectAllRef = useRef(null);
  const importDocumentLabel =
    TODO_IMPORT_DOCUMENT_TYPES.find(
      (option) => option.value === importDocumentType,
    )?.label || "문서";
  const isImportBusy =
    isUploadingImportDocument || isPreviewingImport || isCommittingImport;
  const canRunImport = importUseExisting
    ? Boolean(importDocumentId)
    : Boolean(importFile);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isPartiallySelected;
    }
  }, [isPartiallySelected]);

  const handleImportDragOver = (event) => {
    event.preventDefault();
    if (!isImportBusy) {
      setIsImportDragOver(true);
    }
  };

  const handleImportDragLeave = (event) => {
    event.preventDefault();
    setIsImportDragOver(false);
  };

  const handleImportDrop = (event) => {
    event.preventDefault();
    setIsImportDragOver(false);
    if (isImportBusy) return;
    const droppedFile = event.dataTransfer?.files?.[0] ?? null;
    if (droppedFile) {
      onImportFileChange(droppedFile);
    }
  };

  const renderPreviewItem = ({
    item,
    duplicateLevel = "NEW",
    matchedExisting = null,
  }) => {
    const itemId = item.clientImportId || item.todoId || item.title;
    const isSelected = selectedImportIds.includes(itemId);
    return (
      <li
        className={`todo-preview-item ${getTodoScheduleClassNames(item)}`}
        key={`${duplicateLevel}-${itemId}`}
      >
        <label>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleImportItem(itemId)}
          />
          <span>{duplicateLevel === "NEW" ? "신규" : duplicateLevel}</span>
        </label>
        <div className="todo-preview-body">
          <strong>{item.title || "제목 없음"}</strong>
          <TodoScheduleBadges todo={item} />
          <p>
            {item.assignee || "담당자 미정"} ·{" "}
            {formatTodoDeadlineWithDday(item)}
          </p>
          {matchedExisting?.title && (
            <div className="todo-duplicate-match">
              <span>기존 할일</span>
              <strong>{matchedExisting.title}</strong>
              <p>
                {matchedExisting.assignee || "담당자 미정"} ·{" "}
                {formatScheduleRangeLabel(matchedExisting)}
              </p>
            </div>
          )}
        </div>
      </li>
    );
  };

  const renderTodoItem = (todo) => {
    const isEditing = editingTodoId === todo.todoId;
    const isSaving = savingTodoId === todo.todoId;
    const isSelected = selectedTodoIdSet.has(todo.todoId);
    const isBusy = isSaving || isBulkActionRunning;
    return (
      <li
        className={[
          "todo-item",
          isSelected ? "is-selected" : "",
          getTodoScheduleClassNames(todo),
        ]
          .filter(Boolean)
          .join(" ")}
        key={todo.todoId || todo.title}
      >
        <div className="todo-item-main">
          <label className="todo-select-control">
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isBusy || !todo.todoId}
              aria-label={`${todo.title || "제목 없음"} 선택`}
              onChange={() => onToggleTodoSelection(todo.todoId)}
            />
          </label>
          <div className="todo-title-block">
            <strong>{todo.title || "제목 없음"}</strong>
            <span
              className={[
                "todo-summary-deadline",
                isTodoDeadlineSoon(todo) ? "is-deadline-soon" : "",
                isTodoOverdue(todo) ? "is-overdue" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {getTodoSummaryDeadlineLabel(todo)}
            </span>
          </div>
          <div className="todo-row-actions">
            <select
              value={todo.status || "NOT_STARTED"}
              disabled={isBusy}
              aria-label={`${todo.title} 진행상태`}
              onChange={(event) => onStatusChange(todo, event.target.value)}
            >
              {TODO_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="inline-icon-button"
              type="button"
              disabled={isBusy}
              title="할일 수정"
              aria-label={`${todo.title} 할일 수정`}
              onClick={() => onStartEdit(todo)}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button
              className="inline-icon-button"
              type="button"
              disabled={isBusy}
              title="할일 삭제"
              aria-label={`${todo.title} 할일 삭제`}
              onClick={() => onDelete(todo)}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        {!isEditing && (
          <details className="todo-detail-disclosure">
            <summary>상세정보</summary>
            <dl className="todo-detail-meta">
              <div>
                <dt>담당자</dt>
                <dd>{todo.assignee || "미정"}</dd>
              </div>
              <div>
                <dt>기간</dt>
                <dd>{formatTodoDeadlineWithDday(todo)}</dd>
              </div>
              <div>
                <dt>출처</dt>
                <dd><TodoSourceBadge todo={todo} /></dd>
              </div>
            </dl>
            {todo.description && (
              <p className="todo-description">{todo.description}</p>
            )}
          </details>
        )}
        {isEditing && (
          <div className="todo-edit-panel">
            <label>
              할일명
              <input
                value={editDraft.title}
                disabled={isBusy}
                onChange={(event) =>
                  onEditDraftChange("title", event.target.value)
                }
              />
            </label>
            <label>
              담당자
              <input
                value={editDraft.assignee}
                disabled={isBusy}
                onChange={(event) =>
                  onEditDraftChange("assignee", event.target.value)
                }
              />
            </label>
            <label>
              기한
              <input
                type="date"
                value={editDraft.dueDate}
                disabled={isBusy}
                onInput={(event) =>
                  onEditDraftChange("dueDate", event.currentTarget.value)
                }
                onChange={(event) =>
                  onEditDraftChange("dueDate", event.target.value)
                }
              />
            </label>
            <label>
              진행상태
              <select
                value={editDraft.status}
                disabled={isBusy}
                onChange={(event) =>
                  onEditDraftChange("status", event.target.value)
                }
              >
                {TODO_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="todo-edit-description">
              상세내용
              <textarea
                rows={3}
                value={editDraft.description}
                disabled={isBusy}
                onChange={(event) =>
                  onEditDraftChange("description", event.target.value)
                }
              />
            </label>
            <div className="todo-edit-actions">
              <button
                className="mini-action-button"
                type="button"
                disabled={isBusy}
                onClick={onCancelEdit}
              >
                취소
              </button>
              <button
                className="mini-action-button primary"
                type="button"
                disabled={isBusy || !editDraft.title.trim()}
                onClick={() => onSaveEdit(todo)}
              >
                {isSaving ? "저장 중" : "저장"}
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="modal-backdrop modal-backdrop-start" role="presentation">
      <section
        className="todo-manager-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="todo-manager-title"
      >
        <header className="settings-modal-header">
          <div>
            <span>할일</span>
            <h2 id="todo-manager-title">할일 관리</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="할일 관리 닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {actionError && <p className="form-error">{actionError}</p>}

        <div className="todo-manager-content">
          {!hasProject ? (
            <p className="file-manager-empty">프로젝트를 먼저 선택해 주세요.</p>
          ) : (
            <>
              <div className="todo-manager-toolbar">
                <div className="todo-filter-grid">
                  <label>
                    제목
                    <input
                      type="search"
                      value={titleFilter}
                      placeholder="할일명 검색"
                      onChange={(event) => onTitleFilterChange(event.target.value)}
                    />
                  </label>
                  <label>
                    담당자
                    <input
                      type="search"
                      value={assigneeFilter}
                      placeholder="담당자 검색"
                      onChange={(event) => onAssigneeFilterChange(event.target.value)}
                    />
                  </label>
                  <label>
                    기한
                    <input
                      type="date"
                      value={dateFilter}
                      onInput={(event) => onDateFilterChange(event.currentTarget.value)}
                      onChange={(event) => onDateFilterChange(event.target.value)}
                    />
                  </label>
                  <label>
                    진행여부
                    <select
                      value={statusFilter}
                      onChange={(event) =>
                        onStatusFilterChange(event.target.value)
                      }
                    >
                      {TODO_STATUS_FILTERS.map((option) => (
                        <option key={option.value || "ALL"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    출처
                    <select
                      value={sourceFilter}
                      onChange={(event) =>
                        onSourceFilterChange(event.target.value)
                      }
                    >
                      {TODO_SOURCE_FILTERS.map((option) => (
                        <option key={option.value || "ALL"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="todo-filter-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onStatusFilterChange(statusFilter)}
                  >
                    검색
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onFilterReset}
                  >
                    초기화
                  </button>
                </div>
              </div>
              <section className="todo-list-section">
                <div className="todo-list-header">
                  <div className="todo-list-heading">
                    <h3>할일 목록</h3>
                    <span>
                      전체 {todoItems.length}개 · 표시 {filteredTodoItems.length}개 · 선택 {selectedVisibleCount}개
                    </span>
                  </div>
                  <label className="todo-select-all">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={isAllVisibleSelected}
                      disabled={
                        !visibleTodoIds.length ||
                        isBulkActionRunning ||
                        isLoading
                      }
                      aria-label="전체 할일 선택"
                      onChange={() => onSelectAllTodos(visibleTodoIds)}
                    />
                    전체선택
                  </label>
                </div>
                {selectedVisibleCount > 0 && (
                  <div
                    className="todo-bulk-actions"
                    role="region"
                    aria-label="선택한 할일 일괄 작업"
                  >
                    <strong>선택 {selectedVisibleCount}개</strong>
                    <label className="todo-bulk-status">
                      진행상태
                      <select
                        value={bulkStatus}
                        disabled={isBulkActionRunning}
                        onChange={(event) =>
                          onBulkStatusChange(event.target.value)
                        }
                      >
                        {TODO_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="mini-action-button primary"
                      type="button"
                      disabled={isBulkActionRunning}
                      onClick={onApplyBulkStatus}
                    >
                      {isBulkActionRunning ? "변경 중" : "상태 변경"}
                    </button>
                    <button
                      className="mini-action-button danger"
                      type="button"
                      disabled={isBulkActionRunning}
                      onClick={onBulkDelete}
                    >
                      삭제
                    </button>
                    <button
                      className="mini-action-button"
                      type="button"
                      disabled={isBulkActionRunning}
                      onClick={onClearTodoSelection}
                    >
                      선택 해제
                    </button>
                  </div>
                )}
                {isLoading ? (
                  <div className="file-manager-loading" role="status">
                    <LoaderCircle size={18} aria-hidden="true" />
                    할일 목록을 불러오는 중입니다.
                  </div>
                ) : error ? (
                  <p className="form-error">{error}</p>
                ) : filteredTodoItems.length ? (
                  <ul className="todo-list">{filteredTodoItems.map(renderTodoItem)}</ul>
                ) : (
                  <p className="file-manager-section-empty">
                    조건에 맞는 할일이 없습니다.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function FileManagerModal({
  project,
  fileBuckets,
  activeTab,
  isLoading,
  error,
  actionError,
  pendingDeleteFile,
  deletingFileId,
  downloadingFileId,
  editingFileTarget,
  renamingFileKey,
  fileNameDraft,
  onFileNameDraftChange,
  onTabChange,
  onClose,
  onDownloadUploaded,
  onDownloadGenerated,
  onRequestDelete,
  onRequestGeneratedDelete,
  onCancelDelete,
  onConfirmDelete,
  onStartRename,
  onCancelRename,
  onSaveRename,
}) {
  const hasProject = Boolean(project?.projectId);
  const uploadedFiles = Array.isArray(fileBuckets?.uploaded)
    ? fileBuckets.uploaded
    : [];
  const generatedFiles = Array.isArray(fileBuckets?.generated)
    ? fileBuckets.generated
    : [];
  const currentTab =
    activeTab === FILE_MANAGER_TABS.GENERATED
      ? FILE_MANAGER_TABS.GENERATED
      : FILE_MANAGER_TABS.UPLOADED;
  const renderFiles = (files, fileKind) => {
    const isGenerated = fileKind === FILE_KINDS.GENERATED;
    const emptyText = isGenerated
      ? "생성한 파일이 없습니다."
      : "업로드한 파일이 없습니다.";
    const timeHeader = isGenerated ? "생성 시간" : "업로드 시간";

    return (
      <div className="file-list-table">
        <div className="file-list-table-header" role="row">
          <span>파일명</span>
          <span>{timeHeader}</span>
          <span>파일크기</span>
          <span>파일유형</span>
          <span>관리</span>
        </div>
        <div className="file-list-table-body">
          {!files.length ? (
            <p className="file-manager-section-empty">{emptyText}</p>
          ) : (
            <ul className="uploaded-file-list">
              {files.map((file) => {
                const fileKey = getFileActionKey(file, fileKind);
                const isPendingDelete =
                  pendingDeleteFile?.fileKind === fileKind &&
                  pendingDeleteFile?.fileId === file.fileId;
                const isDeleting = deletingFileId === fileKey;
                const isDownloading = downloadingFileId === fileKey;
                const isEditing =
                  editingFileTarget?.fileKind === fileKind &&
                  editingFileTarget?.fileId === file.fileId;
                const isRenaming = renamingFileKey === fileKey;
                const documentLabel = isGenerated
                  ? file.documentLabel || getArtifactDisplayLabel(file.artifactType)
                  : file.documentLabel || getDocumentDisplayLabel(file.documentType);
                const timeValue = isGenerated ? file.createdAt : file.uploadedAt;
                const handleDownload = isGenerated
                  ? onDownloadGenerated
                  : onDownloadUploaded;
                const handleDelete = isGenerated
                  ? onRequestGeneratedDelete
                  : onRequestDelete;

                return (
                  <li className="uploaded-file-item" key={`${fileKind}-${file.fileId}`}>
                    <div className="uploaded-file-main">
                      <FileText size={18} aria-hidden="true" />
                      <div>
                        <div className="file-name-row">
                          {isEditing ? (
                            <>
                              <input
                                className="generated-file-name-input"
                                value={fileNameDraft}
                                disabled={isRenaming}
                                onChange={(event) =>
                                  onFileNameDraftChange(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    onSaveRename(file, fileKind);
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    onCancelRename();
                                  }
                                }}
                                aria-label="파일명"
                              />
                              <button
                                className="inline-icon-button"
                                type="button"
                                disabled={isRenaming}
                                onClick={() => onSaveRename(file, fileKind)}
                                aria-label="파일명 저장"
                              >
                                <Save size={14} aria-hidden="true" />
                              </button>
                              <button
                                className="inline-icon-button"
                                type="button"
                                disabled={isRenaming}
                                onClick={onCancelRename}
                                aria-label="파일명 수정 취소"
                              >
                                <X size={14} aria-hidden="true" />
                              </button>
                            </>
                          ) : (
                            <>
                              <strong>{file.fileName}</strong>
                              <button
                                className="inline-icon-button"
                                type="button"
                                disabled={isDeleting || isDownloading}
                                onClick={() => onStartRename(file, fileKind)}
                                aria-label={`${file.fileName} 파일명 수정`}
                                title="파일명 수정"
                              >
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                        <span>{documentLabel}</span>
                      </div>
                    </div>
                    <div className="uploaded-file-cell">
                      <span className="uploaded-file-cell-label">{timeHeader}</span>
                      <strong>{formatFileUploadedAt(timeValue, timeHeader)}</strong>
                    </div>
                    <div className="uploaded-file-cell">
                      <span className="uploaded-file-cell-label">파일크기</span>
                      <strong>{formatFileSize(file.fileSize)}</strong>
                    </div>
                    <div className="uploaded-file-cell">
                      <span className="uploaded-file-cell-label">파일유형</span>
                      <strong>{file.fileType}</strong>
                    </div>
                    <div className="uploaded-file-actions">
                      <button
                        className="mini-action-button"
                        type="button"
                        disabled={isDeleting || isDownloading || isRenaming}
                        onClick={() => handleDownload(file)}
                      >
                        {isDownloading ? (
                          <>
                            <LoaderCircle size={14} aria-hidden="true" />
                            다운로드 중
                          </>
                        ) : (
                          <>
                            <Download size={14} aria-hidden="true" />
                            다운로드
                          </>
                        )}
                      </button>
                      <button
                        className="mini-action-button danger"
                        type="button"
                        disabled={isDeleting || isDownloading || isRenaming}
                        onClick={() => handleDelete(file)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        삭제
                      </button>
                    </div>
                    {isPendingDelete && (
                      <div className="file-delete-confirm">
                        <span>{file.fileName} 파일을 삭제할까요?</span>
                        <button
                          className="mini-action-button"
                          type="button"
                          disabled={isDeleting}
                          onClick={onCancelDelete}
                        >
                          취소
                        </button>
                        <button
                          className="mini-action-button danger"
                          type="button"
                          disabled={isDeleting}
                          onClick={onConfirmDelete}
                        >
                          {isDeleting ? "삭제 중" : "확인"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-backdrop modal-backdrop-start" role="presentation">
      <section
        className="file-manager-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-manager-title"
      >
        <header className="settings-modal-header">
          <div>
            <span>Files</span>
            <h2 id="file-manager-title">파일 목록</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="파일 목록 닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {actionError && <p className="form-error">{actionError}</p>}

        <div className="file-manager-content">
          {!hasProject ? (
            <p className="file-manager-empty">프로젝트를 먼저 선택해주세요.</p>
          ) : isLoading ? (
            <div className="file-manager-loading" role="status">
              <LoaderCircle size={18} aria-hidden="true" />
              파일 목록을 불러오는 중입니다.
            </div>
          ) : error ? (
            <p className="form-error">{error}</p>
          ) : (
            <div className="file-manager-sections">
              <div className="file-manager-tabs" role="tablist" aria-label="파일 유형">
                <button
                  id="uploaded-files-tab"
                  className={`file-manager-tab ${
                    currentTab === FILE_MANAGER_TABS.UPLOADED ? "is-active" : ""
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={currentTab === FILE_MANAGER_TABS.UPLOADED}
                  aria-controls="uploaded-files-panel"
                  onClick={() => onTabChange(FILE_MANAGER_TABS.UPLOADED)}
                >
                  업로드한 파일 <span>{uploadedFiles.length}</span>
                </button>
                <button
                  id="generated-files-tab"
                  className={`file-manager-tab ${
                    currentTab === FILE_MANAGER_TABS.GENERATED ? "is-active" : ""
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={currentTab === FILE_MANAGER_TABS.GENERATED}
                  aria-controls="generated-files-panel"
                  onClick={() => onTabChange(FILE_MANAGER_TABS.GENERATED)}
                >
                  생성한 파일 <span>{generatedFiles.length}</span>
                </button>
              </div>
              {currentTab === FILE_MANAGER_TABS.UPLOADED ? (
                <section
                  id="uploaded-files-panel"
                  className="file-manager-section"
                  role="tabpanel"
                  aria-labelledby="uploaded-files-tab"
                >
                  <h3>업로드한 파일</h3>
                  {renderFiles(uploadedFiles, FILE_KINDS.UPLOADED)}
                </section>
              ) : (
                <section
                  id="generated-files-panel"
                  className="file-manager-section"
                  role="tabpanel"
                  aria-labelledby="generated-files-tab"
                >
                  <h3>생성한 파일</h3>
                  {renderFiles(generatedFiles, FILE_KINDS.GENERATED)}
                </section>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CommandRecommendationBar({ recommendations, isDisabled, onSelect }) {
  const visibleRecommendations = recommendations.slice(0, 4);
  if (!visibleRecommendations.length) return null;

  return (
    <section className="command-recommendations" aria-label="추천 명령어">
      <span>추천 명령어</span>
      <div className="command-chip-list">
        {visibleRecommendations.map((recommendation) => (
          <button
            key={`${recommendation.type}-${recommendation.commandText}`}
            className="command-chip"
            type="button"
            disabled={isDisabled}
            title={recommendation.commandText}
            onClick={() => onSelect(recommendation.commandText)}
          >
            {recommendation.commandText}
          </button>
        ))}
      </div>
    </section>
  );
}

function EmptyChatState({ title, description }) {
  return (
    <section className="empty-chat-state">
      <div className="empty-chat-icon">
        <Sparkles size={22} aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

function ChatMessage({
  message,
  isResponding,
  isUploadingDocument,
  onAgentUploadFiles,
  onDownloadFile,
  onDocumentChoice,
  onSuggestedActionClick,
  onCommandActionClick,
}) {
  const isAssistant = message.role === "assistant";
  const fileInputRef = useRef(null);
  const actionsResolved = Boolean(message.metadata?.actionResolved);
  const suggestedActions =
    isAssistant &&
    !actionsResolved &&
    message.metadata?.state === CHAT_STATES.WAITING_CONFIRMATION
      ? (message.metadata?.suggestedActions ?? []).filter((action) =>
          EXECUTABLE_ACTION_TYPES.has(action.type),
        )
      : [];
  const downloadFiles = isAssistant
    ? message.metadata?.downloadFiles ?? []
    : [];
  const uploadRequest =
    isAssistant && !actionsResolved ? message.metadata?.uploadRequest : null;
  const rawCommandActions =
    isAssistant && !actionsResolved
      ? message.metadata?.commandActions ??
        message.metadata?.result?.command_actions ??
        []
      : [];
  const commandActions = Array.isArray(rawCommandActions)
    ? rawCommandActions.filter((action) => !action?.directCreate)
    : [];
  const descriptionCtaAction = getDocumentDescriptionCtaAction(message);
  const documentChoiceRequest =
    isAssistant && !actionsResolved
      ? message.metadata?.documentChoiceRequest
      : null;
  const scheduleTodoItems = isAssistant
    ? message.metadata?.result?.items ?? []
    : [];
  const corrections = isAssistant ? message.metadata?.corrections ?? [] : [];
  const uploadOutputFormats =
    uploadRequest?.outputFormats ??
    uploadRequest?.documentConfig?.outputFormats ??
    [];
  const shouldUseUploadOutputFormat =
    uploadOutputFormats.length > 0 || Boolean(uploadRequest?.outputFormat);
  const shouldShowUploadOutputFormat =
    false;
  const uploadDefaultOutputFormat =
    uploadRequest?.outputFormat ||
    uploadOutputFormats[0]?.value ||
    "xlsx";
  const [selectedUploadOutputFormat, setSelectedUploadOutputFormat] = useState(
    uploadDefaultOutputFormat,
  );

  useEffect(() => {
    setSelectedUploadOutputFormat(uploadDefaultOutputFormat);
  }, [message.id, uploadDefaultOutputFormat]);

  const handleFileChange = (event) => {
    onAgentUploadFiles({
      message,
      files: event.target.files,
      uploadRequest: uploadRequest
        ? {
            ...uploadRequest,
            ...(shouldUseUploadOutputFormat
              ? { outputFormat: selectedUploadOutputFormat }
              : {}),
          }
        : null,
    });
    event.target.value = "";
  };

  return (
    <article className={`chat-message ${message.role}`}>
      <div className="message-avatar" aria-hidden="true">
        {isAssistant ? <Bot size={18} /> : <UserRound size={18} />}
      </div>
      <div className="message-stack">
        <div className="message-meta">
          <strong>{isAssistant ? "PM Agent" : "사용자"}</strong>
          <time>{message.createdAt}</time>
        </div>
        <div className="message-body">
          <p>{message.content}</p>
        </div>
        <MessageCorrections corrections={corrections} />
        {uploadRequest && (
          <div className="message-action-panel">
            {shouldShowUploadOutputFormat && (
              <GenerationOutputFormatField
                formats={uploadOutputFormats}
                value={selectedUploadOutputFormat}
                onChange={setSelectedUploadOutputFormat}
                isDisabled={isResponding || isUploadingDocument}
              />
            )}
            <button
              className="message-upload-button"
              type="button"
              disabled={isResponding || isUploadingDocument}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploadingDocument ? (
                <>
                  <LoaderCircle size={16} aria-hidden="true" />
                  업로드 중
                </>
              ) : (
                uploadRequest.label || "구축요건 정의서 업로드"
              )}
            </button>
            <input
              ref={fileInputRef}
              className="message-file-input"
              type="file"
              accept={
                Array.isArray(uploadRequest.acceptedTypes)
                  ? uploadRequest.acceptedTypes.join(",")
                  : undefined
              }
              disabled={isResponding || isUploadingDocument}
              onChange={handleFileChange}
              aria-label={uploadRequest.label || "구축요건 정의서 업로드"}
            />
          </div>
        )}
        {documentChoiceRequest && (
          <DocumentChoicePanel
            request={documentChoiceRequest}
            isDisabled={isResponding || isUploadingDocument}
            isUploading={isUploadingDocument}
            onChoice={(choice) => onDocumentChoice({ message, ...choice })}
            onUploadFiles={(files, uploadRequest) =>
              onAgentUploadFiles({
                message,
                files,
                uploadRequest,
              })
            }
          />
        )}
        <ScheduleTodoResult
          items={scheduleTodoItems}
        />
        <MessageResult
          downloadFiles={downloadFiles}
          onDownloadFile={onDownloadFile}
        />
        {descriptionCtaAction && (
          <div className="document-description-cta">
            <span>이 문서를 생성해볼까요?</span>
            <button
              className="suggested-action-button primary"
              type="button"
              disabled={isResponding || isUploadingDocument}
              onClick={() => onCommandActionClick(message, descriptionCtaAction)}
            >
              {descriptionCtaAction.label}
            </button>
          </div>
        )}
        {commandActions.length > 0 && (
          <div className="suggested-action-list">
            {commandActions.map((action, index) => (
              <button
                key={`${action.message ?? action.command ?? action.label}-${index}`}
                className="suggested-action-button secondary"
                type="button"
                disabled={isResponding || isUploadingDocument}
                onClick={() =>
                  onCommandActionClick(message, {
                    ...action,
                    outputFormat: selectedUploadOutputFormat,
                  })
                }
              >
                {action.label || action.message || action.command}
              </button>
            ))}
          </div>
        )}
        {suggestedActions.length > 0 && (
          <div className="suggested-action-list">
            {suggestedActions.map((action) => (
              <button
                key={`${action.type}-${getActionId(message, action)}-${
                  action.label
                }`}
                className={`suggested-action-button ${
                  action.type ===
                  CHAT_ACTION_COMMAND_TYPES.CANCEL_PENDING_ACTION
                    ? "secondary"
                    : "primary"
                }`}
                type="button"
                disabled={isResponding}
                onClick={() => onSuggestedActionClick(message, action)}
              >
                {action.label || getActionMessage(action)}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function MessageCorrections({ corrections }) {
  const items = Array.isArray(corrections)
    ? corrections.filter((item) => item?.source && item?.target)
    : [];
  if (!items.length) return null;

  return (
    <div className="message-corrections" aria-label="입력 해석 보정">
      {items.slice(0, 3).map((item) => (
        <span key={`${item.source}-${item.target}`}>
          ‘{item.source}’을 ‘{item.target}’으로 이해했어요.
        </span>
      ))}
    </div>
  );
}

function DocumentChoicePanel(props) {
  return <DefaultDocumentChoicePanel {...props} />;
}

function GenerationOutputFormatField({
  formats = [],
  value,
  onChange,
  isDisabled,
}) {
  const availableFormats =
    Array.isArray(formats) && formats.length
      ? formats
      : [{ value: "xlsx", label: OUTPUT_FORMAT_LABELS.xlsx }];
  const selectedValue = value || availableFormats[0]?.value || "xlsx";

  return (
    <label className="document-output-format">
      <span>파일 형식</span>
      <select
        value={selectedValue}
        disabled={isDisabled || availableFormats.length <= 1}
        onChange={(event) => onChange(event.target.value)}
      >
        {availableFormats.map((format) => (
          <option key={format.value} value={format.value}>
            {format.label || getOutputFormatLabel(availableFormats, format.value)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DefaultDocumentChoicePanel({
  request,
  isDisabled,
  isUploading = false,
  onChoice,
  onUploadFiles,
}) {
  const panelId = useId().replace(/:/g, "");
  const documents = Array.isArray(request?.documents) ? request.documents : [];
  const optionalDocuments = Array.isArray(request?.optionalDocuments)
    ? request.optionalDocuments
    : [];
  const documentConfig = request?.documentConfig ?? {};
  const relation = documentConfig.relation ?? getRelation(documentConfig.requestType);
  const primarySource = relation?.primarySource ?? documentConfig.primarySource;
  const optionalSource =
    relation?.optionalSources?.[0] ?? documentConfig.optionalSources?.[0] ?? null;
  const outputFormats =
    request?.outputFormats ??
    documentConfig.outputFormats ??
    (relation ? getOutputFormats(relation) : []);
  const shouldUseOutputFormat =
    outputFormats.length > 0 || Boolean(request?.outputFormat);
  const shouldShowOutputFormat =
    false;
  const defaultDocumentId =
    request?.defaultDocumentId || documents[0]?.documentId || "";
  const [selectedDocumentId, setSelectedDocumentId] =
    useState(defaultDocumentId);
  const [usePrimaryDocument, setUsePrimaryDocument] = useState(
    Boolean(defaultDocumentId),
  );
  const [selectedOptionalDocumentIds, setSelectedOptionalDocumentIds] =
    useState(
      Array.isArray(request?.defaultOptionalDocumentIds)
        ? request.defaultOptionalDocumentIds
        : optionalDocuments.map((document) => document.documentId).filter(Boolean),
    );
  const [includeOptionalDocument, setIncludeOptionalDocument] = useState(
    optionalDocuments.length > 0,
  );
  const [selectedOutputFormat, setSelectedOutputFormat] = useState(
    request?.outputFormat ||
      documentConfig.defaultOutputFormat ||
      (relation ? getDefaultOutputFormat(relation) : ""),
  );
  const [draggingUploadSlot, setDraggingUploadSlot] = useState("");
  const primaryFileInputRef = useRef(null);
  const optionalFileInputRef = useRef(null);
  const defaultDocument =
    documents.find((document) => document.documentId === defaultDocumentId) ??
    documents[0];
  const selectedDocument =
    documents.find((document) => document.documentId === selectedDocumentId) ??
    defaultDocument;
  const defaultOptionalDocumentIds = Array.isArray(request?.defaultOptionalDocumentIds)
    ? request.defaultOptionalDocumentIds
    : optionalDocuments.map((document) => document.documentId).filter(Boolean);
  const selectedOptionalDocuments = optionalDocuments.filter((document) =>
    selectedOptionalDocumentIds.includes(document.documentId),
  );
  const selectedOptionalDocumentIdsForChoice = selectedOptionalDocuments.map(
    (document) => document.documentId,
  );
  const documentSelectId = `${panelId}-primary-source-document`;
  const optionalDocumentListId = `${panelId}-optional-source-documents`;
  const primaryUseName = `${panelId}-primary-use-existing`;
  const optionalUseName = `${panelId}-optional-use-existing`;
  const targetLabel = relation?.targetLabel || documentConfig.targetLabel || "산출물";
  const actionLabel =
    documentConfig.actionLabel || DOCUMENT_GENERATION_COPY.generate;
  const primaryLabel = primarySource?.label || "기준 문서";
  const optionalLabel = optionalSource?.label || "추가 자료";
  const hasSelectedPrimaryDocument = Boolean(
    usePrimaryDocument && selectedDocument?.documentId,
  );
  const shouldShowPrimaryUpload = !hasSelectedPrimaryDocument;
  const shouldShowOptionalUpload = Boolean(
    optionalSource && !includeOptionalDocument,
  );
  const canUploadMultipleOptional =
    optionalSource?.documentType === DOCUMENT_TYPES.MEETING_NOTES;
  const optionalSelectionCount = includeOptionalDocument
    ? selectedOptionalDocuments.length
    : 0;
  const materialSummary = !hasSelectedPrimaryDocument
    ? `${primaryLabel}를 선택하거나 업로드하면 ${targetLabel}를 생성할 수 있습니다.`
    : optionalSource
      ? optionalSelectionCount > 0
        ? `${primaryLabel} 1개, ${optionalLabel} ${optionalSelectionCount}개를 반영합니다.`
        : `${primaryLabel} 1개를 기준으로 ${targetLabel}를 생성합니다. ${optionalLabel}은 반영하지 않습니다.`
      : `${primaryLabel} 1개를 기준으로 ${targetLabel}를 생성합니다.`;
  const canGenerate =
    hasSelectedPrimaryDocument &&
    (!shouldUseOutputFormat || Boolean(selectedOutputFormat));
  const generateDisabledTitle = !hasSelectedPrimaryDocument
    ? `${primaryLabel}를 선택하거나 업로드해 주세요.`
    : undefined;

  useEffect(() => {
    setSelectedDocumentId(defaultDocumentId);
    setUsePrimaryDocument(Boolean(defaultDocumentId));
  }, [defaultDocumentId]);

  useEffect(() => {
    const nextOptionalIds = Array.isArray(request?.defaultOptionalDocumentIds)
      ? request.defaultOptionalDocumentIds
      : optionalDocuments.map((document) => document.documentId).filter(Boolean);
    setSelectedOptionalDocumentIds(normalizeDocumentIds(nextOptionalIds));
    setIncludeOptionalDocument(nextOptionalIds.length > 0);
  }, [request?.defaultOptionalDocumentIds, optionalDocuments.length]);

  useEffect(() => {
    setSelectedOutputFormat(
      request?.outputFormat ||
        documentConfig.defaultOutputFormat ||
        (relation ? getDefaultOutputFormat(relation) : ""),
    );
  }, [request?.outputFormat, documentConfig.defaultOutputFormat, relation]);

  const handleIncludeOptionalDocuments = () => {
    const nextOptionalIds = selectedOptionalDocumentIdsForChoice.length
      ? selectedOptionalDocumentIdsForChoice
      : defaultOptionalDocumentIds;
    setIncludeOptionalDocument(true);
    setSelectedOptionalDocumentIds(normalizeDocumentIds(nextOptionalIds));
  };

  const handleExcludeOptionalDocuments = () => {
    setIncludeOptionalDocument(false);
    setSelectedOptionalDocumentIds([]);
  };

  const toggleOptionalDocumentId = (documentId) => {
    setSelectedOptionalDocumentIds((currentIds) => {
      const nextIds = currentIds.includes(documentId)
        ? currentIds.filter((currentId) => currentId !== documentId)
        : [...currentIds, documentId];
      return normalizeDocumentIds(nextIds);
    });
    setIncludeOptionalDocument(true);
  };

  const buildUploadRequest = (source, slot) => ({
    label: `${source?.label || "기준 문서"} 업로드`,
    acceptedTypes: DOCUMENT_UPLOAD_ACCEPTED_TYPES,
    documentType: source?.documentType || DEFAULT_DOCUMENT_TYPE,
    originalMessage: request?.originalMessage || `${targetLabel} 생성`,
    resumeAfterUpload: false,
    requestType: documentConfig.requestType || "",
    outputFormats,
    outputFormat: selectedOutputFormat,
    documentChoiceSlot: slot,
    displayLabel: `업로드한 ${source?.label || "문서"}`,
    allowMultiple:
      slot === "optional" && source?.documentType === DOCUMENT_TYPES.MEETING_NOTES,
    selectedOptionalDocumentIds:
      slot === "optional" ? selectedOptionalDocumentIdsForChoice : [],
  });

  const handleUploadChange = (event, source, slot) => {
    onUploadFiles?.(event.target.files, buildUploadRequest(source, slot));
    event.target.value = "";
  };

  const handleUploadDragOver = (event, slot) => {
    event.preventDefault();
    event.stopPropagation();
    if (isDisabled || isUploading) return;
    event.dataTransfer.dropEffect = "copy";
    setDraggingUploadSlot(slot);
  };

  const handleUploadDragLeave = (event, slot) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDraggingUploadSlot((currentSlot) =>
      currentSlot === slot ? "" : currentSlot,
    );
  };

  const handleUploadDrop = (event, source, slot) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingUploadSlot("");
    if (isDisabled || isUploading) return;
    onUploadFiles?.(event.dataTransfer.files, buildUploadRequest(source, slot));
  };

  const handlePanelAction = (event, callback) => {
    event.preventDefault();
    event.stopPropagation();
    if (isDisabled) return;
    callback();
  };

  const handleChoiceLabelClick = (event, callback) => {
    event.stopPropagation();
    if (isDisabled) return;
    callback();
  };

  return (
    <div className="message-document-choice-panel">
      <section className="document-choice-section document-choice-slot">
        <div className="document-choice-file-row">
          <label
            className="document-choice-file-label"
            htmlFor={shouldShowPrimaryUpload ? undefined : documentSelectId}
          >
            {primaryLabel}
          </label>
          {shouldShowPrimaryUpload ? (
            <button
              className={`document-source-control document-upload-control ${
                draggingUploadSlot === "primary" ? "is-drag-over" : ""
              }`}
              type="button"
              disabled={isDisabled || isUploading}
              onClick={(event) =>
                handlePanelAction(event, () => primaryFileInputRef.current?.click())
              }
              onDragOver={(event) => handleUploadDragOver(event, "primary")}
              onDragLeave={(event) => handleUploadDragLeave(event, "primary")}
              onDrop={(event) => handleUploadDrop(event, primarySource, "primary")}
            >
              {isUploading ? (
                <>
                  <LoaderCircle size={16} aria-hidden="true" />
                  업로드 중
                </>
              ) : (
                `${primaryLabel} 업로드`
              )}
            </button>
          ) : (
            <select
              id={documentSelectId}
              className="document-choice-source-select document-source-control"
              value={selectedDocument?.documentId || ""}
              disabled={isDisabled}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setSelectedDocumentId(event.target.value)}
            >
              {documents.map((document) => (
                <option key={document.documentId} value={document.documentId}>
                  {document.fileName || document.documentId}
                </option>
              ))}
            </select>
          )}
        </div>
        {documents.length > 0 && (
          <fieldset className="document-choice-radio-row">
            <legend className="sr-only">{primaryLabel} 사용 여부</legend>
            <span className="document-choice-radio-label">기존 문서 사용</span>
            <label
              className="document-choice-check"
              onClick={(event) =>
                handleChoiceLabelClick(event, () => setUsePrimaryDocument(true))
              }
            >
              <input
                type="radio"
                name={primaryUseName}
                checked={usePrimaryDocument}
                disabled={isDisabled}
                onClick={(event) => event.stopPropagation()}
                onChange={() => setUsePrimaryDocument(true)}
              />
              <span>예</span>
            </label>
            <label
              className="document-choice-check"
              onClick={(event) =>
                handleChoiceLabelClick(event, () => setUsePrimaryDocument(false))
              }
            >
              <input
                type="radio"
                name={primaryUseName}
                checked={!usePrimaryDocument}
                disabled={isDisabled}
                onClick={(event) => event.stopPropagation()}
                onChange={() => setUsePrimaryDocument(false)}
              />
              <span>아니오</span>
            </label>
          </fieldset>
        )}
        <input
          ref={primaryFileInputRef}
          className="message-file-input"
          type="file"
          accept={DOCUMENT_UPLOAD_ACCEPTED_TYPES.join(",")}
          disabled={isDisabled || isUploading}
          onChange={(event) => handleUploadChange(event, primarySource, "primary")}
          aria-label={`${primaryLabel} 업로드`}
        />
      </section>
      {optionalSource && (
        <section className="document-choice-section document-choice-slot">
          <div className="document-choice-file-row">
            <label
              className="document-choice-file-label"
              htmlFor={shouldShowOptionalUpload ? undefined : optionalDocumentListId}
            >
              {optionalLabel}
            </label>
            {shouldShowOptionalUpload ? (
              <button
                className={`document-source-control document-upload-control ${
                  draggingUploadSlot === "optional" ? "is-drag-over" : ""
                }`}
                type="button"
                disabled={isDisabled || isUploading}
                onClick={(event) =>
                  handlePanelAction(event, () =>
                    optionalFileInputRef.current?.click(),
                  )
                }
                onDragOver={(event) => handleUploadDragOver(event, "optional")}
                onDragLeave={(event) => handleUploadDragLeave(event, "optional")}
                onDrop={(event) => handleUploadDrop(event, optionalSource, "optional")}
              >
                {isUploading ? (
                  <>
                    <LoaderCircle size={16} aria-hidden="true" />
                    업로드 중
                  </>
                ) : (
                  `${optionalLabel} 업로드`
                )}
              </button>
            ) : (
              <div
                id={optionalDocumentListId}
                className="document-choice-multi-list"
                role="group"
                aria-label={`${optionalLabel} 선택`}
                onClick={(event) => event.stopPropagation()}
              >
                <p className="document-choice-helper">
                  {optionalLabel}을 여러 개 선택할 수 있습니다.
                </p>
                {optionalDocuments.map((document) => (
                  <label
                    className="document-choice-multi-item"
                    key={document.documentId}
                  >
                    <input
                      type="checkbox"
                      checked={selectedOptionalDocumentIdsForChoice.includes(
                        document.documentId,
                      )}
                      disabled={isDisabled}
                      onChange={() => toggleOptionalDocumentId(document.documentId)}
                    />
                    <span>{document.fileName || document.documentId}</span>
                  </label>
                ))}
                <p className="document-choice-selected-count">
                  {optionalLabel} {optionalSelectionCount}개 선택됨
                </p>
              </div>
            )}
          </div>
          {optionalDocuments.length > 0 && (
            <fieldset className="document-choice-radio-row">
              <legend className="sr-only">{optionalLabel} 사용 여부</legend>
              <span className="document-choice-radio-label">기존 문서 사용</span>
              <label
                className="document-choice-check"
                onClick={(event) =>
                  handleChoiceLabelClick(event, handleIncludeOptionalDocuments)
                }
              >
                <input
                  type="radio"
                  name={optionalUseName}
                  checked={includeOptionalDocument}
                  disabled={isDisabled}
                  onClick={(event) => event.stopPropagation()}
                  onChange={handleIncludeOptionalDocuments}
                />
                <span>예</span>
              </label>
              <label
                className="document-choice-check"
                onClick={(event) =>
                  handleChoiceLabelClick(event, handleExcludeOptionalDocuments)
                }
              >
                <input
                  type="radio"
                  name={optionalUseName}
                  checked={!includeOptionalDocument}
                  disabled={isDisabled}
                  onClick={(event) => event.stopPropagation()}
                  onChange={handleExcludeOptionalDocuments}
                />
                <span>아니오</span>
              </label>
            </fieldset>
          )}
          {shouldShowOptionalUpload && (
            <p className="document-choice-helper">
              회의록 파일을 업로드하거나, 업로드 없이 생성할 수 있습니다.
            </p>
          )}
          <input
            ref={optionalFileInputRef}
            className="message-file-input"
            type="file"
            multiple={canUploadMultipleOptional}
            accept={DOCUMENT_UPLOAD_ACCEPTED_TYPES.join(",")}
            disabled={isDisabled || isUploading}
            onChange={(event) =>
              handleUploadChange(event, optionalSource, "optional")
            }
            aria-label={`${optionalSource.label} 업로드`}
          />
        </section>
      )}
      {shouldShowOutputFormat && (
        <GenerationOutputFormatField
          formats={outputFormats}
          value={selectedOutputFormat}
          onChange={setSelectedOutputFormat}
          isDisabled={isDisabled}
        />
      )}
      <div className="document-choice-actions">
        <p className="document-choice-material-summary">{materialSummary}</p>
        <button
          className="message-upload-button"
          type="button"
          disabled={isDisabled || isUploading || !canGenerate}
          onClick={(event) =>
            handlePanelAction(event, () =>
              onChoice({
                choice: "generate",
                documentId: selectedDocument?.documentId,
                optionalDocumentIds:
                  includeOptionalDocument
                    ? selectedOptionalDocumentIdsForChoice
                    : [],
                outputFormat: selectedOutputFormat,
              }),
            )
          }
          title={generateDisabledTitle}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function MessageResult({ downloadFiles, onDownloadFile }) {
  const files = Array.isArray(downloadFiles) ? downloadFiles : [];

  if (!files.length) return null;

  return (
    <div className="download-file-list" aria-label="생성된 파일">
      {files.map((file, index) => (
        <button
          key={`${file.artifact_id ?? file.file_name ?? index}`}
          className="download-file-link"
          type="button"
          onClick={() => onDownloadFile(file)}
        >
          {(file.file_name || "요구사항명세서.xlsx") + " 다운로드"}
        </button>
      ))}
    </div>
  );
}

function ScheduleTodoResult({ items }) {
  const todos = Array.isArray(items)
    ? [...items].sort(compareTodosForSchedule)
    : [];
  if (!todos.length) return null;

  return (
    <div className="schedule-todo-result" aria-label="할일 목록">
      <table>
        <thead>
          <tr>
            <th>할일</th>
            <th>담당자</th>
            <th>기한</th>
            <th>출처</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {todos.map((todo, index) => {
            const title = sanitizeTodoText(todo.title || "제목 없음");
            const evidence = sanitizeTodoText(todo.evidence || title);
            return (
              <tr
                className={getTodoScheduleClassNames(todo)}
                key={todo.todo_id || todo.todoId || todo.id || `${todo.title}-${index}`}
              >
                <td title={evidence}>{truncateTodoText(title)}</td>
                <td>{sanitizeTodoText(todo.assignee) || "담당자 미정"}</td>
                <td>{sanitizeTodoText(formatTodoDeadlineWithDday(todo))}</td>
                <td><TodoSourceBadge todo={todo} /></td>
                <td>{sanitizeTodoText(todo.status) || "확인 필요"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GenerationProgressResult({ progressState, downloadFiles }) {
  const files = Array.isArray(downloadFiles) ? downloadFiles : [];
  const progressSteps = Array.isArray(progressState?.steps)
    ? progressState.steps
    : [];
  const isCompletedResult =
    progressState?.progress >= 100 &&
    progressSteps.every((step) => step.status === "COMPLETED");
  const completedSteps = progressSteps.map((step) => ({
    ...step,
    name: stripProgressPercentPrefix(step.name),
  }));

  return (
    <div className="generation-result-panel">
      {files.length > 0 && (
        <div className="generation-file-summary">
          <strong>생성 파일:</strong>
          {files.map((file, index) => (
            <span key={`${file.artifact_id ?? file.file_name ?? index}`}>
              {file.file_name || "요구사항명세서.xlsx"}
            </span>
          ))}
        </div>
      )}
      <div className="generation-progress-summary">
        <strong>진행 결과:</strong>
        {isCompletedResult ? (
          <ul
            className="generation-complete-step-list"
            aria-label="완료된 진행 결과"
          >
            {completedSteps.map((step) => (
              <li key={step.name} className="generation-complete-step">
                <Check size={16} aria-hidden="true" />
                <span>{step.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <AgentProgress steps={progressSteps} />
        )}
      </div>
    </div>
  );
}

function GenerationProgressMessage({ progressState }) {
  return (
    <article className="chat-message assistant">
      <div className="message-avatar" aria-hidden="true">
        <Bot size={18} />
      </div>
      <div className="message-stack">
        <div className="message-meta">
          <strong>PM Agent</strong>
          <time>요구사항 정의서 생성 중</time>
        </div>
        <div className="message-body progress-message-body">
          <div className="progress-message-copy">
            <Sparkles size={16} aria-hidden="true" />
            <div>
              <strong>요구사항 정의서를 생성하고 있습니다.</strong>
              <p>완료되면 아래에 다운로드 버튼을 표시합니다.</p>
            </div>
          </div>
          <ProgressBar
            progress={progressState.progress}
            label={progressState.displayText}
            title="전체 진행률"
          />
          <GenerationSubProgress progressState={progressState} />
          <AgentProgress steps={progressState.steps} />
        </div>
      </div>
    </article>
  );
}

function GenerationSubProgress({ progressState }) {
  const subProgressItems = Array.isArray(progressState?.subProgressItems)
    ? progressState.subProgressItems
    : [];
  if (!subProgressItems.length && !progressState?.largeDocumentHint) {
    return null;
  }

  return (
    <section className="sub-progress-panel" aria-label="세부 처리 진행률">
      {progressState?.largeDocumentHint && (
        <p className="sub-progress-hint">
          문서가 큰 경우 시간이 걸릴 수 있습니다. 세부 처리 상태를 확인하고 있습니다.
        </p>
      )}
      {subProgressItems.map((item, index) => (
        <div
          className="sub-progress-item"
          key={`${item.type || item.label}-${index}`}
        >
          {item.hasProgressBar ? (
            <ProgressBar
              progress={item.progress}
              label={item.message}
              title={item.label}
              variant="sub"
            />
          ) : (
            <div className="sub-progress-loading" role="status">
              <LoaderCircle
                className="sub-progress-spinner"
                size={14}
                aria-hidden="true"
              />
              <span>{item.message}</span>
            </div>
          )}
        </div>
      ))}
      <div className="sub-progress-live" role="status" aria-live="polite">
        <LoaderCircle
          className="sub-progress-spinner"
          size={14}
          aria-hidden="true"
        />
        <span>진행 상태 업데이트를 기다리는 중입니다.</span>
      </div>
    </section>
  );
}

function TypingMessage() {
  return (
    <article className="chat-message assistant">
      <div className="message-avatar" aria-hidden="true">
        <Bot size={18} />
      </div>
      <div className="message-stack">
        <div className="message-meta">
          <strong>PM Agent</strong>
          <time>응답 생성 중</time>
        </div>
        <div
          className="message-body typing-body"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle
            className="typing-spinner"
            size={16}
            aria-hidden="true"
          />
          <p aria-label="응답을 기다리는 중입니다.">
            응답을 기다리는 중입니다.
            <span className="typing-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}

export default App;
