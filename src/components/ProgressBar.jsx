function ProgressBar({
  progress,
  label = "",
  title = "전체 진행률",
  variant = "",
}) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress ?? 0)));
  const displayLabel = String(label ?? "").trim();
  const displayTitle = String(title ?? "").trim() || "진행률";
  const className = ["progress-block", variant ? `progress-block-${variant}` : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div className="progress-header">
        <span>{displayTitle}</span>
        {displayLabel && <strong>{displayLabel}</strong>}
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={safeProgress}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuetext={displayLabel || displayTitle}
      >
        <div className="progress-fill" style={{ width: `${safeProgress}%` }} />
      </div>
    </div>
  );
}

export default ProgressBar;
