import type { WorkbenchNarrativeParts } from "@/utils/workbenchNarrative";

interface WorkbenchNarrativeProps {
  parts: WorkbenchNarrativeParts;
  className?: string;
  /** 嵌入 Hero 等面板內時不包一層 .panel */
  embedded?: boolean;
}

/** 工作台頁頭下的環比敘事條（無 LLM；起/承僅內部結構，不展示標籤）。 */
export function WorkbenchNarrative({ parts, className = "", embedded = false }: WorkbenchNarrativeProps) {
  const Tag = embedded ? "div" : "section";
  const rootClass = [
    embedded ? "" : "panel",
    "workbench-narrative",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={rootClass} aria-label="工作台摘要">
      <p className="workbench-narrative-greeting">{parts.greeting}</p>
      <p className="workbench-narrative-opening">{parts.opening}</p>
      {parts.continuation ? (
        <p className="workbench-narrative-continuation">{parts.continuation}</p>
      ) : null}
    </Tag>
  );
}
