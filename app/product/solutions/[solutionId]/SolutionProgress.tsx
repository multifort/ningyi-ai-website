"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { productApi } from "../../../../lib/product/api-contract";
import ProjectModelEditor from "./ProjectModelEditor";
import QuoteParameterEditor from "./QuoteParameterEditor";

type DeliverableFile = { id: string; artifactType: string; displayName: string; mimeType: string; sizeBytes: number; status: string; contentVersion?: number; renderVersion?: number; historyCount?: number };
type DeliverableOutcome = { key: string; code: string; title: string; description: string; status: "waiting" | "forming" | "content_ready" | "available" | "failed"; completedDependencies: number; totalDependencies: number; summary?: string | null; files: DeliverableFile[] };
type Recovery = { state: "retry_wait" | "cooldown" | "environment_wait"; stageLabel: string; nextRetryAt: string | null; attemptCount: number; maxAttempts: number; headline: string; message: string };
type Progress = { solutionId: string; title: string; status: string; stage: string; headline: string; inputFingerprint?: string | null; activity?: Array<{ id: string; type: string; summary: string; createdAt: string }>; automaticRecovery?: boolean; recovery?: Recovery | null; intake?: { purposePrimary: string; needDescription: string } | null; formalDocument?: { status: string; configured: boolean; currentSection: number; totalSections: number; sections: Array<{ sectionKey: string; title: string; status: string; summary?: string; nextAttemptAt?: string | null }> }; consistency?: { status: "pass" | "fail"; metrics: { totalItems: number; requirementFeatureCoverage: number | null; featureEstimationCoverage: number | null; estimationPlanCoverage: number | null }; issues: Array<{ code: string; severity: "error" | "warning"; message: string }> } | null; deliverableOutcomes?: DeliverableOutcome[]; deliverables: DeliverableFile[]; files: Array<{ id: string; category: string; displayName: string; status: string; detectedFormat?: string; templateStatus?: string; templateNotice?: string }> };
type Knowledge = { status?: "ready" | "review_required"; stats?: { sourceFileCount: number; sourceBlockCount: number; factCount: number; conflictCount: number; duplicateStatementsMerged: number; formats: string[] }; missingTopics?: Array<{ id: string; label: string }>; conflicts?: Array<{ id: string; topicLabel: string; reason: string; statements: Array<{ factId: string; text: string }> }> };
type Understanding = { summary: string; facts: Array<{ id: string; text: string; topic?: string; sourceFiles?: string[]; sourceFormats?: string[] }>; knowledge?: Knowledge; sourceBlockCount: number; sourceBlocks?: Array<{ id: string; blockType: string; sourceFormat?: string | null; sourceName: string; text: string; locator: string }>; userFacts?: Array<{ id: string; text: string; status: string; createdAt: string }>; analysisOrigin?: string; analysisModel?: string; freeAnalysis?: { summary: string; problemStatement: string; goals: string[]; risks: string[]; missingInformation: string[]; recommendedNextStep: string } };
const stages = [
  ["quick_understanding", "理解材料", "提取事实、目标、范围和限制"],
  ["media_analysis", "识别图像", "并行识别图片、扫描件和演示文稿中的视觉信息"],
  ["formal_analysis", "形成方案", "组织需求、功能、估算与实施内容"],
  ["rendering", "整理成果", "生成可下载的 Word、Excel、PPT 和 PDF"],
  ["completed", "成果可用", "检查一致性后开放下载"],
];

export default function SolutionProgress({ solutionId }: { solutionId: string }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [understanding, setUnderstanding] = useState<Understanding | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unauthorized" | "missing">("loading");
  const [actionWorking, setActionWorking] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [revisionFiles, setRevisionFiles] = useState<File[]>([]);
  const [revisionWorking, setRevisionWorking] = useState(false);
  const [revisionNotice, setRevisionNotice] = useState("");
  const [templateFiles, setTemplateFiles] = useState<File[]>([]);
  const [templateWorking, setTemplateWorking] = useState(false);
  const [templateNotice, setTemplateNotice] = useState("");
  const [removingTemplateId, setRemovingTemplateId] = useState("");
  const [brandFiles, setBrandFiles] = useState<File[]>([]);
  const [brandWorking, setBrandWorking] = useState(false);
  const [brandNotice, setBrandNotice] = useState("");
  const [removingBrandId, setRemovingBrandId] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [correctionWorking, setCorrectionWorking] = useState(false);
  const [correctionNotice, setCorrectionNotice] = useState("");
  const [removingFactId, setRemovingFactId] = useState("");
  const [removingMaterialId, setRemovingMaterialId] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionWorking, setDescriptionWorking] = useState(false);
  const [descriptionNotice, setDescriptionNotice] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleWorking, setTitleWorking] = useState(false);
  const [titleNotice, setTitleNotice] = useState("");
  const [sourceBlocksOpen, setSourceBlocksOpen] = useState(false);
  const descriptionInitialized = useRef(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch(productApi.progress(solutionId));
      if (!active) return;
      if (response.status === 401) { setState("unauthorized"); return; }
      if (!response.ok) { setState("missing"); return; }
      const payload = await response.json();
      setProgress(payload.data); setState("ready");
      if (!descriptionInitialized.current) { setDescriptionDraft(payload.data.intake?.needDescription || ""); descriptionInitialized.current = true; }
      if (["formal_analysis", "rendering", "completed"].includes(payload.data.stage)) {
        const response = await fetch(productApi.understanding(solutionId));
        if (response.ok) setUnderstanding((await response.json()).data);
      }
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [solutionId]);

  if (state === "loading") return <div className="grid min-h-screen place-items-center bg-[#f4f7fb] text-sm text-slate-500">正在读取方案进度…</div>;
  if (state === "unauthorized") return <Message title="登录后查看这份方案" action="去登录" href="/product" />;
  if (!progress || state === "missing") return <Message title="这份方案不存在或无法访问" action="返回我的成果" href="/product" />;
  const currentIndex = Math.max(0, stages.findIndex(([id]) => id === progress.stage));
  const hasUploadedContent = progress.files.some((file) => file.category === "content" && file.status === "uploaded");
  const continueProcessing = async () => {
    if (actionWorking || progress.stage === "completed" || progress.stage === "rendering") return;
    setActionWorking(true);
    setActionNotice("");
    try {
      const endpoint = progress.stage === "formal_analysis" ? productApi.formal(solutionId) : productApi.process(solutionId);
      const response = await fetch(endpoint, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "暂时无法继续处理。");
      setActionNotice(payload?.data?.queued === false ? "当前任务已在处理队列中，系统会自动继续。" : "已重新加入处理队列，系统会自动继续。 ");
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "暂时无法继续处理，请稍后重试。");
    } finally {
      setActionWorking(false);
    }
  };
  const selectRevisionFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setRevisionFiles(Array.from(event.target.files || []).slice(0, 20));
    setRevisionNotice("");
    event.target.value = "";
  };
  const selectTemplateFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setTemplateFiles(Array.from(event.target.files || []).slice(0, 6));
    setTemplateNotice("");
    event.target.value = "";
  };
  const selectBrandFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setBrandFiles(Array.from(event.target.files || []).slice(0, 10));
    setBrandNotice("");
    event.target.value = "";
  };
  const uploadRevision = async () => {
    if (!revisionFiles.length || revisionWorking) return;
    if (!window.confirm("补充材料会使当前理解和已生成成果失效，并在上传完成后重新解析。要继续吗？")) return;
    setRevisionWorking(true);
    setRevisionNotice("");
    try {
      const selections = revisionFiles.map((file) => ({
        clientKey: crypto.randomUUID(),
        displayName: file.name,
        sizeBytes: file.size,
        declaredMime: file.type,
        file,
      }));
      const preparedResponse = await fetch(productApi.addMaterials(solutionId), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileSelections: selections.map(({ file: _file, ...selection }) => selection) }),
      });
      const prepared = await preparedResponse.json().catch(() => null);
      if (!preparedResponse.ok || !prepared?.success) throw new Error(prepared?.error?.message || "暂时无法准备补充材料。");
      let failures = 0;
      for (const upload of prepared.data.uploads as Array<{ fileId: string; clientKey: string }>) {
        const selected = selections.find((item) => item.clientKey === upload.clientKey);
        if (!selected) { failures += 1; continue; }
        const data = new FormData();
        data.append("file", selected.file);
        const response = await fetch(productApi.upload(solutionId, upload.fileId), { method: "POST", body: data });
        if (!response.ok) failures += 1;
      }
      if (failures) throw new Error(`${failures} 个文件上传失败；已上传的材料已保存，请重新选择失败文件后再补充。`);
      const queued = await fetch(productApi.process(solutionId), { method: "POST" });
      const queueResult = await queued.json().catch(() => null);
      if (!queued.ok) throw new Error(queueResult?.error?.message || "材料已上传，但暂时无法重新开始解析。");
      setRevisionFiles([]);
      setUnderstanding(null);
      setRevisionNotice("材料已更新，旧成果已归档，系统正在重新理解项目内容。");
      const refreshed = await fetch(productApi.progress(solutionId));
      if (refreshed.ok) setProgress((await refreshed.json()).data);
    } catch (error) {
      setRevisionNotice(error instanceof Error ? error.message : "暂时无法补充材料，请稍后重试。");
    } finally {
      setRevisionWorking(false);
    }
  };
  const uploadTemplates = async () => {
    if (!templateFiles.length || templateWorking) return;
    setTemplateWorking(true);
    setTemplateNotice("");
    try {
      const selections = templateFiles.map((file) => ({ clientKey: crypto.randomUUID(), displayName: file.name, sizeBytes: file.size, declaredMime: file.type, file }));
      const preparedResponse = await fetch(productApi.addTemplates(solutionId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileSelections: selections.map(({ file: _file, ...selection }) => selection) }) });
      const prepared = await preparedResponse.json().catch(() => null);
      if (!preparedResponse.ok || !prepared?.success) throw new Error(prepared?.error?.message || "暂时无法准备企业模板。");
      let failures = 0;
      for (const upload of prepared.data.uploads as Array<{ fileId: string; clientKey: string }>) {
        const selected = selections.find((item) => item.clientKey === upload.clientKey);
        if (!selected) { failures += 1; continue; }
        const data = new FormData(); data.append("file", selected.file);
        const response = await fetch(productApi.upload(solutionId, upload.fileId), { method: "POST", body: data });
        if (!response.ok) failures += 1;
      }
      if (failures) throw new Error(`${failures} 个模板上传失败，请重新选择失败文件后重试。`);
      const refreshed = await fetch(productApi.progress(solutionId));
      if (refreshed.ok) setProgress((await refreshed.json()).data);
      setTemplateFiles([]);
      setTemplateNotice("模板已接收，系统正在提取安全的主题和版式；已有成果只会重新渲染，不会重写内容。");
    } catch (error) {
      setTemplateNotice(error instanceof Error ? error.message : "暂时无法上传企业模板，请稍后重试。");
    } finally {
      setTemplateWorking(false);
    }
  };
  const removeTemplate = async (fileId: string, displayName: string) => {
    if (removingTemplateId) return;
    if (!window.confirm(`移除“${displayName}”后，受影响成果将回退到较早模板或平台默认版式。要继续吗？`)) return;
    setRemovingTemplateId(fileId);
    setTemplateNotice("");
    try {
      const response = await fetch(productApi.removeTemplate(solutionId, fileId), { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "暂时无法移除企业模板。");
      const refreshed = await fetch(productApi.progress(solutionId));
      if (refreshed.ok) setProgress((await refreshed.json()).data);
      setTemplateNotice(payload.data.rerenderQueued ? "模板已移除，受影响成果正在按当前可用版式重新整理。" : "模板已移除。新的成果将使用当前可用版式。 ");
    } catch (error) {
      setTemplateNotice(error instanceof Error ? error.message : "暂时无法移除企业模板，请稍后重试。");
    } finally {
      setRemovingTemplateId("");
    }
  };
  const uploadBrands = async () => {
    if (!brandFiles.length || brandWorking) return;
    setBrandWorking(true);
    setBrandNotice("");
    try {
      const selections = brandFiles.map((file) => ({ clientKey: crypto.randomUUID(), displayName: file.name, sizeBytes: file.size, declaredMime: file.type, file }));
      const preparedResponse = await fetch(productApi.addBrands(solutionId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileSelections: selections.map(({ file: _file, ...selection }) => selection) }) });
      const prepared = await preparedResponse.json().catch(() => null);
      if (!preparedResponse.ok || !prepared?.success) throw new Error(prepared?.error?.message || "暂时无法准备品牌素材。");
      let failures = 0;
      for (const upload of prepared.data.uploads as Array<{ fileId: string; clientKey: string }>) {
        const selected = selections.find((item) => item.clientKey === upload.clientKey);
        if (!selected) { failures += 1; continue; }
        const data = new FormData(); data.append("file", selected.file);
        const response = await fetch(productApi.upload(solutionId, upload.fileId), { method: "POST", body: data });
        if (!response.ok) failures += 1;
      }
      if (failures) throw new Error(`${failures} 个品牌素材上传失败，请重新选择失败文件后重试。`);
      const refreshed = await fetch(productApi.progress(solutionId));
      if (refreshed.ok) setProgress((await refreshed.json()).data);
      setBrandFiles([]);
      setBrandNotice("品牌素材已接收。图片 Logo 会在本地提取安全主题色，并仅重新渲染已有成果，不会修改方案内容。");
    } catch (error) {
      setBrandNotice(error instanceof Error ? error.message : "暂时无法上传品牌素材，请稍后重试。");
    } finally {
      setBrandWorking(false);
    }
  };
  const removeBrand = async (fileId: string, displayName: string) => {
    if (removingBrandId) return;
    if (!window.confirm(`移除“${displayName}”后，后续下载成果将回退到较早品牌、企业模板或平台默认主题。要继续吗？`)) return;
    setRemovingBrandId(fileId);
    setBrandNotice("");
    try {
      const response = await fetch(productApi.removeBrand(solutionId, fileId), { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "暂时无法移除品牌素材。");
      const refreshed = await fetch(productApi.progress(solutionId));
      if (refreshed.ok) setProgress((await refreshed.json()).data);
      setBrandNotice(payload.data.rerenderQueued ? "品牌素材已移除，已有成果正在按当前主题重新整理。" : "品牌素材已移除。新的成果将使用当前可用主题。 ");
    } catch (error) {
      setBrandNotice(error instanceof Error ? error.message : "暂时无法移除品牌素材，请稍后重试。");
    } finally {
      setRemovingBrandId("");
    }
  };
  const saveCorrection = async () => {
    const text = correctionText.trim();
    if (text.length < 6 || correctionWorking) {
      setCorrectionNotice("请至少输入 6 个字符，说明需要补充或纠正的项目事实。");
      return;
    }
    if (!window.confirm("这条确认信息会作为优先项目事实，并让当前成果进入待重新生成状态。要继续吗？")) return;
    setCorrectionWorking(true);
    setCorrectionNotice("");
    try {
      const response = await fetch(productApi.addUnderstandingFact(solutionId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "暂时无法保存项目修正。");
      const [understandingResponse, progressResponse] = await Promise.all([fetch(productApi.understanding(solutionId)), fetch(productApi.progress(solutionId))]);
      if (understandingResponse.ok) setUnderstanding((await understandingResponse.json()).data);
      if (progressResponse.ok) setProgress((await progressResponse.json()).data);
      setCorrectionText("");
      setCorrectionNotice("已保存为用户确认事实，旧成果已归档，后续方案会以此为准重新形成。");
    } catch (error) {
      setCorrectionNotice(error instanceof Error ? error.message : "暂时无法保存项目修正，请稍后重试。");
    } finally {
      setCorrectionWorking(false);
    }
  };
  const removeCorrection = async (factId: string) => {
    if (removingFactId) return;
    if (!window.confirm("撤销后，这条用户确认事实将不再参与方案形成；相关成果会进入待更新状态。要继续吗？")) return;
    setRemovingFactId(factId);
    setCorrectionNotice("");
    try {
      const response = await fetch(productApi.removeUnderstandingFact(solutionId, factId), { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "暂时无法撤销项目修正。");
      const [understandingResponse, progressResponse] = await Promise.all([fetch(productApi.understanding(solutionId)), fetch(productApi.progress(solutionId))]);
      if (understandingResponse.ok) setUnderstanding((await understandingResponse.json()).data);
      if (progressResponse.ok) setProgress((await progressResponse.json()).data);
      setCorrectionNotice("已撤销该确认事实，项目理解和受影响成果会以剩余材料重新形成。");
    } catch (error) {
      setCorrectionNotice(error instanceof Error ? error.message : "暂时无法撤销项目修正，请稍后重试。");
    } finally {
      setRemovingFactId("");
    }
  };
  const removeMaterial = async (fileId: string, displayName: string) => {
    if (removingMaterialId) return;
    if (!window.confirm(`移除“${displayName}”后，当前理解和成果会基于剩余材料重新形成。要继续吗？`)) return;
    setRemovingMaterialId(fileId);
    setRevisionNotice("");
    try {
      const response = await fetch(productApi.removeMaterial(solutionId, fileId), { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "暂时无法移除材料。");
      const refreshed = await fetch(productApi.progress(solutionId));
      if (refreshed.ok) setProgress((await refreshed.json()).data);
      setUnderstanding(null);
      setRevisionNotice("材料已移除，旧成果已归档，系统正在基于剩余材料重新理解项目内容。");
    } catch (error) {
      setRevisionNotice(error instanceof Error ? error.message : "暂时无法移除材料，请稍后重试。");
    } finally {
      setRemovingMaterialId("");
    }
  };
  const saveDescription = async () => {
    const needDescription = descriptionDraft.trim();
    if ((needDescription.length > 0 && needDescription.length < 6) || (!needDescription && !hasUploadedContent) || descriptionWorking) {
      setDescriptionNotice(hasUploadedContent ? "项目说明至少需要 6 个字符；如需清空可直接删除全部文字后保存。" : "项目说明至少需要 6 个字符；当前没有已上传材料，不能清空。 ");
      return;
    }
    if (!window.confirm(needDescription ? "更新原始项目说明会让当前理解和成果基于新描述重新形成。要继续吗？" : "清空原始项目说明后，项目将仅基于已上传材料重新形成。要继续吗？")) return;
    setDescriptionWorking(true);
    setDescriptionNotice("");
    try {
      const response = await fetch(productApi.updateIntakeDescription(solutionId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ needDescription }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "暂时无法更新项目说明。");
      const refreshed = await fetch(productApi.progress(solutionId));
      if (refreshed.ok) setProgress((await refreshed.json()).data);
      setUnderstanding(null);
      setDescriptionOpen(false);
      setDescriptionNotice(needDescription ? "项目说明已更新，系统正在重新理解并形成受影响成果。" : "项目说明已清空，系统正在基于已上传材料重新理解并形成受影响成果。 ");
    } catch (error) {
      setDescriptionNotice(error instanceof Error ? error.message : "暂时无法更新项目说明，请稍后重试。");
    } finally {
      setDescriptionWorking(false);
    }
  };
  const saveTitle = async () => {
    const title = titleDraft.trim();
    if (title.length < 2 || titleWorking) { setTitleNotice("项目名称至少需要 2 个字符。"); return; }
    if (progress.deliverables.length && !window.confirm("改名会重新整理现有成果的文件名和封面，但不会重写方案内容。要继续吗？")) return;
    setTitleWorking(true);
    setTitleNotice("");
    try {
      const response = await fetch(productApi.updateSolution(solutionId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "暂时无法更新项目名称。");
      const refreshed = await fetch(productApi.progress(solutionId));
      if (refreshed.ok) setProgress((await refreshed.json()).data);
      setTitleEditing(false);
      setTitleNotice(payload.data.rerenderQueued ? "项目已改名，成果文件正在重新整理。" : "项目名称已更新。");
    } catch (error) {
      setTitleNotice(error instanceof Error ? error.message : "暂时无法更新项目名称，请稍后重试。");
    } finally {
      setTitleWorking(false);
    }
  };
  const refreshAfterModelRevision = async () => {
    const [progressResponse, understandingResponse] = await Promise.all([fetch(productApi.progress(solutionId)), fetch(productApi.understanding(solutionId))]);
    if (progressResponse.ok) setProgress((await progressResponse.json()).data);
    if (understandingResponse.ok) setUnderstanding((await understandingResponse.json()).data);
  };

  return <main className="min-h-screen bg-[#f4f7fb] text-slate-800">
    <header className="border-b border-slate-200 bg-white"><div className="section-shell flex h-20 items-center justify-between"><Link href="/product" className="font-display text-lg font-bold text-primary">← 我的成果</Link><Link href="/" className="text-sm font-semibold text-slate-500">返回官网</Link></div></header>
    <div className="section-shell py-10 sm:py-14">
      <div className="rounded-[30px] bg-primary p-7 text-white shadow-[0_24px_70px_rgba(7,27,51,.18)] sm:p-10">
        <p className="text-sm font-semibold text-accent2">{progress.stage === "completed" ? "你的成果已经准备好" : progress.recovery ? "系统正在自动恢复" : "方案正在持续形成"}</p><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{progress.title}</h1><button type="button" onClick={() => { setTitleDraft(progress.title); setTitleEditing((editing) => !editing); setTitleNotice(""); }} className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-bold text-slate-100 hover:bg-white/10">{titleEditing ? "取消" : "修改名称"}</button></div><p className="mt-4 text-base text-slate-300">{progress.headline}。{progress.stage === "completed" ? "你可以在下方查看和下载。" : "你可以离开页面，处理会在后台继续。"}</p>{titleEditing && <div className="mt-4 max-w-xl"><div className="flex flex-col gap-2 sm:flex-row"><input value={titleDraft} onChange={(event) => { setTitleDraft(event.target.value); setTitleNotice(""); }} maxLength={120} className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-300 focus:border-cyan-300" aria-label="项目名称" /><button type="button" onClick={saveTitle} disabled={titleWorking || titleDraft.trim().length < 2} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-primary hover:bg-blue-50 disabled:opacity-50">{titleWorking ? "正在保存…" : "保存名称"}</button></div></div>}{titleNotice && <p className={`mt-3 text-sm ${titleNotice.includes("无法") || titleNotice.includes("至少") ? "text-amber-200" : "text-cyan-100"}`} role="status">{titleNotice}</p>}{progress.stage !== "completed" && progress.stage !== "rendering" && <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={continueProcessing} disabled={actionWorking} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-primary transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60">{actionWorking ? "正在重新排队…" : "继续处理"}</button>{actionNotice && <span className="text-xs leading-5 text-slate-300" role="status">{actionNotice}</span>}</div>}
      </div>
      <section className="mt-7 rounded-3xl border border-blue-100 bg-white p-6 shadow-[0_14px_40px_rgba(31,111,255,.06)] sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-accent1">补充项目材料</p><h2 className="mt-2 text-xl font-bold text-primary">有新需求、纪要或表格？直接加入当前项目</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">上传成功后，当前理解与成果会明确标记为旧版本，系统基于完整材料重新解析；不会静默把新信息混入既有方案。下载输入包会按项目材料、企业模板和品牌素材分目录整理，并附带项目说明、已确认事实与文件校验值。</p></div><div className="flex flex-wrap gap-2"><a href={productApi.sourcePackage(solutionId)} className="inline-flex h-fit items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-primary transition hover:border-blue-200 hover:bg-blue-50">下载输入包</a><label className="inline-flex h-fit cursor-pointer items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-accent1 transition hover:bg-blue-100">选择材料<input type="file" multiple accept=".docx,.pdf,.xlsx,.pptx,.txt,.csv,.json,.png,.jpg,.jpeg,.webp" className="sr-only" onChange={selectRevisionFiles} /></label></div></div>
        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-primary">原始项目说明</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{progress.intake?.needDescription || "尚未填写文字说明，当前仅依据上传材料。"}</p></div><button type="button" onClick={() => { setDescriptionOpen((open) => !open); setDescriptionNotice(""); }} className="shrink-0 text-sm font-bold text-accent1 hover:text-blue-700">{descriptionOpen ? "收起" : "修改说明"}</button></div>{descriptionOpen && <div className="mt-4"><textarea value={descriptionDraft} onChange={(event) => { setDescriptionDraft(event.target.value); setDescriptionNotice(""); }} maxLength={12000} className="min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 focus:border-accent1 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="说明当前问题、目标、范围和约束…" /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-400">{descriptionDraft.length}/12000{hasUploadedContent ? " · 已有材料时可清空说明" : ""}</p><button type="button" onClick={saveDescription} disabled={descriptionWorking || (descriptionDraft.trim().length > 0 && descriptionDraft.trim().length < 6) || (!descriptionDraft.trim() && !hasUploadedContent)} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{descriptionWorking ? "正在更新…" : "保存并重新理解"}</button></div></div>}{descriptionNotice && <p className={`mt-3 rounded-xl px-4 py-3 text-sm leading-6 ${descriptionNotice.includes("无法") || descriptionNotice.includes("至少") || descriptionNotice.includes("不能") ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`} role="status">{descriptionNotice}</p>}</div>
        {progress.inputFingerprint && <p className="mt-4 break-all text-[11px] text-slate-400">当前输入快照 · <code className="select-all font-mono text-slate-500">{progress.inputFingerprint}</code></p>}
        {progress.files.filter((file) => file.category === "content" && file.status === "uploaded").length > 0 && <div className="mt-5 flex flex-wrap gap-2">{progress.files.filter((file) => file.category === "content" && file.status === "uploaded").map((file) => <span key={file.id} className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 py-1.5 pl-3 pr-2 text-xs text-slate-600"><span className="truncate">{file.displayName}</span><button type="button" onClick={() => removeMaterial(file.id, file.displayName)} disabled={Boolean(removingMaterialId)} className="rounded-full px-1 font-bold text-slate-400 hover:text-red-600 disabled:opacity-50">{removingMaterialId === file.id ? "…" : "×"}</button></span>)}</div>}
        {revisionFiles.length > 0 && <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-semibold text-primary">已选择 {revisionFiles.length} 个文件</p><p className="mt-1 truncate text-xs text-slate-500">{revisionFiles.map((file) => file.name).join("、")}</p></div><button type="button" onClick={uploadRevision} disabled={revisionWorking} className="shrink-0 rounded-full bg-accent1 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-600 disabled:cursor-wait disabled:opacity-60">{revisionWorking ? "正在上传并更新…" : "上传并重新理解"}</button></div></div>}
        {revisionNotice && <p className={`mt-4 rounded-xl px-4 py-3 text-sm leading-6 ${revisionNotice.includes("失败") || revisionNotice.includes("无法") ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`} role="status">{revisionNotice}</p>}
      </section>
      <section className="mt-7 rounded-3xl border border-violet-100 bg-white p-6 shadow-[0_14px_40px_rgba(91,33,182,.05)] sm:p-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-violet-700">企业模板与版式</p><h2 className="mt-2 text-xl font-bold text-primary">追加 Word、Excel 或 PPT 企业模板</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">系统只提取安全的颜色、页面尺寸和版式信息；模板示例正文、宏和嵌入对象不会进入成果。</p></div><label className="inline-flex h-fit cursor-pointer items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-violet-100">选择模板<input type="file" multiple accept=".docx,.xlsx,.pptx" className="sr-only" onChange={selectTemplateFiles} /></label></div>{progress.files.filter((file) => file.category === "template" && file.status === "uploaded").length > 0 && <div className="mt-5 flex flex-wrap gap-2">{progress.files.filter((file) => file.category === "template" && file.status === "uploaded").map((file) => <span key={file.id} className="inline-flex max-w-full items-center gap-2 rounded-full bg-violet-50 py-1.5 pl-3 pr-2 text-xs text-violet-800"><span className="truncate">{file.displayName} · {file.templateStatus === "theme_applied" ? "主题已应用" : file.templateStatus === "fallback" ? "使用默认版式" : "已识别"}</span><button type="button" onClick={() => removeTemplate(file.id, file.displayName)} disabled={Boolean(removingTemplateId)} className="rounded-full px-1 font-bold text-violet-500 hover:text-red-600 disabled:opacity-50" aria-label={`移除 ${file.displayName}`}>{removingTemplateId === file.id ? "…" : "×"}</button></span>)}</div>}{templateFiles.length > 0 && <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-semibold text-primary">已选择 {templateFiles.length} 个模板</p><p className="mt-1 truncate text-xs text-slate-500">{templateFiles.map((file) => file.name).join("、")}</p></div><button type="button" onClick={uploadTemplates} disabled={templateWorking} className="shrink-0 rounded-full bg-violet-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60">{templateWorking ? "正在上传模板…" : "应用模板"}</button></div></div>}{templateNotice && <p className={`mt-4 rounded-xl px-4 py-3 text-sm leading-6 ${templateNotice.includes("失败") || templateNotice.includes("无法") ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`} role="status">{templateNotice}</p>}</section>
      <section className="mt-7 rounded-3xl border border-amber-100 bg-white p-6 shadow-[0_14px_40px_rgba(180,83,9,.05)] sm:p-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-amber-700">Logo 与品牌素材</p><h2 className="mt-2 text-xl font-bold text-primary">让下载成果使用你的品牌色</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">PNG Logo 会在本地提取主题色；JPG、WebP 与 PDF 品牌说明会安全保存并继续使用企业模板或平台默认主题。新素材只重新渲染文件，不会进入材料理解或改变方案内容。</p></div><label className="inline-flex h-fit cursor-pointer items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-100">选择品牌素材<input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" className="sr-only" onChange={selectBrandFiles} /></label></div>{progress.files.filter((file) => file.category === "brand" && file.status === "uploaded").length > 0 && <div className="mt-5 flex flex-wrap gap-2">{progress.files.filter((file) => file.category === "brand" && file.status === "uploaded").map((file) => <span key={file.id} className="inline-flex max-w-full items-center gap-2 rounded-full bg-amber-50 py-1.5 pl-3 pr-2 text-xs text-amber-800"><span className="truncate">{file.displayName} · 品牌素材已保存</span><button type="button" onClick={() => removeBrand(file.id, file.displayName)} disabled={Boolean(removingBrandId)} className="rounded-full px-1 font-bold text-amber-500 hover:text-red-600 disabled:opacity-50" aria-label={`移除 ${file.displayName}`}>{removingBrandId === file.id ? "…" : "×"}</button></span>)}</div>}{brandFiles.length > 0 && <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-semibold text-primary">已选择 {brandFiles.length} 个品牌素材</p><p className="mt-1 truncate text-xs text-slate-500">{brandFiles.map((file) => file.name).join("、")}</p></div><button type="button" onClick={uploadBrands} disabled={brandWorking} className="shrink-0 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60">{brandWorking ? "正在上传品牌素材…" : "保存并应用"}</button></div></div>}{brandNotice && <p className={`mt-4 rounded-xl px-4 py-3 text-sm leading-6 ${brandNotice.includes("失败") || brandNotice.includes("无法") ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`} role="status">{brandNotice}</p>}</section>
      {progress.recovery && <RecoveryNotice recovery={progress.recovery} />}
      {progress.activity?.length ? <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-7 sm:p-9"><p className="text-sm font-semibold text-accent1">项目时间线</p><h2 className="mt-2 text-xl font-bold text-primary">最近变更</h2><div className="mt-5 space-y-3">{progress.activity.map((event) => <div key={event.id} className="flex flex-col gap-1 border-l-2 border-blue-100 pl-4 sm:flex-row sm:items-baseline sm:justify-between"><p className="text-sm font-medium text-slate-700">{event.summary}</p><time className="text-xs text-slate-400">{new Date(event.createdAt).toLocaleString("zh-CN")}</time></div>)}</div></section> : null}
      {understanding && <section className="mt-7 rounded-3xl border border-blue-100 bg-white p-7 sm:p-9"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="text-sm font-semibold text-accent1">材料初步理解</p><h2 className="mt-2 text-2xl font-bold text-primary">系统从材料中识别到的首批信息</h2></div><p className="text-sm text-slate-400">已形成 {understanding.sourceBlockCount} 个可追溯材料块</p></div><p className="mt-5 text-sm leading-7 text-slate-600">{understanding.summary}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{understanding.facts.slice(0, 6).map((fact) => <div key={fact.id} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-accent1">{fact.id}</p><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-700">{fact.text}</p>{fact.sourceFiles?.length ? <p className="mt-3 line-clamp-1 text-[11px] font-semibold text-slate-400">来源：{fact.sourceFiles.join("、")}</p> : <p className="mt-3 text-[11px] font-semibold text-cyan-700">来源：用户确认</p>}</div>)}</div>{Boolean(understanding.sourceBlocks?.length) && <div className="mt-5 border-t border-blue-100 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-primary">核对原始摘录与位置</p><p className="mt-1 text-xs leading-5 text-slate-500">仅展示当前账号材料的安全摘录，不下载或公开原文件。</p></div><button type="button" onClick={() => setSourceBlocksOpen((open) => !open)} className="rounded-full border border-blue-200 px-4 py-2 text-xs font-bold text-accent1 hover:bg-blue-50">{sourceBlocksOpen ? "收起来源" : `查看 ${understanding.sourceBlocks!.length} 条来源`}</button></div>{sourceBlocksOpen && <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">{understanding.sourceBlocks!.map((block) => <article key={block.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-primary">{block.sourceName}</p><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">{block.sourceFormat || block.blockType}</span></div><p className="mt-2 text-xs leading-5 text-slate-400">位置：{block.locator}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{block.text}</p></article>)}</div>}</div>}</section>}
      {understanding && <section className="mt-7 rounded-3xl border border-cyan-100 bg-white p-7 sm:p-9"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-cyan-700">纠正项目理解</p><h2 className="mt-2 text-xl font-bold text-primary">补充一条你确认无误的项目事实</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">例如范围、用户、时间、预算边界或不包含内容。它会以“用户确认”来源保存，优先参与后续方案形成。</p></div><span className="h-fit rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-700">不会覆盖原始材料</span></div>{understanding.userFacts?.length ? <div className="mt-5 space-y-2">{understanding.userFacts.map((fact) => <div key={fact.id} className="flex flex-col gap-3 rounded-xl bg-cyan-50/60 px-4 py-3 text-sm leading-6 text-slate-700 sm:flex-row sm:items-start sm:justify-between"><p><span className="mr-2 text-xs font-bold text-cyan-700">用户确认</span>{fact.text}</p><button type="button" onClick={() => removeCorrection(fact.id)} disabled={Boolean(removingFactId)} className="shrink-0 text-xs font-bold text-slate-500 hover:text-red-600 disabled:opacity-50">{removingFactId === fact.id ? "正在撤销…" : "撤销"}</button></div>)}</div> : null}<textarea value={correctionText} onChange={(event) => { setCorrectionText(event.target.value); setCorrectionNotice(""); }} maxLength={2000} className="mt-5 min-h-24 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-100" placeholder="例如：一期不包含移动端；审批流程需要支持部门负责人和财务两级审批。" /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-400">{correctionText.length}/2000 · 保存后会重新形成受影响成果</p><button type="button" onClick={saveCorrection} disabled={correctionWorking || correctionText.trim().length < 6} className="rounded-full bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50">{correctionWorking ? "正在保存…" : "保存项目修正"}</button></div>{correctionNotice && <p className={`mt-4 rounded-xl px-4 py-3 text-sm leading-6 ${correctionNotice.includes("无法") || correctionNotice.includes("至少") ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`} role="status">{correctionNotice}</p>}</section>}
      {understanding?.knowledge?.stats && <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="p-7 sm:p-9"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-accent1">材料统一汇总</p><h2 className="mt-2 text-2xl font-bold text-primary">不同格式已经进入同一份项目知识</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">相同表述会合并并保留全部来源；相反表述会标记为待确认，后续成果不得自行选择其中一项作为既定事实。</p></div><span className={`h-fit rounded-full px-3 py-1.5 text-xs font-semibold ${understanding.knowledge.stats.conflictCount ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{understanding.knowledge.stats.conflictCount ? `${understanding.knowledge.stats.conflictCount} 组潜在冲突` : "未发现明确冲突"}</span></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5"><KnowledgeMetric label="材料文件" value={understanding.knowledge.stats.sourceFileCount} /><KnowledgeMetric label="内容块" value={understanding.knowledge.stats.sourceBlockCount} /><KnowledgeMetric label="统一事实" value={understanding.knowledge.stats.factCount} /><KnowledgeMetric label="合并重复" value={understanding.knowledge.stats.duplicateStatementsMerged} /><KnowledgeMetric label="输入格式" value={understanding.knowledge.stats.formats.length || 1} /></div><div className="mt-5 flex flex-wrap gap-2">{understanding.knowledge.stats.formats.map((format) => <span key={format} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold uppercase text-accent1">{format}</span>)}</div></div>{Boolean(understanding.knowledge.conflicts?.length) && <div className="border-t border-amber-100 bg-amber-50/60 p-7 sm:px-9"><h3 className="font-bold text-amber-800">需要在成果中保留为待确认项</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{understanding.knowledge.conflicts!.slice(0, 4).map((conflict) => <div key={conflict.id} className="rounded-2xl bg-white p-4"><p className="text-xs font-bold text-amber-700">{conflict.id} · {conflict.topicLabel}</p><div className="mt-2 space-y-1">{conflict.statements.map((statement) => <p key={statement.factId} className="line-clamp-2 text-xs leading-5 text-slate-600">{statement.factId}：{statement.text}</p>)}</div></div>)}</div></div>}{Boolean(understanding.knowledge.missingTopics?.length) && <div className="border-t border-slate-100 px-7 py-5 text-xs text-slate-500 sm:px-9">当前材料尚未明确：{understanding.knowledge.missingTopics!.map((item) => item.label).join("、")}。系统会作为信息缺口提示，不会自行补写事实。</div>}</section>}
      {understanding?.freeAnalysis && <section className="mt-7 overflow-hidden rounded-3xl bg-primary text-white shadow-[0_20px_60px_rgba(7,27,51,.14)]"><div className="border-b border-white/10 p-7 sm:p-9"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-accent2">免费初步分析</p><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">{understanding.analysisOrigin === "low_cost_model" ? `低成本模型 · ${understanding.analysisModel}` : "规则分析 · 未消耗模型 Token"}</span></div><h2 className="mt-3 text-2xl font-bold">{understanding.freeAnalysis.problemStatement}</h2><p className="mt-4 text-sm leading-7 text-slate-300">{understanding.freeAnalysis.summary}</p></div><div className="grid gap-px bg-white/10 md:grid-cols-3"><AnalysisList title="建议目标" items={understanding.freeAnalysis.goals} /><AnalysisList title="当前风险" items={understanding.freeAnalysis.risks} /><AnalysisList title="还需确认" items={understanding.freeAnalysis.missingInformation} /></div><div className="border-t border-white/10 px-7 py-5 text-sm text-cyan-100">下一步：{understanding.freeAnalysis.recommendedNextStep}</div></section>}
      {progress.formalDocument && <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-7 sm:p-9"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="text-sm font-semibold text-accent1">正式方案章节账本</p><h2 className="mt-2 text-2xl font-bold text-primary">分章节生成，随时从断点继续</h2></div><span className={`h-fit rounded-full px-3 py-1.5 text-xs font-semibold ${progress.formalDocument.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{progress.formalDocument.configured ? "正式分析已配置" : "正式分析环境准备中"}</span></div><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500">每一章独立保存正文、摘要和证据引用。后续章节只读取相关材料及前序摘要，避免长文档因上下文限制中断或前后矛盾。</p><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{progress.formalDocument.sections.map((section, index) => <div key={section.sectionKey} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-accent1">{String(index + 1).padStart(2, "0")}</span><SectionStatus status={section.status} waiting={Boolean(section.nextAttemptAt)} /></div><h3 className="mt-3 text-sm font-bold text-primary">{section.title}</h3>{section.summary && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{section.summary}</p>}</div>)}</div></section>}
      {progress.consistency && <section className={`mt-7 rounded-3xl border p-7 sm:p-9 ${progress.consistency.status === "pass" ? "border-emerald-100 bg-emerald-50/40" : "border-amber-200 bg-amber-50/50"}`}><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className={`text-sm font-semibold ${progress.consistency.status === "pass" ? "text-emerald-700" : "text-amber-700"}`}>跨成果一致性检查</p><h2 className="mt-2 text-xl font-bold text-primary">{progress.consistency.status === "pass" ? "编号与引用关系检查通过" : "系统正在修复编号或引用关系"}</h2><p className="mt-3 text-sm leading-7 text-slate-500">已核对 {progress.consistency.metrics.totalItems} 个结构化对象。覆盖率不足会保留为明确提示，不会用虚构关系自动补齐。</p></div><div className="grid grid-cols-3 gap-2 text-center"><CoverageMetric label="需求→功能" value={progress.consistency.metrics.requirementFeatureCoverage} /><CoverageMetric label="功能→估算" value={progress.consistency.metrics.featureEstimationCoverage} /><CoverageMetric label="估算→计划" value={progress.consistency.metrics.estimationPlanCoverage} /></div></div>{progress.consistency.issues.length > 0 && <div className="mt-5 grid gap-2 sm:grid-cols-2">{progress.consistency.issues.slice(0, 6).map((issue, index) => <p key={`${issue.code}-${index}`} className="rounded-xl bg-white/80 px-4 py-3 text-xs leading-5 text-slate-600">{issue.message}</p>)}</div>}</section>}
      {progress.deliverableOutcomes && <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-7 sm:p-9"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-accent1">七类交付成果</p><h2 className="mt-2 text-2xl font-bold text-primary">每类成果独立形成，多种格式归入同一成果</h2><p className="mt-3 text-sm leading-7 text-slate-500">成果数量按内容类型计算，不按 Word、Excel、PPT 或 PDF 文件数量重复计算。</p></div><span className="h-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-accent1">{progress.deliverableOutcomes.filter((item) => item.status === "available").length} / 7 已可下载</span></div><div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{progress.deliverableOutcomes.map((outcome, index) => <div key={outcome.key} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm font-bold text-accent1">{index + 1}</span><div><p className="text-[11px] font-bold text-slate-400">{outcome.code}</p><h3 className="font-bold text-primary">{outcome.title}</h3></div></div><OutcomeStatus status={outcome.status} /></div><p className="mt-4 text-sm leading-6 text-slate-500">{outcome.description}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-accent1 transition-all" style={{ width: `${outcome.totalDependencies ? (outcome.completedDependencies / outcome.totalDependencies) * 100 : 0}%` }} /></div><p className="mt-2 text-xs text-slate-400">内容依据 {outcome.completedDependencies} / {outcome.totalDependencies} 已校验</p>{outcome.files.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{outcome.files.map((file) => <DownloadButton key={file.id} endpoint={productApi.createDeliverableDownload(solutionId, file.id)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-50 hover:text-accent1">下载 {artifactFormat(file)}</DownloadButton>)}</div>}</div>)}</div></section>}
      {progress.deliverables?.length > 0 && <section className="mt-7 rounded-3xl border border-emerald-100 bg-white p-7 shadow-[0_18px_55px_rgba(15,118,110,.08)] sm:p-9"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-emerald-700">交付成果</p><h2 className="mt-2 text-2xl font-bold text-primary">首批成果已经可以使用</h2><p className="mt-3 text-sm leading-7 text-slate-500">每份文件均经过格式和章节完整性检查，仅当前账号可以下载。</p></div><span className="h-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">已完成 {progress.deliverables.length} 份</span></div><div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3"><PackageDownloadButton endpoint={productApi.deliverablePackage(solutionId, "client")} label="客户交付包" className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800" /><PackageDownloadButton endpoint={productApi.deliverablePackage(solutionId, "internal")} label="内部评审包" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-primary transition hover:border-blue-200 hover:text-accent1" /><PackageDownloadButton endpoint={productApi.deliverablePackage(solutionId, "archive")} label="完整归档包" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-primary transition hover:border-blue-200 hover:text-accent1" /><span className="text-xs text-slate-400">打包不调用模型</span></div><div className="mt-6 space-y-3">{progress.deliverables.map((artifact) => <div key={artifact.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-primary">{artifact.displayName}</h3>{artifact.contentVersion && artifact.renderVersion && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">V{artifact.contentVersion}.R{artifact.renderVersion}</span>}</div><p className="mt-1.5 text-xs text-slate-400">{artifactFormat(artifact)} · {formatBytes(artifact.sizeBytes)} · 已校验</p></div><DownloadButton endpoint={productApi.createDeliverableDownload(solutionId, artifact.id)} className="rounded-full bg-accent1 px-5 py-2.5 text-center text-sm font-bold text-white transition hover:bg-blue-600">下载成果</DownloadButton></div>{Boolean(artifact.historyCount) && <ArtifactHistory solutionId={solutionId} artifact={artifact} />}</div>)}</div></section>}
      {progress.formalDocument && <QuoteParameterEditor solutionId={solutionId} onUpdated={refreshAfterModelRevision} />}
      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-9"><h2 className="text-xl font-bold text-primary">成果形成进度</h2><div className="mt-8">
          {stages.map(([id, title, description], index) => { const done = index < currentIndex || progress.stage === "completed"; const current = index === currentIndex && progress.stage !== "completed"; return <div key={id} className="relative grid grid-cols-[40px_1fr] gap-4 pb-9 last:pb-0"><div className={`relative z-10 grid h-10 w-10 place-items-center rounded-full border-2 text-sm font-bold ${done ? "border-accent1 bg-accent1 text-white" : current ? "border-accent1 bg-blue-50 text-accent1" : "border-slate-200 bg-white text-slate-400"}`}>{done ? "✓" : index + 1}</div>{index < stages.length - 1 && <span className={`absolute left-[19px] top-10 h-[calc(100%-40px)] w-0.5 ${done ? "bg-accent1" : "bg-slate-200"}`} />}<div className="pt-1"><h3 className={`font-bold ${current || done ? "text-primary" : "text-slate-400"}`}>{title}{current && <span className="ml-3 rounded-full bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700">进行中</span>}</h3><p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p></div></div>; })}
        </div></section>
        <aside className="rounded-3xl border border-slate-200 bg-white p-7"><h2 className="text-xl font-bold text-primary">已接收材料</h2><p className="mt-2 text-sm text-slate-500">系统只显示属于当前账号的文件。</p><div className="mt-6 space-y-3">{progress.files.length ? progress.files.map((file) => <div key={file.id} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><p className="break-all text-sm font-semibold text-primary">{file.displayName}</p><span className={`shrink-0 text-xs font-semibold ${file.templateStatus === "fallback" ? "text-amber-600" : "text-emerald-600"}`}>{file.category === "template" && file.templateStatus ? file.templateStatus === "fallback" ? "已回退" : file.templateStatus === "theme_applied" ? "主题已应用" : "已识别" : file.status === "uploaded" ? "已接收" : "待上传"}</span></div><p className="mt-2 text-xs uppercase text-slate-400">{fileCategory(file.category)} · {file.detectedFormat || "等待识别"}</p>{file.category === "template" && file.templateNotice && <p className="mt-2 text-xs leading-5 text-slate-500">{file.templateNotice}</p>}</div>) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">本次通过文字说明开始，没有上传附件。</p>}</div></aside>
      </div>
      <ProjectModelEditor solutionId={solutionId} onExecuted={refreshAfterModelRevision} />
    </div>
  </main>;
}

function Message({ title, action, href }: { title: string; action: string; href: string }) { return <main className="grid min-h-screen place-items-center bg-primary p-6"><div className="rounded-3xl bg-white p-10 text-center"><h1 className="text-2xl font-bold text-primary">{title}</h1><Link href={href} className="mt-6 inline-block rounded-full bg-accent1 px-6 py-3 font-bold text-white">{action}</Link></div></main>; }
function RecoveryNotice({ recovery }: { recovery: Recovery }) {
  const cooling = recovery.state === "cooldown";
  return <section className={`mt-7 rounded-3xl border p-6 sm:p-7 ${cooling ? "border-amber-200 bg-amber-50/80" : "border-blue-200 bg-blue-50/80"}`}><div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${cooling ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-accent1"}`}>↻</span><div><p className={`text-xs font-bold tracking-wide ${cooling ? "text-amber-700" : "text-accent1"}`}>{recovery.stageLabel}</p><h2 className="mt-1 text-lg font-bold text-primary">{recovery.headline}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{recovery.message}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-500"><span>本轮尝试 {Math.min(recovery.attemptCount, recovery.maxAttempts)} / {recovery.maxAttempts} 次</span><span>{recovery.nextRetryAt ? `下次自动尝试：${formatRetryTime(recovery.nextRetryAt)}` : "所需能力恢复后立即继续"}</span></div><p className="mt-3 text-xs text-slate-400">无需停留在此页面，也无需重新提交材料。</p></div></div></section>;
}
function SectionStatus({ status, waiting }: { status: string; waiting: boolean }) {
  const label = status === "validated" ? "已校验" : status === "generating" ? "生成中" : status === "failed" ? "自动修复中" : waiting ? "等待重试" : "待生成";
  const color = status === "validated" ? "text-emerald-600" : status === "generating" ? "text-accent1" : status === "failed" || waiting ? "text-amber-600" : "text-slate-400";
  return <span className={`text-xs font-semibold ${color}`}>{label}</span>;
}
function formatRetryTime(value: string) { return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }); }
function AnalysisList({ title, items }: { title: string; items: string[] }) { return <div className="bg-primary p-7"><h3 className="font-bold text-white">{title}</h3><ul className="mt-4 space-y-3">{items.length ? items.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-slate-300"><span className="text-accent2">•</span><span>{item}</span></li>) : <li className="text-sm text-slate-400">暂未识别</li>}</ul></div>; }
function OutcomeStatus({ status }: { status: DeliverableOutcome["status"] }) {
  const labels = { waiting: "待形成", forming: "形成中", content_ready: "内容已就绪", available: "可下载", failed: "自动恢复中" };
  const colors = { waiting: "bg-slate-100 text-slate-500", forming: "bg-blue-50 text-accent1", content_ready: "bg-cyan-50 text-cyan-700", available: "bg-emerald-50 text-emerald-700", failed: "bg-amber-50 text-amber-700" };
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${colors[status]}`}>{labels[status]}</span>;
}
function CoverageMetric({ label, value }: { label: string; value: number | null }) { return <div className="min-w-[84px] rounded-xl bg-white px-3 py-3"><p className="text-base font-bold text-primary">{value == null ? "—" : `${Math.round(value * 100)}%`}</p><p className="mt-1 text-[10px] text-slate-400">{label}</p></div>; }
function KnowledgeMetric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xl font-bold text-primary">{value}</p><p className="mt-1 text-xs text-slate-400">{label}</p></div>; }
function ArtifactHistory({ solutionId, artifact }: { solutionId: string; artifact: DeliverableFile }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Array<{ versionId: string; displayName: string; sizeBytes: number; contentVersion: number; renderVersion: number; archivedAt: string }> | null>(null);
  const [failed, setFailed] = useState(false);
  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (versions || failed) return;
    const response = await fetch(productApi.deliverableVersions(solutionId, artifact.id));
    if (!response.ok) { setFailed(true); return; }
    setVersions((await response.json()).data.history);
  };
  return <div className="mt-4 border-t border-slate-100 pt-3"><button type="button" onClick={toggle} className="text-xs font-semibold text-slate-500 hover:text-accent1">{open ? "收起历史版本" : `查看历史版本（${artifact.historyCount}）`}</button>{open && <div className="mt-3 space-y-2">{failed ? <p className="text-xs text-amber-600">历史版本暂时无法读取，请稍后重试。</p> : versions ? versions.map((version) => <div key={version.versionId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"><div><p className="text-xs font-bold text-primary">V{version.contentVersion}.R{version.renderVersion}</p><p className="mt-1 text-[11px] text-slate-400">{formatBytes(version.sizeBytes)} · {new Date(version.archivedAt).toLocaleString("zh-CN")}</p></div><DownloadButton endpoint={productApi.createDeliverableVersionDownload(solutionId, artifact.id, version.versionId)} className="text-xs font-bold text-accent1">下载此版本</DownloadButton></div>) : <p className="text-xs text-slate-400">正在读取版本记录…</p>}</div>}</div>;
}

function DownloadButton({ endpoint, className, children }: { endpoint: string; className: string; children: React.ReactNode }) {
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const download = async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload?.data?.url) throw new Error(payload?.error?.code || "DOWNLOAD_LINK_FAILED");
      const link = document.createElement("a");
      link.href = payload.data.url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setState("idle");
    } catch {
      setState("failed");
    }
  };
  return <button type="button" onClick={download} disabled={state === "loading"} className={`${className} disabled:cursor-wait disabled:opacity-60`}>{state === "loading" ? "正在获取链接…" : state === "failed" ? "重试下载" : children}</button>;
}
function PackageDownloadButton({ endpoint, label, className }: { endpoint: string; label: string; className: string }) {
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const [notice, setNotice] = useState("");
  const download = async () => {
    if (state === "loading") return;
    setState("loading"); setNotice("");
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || "当前交付包暂时无法生成，请稍后重试。");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = `${label}.zip`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
      setState("idle");
    } catch (error) {
      setState("failed"); setNotice(error instanceof Error ? error.message : "当前交付包暂时无法生成，请稍后重试。");
    }
  };
  return <span className="inline-flex items-center gap-2"><button type="button" onClick={download} disabled={state === "loading"} className={`${className} disabled:cursor-wait disabled:opacity-60`}>{state === "loading" ? "正在打包…" : state === "failed" ? "重试下载" : label}</button>{notice && <span className="max-w-[260px] text-xs text-amber-700">{notice}</span>}</span>;
}
function formatBytes(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }
function artifactFormat(artifact: Progress["deliverables"][number]) {
  if (artifact.mimeType.includes("spreadsheet") || artifact.artifactType.endsWith("_xlsx")) return "Excel 工作簿";
  if (artifact.mimeType.includes("presentation") || artifact.artifactType.endsWith("_pptx")) return "PowerPoint 演示文稿";
  if (artifact.mimeType === "application/pdf" || artifact.artifactType.endsWith("_pdf")) return "PDF 文档";
  return "Word 文档";
}
function fileCategory(category: string) {
  return category === "template" ? "企业模板" : category === "brand" ? "品牌素材" : "项目材料";
}
