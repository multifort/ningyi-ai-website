"use client";

import { useEffect, useState } from "react";

type CapabilityModule = {
  icon: string;
  title: string;
  description: string;
};

const fallbackModules: CapabilityModule[] = [
  {
    icon: "01",
    title: "先把项目边界讲清楚",
    description: "从现有文档、表格和会议纪要中整理目标、范围、约束、需求、外部系统和待确认事项。",
  },
  {
    icon: "02",
    title: "让方案、周期与报价一致",
    description: "依据功能范围组织方案、角色人日、项目周期和报价建议，关键估算都有对应依据并可调整。",
  },
  {
    icon: "03",
    title: "让范围变化有迹可循",
    description: "需求、功能、方案、估算、报价、实施与汇报共享同一项目事实；范围变化时同步检查关联成果。",
  },
];

function CapabilityIllustration({ index }: { index: number }) {
  if (index === 0) {
    return (
      <svg viewBox="0 0 360 200" className="h-full w-full" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="cap-doc" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffffff" /><stop offset="1" stopColor="#dfeaff" /></linearGradient>
          <linearGradient id="cap-folder" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#74a9ff" /><stop offset="1" stopColor="#1764e8" /></linearGradient>
          <filter id="cap-shadow"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#275ea8" floodOpacity=".18" /></filter>
        </defs>
        <ellipse cx="180" cy="172" rx="145" ry="19" fill="#edf4ff" />
        <path d="M58 82h74l11 13h73v72H58V82Z" fill="url(#cap-folder)" filter="url(#cap-shadow)" />
        <path d="M115 38h119l31 31v95H115V38Z" fill="url(#cap-doc)" stroke="#c8d9f5" filter="url(#cap-shadow)" />
        <path d="M234 38v31h31" fill="#cadcff" />
        <path d="M139 66h66m-66 16h82m-82 16h68m-68 16h76m-76 16h47" stroke="#b9cae7" strokeWidth="6" strokeLinecap="round" />
        <rect x="232" y="88" width="74" height="66" rx="10" fill="#fff" stroke="#c8d9f5" filter="url(#cap-shadow)" />
        {[0, 1, 2].map((item) => <g key={item} transform={`translate(245 ${104 + item * 17})`}><circle cx="6" cy="6" r="6" fill="#3279ed" /><path d="m3 6 2 2 4-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 6h31" stroke="#b9cae7" strokeWidth="4" strokeLinecap="round" /></g>)}
        <circle cx="222" cy="137" r="38" fill="rgba(255,255,255,.5)" stroke="#133f86" strokeWidth="8" filter="url(#cap-shadow)" />
        <path d="m249 165 28 28" stroke="#133f86" strokeWidth="12" strokeLinecap="round" />
      </svg>
    );
  }

  if (index === 1) {
    return (
      <svg viewBox="0 0 360 200" className="h-full w-full" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="cap-panel" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset="1" stopColor="#dce9ff" /></linearGradient>
          <filter id="cap-shadow-2"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#275ea8" floodOpacity=".18" /></filter>
        </defs>
        <ellipse cx="180" cy="172" rx="148" ry="18" fill="#edf4ff" />
        <rect x="34" y="57" width="115" height="105" rx="9" fill="url(#cap-panel)" stroke="#a9c5f2" filter="url(#cap-shadow-2)" />
        <path d="M34 73h115" stroke="#2f77e8" strokeWidth="8" /><circle cx="46" cy="64" r="3" fill="#fff" /><circle cx="56" cy="64" r="3" fill="#fff" /><circle cx="66" cy="64" r="3" fill="#fff" />
        <rect x="54" y="95" width="34" height="16" rx="3" fill="#68a1ff" /><rect x="94" y="122" width="34" height="16" rx="3" fill="#68a1ff" /><path d="M71 111v19h23m17-8v-11H88" stroke="#2b6bd7" strokeWidth="3" />
        <path d="M137 78h88l10 80H127l10-80Z" fill="#8eb7f6" opacity=".45" />
        <rect x="139" y="72" width="91" height="91" rx="8" fill="url(#cap-panel)" stroke="#a9c5f2" filter="url(#cap-shadow-2)" />
        <path d="M151 72v-10m20 10v-10m20 10v-10m20 10v-10" stroke="#1f6fff" strokeWidth="5" strokeLinecap="round" />
        {[0, 1, 2, 3].map((row) => [0, 1, 2, 3].map((col) => <rect key={`${row}-${col}`} x={151 + col * 17} y={88 + row * 16} width="11" height="10" rx="2" fill={row === 2 && col === 2 ? "#1f6fff" : "#d4e2f8"} />))}
        <rect x="242" y="57" width="85" height="107" rx="9" fill="url(#cap-panel)" stroke="#a9c5f2" filter="url(#cap-shadow-2)" />
        <circle cx="268" cy="96" r="18" fill="#2f77e8" /><text x="268" y="103" textAnchor="middle" fill="#fff" fontSize="21" fontWeight="700">¥</text>
        <path d="M258 126h55m-55 13h42m-42 13h50" stroke="#8eb2e8" strokeWidth="5" strokeLinecap="round" />
        <circle cx="192" cy="43" r="16" fill="#3279ed" filter="url(#cap-shadow-2)" /><path d="m184 43 6 6 11-14" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  const nodes = [
    { x: 144, y: 7, label: "需求", bars: false },
    { x: 248, y: 46, label: "方案", bars: true },
    { x: 248, y: 124, label: "估算", bars: false },
    { x: 144, y: 163, label: "报价", bars: true },
    { x: 40, y: 124, label: "实施", bars: false },
    { x: 40, y: 46, label: "汇报", bars: true },
  ];
  return (
    <svg viewBox="0 0 360 210" className="h-full w-full" fill="none" aria-hidden="true">
      <defs><filter id="cap-shadow-3"><feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#275ea8" floodOpacity=".16" /></filter></defs>
      {nodes.map((node) => <path key={node.label} d={`M180 105 L${node.x + 36} ${node.y + 20}`} stroke="#3480f2" strokeWidth="2" strokeDasharray="5 5" />)}
      <circle cx="180" cy="105" r="34" fill="#fff" stroke="#d3e1f6" filter="url(#cap-shadow-3)" />
      <path d="M165 98a17 17 0 0 1 29-9m2-8v11h-11M195 111a17 17 0 0 1-29 9m-2 8v-11h11" stroke="#276bd8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {nodes.map((node) => (
        <g key={node.label} transform={`translate(${node.x} ${node.y})`}>
          <rect width="72" height="40" rx="10" fill="#fff" stroke="#cbdcf5" filter="url(#cap-shadow-3)" />
          {node.bars ? (
            <path d="M14 27V19m7 8V12m7 15V16" stroke="#3178e8" strokeWidth="3.5" strokeLinecap="round" />
          ) : (
            <path d="M13 14h17m-17 6h17m-17 6h12" stroke="#3178e8" strokeWidth="3" strokeLinecap="round" />
          )}
          <text x="51" y="25" textAnchor="middle" fill="#34465c" fontSize="11" fontWeight="600">{node.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ProductCapability() {
  const [modules, setModules] = useState(fallbackModules);

  useEffect(() => {
    fetch("/api/content/capability")
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success && payload.data?.length) setModules(payload.data);
      })
      .catch(() => undefined);
  }, []);

  return (
    <section id="capability" className="relative overflow-hidden bg-white py-14 md:py-20" aria-labelledby="capability-title">
      <div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full border-[54px] border-blue-50/60" aria-hidden="true" />
      <div className="pointer-events-none absolute right-[18%] top-7 h-24 w-40 opacity-45 [background-image:radial-gradient(circle_at_1px_1px,rgba(31,111,255,0.2)_2px,transparent_0)] [background-size:20px_20px]" aria-hidden="true" />
      <div className="section-shell relative">
        <div>
          <div className="section-heading max-w-none">
            <div className="section-kicker">为什么成果能直接使用</div>
            <h2 id="capability-title">完整、可核对、能继续修改的项目成果</h2>
          </div>
          <p className="mt-4 max-w-4xl text-base leading-8 text-slate-600">
            围绕软件与数字化项目的真实售前工作，把项目理解、范围确认、方案组织和成果交付连成一体，让需求、成本、报价与实施内容保持同一口径。
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:mt-10 lg:grid-cols-3">
          {modules.slice(0, 3).map((module, index) => (
            <article
              key={module.title}
              className="group relative flex min-h-[500px] flex-col overflow-hidden rounded-2xl border border-[#dbe5f0] bg-white p-6 shadow-[0_14px_38px_rgba(38,81,129,0.07)] transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_24px_60px_rgba(7,27,51,0.11)]"
            >
              <div className="flex items-center justify-between">
                <div className="font-display text-2xl font-bold tracking-[-0.03em] text-accent1">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <svg className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-accent1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5 12h14m-6-6l6 6-6 6" />
                </svg>
              </div>
              <div className="mt-1 h-[210px] w-full transition duration-500 group-hover:scale-[1.025]">
                <CapabilityIllustration index={index} />
              </div>
              <h3 className="mt-2 text-xl font-bold leading-8 text-primary">{module.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{module.description}</p>
              <div className="mt-auto pt-6">
                <div className="h-1 w-12 rounded-full bg-gradient-to-r from-accent1 to-accent2 transition-all group-hover:w-20" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
