"use client";

import { useEffect, useRef, useState } from "react";

type ValueStat = {
  label: string;
  value: number;
  suffix: string;
};

const fallbackStats: ValueStat[] = [
  { value: 1, suffix: "套", label: "贯穿始终的项目事实" },
  { value: 7, suffix: "类", label: "可继续编辑的标准成果" },
  { value: 3, suffix: "类", label: "事实、建议与待确认标记" },
];

function StatIcon({ index }: { index: number }) {
  if (index === 0) {
    return (
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
        <path d="M7.5 9.5h17a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M12 9.5V7.8A1.8 1.8 0 0 1 13.8 6h4.4A1.8 1.8 0 0 1 20 7.8v1.7M12.5 17l2.3 2.3 4.8-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (index === 1) {
    return (
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
        <path d="M9 5.5h10l5 5v16H9v-21Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M19 5.5v5h5M13 16h7M13 20.5h7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
      <path d="m6 14.2 8.2-8.2H23l4 4v8.8L18.8 27 6 14.2Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="21.5" cy="11.5" r="1.8" fill="currentColor" />
    </svg>
  );
}

export default function ValueNumber() {
  const [stats, setStats] = useState(fallbackStats);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/api/content/stats")
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success && payload.data?.length) setStats(payload.data.filter((item: { isActive?: boolean }) => item.isActive !== false));
      })
      .catch(() => undefined);

    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="value"
      ref={sectionRef}
      className="relative isolate overflow-hidden bg-white py-16 md:py-20 lg:py-24"
      aria-labelledby="value-title"
    >
      <div className="pointer-events-none absolute -left-28 -top-40 h-80 w-80 rounded-full border-[72px] border-blue-50/90" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-20 -top-32 h-52 w-52 rounded-full bg-blue-50/80" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -bottom-3 left-0 h-28 w-48 opacity-45"
        style={{ backgroundImage: "radial-gradient(circle, rgba(31,111,255,.18) 2px, transparent 2.5px)", backgroundSize: "17px 17px" }}
        aria-hidden="true"
      />

      <div className="section-shell relative grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
        <div className={`section-heading max-w-[720px] transition duration-700 ${visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"}`}>
          <div className="section-kicker">客户最终获得什么</div>
          <h2 id="value-title" className="mt-7 !text-[clamp(2.1rem,2.5vw,2.55rem)] !font-bold !leading-[1.14] tracking-[-0.035em] lg:whitespace-nowrap">
            交付一套能持续推进项目的成果
          </h2>
          <div className="mt-7 h-0.5 w-14 bg-gradient-to-r from-accent1 to-accent2" aria-hidden="true" />
          <p className="mt-8 !max-w-[690px] !text-[clamp(1rem,1.3vw,1.25rem)] !leading-[1.85]">
            先统一当前项目的需求、范围与关键约束，再形成方案、功能、估算、报价、实施计划和汇报材料；范围变化时，相关成果能够一起核对和调整。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3" role="list" aria-label="项目成果结构">
          {stats.slice(0, 3).map((stat, index) => (
            <article
              key={stat.label}
              role="listitem"
              className={`group relative min-h-[276px] overflow-hidden rounded-[1.35rem] border border-[#dbe5f0] bg-gradient-to-br from-white via-white to-[#f5f9ff] p-6 shadow-[0_14px_38px_rgba(33,85,145,0.09)] transition duration-700 md:min-h-[292px] ${
                visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
              }`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className="absolute -right-12 -top-5 h-52 w-52 rounded-bl-[100%] bg-gradient-to-br from-[#f8fbff] to-[#eef5ff]" aria-hidden="true" />
              <div className="absolute right-4 top-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#4285ff] to-[#1260e8] text-white shadow-[0_8px_18px_rgba(31,111,255,0.22)]" aria-hidden="true">
                <StatIcon index={index} />
              </div>
              <div className="relative flex min-h-[112px] items-end font-display text-[clamp(4.7rem,5.5vw,6.2rem)] font-bold leading-none tracking-[-0.055em] text-[#1260e8]">
                {stat.value}
                <span className="mb-2 ml-2 text-[clamp(1.35rem,1.65vw,1.75rem)] tracking-[-0.03em] text-[#1260e8]">{stat.suffix}</span>
              </div>
              <div className="relative mt-5 h-0.5 w-14 bg-gradient-to-r from-accent1 to-accent2" aria-hidden="true" />
              <div className="relative mt-7 text-[clamp(0.82rem,0.9vw,0.95rem)] font-semibold leading-6 text-[#263a52]">{stat.label}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
