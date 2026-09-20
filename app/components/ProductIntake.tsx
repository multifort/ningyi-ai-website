"use client";

import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { productApi, type IntakeValidationError } from "../../lib/product/api-contract";

const purposes = ["客户沟通", "内部立项", "售前方案", "估算报价", "实施规划", "汇报演示"];
const productShapes = ["Web 系统", "管理后台", "小程序", "App", "数据看板", "系统集成", "AI Agent", "暂不确定"];
const goalOptions = ["提升效率", "规范流程", "数据可视化", "降低成本", "辅助决策", "系统建设"];
const deliverables = ["需求分析", "功能清单", "工作量估算", "实施计划", "项目报价", "整体解决方案", "汇报演示"];
const errorCopy: Record<IntakeValidationError, string> = {
  PURPOSE_REQUIRED: "请选择这份方案主要用于什么。",
  DESCRIPTION_OR_CONTENT_FILE_REQUIRED: "请描述要解决的问题，或至少选择一份项目材料。",
};

type Draft = {
  purposePrimary: string;
  organizationName: string;
  industry: string;
  actualUsers: string;
  needDescription: string;
  shapes: string[];
  desiredGoals: string[];
  currentState: string;
  includedScope: string;
  excludedScope: string;
  budget: string;
  timeline: string;
  otherConstraints: string;
};

type FileGroup = "content" | "template" | "brand";
type StoredFile = { name: string; size: number; group: FileGroup };

const emptyDraft: Draft = {
  purposePrimary: "",
  organizationName: "",
  industry: "",
  actualUsers: "",
  needDescription: "",
  shapes: [],
  desiredGoals: [],
  currentState: "",
  includedScope: "",
  excludedScope: "",
  budget: "",
  timeline: "",
  otherConstraints: "",
};

const fileGroups: Array<{ id: FileGroup; title: string; hint: string; accept: string }> = [
  { id: "content", title: "项目材料", hint: "需求、纪要、表格、截图等", accept: ".docx,.pdf,.xlsx,.pptx,.txt,.csv,.json,.png,.jpg,.jpeg,.webp" },
  { id: "template", title: "企业模板", hint: "Word、Excel 或 PPT 模板", accept: ".docx,.xlsx,.pptx" },
  { id: "brand", title: "品牌素材", hint: "Logo、品牌图或字体说明", accept: ".pdf,.png,.jpg,.jpeg,.webp" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function createDraftId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export default function ProductIntake() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [draftId, setDraftId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [files, setFiles] = useState<Record<FileGroup, File[]>>({ content: [], template: [], brand: [] });
  const [lostFiles, setLostFiles] = useState<StoredFile[]>([]);
  const [errors, setErrors] = useState<IntakeValidationError[]>([]);
  const [checking, setChecking] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authWorking, setAuthWorking] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  const [activeSolution, setActiveSolution] = useState<{ id: string; headline: string } | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("ningyi-product-intake-v1");
      if (!stored) {
        setDraftId(createDraftId());
        return;
      }
      const parsed = JSON.parse(stored) as { draftId?: string; draft?: Draft; files?: StoredFile[] };
      setDraftId(parsed.draftId || createDraftId());
      if (parsed.draft) setDraft({ ...emptyDraft, ...parsed.draft });
      if (parsed.files?.length) setLostFiles(parsed.files);
    } catch {
      // A damaged browser draft should never block a fresh start.
      setDraftId(createDraftId());
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    const selected = (Object.entries(files) as Array<[FileGroup, File[]]>).flatMap(([group, items]) =>
      items.map((file) => ({ name: file.name, size: file.size, group }))
    );
    if (!hydrated || !draftId) return;
    window.localStorage.setItem("ningyi-product-intake-v1", JSON.stringify({ draftId, draft, files: selected }));
  }, [draftId, draft, files, hydrated]);

  const completion = useMemo(() => {
    let value = 0;
    if (draft.purposePrimary) value += 1;
    if (draft.organizationName || draft.industry || draft.actualUsers) value += 1;
    if (draft.needDescription.trim() || files.content.length) value += 1;
    if (draft.shapes.length) value += 1;
    if (draft.desiredGoals.length || draft.currentState || draft.includedScope || draft.excludedScope) value += 1;
    if (draft.budget || draft.timeline || draft.otherConstraints || Object.values(files).some((items) => items.length)) value += 1;
    return value;
  }, [draft, files.content.length]);

  const update = (key: keyof Draft, value: string | string[]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors([]);
  };

  const toggleShape = (shape: string) => {
    update("shapes", draft.shapes.includes(shape) ? draft.shapes.filter((item) => item !== shape) : [...draft.shapes, shape]);
  };

  const toggleGoal = (goal: string) => {
    update("desiredGoals", draft.desiredGoals.includes(goal) ? draft.desiredGoals.filter((item) => item !== goal) : [...draft.desiredGoals, goal]);
  };

  const selectFiles = (group: FileGroup, event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    setFiles((current) => ({ ...current, [group]: [...current[group], ...selected] }));
    setLostFiles((current) => current.filter((item) => item.group !== group));
    setErrors([]);
    event.target.value = "";
  };

  const removeFile = (group: FileGroup, index: number) => {
    setFiles((current) => ({ ...current, [group]: current[group].filter((_, itemIndex) => itemIndex !== index) }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setChecking(true);
    setErrors([]);
    try {
      const response = await fetch(productApi.validateIntake, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purposePrimary: draft.purposePrimary || null, needDescription: draft.needDescription, hasSelectedContentFile: files.content.length > 0 }),
      });
      const payload = await response.json();
      const validationErrors = payload?.data?.errors as IntakeValidationError[] | undefined;
      if (!response.ok || validationErrors?.length) {
        setErrors(validationErrors?.length ? validationErrors : ["DESCRIPTION_OR_CONTENT_FILE_REQUIRED"]);
        return;
      }
      setLoginOpen(true);
    } catch {
      setErrors(["DESCRIPTION_OR_CONTENT_FILE_REQUIRED"]);
    } finally {
      setChecking(false);
    }
  };

  const continueLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginNotice("");
    if (authMode === "register" && password !== confirmPassword) {
      setLoginNotice("两次输入的密码不一致，请重新确认。");
      return;
    }
    setAuthWorking(true);
    try {
      const response = await fetch(authMode === "login" ? productApi.login : productApi.register, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setLoginNotice(payload?.error?.message || (authMode === "login" ? "登录失败，请检查后重试。" : "注册失败，请检查后重试。"));
        return;
      }
      setLoginNotice(`已${authMode === "login" ? "登录" : "注册并登录"}。正在保存你的填写内容并准备安全上传。`);
      const selectedFiles = (Object.entries(files) as Array<[FileGroup, File[]]>).flatMap(([group, items]) =>
        items.map((file, index) => ({ clientKey: `${group}:${index}:${file.name}:${file.size}:${file.lastModified}`, category: group, displayName: file.name, sizeBytes: file.size, declaredMime: file.type, file }))
      );
      const handoffResponse = await fetch(productApi.handoffIntake, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          purposePrimary: draft.purposePrimary,
          needDescription: draft.needDescription,
          formData: { organizationName: draft.organizationName, industry: draft.industry, actualUsers: draft.actualUsers, shapes: draft.shapes, desiredGoals: draft.desiredGoals, currentState: draft.currentState, includedScope: draft.includedScope, excludedScope: draft.excludedScope, budget: draft.budget, timeline: draft.timeline, otherConstraints: draft.otherConstraints },
          fileSelections: selectedFiles.map(({ file: _file, ...metadata }) => metadata),
        }),
      });
      const handoff = await handoffResponse.json();
      if (!handoffResponse.ok || !handoff.success) throw new Error(handoff?.error?.message || "HANDOFF_FAILED");
      let uploadFailures = 0;
      for (const upload of handoff.data.uploads as Array<{ clientKey: string; fileId: string; status: string }>) {
        if (upload.status === "uploaded") continue;
        const selected = selectedFiles.find((item) => item.clientKey === upload.clientKey);
        if (!selected) continue;
        setLoginNotice(`正在安全上传 ${selected.displayName}…`);
        const formData = new FormData();
        formData.append("file", selected.file);
        const uploadResponse = await fetch(productApi.upload(handoff.data.solutionId, upload.fileId), { method: "POST", body: formData });
        if (!uploadResponse.ok) uploadFailures += 1;
      }
      if (!uploadFailures) {
        setLoginNotice("材料已经接收，正在识别其中的项目信息…");
        const processResponse = await fetch(productApi.process(handoff.data.solutionId), { method: "POST" });
        if (!processResponse.ok) uploadFailures += 1;
      }
      const progressResponse = await fetch(productApi.progress(handoff.data.solutionId));
      const progress = await progressResponse.json();
      setActiveSolution({ id: handoff.data.solutionId, headline: progress?.data?.headline || "正在理解你提供的信息" });
      setLoginNotice(uploadFailures ? `${uploadFailures} 个文件暂未上传成功，其他内容已经开始处理。` : "填写内容和文件已保存，系统已经自动开始处理。你可以关闭此窗口。 ");
      window.localStorage.removeItem("ningyi-product-intake-v1");
    } catch {
      setLoginNotice("当前无法保存或上传材料，你的填写内容仍保存在浏览器中，请稍后重试。");
    } finally {
      setAuthWorking(false);
    }
  };

  return (
    <section id="start-solution" className="relative overflow-hidden bg-[#f4f7fc] pb-16 pt-8 sm:pb-20 sm:pt-10">
      <div className="absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(circle_at_68%_20%,rgba(50,129,255,.18),transparent_34%),linear-gradient(180deg,#f8fbff_0%,rgba(244,247,252,0)_100%)]" aria-hidden="true" />
      <div className="section-shell relative">
        <div className="relative overflow-hidden rounded-[26px] border border-blue-100 bg-white/72 px-6 py-7 shadow-[0_18px_55px_rgba(34,91,170,.08)] backdrop-blur sm:px-9 sm:py-9">
          <div className="absolute -right-12 -top-24 h-72 w-72 rotate-45 rounded-[52px] border border-blue-200/60 bg-gradient-to-br from-blue-500/15 to-cyan-300/10" aria-hidden="true" />
          <div className="relative max-w-4xl">
            <p className="text-xs font-bold tracking-[0.16em] text-accent1">从问题出发，直接形成成果</p>
            <h1 className="mt-3 max-w-[720px] font-display text-3xl font-bold tracking-[-0.035em] text-primary sm:text-4xl lg:text-[2.7rem]">
              <span className="block leading-[1.22]">说清楚你要解决的问题，</span>
              <span className="mt-0.5 block leading-[1.22] text-accent1 sm:mt-1">剩下的交给我们</span>
            </h1>
            <p className="mt-5 max-w-[820px] text-sm leading-7 text-slate-600 lg:whitespace-nowrap">从业务需求到落地方案，系统会梳理、分析、估算与规划，逐步形成可查看、可下载的交付成果。</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm sm:grid-cols-4">
          {[['目标', '说明方案用途与背景'], ['信息', '描述问题与预期成果'], ['材料', '提供已有文件与资料'], ['成果', '生成方案并开放下载']].map(([title, detail], index) => <div key={title} className="flex items-center gap-3 border-blue-100 px-4 py-4 odd:border-r sm:border-r sm:last:border-r-0"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${index <= Math.min(3, Math.floor(completion / 2)) ? 'bg-blue-50 text-accent1' : 'bg-slate-50 text-slate-400'}`}>{index + 1}</span><div><p className="text-sm font-bold text-primary">{title}</p><p className="mt-0.5 hidden text-xs text-slate-400 lg:block">{detail}</p></div></div>)}
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-blue-100 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center">
          <div className="flex items-center gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-[6px] border-blue-100 bg-white text-sm font-black text-primary">{Math.round(completion / 6 * 100)}%</div><div><p className="text-sm font-bold text-primary">填写进度</p><p className="mt-1 text-xs text-slate-500">已提供 <span className="font-bold text-accent1">{completion} / 6</span> 项</p></div></div>
          <div className="min-w-0 flex-1"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-gradient-to-r from-accent1 to-cyan-400 transition-[width] duration-300" style={{ width: `${completion / 6 * 100}%` }} /></div><p className="mt-2 text-xs leading-5 text-slate-500">最低只需选择方案用途，并描述问题或上传一份项目材料；其他信息可稍后补充。</p></div>
        </div>

        <form onSubmit={submit} className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white px-5 py-2 shadow-[0_22px_65px_rgba(7,27,51,.08)] sm:px-8">
            <span className="absolute bottom-10 left-[35px] top-10 w-px bg-gradient-to-b from-blue-200 via-blue-100 to-transparent sm:left-[47px]" aria-hidden="true" />

            <IntakeStep number="1" title="这份方案主要用来做什么？" required>
              <div className="flex flex-wrap gap-2">{purposes.map((purpose) => <button key={purpose} type="button" onClick={() => update("purposePrimary", purpose)} className={`min-w-[120px] rounded-lg border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-300 ${draft.purposePrimary === purpose ? 'border-accent1 bg-blue-50 text-accent1 shadow-[0_5px_16px_rgba(31,111,255,.12)]' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`} aria-pressed={draft.purposePrimary === purpose}>{purpose}</button>)}</div>
            </IntakeStep>

            <IntakeStep number="2" title="这份方案面向谁？">
              <div className="grid gap-3 md:grid-cols-3"><label className="intake-field"><span>组织或客户名称</span><input value={draft.organizationName} onChange={(event) => update("organizationName", event.target.value)} placeholder="例如：华东某制造企业" maxLength={120} /></label><label className="intake-field"><span>所在行业</span><input value={draft.industry} onChange={(event) => update("industry", event.target.value)} placeholder="例如：制造、零售、政务" /></label><label className="intake-field"><span>实际使用者</span><input value={draft.actualUsers} onChange={(event) => update("actualUsers", event.target.value)} placeholder="例如：销售、管理层" /></label></div>
            </IntakeStep>

            <IntakeStep number="3" title="你现在最想解决什么问题？" required>
              <textarea value={draft.needDescription} onChange={(event) => update("needDescription", event.target.value)} className="min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm leading-7 text-slate-800 placeholder:text-slate-400 focus:border-accent1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="请尽量描述清楚当前问题、目标与痛点，便于系统更准确地分析和形成方案建议……" maxLength={12000} />
            </IntakeStep>

            <IntakeStep number="4" title="你希望最终做成什么？">
              <div className="flex flex-wrap gap-2">{productShapes.map((shape) => <button key={shape} type="button" onClick={() => toggleShape(shape)} className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium transition ${draft.shapes.includes(shape) ? 'border-accent1 bg-blue-50 text-accent1' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`} aria-pressed={draft.shapes.includes(shape)}>{shape}</button>)}</div>
            </IntakeStep>

            <IntakeStep number="5" title="项目目标与范围">
              <div><p className="mb-2 text-xs font-semibold text-slate-500">希望达到的目标</p><div className="flex flex-wrap gap-2">{goalOptions.map((goal) => <button key={goal} type="button" onClick={() => toggleGoal(goal)} className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${draft.desiredGoals.includes(goal) ? 'border-cyan-500 bg-cyan-50 text-cyan-800' : 'border-slate-200 text-slate-600 hover:border-cyan-300'}`} aria-pressed={draft.desiredGoals.includes(goal)}>{goal}</button>)}</div></div>
              <div className="mt-4 grid gap-3 md:grid-cols-3"><label className="intake-field"><span>当前现状</span><textarea value={draft.currentState} onChange={(event) => update("currentState", event.target.value)} placeholder="当前业务或系统现状……" maxLength={1000} /></label><label className="intake-field"><span>本期包含范围</span><textarea value={draft.includedScope} onChange={(event) => update("includedScope", event.target.value)} placeholder="本期要覆盖的主要内容……" maxLength={1000} /></label><label className="intake-field"><span>明确不包含内容</span><textarea value={draft.excludedScope} onChange={(event) => update("excludedScope", event.target.value)} placeholder="本期不包含的内容或边界……" maxLength={1000} /></label></div>
            </IntakeStep>

            <IntakeStep number="6" title="预算、周期和已有材料">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.5fr]"><label className="intake-field"><span>预算范围</span><input value={draft.budget} onChange={(event) => update("budget", event.target.value)} placeholder="例如：50–80 万" /></label><label className="intake-field"><span>期望周期</span><input value={draft.timeline} onChange={(event) => update("timeline", event.target.value)} placeholder="例如：4 个月" /></label><label className="intake-field"><span>其他限制或备注</span><input value={draft.otherConstraints} onChange={(event) => update("otherConstraints", event.target.value)} placeholder="技术栈、合规要求等……" /></label></div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">{fileGroups.map((group) => <div key={group.id} className="rounded-xl border border-dashed border-blue-200 bg-blue-50/25 p-3.5"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-primary">{group.title}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{group.hint}</p></div><label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-lg font-bold text-accent1 shadow-sm hover:bg-blue-100" aria-label={`上传${group.title}`}>↑<input type="file" multiple accept={group.accept} className="sr-only" onChange={(event) => selectFiles(group.id, event)} /></label></div><div className="mt-2 space-y-1.5">{files[group.id].map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-[11px] text-slate-600"><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="shrink-0 text-slate-400">{formatBytes(file.size)}</span><button type="button" onClick={() => removeFile(group.id, index)} className="text-slate-400 hover:text-red-500" aria-label={`移除 ${file.name}`}>×</button></div>)}{lostFiles.filter((file) => file.group === group.id).map((file) => <div key={`lost-${file.name}`} className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">{file.name} · 请重新选择</div>)}</div></div>)}</div>
            </IntakeStep>

            {errors.length > 0 && <div role="alert" className="mb-5 ml-12 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{errors.map((error) => <p key={error}>{errorCopy[error]}</p>)}</div>}
            <div className="mb-6 ml-0 flex flex-col items-center gap-2 border-t border-slate-100 pt-5 sm:ml-12"><button type="submit" disabled={checking} className="inline-flex min-h-12 w-full max-w-[330px] items-center justify-center rounded-full bg-accent1 px-8 py-3 text-base font-bold text-white shadow-[0_14px_34px_rgba(31,111,255,.3)] transition hover:-translate-y-0.5 hover:bg-blue-600 disabled:cursor-wait disabled:opacity-70">{checking ? '正在检查…' : '开启你的定制之旅'}<span className="ml-2" aria-hidden="true">→</span></button><p className="text-center text-[11px] leading-5 text-slate-400">登录前仅保存在当前浏览器，文件会在登录后安全上传。</p></div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24">
            <div className="rounded-[22px] border border-blue-100 bg-white p-5 shadow-[0_18px_50px_rgba(38,91,161,.08)] sm:p-6"><p className="text-sm font-bold text-primary">你会得到</p><ol className="mt-4 space-y-2">{deliverables.map((item, index) => <li key={item} className="flex items-center gap-3 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/70 to-white px-3 py-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-400 text-white shadow-sm"><DeliverableIcon index={index} /></span><div><p className="text-sm font-bold text-primary">{item}</p><p className="mt-0.5 text-[11px] text-slate-400">基于同一项目事实持续生成</p></div></li>)}</ol></div>
            <div className="rounded-[22px] border border-blue-100 bg-white p-5 shadow-[0_18px_50px_rgba(38,91,161,.08)] sm:p-6"><p className="text-sm font-bold text-accent1">导出格式</p><p className="mt-2 text-xs leading-5 text-slate-500">多种文件共享同一内容版本，不会为了格式重复消耗生成 Token。</p><div className="mt-4 grid grid-cols-4 gap-2">{[['W','Word','bg-blue-600'],['X','Excel','bg-emerald-600'],['P','PPT','bg-orange-600'],['PDF','PDF','bg-red-600']].map(([mark,label,color]) => <div key={label} className="rounded-xl border border-slate-200 px-2 py-3 text-center"><span className={`mx-auto grid h-8 w-8 place-items-center rounded-lg text-[10px] font-black text-white ${color}`}>{mark}</span><p className="mt-2 text-[10px] font-semibold text-slate-500">{label}</p></div>)}</div></div>
          </aside>
        </form>
      </div>

      {loginOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="product-login-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-accent1">内容已经准备好</p><h3 id="product-login-title" className="mt-2 text-2xl font-bold text-primary">登录后直接继续生成</h3><p className="mt-2 text-sm leading-6 text-slate-500">你的填写内容和已选文件会保持，不需要重新开始。</p></div><button type="button" onClick={() => setLoginOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-primary" aria-label="关闭登录">×</button></div>
            {activeSolution ? (
              <div className="mt-7 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-accent1 text-lg text-white">✓</span><div><p className="font-bold text-primary">已经开始处理</p><p className="mt-1 text-sm text-slate-600">{activeSolution.headline}</p></div></div>
                <p className="mt-4 break-all text-xs leading-5 text-slate-400">方案编号：{activeSolution.id}</p>
                {loginNotice && <p className="mt-3 text-sm leading-6 text-blue-800">{loginNotice}</p>}
                <button type="button" onClick={() => { window.location.href = `/product/solutions/${activeSolution.id}`; }} className="mt-5 w-full rounded-full bg-accent1 px-6 py-3 font-bold text-white hover:bg-blue-600">查看方案进度</button>
              </div>
            ) : <>
            <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1" aria-label="选择登录或注册">
              <button type="button" onClick={() => { setAuthMode("login"); setLoginNotice(""); }} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${authMode === "login" ? "bg-white text-primary shadow-sm" : "text-slate-500"}`}>已有账号</button>
              <button type="button" onClick={() => { setAuthMode("register"); setLoginNotice(""); }} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${authMode === "register" ? "bg-white text-primary shadow-sm" : "text-slate-500"}`}>注册新账号</button>
            </div>
            <form onSubmit={continueLogin} className="mt-5 space-y-4">
              <label className="intake-field"><span>用户名</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="3–40 个中文、字母或数字" required /></label>
              <label className="intake-field"><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="至少 8 个字符" minLength={8} maxLength={72} required /></label>
              {authMode === "register" && <label className="intake-field"><span>再次输入密码</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="再次输入密码" minLength={8} maxLength={72} required /></label>}
              {loginNotice && <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">{loginNotice}</p>}
              <button type="submit" disabled={authWorking} className="w-full rounded-full bg-accent1 px-6 py-3.5 font-bold text-white hover:bg-blue-600 disabled:cursor-wait disabled:opacity-70">{authWorking ? "正在处理…" : authMode === "login" ? "登录并继续" : "注册并继续"}</button>
              <p className="text-center text-xs leading-5 text-slate-400">账号只用于保存、查看和删除你的方案。</p>
            </form>
            </>}
          </div>
        </div>
      )}
    </section>
  );
}

function IntakeStep({ number, title, required = false, children }: { number: string; title: string; required?: boolean; children: ReactNode }) {
  return <fieldset className="relative border-b border-slate-100 py-5 pl-12 last:border-b-0 sm:pl-16 sm:py-6"><legend className="sr-only">{title}</legend><span className="absolute left-0 top-5 z-10 grid h-8 w-8 place-items-center rounded-lg bg-accent1 text-sm font-black text-white shadow-[0_7px_18px_rgba(31,111,255,.25)] sm:top-6">{number}</span><div className="mb-3 flex flex-wrap items-center gap-2"><h2 className="text-base font-bold text-primary sm:text-[17px]">{title}</h2><span className={`text-[11px] font-bold ${required ? "text-accent1" : "text-slate-400"}`}>{required ? "必填" : "选填"}</span></div>{children}</fieldset>;
}

function DeliverableIcon({ index }: { index: number }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const icons = [
    <svg {...common}><path d="M4 4h10v16H4zM7 8h4M7 12h3"/><circle cx="17" cy="15" r="3"/><path d="m19.2 17.2 2 2"/></svg>,
    <svg {...common}><path d="M9 6h11M9 12h11M9 18h11"/><path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>,
    <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>,
    <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h2M14 14h2M8 18h2"/></svg>,
    <svg {...common}><path d="M3 12 12 3h7l2 2v7l-9 9z"/><circle cx="16.5" cy="7.5" r="1.2"/></svg>,
    <svg {...common}><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></svg>,
    <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 13V9M11 13V7M15 13v-3"/></svg>,
  ];
  return icons[index] || icons[0];
}
