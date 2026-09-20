"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CaseStudy = {
  title: string;
  industry: string;
  problem: string;
  solution: string;
  results: Array<{ label: string; value: string; icon: string }>;
};

const fallbackCases: CaseStudy[] = [
  {
    title: "软件定制项目方案包",
    industry: "脱敏交付成果",
    problem: "原始资料包含需求文档局部章节、功能表格和两段会议纪要，范围与待确认事项分散。",
    solution: "统一项目目标与范围，拆解功能并关联工作量、报价建议、实施计划和客户汇报逻辑。",
    results: [
      { icon: "源", label: "项目事实源", value: "统一" },
      { icon: "果", label: "成果类型", value: "7 类" },
      { icon: "变", label: "范围变化", value: "联动更新" },
    ],
  },
  {
    title: "多系统集成项目方案包",
    industry: "脱敏交付成果",
    problem: "现有系统、接口、数据流和部署约束分别记录，方案、实施计划与报价容易漏项。",
    solution: "梳理系统边界与接口依赖，把集成范围、角色工作量、实施里程碑和报价结构关联起来。",
    results: [
      { icon: "界", label: "系统边界", value: "清晰" },
      { icon: "接", label: "接口关系", value: "可追踪" },
      { icon: "价", label: "计划与报价", value: "保持联动" },
    ],
  },
  {
    title: "数字化升级项目方案包",
    industry: "脱敏交付成果",
    problem: "建设目标宏观、业务成熟度不同，需要兼顾现状、目标与分阶段实施。",
    solution: "区分事实、推演建议和待确认项，形成现状分析、总体方案、阶段路线与风险建议。",
    results: [
      { icon: "实", label: "已确认事实", value: "单独标记" },
      { icon: "推", label: "推演建议", value: "可调整" },
      { icon: "阶", label: "建设路线", value: "分阶段" },
    ],
  },
];

function DocumentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5M10 12h5m-5 4h5" />
    </svg>
  );
}

function CaseVisual({ index }: { index: number }) {
  if (index === 1) {
    return (
      <div className="relative h-[150px] overflow-hidden rounded-2xl bg-gradient-to-b from-[#f8fbff] to-[#eef5ff] px-3 py-3">
        <svg viewBox="0 0 360 150" className="h-full w-full" role="img" aria-label="多系统边界、接口和集成中台关系示意">
          <defs>
            <linearGradient id="hub" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#2c7df0" /><stop offset="1" stopColor="#1157d7" /></linearGradient>
            <filter id="soft"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#3878ca" floodOpacity=".18" /></filter>
          </defs>
          <g fill="none" stroke="#77a9ef" strokeWidth="1.5">
            <path d="M86 38h54q18 0 31 18l9 12" /><path d="M86 112h54q18 0 31-18l9-12" />
            <path d="M274 38h-54q-18 0-31 18l-9 12" /><path d="M274 112h-54q-18 0-31-18l-9-12" />
          </g>
          <g fill="#1c6ce7"><circle cx="86" cy="38" r="3.5" /><circle cx="86" cy="112" r="3.5" /><circle cx="274" cy="38" r="3.5" /><circle cx="274" cy="112" r="3.5" /></g>
          <g filter="url(#soft)">
            <rect x="10" y="12" width="76" height="50" rx="10" fill="white" stroke="#c9ddfa" /><rect x="10" y="88" width="76" height="50" rx="10" fill="white" stroke="#c9ddfa" />
            <rect x="274" y="12" width="76" height="50" rx="10" fill="white" stroke="#c9ddfa" /><rect x="274" y="88" width="76" height="50" rx="10" fill="white" stroke="#c9ddfa" />
          </g>
          <g fill="#27405f" fontSize="10" fontWeight="600" textAnchor="middle"><text x="48" y="29">业务系统 A</text><text x="48" y="105">业务系统 B</text><text x="312" y="29">数据平台</text><text x="312" y="105">第三方服务</text></g>
          <g fill="#dce9fb" stroke="#3175dc" strokeWidth="1.4"><rect x="35" y="36" width="26" height="16" rx="2" /><rect x="35" y="112" width="26" height="16" rx="2" /><ellipse cx="312" cy="43" rx="14" ry="5" /><path d="M298 43v8c0 3 6 5 14 5s14-2 14-5v-8" /><path d="M300 116c0-7 5-12 12-12 6 0 10 3 12 8 5 0 9 4 9 9s-4 9-10 9h-24c-5 0-9-3-9-7 0-4 4-7 10-7z" /></g>
          <g filter="url(#soft)"><path d="m180 47 32 18v36l-32 18-32-18V65z" fill="url(#hub)" /><path d="m180 62 17 10v20l-17 10-17-10V72z" fill="#e9f3ff" opacity=".95" /><path d="m180 69 10 6v12l-10 6-10-6V75z" fill="#4b8ef0" /></g>
          <text x="180" y="139" fill="#27405f" fontSize="11" fontWeight="700" textAnchor="middle">集成中台</text>
        </svg>
      </div>
    );
  }

  if (index === 2) {
    const steps = ["现状分析", "总体方案", "阶段实施", "持续优化"];
    return (
      <div className="h-[150px] overflow-hidden rounded-2xl bg-gradient-to-b from-[#f8fbff] to-[#eef5ff] p-3">
        <div className="grid grid-cols-4 gap-2">
          {steps.map((step, stepIndex) => (
            <div key={step} className="relative rounded-xl border border-blue-100 bg-white px-1 py-2 text-center shadow-[0_5px_15px_rgba(43,104,190,0.08)]">
              <div className="text-[9px] font-semibold text-slate-600">{step}</div>
              <div className="mx-auto mt-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#1c6ce7]">
                {stepIndex === 0 && <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="5" /><path d="m14 14 5 5M7 11l2-2 2 2 3-4" /></svg>}
                {stepIndex === 1 && <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 18h16M7 18V9h4v9m2 0V5h4v13" /><path d="m5 8 4-3 3 2 6-4" /></svg>}
                {stepIndex === 2 && <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 5h12M6 12h12M6 19h12" /><circle cx="9" cy="5" r="2" fill="white" /><circle cx="15" cy="12" r="2" fill="white" /><circle cx="11" cy="19" r="2" fill="white" /></svg>}
                {stepIndex === 3 && <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 18V12m5 6V9m5 9v-4m4 4V5" /><path d="m5 9 5-3 5 3 4-5" /></svg>}
              </div>
              {stepIndex < steps.length - 1 && <span className="absolute -right-2.5 top-1/2 z-10 -translate-y-1/2 text-[#2c7df0]">→</span>}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_64px] gap-2 rounded-xl border border-blue-100 bg-white p-2">
          <svg viewBox="0 0 210 38" className="h-9 w-full" aria-hidden="true"><path d="M2 30 35 22 64 28 95 14 126 23 158 8 208 18" fill="none" stroke="#2c7df0" strokeWidth="2" /><path d="M2 34h206M2 24h206M2 14h206" stroke="#dbe8f8" strokeWidth="1" /></svg>
          <div className="flex items-center justify-center gap-1.5"><span className="h-8 w-8 rounded-full border-[7px] border-[#2c7df0] border-r-blue-100" /><span className="space-y-1"><i className="block h-1 w-4 rounded bg-blue-200" /><i className="block h-1 w-3 rounded bg-blue-100" /></span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-[#f8fbff] to-[#eef5ff] px-3">
      <div className="relative mr-2 h-24 w-28 shrink-0">
        <div className="absolute left-0 top-4 h-20 w-24 rounded-xl bg-gradient-to-br from-[#4c91f2] to-[#155bd7] shadow-[0_12px_24px_rgba(23,91,210,0.22)]" />
        <div className="absolute left-3 top-0 h-8 w-12 rounded-t-lg bg-[#72a8f4]" />
        <div className="absolute bottom-4 left-7 font-mono text-2xl font-bold text-white">&lt;/&gt;</div>
      </div>
      {["需求文档", "功能清单", "方案报告"].map((label, stepIndex) => (
        <div key={label} className="relative flex items-center">
          {stepIndex > 0 && <span className="mx-1 text-lg text-[#2c7df0]">→</span>}
          <div className="h-[88px] w-[66px] rounded-xl border border-blue-100 bg-white p-2 shadow-[0_7px_18px_rgba(42,102,186,0.1)]">
            <div className="text-center text-[8px] font-semibold text-slate-500">{label}</div>
            {stepIndex === 2 ? (
              <div className="mx-auto mt-4 h-9 w-9 rounded-full border-[7px] border-[#2c7df0] border-r-blue-100" />
            ) : (
              <div className="mt-3 space-y-2">
                <i className="block h-1.5 w-8 rounded bg-blue-100" /><i className="block h-1.5 w-10 rounded bg-blue-50" /><i className="block h-1.5 w-7 rounded bg-blue-100" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DescriptionIcon({ type }: { type: "source" | "result" }) {
  return type === "source" ? (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="4" /><path d="M6 20c.7-4 2.7-6 6-6s5.3 2 6 6M8 4 6 2m10 2 2-2" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 2v4m6-4v4m-6 7 2 2 4-4" /></svg>
  );
}

function ResultIcon({ index }: { index: number }) {
  if (index === 1) return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 18V8m5 10V5m5 13v-7m5 7V3" /><path d="M3 21h18" /></svg>;
  if (index === 2) return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="m8 11 8-4m-8 6 8 4" /></svg>;
  return <DocumentIcon />;
}

function getVisualIndex(title: string, fallbackIndex: number) {
  if (title.includes("集成")) return 1;
  if (title.includes("数字化") || title.includes("升级")) return 2;
  if (title.includes("软件") || title.includes("定制")) return 0;
  return fallbackIndex % 3;
}

export default function CaseStudies({ industryFilter }: { industryFilter?: string }) {
  const [cases, setCases] = useState(fallbackCases);

  useEffect(() => {
    const query = industryFilter ? `?industry=${encodeURIComponent(industryFilter)}` : "";
    fetch(`/api/content/cases${query}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success && payload.data?.length) setCases(payload.data);
      })
      .catch(() => undefined);
  }, [industryFilter]);

  return (
    <section id="case" className={`relative overflow-hidden ${industryFilter ? "bg-white py-10 md:py-14" : "bg-gradient-to-b from-white to-[#f7faff] py-14 md:py-20"}`} aria-labelledby="case-title">
      {!industryFilter && (
        <svg className="pointer-events-none absolute right-0 top-0 h-64 w-[58%] text-blue-100/80" viewBox="0 0 800 260" fill="none" aria-hidden="true">
          <path d="M-30 210C180 190 290 40 540 80s230 65 310 20" stroke="currentColor" strokeWidth="2" />
          <path d="M-10 230C200 215 360 100 560 120s200 35 290 0" stroke="currentColor" strokeWidth="10" opacity=".35" />
          <g fill="#d7e8ff"><circle cx="710" cy="42" r="2" /><circle cx="728" cy="42" r="2" /><circle cx="746" cy="42" r="2" /><circle cx="764" cy="42" r="2" /><circle cx="710" cy="60" r="2" /><circle cx="728" cy="60" r="2" /><circle cx="746" cy="60" r="2" /><circle cx="764" cy="60" r="2" /></g>
        </svg>
      )}
      <div className="section-shell relative">
        {!industryFilter && (
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="section-heading">
              <div className="section-kicker">最终交付什么</div>
              <h2 id="case-title">七类成果围绕一个项目协同更新</h2>
              <p>以下脱敏样例展示原始材料如何组织为需求、功能、方案、估算、报价、实施与汇报成果，便于判断交付内容是否适合当前项目。</p>
            </div>
            <Link href="/case" className="group inline-flex shrink-0 items-center text-sm font-semibold text-[#1769ed] transition hover:text-blue-800">
              查看成果包说明
              <svg className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </Link>
          </div>
        )}

        <div className={`${industryFilter ? "mt-0" : "mt-8 md:mt-10"} grid gap-5 lg:grid-cols-3`}>
          {cases.map((item, index) => (
            <article key={item.title} className="group flex min-h-full flex-col rounded-[1.4rem] border border-blue-100 bg-white p-5 shadow-[0_18px_45px_rgba(24,75,145,0.08)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_22px_52px_rgba(24,75,145,0.13)]">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#1769ed]">{item.industry}</span>
                <span className="font-display text-lg font-bold tracking-[0.1em] text-blue-200">0{index + 1}</span>
              </div>
              <h3 className="mt-4 text-xl font-bold text-primary">{item.title}</h3>

              <div className="mt-4"><CaseVisual index={getVisualIndex(item.title, index)} /></div>

              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-[42px_1fr] gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[#2774e9]"><DescriptionIcon type="source" /></span>
                  <div><div className="text-sm font-bold text-primary">原始情况</div><p className="mt-1 text-[13px] leading-6 text-slate-600">{item.problem}</p></div>
                </div>
                <div className="grid grid-cols-[42px_1fr] gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[#2774e9]"><DescriptionIcon type="result" /></span>
                  <div><div className="text-sm font-bold text-primary">成果组织</div><p className="mt-1 text-[13px] leading-6 text-slate-600">{item.solution}</p></div>
                </div>
              </div>

              <div className="mt-auto grid grid-cols-3 divide-x divide-blue-100 rounded-xl border border-blue-100 bg-gradient-to-b from-white to-blue-50/50 px-2 py-3">
                {item.results.slice(0, 3).map((result, resultIndex) => (
                  <div key={`${result.label}-${result.value}`} className="min-w-0 px-2 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[#1769ed]"><ResultIcon index={resultIndex} /><span className="truncate font-display text-sm font-bold">{result.value}</span></div>
                    <div className="mt-1 truncate text-[10px] text-slate-500">{result.label}</div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        {!industryFilter && (
          <p className="mt-7 flex items-start gap-2 text-xs leading-5 text-slate-500">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" strokeLinecap="round" /></svg>
            注：以上为脱敏成果结构示例，不代表已验证的客户效率、成本节省、岗位替代或中标结果。
          </p>
        )}
      </div>
    </section>
  );
}
