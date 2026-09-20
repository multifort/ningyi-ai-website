"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "登录失败");
        return;
      }
      localStorage.setItem("admin_token", data.token);
      router.push("/admin/dashboard");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-primary text-white">
      <Image
        src="/images/admin/login-delivery-workshop.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none object-cover object-center"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(4,20,38,0.78)_0%,rgba(4,20,38,0.58)_48%,rgba(4,20,38,0.9)_100%)]" />
      <div className="project-grid pointer-events-none absolute inset-0 opacity-15" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid min-h-screen w-[min(1600px,calc(100%-5rem))] items-center gap-16 py-10 lg:grid-cols-[minmax(0,1fr)_30rem]">
        <section className="max-w-2xl pt-10 lg:pt-0" aria-labelledby="login-brand-title">
          <h1 id="login-brand-title" className="max-w-xl font-display text-4xl font-bold leading-[1.14] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
            企业项目方案与成果智能交付服务
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-slate-200 sm:text-lg">
            统一管理首页主视觉、适用团队、项目场景、交付能力、交付成果与客户咨询，让每一部分都围绕同一服务定位展开。
          </p>
          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {["项目定位统一", "交付内容清晰", "宣传口径一致"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-primary/35 px-4 py-3 text-sm font-semibold text-white backdrop-blur-md">
                <span className="mr-2 text-accent2">✓</span>{item}
              </div>
            ))}
          </div>
        </section>

        <section className="w-full max-w-[30rem] justify-self-end rounded-[1.75rem] border border-white/20 bg-white/[0.96] p-6 text-primary shadow-[0_30px_90px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-9" aria-labelledby="login-title">
          <div className="flex items-center justify-between gap-5">
            <Image src="/images/logo.png" alt="宁翼智能科技" width={150} height={44} className="h-10 w-auto object-contain" />
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-accent1">管理端</span>
          </div>
          <div className="mt-8">
            <h2 id="login-title" className="text-2xl font-bold tracking-[-0.02em]">登录内容控制台</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">进入后可维护官网内容与咨询线索。</p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</div>}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">用户名</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-primary transition focus:border-accent1 focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent1/10"
                placeholder="请输入用户名"
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-primary transition focus:border-accent1 focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent1/10"
                placeholder="请输入密码"
                autoComplete="current-password"
                required
              />
            </label>

            <button type="submit" disabled={loading} className="w-full rounded-xl bg-accent1 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(31,111,255,0.28)] transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? "正在登录…" : "进入管理控制台"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-5 text-center">
            <Link href="/" className="text-sm font-semibold text-accent1 hover:text-blue-700">返回官网首页</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
