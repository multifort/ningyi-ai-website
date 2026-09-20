import { productSqlite } from "./db";

export type DeliverableOutcomeStatus = "waiting" | "forming" | "content_ready" | "available" | "failed";

type SectionRow = { sectionKey: string; status: string; summary: string | null };
type ArtifactRow = {
  id: string;
  artifactType: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  contentVersion: number;
  renderVersion: number;
};

const catalog = [
  { key: "requirements", code: "DEL-REQ", title: "需求分析", description: "项目目标、用户、范围、需求与待确认事项", sections: ["project_overview", "scope_users", "requirements", "risks"], artifacts: ["requirement_analysis_docx", "requirement_analysis_pdf"] },
  { key: "features", code: "DEL-FUN", title: "功能清单", description: "系统、模块、功能、规则、数据与接口", sections: ["requirements", "solution"], artifacts: ["function_catalog_xlsx", "function_catalog_docx"] },
  { key: "estimation", code: "DEL-EST", title: "工作量估算", description: "工作包、角色投入、估算依据与区间", sections: ["workload"], artifacts: ["workload_estimate_xlsx", "workload_estimate_pdf"] },
  { key: "plan", code: "DEL-PLAN", title: "实施计划", description: "阶段、依赖、里程碑、资源与验收安排", sections: ["implementation"], artifacts: ["implementation_plan_xlsx", "implementation_plan_pdf"] },
  { key: "quote", code: "DEL-QUOTE", title: "项目报价", description: "报价依据、范围、假设与商务边界", sections: ["workload", "implementation"], artifacts: ["project_quote_xlsx", "project_quote_pdf"] },
  { key: "solution", code: "DEL-SOLUTION", title: "整体解决方案", description: "从背景、需求到架构、实施和风险的完整方案", sections: ["project_overview", "scope_users", "requirements", "solution", "workload", "implementation", "risks"], artifacts: ["formal_solution_docx", "formal_solution_pdf"] },
  { key: "slides", code: "DEL-SLIDE", title: "汇报演示", description: "面向沟通和汇报的可编辑演示材料", sections: ["project_overview", "scope_users", "requirements", "solution", "workload", "implementation", "risks"], artifacts: ["solution_briefing_pptx", "solution_briefing_pdf"] },
] as const;

export const requiredDeliverableArtifactTypes = catalog.flatMap((item) => [...item.artifacts]);

export function outcomeForArtifactType(artifactType: string) {
  const definition = catalog.find((item) => item.artifacts.includes(artifactType as never));
  return definition ? { key: definition.key, code: definition.code, title: definition.title } : null;
}

export function deliverableOutcomeCatalog(solutionId: string, userId: string) {
  const sections = productSqlite.prepare(`SELECT section_key AS sectionKey, status, summary
    FROM formal_sections WHERE solution_id = ?`).all(solutionId) as SectionRow[];
  const artifacts = productSqlite.prepare(`SELECT id, artifact_type AS artifactType, display_name AS displayName, mime_type AS mimeType,
    size_bytes AS sizeBytes, status, content_version AS contentVersion, render_version AS renderVersion FROM deliverable_artifacts
    WHERE solution_id = ? AND user_id = ? AND status = 'available' ORDER BY created_at, id`).all(solutionId, userId) as ArtifactRow[];
  const sectionByKey = new Map(sections.map((section) => [section.sectionKey, section]));

  return catalog.map((definition) => {
    const dependencies = definition.sections.map((key) => sectionByKey.get(key));
    const files = artifacts.filter((artifact) => definition.artifacts.includes(artifact.artifactType as never));
    const failed = dependencies.some((section) => section?.status === "failed");
    const readyCount = dependencies.filter((section) => section?.status === "validated").length;
    const active = dependencies.some((section) => section?.status === "generating");
    let status: DeliverableOutcomeStatus = "waiting";
    if (failed) status = "failed";
    else if (files.length) status = "available";
    else if (dependencies.length > 0 && readyCount === dependencies.length) status = "content_ready";
    else if (active || readyCount > 0) status = "forming";
    return {
      key: definition.key,
      code: definition.code,
      title: definition.title,
      description: definition.description,
      status,
      completedDependencies: readyCount,
      totalDependencies: dependencies.length,
      summary: dependencies.filter(Boolean).map((section) => section?.summary).filter(Boolean).join(" ").slice(0, 240) || null,
      files,
    };
  });
}
