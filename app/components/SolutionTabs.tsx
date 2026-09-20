"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

type Scenario = {
  icon: string;
  title: string;
  slug: string;
  subtitle?: string;
  pain: string;
  solution: string;
  flowSteps?: Array<{ title: string; detail: string }>;
};

type FlowIcon = "document" | "checklist" | "blueprint" | "quote" | "systems" | "connection" | "database" | "calendar" | "diagnosis" | "target" | "roadmap" | "shield";

const fallbackScenarios: Scenario[] = [
  {
    icon: "01",
    title: "软件定制开发项目",
    slug: "software-customization",
    subtitle: "需求到报价",
    pain: "需求描述零散、功能边界模糊，开发工作量难以快速估算。",
    solution: "结构化需求与功能清单，形成总体方案、角色人日、周期、报价建议和客户汇报材料。",
  },
  {
    icon: "02",
    title: "多系统集成项目",
    slug: "system-integration-project",
    subtitle: "边界到实施",
    pain: "涉及多个现有系统、接口、数据源和部署约束，容易漏项或前后口径不一致。",
    solution: "统一识别系统边界、接口关系、数据流、实施依赖，并关联工作量、计划和报价。",
  },
  {
    icon: "03",
    title: "企业数字化升级项目",
    slug: "digital-transformation",
    subtitle: "现状到路线",
    pain: "业务目标较宏观、需求成熟度不一，方案需要兼顾现状、目标与分阶段建设。",
    solution: "区分已确认事实、推演建议和待确认事项，形成现状分析、总体方案、阶段路线和风险建议。",
  },
];

const flows: Array<Array<{ title: string; detail: string; icon: FlowIcon }>> = [
  [
    { title: "需求文档", detail: "背景 · 目标 · 约束", icon: "document" },
    { title: "功能清单", detail: "角色 · 模块 · 流程", icon: "checklist" },
    { title: "方案蓝图", detail: "架构 · 边界 · 关系", icon: "blueprint" },
    { title: "估算与报价", detail: "人日 · 周期 · 建议", icon: "quote" },
  ],
  [
    { title: "系统现状", detail: "系统 · 接口 · 约束", icon: "systems" },
    { title: "接口关系", detail: "调用 · 协议 · 边界", icon: "connection" },
    { title: "数据与部署", detail: "数据流 · 环境 · 安全", icon: "database" },
    { title: "实施计划", detail: "依赖 · 联调 · 上线", icon: "calendar" },
  ],
  [
    { title: "现状诊断", detail: "业务 · 系统 · 痛点", icon: "diagnosis" },
    { title: "目标蓝图", detail: "目标 · 能力 · 范围", icon: "target" },
    { title: "分阶段路线", detail: "优先级 · 阶段 · 里程碑", icon: "roadmap" },
    { title: "风险与投入", detail: "资源 · 成本 · 风险", icon: "shield" },
  ],
];

function ScenarioIcon({ index }: { index: number }) {
  if (index === 1) {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M8.5 3.5v4h-4m11-4v4h4m-11 13v-4h-4m11 4v-4h4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 7.5h7v9h-7z" rx="1.5" />
        <path d="M4.5 7.5v9m15-9v9" strokeLinecap="round" />
      </svg>
    );
  }
  if (index === 2) {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M5 19V12m7 7V5m7 14V9" strokeLinecap="round" />
        <path d="M3 21h18" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="m9 9-2 2 2 2m6-4 2 2-2 2M8 21h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlowStepIcon({ type }: { type: FlowIcon }) {
  const common = "h-7 w-7";
  const paths: Record<FlowIcon, React.ReactNode> = {
    document: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5M10 12h5m-5 4h5" /></>,
    checklist: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m7 9 1.4 1.4L11 7.8M13 9h4m-10 6 1.4 1.4L11 13.8M13 15h4" /></>,
    blueprint: <><path d="M5 6h5v4H5zm9 8h5v4h-5zM5 14h5v4H5zm9-8h5v4h-5z" /><path d="M10 8h4M7.5 10v4m9-4v4M10 16h4" /></>,
    quote: <><path d="M5 19V9m5 10V5m5 14v-7m5 7V8" /><path d="M4 21h17" /></>,
    systems: <><rect x="3" y="5" width="8" height="6" rx="1" /><rect x="13" y="13" width="8" height="6" rx="1" /><path d="M7 15v2h6M17 9V7h-6" /></>,
    connection: <><path d="M8 7H6a3 3 0 0 0 0 6h3m7-2h2a3 3 0 0 1 0 6h-3" /><path d="M8 12h8m-7-3 6 6" /></>,
    database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 3h2" /></>,
    diagnosis: <><circle cx="10" cy="10" r="6" /><path d="m14.5 14.5 5 5M7 11l2-2 2 2 3-4" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="m15 9 5-5m0 0h-4m4 0v4" /></>,
    roadmap: <><path d="M5 18c2-5 4-7 7-7s4-3 7-6" /><circle cx="5" cy="18" r="2" /><circle cx="12" cy="11" r="2" /><circle cx="19" cy="5" r="2" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
}

function ScenarioFlow({ index, steps }: { index: number; steps?: Array<{ title: string; detail: string }> }) {
  const defaultFlow = flows[index] || flows[0];
  const flow = defaultFlow.map((item, stepIndex) => ({ ...item, ...(steps?.[stepIndex] || {}) }));

  return (
    <div className="relative mt-7">
      <div className="pointer-events-none absolute inset-x-4 top-1/2 hidden h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent lg:block" />
      <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_22px_1fr_22px_1fr_22px_1fr] lg:items-center lg:gap-2">
        {flow.map((step, stepIndex) => (
          <Fragment key={step.title}>
            <div className="group min-h-[142px] rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-[0_14px_35px_rgba(15,70,150,0.08)] transition duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-[0_18px_40px_rgba(15,91,220,0.14)]">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-[#1769ed] ring-1 ring-blue-100 transition group-hover:from-[#1769ed] group-hover:to-[#0a55d5] group-hover:text-white">
                  <FlowStepIcon type={step.icon} />
                </span>
                <span className="font-display text-[11px] font-bold tracking-[0.12em] text-blue-300">0{stepIndex + 1}</span>
              </div>
              <div className="mt-4 text-[15px] font-bold text-primary">{step.title}</div>
              <div className="mt-1 whitespace-nowrap text-[11px] text-slate-500">{step.detail}</div>
            </div>
            {stepIndex < flow.length - 1 && (
              <div className="hidden items-center justify-center text-[#2877ee] lg:flex" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 12h15m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function SolutionTabs() {
  const [scenarios, setScenarios] = useState(fallbackScenarios);
  const [active, setActive] = useState(0);

  useEffect(() => {
    fetch("/api/content/scenarios")
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success && payload.data?.length) setScenarios(payload.data);
      })
      .catch(() => undefined);
  }, []);

  const visibleScenarios = scenarios.slice(0, 3);
  const current = visibleScenarios[active] || fallbackScenarios[0];

  return (
    <section id="scenarios" className="relative overflow-hidden bg-white py-14 md:py-20" aria-labelledby="scenarios-title">
      <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-blue-50/70 blur-3xl" />
      <div className="section-shell relative">
        <div className="section-heading">
          <div className="section-kicker">从哪类项目开始</div>
          <h2 id="scenarios-title">用真实项目验证交付成果</h2>
          <p>选择与当前业务最接近的项目类型，直接查看需要解决的项目难点、交付内容和最终成果。</p>
        </div>

        <div className="mt-8 grid overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_22px_65px_rgba(15,57,110,0.1)] md:mt-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="border-b border-slate-200 bg-gradient-to-b from-white to-[#f8fbff] p-4 sm:p-5 lg:border-b-0 lg:border-r lg:p-6">
            <div role="tablist" aria-label="项目场景" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {visibleScenarios.map((scenario, index) => {
                const selected = active === index;
                return (
                  <button
                    key={scenario.title}
                    id={`scenario-tab-${index}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`scenario-panel-${index}`}
                    onClick={() => setActive(index)}
                    className={`group flex min-h-[88px] w-full items-center gap-3 rounded-2xl border px-4 text-left transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 lg:min-h-[104px] ${
                      selected
                        ? "border-blue-500 bg-gradient-to-br from-[#1769ed] to-[#0a55d5] text-white shadow-[0_15px_30px_rgba(18,91,220,0.25)]"
                        : "border-slate-200 bg-white text-primary hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg"
                    }`}
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${selected ? "bg-white/12 text-white ring-1 ring-white/20" : "bg-blue-50 text-[#1769ed]"}`}>
                      {scenario.icon || String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:hidden lg:flex ${selected ? "bg-white/12 text-white" : "bg-[#f6f9ff] text-[#1769ed] ring-1 ring-blue-100"}`}>
                      <ScenarioIcon index={index} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-bold leading-5 lg:text-[17px]">{scenario.title}</span>
                    <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1 ${selected ? "text-white" : "text-slate-400"}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>

          <div id={`scenario-panel-${active}`} aria-labelledby={`scenario-tab-${active}`} className="relative overflow-hidden p-6 sm:p-8 lg:p-9" role="tabpanel">
            <div className="pointer-events-none absolute -right-20 top-5 h-64 w-64 rounded-full bg-blue-50/70 blur-3xl" />
            <div className="relative">
              <div className="inline-flex rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#1769ed]">{current.subtitle || "项目场景"}</div>
              <h3 className="mt-3 text-2xl font-bold text-primary sm:text-3xl">{current.title}</h3>

              <ScenarioFlow index={active} steps={current.flowSteps} />

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/80 to-white p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white shadow-[0_8px_18px_rgba(244,63,94,0.22)]">!</span>
                    <div>
                      <div className="font-semibold text-rose-600">典型难点</div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{current.pain}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/90 to-white p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1769ed] text-white shadow-[0_8px_18px_rgba(23,105,237,0.22)]">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m6 12 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <div>
                      <div className="font-semibold text-[#1769ed]">形成成果</div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{current.solution}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative mt-6 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[#1769ed]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5h14v11H9l-4 3z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                先交付可讨论版本，再与项目人员确认关键范围、成本与承诺。
              </p>
              <Link href={`/solution/${current.slug}`} className="inline-flex shrink-0 items-center text-sm font-semibold text-[#1769ed] transition hover:text-blue-800">
                查看场景详情
                <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
