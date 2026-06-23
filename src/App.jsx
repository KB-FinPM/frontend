import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Check,
  Download,
  FileText,
  FolderOpen,
  LoaderCircle,
  LogOut,
  Menu,
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
  { value: "MEETING_NOTES", label: "회의록" },
  { value: "WBS", label: "WBS" },
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
  targetLabel: "회의록 TODO",
  panelTitle: "회의록 TODO 추출",
  actionLabel: "TODO 추출하기",
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
    "회의록에서 TODO를 추출하려면 회의록 내용을 붙여넣거나 파일을 업로드해 주세요.",
  existingMessage:
    "이미 업로드된 회의록이 있습니다. 기존 회의록을 사용하거나 새 회의록을 업로드해 주세요.",
  startMessage: "회의록에서 TODO를 추출하고 있습니다.",
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

const getTodoStatusLabel = (status) =>
  TODO_STATUS_FILTERS.find((option) => option.value === status)?.label ||
  TODO_STATUS_FILTERS[1].label;

const getTodoSourceLabel = (sourceType) =>
  TODO_SOURCE_FILTERS.find((option) => option.value === sourceType)?.label ||
  "기타";

const normalizeTodo = (item = {}) => {
  const todoId =
    item.todo_id ??
    item.todoId ??
    item.id ??
    item.client_import_id ??
    item.clientImportId ??
    "";
  const sourceType =
    item.source_type ?? item.sourceType ?? item.document_type ?? item.documentType ?? "";
  return {
    todoId,
    clientImportId:
      item.client_import_id ?? item.clientImportId ?? (todoId ? `IMPORT-${todoId}` : ""),
    title: item.title ?? "",
    assignee: item.assignee ?? "",
    dueDate: item.due_date ?? item.dueDate ?? "",
    dueDateText: item.due_date_text ?? item.dueDateText ?? "",
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
    .filter((item) => item.todoId || item.title);
};

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
  return {
    todo_id: item.todoId || item.clientImportId || raw.todo_id || "",
    client_import_id: item.clientImportId || raw.client_import_id || item.todoId,
    title: item.title,
    assignee: item.assignee || null,
    due_date: item.dueDate || null,
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

const getProjectStartDate = (project) =>
  project?.projectStartDate ?? project?.start_date ?? project?.startDate ?? "";

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

  const context = {
    selected_document_ids: selectedDocumentIds,
    selected_documents: selectedDocuments.map(toDocumentContext),
    source_document_type: selectedDocuments[0]?.documentType,
    project_name: targetProject.projectName || "",
    project: {
      project_id: targetProject.projectId,
      name: targetProject.projectName || "",
      start_date: getProjectStartDate(targetProject),
      end_date: targetProject.projectEndDate || "",
    },
  };

  if (includeDocumentIdAliases) {
    const requirementDefinitionDocument = selectedDocuments.find(
      (document) => document.documentType === DEFAULT_DOCUMENT_TYPE,
    );
    const technicalNegotiationMinutesDocument = selectedDocuments.find(
      (document) => document.documentType === DOCUMENT_TYPES.MEETING_NOTES,
    );

    context.source_document_ids = selectedDocumentIds;
    context.document_ids = selectedDocumentIds;
    context.requirement_definition_document_id =
      requirementDefinitionDocument?.documentId ?? null;
    context.technical_negotiation_minutes_document_id =
      technicalNegotiationMinutesDocument?.documentId ?? null;
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
  const [newProjectStartDate, setNewProjectStartDate] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectError, setNewProjectError] = useState("");
  const [project, setProject] = useState(null);
  const [activeConversationId, setActiveConversationIdState] = useState("");
  const [composerValue, setComposerValue] = useState("");
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
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
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState(false);
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
  const [isTodoManagerOpen, setIsTodoManagerOpen] = useState(false);
  const [todoItems, setTodoItems] = useState([]);
  const [todoStatusFilter, setTodoStatusFilter] = useState("");
  const [todoSourceFilter, setTodoSourceFilter] = useState("");
  const [isLoadingTodos, setIsLoadingTodos] = useState(false);
  const [todoError, setTodoError] = useState("");
  const [todoActionError, setTodoActionError] = useState("");
  const [savingTodoId, setSavingTodoId] = useState("");
  const [editingTodoId, setEditingTodoId] = useState("");
  const [todoEditDraft, setTodoEditDraft] = useState({
    title: "",
    assignee: "",
    dueDate: "",
    description: "",
    status: "NOT_STARTED",
  });
  const [isTodoImportOpen, setIsTodoImportOpen] = useState(false);
  const [todoImportDocumentType, setTodoImportDocumentType] = useState(
    DOCUMENT_TYPES.MEETING_NOTES,
  );
  const [todoImportDocumentId, setTodoImportDocumentId] = useState("");
  const [todoImportFile, setTodoImportFile] = useState(null);
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

  const resetFileManagerState = () => {
    setIsFileManagerOpen(false);
    setFileBuckets({ uploaded: [], generated: [] });
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
      dueDate: "",
      description: "",
      status: "NOT_STARTED",
    });
    setIsTodoImportOpen(false);
    setTodoImportDocumentType(DOCUMENT_TYPES.MEETING_NOTES);
    setTodoImportDocumentId("");
    setTodoImportFile(null);
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
    setSelectedDocumentIds([]);
    setDocumentStatusMessage("");
  };

  const startGenerationProgress = () => {
    clearGenerationPolling({ rejectPending: true });
    progressStepIndexRef.current = 0;
    setGenerationProgress({
      ...buildGenerationProgress(GENERATION_PROGRESS_INITIAL_VALUE),
      displayText: "",
      label: GENERATION_PROGRESS_LABEL,
    });
  };

  const completeGenerationProgress = () => {
    clearGenerationPolling();
    const completedProgress = {
      ...buildGenerationProgress(100, "COMPLETED"),
      displayText: "완료",
      label: "요구사항명세서 생성 완료",
    };
    setGenerationProgress(completedProgress);
    return completedProgress;
  };

  const failGenerationProgress = (statusResponse = null) => {
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
      });
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

    if (assistantMessage.metadata?.state === CHAT_STATES.FAILED) {
      const failedProgress = failGenerationProgress();
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
      const failedProgress = failGenerationProgress(statusResponse);
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

    const completedProgress = completeGenerationProgress();
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
      setNewProjectStartDate("");
      setNewProjectDescription("");
      setNewProjectError("");
      setConversationActionError("");
      setDeletingConversationId("");
      setLastCommandInfo(null);
      setSelectedDocumentIds([]);
      setDocumentError("");
      setDocumentStatusMessage("");
      resetFileManagerState();
      resetTodoManagerState();
      clearGenerationPolling({ rejectPending: true });
      setGenerationProgress(null);
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
        setNewProjectStartDate("");
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
      setNewProjectStartDate("");
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
    setDocumentError("");
    setDocumentStatusMessage("");
    resetGenerationState();
    resetFileManagerState();
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
    setDocumentError("");
    setDocumentStatusMessage("");
    resetGenerationState();
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

  const loadTodos = async ({
    status = todoStatusFilter,
    sourceType = todoSourceFilter,
  } = {}) => {
    if (!project?.projectId) {
      setTodoItems([]);
      setTodoError("프로젝트를 먼저 선택해 주세요.");
      return;
    }

    setIsLoadingTodos(true);
    setTodoError("");
    try {
      const response = await listProjectTodos(project.projectId, {
        status,
        sourceType,
      });
      setTodoItems(normalizeTodoListResponse(response));
    } catch (error) {
      setTodoItems([]);
      setTodoError(
        error instanceof Error
          ? error.message
          : "TODO 목록을 불러오지 못했습니다.",
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
    if (!project?.projectId) {
      setTodoItems([]);
      setTodoError("프로젝트를 먼저 선택해 주세요.");
      return;
    }
    loadTodos();
    loadUploadedFiles(project);
  };

  const closeTodoManager = () => {
    setIsTodoManagerOpen(false);
    setTodoActionError("");
    setTodoError("");
    setEditingTodoId("");
    setSavingTodoId("");
    setIsTodoImportOpen(false);
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
  };

  const handleTodoStatusFilterChange = (value) => {
    setTodoStatusFilter(value);
    loadTodos({ status: value, sourceType: todoSourceFilter });
  };

  const handleTodoSourceFilterChange = (value) => {
    setTodoSourceFilter(value);
    loadTodos({ status: todoStatusFilter, sourceType: value });
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
    } catch (error) {
      setTodoItems(previousTodos);
      setTodoActionError(
        error instanceof Error
          ? error.message
          : "TODO 상태를 저장하지 못했습니다.",
      );
    } finally {
      setSavingTodoId("");
    }
  };

  const handleStartTodoEdit = (todo) => {
    setEditingTodoId(todo.todoId);
    setTodoEditDraft({
      title: todo.title || "",
      assignee: todo.assignee || "",
      dueDate: todo.dueDate || "",
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
    }));
  };

  const handleSaveTodoEdit = async (todo) => {
    if (!project?.projectId || !todo?.todoId) return;
    const nextTitle = todoEditDraft.title.trim();
    if (!nextTitle) {
      setTodoActionError("TODO명을 입력해 주세요.");
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
            due_date: todoEditDraft.dueDate || null,
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
    } catch (error) {
      setTodoActionError(
        error instanceof Error
          ? error.message
          : "TODO 정보를 저장하지 못했습니다.",
      );
    } finally {
      setSavingTodoId("");
    }
  };

  const handleDeleteTodo = async (todo) => {
    if (!project?.projectId || !todo?.todoId) return;
    if (!window.confirm(`"${todo.title}" TODO를 삭제할까요?`)) return;

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
    } catch (error) {
      setTodoActionError(
        error instanceof Error ? error.message : "TODO를 삭제하지 못했습니다.",
      );
    } finally {
      setSavingTodoId("");
    }
  };

  const handleOpenTodoImport = () => {
    setIsTodoImportOpen((currentValue) => !currentValue);
    setTodoActionError("");
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    if (!todoImportDocumentId && filteredTodoImportDocuments[0]?.documentId) {
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
    setTodoImportDocumentId(nextDocument?.documentId || "");
    setTodoImportPreview(null);
    setSelectedTodoImportIds([]);
    setTodoActionError("");
  };

  const handleTodoImportFileChange = (file) => {
    setTodoImportFile(file);
    setTodoActionError("");
  };

  const handleUploadTodoImportDocument = async () => {
    if (!project?.projectId || !todoImportFile) return;

    setIsUploadingTodoImportDocument(true);
    setTodoActionError("");
    try {
      const response = await uploadDocument({
        projectId: project.projectId,
        documentType: todoImportDocumentType,
        file: todoImportFile,
      });
      const uploadedDocument = response?.document ?? {};
      const uploadedDocumentId =
        uploadedDocument.document_id ?? uploadedDocument.documentId ?? "";
      await loadUploadedFiles(project);
      if (uploadedDocumentId) {
        setTodoImportDocumentId(uploadedDocumentId);
      }
      setTodoImportFile(null);
      setTodoImportPreview(null);
      setSelectedTodoImportIds([]);
    } catch (error) {
      setTodoActionError(
        error instanceof Error ? error.message : "문서를 업로드하지 못했습니다.",
      );
    } finally {
      setIsUploadingTodoImportDocument(false);
    }
  };

  const handlePreviewTodoImport = async () => {
    if (!project?.projectId || !todoImportDocumentId) {
      setTodoActionError("TODO를 불러올 문서를 선택해 주세요.");
      return;
    }

    const selectedDocument = todoImportDocuments.find(
      (document) => document.documentId === todoImportDocumentId,
    );
    const documentType = selectedDocument?.documentType || todoImportDocumentType;

    setIsPreviewingTodoImport(true);
    setTodoActionError("");
    try {
      const preview = normalizeTodoImportPreview(
        await previewProjectTodoImport({
          projectId: project.projectId,
          documentId: todoImportDocumentId,
          documentType,
        }),
      );
      setTodoImportPreview(preview);
      setSelectedTodoImportIds(
        preview.newItems
          .map((item) => item.clientImportId || item.todoId)
          .filter(Boolean),
      );
    } catch (error) {
      setTodoImportPreview(null);
      setSelectedTodoImportIds([]);
      setTodoActionError(
        error instanceof Error
          ? error.message
          : "문서에서 TODO를 미리보기하지 못했습니다.",
      );
    } finally {
      setIsPreviewingTodoImport(false);
    }
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
      await loadTodos();
    } catch (error) {
      setTodoActionError(
        error instanceof Error ? error.message : "TODO를 저장하지 못했습니다.",
      );
    } finally {
      setIsCommittingTodoImport(false);
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
    if (getRequiredDocumentConfig(requestType)) {
      startGenerationProgress();
    }
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

      const preparedRequest = await prepareMessageRequest({
        messageText: trimmedValue,
        targetProject,
      });

      if (preparedRequest.status === "UPLOAD_REQUIRED") {
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

    try {
      const [file] = uploadFiles;
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
      const response = await uploadDocument({
        projectId: project.projectId,
        documentType: requestedDocumentType,
        file,
      });
      const document = response?.document;

      if (!document?.document_id) {
        throw new Error("업로드된 문서 정보를 확인하지 못했습니다.");
      }

      const uploadedDocument = {
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
      };
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
              nextChoiceRequest.optionalDocuments = uniqueDocumentsById([
                uploadedDocument,
                ...(currentChoiceRequest.optionalDocuments ?? []),
              ]);
              nextChoiceRequest.defaultOptionalDocumentIds = uniqueDocumentsById([
                uploadedDocument,
                ...((currentChoiceRequest.optionalDocuments ?? []).filter((item) =>
                  (currentChoiceRequest.defaultOptionalDocumentIds ?? []).includes(
                    item.documentId,
                  ),
                )),
              ]).map((item) => item.documentId);
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
          `${uploadedDocument.fileName} 업로드가 완료되었습니다. 생성 버튼을 눌러 진행해주세요.`,
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
        documentType: uploadRequestOverride?.documentType,
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
      startGenerationProgress();
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
            const completedProgress = completeGenerationProgress();
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
        }
        setSelectedDocumentIds([]);
        setDocumentStatusMessage("");
        if (isConfirmGenerationAction) {
          setGenerationProgress(null);
        }
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
    setNewProjectStartDate("");
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
    setSettingsStartDate(getProjectStartDate(project));
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
      }`}
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
      />

      <section className="chat-panel" aria-label="PM Agent 채팅">
        <header className="chat-header">
          <button
            className="sidebar-menu-button"
            type="button"
            aria-label="프로젝트 및 대화 목록 열기"
            aria-expanded={isSidebarDrawerOpen}
            onClick={() => setIsSidebarDrawerOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="assistant-avatar">
            <Bot size={20} aria-hidden="true" />
          </div>
          <div className="chat-title">
            <strong>
              {activeConversation?.title ?? "새 채팅을 시작해보세요"}
            </strong>
            <span>
              {project.projectName} · {project.projectId}
            </span>
          </div>
        </header>

        <div className="chat-thread">
          {activeConversation ? (
            activeMessages.length ? (
              activeMessages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isResponding={isResponding}
                  isUploadingDocument={isUploadingDocument}
                  onAgentUploadFiles={handleAgentUploadFiles}
                  onDownloadFile={handleDownloadFile}
                  onDocumentChoice={handleDocumentChoice}
                  onSuggestedActionClick={handleSuggestedActionClick}
                  onCommandActionClick={handleCommandActionClick}
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
          {isResponding &&
            (generationProgress ? (
              <GenerationProgressMessage progressState={generationProgress} />
            ) : (
              <TypingMessage />
            ))}
          <div ref={scrollRef} />
        </div>

        <footer className="composer-area">
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
            onSelect={handleCommandRecommendationClick}
          />

          <form className="chat-composer" onSubmit={handleMessageSubmit}>
            <textarea
              value={composerValue}
              placeholder="PM 산출물, 요구사항, 일정 관련 메시지를 입력하세요."
              rows={1}
              disabled={isResponding}
              onChange={(event) => setComposerValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              aria-label="메시지 입력"
            />
            <button
              className={`send-button ${
                composerValue.trim() ? "" : "is-empty"
              }`}
              type="submit"
              disabled={
                !composerValue.trim() || isResponding || isUploadingDocument
              }
              aria-label="메시지 보내기"
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          </form>
        </footer>
      </section>

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
          isLoading={isLoadingTodos}
          error={todoError}
          actionError={todoActionError}
          savingTodoId={savingTodoId}
          editingTodoId={editingTodoId}
          editDraft={todoEditDraft}
          isImportOpen={isTodoImportOpen}
          importDocuments={filteredTodoImportDocuments}
          importDocumentType={todoImportDocumentType}
          importDocumentId={todoImportDocumentId}
          importFile={todoImportFile}
          importPreview={todoImportPreview}
          selectedImportIds={selectedTodoImportIds}
          isLoadingDocuments={isLoadingUploadedFiles}
          isUploadingImportDocument={isUploadingTodoImportDocument}
          isPreviewingImport={isPreviewingTodoImport}
          isCommittingImport={isCommittingTodoImport}
          onClose={closeTodoManager}
          onStatusFilterChange={handleTodoStatusFilterChange}
          onSourceFilterChange={handleTodoSourceFilterChange}
          onStatusChange={handleTodoStatusChange}
          onStartEdit={handleStartTodoEdit}
          onCancelEdit={handleCancelTodoEdit}
          onEditDraftChange={handleTodoEditDraftChange}
          onSaveEdit={handleSaveTodoEdit}
          onDelete={handleDeleteTodo}
          onToggleImport={handleOpenTodoImport}
          onImportDocumentTypeChange={handleTodoImportDocumentTypeChange}
          onImportDocumentChange={setTodoImportDocumentId}
          onImportFileChange={handleTodoImportFileChange}
          onUploadImportDocument={handleUploadTodoImportDocument}
          onPreviewImport={handlePreviewTodoImport}
          onToggleImportItem={handleToggleTodoImportItem}
          onSelectImportMode={handleSelectTodoImportMode}
          onCommitImport={handleCommitTodoImport}
        />
      )}
    </main>
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
          <div className="assistant-avatar">
            <Bot size={22} aria-hidden="true" />
          </div>
          <span>PM Agent</span>
        </div>

        <div className="entry-copy">
          <p className="eyebrow">Project Workspace</p>
          <h1>PM Agent</h1>
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
}) {
  return (
    <aside className="project-sidebar" aria-label="프로젝트 정보">
      <div className="sidebar-brand">
        <div className="assistant-avatar">
          <Bot size={18} aria-hidden="true" />
        </div>
        <strong>PM Agent</strong>
        <button
          className="sidebar-close-button"
          type="button"
          aria-label="프로젝트 및 대화 목록 닫기"
          onClick={onCloseDrawer}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

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

      <section className="conversation-panel" aria-label="대화 목록">
        <div className="conversation-panel-header">
          <strong>이전 대화</strong>
        </div>
        <button className="new-chat-button" type="button" onClick={onNewChat}>
          <PlusCircle size={17} aria-hidden="true" />새 채팅
        </button>

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
                  onSelectConversation(conversation.conversationId)
                }
                onEdit={() => onEditConversation(conversation)}
                onEditingTitleChange={onEditingConversationTitleChange}
                onTitleSubmit={onConversationTitleSubmit}
                onCancelEdit={onCancelConversationTitleEdit}
                onRequestDelete={() =>
                  onRequestDeleteConversation(conversation.conversationId)
                }
                onCancelDelete={onCancelDeleteConversation}
                onDelete={() =>
                  onDeleteConversation(conversation.conversationId)
                }
              />
            ))}
          </ul>
        ) : (
          <p className="conversation-empty">아직 대화가 없습니다.</p>
        )}
      </section>

      <button
        className="secondary-button"
        type="button"
        onClick={onOpenFileManager}
      >
        <FileText size={16} aria-hidden="true" />
        업로드 파일 목록
      </button>

      <button
        className="secondary-button"
        type="button"
        onClick={onOpenTodoManager}
      >
        <Check size={16} aria-hidden="true" />
        TODO 관리
      </button>

      <button
        className="secondary-button"
        type="button"
        onClick={onChangeProject}
      >
        <LogOut size={16} aria-hidden="true" />
        프로젝트 변경
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
  isLoading,
  error,
  actionError,
  savingTodoId,
  editingTodoId,
  editDraft,
  isImportOpen,
  importDocuments,
  importDocumentType,
  importDocumentId,
  importFile,
  importPreview,
  selectedImportIds,
  isLoadingDocuments,
  isUploadingImportDocument,
  isPreviewingImport,
  isCommittingImport,
  onClose,
  onStatusFilterChange,
  onSourceFilterChange,
  onStatusChange,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onSaveEdit,
  onDelete,
  onToggleImport,
  onImportDocumentTypeChange,
  onImportDocumentChange,
  onImportFileChange,
  onUploadImportDocument,
  onPreviewImport,
  onToggleImportItem,
  onSelectImportMode,
  onCommitImport,
}) {
  const uploadInputId = useId();
  const hasProject = Boolean(project?.projectId);
  const previewNewItems = importPreview?.newItems ?? [];
  const previewDuplicateItems = importPreview?.duplicateItems ?? [];
  const previewCount = previewNewItems.length + previewDuplicateItems.length;
  const selectedCount = selectedImportIds.length;

  const renderPreviewItem = ({
    item,
    duplicateLevel = "NEW",
    matchedExisting = null,
  }) => {
    const itemId = item.clientImportId || item.todoId || item.title;
    const isSelected = selectedImportIds.includes(itemId);
    return (
      <li className="todo-preview-item" key={`${duplicateLevel}-${itemId}`}>
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
          <p>
            {item.assignee || "담당자 미정"} ·{" "}
            {item.dueDate || item.dueDateText || "기한 미정"} ·{" "}
            {getTodoSourceLabel(item.sourceType)}
          </p>
          {matchedExisting?.title && (
            <div className="todo-duplicate-match">
              <span>기존 TODO</span>
              <strong>{matchedExisting.title}</strong>
              <p>
                {matchedExisting.assignee || "담당자 미정"} ·{" "}
                {matchedExisting.dueDate ||
                  matchedExisting.dueDateText ||
                  "기한 미정"}
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
    return (
      <li className="todo-item" key={todo.todoId || todo.title}>
        <div className="todo-item-main">
          <div className="todo-title-block">
            <strong>{todo.title || "제목 없음"}</strong>
            <span>
              {todo.sourceDocumentName || getTodoSourceLabel(todo.sourceType)}
            </span>
          </div>
          <dl className="todo-meta">
            <div>
              <dt>담당자</dt>
              <dd>{todo.assignee || "미정"}</dd>
            </div>
            <div>
              <dt>기한</dt>
              <dd>{todo.dueDate || todo.dueDateText || "미정"}</dd>
            </div>
            <div>
              <dt>출처</dt>
              <dd>{getTodoSourceLabel(todo.sourceType)}</dd>
            </div>
          </dl>
          <div className="todo-row-actions">
            <select
              value={todo.status || "NOT_STARTED"}
              disabled={isSaving}
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
              disabled={isSaving}
              title="TODO 수정"
              aria-label={`${todo.title} TODO 수정`}
              onClick={() => onStartEdit(todo)}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button
              className="inline-icon-button"
              type="button"
              disabled={isSaving}
              title="TODO 삭제"
              aria-label={`${todo.title} TODO 삭제`}
              onClick={() => onDelete(todo)}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        {todo.description && !isEditing && (
          <p className="todo-description">{todo.description}</p>
        )}
        {isEditing && (
          <div className="todo-edit-panel">
            <label>
              TODO명
              <input
                value={editDraft.title}
                disabled={isSaving}
                onChange={(event) =>
                  onEditDraftChange("title", event.target.value)
                }
              />
            </label>
            <label>
              담당자
              <input
                value={editDraft.assignee}
                disabled={isSaving}
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
                disabled={isSaving}
                onChange={(event) =>
                  onEditDraftChange("dueDate", event.target.value)
                }
              />
            </label>
            <label>
              진행상태
              <select
                value={editDraft.status}
                disabled={isSaving}
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
                disabled={isSaving}
                onChange={(event) =>
                  onEditDraftChange("description", event.target.value)
                }
              />
            </label>
            <div className="todo-edit-actions">
              <button
                className="mini-action-button"
                type="button"
                disabled={isSaving}
                onClick={onCancelEdit}
              >
                취소
              </button>
              <button
                className="mini-action-button primary"
                type="button"
                disabled={isSaving || !editDraft.title.trim()}
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
    <div className="modal-backdrop" role="presentation">
      <section
        className="todo-manager-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="todo-manager-title"
      >
        <header className="settings-modal-header">
          <div>
            <span>TODO</span>
            <h2 id="todo-manager-title">TODO 관리</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="TODO 관리 닫기"
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
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onToggleImport}
                >
                  <FileText size={16} aria-hidden="true" />
                  문서에서 TODO 불러오기
                </button>
                <div className="todo-filter-grid">
                  <label>
                    상태
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
              </div>

              {isImportOpen && (
                <section className="todo-import-panel">
                  <div className="todo-import-controls">
                    <label>
                      문서 유형
                      <select
                        value={importDocumentType}
                        onChange={(event) =>
                          onImportDocumentTypeChange(event.target.value)
                        }
                      >
                        {TODO_IMPORT_DOCUMENT_TYPES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      기존 문서
                      <select
                        value={importDocumentId}
                        disabled={isLoadingDocuments || !importDocuments.length}
                        onChange={(event) =>
                          onImportDocumentChange(event.target.value)
                        }
                      >
                        <option value="">
                          {isLoadingDocuments
                            ? "문서 목록 로딩 중"
                            : "문서 선택"}
                        </option>
                        {importDocuments.map((document) => (
                          <option
                            key={document.documentId}
                            value={document.documentId}
                          >
                            {document.fileName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!importDocumentId || isPreviewingImport}
                      onClick={onPreviewImport}
                    >
                      {isPreviewingImport ? (
                        <>
                          <LoaderCircle size={16} aria-hidden="true" />
                          미리보기 중
                        </>
                      ) : (
                        "TODO 미리보기"
                      )}
                    </button>
                  </div>
                  <div className="todo-upload-row">
                    <label htmlFor={uploadInputId}>
                      새 문서 업로드
                      <input
                        key={importFile ? "selected" : "empty"}
                        id={uploadInputId}
                        type="file"
                        accept={DOCUMENT_UPLOAD_ACCEPTED_TYPES.join(",")}
                        onChange={(event) =>
                          onImportFileChange(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!importFile || isUploadingImportDocument}
                      onClick={onUploadImportDocument}
                    >
                      {isUploadingImportDocument ? "업로드 중" : "업로드"}
                    </button>
                  </div>

                  {importPreview && (
                    <div className="todo-preview-panel">
                      <div className="todo-preview-header">
                        <strong>
                          미리보기 {previewCount}개 · 선택 {selectedCount}개
                        </strong>
                        <div>
                          <button
                            className="mini-action-button"
                            type="button"
                            onClick={() => onSelectImportMode("skip-duplicates")}
                          >
                            중복 제외
                          </button>
                          <button
                            className="mini-action-button"
                            type="button"
                            onClick={() => onSelectImportMode("all")}
                          >
                            모두 선택
                          </button>
                          <button
                            className="mini-action-button"
                            type="button"
                            onClick={() => onSelectImportMode("none")}
                          >
                            선택 해제
                          </button>
                        </div>
                      </div>
                      {previewCount ? (
                        <ul className="todo-preview-list">
                          {previewNewItems.map((item) =>
                            renderPreviewItem({ item }),
                          )}
                          {previewDuplicateItems.map((item) =>
                            renderPreviewItem({
                              item: item.candidate,
                              duplicateLevel: item.duplicateLevel,
                              matchedExisting: item.matchedExisting,
                            }),
                          )}
                        </ul>
                      ) : (
                        <p className="file-manager-section-empty">
                          문서에서 불러올 TODO가 없습니다.
                        </p>
                      )}
                      <div className="todo-preview-actions">
                        <button
                          className="primary-button"
                          type="button"
                          disabled={
                            !selectedCount ||
                            !previewCount ||
                            isCommittingImport
                          }
                          onClick={onCommitImport}
                        >
                          {isCommittingImport ? "저장 중" : "선택한 TODO 저장"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="todo-list-section">
                <div className="todo-list-header">
                  <h3>TODO 목록</h3>
                  <span>{todoItems.length}개</span>
                </div>
                {isLoading ? (
                  <div className="file-manager-loading" role="status">
                    <LoaderCircle size={18} aria-hidden="true" />
                    TODO 목록을 불러오는 중입니다.
                  </div>
                ) : error ? (
                  <p className="form-error">{error}</p>
                ) : todoItems.length ? (
                  <ul className="todo-list">{todoItems.map(renderTodoItem)}</ul>
                ) : (
                  <p className="file-manager-section-empty">
                    등록된 TODO가 없습니다.
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
    if (!files.length) {
      return <p className="file-manager-section-empty">{emptyText}</p>;
    }

    return (
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
          const timeLabel = isGenerated ? "생성 시간" : "업로드 시간";
          const timeValue = isGenerated ? file.createdAt : file.uploadedAt;
          const handleDownload = isGenerated ? onDownloadGenerated : onDownloadUploaded;
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
              <dl className="uploaded-file-meta">
                <div>
                  <dt>{timeLabel}</dt>
                  <dd>{formatFileUploadedAt(timeValue, timeLabel)}</dd>
                </div>
                <div>
                  <dt>파일크기</dt>
                  <dd>{formatFileSize(file.fileSize)}</dd>
                </div>
                <div>
                  <dt>파일유형</dt>
                  <dd>{file.fileType}</dd>
                </div>
              </dl>
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
    );
  };

  return (
    <div className="modal-backdrop" role="presentation">
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
  const generationProgressResult = isAssistant
    ? message.metadata?.generationProgress
    : null;
  const scheduleTodoItems = isAssistant
    ? message.metadata?.result?.items ?? []
    : [];
  const corrections = isAssistant ? message.metadata?.corrections ?? [] : [];
  const uploadOutputFormats =
    uploadRequest?.outputFormats ??
    uploadRequest?.documentConfig?.outputFormats ??
    [];
  const shouldShowUploadOutputFormat =
    !uploadRequest?.hideOutputFormat && uploadOutputFormats.length > 0;
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
            ...(shouldShowUploadOutputFormat
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
        {generationProgressResult && (
          <GenerationProgressResult
            progressState={generationProgressResult}
            downloadFiles={downloadFiles}
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
  const shouldShowOutputFormat =
    !documentConfig.hideOutputFormat && outputFormats.length > 0;
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
  const selectedOptionalDocumentId =
    selectedOptionalDocumentIds[0] || defaultOptionalDocumentIds[0] || "";
  const selectedOptionalDocument =
    optionalDocuments.find(
      (document) => document.documentId === selectedOptionalDocumentId,
    ) ?? optionalDocuments[0];
  const documentSelectId = `${panelId}-primary-source-document`;
  const optionalDocumentSelectId = `${panelId}-optional-source-document`;
  const primaryUseName = `${panelId}-primary-use-existing`;
  const optionalUseName = `${panelId}-optional-use-existing`;
  const targetLabel = relation?.targetLabel || documentConfig.targetLabel || "산출물";
  const panelTitle = documentConfig.panelTitle || `${targetLabel} 생성`;
  const actionLabel =
    documentConfig.actionLabel || DOCUMENT_GENERATION_COPY.generate;
  const primaryLabel = primarySource?.label || "기준 문서";
  const optionalLabel = optionalSource?.label || "추가 자료";
  const hasSelectedPrimaryDocument = Boolean(
    usePrimaryDocument && selectedDocument?.documentId,
  );
  const hasSelectedOptionalDocument = Boolean(
    includeOptionalDocument && selectedOptionalDocument?.documentId,
  );
  const shouldShowPrimaryUpload = !hasSelectedPrimaryDocument;
  const shouldShowOptionalUpload = Boolean(
    optionalSource &&
      (!includeOptionalDocument || !selectedOptionalDocument?.documentId),
  );
  const canGenerate =
    hasSelectedPrimaryDocument &&
    (!shouldShowOutputFormat || Boolean(selectedOutputFormat));
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
    setSelectedOptionalDocumentIds(nextOptionalIds);
    setIncludeOptionalDocument(nextOptionalIds.length > 0);
  }, [request?.defaultOptionalDocumentIds, optionalDocuments.length]);

  useEffect(() => {
    setSelectedOutputFormat(
      request?.outputFormat ||
        documentConfig.defaultOutputFormat ||
        (relation ? getDefaultOutputFormat(relation) : ""),
    );
  }, [request?.outputFormat, documentConfig.defaultOutputFormat, relation]);

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
      <strong className="document-choice-title">{panelTitle}</strong>
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
              htmlFor={shouldShowOptionalUpload ? undefined : optionalDocumentSelectId}
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
              <select
                id={optionalDocumentSelectId}
                className="document-choice-source-select document-source-control"
                value={selectedOptionalDocumentId}
                disabled={isDisabled}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  setSelectedOptionalDocumentIds([event.target.value])
                }
              >
                {optionalDocuments.map((document) => (
                  <option key={document.documentId} value={document.documentId}>
                    {document.fileName || document.documentId}
                  </option>
                ))}
              </select>
            )}
          </div>
          {optionalDocuments.length > 0 && (
            <fieldset className="document-choice-radio-row">
              <legend className="sr-only">{optionalLabel} 사용 여부</legend>
              <span className="document-choice-radio-label">기존 문서 사용</span>
              <label
                className="document-choice-check"
                onClick={(event) =>
                  handleChoiceLabelClick(event, () => {
                    setIncludeOptionalDocument(true);
                    setSelectedOptionalDocumentIds([
                      selectedOptionalDocument?.documentId,
                    ].filter(Boolean));
                  })
                }
              >
                <input
                  type="radio"
                  name={optionalUseName}
                  checked={includeOptionalDocument}
                  disabled={isDisabled}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => {
                    setIncludeOptionalDocument(true);
                    setSelectedOptionalDocumentIds([
                      selectedOptionalDocument?.documentId,
                    ].filter(Boolean));
                  }}
                />
                <span>예</span>
              </label>
              <label
                className="document-choice-check"
                onClick={(event) =>
                  handleChoiceLabelClick(event, () =>
                    setIncludeOptionalDocument(false),
                  )
                }
              >
                <input
                  type="radio"
                  name={optionalUseName}
                  checked={!includeOptionalDocument}
                  disabled={isDisabled}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => setIncludeOptionalDocument(false)}
                />
                <span>아니오</span>
              </label>
            </fieldset>
          )}
          <input
            ref={optionalFileInputRef}
            className="message-file-input"
            type="file"
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
                  includeOptionalDocument && selectedOptionalDocument?.documentId
                    ? [selectedOptionalDocument.documentId]
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
  const todos = Array.isArray(items) ? items : [];
  if (!todos.length) return null;

  return (
    <div className="schedule-todo-result" aria-label="회의록 기반 TODO">
      <table>
        <thead>
          <tr>
            <th>할 일</th>
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
              <tr key={todo.todo_id || todo.id || `${todo.title}-${index}`}>
                <td title={evidence}>{truncateTodoText(title)}</td>
                <td>{sanitizeTodoText(todo.assignee) || "담당자 미정"}</td>
                <td>{sanitizeTodoText(todo.due_date) || "기한 미정"}</td>
                <td>
                  {sanitizeTodoText(todo.related_document) ||
                    "회의록 기반 신규 TODO"}
                </td>
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
