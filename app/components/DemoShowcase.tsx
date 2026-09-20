"use client";

import { useEffect, useState } from "react";
import { defaultDeliveryContent } from "../../lib/delivery-content";

function FlowConnector({ label }: { label: string }) {
  return (
    <div className="delivery-connector" aria-label={label}>
      <span className="flow-packet" />
      <span className="flow-packet" style={{ animationDelay: "-0.8s" }} />
      <span className="flow-packet" style={{ animationDelay: "-1.6s" }} />
      <svg className="flow-arrow h-5 w-5 text-accent1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

function WorkshopGear({ reverse = false, small = false }: { reverse?: boolean; small?: boolean }) {
  return (
    <svg
      className={`workshop-gear ${reverse ? "workshop-gear-reverse" : ""} ${small ? "h-14 w-14" : "h-20 w-20"}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="8" />
      <circle cx="50" cy="50" r="9" fill="none" stroke="currentColor" strokeWidth="7" />
      {[0, 45, 90, 135].map((angle) => (
        <g key={angle} transform={`rotate(${angle} 50 50)`}>
          <path d="M46 6h8l4 17H42z" fill="currentColor" />
          <path d="M46 94h8l4-17H42z" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

function FragmentIcon({ index }: { index: number }) {
  const paths = [
    "M8 5h10l5 5v17H8V5Zm10 0v5h5M12 16h7M12 21h7",
    "M9 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 26v-3.5A5.5 5.5 0 0 1 9 17h1a5.5 5.5 0 0 1 5.5 5.5V26m1.5-8.5a5.5 5.5 0 0 1 6.5 5.5v3",
    "M5 6h22v20H5V6Zm0 6h22M12 6v20m7-20v20",
    "M6 7h20v14H13l-6 5v-5H6V7Zm5 5h10m-10 4h7",
    "M4.5 10h9l2-3h12v18h-23V10Z",
    "M6 6h20v8H6V6Zm0 12h20v8H6v-8Zm4-8h.01M10 22h.01m5-12h7m-7 12h7",
  ];

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#4489ff] to-[#1260e8] text-white shadow-[0_7px_16px_rgba(31,111,255,0.2)]" aria-hidden="true">
      <svg className="h-5 w-5" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[index]} />
      </svg>
    </span>
  );
}

function SummaryIcon({ index }: { index: number }) {
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#edf4ff] text-accent1" aria-hidden="true">
      {index === 0 ? (
        <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="5" width="20" height="22" rx="4" /><path d="M11 11h10M11 16h10m-10 5h6" /><path d="m20 20 2 2 4-5" />
        </svg>
      ) : index === 1 ? (
        <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="16" cy="7" r="3" /><circle cx="7" cy="21" r="3" /><circle cx="25" cy="21" r="3" /><path d="M14 9.5 9 18m9-8.5 5 8M10 21h12" />
        </svg>
      ) : (
        <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="5" width="19" height="22" rx="4" /><path d="M10 11h9m-9 5h9m-9 5h5" /><circle cx="24" cy="21" r="5" /><path d="m22 21 1.5 1.5L27 19" />
        </svg>
      )}
    </span>
  );
}

export default function DemoShowcase() {
  const [content, setContent] = useState(defaultDeliveryContent.demo);

  useEffect(() => {
    fetch("/api/content/delivery")
      .then((response) => response.json())
      .then((payload) => payload.success && payload.data?.demo && setContent(payload.data.demo))
      .catch(() => undefined);
  }, []);

  return (
    <section id="demo" className="project-grid relative overflow-hidden bg-bgGray py-14 md:py-20" aria-labelledby="demo-title">
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 opacity-55 [background-image:radial-gradient(circle_at_1px_1px,rgba(31,111,255,0.16)_1px,transparent_0)] [background-size:22px_22px]" aria-hidden="true" />
      <div className="section-shell relative">
        <div className="section-heading">
          <div className="section-kicker">{content.kicker}</div>
          <h2 id="demo-title">{content.title}</h2>
          <p>{content.description}</p>
        </div>

        <div className="mt-9" aria-label="从碎片化信息到结构化成果的动画交付流程">
          <div className="hidden items-center text-center text-base font-bold text-primary md:grid md:grid-cols-[1fr_64px_1.1fr_64px_1fr]">
            <div>零散项目材料</div>
            <svg className="mx-auto h-5 w-7 text-accent1 md:w-14" viewBox="0 0 56 20" fill="none" aria-hidden="true">
              <path d="M2 10h47m-7-6 7 6-7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-accent1">方案与成果加工</div>
            <svg className="mx-auto h-5 w-7 text-accent1 md:w-14" viewBox="0 0 56 20" fill="none" aria-hidden="true">
              <path d="M2 10h47m-7-6 7 6-7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>可交付成果包</div>
          </div>

          <div className="delivery-flow-canvas mt-5 grid items-stretch gap-0 md:grid-cols-[1fr_64px_1.1fr_64px_1fr]">
            <div className="rounded-[1.35rem] border border-[#dbe5f0] bg-white p-5 shadow-[0_18px_48px_rgba(38,81,129,0.09)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-accent1">项目原始材料</div>
                  <h3 className="mt-2 text-lg font-bold text-primary">企业已有的零散资料</h3>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {content.fragments.slice(0, 6).map((fragment, index) => (
                  <div
                    key={fragment.title}
                    className="fragment-card flex min-h-[76px] items-center gap-2.5 rounded-xl border border-[#dbe5f0] bg-white px-3 py-3 shadow-[0_7px_20px_rgba(7,27,51,0.055)]"
                    style={{ animationDelay: `${index * -0.58}s` }}
                  >
                    <FragmentIcon index={index} />
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-primary">{fragment.title}</span>
                      <div className="mt-1 text-[11px] leading-4 text-slate-500">{fragment.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex gap-2.5 rounded-xl bg-[#f1f6fc] px-3 py-3 text-xs leading-5 text-slate-600">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent1 text-[11px] font-bold text-accent1">i</span>
                <span>无需提前整理成完整资料库，当前项目已有材料即可开始。</span>
              </div>
            </div>

            <FlowConnector label="碎片信息进入成果加工工坊" />

            <div className="workshop-panel relative overflow-hidden rounded-[1.35rem] border border-[#1f6fff] bg-[radial-gradient(circle_at_50%_38%,#0b3977_0%,#071b33_58%,#05162c_100%)] p-5 text-white shadow-[0_24px_55px_rgba(7,27,51,0.24)]">
              <div className="workshop-scan absolute inset-x-0 h-20 bg-gradient-to-b from-transparent via-accent2/15 to-transparent" aria-hidden="true" />
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold tracking-[0.08em] text-accent2">方案与成果加工</div>
                  <h3 className="mt-1.5 text-xl font-semibold">项目交付工坊</h3>
                </div>
                <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300">持续加工</span>
              </div>

              <div className="relative z-10 mt-3 flex h-28 items-center justify-center text-accent2 before:absolute before:bottom-2 before:h-8 before:w-40 before:rounded-[50%] before:bg-accent1/25 before:blur-md">
                <WorkshopGear />
                <div className="-ml-2 mt-10 text-accent1"><WorkshopGear reverse small /></div>
              </div>

              <div className="relative z-10 mt-3 grid grid-cols-2 gap-2.5">
                {content.workshopSteps.slice(0, 4).map((step, index) => (
                  <div key={step.title} className="workshop-step rounded-xl border border-white/10 bg-white/[0.055] px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="workshop-step-dot h-2 w-2 rounded-full bg-accent2" style={{ animationDelay: `${index * 0.45}s` }} />
                      <span className="text-sm font-semibold text-white">{step.title}</span>
                    </div>
                    <div className="mt-1.5 text-[11px] leading-4 text-slate-400">
                      {step.detail}
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative z-10 mt-4 flex gap-2.5 border-t border-white/15 pt-3 text-xs leading-5 text-slate-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent2 text-[11px] font-bold text-accent2">i</span>
                <span>服务完成材料梳理和成果关联，范围、价格与承诺由项目人员确认。</span>
              </div>
            </div>

            <FlowConnector label="成果加工工坊输出结构化成果" />

            <div className="rounded-[1.35rem] border border-[#dbe5f0] bg-white p-5 shadow-[0_18px_48px_rgba(38,81,129,0.09)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-accent1">项目成果包</div>
                  <h3 className="mt-2 text-lg font-bold text-primary">可直接继续工作的成果</h3>
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                {content.deliverables.slice(0, 4).map((item, index) => (
                  <div key={item.title} className="deliverable-card flex gap-3 rounded-xl border border-[#bdd2f4] bg-white px-3 py-3 shadow-[0_7px_20px_rgba(7,27,51,0.05)]" style={{ animationDelay: `${index * 1.15}s` }}>
                    <span className="font-display flex h-6 min-w-7 items-center justify-center rounded-md bg-blue-50 text-xs font-bold text-accent1">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-primary">{item.title}</span>
                        <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-slate-500">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex gap-2.5 rounded-xl bg-[#f1f6fc] px-3 py-3 text-xs leading-5 text-slate-600">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent1 text-[11px] font-bold text-accent1">i</span>
                <span>所有成果基于同一套项目事实，范围变化时可同步检查影响。</span>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-5 lg:grid-cols-3" aria-label="交付流程三个模块说明">
            {content.summaries.slice(0, 3).map((item, index) => (
              <article key={item.title} className="rounded-2xl border border-[#dbe5f0] bg-white p-5 shadow-[0_14px_36px_rgba(38,81,129,0.07)] md:p-6">
                <div className="flex items-center gap-4">
                  <SummaryIcon index={index} />
                  <h3 className="text-lg font-bold text-primary">{item.title}</h3>
                </div>
                <p className="mt-4 min-h-[84px] text-sm leading-7 text-slate-600">{item.description}</p>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-semibold leading-6 text-accent1">
                  <span>{item.value}</span>
                  <svg className="h-5 w-7 shrink-0" viewBox="0 0 28 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M1 10h23m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
