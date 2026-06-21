export const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const normalizedValue =
    typeof value === "string" ? value.trim().replace(/\s*%$/, "") : value;
  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const clampProgress = (value) => Math.max(0, Math.min(100, value));

export const toProgressPercent = (value) => {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null) return null;
  return clampProgress(numericValue);
};

export const formatProgressCount = (value) => {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null) return "";
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(1);
};

const hasPercentNumberText = (value = "") =>
  /\d+(?:\.\d+)?\s*%/.test(String(value));

const isLargeDocumentProgress = (progressPayload) => {
  const type = String(progressPayload?.type ?? "").toUpperCase();
  const unit = String(progressPayload?.unit ?? "").toLowerCase();
  const total = toFiniteNumber(progressPayload?.total);

  return (
    type.includes("CHUNK") ||
    type.includes("BATCH") ||
    type.includes("EMBED") ||
    type.includes("INDEX") ||
    unit.includes("chunk") ||
    unit.includes("batch") ||
    (total !== null && total >= 200)
  );
};

export const normalizeSubProgress = (progressPayload, fallbackLabel = "") => {
  if (!progressPayload || typeof progressPayload !== "object") return null;

  const current = toFiniteNumber(progressPayload.current);
  const total = toFiniteNumber(progressPayload.total);
  const explicitProgress = toProgressPercent(progressPayload.progress);
  const hasCountProgress = current !== null && total !== null && total > 0;
  const progress =
    explicitProgress !== null
      ? explicitProgress
      : hasCountProgress
        ? clampProgress(Math.round((current / total) * 100))
        : null;
  const unit = String(progressPayload.unit ?? "").trim();
  const label = String(progressPayload.label ?? fallbackLabel).trim();
  const countText = hasCountProgress
    ? `${formatProgressCount(current)}/${formatProgressCount(total)}${
        unit ? ` ${unit}` : ""
      }`
    : "";
  const message = String(progressPayload.message ?? "").trim();
  const displayText =
    message || (label && countText ? `${label} ${countText}` : label || countText);

  if (!displayText && progress === null) return null;

  return {
    type: progressPayload.type ?? "",
    label: label || "세부 처리",
    message: displayText || "세부 처리 중",
    current,
    total,
    unit,
    progress,
    hasProgressBar: progress !== null && hasCountProgress,
    largeDocumentHint: isLargeDocumentProgress(progressPayload),
  };
};

export const getGenerationProgressPayload = (statusResponse) =>
  statusResponse?.result?.generation_progress ??
  statusResponse?.generation_progress ??
  statusResponse?.pending_action?.result_json?.generation_progress ??
  statusResponse?.pending_action?.result_json?.result?.generation_progress ??
  null;

export const GENERATION_STAGE_STEP_INDEX = Object.freeze({
  REQUEST_CONFIRMED: 0,
  INPUT_AGENT_DOCUMENT_ANALYSIS: 1,
  CORE_AGENT_EXTRACTION: 2,
  VALIDATION_AGENT_CHECK: 3,
  OUTPUT_AGENT_EXPORT: 4,
  DOCUMENT_GENERATION_COMPLETED: 5,
});

export const getGenerationStageStepIndex = (statusResponse) => {
  const generationProgress = getGenerationProgressPayload(statusResponse);
  const stage = String(generationProgress?.stage ?? "").trim();
  if (
    stage &&
    Object.prototype.hasOwnProperty.call(GENERATION_STAGE_STEP_INDEX, stage)
  ) {
    return GENERATION_STAGE_STEP_INDEX[stage];
  }
  return null;
};

export const normalizeGenerationProgressPayload = (
  generationProgress,
  fallbackProgress = 5,
) => {
  const explicitProgress = toProgressPercent(generationProgress?.progress);
  const subProgressItems = [
    normalizeSubProgress(generationProgress?.sub_progress, "세부 처리"),
    normalizeSubProgress(generationProgress?.batch_progress, "Batch 처리"),
  ].filter(Boolean);
  const hasNestedProgress = subProgressItems.length > 0;

  let progress = explicitProgress;
  if (progress === null && !hasNestedProgress) {
    const current = toFiniteNumber(generationProgress?.current);
    const total = toFiniteNumber(generationProgress?.total);
    if (current !== null && total !== null && total > 0) {
      progress = clampProgress(Math.round((current / total) * 100));
    }
  }
  if (progress === null) {
    progress = clampProgress(toFiniteNumber(fallbackProgress) ?? 5);
  }

  const progressText = String(generationProgress?.progress_text ?? "").trim();
  const stageLabel = String(generationProgress?.stage_label ?? "").trim();
  const label = String(generationProgress?.label ?? "").trim();
  let displayText = stageLabel || progressText || label;
  if (!displayText && !hasNestedProgress) {
    const current = toFiniteNumber(generationProgress?.current);
    const total = toFiniteNumber(generationProgress?.total);
    if (current !== null && total !== null && total > 0) {
      displayText = `${formatProgressCount(current)}/${formatProgressCount(total)}`;
    }
  }
  if (displayText && hasPercentNumberText(displayText) && stageLabel) {
    displayText = stageLabel;
  }

  return {
    progress,
    displayText,
    subProgressItems,
    largeDocumentHint: subProgressItems.some((item) => item.largeDocumentHint),
    stage: generationProgress?.stage ?? "",
  };
};
