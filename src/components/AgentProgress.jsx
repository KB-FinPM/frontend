import AgentStepCard from "./AgentStepCard.jsx";

function AgentProgress({ steps }) {
  return (
    <div className="agent-step-list" aria-label="Agent 단계별 처리 상태">
      {steps.map((step, index) => (
        <AgentStepCard key={step.name} step={step} stepNumber={index + 1} />
      ))}
    </div>
  );
}

export default AgentProgress;
