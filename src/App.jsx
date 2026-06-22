import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  deleteProjectFile,
  downloadArtifactFile,
  downloadProjectFile,
  getChatActionStatus,
  listProjectFiles,
  listDocuments,
  updateArtifactFileName,
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
const DOCUMENT_GENERATION_COPY = Object.freeze({
  existingCheck: "참고할 기존 문서가 있나요?",
  existingChoice: "기준 문서를 확인해주세요.",
  uploadOrCreate: "생성 기준 문서를 업로드해주세요.",
  start: "문서 생성을 시작하겠습니다.",
  uploadLabel: "기준 문서 업로드",
  useExisting: "이 문서로 생성",
  createNew: "새 문서로 생성",
  directCreate: "생성",
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

const getDocumentDisplayLabel = (documentType) => {
  if (documentType === DOCUMENT_TYPES.WBS) return "업로드한 WBS";
  if (documentType === DOCUMENT_TYPES.SCREEN_DESIGN) {
    return "업로드한 화면설계서";
  }
  if (documentType === DOCUMENT_TYPES.MEETING_NOTES) return "업로드한 회의록";
  if (documentType === DOCUMENT_TYPES.REQUIREMENT_SPEC) {
    return "업로드한 요구사항 명세서";
  }
  if (documentType === DEFAULT_DOCUMENT_TYPE) {
    return "업로드한 구축요건 정의서";
  }
  return "업로드한 문서";
};

const getRelation = (requestType) => GENERATION_DOCUMENT_RELATIONS[requestType] ?? null;

const getOutputFormats = (relation) =>
  Array.isArray(relation?.outputFormats) && relation.outputFormats.length
    ? relation.outputFormats
    : [{ value: "xlsx", label: OUTPUT_FORMAT_LABELS.xlsx }];

const getDefaultOutputFormat = (relation) => getOutputFormats(relation)[0]?.value || "xlsx";

const formatRelationSourceLabels = (relation, optionalDocuments = []) => {
  const labels = [relation?.primarySource?.label].filter(Boolean);
  if (optionalDocuments.length) {
    const optionalLabels = relation?.optionalSources?.map((source) => source.label) ?? [];
    labels.push(...optionalLabels);
  }
  if (labels.length <= 1) return labels[0] || "기준 문서";
  return `${labels.slice(0, -1).join(", ")}와 ${labels[labels.length - 1]}`;
};

const getRelationQuestion = (relation, optionalDocuments = []) =>
  `${formatRelationSourceLabels(relation, optionalDocuments)}를 기준으로 ${
    relation?.targetLabel || "산출물"
  }를 생성할까요?`;

const getRelationUploadMessage = (relation) =>
  `${relation?.targetLabel || "산출물"}를 생성하려면 기준이 되는 ${
    relation?.primarySource?.label || "참고 문서"
  }가 필요합니다.\n참고 문서를 업로드하거나, 문서 없이 바로 생성하려면 생성 버튼을 눌러주세요.`;

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

const formatFileSize = (value) => {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return "크기 정보 없음";
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

const formatFileUploadedAt = (value) => {
  if (!value) return "업로드 시간 정보 없음";
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
    file.contentType ??
    getFileExtension(fileName);
  const fileType = resolvedFileType || "확인 불가";

  return {
    fileId,
    fileName,
    fileType,
    fileSize: file.file_size ?? file.fileSize ?? file.size ?? null,
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
  return {
    fileId: file.artifact_id ?? file.artifactId ?? file.file_id ?? file.id ?? "",
    fileName,
    fileType: getFileExtension(fileName) || artifactType || "생성 파일",
    artifactType,
    version: file.version ?? null,
    createdAt: file.created_at ?? file.createdAt ?? "",
    updatedAt: file.updated_at ?? file.updatedAt ?? "",
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
  uploaded: normalizeUploadedFileListResponse(response),
  generated: normalizeGeneratedFileListResponse(response),
});

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
  documents.filter((document) => {
    const documentType = document.documentType ?? "";
    if (config.documentTypes?.includes(documentType)) return true;

    const searchText = getDocumentSearchText(document);
    return (config.keywords ?? []).some((keyword) =>
      searchText.includes(compactText(keyword)),
    );
  });

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
  const commonCommandActions = [
    {
      label: DOCUMENT_GENERATION_COPY.directCreate,
      directCreate: true,
      requestType,
      outputFormat: getDefaultOutputFormat(relation),
    },
  ];

  return {
    requestType,
    relation,
    targetArtifactType: relation.targetArtifactType,
    targetLabel: relation.targetLabel,
    primarySource: relation.primarySource,
    optionalSources: relation.optionalSources ?? [],
    outputFormats,
    defaultOutputFormat: getDefaultOutputFormat(relation),
    message: getRelationUploadMessage(relation),
    existingMessage: getRelationQuestion(relation),
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
    commandActions: commonCommandActions,
  };
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
  const [isLoadingUploadedFiles, setIsLoadingUploadedFiles] = useState(false);
  const [fileManagerError, setFileManagerError] = useState("");
  const [fileActionError, setFileActionError] = useState("");
  const [pendingDeleteFile, setPendingDeleteFile] = useState(null);
  const [deletingFileId, setDeletingFileId] = useState("");
  const [downloadingFileId, setDownloadingFileId] = useState("");
  const [editingGeneratedFileId, setEditingGeneratedFileId] = useState("");
  const [renamingGeneratedFileId, setRenamingGeneratedFileId] = useState("");
  const [generatedFileNameDraft, setGeneratedFileNameDraft] = useState("");
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

  const resetFileManagerState = () => {
    setIsFileManagerOpen(false);
    setFileBuckets({ uploaded: [], generated: [] });
    setIsLoadingUploadedFiles(false);
    setFileManagerError("");
    setFileActionError("");
    setPendingDeleteFile(null);
    setDeletingFileId("");
    setDownloadingFileId("");
    setEditingGeneratedFileId("");
    setRenamingGeneratedFileId("");
    setGeneratedFileNameDraft("");
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
      setGenerationProgress(null);
      return assistantMessage;
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
      const response = await listDocuments(projectId);
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
    setPendingDeleteFile(null);
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

    setDownloadingFileId(file.fileId);
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
    setPendingDeleteFile(file);
    setFileActionError("");
  };

  const handleCancelDeleteUploadedFile = () => {
    setPendingDeleteFile(null);
    setFileActionError("");
  };

  const handleConfirmDeleteUploadedFile = async () => {
    if (!project?.projectId) {
      setFileActionError("프로젝트를 먼저 선택해주세요.");
      return;
    }
    if (!pendingDeleteFile?.fileId) {
      setFileActionError("삭제할 파일 정보를 확인하지 못했습니다.");
      return;
    }

    setDeletingFileId(pendingDeleteFile.fileId);
    setFileActionError("");

    try {
      await deleteProjectFile({
        projectId: project.projectId,
        fileId: pendingDeleteFile.fileId,
      });
      setFileBuckets((currentBuckets) => ({
        ...currentBuckets,
        uploaded: currentBuckets.uploaded.filter(
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

    setDownloadingFileId(file.fileId);
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

  const handleStartGeneratedFileRename = (file) => {
    setEditingGeneratedFileId(file.fileId);
    setGeneratedFileNameDraft(file.fileName || "");
    setFileActionError("");
  };

  const handleCancelGeneratedFileRename = () => {
    setEditingGeneratedFileId("");
    setGeneratedFileNameDraft("");
    setFileActionError("");
  };

  const handleSaveGeneratedFileRename = async (file) => {
    if (!project?.projectId || !file?.fileId) {
      setFileActionError("수정할 생성 파일 정보를 확인하지 못했습니다.");
      return;
    }

    const nextFileName = generatedFileNameDraft.trim();
    if (!nextFileName) {
      setFileActionError("파일명을 입력해주세요.");
      return;
    }

    setRenamingGeneratedFileId(file.fileId);
    setFileActionError("");

    try {
      const updatedArtifact = await updateArtifactFileName({
        projectId: project.projectId,
        artifactId: file.fileId,
        fileName: nextFileName,
      });
      const updatedFile = normalizeGeneratedFile(updatedArtifact);
      setFileBuckets((currentBuckets) => ({
        ...currentBuckets,
        generated: currentBuckets.generated.map((generatedFile) =>
          generatedFile.fileId === file.fileId ? updatedFile : generatedFile,
        ),
      }));
      setEditingGeneratedFileId("");
      setGeneratedFileNameDraft("");
    } catch (error) {
      setFileActionError(
        error instanceof Error
          ? error.message
          : "생성 파일명을 수정하지 못했습니다.",
      );
    } finally {
      setRenamingGeneratedFileId("");
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
    const requestType = getGenerationRequestType(messageText);

    const requiredDocumentConfig = getRequiredDocumentConfig(requestType);
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
    const matchedDocument = matchingDocuments[0] ?? null;
    if (matchedDocument) {
      return {
        status: "DOCUMENT_CHOICE_REQUIRED",
        documents: matchingDocuments,
        optionalDocuments: uniqueDocumentsById(optionalDocuments),
        defaultDocument: matchedDocument,
        documentConfig: requiredDocumentConfig,
        requestType,
      };
    }

    return {
      status: "UPLOAD_REQUIRED",
      documentConfig: requiredDocumentConfig,
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
          content: preparedRequest.documentConfig.message,
          metadata: {
            uploadRequest: {
              label: preparedRequest.documentConfig.label,
              acceptedTypes: DOCUMENT_UPLOAD_ACCEPTED_TYPES,
              documentType: preparedRequest.documentConfig.documentType,
              originalMessage: trimmedValue,
              resumeAfterUpload: true,
              requestType: preparedRequest.requestType,
              outputFormats: preparedRequest.documentConfig.outputFormats,
              outputFormat: preparedRequest.documentConfig.defaultOutputFormat,
            },
            commandActions: preparedRequest.documentConfig.commandActions ?? [],
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
        requestedDocumentType === DOCUMENT_TYPES.WBS;
      if (shouldResumeAfterUpload) {
        const resumeDocuments = getUploadResumeDocuments(
          uploadRequest,
          uploadedDocument,
        );
        setDocumentStatusMessage(DOCUMENT_GENERATION_COPY.start);
        const targetConversationId =
          message.metadata?.conversationId || activeConversationId;
        await sendBackendConversationMessage({
          targetProject: project,
          targetConversationId,
          messageText: originalMessage,
          documents: resumeDocuments,
          requestType: uploadRequest.requestType,
          extraContext: {
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
    const selectedOutputFormat =
      outputFormat ||
      choiceRequest.outputFormat ||
      choiceRequest.documentConfig?.defaultOutputFormat ||
      getDefaultOutputFormat(getRelation(requestType));

    if (!targetConversationId) {
      setConversationActionError("문서를 선택할 대화 정보를 확인하지 못했습니다.");
      return;
    }

    if (choice === "upload_new") {
      return;
    }

    if (choice === "create_new") {
      setIsResponding(true);
      setConversationActionError("");
      setDocumentError("");
      setDocumentStatusMessage(DOCUMENT_GENERATION_COPY.start);

      try {
        await clearMessageActions({
          conversationId: targetConversationId,
          message,
        });
        const backendResult = await sendBackendConversationMessage({
          targetProject: project,
          targetConversationId,
          messageText: originalMessage,
          documents: [],
          requestType,
          extraContext: {
            document_generation_mode: "new_document",
            source_document_ids: [],
            document_ids: [],
            selected_document_ids: [],
            selected_documents: [],
            output_format: selectedOutputFormat,
          },
        });
        await saveCommandUsage(project.projectId, originalMessage);
        setLastCommandInfo({ commandText: originalMessage });
        setSelectedDocumentIds([]);
        setProject(backendResult.project);
      } catch (error) {
        reportUiError("handleDocumentChoiceCreateNew", error, {
          projectId: project?.projectId,
          requestType,
        });
        setDocumentError(
          error instanceof Error
            ? error.message
            : "새 문서 생성을 시작하지 못했습니다.",
        );
      } finally {
        setIsResponding(false);
      }
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
    setDocumentStatusMessage(DOCUMENT_GENERATION_COPY.start);

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
        extraContext: {
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

    if (action?.directCreate) {
      const targetConversationId =
        message.metadata?.conversationId || activeConversationId;
      const uploadRequest = message.metadata?.uploadRequest ?? {};
      const commandText = String(
        uploadRequest.originalMessage ||
          action?.message ||
          action?.command ||
          action?.label ||
          "",
      ).trim();
      if (!commandText || !targetConversationId) return;

      setIsResponding(true);
      setConversationActionError("");
      setDocumentError("");
      setDocumentStatusMessage(DOCUMENT_GENERATION_COPY.start);

      try {
        await clearMessageActions({
          conversationId: targetConversationId,
          message,
        });
        await sendBackendConversationMessage({
          targetProject: project,
          targetConversationId,
          messageText: commandText,
          documents: [],
          requestType: action.requestType || uploadRequest.requestType || "",
          extraContext: {
            document_generation_mode: "direct_create",
            source_document_ids: [],
            document_ids: [],
            selected_document_ids: [],
            selected_documents: [],
            output_format:
              action.outputFormat ||
              uploadRequest.outputFormat ||
              getDefaultOutputFormat(
                getRelation(action.requestType || uploadRequest.requestType || ""),
              ),
          },
        });
        await saveCommandUsage(project.projectId, commandText);
        setLastCommandInfo({ commandText });
      } catch (error) {
        reportUiError("handleDirectCreateActionClick", error, {
          projectId: project?.projectId,
          requestType: action.requestType || uploadRequest.requestType,
        });
        setDocumentError(
          error instanceof Error
            ? error.message
            : "문서 생성을 시작하지 못했습니다.",
        );
      } finally {
        setIsResponding(false);
      }
      return;
    }

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
          <CommandRecommendationBar
            recommendations={commandRecommendations}
            isDisabled={isResponding}
            onSelect={handleCommandRecommendationClick}
          />

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
          isLoading={isLoadingUploadedFiles}
          error={fileManagerError}
          actionError={fileActionError}
          pendingDeleteFile={pendingDeleteFile}
          deletingFileId={deletingFileId}
          downloadingFileId={downloadingFileId}
          editingGeneratedFileId={editingGeneratedFileId}
          renamingGeneratedFileId={renamingGeneratedFileId}
          generatedFileNameDraft={generatedFileNameDraft}
          onGeneratedFileNameDraftChange={setGeneratedFileNameDraft}
          onRefresh={() => loadUploadedFiles(project)}
          onClose={closeFileManager}
          onDownloadUploaded={handleDownloadUploadedFile}
          onDownloadGenerated={handleDownloadGeneratedFile}
          onRequestDelete={handleRequestDeleteUploadedFile}
          onCancelDelete={handleCancelDeleteUploadedFile}
          onConfirmDelete={handleConfirmDeleteUploadedFile}
          onStartGeneratedRename={handleStartGeneratedFileRename}
          onCancelGeneratedRename={handleCancelGeneratedFileRename}
          onSaveGeneratedRename={handleSaveGeneratedFileRename}
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

function FileManagerModal({
  project,
  fileBuckets,
  isLoading,
  error,
  actionError,
  pendingDeleteFile,
  deletingFileId,
  downloadingFileId,
  editingGeneratedFileId,
  renamingGeneratedFileId,
  generatedFileNameDraft,
  onGeneratedFileNameDraftChange,
  onRefresh,
  onClose,
  onDownloadUploaded,
  onDownloadGenerated,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onStartGeneratedRename,
  onCancelGeneratedRename,
  onSaveGeneratedRename,
}) {
  const hasProject = Boolean(project?.projectId);
  const uploadedFiles = Array.isArray(fileBuckets?.uploaded)
    ? fileBuckets.uploaded
    : [];
  const generatedFiles = Array.isArray(fileBuckets?.generated)
    ? fileBuckets.generated
    : [];
  const hasFiles = uploadedFiles.length > 0 || generatedFiles.length > 0;

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

        <div className="file-manager-toolbar">
          <div className="readonly-field">
            <span>Project ID</span>
            <strong>{project?.projectId || "프로젝트 미선택"}</strong>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={isLoading || !hasProject}
            onClick={onRefresh}
          >
            새로고침
          </button>
        </div>

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
          ) : hasFiles ? (
            <div className="file-manager-sections">
              <section className="file-manager-section">
                <h3>업로드한 파일</h3>
                {uploadedFiles.length ? (
                  <ul className="uploaded-file-list">
                    {uploadedFiles.map((file) => {
                      const isPendingDelete =
                        pendingDeleteFile?.fileId === file.fileId;
                      const isDeleting = deletingFileId === file.fileId;
                      const isDownloading = downloadingFileId === file.fileId;

                      return (
                        <li
                          className="uploaded-file-item"
                          key={`${file.fileId}-${file.fileName}`}
                        >
                          <div className="uploaded-file-main">
                            <FileText size={18} aria-hidden="true" />
                            <div>
                              <strong>{file.fileName}</strong>
                              <span>{file.documentLabel}</span>
                            </div>
                          </div>
                          <dl className="uploaded-file-meta">
                            <div>
                              <dt>유형</dt>
                              <dd>{file.fileType}</dd>
                            </div>
                            <div>
                              <dt>업로드 시간</dt>
                              <dd>{formatFileUploadedAt(file.uploadedAt)}</dd>
                            </div>
                            <div>
                              <dt>크기</dt>
                              <dd>{formatFileSize(file.fileSize)}</dd>
                            </div>
                            <div>
                              <dt>문서 구분</dt>
                              <dd>{file.documentLabel}</dd>
                            </div>
                          </dl>
                          <div className="uploaded-file-actions">
                            <button
                              className="mini-action-button"
                              type="button"
                              disabled={isDeleting || isDownloading}
                              onClick={() => onDownloadUploaded(file)}
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
                              disabled={isDeleting || isDownloading}
                              onClick={() => onRequestDelete(file)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              삭제
                            </button>
                          </div>
                          {isPendingDelete && (
                            <div className="file-delete-confirm">
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
                ) : (
                  <p className="file-manager-section-empty">업로드한 파일이 없습니다.</p>
                )}
              </section>

              <section className="file-manager-section">
                <h3>생성한 파일</h3>
                {generatedFiles.length ? (
                  <ul className="uploaded-file-list">
                    {generatedFiles.map((file) => {
                      const isDownloading = downloadingFileId === file.fileId;
                      const isEditing = editingGeneratedFileId === file.fileId;
                      const isRenaming = renamingGeneratedFileId === file.fileId;

                      return (
                        <li
                          className="uploaded-file-item"
                          key={`${file.fileId}-${file.fileName}`}
                        >
                          <div className="uploaded-file-main">
                            <FileText size={18} aria-hidden="true" />
                            <div>
                              {isEditing ? (
                                <input
                                  className="generated-file-name-input"
                                  value={generatedFileNameDraft}
                                  disabled={isRenaming}
                                  onChange={(event) =>
                                    onGeneratedFileNameDraftChange(
                                      event.target.value,
                                    )
                                  }
                                />
                              ) : (
                                <strong>{file.fileName}</strong>
                              )}
                              <span>{file.artifactType || "생성 산출물"}</span>
                            </div>
                          </div>
                          <dl className="uploaded-file-meta">
                            <div>
                              <dt>유형</dt>
                              <dd>{file.fileType}</dd>
                            </div>
                            <div>
                              <dt>생성 시간</dt>
                              <dd>{formatFileUploadedAt(file.createdAt)}</dd>
                            </div>
                            <div>
                              <dt>버전</dt>
                              <dd>{file.version ? `v${file.version}` : "정보 없음"}</dd>
                            </div>
                            <div>
                              <dt>산출물</dt>
                              <dd>{file.artifactType || "확인 불가"}</dd>
                            </div>
                          </dl>
                          <div className="uploaded-file-actions">
                            <button
                              className="mini-action-button"
                              type="button"
                              disabled={isRenaming || isDownloading}
                              onClick={() => onDownloadGenerated(file)}
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
                            {isEditing ? (
                              <>
                                <button
                                  className="mini-action-button primary"
                                  type="button"
                                  disabled={isRenaming}
                                  onClick={() => onSaveGeneratedRename(file)}
                                >
                                  <Save size={14} aria-hidden="true" />
                                  저장
                                </button>
                                <button
                                  className="mini-action-button"
                                  type="button"
                                  disabled={isRenaming}
                                  onClick={onCancelGeneratedRename}
                                >
                                  <X size={14} aria-hidden="true" />
                                  취소
                                </button>
                              </>
                            ) : (
                              <button
                                className="mini-action-button"
                                type="button"
                                disabled={isDownloading}
                                onClick={() => onStartGeneratedRename(file)}
                              >
                                <Pencil size={14} aria-hidden="true" />
                                수정
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="file-manager-section-empty">생성한 파일이 없습니다.</p>
                )}
              </section>
            </div>
          ) : (
            <p className="file-manager-empty">표시할 파일이 없습니다.</p>
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
  const commandActions =
    isAssistant && !actionsResolved
      ? message.metadata?.commandActions ??
        message.metadata?.result?.command_actions ??
        []
      : [];
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
            outputFormat: selectedUploadOutputFormat,
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
            <GenerationOutputFormatField
              formats={uploadOutputFormats}
              value={selectedUploadOutputFormat}
              onChange={setSelectedUploadOutputFormat}
              isDisabled={isResponding || isUploadingDocument}
            />
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
        <ScheduleTodoResult items={scheduleTodoItems} />
        <MessageResult
          downloadFiles={downloadFiles}
          onDownloadFile={onDownloadFile}
        />
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
  onChoice,
}) {
  const documents = Array.isArray(request?.documents) ? request.documents : [];
  const optionalDocuments = Array.isArray(request?.optionalDocuments)
    ? request.optionalDocuments
    : [];
  const documentConfig = request?.documentConfig ?? {};
  const relation = documentConfig.relation ?? getRelation(documentConfig.requestType);
  const outputFormats =
    request?.outputFormats ?? documentConfig.outputFormats ?? getOutputFormats(relation);
  const defaultDocumentId =
    request?.defaultDocumentId || documents[0]?.documentId || "";
  const [selectedDocumentId, setSelectedDocumentId] =
    useState(defaultDocumentId);
  const [selectedOptionalDocumentIds, setSelectedOptionalDocumentIds] =
    useState([]);
  const [selectedOutputFormat, setSelectedOutputFormat] = useState(
    request?.outputFormat ||
      documentConfig.defaultOutputFormat ||
      getDefaultOutputFormat(relation),
  );
  const defaultDocument =
    documents.find((document) => document.documentId === defaultDocumentId) ??
    documents[0];
  const selectedDocument =
    documents.find((document) => document.documentId === selectedDocumentId) ??
    defaultDocument;
  const documentSelectId = `${defaultDocumentId || "document"}-source-document`;

  useEffect(() => {
    setSelectedDocumentId(defaultDocumentId);
  }, [defaultDocumentId]);

  useEffect(() => {
    setSelectedOptionalDocumentIds([]);
  }, [defaultDocumentId, optionalDocuments.length]);

  useEffect(() => {
    setSelectedOutputFormat(
      request?.outputFormat ||
        documentConfig.defaultOutputFormat ||
        getDefaultOutputFormat(relation),
    );
  }, [request?.outputFormat, documentConfig.defaultOutputFormat, relation]);

  if (!documents.length) return null;

  const selectedOptionalDocuments = optionalDocuments.filter((document) =>
    selectedOptionalDocumentIds.includes(document.documentId),
  );
  const relationQuestion = getRelationQuestion(relation, selectedOptionalDocuments);
  const toggleOptionalDocument = (documentId) => {
    setSelectedOptionalDocumentIds((currentIds) =>
      currentIds.includes(documentId)
        ? currentIds.filter((id) => id !== documentId)
        : [...currentIds, documentId],
    );
  };

  const handlePanelAction = (event, callback) => {
    event.preventDefault();
    event.stopPropagation();
    if (isDisabled) return;
    callback();
  };

  return (
    <div className="message-document-choice-panel">
      <strong className="document-choice-question">
        {relationQuestion}
      </strong>
      <div className="document-choice-summary">
        <strong>{selectedDocument?.fileName || "업로드된 문서"}</strong>
        <span>{relation?.primarySource?.label || selectedDocument?.displayLabel || "기준 문서"}</span>
      </div>
      {documents.length > 1 && (
        <div className="document-choice-picker">
          <label htmlFor={documentSelectId}>기준 문서</label>
          <select
            id={documentSelectId}
            value={selectedDocumentId}
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
        </div>
      )}
      {optionalDocuments.length > 0 && (
        <section className="document-choice-section">
          <span className="document-choice-section-title">선택 문서</span>
          {optionalDocuments.map((document) => (
            <label
              className="document-choice-check"
              key={`${document.documentId}-${document.fileName}`}
            >
              <input
                type="checkbox"
                checked={selectedOptionalDocumentIds.includes(document.documentId)}
                disabled={isDisabled}
                onChange={() => toggleOptionalDocument(document.documentId)}
              />
              <span>
                {(relation?.optionalSources?.[0]?.label || document.displayLabel) +
                  ` ${document.fileName || document.documentId} 함께 반영`}
              </span>
            </label>
          ))}
        </section>
      )}
      <GenerationOutputFormatField
        formats={outputFormats}
        value={selectedOutputFormat}
        onChange={setSelectedOutputFormat}
        isDisabled={isDisabled}
      />
      <div className="document-choice-actions">
        <button
          className="message-upload-button"
          type="button"
          disabled={isDisabled}
          onClick={(event) =>
            handlePanelAction(event, () =>
              onChoice({
                choice: "use_existing",
                documentId: selectedDocument?.documentId,
                optionalDocumentIds: selectedOptionalDocumentIds,
                outputFormat: selectedOutputFormat,
              }),
            )
          }
        >
          {DOCUMENT_GENERATION_COPY.useExisting}
        </button>
        <button
          className="message-upload-button secondary"
          type="button"
          disabled={isDisabled}
          onClick={(event) =>
            handlePanelAction(event, () =>
              onChoice({
                choice: "create_new",
                outputFormat: selectedOutputFormat,
              }),
            )
          }
        >
          {DOCUMENT_GENERATION_COPY.createNew}
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
            <th>관련 산출물</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {todos.map((todo, index) => {
            const title = sanitizeTodoText(todo.title || "제목 없음");
            const evidence = sanitizeTodoText(todo.evidence || title);
            return (
              <tr key={todo.todo_id ?? `${todo.title}-${index}`}>
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
