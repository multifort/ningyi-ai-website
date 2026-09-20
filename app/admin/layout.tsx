"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

const menuItems = [
  { path: "/admin/dashboard", label: "控制台", marker: "总" },
  { path: "/admin/content/hero", label: "首页主视觉", marker: "首" },
  { path: "/admin/content/demo", label: "交付流程", marker: "流" },
  { path: "/admin/content/solutions", label: "适用团队", marker: "团" },
  { path: "/admin/content/scenarios", label: "项目场景", marker: "项" },
  { path: "/admin/content/capability", label: "交付能力", marker: "能" },
  { path: "/admin/content/stats", label: "核心价值", marker: "值" },
  { path: "/admin/content/cases", label: "交付成果", marker: "果" },
  { path: "/admin/content/reservations", label: "咨询线索", marker: "询" },
  { path: "/admin/content/footer", label: "页脚信息", marker: "尾" },
  { path: "/admin/profile", label: "账号安全", marker: "安" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token && pathname !== "/admin") router.push("/admin");
  }, [pathname, router]);

  if (pathname === "/admin") return <>{children}</>;

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    router.push("/admin");
  };

  return (
    <div className="min-h-screen bg-[#eef3f8] lg:flex">
      <aside className="border-b border-slate-200 bg-primary text-white lg:sticky lg:top-0 lg:h-screen lg:w-[17.5rem] lg:shrink-0 lg:border-b-0 lg:border-r lg:border-white/10">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-5 lg:block lg:px-6 lg:py-7">
          <Link href="/admin/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent1 font-display text-lg font-bold shadow-[0_10px_26px_rgba(31,111,255,0.3)]">宁</span>
            <span>
              <span className="block text-sm font-bold">官网内容管理</span>
              <span className="mt-0.5 block text-[11px] text-slate-400">项目方案与成果交付</span>
            </span>
          </Link>
          <Link href="/" className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 lg:mt-5 lg:inline-flex">查看官网</Link>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 py-3 lg:block lg:h-[calc(100vh-13rem)] lg:space-y-1 lg:overflow-y-auto lg:px-4 lg:py-5" aria-label="管理控制台导航">
          {menuItems.map((item) => {
            const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <Link key={item.path} href={item.path} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition lg:w-full ${active ? "bg-accent1 text-white shadow-[0_10px_26px_rgba(31,111,255,0.25)]" : "text-slate-300 hover:bg-white/[0.07] hover:text-white"}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${active ? "bg-white/15" : "bg-white/[0.06] text-slate-400"}`}>{item.marker}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t border-white/10 p-4 lg:block">
          <button onClick={handleLogout} className="w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-300 transition hover:bg-white/[0.07] hover:text-white">退出登录</button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.1em] text-accent1">企业项目方案与成果智能交付服务</p>
              <p className="mt-1 text-sm text-slate-500">保持页面结构、宣传内容与交付定位一致</p>
            </div>
            <button onClick={handleLogout} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 lg:hidden">退出</button>
          </div>
        </header>
        <div className="admin-content mx-auto max-w-[92rem] p-5 sm:p-8 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
