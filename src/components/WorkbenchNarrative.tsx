import type { WorkbenchNarrativeParts } from "@/utils/workbenchNarrative";

interface WorkbenchNarrativeProps {
  parts: WorkbenchNarrativeParts;
}

/** 工作台頁頭下的環比敘事條（無 LLM；起/承僅內部結構，不展示標籤）。 */
export function WorkbenchNarrative({ parts }: WorkbenchNarrativeProps) {
  return (
    <section className="panel workbench-narrative" aria-label="工作台摘要">
      <p className="workbench-narrative-greeting">{parts.greeting}</p>
      <p className="workbench-narrative-opening">{parts.opening}</p>
      {parts.continuation ? (
        <p className="workbench-narrative-continuation">{parts.continuation}</p>
      ) : null}
    </section>
  );
}
