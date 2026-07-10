import type { Alert } from "@/api/client";

interface AlertProgressStepsProps {
  alert: Alert;
  showLeaderStep?: boolean;
}

export function AlertProgressSteps({ alert, showLeaderStep }: AlertProgressStepsProps) {
  const salesDone = !!alert.acknowledged;
  const leaderStepVisible = showLeaderStep ?? !!alert.has_sales_leader;
  const leaderDone = !!alert.has_leader_reply;
  const adminDone = !!alert.admin_read;

  const steps = [
    { key: "sales", label: "銷售跟進", done: salesDone },
    { key: "leader", label: "主管已回覆", done: leaderDone, hide: !leaderStepVisible },
    { key: "admin", label: "管理已閱", done: adminDone },
  ].filter((s) => !s.hide);

  return (
    <div className="alert-progress" aria-label="處理進度">
      {steps.map((step, index) => (
        <span key={step.key} className="alert-progress__segment">
          {index > 0 && <span className="alert-progress__arrow" aria-hidden>→</span>}
          <span className={`alert-progress__step${step.done ? " alert-progress__step--done" : ""}`}>
            <span className="alert-progress__mark" aria-hidden>
              {step.done ? "✓" : "○"}
            </span>
            {step.label}
          </span>
        </span>
      ))}
    </div>
  );
}
