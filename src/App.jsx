import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Check,
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
import { getCommandRecommendations } from "./services/commandRecommendationService.js";
import { downloadArtifactFile, uploadDocument } from "./api/finpmApi.js";
import {
  CHAT_ACTION_COMMAND_TYPES,
  CHAT_STATES,
  DOCUMENT_TYPES,
} from "./types/api.js";
import { formatDateTime } from "./services/dateTime.js";
import AgentProgress from "./components/AgentProgress.jsx";
import ProgressBar from "./components/ProgressBar.jsx";

const DEFAULT_USER_ID = "frontend-user";
const DEFAULT_PERMISSION_SCOPE = ["project:read"];
const DEFAULT_DOCUMENT_TYPE = DOCUMENT_TYPES.CONSTRUCTION_REQUIREMENT_DEFINITION;
const GENERATION_PROGRESS_STEP_INTERVAL_MS = 650;
const GENERATION_PROGRESS_MIN_DURATION_MS = 3200;
const GENERATION_PROGRESS_STEPS = [
  {
    name: "요청 확인 중",
    completedName: "10% 요청 확인 완료",
    role: "PM Agent",
    message: "생성 요청과 업로드 문서를 확인하고 있습니다.",
    progress: 10,
  },
  {
    name: "Input Agent 문서 분석 중",
    completedName: "25% Input Agent 문서 분석 완료",
    role: "Input Agent",
    message: "구축요건 정의서에서 요구사항 후보를 추출하고 있습니다.",
    progress: 25,
  },
  {
    name: "Core Agent 요구사항 추출 중",
    completedName: "45% Core Agent 요구사항 추출 완료",
    role: "Core Agent",
    message: "요구사항 정의서 항목을 정리하고 있습니다.",
    progress: 45,
  },
  {
    name: "Validation Agent 검증 중",
    completedName: "65% Validation Agent 검증 완료",
    role: "Validation Agent",
    message: "누락 항목과 표현을 점검하고 있습니다.",
    progress: 65,
  },
  {
    name: "Output Agent 엑셀 작성 중",
    completedName: "85% Output Agent 엑셀 작성 완료",
    role: "Output Agent",
    message: "엑셀 파일과 다운로드 버튼을 준비하고 있습니다.",
    progress: 85,
  },
  {
    name: "문서 생성 완료",
    completedName: "100% 문서 생성 완료",
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

const normalizeCommandText = (value = "") =>
  String(value).replace(/\s+/g, "").toLowerCase();

const isRequirementSpecGenerationRequest = (value = "") => {
  const normalized = normalizeCommandText(value);
  const hasRequirementTarget =
    normalized.includes("요구사항명세서") ||
    normalized.includes("요구사항정의서");
  const hasGenerationSignal =
    normalized.includes("생성") ||
    normalized.includes("만들") ||
    normalized.includes("작성");

  return hasRequirementTarget && hasGenerationSignal;
};

const toDocumentContext = (document) => ({
  document_id: document.document_id ?? document.documentId,
  file_name: document.file_name ?? document.fileName ?? "",
  document_type: document.document_type ?? document.documentType ?? DEFAULT_DOCUMENT_TYPE,
  display_label:
    document.display_label ??
    document.displayLabel ??
    "업로드한 구축요건 정의서",
});

const toAttachmentDocument = (document) => ({
  documentId: document.document_id ?? document.documentId,
  fileName:
    document.file_name ??
    document.fileName ??
    "업로드한 구축요건 정의서",
  documentType: document.document_type ?? document.documentType ?? DEFAULT_DOCUMENT_TYPE,
  createdAt: document.created_at ?? document.createdAt ?? "",
  displayLabel:
    document.display_label ??
    document.displayLabel ??
    "업로드한 구축요건 정의서",
});

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

const buildGenerationFailureProgress = (failedIndex) => {
  const boundedFailedIndex = Math.max(
    0,
    Math.min(failedIndex, GENERATION_PROGRESS_STEPS.length - 2),
  );
  const failedStep = GENERATION_PROGRESS_STEPS[boundedFailedIndex];

  return {
    progress: failedStep.progress,
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
          message: "이 단계에서 문제가 발생했습니다. 문서를 확인한 뒤 다시 시도해주세요.",
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

function App() {
  const [entryProjectId, setEntryProjectId] = useState("");
  const [entryError, setEntryError] = useState("");
  const [pendingNewProjectId, setPendingNewProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
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
  const scrollRef = useRef(null);
  const progressTimerRef = useRef(null);
  const progressStartedAtRef = useRef(0);
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

  const clearGenerationProgressTimer = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const resetGenerationState = () => {
    clearGenerationProgressTimer();
    setGenerationProgress(null);
    setSelectedDocumentIds([]);
    setDocumentStatusMessage("");
  };

  const startGenerationProgress = () => {
    clearGenerationProgressTimer();
    let stepIndex = 0;
    progressStartedAtRef.current = Date.now();
    progressStepIndexRef.current = stepIndex;
    setGenerationProgress(
      buildGenerationProgress(GENERATION_PROGRESS_STEPS[stepIndex].progress),
    );
    progressTimerRef.current = window.setInterval(() => {
      stepIndex = Math.min(stepIndex + 1, GENERATION_PROGRESS_STEPS.length - 1);
      progressStepIndexRef.current = stepIndex;
      setGenerationProgress(
        buildGenerationProgress(GENERATION_PROGRESS_STEPS[stepIndex].progress),
      );
      if (stepIndex >= GENERATION_PROGRESS_STEPS.length - 2) {
        clearGenerationProgressTimer();
      }
    }, GENERATION_PROGRESS_STEP_INTERVAL_MS);
  };

  const waitForGenerationProgressMinimum = async () => {
    const elapsed = Date.now() - progressStartedAtRef.current;
    const remaining = Math.max(0, GENERATION_PROGRESS_MIN_DURATION_MS - elapsed);
    if (remaining > 0) {
      await wait(remaining);
    }
  };

  const completeGenerationProgress = async () => {
    await waitForGenerationProgressMinimum();
    clearGenerationProgressTimer();
    const completedProgress = buildGenerationProgress(100, "COMPLETED");
    setGenerationProgress(completedProgress);
    return completedProgress;
  };

  const failGenerationProgress = () => {
    clearGenerationProgressTimer();
    const failedProgress = buildGenerationFailureProgress(
      progressStepIndexRef.current,
    );
    setGenerationProgress(failedProgress);
    return failedProgress;
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
          pendingAction: null,
          suggestedActions: [],
        },
      }),
    );
    setProject(result.project);
    return result.project;
  };

  const enterProject = useCallback((loadedProject) => {
    const nextActiveConversationId = getInitialActiveConversationId(loadedProject);

    setProject(loadedProject);
    setActiveConversationIdState(nextActiveConversationId);
    setComposerValue("");
    setEntryProjectId(loadedProject.projectId);
    setPendingNewProjectId("");
    setNewProjectName("");
    setNewProjectDescription("");
    setNewProjectError("");
    setConversationActionError("");
    setDeletingConversationId("");
    setLastCommandInfo(null);
    setSelectedDocumentIds([]);
    setDocumentError("");
    setDocumentStatusMessage("");
    clearGenerationProgressTimer();
    setGenerationProgress(null);
    setRecentProjectId(loadedProject.projectId);

    if (nextActiveConversationId) {
      setActiveConversationId(loadedProject.projectId, nextActiveConversationId);
    }
  }, []);

  const lookupProject = useCallback(
    async (projectId) => {
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
          enterProject(loadedProject);
          return;
        }

        setPendingNewProjectId(nextProjectId);
        setNewProjectName("");
        setNewProjectDescription("");
      } catch (error) {
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
    const recentProjectId = getRecentProjectId();
    if (recentProjectId) {
      setEntryProjectId(recentProjectId);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    activeConversationId,
    activeMessages.length,
    generationProgress?.progress,
    isResponding,
  ]);

  useEffect(
    () => () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }
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
    const submittedProjectDescription = String(
      formData.get("projectDescription") ?? "",
    );

    if (!submittedProjectName.trim()) {
      setNewProjectError("프로젝트명을 입력해주세요.");
      return;
    }

    setIsCreatingProject(true);
    setNewProjectError("");

    try {
      const createdProject = await createProject(
        pendingNewProjectId,
        submittedProjectName,
        submittedProjectDescription,
      );
      enterProject(createdProject);
    } catch (error) {
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

      if (isRequirementSpecGenerationRequest(trimmedValue)) {
        const localConversationId =
          targetConversationId || createChatId("conversation");
        const assistantMessage = {
          id: createChatId("assistant"),
          role: "assistant",
          content:
            "요구사항 정의서를 생성하려면 구축요건 정의서가 필요합니다.\n구축요건 정의서를 업로드해주세요.",
          createdAt: formatDateTime(),
          metadata: {
            conversationId: localConversationId,
            state: CHAT_STATES.WAITING_REQUIRED_INFO,
            uploadRequest: {
              label: "구축요건 정의서 업로드",
              documentType: DEFAULT_DOCUMENT_TYPE,
              originalMessage: trimmedValue,
            },
          },
        };
        const messageResult = await addMessagesToConversation(
          targetProject.projectId,
          localConversationId,
          [userMessage, assistantMessage],
        );

        setProject(messageResult.project);
        setActiveConversationIdState(localConversationId);
        setActiveConversationId(targetProject.projectId, localConversationId);
        setLastCommandInfo({ commandText: trimmedValue });
        setSelectedDocumentIds([]);
        setDocumentStatusMessage("");
        return;
      }

      const assistantMessage = await sendProjectMessage({
        project_id: targetProject.projectId,
        conversation_id: targetConversationId || null,
        user_id: DEFAULT_USER_ID,
        message: trimmedValue,
        context: {
          selected_document_ids: [],
          selected_documents: [],
        },
        permission_scope: DEFAULT_PERMISSION_SCOPE,
      });
      const backendConversationId =
        assistantMessage.metadata?.conversationId ?? targetConversationId;
      if (!backendConversationId) {
        throw new Error("백엔드 대화 ID를 확인하지 못했습니다.");
      }

      const messageResult = await addMessagesToConversation(
        targetProject.projectId,
        backendConversationId,
        [userMessage, assistantMessage],
      );

      targetProject = messageResult.project;
      targetConversationId = backendConversationId;

      setProject(targetProject);
      setActiveConversationIdState(targetConversationId);
      setActiveConversationId(targetProject.projectId, targetConversationId);
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

  const requestGenerationConfirmation = async ({
    conversationId,
    originalMessage,
    sourceDocument,
  }) => {
    if (!project) return;

    const assistantMessage = await sendProjectMessage({
      project_id: project.projectId,
      conversation_id: conversationId || activeConversationId || null,
      user_id: DEFAULT_USER_ID,
      message: originalMessage || "요구사항 정의서 생성해줘",
      context: {
        selected_document_ids: [sourceDocument.documentId],
        selected_documents: [toDocumentContext(sourceDocument)],
        source_document_type: DEFAULT_DOCUMENT_TYPE,
        project_name: project.projectName || "",
      },
      permission_scope: DEFAULT_PERMISSION_SCOPE,
    });
    const backendConversationId =
      assistantMessage.metadata?.conversationId ||
      conversationId ||
      activeConversationId;
    if (!backendConversationId) {
      throw new Error("백엔드 대화 ID를 확인하지 못했습니다.");
    }

    const messageResult = await addMessagesToConversation(
      project.projectId,
      backendConversationId,
      [assistantMessage],
    );

    setProject(messageResult.project);
    setActiveConversationIdState(backendConversationId);
    setActiveConversationId(project.projectId, backendConversationId);
    setSelectedDocumentIds([sourceDocument.documentId]);
    setDocumentStatusMessage("");
  };

  const handleAgentUploadFiles = async ({ message, files }) => {
    if (!project || isUploadingDocument) return;

    const uploadFiles = Array.from(files ?? []).filter(Boolean);
    if (!uploadFiles.length) return;

    setIsUploadingDocument(true);
    setDocumentError("");
    setDocumentStatusMessage("");

    try {
      const [file] = uploadFiles;
      const response = await uploadDocument({
        projectId: project.projectId,
        documentType: DEFAULT_DOCUMENT_TYPE,
        file,
      });
      const document = response?.document;

      if (!document?.document_id) {
        throw new Error("업로드된 문서 정보를 확인하지 못했습니다.");
      }

      const uploadedDocument = toAttachmentDocument(document);
      await clearMessageActions({
        conversationId: message.metadata?.conversationId || activeConversationId,
        message,
      });
      await requestGenerationConfirmation({
        conversationId: message.metadata?.conversationId || activeConversationId,
        originalMessage:
          message.metadata?.uploadRequest?.originalMessage ||
          "요구사항 정의서 생성해줘",
        sourceDocument: uploadedDocument,
      });
    } catch (error) {
      setDocumentError(
        error instanceof Error
          ? error.message
          : "문서를 업로드하지 못했습니다.",
      );
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleSuggestedActionClick = async (message, action) => {
    if (!project || isResponding || !EXECUTABLE_ACTION_TYPES.has(action?.type)) {
      return;
    }

    const targetConversationId =
      message.metadata?.conversationId || activeConversationId;
    const actionId = getActionId(message, action);
    const actionMessage = getActionMessage(action);
    const pendingAction = message.metadata?.pendingAction;
    const isConfirmGenerationAction =
      action.type === CHAT_ACTION_COMMAND_TYPES.CONFIRM_PENDING_ACTION &&
      pendingAction?.payload?.target_artifact_type === "REQUIREMENT_SPEC";
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
        user_id: DEFAULT_USER_ID,
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
        permission_scope: DEFAULT_PERMISSION_SCOPE,
      });
      const backendConversationId =
        assistantMessage.metadata?.conversationId ?? targetConversationId;
      if (isConfirmGenerationAction) {
        if (assistantMessage.metadata?.state === CHAT_STATES.FAILED) {
          const failedProgress = failGenerationProgress();
          assistantMessage = {
            ...assistantMessage,
            content:
              "요구사항 정의서 생성 중 문제가 발생했습니다.\n업로드한 구축요건 정의서를 확인한 뒤 다시 시도해주세요.",
            metadata: {
              ...assistantMessage.metadata,
              generationProgress: failedProgress,
              pendingAction: null,
              suggestedActions: [],
            },
          };
        } else {
          const completedProgress = await completeGenerationProgress();
          assistantMessage = {
            ...assistantMessage,
            metadata: {
              ...assistantMessage.metadata,
              generationProgress: completedProgress,
              pendingAction: null,
              suggestedActions: [],
            },
          };
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
    } catch (error) {
      const failedProgress = isConfirmGenerationAction
        ? failGenerationProgress()
        : null;
      if (isConfirmGenerationAction) {
        await wait(400);
      }
      const fallbackMessage = {
        id: createChatId("assistant"),
        role: "assistant",
        content:
          isConfirmGenerationAction
            ? "요구사항 정의서 생성 중 문제가 발생했습니다. 업로드한 구축요건 정의서를 확인한 뒤 다시 시도해주세요."
            : error instanceof Error
              ? error.message
              : "대기 작업을 처리하지 못했습니다.",
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
      const { project: updatedProject, activeConversationId: nextConversationId } =
        await deleteConversation(project.projectId, conversationId);
      setProject(updatedProject);
      setActiveConversationIdState(nextConversationId);
      setComposerValue("");
      setDeletingConversationId("");

      if (editingConversationId === conversationId) {
        setEditingConversationId("");
        setEditingConversationTitle("");
      }
    } catch (error) {
      setConversationActionError(
        error instanceof Error ? error.message : "대화를 삭제하지 못했습니다.",
      );
    }
  };

  const handleChangeProject = () => {
    clearRecentProjectId();
    setProject(null);
    setActiveConversationIdState("");
    setComposerValue("");
    setEntryError("");
    setPendingNewProjectId("");
    setNewProjectName("");
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
    const submittedProjectDescription = String(
      formData.get("projectDescription") ?? "",
    );

    if (!submittedProjectName.trim()) {
      setSettingsError("프로젝트명을 입력해주세요.");
      return;
    }

    setIsSavingSettings(true);
    setSettingsError("");

    try {
      const updatedProject = await updateProject(project.projectId, {
        projectName: submittedProjectName,
        projectDescription: submittedProjectDescription,
      });
      setProject(updatedProject);
      setIsSettingsOpen(false);
    } catch (error) {
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
        newProjectDescription={newProjectDescription}
        newProjectError={newProjectError}
        isLoading={isLoadingProject}
        isCreating={isCreatingProject}
        onProjectIdChange={handleEntryProjectIdChange}
        onNewProjectNameChange={setNewProjectName}
        onNewProjectDescriptionChange={setNewProjectDescription}
        onSubmit={handleEntrySubmit}
        onCreateProject={handleCreateProject}
      />
    );
  }

  return (
    <main
      className={`chat-app-shell ${isSidebarDrawerOpen ? "is-sidebar-open" : ""}`}
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
            <strong>{activeConversation?.title ?? "새 채팅을 시작해보세요"}</strong>
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
                  onSuggestedActionClick={handleSuggestedActionClick}
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
              className={`send-button ${composerValue.trim() ? "" : "is-empty"}`}
              type="submit"
              disabled={!composerValue.trim() || isResponding || isUploadingDocument}
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
          projectDescription={settingsDescription}
          error={settingsError}
          isSaving={isSavingSettings}
          onProjectNameChange={setSettingsName}
          onProjectDescriptionChange={setSettingsDescription}
          onClose={closeSettings}
          onSubmit={handleSettingsSubmit}
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
  newProjectDescription,
  newProjectError,
  isLoading,
  isCreating,
  onProjectIdChange,
  onNewProjectNameChange,
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
          <p>프로젝트 ID를 입력하면 저장된 대화 이력을 확인합니다.</p>
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
            <button className="primary-button" type="submit" disabled={isLoading}>
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
                  {pendingNewProjectId} 프로젝트의 이름과 설명을 입력한 후 입장하세요.
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
        </dl>
        <p>{project.projectDescription || "프로젝트 설명이 아직 없습니다."}</p>
      </section>

      <section className="conversation-panel" aria-label="대화 목록">
        <div className="conversation-panel-header">
          <strong>대화</strong>
          <span>{conversations.length}개</span>
        </div>
        <button className="new-chat-button" type="button" onClick={onNewChat}>
          <PlusCircle size={17} aria-hidden="true" />
          새 채팅
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
                isActive={
                  conversation.conversationId === activeConversationId
                }
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

      <button className="secondary-button" type="button" onClick={onChangeProject}>
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
            <button className="mini-action-button danger" type="button" onClick={onDelete}>
              삭제
            </button>
            <button className="mini-action-button" type="button" onClick={onCancelDelete}>
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
  projectDescription,
  error,
  isSaving,
  onProjectNameChange,
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

function CommandRecommendationBar({ recommendations, isDisabled, onSelect }) {
  if (!recommendations.length) return null;

  return (
    <section
      className="command-recommendations"
      aria-label="추천 명령어"
    >
      <span>추천 명령어</span>
      <div className="command-chip-list">
        {recommendations.map((recommendation) => (
          <button
            key={`${recommendation.type}-${recommendation.commandText}`}
            className="command-chip"
            type="button"
            disabled={isDisabled}
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
  onSuggestedActionClick,
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
  const downloadFiles = isAssistant ? message.metadata?.downloadFiles ?? [] : [];
  const uploadRequest =
    isAssistant && !actionsResolved ? message.metadata?.uploadRequest : null;
  const generationProgressResult = isAssistant
    ? message.metadata?.generationProgress
    : null;

  const handleFileChange = (event) => {
    onAgentUploadFiles({
      message,
      files: event.target.files,
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
        {uploadRequest && (
          <div className="message-action-panel">
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
              disabled={isResponding || isUploadingDocument}
              onChange={handleFileChange}
              aria-label={uploadRequest.label || "구축요건 정의서 업로드"}
            />
          </div>
        )}
        {generationProgressResult && (
          <GenerationProgressResult
            progressState={generationProgressResult}
            downloadFiles={downloadFiles}
          />
        )}
        <MessageResult
          downloadFiles={downloadFiles}
          onDownloadFile={onDownloadFile}
        />
        {suggestedActions.length > 0 && (
          <div className="suggested-action-list">
            {suggestedActions.map((action) => (
              <button
                key={`${action.type}-${getActionId(message, action)}-${action.label}`}
                className={`suggested-action-button ${
                  action.type === CHAT_ACTION_COMMAND_TYPES.CANCEL_PENDING_ACTION
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
          <ProgressBar progress={progressState.progress} />
          <AgentProgress steps={progressState.steps} />
        </div>
      </div>
    </article>
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
        <div className="message-body typing-body">
          <Sparkles size={16} aria-hidden="true" />
          <p>응답을 준비하고 있습니다.</p>
        </div>
      </div>
    </article>
  );
}

export default App;
