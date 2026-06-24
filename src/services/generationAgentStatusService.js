import { formatProgressCount, toFiniteNumber } from "./generationProgressService.js";

const GENERATION_JOB_STATUS = Object.freeze({
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

const GENERATION_AGENT_ORDER = [
  { key: "input", label: "Input Agent" },
  { key: "generation", label: "Generation Agent" },
  { key: "validation", label: "Validation Agent" },
  { key: "output", label: "Output Agent" },
];

export const normalizeProgressStatus = (value = "") => {
  const statusText = String(value || "").toLowerCase();
  if (
    statusText.includes("complete") ||
    statusText.includes("done") ||
    statusText.includes("success") ||
    statusText.includes("executed") ||
    statusText.includes("완료")
  ) {
    return "completed";
  }
  if (
    statusText.includes("running") ||
    statusText.includes("executing") ||
    statusText.includes("progress") ||
    statusText.includes("processing") ||
    statusText.includes("진행")
  ) {
    return "running";
  }
  if (
    statusText.includes("fail") ||
    statusText.includes("error") ||
    statusText.includes("오류") ||
    statusText.includes("실패")
  ) {
    return "failed";
  }
  if (statusText.includes("skip") || statusText.includes("건너")) {
    return "skipped";
  }
  return "waiting";
};

const getProgressCountValue = (...values) => {
  for (const value of values) {
    const numericValue = toFiniteNumber(value);
    if (numericValue !== null) return numericValue;
  }
  return null;
};

const createProgressUnitItem = (label, current, total) => {
  if (current === null || total === null || total <= 0) return null;
  return {
    label,
    key: label.toLowerCase(),
    text: `${label} ${formatProgressCount(current)} / ${formatProgressCount(total)}`,
  };
};

const addProgressUnitItem = (items, item) => {
  if (!item) return;
  const key = item.key || item.label.toLowerCase();
  if (items.some((currentItem) => (currentItem.key || currentItem.label) === key)) {
    return;
  }
  items.push(item);
};

export const getProgressUnitItemsFromSource = (source = {}) => {
  const items = [];
  if (!source || typeof source !== "object") return items;

  addProgressUnitItem(
    items,
    createProgressUnitItem(
      "Chunk",
      getProgressCountValue(
        source.chunk_current,
        source.chunk?.current,
        source.chunks?.current,
      ),
      getProgressCountValue(
        source.chunk_total,
        source.chunk?.total,
        source.chunks?.total,
      ),
    ),
  );

  addProgressUnitItem(
    items,
    createProgressUnitItem(
      "Batch",
      getProgressCountValue(
        source.batch_current,
        source.batch?.current,
        source.batches?.current,
        source.batch_progress?.current,
      ),
      getProgressCountValue(
        source.batch_total,
        source.batch?.total,
        source.batches?.total,
        source.batch_progress?.total,
      ),
    ),
  );

  const sourceText = `${source.unit || ""} ${source.label || ""} ${
    source.progress_text || ""
  } ${source.stage_label || ""} ${source.message || ""} ${
    source.type || ""
  }`.toLowerCase();
  if (sourceText.includes("chunk") || sourceText.includes("batch")) {
    addProgressUnitItem(
      items,
      createProgressUnitItem(
        sourceText.includes("batch") ? "Batch" : "Chunk",
        getProgressCountValue(source.current),
        getProgressCountValue(source.total),
      ),
    );
  }

  return items;
};

export const getGenerationUnitProgressItems = (progressState = {}) => {
  const rawProgress = progressState?.rawProgress ?? {};
  const items = getProgressUnitItemsFromSource(rawProgress);

  const nestedProgressCandidates = [
    rawProgress.generation_progress,
    rawProgress.progress,
    rawProgress.current_progress,
  ];
  nestedProgressCandidates.forEach((source) => {
    getProgressUnitItemsFromSource(source).forEach((item) =>
      addProgressUnitItem(items, item),
    );
  });

  const subProgressItems = Array.isArray(progressState?.subProgressItems)
    ? progressState.subProgressItems
    : [];
  subProgressItems.forEach((item) => {
    getProgressUnitItemsFromSource(item).forEach((unitItem) =>
      addProgressUnitItem(items, unitItem),
    );
  });

  return items;
};

export const getAgentLabel = (value = "") => {
  const normalizedValue = String(value || "")
    .replace(/[_-]+/g, " ")
    .trim();
  const lowerValue = normalizedValue.toLowerCase();
  if (lowerValue.includes("input")) return "Input Agent";
  if (lowerValue.includes("validation") || lowerValue.includes("validate")) {
    return "Validation Agent";
  }
  if (lowerValue.includes("output") || lowerValue.includes("export")) {
    return "Output Agent";
  }
  if (
    lowerValue.includes("generation") ||
    lowerValue.includes("generator") ||
    lowerValue.includes("document")
  ) {
    return "Generation Agent";
  }
  return normalizedValue || "Generation Agent";
};

export const getAgentKeyFromText = (value = "") => {
  const text = String(value || "").toLowerCase();
  if (!text) return "";
  if (
    text.includes("validation") ||
    text.includes("validate") ||
    text.includes("검증") ||
    text.includes("품질") ||
    text.includes("누락")
  ) {
    return "validation";
  }
  if (
    text.includes("output") ||
    text.includes("export") ||
    text.includes("결과") ||
    text.includes("파일 변환") ||
    text.includes("다운로드") ||
    text.includes("엑셀") ||
    text.includes("저장")
  ) {
    return "output";
  }
  if (
    text.includes("generation") ||
    text.includes("generator") ||
    text.includes("core") ||
    text.includes("요구사항 추출") ||
    text.includes("문서 생성") ||
    text.includes("산출물") ||
    text.includes("chunk") ||
    text.includes("batch")
  ) {
    return "generation";
  }
  if (
    text.includes("input") ||
    text.includes("요청") ||
    text.includes("문서 확인") ||
    text.includes("입력") ||
    text.includes("intent") ||
    text.includes("분석") ||
    text.includes("업로드")
  ) {
    return "input";
  }
  return "";
};

const getAgentDetailFromPayload = (agentValue) => {
  if (!agentValue || typeof agentValue !== "object") return "";
  return String(
    agentValue.detail ??
      agentValue.message ??
      agentValue.stage_label ??
      agentValue.progress_text ??
      agentValue.current_step ??
      agentValue.step_label ??
      agentValue.task ??
      agentValue.current_task ??
      "",
  ).trim();
};

const getAgentStatusFromPayload = (agentValue) => {
  if (!agentValue || typeof agentValue !== "object") {
    return normalizeProgressStatus(agentValue);
  }
  return normalizeProgressStatus(
    agentValue.status ??
      agentValue.state ??
      agentValue.phase ??
      agentValue.result ??
      agentValue.progress_status,
  );
};

const getGenerationAgentItemsFromPayload = (progressState = {}) => {
  const rawProgress = progressState?.rawProgress ?? {};
  const candidateSources = [
    rawProgress.agent_statuses,
    rawProgress.agent_status,
    rawProgress.agents,
    rawProgress.agent_steps,
    rawProgress.steps,
  ];

  for (const source of candidateSources) {
    if (!source) continue;
    const entries = Array.isArray(source)
      ? source.map((agent, index) => [agent?.name || agent?.agent || index, agent])
      : Object.entries(source);
    const agentItems = entries
      .map(([key, value]) => {
        const label = getAgentLabel(value?.label || value?.name || value?.agent || key);
        return {
          key: getAgentKeyFromText(label) || getAgentKeyFromText(key) || label,
          label,
          status: getAgentStatusFromPayload(value),
          detail: getAgentDetailFromPayload(value),
          unitItems: getProgressUnitItemsFromSource(value),
        };
      })
      .filter((item) => item.label);
    if (agentItems.length) {
      return agentItems;
    }
  }

  return [];
};

const getFallbackGenerationAgentItems = (progressState = {}, jobStatus, stageText) => {
  if (jobStatus === GENERATION_JOB_STATUS.COMPLETED) {
    return GENERATION_AGENT_ORDER.map((agent) => ({
      ...agent,
      status: "completed",
      detail: "",
      unitItems: [],
    }));
  }

  const lowerText = `${progressState?.stage || ""} ${stageText || ""}`.toLowerCase();
  let activeAgentIndex = 1;
  if (
    lowerText.includes("input") ||
    lowerText.includes("요청") ||
    lowerText.includes("업로드") ||
    lowerText.includes("분석")
  ) {
    activeAgentIndex = 0;
  } else if (lowerText.includes("validation") || lowerText.includes("검증")) {
    activeAgentIndex = 2;
  } else if (
    lowerText.includes("output") ||
    lowerText.includes("export") ||
    lowerText.includes("파일") ||
    lowerText.includes("저장")
  ) {
    activeAgentIndex = 3;
  }

  return GENERATION_AGENT_ORDER.map((agent, index) => {
    if (jobStatus === GENERATION_JOB_STATUS.FAILED) {
      return {
        ...agent,
        status:
          index < activeAgentIndex
            ? "completed"
            : index === activeAgentIndex
              ? "failed"
              : "waiting",
        detail: "",
        unitItems: [],
      };
    }
    return {
      ...agent,
      status:
        index < activeAgentIndex
          ? "completed"
          : index === activeAgentIndex
            ? "running"
            : "waiting",
      detail: "",
      unitItems: [],
    };
  });
};

const findAgentItemIndexForDetail = (items, progressState = {}, jobStatus, stageText) => {
  const priorityStatus =
    jobStatus === GENERATION_JOB_STATUS.FAILED ? "failed" : "running";
  const statusIndex = items.findIndex((item) => item.status === priorityStatus);
  if (statusIndex !== -1) return statusIndex;

  const fallbackRunningIndex = items.findIndex((item) => item.status === "running");
  if (fallbackRunningIndex !== -1) return fallbackRunningIndex;

  const detailAgentKey =
    getAgentKeyFromText(`${progressState?.stage || ""} ${stageText || ""}`) ||
    getAgentKeyFromText(progressState?.displayText || "");
  if (detailAgentKey) {
    const mappedIndex = items.findIndex(
      (item) =>
        item.key === detailAgentKey || getAgentKeyFromText(item.label) === detailAgentKey,
    );
    if (mappedIndex !== -1) return mappedIndex;
  }

  return -1;
};

export const getGenerationAgentItems = (progressState, jobStatus, stageText) => {
  const payloadItems = getGenerationAgentItemsFromPayload(progressState);
  const baseItems = payloadItems.length
    ? payloadItems
    : getFallbackGenerationAgentItems(progressState, jobStatus, stageText);
  const detailIndex = findAgentItemIndexForDetail(
    baseItems,
    progressState,
    jobStatus,
    stageText,
  );
  const globalUnitItems = getGenerationUnitProgressItems(progressState);

  return baseItems.map((item, index) => {
    const isDetailTarget = index === detailIndex;
    const shouldShowDetail =
      isDetailTarget &&
      (item.status === "running" || item.status === "failed") &&
      stageText &&
      !["생성 완료"].includes(stageText);
    const hasAgentUnitItems = Array.isArray(item.unitItems) && item.unitItems.length > 0;
    const shouldAttachGlobalUnits =
      isDetailTarget &&
      !hasAgentUnitItems &&
      (item.status === "running" || item.status === "failed") &&
      globalUnitItems.length > 0;

    return {
      ...item,
      detail: shouldShowDetail ? item.detail || stageText : "",
      unitItems:
        item.status === "waiting" || item.status === "skipped"
          ? []
          : shouldAttachGlobalUnits
            ? globalUnitItems
            : item.unitItems ?? [],
    };
  });
};

export const getAgentStatusLabel = (status) => {
  if (status === "completed") return "완료";
  if (status === "running") return "진행 중";
  if (status === "failed") return "실패";
  if (status === "skipped") return "건너뜀";
  return "대기";
};
