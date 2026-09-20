"use client";

import { useEffect, useMemo, useState } from "react";
import { productApi } from "../../../../lib/product/api-contract";

type ProjectModelState = {
  active: { snapshotId: string; version: number; model: Record<string, any> } | null;
  candidates: Array<{ snapshotId: string; version: number; model: Record<string, any> }>;
  versions: Array<{ snapshotId: string; version: number; status: string; parentSnapshotId: string | null; createdAt: string; activatedAt: string | null }>;
  entities: Array<{ entityKey: string; entityKind: string; title: string; modelLocked: number; userLocked: number }>;
};
type ImpactPreview = {
  id: string;
  status: string;
  plan: { actionClass: string; conflicts: Array<{ lockedTarget: string; code: string }>; impactedTargets: Array<{ id: string; action: string }> };
  sectionTargets: Array<{ sectionKey: string; entityKeys: string[] }>;
  relatedConflicts: Array<{ fromKey: string; toKey: string }>;
};
type ConfirmedFact = { id: string; text: string; status: string; createdAt: string };

const kindNames: Record<string, string> = {
  goal: "项目目标", scope_included: "纳入范围", scope_excluded: "排除范围", scope_future: "后续范围",
  actor: "使用角色", scenario: "业务场景", requirement: "业务需求", feature: "功能", constraint: "约束",
  integration: "系统集成", data_entity: "数据对象", agent_capability: "智能体能力", assumption: "待验证假设",
  conflict: "材料冲突", term: "业务术语",
};
const sectionNames: Record<string, string> = {
  project_overview: "项目背景与目标", scope_users: "范围、用户与约束", requirements: "业务需求与功能规划",
  solution: "整体解决方案", workload: "工作量与成本依据", implementation: "实施计划与交付安排", risks: "风险与待确认事项",
};

export default function ProjectModelEditor({ solutionId, onExecuted }: { solutionId: string; onExecuted: () => void }) {
  const [state, setState] = useState<ProjectModelState | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [candidateSnapshotId, setCandidateSnapshotId] = useState("");
  const [preview, setPreview] = useState<ImpactPreview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftCandidate, setDraftCandidate] = useState<ProjectModelState["candidates"][number] | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState<string | null>(null);
  const [rejectConfirmation, setRejectConfirmation] = useState(false);
  const [confirmedFacts, setConfirmedFacts] = useState<ConfirmedFact[]>([]);
  const [selectedFactIds, setSelectedFactIds] = useState<string[]>([]);

  const selected = state?.entities.find((entity) => entity.entityKey === selectedKey);
  const locked = Boolean(selected?.modelLocked || selected?.userLocked);
  const modelItem = useMemo(() => {
    if (!state?.active?.model || !selected) return null;
    const model = state.active.model;
    const groups: unknown[] = [model.goals, model.actors, model.scenarios, model.requirements, model.features, model.constraints,
      model.integrations, model.dataEntities, model.agentCapabilities, model.assumptions, model.conflicts,
      model.scope?.included, model.scope?.excluded, model.scope?.future];
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      const found = group.find((item: any) => item?.key === selected.entityKey);
      if (found) return found as Record<string, any>;
    }
    if (selected.entityKind === "term") return (model.terms || []).find((item: any) => item.term === selected.title) || null;
    return null;
  }, [state, selected]);

  const load = async () => {
    const response = await fetch(productApi.projectModel(solutionId));
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || payload?.error?.code || "无法读取项目模型");
    const next = payload.data as ProjectModelState;
    setState(next);
    setDraftCandidate(next.candidates?.[0] || null);
    if (!next.entities.some((entity) => entity.entityKey === selectedKey)) setSelectedKey(next.entities[0]?.entityKey || "");
  };

  useEffect(() => {
    let live = true;
    fetch(productApi.projectModel(solutionId)).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!live) return;
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "项目模型暂不可用");
      const next = payload.data as ProjectModelState;
      setState(next);
      setDraftCandidate(next.candidates?.[0] || null);
      setSelectedKey(next.entities[0]?.entityKey || "");
    }).catch((error) => { if (live) setNotice(error instanceof Error ? error.message : "项目模型暂不可用"); });
    return () => { live = false; };
  }, [solutionId]);

  useEffect(() => {
    let live = true;
    fetch(productApi.understanding(solutionId)).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (live && response.ok && payload?.success) setConfirmedFacts((payload.data?.userFacts || []).filter((fact: ConfirmedFact) => fact.status === "active"));
    }).catch(() => { if (live) setConfirmedFacts([]); });
    return () => { live = false; };
  }, [solutionId]);

  useEffect(() => {
    if (!selected || !modelItem) return;
    const primaryKey = selected.entityKind === "term" ? "definition" : selected.entityKind === "conflict" ? "summary" : selected.entityKind === "assumption" ? "description" : "title";
    setPrimaryText(String(modelItem[primaryKey] || ""));
    setDescription(selected.entityKind === "term" || selected.entityKind === "conflict" ? "" : String(modelItem.description || ""));
    const activeFactIds = new Set(confirmedFacts.map((fact) => fact.id));
    setSelectedFactIds((modelItem.sourceRefs || []).filter((ref: any) => ref.kind === "user_decision" && activeFactIds.has(ref.refId)).map((ref: any) => ref.refId));
    setPreview(null); setCandidateSnapshotId(""); setAccepted(false); setNotice("");
  }, [selectedKey, state?.active?.snapshotId, confirmedFacts]);

  const primaryLabel = selected?.entityKind === "term" ? "定义" : selected?.entityKind === "conflict" ? "冲突描述" : selected?.entityKind === "assumption" ? "假设内容" : "名称";
  const saveAndPreview = async () => {
    if (!state?.active || !selected || !modelItem || busy || locked) return;
    setBusy(true); setNotice("");
    try {
      const patch: Record<string, any> = selected.entityKind === "term" ? { definition: primaryText.trim() }
        : selected.entityKind === "conflict" ? { summary: primaryText.trim() }
          : selected.entityKind === "assumption" ? { description: primaryText.trim() }
            : { title: primaryText.trim(), description: description.trim() };
      if (factSelectionChanged) {
        const existingRefs = Array.isArray(modelItem.sourceRefs) ? modelItem.sourceRefs : [];
        patch.sourceRefs = [...existingRefs.filter((ref: any) => ref.kind === "source_block"), ...selectedFactIds.map((refId) => ({ kind: "user_decision", refId, role: "supports" }))];
      }
      const candidateResponse = await fetch(productApi.projectModelEntityRevision(solutionId, selected.entityKey), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseSnapshotId: state.active.snapshotId, patch }),
      });
      const candidatePayload = await candidateResponse.json().catch(() => null);
      if (!candidateResponse.ok || !candidatePayload?.success) throw new Error(readableRevisionError(candidatePayload?.error?.code, "无法保存模型候选"));
      const nextCandidateId = candidatePayload.data.snapshotId as string;
      setCandidateSnapshotId(nextCandidateId);
      const impactResponse = await fetch(productApi.projectModelImpact(solutionId), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerType: "requirement_change", directTargets: [selected.entityKey] }),
      });
      const impactPayload = await impactResponse.json().catch(() => null);
      if (!impactResponse.ok || !impactPayload?.success) throw new Error(readableRevisionError(impactPayload?.error?.code, "无法计算影响范围"));
      setPreview(impactPayload.data as ImpactPreview);
      setNotice(impactPayload.data.status === "blocked" ? "影响范围触及锁定内容；请先处理锁定冲突，候选尚未应用。" : "候选已准备好。请核对将重新形成的章节，再确认执行。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法生成修订预览");
    } finally { setBusy(false); }
  };

  const confirmAndExecute = async () => {
    if (!preview || !candidateSnapshotId || busy || preview.status !== "planned") return;
    setBusy(true); setNotice("");
    try {
      if (!accepted) {
        const acceptResponse = await fetch(productApi.acceptProjectModelImpact(solutionId, preview.id), { method: "POST" });
        const acceptPayload = await acceptResponse.json().catch(() => null);
        if (!acceptResponse.ok || !acceptPayload?.success) throw new Error(readableRevisionError(acceptPayload?.error?.code, "计划确认失败"));
        setAccepted(true);
      }
      const executeResponse = await fetch(productApi.executeProjectModelImpact(solutionId, preview.id), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateSnapshotId }),
      });
      const executePayload = await executeResponse.json().catch(() => null);
      if (!executeResponse.ok || !executePayload?.success) throw new Error(readableRevisionError(executePayload?.error?.code, "章节重建未能启动"));
      setNotice("修订已开始。受影响章节会重新形成，其他章节保持当前版本。");
      setPreview(null); setCandidateSnapshotId(""); setAccepted(false);
      await load(); onExecuted();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法执行此项修订");
    } finally { setBusy(false); }
  };

  const createInitialDraft = async () => {
    if (drafting || busy) return;
    setDrafting(true); setNotice("");
    try {
      const response = await fetch(productApi.projectModelDraft(solutionId), { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(readableRevisionError(payload?.error?.code, "暂时无法生成模型候选"));
      setDraftCandidate(payload.data as ProjectModelState["candidates"][number]);
      setNotice("候选已生成。请核对项目目标、范围和需求，再决定是否启用。");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "暂时无法生成模型候选"); }
    finally { setDrafting(false); }
  };

  const createRevisionDraft = async () => {
    if (drafting || busy) return;
    setDrafting(true); setNotice("");
    try {
      const response = await fetch(productApi.projectModelRevise(solutionId), { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(readableRevisionError(payload?.error?.code, "暂时无法根据最新事实生成候选"));
      setDraftCandidate(payload.data as ProjectModelState["candidates"][number]);
      setNotice("新的项目模型候选已生成。请核对变化后，再决定是否启用并重建正式章节。");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "暂时无法生成修订候选"); }
    finally { setDrafting(false); }
  };

  const activateInitialDraft = async () => {
    if (!draftCandidate || busy || drafting) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(productApi.activateProjectModel(solutionId, draftCandidate.snapshotId), { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(readableRevisionError(payload?.error?.code, "启用项目模型失败"));
      setDraftCandidate(null);
      setNotice(payload.data?.queuedFormalRebuild ? "项目模型已启用，正式章节已重新排入生成队列。" : "项目模型已启用。");
      await load(); onExecuted();
    } catch (error) { setNotice(error instanceof Error ? error.message : "启用项目模型失败"); }
    finally { setBusy(false); }
  };

  const rejectDraft = async () => {
    if (!draftCandidate || busy || drafting) return;
    if (!rejectConfirmation) { setRejectConfirmation(true); return; }
    setBusy(true); setNotice("");
    try {
      const response = await fetch(productApi.rejectProjectModel(solutionId, draftCandidate.snapshotId), { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(readableRevisionError(payload?.error?.code, "无法放弃此候选"));
      setDraftCandidate(null); setRejectConfirmation(false); setNotice("候选已放弃，当前活动模型和正式成果未改变。");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法放弃此候选"); }
    finally { setBusy(false); }
  };

  const restoreVersion = async (snapshotId: string) => {
    if (busy || !state?.active) return;
    if (restoreConfirmation !== snapshotId) {
      setRestoreConfirmation(snapshotId);
      return;
    }
    setBusy(true); setNotice("");
    try {
      const response = await fetch(productApi.activateProjectModel(solutionId, snapshotId), { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(readableRevisionError(payload?.error?.code, "恢复项目版本失败"));
      setRestoreConfirmation(null);
      setNotice(payload.data?.queuedFormalRebuild ? "历史版本已恢复；正式章节已全部排入重建，旧交付文件保留在历史记录中。" : "历史项目模型版本已恢复。");
      await load(); onExecuted();
    } catch (error) { setNotice(error instanceof Error ? error.message : "恢复项目版本失败"); }
    finally { setBusy(false); }
  };

  const draftCounts: Array<[string, number]> = draftCandidate ? [
    ["需求", draftCandidate.model.requirements?.length || 0], ["功能", draftCandidate.model.features?.length || 0],
    ["范围项", (draftCandidate.model.scope?.included?.length || 0) + (draftCandidate.model.scope?.excluded?.length || 0)],
    ["待核冲突", draftCandidate.model.conflicts?.length || 0],
  ] : [];
  const candidateChanges = draftCandidate && state?.active ? summarizeModelChanges(state.active.model, draftCandidate.model) : [];
  const selectedEntityFactIds = (modelItem?.sourceRefs || []).filter((ref: any) => ref.kind === "user_decision" && confirmedFacts.some((fact) => fact.id === ref.refId)).map((ref: any) => ref.refId).sort();
  const factSelectionChanged = JSON.stringify([...selectedFactIds].sort()) !== JSON.stringify(selectedEntityFactIds);

  return <section className="mt-7 overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-[0_18px_55px_rgba(8,47,73,.06)]">
    <div className="grid gap-0 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,.92fr)]">
      <div className="border-b border-slate-100 p-6 sm:p-8 lg:border-b-0 lg:border-r">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-cyan-700">项目模型 · 可追溯修订</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-2xl font-bold tracking-tight text-primary">{state?.active ? "调整一条已确认内容" : "建立项目模型"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{state?.active ? "每次修改先形成候选，再展示将受影响的章节；确认后只重建这些章节。" : "从已确认材料整理项目模型，核对无误后再启用。"}</p></div>
          {state?.active && <span className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800">活动版本 v{state.active.version}</span>}
        </div>
        {!state?.active ? <div className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
          {!draftCandidate ? <><p>项目模型尚未建立。系统会根据已确认的材料事实生成可追溯的候选模型；结果不会自动生效，须经你核对确认。</p><button type="button" onClick={createInitialDraft} disabled={drafting || busy} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-[#123d5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:opacity-50">{drafting ? "正在整理已确认材料…" : "生成初始模型候选"}</button></> : <>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-wide text-cyan-800">待确认 · 候选 v{draftCandidate.version}</p><h3 className="mt-1 text-lg font-bold text-primary">{draftCandidate.model.identity?.displayName || "项目模型"}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{draftCandidate.model.identity?.primaryPurpose}</p></div><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">尚未启用</span></div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{draftCounts.map(([label, count]) => <div key={label} className="rounded-xl border border-white bg-white px-3 py-2"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-primary">{count}</p></div>)}</div>
            {(draftCandidate.model.goals || []).length > 0 && <div className="mt-4 rounded-xl border border-white bg-white p-4"><p className="text-xs font-bold text-slate-700">项目目标</p><ul className="mt-2 space-y-1.5">{draftCandidate.model.goals.slice(0, 4).map((goal: any) => <li key={goal.key} className="text-sm leading-6 text-slate-600">{goal.title}：{goal.description}</li>)}</ul></div>}
            {(draftCandidate.model.requirements || []).length > 0 && <div className="mt-3 rounded-xl border border-white bg-white p-4"><p className="text-xs font-bold text-slate-700">核心需求（最多展示 5 项）</p><ul className="mt-2 space-y-1.5">{draftCandidate.model.requirements.slice(0, 5).map((item: any) => <li key={item.key} className="text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-700">{item.title}</span>：{item.description}</li>)}</ul></div>}
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={activateInitialDraft} disabled={busy || drafting} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 disabled:opacity-50">{busy ? "正在启用…" : "确认模型并启用"}</button><button type="button" onClick={createInitialDraft} disabled={drafting || busy} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{drafting ? "正在重新生成…" : "重新生成候选"}</button><button type="button" onClick={rejectDraft} disabled={drafting || busy} className={`rounded-xl px-4 py-2 text-xs font-semibold ${rejectConfirmation ? "bg-rose-600 text-white hover:bg-rose-700" : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"}`}>{rejectConfirmation ? "确认放弃" : "放弃候选"}</button>{rejectConfirmation && <button type="button" onClick={() => setRejectConfirmation(false)} disabled={busy} className="rounded-xl px-3 py-2 text-xs text-slate-500 hover:bg-white">取消</button>}</div>
          </>}
        </div> : <>
          <div className="mt-7 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm leading-6 text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-primary">材料事实有更新？</p><p className="mt-1 text-xs text-slate-600">根据最新已确认事实生成新的模型候选。候选不会自动替换当前版本。</p></div><button type="button" onClick={createRevisionDraft} disabled={drafting || busy} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-cyan-700 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-800 disabled:opacity-50">{drafting ? "正在重新整理…" : "根据最新事实生成候选"}</button></div>
          </div>
          {draftCandidate && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-slate-700"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-amber-900">待确认的修订候选 v{draftCandidate.version}</p><p className="mt-1 text-xs text-amber-800">需求 {draftCandidate.model.requirements?.length || 0} 项，功能 {draftCandidate.model.features?.length || 0} 项，启用后将重建全部正式章节。</p></div><div className="flex gap-2"><button type="button" onClick={activateInitialDraft} disabled={busy || drafting} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50">{busy ? "正在启用…" : "确认启用候选"}</button><button type="button" onClick={createRevisionDraft} disabled={drafting || busy} className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50">重新生成</button><button type="button" onClick={rejectDraft} disabled={drafting || busy} className={`rounded-xl px-3 py-2 text-xs font-semibold ${rejectConfirmation ? "bg-rose-600 text-white" : "border border-rose-200 bg-white text-rose-700"}`}>{rejectConfirmation ? "确认放弃" : "放弃候选"}</button></div></div>{candidateChanges.length > 0 ? <div className="mt-3 rounded-xl border border-amber-200/80 bg-white/70 p-3"><p className="text-xs font-bold text-amber-900">相对当前版本的变化（最多展示 8 项）</p>{candidateChanges.slice(0, 8).map((change) => <p key={`${change.kind}-${change.key}`} className="mt-1.5 text-xs text-amber-900"><span className={`mr-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${change.kind === "新增" ? "bg-emerald-100 text-emerald-800" : change.kind === "删除" ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"}`}>{change.kind}</span>{change.key} · {change.title}</p>)}</div> : <p className="mt-3 text-xs text-amber-800">候选与当前模型没有检测到实体内容变化，但仍会按模型版本切换规则重建正式章节。</p>}</div>}
          <div className="mt-7 grid gap-5 md:grid-cols-[minmax(180px,.8fr)_minmax(0,1.2fr)]">
          <div className="max-h-[420px] space-y-1 overflow-auto pr-1" aria-label="项目模型实体">
            {state.entities.map((entity) => <button key={entity.entityKey} type="button" onClick={() => setSelectedKey(entity.entityKey)} className={`group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${selectedKey === entity.entityKey ? "bg-[#e8f7f5] text-primary" : "text-slate-600 hover:bg-slate-50"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${entity.modelLocked || entity.userLocked ? "bg-amber-500" : "bg-cyan-600"}`} />
              <span className="min-w-0"><span className="block text-[10px] font-bold tracking-wide text-slate-400">{kindNames[entity.entityKind] || entity.entityKind}</span><span className="mt-1 block truncate text-sm font-semibold">{entity.title}</span></span>
              {(entity.modelLocked || entity.userLocked) && <span className="ml-auto mt-1 text-[10px] font-semibold text-amber-700">已锁定</span>}
            </button>)}
            {!state.entities.length && <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">此版本暂时没有可编辑的实体。</p>}
          </div>
          {selected && modelItem ? <div className="min-w-0 rounded-2xl bg-[#f7fafb] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">{kindNames[selected.entityKind] || selected.entityKind}</p><h3 className="mt-1 text-base font-bold text-primary">{selected.title}</h3></div>{locked && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">锁定保护</span>}</div>
            <label className="mt-5 block text-xs font-semibold text-slate-600">{primaryLabel}<input value={primaryText} onChange={(event) => setPrimaryText(event.target.value)} disabled={locked || busy} maxLength={1200} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100" /></label>
            {selected.entityKind !== "term" && selected.entityKind !== "conflict" && selected.entityKind !== "assumption" && <label className="mt-4 block text-xs font-semibold text-slate-600">具体说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={locked || busy} maxLength={3000} rows={4} className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100" /></label>}
            {confirmedFacts.length > 0 && <fieldset className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><legend className="px-1 text-xs font-semibold text-slate-600">关联已确认事实（可选）</legend><p className="mb-2 text-[11px] leading-5 text-slate-500">勾选表示该事实支持当前实体；事实不会自动改写名称或说明，请按需同步编辑上方内容。</p><div className="max-h-40 space-y-2 overflow-auto">{confirmedFacts.slice(0, 30).map((fact) => <label key={fact.id} className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" className="mt-1 accent-cyan-700" disabled={locked || busy} checked={selectedFactIds.includes(fact.id)} onChange={(event) => setSelectedFactIds((current) => event.target.checked ? [...new Set([...current, fact.id])] : current.filter((id) => id !== fact.id))} /><span>{fact.text}</span></label>)}</div>{confirmedFacts.length > 30 && <p className="mt-2 text-[10px] text-slate-400">仅显示最近 30 条确认事实。</p>}</fieldset>}
            <button type="button" onClick={saveAndPreview} disabled={busy || locked || !primaryText.trim() || (!factSelectionChanged && primaryText === (selected.entityKind === "term" ? modelItem.definition : selected.entityKind === "conflict" ? modelItem.summary : selected.entityKind === "assumption" ? modelItem.description : modelItem.title) && description === (modelItem.description || ""))} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-[#123d5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "正在生成预览…" : "保存候选并查看影响"}</button>
          </div> : <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">选择一条内容后开始修订</div>}
          </div>
        </>}
        {notice && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm leading-6 ${preview?.status === "blocked" || notice.includes("失败") || notice.includes("未能") ? "bg-amber-50 text-amber-800" : "bg-cyan-50 text-cyan-900"}`}>{notice}</p>}
      </div>
      <aside className="relative overflow-hidden bg-[#f3f8f8] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border border-cyan-100" /><div className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full border border-cyan-100" />
        <div className="relative"><p className="text-xs font-bold uppercase tracking-[.16em] text-cyan-800">影响预览</p><h3 className="mt-2 text-lg font-bold text-primary">先看清楚，再决定</h3>
          {!preview ? <div className="mt-6 rounded-2xl border border-white bg-white/80 p-5"><p className="text-sm font-semibold text-slate-700">这里会列出重新形成的章节</p><p className="mt-2 text-xs leading-5 text-slate-500">只有确认后才会切换项目版本并排入后台。旧文件会保留在历史版本中。</p></div> : <>
            <div className="mt-5 flex items-center gap-2"><span className="h-px flex-1 bg-cyan-200"/><span className="text-[10px] font-bold tracking-wider text-cyan-800">{preview.sectionTargets.length} 个章节范围</span><span className="h-px flex-1 bg-cyan-200"/></div>
            <div className="mt-4 space-y-2">{preview.sectionTargets.map((target) => <div key={target.sectionKey} className="flex items-center justify-between gap-3 rounded-xl border border-white bg-white px-3 py-2.5 shadow-sm"><span className="text-xs font-semibold text-slate-700">{sectionNames[target.sectionKey] || target.sectionKey}</span><span className="text-[10px] text-slate-400">{target.entityKeys.length} 项关联</span></div>)}</div>
            {preview.plan.conflicts.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-800">修订碰到锁定内容，暂不能执行</p><ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900">{preview.plan.conflicts.map((conflict, index) => <li key={`${conflict.lockedTarget}-${index}`}>锁定项：{conflict.lockedTarget}</li>)}</ul></div>}
            {preview.relatedConflicts.length > 0 && <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs leading-5 text-rose-800">关系图中存在冲突关联，需同时复核相关内容。</div>}
            <button type="button" onClick={confirmAndExecute} disabled={busy || preview.status !== "planned"} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "正在启动修订…" : accepted ? "继续启动章节重建" : "确认并重建这些章节"}</button>
          </>}
          <p className="mt-5 text-[11px] leading-5 text-slate-500">项目模型作为可追溯底稿；改动只影响列出的章节。若关系或锁定状态有变化，系统会要求重新生成预览。</p>
        </div>
      </aside>
    </div>
    {state?.active && state.versions.length > 1 && <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-bold text-primary">项目模型版本记录</h3><p className="mt-1 text-xs leading-5 text-slate-500">恢复历史版本会替换当前活动模型，并重新形成全部正式章节；历史交付文件不会删除。</p></div><span className="text-xs text-slate-400">保留 {state.versions.length} 个版本</span></div>
      <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
        {state.versions.map((version) => <div key={version.snapshotId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${version.status === "active" ? "bg-cyan-50 text-cyan-800" : version.status === "candidate" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{version.status === "active" ? "当前使用" : version.status === "candidate" ? "待确认" : "历史版本"}</span><div><p className="text-sm font-semibold text-slate-700">模型版本 v{version.version}</p><p className="text-[11px] text-slate-400">{version.activatedAt ? `启用时间 ${version.activatedAt}` : `创建时间 ${version.createdAt}`}</p></div></div>
          {version.status === "superseded" && <div className="flex items-center gap-2">{restoreConfirmation === version.snapshotId && <span className="text-xs text-amber-800">将重建全部正式章节，确认恢复？</span>}<button type="button" onClick={() => restoreVersion(version.snapshotId)} disabled={busy} className={`rounded-lg px-3 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-50 ${restoreConfirmation === version.snapshotId ? "bg-amber-600 text-white hover:bg-amber-700" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{restoreConfirmation === version.snapshotId ? "确认恢复" : "恢复此版本"}</button>{restoreConfirmation === version.snapshotId && <button type="button" onClick={() => setRestoreConfirmation(null)} className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">取消</button>}</div>}
        </div>)}
      </div>
    </div>}
  </section>;
}

function readableRevisionError(code: string | undefined, fallback: string) {
  const messages: Record<string, string> = {
    PROJECT_MODEL_ENTITY_LOCKED: "这条内容已锁定，不能直接修改。",
    PROJECT_MODEL_BASE_NOT_ACTIVE: "项目版本已变化，请刷新后重新编辑。",
    CHANGE_IMPACT_CANDIDATE_OUTSIDE_PLAN: "候选修改超出了预览范围，请重新生成影响预览。",
    CHANGE_IMPACT_CANDIDATE_NOT_BASED_ON_PLAN: "候选版本与预览所依据的版本不一致，请重新开始修订。",
    CHANGE_IMPACT_PLAN_STALE: "项目版本已变化，请重新计算影响范围。",
    CHANGE_IMPACT_PLAN_BLOCKED: "此修订触及锁定内容，暂时不能执行。",
    CHANGE_IMPACT_PLAN_NOT_EXECUTABLE: "此计划已执行或状态已变化，请重新生成预览。",
    PROJECT_MODEL_KNOWLEDGE_NOT_READY: "材料理解尚未完成，请稍后再试。",
    PROJECT_MODEL_NO_SOURCE_FACTS: "目前没有可用于建模的已确认事实，请先补充材料理解结果。",
    PROJECT_MODEL_PRIMARY_PURPOSE_REQUIRED: "请先补充项目的主要目标，再生成模型候选。",
    PROJECT_MODEL_PROVIDER_NOT_CONFIGURED: "项目模型生成服务尚未配置，请联系管理员。",
    PROJECT_MODEL_OUTSIDE_EXECUTION_WINDOW: "当前不在模型调用时段，请稍后再试。",
    PROJECT_MODEL_DEFERRED_OPERATIONS: "模型调用目前处于维护暂停状态，请稍后再试。",
    PROJECT_MODEL_ALREADY_ACTIVE: "项目模型已建立，请刷新页面查看当前版本。",
    PROJECT_MODEL_UNKNOWN_SOURCE_FACT: "候选中有内容无法追溯到已确认材料，已阻止保存；可重新生成候选。",
    PROJECT_MODEL_USER_FACT_NOT_ACTIVE: "所选确认事实已撤销或失效，请刷新后重新选择。",
    PROJECT_MODEL_SOURCE_NOT_IN_SOLUTION: "来源不属于当前方案，已阻止保存。",
    INVALID_PROJECT_MODEL_REVISION_SOURCE_REFS: "来源选择格式无效，请刷新后重试。",
    PROJECT_MODEL_CANDIDATE_NOT_REJECTABLE: "这个候选已经处理过，无法再次放弃。",
  };
  return (code && messages[code]) || fallback;
}

function summarizeModelChanges(active: Record<string, any>, candidate: Record<string, any>) {
  const groups: Array<[string, string]> = [["goals", "目标"], ["scope", "范围"], ["actors", "角色"], ["scenarios", "场景"], ["requirements", "需求"], ["features", "功能"], ["constraints", "约束"], ["integrations", "集成"], ["dataEntities", "数据对象"], ["agentCapabilities", "智能体能力"], ["assumptions", "假设"], ["conflicts", "冲突"]];
  const changes: Array<{ kind: string; key: string; title: string }> = [];
  for (const [group, label] of groups) {
    const activeItems = group === "scope" ? [...(active.scope?.included || []), ...(active.scope?.excluded || []), ...(active.scope?.future || [])] : (active[group] || []);
    const candidateItems = group === "scope" ? [...(candidate.scope?.included || []), ...(candidate.scope?.excluded || []), ...(candidate.scope?.future || [])] : (candidate[group] || []);
    const before = new Map<string, string>(activeItems.filter((item: any) => item?.key).map((item: any) => [String(item.key), JSON.stringify(item)] as [string, string]));
    const after = new Map<string, { json: string; title: string }>(candidateItems.filter((item: any) => item?.key).map((item: any) => [String(item.key), { json: JSON.stringify(item), title: String(item.title || item.description || item.summary || label) }] as [string, { json: string; title: string }]));
    for (const [key, value] of after) changes.push(...(before.has(key) ? (before.get(key) === value.json ? [] : [{ kind: "修改", key, title: value.title }]) : [{ kind: "新增", key, title: value.title }]));
    for (const [key] of before) if (!after.has(key)) changes.push({ kind: "删除", key, title: label });
  }
  return changes;
}
