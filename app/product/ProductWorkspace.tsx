"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { productApi } from "../../lib/product/api-contract";

type SolutionRecovery = { state: "retry_wait" | "cooldown" | "environment_wait"; headline: string; nextRetryAt: string | null; attemptCount: number; maxAttempts: number };
type Solution = { id: string; title: string; status: string; stage: string; createdAt: string; updatedAt: string; fileCount: number; artifactCount: number; automaticRecovery?: boolean; recovery?: SolutionRecovery | null };

const stageCopy: Record<string, string> = {
  awaiting_upload: "等待材料上传",
  quick_understanding: "正在理解材料",
  media_analysis: "正在识别图像",
  formal_analysis: "正在形成方案",
  rendering: "正在整理成果文件",
  completed: "成果已经准备好",
  ready_to_process: "待确认后处理",
};

export default function ProductWorkspace() {
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [notice, setNotice] = useState("");
  const [authWorking, setAuthWorking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signedInAs, setSignedInAs] = useState("");
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [deletingId, setDeletingId] = useState("");
  const [duplicatingId, setDuplicatingId] = useState("");

  const load = async () => {
    const session = await fetch(productApi.session).then((response) => response.json());
    if (!session.success) { setLoading(false); return; }
    setSignedInAs(session.data.user.username);
    const list = await fetch(productApi.solutions).then((response) => response.json());
    if (list.success) setSolutions(list.data.solutions);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    setAuthWorking(true);
    try {
      const response = await fetch(mode === "login" ? productApi.login : productApi.register, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!result.success) { setNotice(result?.error?.message || "暂时无法登录，请稍后重试。"); return; }
      setLoading(true);
      await load();
    } catch {
      setNotice("当前无法连接服务，请检查网络后重试。");
    } finally {
      setAuthWorking(false);
    }
  };
  const deleteSolution = async (solution: Solution) => {
    if (!window.confirm(`确认删除“${solution.title}”吗？删除后会立即停止访问，并由系统自动清理材料、成果和历史版本。`)) return;
    const passwordConfirmation = window.prompt("请输入当前密码确认删除：");
    if (!passwordConfirmation) return;
    setDeletingId(solution.id);
    const response = await fetch(productApi.deleteSolution(solution.id), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: passwordConfirmation }) });
    if (response.ok) setSolutions((items) => items.filter((item) => item.id !== solution.id));
    else { const payload = await response.json().catch(() => null); window.alert(payload?.error?.message || "暂时无法提交删除请求，请稍后重试。"); }
    setDeletingId("");
  };
  const duplicateSolution = async (solution: Solution) => {
    if (!window.confirm(`复制“${solution.title}”的项目说明、已上传材料、企业模板、品牌素材和已确认事实？旧项目的理解、成果和历史版本不会复制。新项目不会自动开始处理。`)) return;
    setDuplicatingId(solution.id);
    try {
      const response = await fetch(productApi.duplicateSolution(solution.id), { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "暂时无法复制项目。");
      window.location.href = `/product/solutions/${payload.data.solutionId}`;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "暂时无法复制项目，请稍后重试。");
      setDuplicatingId("");
    }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f4f7fb] text-sm text-slate-500">正在打开你的方案…</div>;

  if (!signedInAs) return (
    <main className="relative isolate min-h-[100svh] overflow-hidden bg-[#020817] text-white lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(500px,.92fr)]">
      <img src="/images/product-results-login-v2.png" alt="" className="fixed inset-0 -z-30 h-full w-full object-cover object-[38%_center]" />
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(90deg,rgba(2,8,23,.91)_0%,rgba(2,8,23,.65)_30%,rgba(2,8,23,.38)_46%,rgba(2,8,23,.82)_62%,rgba(2,8,23,.98)_100%),linear-gradient(180deg,rgba(2,8,23,.05)_0%,rgba(2,8,23,.12)_62%,rgba(2,8,23,.68)_100%)]" aria-hidden="true" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_76%_42%,rgba(23,107,255,.1),transparent_34%)]" aria-hidden="true" />
      <section className="relative min-h-[400px] px-6 pb-12 pt-7 sm:px-10 lg:min-h-[100svh] lg:px-[clamp(48px,5.3vw,88px)] lg:pb-12 lg:pt-10">
        <Link href="/" className="inline-flex items-center rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-4 focus:ring-offset-[#020817]" aria-label="返回宁翼智能官网">
          <img src="/images/logo-white.png" alt="宁翼智能" className="h-auto w-[174px] sm:w-[190px]" />
        </Link>

        <div className="mt-16 max-w-[590px] sm:mt-20 lg:mt-[16vh]">
          <p className="text-xs font-bold tracking-[0.24em] text-blue-300">你的项目成果，持续在线</p>
          <h1 className="mt-4 font-display text-[2.15rem] font-bold leading-[1.16] tracking-[-0.035em] text-white sm:text-5xl lg:text-[3.15rem]">继续查看你的成果</h1>
          <p className="mt-5 max-w-[520px] text-[15px] leading-7 text-slate-300 sm:text-base">使用提交材料时的用户名和密码登录，即可继续查看已经形成的方案与交付成果。</p>
        </div>

        <div className="mt-9 hidden max-w-[360px] space-y-5 lg:block">
          <LoginBenefit icon="shield" title="安全可信" detail="项目材料与成果按账号隔离保存" />
          <LoginBenefit icon="layers" title="成果完整" detail="方案、清单与汇报材料集中查看" />
          <LoginBenefit icon="bolt" title="打开即看" detail="无需新建项目，也无需手动运行任务" />
        </div>
      </section>

      <section className="relative flex items-center justify-center px-5 pb-8 pt-3 sm:px-10 lg:py-12">
        <div className="w-full max-w-[560px] rounded-[28px] border border-white/90 bg-white px-6 py-7 text-slate-800 shadow-[0_30px_90px_rgba(2,24,72,.18)] sm:px-10 sm:py-8 lg:px-11 lg:py-9">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent1 transition hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200">← 返回官网</Link>
          <div className="mt-6">
            <p className="text-xs font-bold tracking-[0.18em] text-accent1">继续查看你的成果</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.03em] text-primary sm:text-[2.25rem]">登录我的成果</h2>
            <p className="mt-2.5 max-w-[450px] text-sm leading-6 text-slate-500">使用提交材料时的用户名和密码登录。还没有账号，可以在这里直接注册后开始。</p>
          </div>

          <div className="mt-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1.5" role="tablist" aria-label="登录或注册">
            <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setNotice(""); }} className={`rounded-xl py-2.5 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${mode === "login" ? "bg-white text-accent1 shadow-[0_4px_16px_rgba(15,41,84,.08)]" : "text-slate-500 hover:text-primary"}`}>已有账号</button>
            <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setNotice(""); }} className={`rounded-xl py-2.5 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${mode === "register" ? "bg-white text-accent1 shadow-[0_4px_16px_rgba(15,41,84,.08)]" : "text-slate-500 hover:text-primary"}`}>注册新账号</button>
          </div>

          <form onSubmit={authenticate} className="mt-5 space-y-4">
            <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">用户名</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="3–40 个中文、字母或数字" minLength={3} maxLength={40} required className="h-[52px] w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-primary outline-none transition placeholder:text-slate-400 focus:border-accent1 focus:ring-4 focus:ring-blue-100" /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">密码</span><span className="relative block"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 8 个字符" minLength={8} maxLength={72} required className="h-[52px] w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-[15px] text-primary outline-none transition placeholder:text-slate-400 focus:border-accent1 focus:ring-4 focus:ring-blue-100" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-1 grid w-11 place-items-center rounded-lg text-slate-400 transition hover:text-accent1 focus:outline-none focus:ring-2 focus:ring-blue-200" aria-label={showPassword ? "隐藏密码" : "显示密码"}><EyeIcon open={showPassword} /></button></span></label>
            {notice && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{notice}</p>}
            <button disabled={authWorking} className="mt-0.5 flex h-[52px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#176BFF] to-[#2563EB] px-5 text-base font-bold text-white shadow-[0_14px_32px_rgba(31,111,255,.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(31,111,255,.34)] focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0">{authWorking ? "正在处理…" : mode === "login" ? "登录并查看成果" : "注册并进入"}</button>
            <p className="text-center text-sm text-slate-500">{mode === "login" ? <>没有账号？ <button type="button" onClick={() => { setMode("register"); setNotice(""); }} className="font-semibold text-accent1 hover:text-blue-700">立即注册</button></> : <>已有账号？ <button type="button" onClick={() => { setMode("login"); setNotice(""); }} className="font-semibold text-accent1 hover:text-blue-700">直接登录</button></>}</p>
          </form>
          <p className="mt-5 border-t border-slate-100 pt-4 text-center text-xs leading-5 text-slate-400">登录即表示你已阅读并同意用户服务协议与隐私政策。</p>
        </div>
      </section>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-800">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="section-shell flex h-20 items-center justify-between">
          <Link href="/" className="font-display text-xl font-bold text-primary">宁翼智能 · 方案交付台</Link>
          <div className="flex items-center gap-4 text-sm"><span className="text-slate-500">{signedInAs}</span><Link href="/product/data" className="font-semibold text-accent1">数据管理</Link><button onClick={async () => { await fetch(productApi.logout, { method: "POST" }); location.reload(); }} className="font-semibold text-primary">退出</button></div>
        </div>
      </header>
      <div className="section-shell py-12 sm:py-16">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div><p className="section-kicker">持续形成，随时回来查看</p><h1 className="mt-3 text-4xl font-bold tracking-tight text-primary">我的成果</h1><p className="mt-3 text-slate-500">这里展示你已经提交的内容和当前进度，不需要创建项目或运行任务。</p></div>
          <Link href="/product/start" className="rounded-full bg-accent1 px-6 py-3 text-center text-sm font-bold text-white shadow-[0_12px_30px_rgba(31,111,255,.22)]">开启你的定制之旅</Link>
        </div>
        {solutions.length ? <div className="mt-10 grid gap-4">
          {solutions.map((solution) => <div key={solution.id} className={`group grid gap-5 rounded-2xl border bg-white p-6 shadow-[0_14px_40px_rgba(7,27,51,.06)] transition sm:grid-cols-[1fr_auto] sm:items-center ${solution.recovery ? "border-amber-200 hover:border-amber-300" : "border-slate-200 hover:border-blue-200"}`}><Link href={`/product/solutions/${solution.id}`} className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold text-primary">{solution.title}</h2><SolutionStatus solution={solution} /></div>{solution.recovery && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-amber-700"><span aria-hidden="true">↻</span><span>{solution.recovery.headline}{solution.recovery.nextRetryAt ? ` · ${formatNextRetry(solution.recovery.nextRetryAt)}` : " · 环境恢复后继续"}</span></p>}<p className="mt-3 text-sm text-slate-500">{solution.fileCount} 份材料 · {solution.artifactCount} 份成果 · 提交于 {new Date(solution.createdAt).toLocaleDateString("zh-CN")}</p></Link><div className="flex flex-wrap items-center justify-end gap-4"><Link href={`/product/solutions/${solution.id}`} className="font-semibold text-accent1">{solution.stage === "completed" ? "查看成果" : "查看进度"} →</Link>{solution.artifactCount > 0 && <a href={productApi.deliverablePackage(solution.id, "client")} className="text-xs font-semibold text-accent1 hover:text-blue-700">下载最近包</a>}<button type="button" disabled={duplicatingId === solution.id} onClick={() => duplicateSolution(solution)} className="text-xs font-semibold text-slate-500 hover:text-accent1 disabled:opacity-50">{duplicatingId === solution.id ? "正在复制…" : "复制为新项目"}</button><button type="button" disabled={deletingId === solution.id} onClick={() => deleteSolution(solution)} className="text-xs font-semibold text-slate-400 hover:text-red-600 disabled:opacity-50">{deletingId === solution.id ? "正在删除…" : "删除"}</button></div></div>)}
        </div> : <div className="mt-10 rounded-3xl border border-dashed border-blue-200 bg-white p-12 text-center"><h2 className="text-xl font-bold text-primary">还没有提交方案</h2><p className="mt-3 text-sm text-slate-500">从实际问题开始填写，信息不完整也可以开始。</p><Link href="/product/start" className="mt-6 inline-block font-semibold text-accent1">开启你的定制之旅 →</Link></div>}
      </div>
    </main>
  );
}

function SolutionStatus({ solution }: { solution: Solution }) {
  if (solution.recovery) {
    const copy = solution.recovery.state === "cooldown" ? "自动修复中" : solution.recovery.state === "environment_wait" ? "等待能力恢复" : "等待自动重试";
    return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{copy}</span>;
  }
  const completed = solution.stage === "completed";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${completed ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-accent1"}`}>{stageCopy[solution.stage] || "处理中"}</span>;
}

function formatNextRetry(value: string) {
  return `${new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} 自动继续`;
}

function LoginBenefit({ icon, title, detail }: { icon: "shield" | "layers" | "bolt"; title: string; detail: string }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const graphic = icon === "shield"
    ? <svg {...common}><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
    : icon === "layers"
      ? <svg {...common}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></svg>
      : <svg {...common}><path d="m13 2-8 12h7l-1 8 8-12h-7z" /></svg>;
  return <div className="flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-blue-400/30 bg-blue-500/15 text-blue-300 shadow-[inset_0_0_24px_rgba(30,111,255,.12)]">{graphic}</span><div><p className="text-sm font-bold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p></div></div>;
}

function EyeIcon({ open }: { open: boolean }) {
  return open
    ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>
    : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.2A11.8 11.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.1 2.8M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1" /><path d="M9.8 9.8a3 3 0 0 0 4.4 4.4" /></svg>;
}
