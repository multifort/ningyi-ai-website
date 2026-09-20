"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Counts = { teams: number; scenarios: number; capabilities: number; cases: number };

const contentFlow = [
  { index: "01", title: "首页主视觉", detail: "先讲清服务定位与客户得到的成果", href: "/admin/content/hero" },
  { index: "02", title: "交付过程", detail: "用动态图示说明材料如何变成方案成果", href: "/admin/content/demo" },
  { index: "03", title: "交付保障", detail: "说明范围、成本与多类成果如何保持一致", href: "/admin/content/capability" },
  { index: "04", title: "适用项目", detail: "帮助客户判断团队与项目是否适配", href: "/admin/content/scenarios" },
  { index: "05", title: "成果与转化", detail: "展示成果包并承接项目分析申请", href: "/admin/content/cases" },
];

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts>({ teams: 0, scenarios: 0, capabilities: 0, cases: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const token = localStorage.getItem("admin_token");
        const headers = { Authorization: `Bearer ${token}` };
        const responses = await Promise.all([
          fetch("/api/content/solutions", { headers }),
          fetch("/api/content/scenarios", { headers }),
          fetch("/api/content/capability", { headers }),
          fetch("/api/content/cases", { headers }),
        ]);
        const [teams, scenarios, capabilities, cases] = await Promise.all(responses.map((response) => response.json()));
        setCounts({
          teams: teams.data?.length || 0,
          scenarios: scenarios.data?.length || 0,
          capabilities: capabilities.data?.length || 0,
          cases: cases.data?.length || 0,
        });
      } catch (error) {
        console.error("获取内容统计失败:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCounts();
  }, []);

  const statCards = [
    { label: "适用团队", value: counts.teams, marker: "团", detail: "客户类型与适用方式", href: "/admin/content/solutions" },
    { label: "项目场景", value: counts.scenarios, marker: "项", detail: "典型难点与交付成果", href: "/admin/content/scenarios" },
    { label: "交付能力", value: counts.capabilities, marker: "能", detail: "成果质量与一致性", href: "/admin/content/capability" },
    { label: "交付成果", value: counts.cases, marker: "果", detail: "脱敏项目成果结构", href: "/admin/content/cases" },
  ];

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">正在加载官网内容…</div>;

  return (
    <div>
      <section className="relative overflow-hidden rounded-[1.75rem] bg-primary p-7 text-white shadow-[0_24px_70px_rgba(7,27,51,0.18)] sm:p-9">
        <div className="project-grid absolute inset-0 opacity-25" aria-hidden="true" />
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent1/25 blur-[90px]" aria-hidden="true" />
        <div className="relative z-10 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-accent2">官网宣传主轴</p>
            <h1 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-tight tracking-[-0.025em] sm:text-4xl">企业项目方案与成果智能交付服务</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">所有页面内容都应帮助客户理解：提交哪些材料、如何完成交付、最终获得哪些项目方案与成果。</p>
          </div>
          <Link href="/admin/content/hero" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary transition hover:-translate-y-0.5">编辑首页主视觉</Link>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="官网内容统计">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(7,27,51,0.045)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_45px_rgba(7,27,51,0.09)]">
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-accent1">{stat.marker}</span>
              <span className="text-3xl font-bold tracking-tight text-primary">{stat.value}</span>
            </div>
            <div className="mt-5 text-sm font-bold text-primary">{stat.label}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">{stat.detail}</div>
          </Link>
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(7,27,51,0.05)]">
          <div>
            <p className="text-sm font-semibold text-accent1">官网内容结构</p>
            <h2 className="mt-2 text-2xl font-bold text-primary">按客户决策顺序维护内容</h2>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {contentFlow.map((item) => (
              <Link key={item.index} href={item.href} className="group relative rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/50">
                <span className="text-xs font-bold text-accent1">{item.index}</span>
                <h3 className="mt-3 text-sm font-bold text-primary">{item.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(7,27,51,0.05)]">
          <p className="text-sm font-semibold text-accent1">维护原则</p>
          <h2 className="mt-2 text-2xl font-bold text-primary">每次发布前检查三件事</h2>
          <ul className="mt-6 space-y-4">
            {["是否突出项目方案与成果交付，而不是泛化介绍技术", "是否从客户角度说明可获得的具体内容与价值", "配图和动态图示是否真正解释交付场景与过程"].map((item, index) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-accent1">{index + 1}</span>
                {item}
              </li>
            ))}
          </ul>
          <Link href="/admin/content/reservations" className="mt-6 inline-flex text-sm font-semibold text-accent1 hover:text-blue-700">查看咨询线索 →</Link>
        </section>
      </div>
    </div>
  );
}
