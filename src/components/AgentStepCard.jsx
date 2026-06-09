import { Check, Circle, LoaderCircle, X } from "lucide-react";

const STATUS_LABELS = {
  WAITING: "WAITING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

const STATUS_ICONS = {
  WAITING: Circle,
  RUNNING: LoaderCircle,
  COMPLETED: Check,
  FAILED: X,
};

function AgentStepCard({ step, stepNumber }) {
  const StatusIcon = STATUS_ICONS[step.status] ?? Circle;

  return (
    <article className={`step-card ${step.status.toLowerCase()}`}>
      <div className="step-marker">
        <StatusIcon size={18} aria-hidden="true" />
      </div>
      <div className="step-content">
        <div className="step-topline">
          <span className="step-index">STEP {stepNumber}</span>
          <span className={`status-badge ${step.status.toLowerCase()}`}>
            {STATUS_LABELS[step.status] ?? step.status}
          </span>
        </div>
        <h2>{step.name}</h2>
        <p>{step.message}</p>
        <span>{step.role}</span>
      </div>
    </article>
  );
}

export default AgentStepCard;
