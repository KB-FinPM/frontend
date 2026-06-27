const MAX_RECOMMENDATIONS = 4;
const HISTORY_LIMIT = 30;
const STORAGE_KEY_PREFIX = "pm-agent.v2.commandUsage";

export const COMMAND_RECOMMENDATION_TYPES = {
  DEFAULT: "DEFAULT",
  HISTORY: "HISTORY",
  RELATED: "RELATED",
};

const DEFAULT_COMMANDS = [
  "요구사항 명세서 생성해줘",
  "구축요건정의서를 기준으로 요구사항 정리해줘",
  "오늘 할일 알려줘",
  "WBS 기준으로 이번 주 일정 알려줘",
  "마감 임박 할일 알려줘",
  "WBS 만들어줘",
  "요구사항 정의서가 뭐야?",
  "구축요건정의서가 뭐야?",
];

const RELATED_COMMANDS = [
  {
    keywords: ["요구사항", "요구 사항", "requirement"],
    commands: [
      "요구사항 정의서가 뭐야?",
      "구축요건정의서가 뭐야?",
      "WBS 만들어줘",
    ],
  },
  {
    keywords: ["구축요건", "RFP", "rfp"],
    commands: [
      "요구사항 명세서 생성해줘",
      "요구사항 정의서가 뭐야?",
      "회의록 기반 할일 알려줘",
    ],
  },
  {
    keywords: ["회의록", "할일", "todo", "액션아이템"],
    commands: [
      "회의록 기반 할일 알려줘",
      "이번 주 해야 할일 알려줘",
      "마감 임박 할일 알려줘",
    ],
  },
  {
    keywords: ["wbs", "일정", "이번 주", "주차"],
    commands: [
      "WBS 만들어줘",
      "WBS 기준으로 이번 주 일정 알려줘",
      "마감 임박 할일 알려줘",
    ],
  },
];

const wait = (delay = 40) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delay);
  });

const getStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const getStorageKey = (projectId = "") =>
  `${STORAGE_KEY_PREFIX}.${String(projectId || "global")}`;

const readUsageMap = (projectId) => {
  const storage = getStorage();
  if (!storage) return {};

  try {
    return JSON.parse(storage.getItem(getStorageKey(projectId)) ?? "{}");
  } catch {
    return {};
  }
};

const writeUsageMap = (projectId, usageMap) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(getStorageKey(projectId), JSON.stringify(usageMap));
};

export const normalizeCommandText = (commandText = "") =>
  String(commandText).replace(/\s+/g, " ").trim().toLowerCase();

const createRecommendation = (
  commandText,
  type = COMMAND_RECOMMENDATION_TYPES.DEFAULT,
  reason = "기본 PM 업무 명령",
) => ({ commandText, type, reason });

const toCompactText = (value = "") =>
  normalizeCommandText(value).replace(/\s+/g, "");

const matchesKeyword = (commandText, keyword) => {
  const normalized = normalizeCommandText(commandText);
  const compact = toCompactText(commandText);
  const normalizedKeyword = normalizeCommandText(keyword);
  const compactKeyword = toCompactText(keyword);

  return (
    normalized.includes(normalizedKeyword) || compact.includes(compactKeyword)
  );
};

const relatedCommandsFor = (commandText = "") => {
  if (!commandText) return [];
  const matched = RELATED_COMMANDS.find((group) =>
    group.keywords.some((keyword) => matchesKeyword(commandText, keyword)),
  );
  return matched?.commands ?? [];
};

const dedupeRecommendations = (recommendations) => {
  const seen = new Set();
  return recommendations.filter((recommendation) => {
    const key = normalizeCommandText(recommendation.commandText);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getHistoryRecommendations = (projectId) => {
  const usageMap = readUsageMap(projectId);
  return Object.values(usageMap)
    .sort((first, second) => {
      if (second.count !== first.count) return second.count - first.count;
      return String(second.lastUsedAt).localeCompare(String(first.lastUsedAt));
    })
    .slice(0, HISTORY_LIMIT)
    .map((usage) =>
      createRecommendation(
        usage.commandText,
        COMMAND_RECOMMENDATION_TYPES.HISTORY,
        "최근 사용한 명령",
      ),
    );
};

export const getDefaultCommands = async () => {
  await wait();
  return DEFAULT_COMMANDS.slice(0, MAX_RECOMMENDATIONS).map((command) =>
    createRecommendation(command),
  );
};

export const getCommandRecommendations = async (
  projectId,
  conversationId,
  lastCommandInfo,
) => {
  await wait();
  const relatedRecommendations = relatedCommandsFor(
    lastCommandInfo?.commandText ?? "",
  ).map((command) =>
    createRecommendation(
      command,
      COMMAND_RECOMMENDATION_TYPES.RELATED,
      "방금 요청과 관련된 명령",
    ),
  );
  const historyRecommendations = getHistoryRecommendations(projectId);
  const defaultRecommendations = DEFAULT_COMMANDS.map((command) =>
    createRecommendation(command),
  );

  return dedupeRecommendations([
    ...relatedRecommendations,
    ...historyRecommendations,
    ...defaultRecommendations,
  ]).slice(0, MAX_RECOMMENDATIONS);
};

export const saveCommandUsage = async (projectId, commandText) => {
  const normalized = normalizeCommandText(commandText);
  if (!normalized) return null;

  await wait(0);
  const usageMap = readUsageMap(projectId);
  const current = usageMap[normalized] ?? {
    commandText: String(commandText).trim(),
    count: 0,
    firstUsedAt: new Date().toISOString(),
  };
  usageMap[normalized] = {
    ...current,
    commandText: String(commandText).trim(),
    count: current.count + 1,
    lastUsedAt: new Date().toISOString(),
  };
  writeUsageMap(projectId, usageMap);
  return usageMap[normalized];
};
