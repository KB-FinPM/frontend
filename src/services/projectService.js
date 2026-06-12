import { MOCK_PROJECTS, createInitialConversationTitle } from "./mockProjectData.js";
import { formatDateTime } from "./dateTime.js";

const RECENT_PROJECT_KEY = "pm-agent.v2.recentProjectId";
const STORED_PROJECTS_KEY = "pm-agent.v2.projects";
const ACTIVE_CONVERSATIONS_KEY = "pm-agent.v2.activeConversations";
const UNTITLED_CONVERSATION_TITLES = new Set([
  "새 채팅",
  "새 대화",
  "제목 없음",
  "기존 대화",
]);

const clone = (value) => JSON.parse(JSON.stringify(value));

const wait = (delay = 120) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delay);
  });

const getStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const readJsonMap = (key) => {
  const storage = getStorage();
  if (!storage) return {};

  try {
    return JSON.parse(storage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
};

const writeJsonMap = (key, value) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
};

const readStoredProjects = () => readJsonMap(STORED_PROJECTS_KEY);
const writeStoredProjects = (projects) =>
  writeJsonMap(STORED_PROJECTS_KEY, projects);

const readActiveConversationIds = () => readJsonMap(ACTIVE_CONVERSATIONS_KEY);
const writeActiveConversationIds = (activeConversationIds) =>
  writeJsonMap(ACTIVE_CONVERSATIONS_KEY, activeConversationIds);

export const normalizeProjectId = (projectId) => projectId.trim();

const PROJECT_START_DATE_ERROR =
  "프로젝트 시작일은 YYYY-MM-DD 형식으로 입력해주세요.";

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

export const createConversationId = () =>
  `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createMessageId = (role = "message") =>
  `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeMessage = (message, index = 0) => ({
  id: message.id ?? createMessageId(message.role ?? `message-${index}`),
  role: message.role ?? "assistant",
  content: message.content ?? "",
  createdAt: message.createdAt ?? formatDateTime(),
  metadata: message.metadata ?? {},
});

const createTitleFromMessage = (content) => {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) return createInitialConversationTitle();
  return normalizedContent.length > 28
    ? `${normalizedContent.slice(0, 28)}...`
    : normalizedContent;
};

const getConversationUpdatedAt = (messages, fallbackDate) =>
  messages[messages.length - 1]?.createdAt ?? fallbackDate;

const createLegacyConversation = (projectId, messages = []) => {
  const normalizedMessages = messages.map(normalizeMessage);
  const createdAt = normalizedMessages[0]?.createdAt ?? formatDateTime();
  const updatedAt = getConversationUpdatedAt(normalizedMessages, createdAt);

  return {
    conversationId: `${projectId}-legacy-conversation`,
    title: normalizedMessages[0]?.content
      ? createTitleFromMessage(normalizedMessages[0].content)
      : "기존 대화",
    messages: normalizedMessages,
    createdAt,
    updatedAt,
  };
};

const normalizeConversation = (conversation, index = 0) => {
  const messages = (conversation.messages ?? []).map(normalizeMessage);
  const createdAt =
    conversation.createdAt ?? messages[0]?.createdAt ?? formatDateTime();
  const updatedAt =
    conversation.updatedAt ?? getConversationUpdatedAt(messages, createdAt);

  return {
    conversationId: conversation.conversationId ?? createConversationId(),
    title:
      conversation.title ??
      (messages[0]?.content ? createTitleFromMessage(messages[0].content) : `대화 ${index + 1}`),
    messages,
    createdAt,
    updatedAt,
  };
};

const sortConversations = (conversations = []) =>
  [...conversations].sort((first, second) =>
    second.updatedAt.localeCompare(first.updatedAt),
  );

const normalizeProject = (project, source = "mock") => {
  const conversations = Array.isArray(project.conversations)
    ? project.conversations.map(normalizeConversation)
    : [];
  const legacyMessages = Array.isArray(project.messages) ? project.messages : [];
  const normalizedConversations = conversations.length
    ? conversations
    : legacyMessages.length
      ? [createLegacyConversation(project.projectId, legacyMessages)]
      : [];

  return {
    projectId: project.projectId,
    projectName: project.projectName,
    projectStartDate:
      project.projectStartDate ?? project.startDate ?? project.start_date ?? "",
    projectEndDate:
      project.projectEndDate ?? project.endDate ?? project.end_date ?? "",
    projectDescription: project.projectDescription ?? project.summary ?? "",
    conversations: sortConversations(normalizedConversations),
    createdAt: project.createdAt ?? formatDateTime(),
    updatedAt: project.updatedAt ?? formatDateTime(),
    source,
  };
};

const persistProject = (project) => {
  const normalizedProject = normalizeProject(project, "localStorage");
  const projects = readStoredProjects();
  projects[normalizedProject.projectId] = normalizedProject;
  writeStoredProjects(projects);
  return clone(normalizedProject);
};

const getProjectOrThrow = async (projectId) => {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error("프로젝트 정보를 찾을 수 없습니다.");
  }
  return project;
};

export const getRecentProjectId = () =>
  getStorage()?.getItem(RECENT_PROJECT_KEY) ?? "";

export const setRecentProjectId = (projectId) => {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return;
  getStorage()?.setItem(RECENT_PROJECT_KEY, normalizedProjectId);
};

export const saveRecentProjectId = setRecentProjectId;

export const clearRecentProjectId = () => {
  getStorage()?.removeItem(RECENT_PROJECT_KEY);
};

export const clearProjectStorage = () => {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(RECENT_PROJECT_KEY);
  storage.removeItem(STORED_PROJECTS_KEY);
  storage.removeItem(ACTIVE_CONVERSATIONS_KEY);

  if (typeof window !== "undefined") {
    window.sessionStorage?.removeItem(RECENT_PROJECT_KEY);
    window.sessionStorage?.removeItem(STORED_PROJECTS_KEY);
    window.sessionStorage?.removeItem(ACTIVE_CONVERSATIONS_KEY);
  }
};

export const getProjectById = async (projectId) => {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) {
    throw new Error("프로젝트 ID를 입력해주세요.");
  }

  await wait();

  const storedProject = readStoredProjects()[normalizedProjectId];
  if (storedProject) {
    return normalizeProject(clone(storedProject), "localStorage");
  }

  const mockProject = MOCK_PROJECTS[normalizedProjectId];
  if (mockProject) {
    return normalizeProject(clone(mockProject), "mock");
  }

  return null;
};

export const createProject = async (
  projectId,
  projectName,
  projectDescription = "",
  start_date = "",
) => {
  const normalizedProjectId = normalizeProjectId(projectId);
  const normalizedProjectName = projectName.trim();

  if (!normalizedProjectId) {
    throw new Error("프로젝트 ID를 입력해주세요.");
  }
  if (!normalizedProjectName) {
    throw new Error("프로젝트명을 입력해주세요.");
  }
  if (!isValidProjectStartDate(start_date)) {
    throw new Error(PROJECT_START_DATE_ERROR);
  }

  await wait();

  const existingProject = await getProjectById(normalizedProjectId);
  if (existingProject) {
    throw new Error("이미 존재하는 프로젝트 ID입니다.");
  }

  persistProject({
    projectId: normalizedProjectId,
    projectName: normalizedProjectName,
    projectStartDate: String(start_date ?? "").trim(),
    projectDescription: projectDescription.trim(),
    conversations: [],
    createdAt: formatDateTime(),
    updatedAt: formatDateTime(),
  });
  setRecentProjectId(normalizedProjectId);

  const savedProject = await getProjectById(normalizedProjectId);
  if (!savedProject) {
    throw new Error("신규 프로젝트를 저장하지 못했습니다.");
  }

  return savedProject;
};

export const updateProject = async (
  projectId,
  { projectName, projectDescription = "", start_date = "" },
) => {
  const normalizedProjectName = projectName.trim();

  if (!normalizedProjectName) {
    throw new Error("프로젝트명을 입력해주세요.");
  }
  if (!isValidProjectStartDate(start_date)) {
    throw new Error(PROJECT_START_DATE_ERROR);
  }

  await wait();

  const currentProject = await getProjectOrThrow(projectId);
  const updatedProject = persistProject({
    ...currentProject,
    projectName: normalizedProjectName,
    projectStartDate: String(start_date ?? "").trim(),
    projectDescription: projectDescription.trim(),
    updatedAt: formatDateTime(),
  });

  setRecentProjectId(currentProject.projectId);
  return updatedProject;
};

export const persistProjectSession = (project) => {
  if (!project?.projectId) return null;
  return persistProject({
    ...project,
    updatedAt: formatDateTime(),
  });
};

export const getConversations = async (projectId) => {
  const project = await getProjectOrThrow(projectId);
  return sortConversations(project.conversations);
};

export const getConversation = async (projectId, conversationId) => {
  const conversations = await getConversations(projectId);
  return (
    conversations.find(
      (conversation) => conversation.conversationId === conversationId,
    ) ?? null
  );
};

export const createConversation = async (projectId) => {
  const project = await getProjectOrThrow(projectId);
  const createdAt = formatDateTime();
  const conversation = {
    conversationId: createConversationId(),
    title: createInitialConversationTitle(),
    messages: [],
    createdAt,
    updatedAt: createdAt,
  };

  const updatedProject = persistProject({
    ...project,
    conversations: [conversation, ...project.conversations],
    updatedAt: createdAt,
  });
  setActiveConversationId(project.projectId, conversation.conversationId);

  return {
    project: updatedProject,
    conversation,
  };
};

export const updateConversationTitle = async (
  projectId,
  conversationId,
  title,
) => {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error("대화 제목을 입력해주세요.");
  }

  const project = await getProjectOrThrow(projectId);
  const updatedAt = formatDateTime();
  const updatedConversations = project.conversations.map((conversation) =>
    conversation.conversationId === conversationId
      ? { ...conversation, title: normalizedTitle, updatedAt }
      : conversation,
  );
  const updatedProject = persistProject({
    ...project,
    conversations: updatedConversations,
    updatedAt,
  });

  return {
    project: updatedProject,
    conversation:
      updatedProject.conversations.find(
        (conversation) => conversation.conversationId === conversationId,
      ) ?? null,
  };
};

export const deleteConversation = async (projectId, conversationId) => {
  const project = await getProjectOrThrow(projectId);
  const updatedConversations = project.conversations.filter(
    (conversation) => conversation.conversationId !== conversationId,
  );
  const updatedProject = persistProject({
    ...project,
    conversations: updatedConversations,
    updatedAt: formatDateTime(),
  });
  const activeConversationId = getActiveConversationId(project.projectId);
  const nextConversationId =
    activeConversationId === conversationId
      ? updatedProject.conversations[0]?.conversationId ?? ""
      : activeConversationId;

  setActiveConversationId(project.projectId, nextConversationId);

  return {
    project: updatedProject,
    activeConversationId: nextConversationId,
  };
};

export const addMessageToConversation = async (
  projectId,
  conversationId,
  message,
) => {
  const project = await getProjectOrThrow(projectId);
  const normalizedMessage = normalizeMessage(message);
  const updatedAt = normalizedMessage.createdAt ?? formatDateTime();
  const updatedConversations = project.conversations.map((conversation) => {
    if (conversation.conversationId !== conversationId) {
      return conversation;
    }

    const shouldGenerateTitle =
      normalizedMessage.role === "user" &&
      conversation.messages.length === 0 &&
      UNTITLED_CONVERSATION_TITLES.has(conversation.title);

    return {
      ...conversation,
      title: shouldGenerateTitle
        ? createTitleFromMessage(normalizedMessage.content)
        : conversation.title,
      messages: [...conversation.messages, normalizedMessage],
      updatedAt,
    };
  });

  const updatedProject = persistProject({
    ...project,
    conversations: updatedConversations,
    updatedAt,
  });
  const updatedConversation =
    updatedProject.conversations.find(
      (conversation) => conversation.conversationId === conversationId,
    ) ?? null;

  return {
    project: updatedProject,
    conversation: updatedConversation,
    message: normalizedMessage,
  };
};

export const addMessagesToConversation = async (
  projectId,
  conversationId,
  messages,
) => {
  const normalizedConversationId = String(conversationId ?? "").trim();
  if (!normalizedConversationId) {
    throw new Error("대화 ID를 확인하지 못했습니다.");
  }

  const project = await getProjectOrThrow(projectId);
  const normalizedMessages = (messages ?? []).map(normalizeMessage);
  const firstUserMessage = normalizedMessages.find(
    (message) => message.role === "user",
  );
  const createdAt = normalizedMessages[0]?.createdAt ?? formatDateTime();
  const existingConversation = project.conversations.find(
    (conversation) => conversation.conversationId === normalizedConversationId,
  );

  const nextConversation = existingConversation
    ? {
        ...existingConversation,
        title:
          existingConversation.messages.length === 0 &&
          firstUserMessage?.content &&
          UNTITLED_CONVERSATION_TITLES.has(existingConversation.title)
            ? createTitleFromMessage(firstUserMessage.content)
            : existingConversation.title,
        messages: [...existingConversation.messages, ...normalizedMessages],
      }
    : {
        conversationId: normalizedConversationId,
        title: firstUserMessage?.content
          ? createTitleFromMessage(firstUserMessage.content)
          : createInitialConversationTitle(),
        messages: normalizedMessages,
        createdAt,
        updatedAt: createdAt,
      };

  nextConversation.updatedAt = getConversationUpdatedAt(
    nextConversation.messages,
    nextConversation.updatedAt,
  );

  const updatedConversations = existingConversation
    ? project.conversations.map((conversation) =>
        conversation.conversationId === normalizedConversationId
          ? nextConversation
          : conversation,
      )
    : [nextConversation, ...project.conversations];
  const updatedProject = persistProject({
    ...project,
    conversations: updatedConversations,
    updatedAt: nextConversation.updatedAt,
  });

  setActiveConversationId(project.projectId, normalizedConversationId);

  return {
    project: updatedProject,
    conversation:
      updatedProject.conversations.find(
        (conversation) =>
          conversation.conversationId === normalizedConversationId,
      ) ?? null,
    messages: normalizedMessages,
  };
};

export const updateConversationMessage = async (
  projectId,
  conversationId,
  messageId,
  updateMessage,
) => {
  const project = await getProjectOrThrow(projectId);
  const updatedAt = formatDateTime();
  const updatedConversations = project.conversations.map((conversation) => {
    if (conversation.conversationId !== conversationId) {
      return conversation;
    }

    return {
      ...conversation,
      messages: conversation.messages.map((message, index) => {
        if (message.id !== messageId) {
          return message;
        }

        return normalizeMessage(updateMessage(clone(message)), index);
      }),
      updatedAt,
    };
  });
  const updatedProject = persistProject({
    ...project,
    conversations: updatedConversations,
    updatedAt,
  });

  return {
    project: updatedProject,
    conversation:
      updatedProject.conversations.find(
        (conversation) => conversation.conversationId === conversationId,
      ) ?? null,
  };
};

export const setActiveConversationId = (projectId, conversationId) => {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return;

  const activeConversationIds = readActiveConversationIds();
  if (conversationId) {
    activeConversationIds[normalizedProjectId] = conversationId;
  } else {
    delete activeConversationIds[normalizedProjectId];
  }
  writeActiveConversationIds(activeConversationIds);
};

export const getActiveConversationId = (projectId) => {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return "";
  return readActiveConversationIds()[normalizedProjectId] ?? "";
};
