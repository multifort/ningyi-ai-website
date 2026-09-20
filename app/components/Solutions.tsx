"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Solution = {
  icon: string;
  title: string;
  slug: string;
  description: string;
  heroImage?: string;
  features: string[];
};

const fallbackSolutions: Solution[] = [
  {
    icon: "软件团队",
    title: "中小软件公司",
    slug: "software-project",
    description: "客户资料刚到，快速形成一版可讨论、可估算、可报价的项目成果。",
    heroImage: "/images/project-delivery/software-team-project-review.png",
    features: ["资料不完整也能开始", "先识别范围与关键缺口", "把时间留给判断与沟通"],
  },
  {
    icon: "集成服务",
    title: "系统集成与数字化服务商",
    slug: "system-integration",
    description: "统一系统边界、接口、实施与报价口径，降低跨业务和技术团队反复整理。",
    heroImage: "/images/project-delivery/integration-team-planning.png",
    features: ["梳理系统与接口关系", "工作量和报价保持联动", "实施依赖清晰可追踪"],
  },
  {
    icon: "项目角色",
    title: "售前、项目经理与咨询顾问",
    slug: "project-team",
    description: "同时推进多个项目时，让需求、方案、估算和汇报材料保持同一项目口径。",
    heroImage: "/images/project-delivery/project-team-coordination.png",
    features: ["减少重复复制与改写", "范围变化提示关联影响", "成果可继续编辑和复用"],
  },
];

export default function Solutions() {
  const [solutions, setSolutions] = useState(fallbackSolutions);

  useEffect(() => {
    fetch("/api/content/solutions")
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success && payload.data?.length) setSolutions(payload.data);
      })
      .catch(() => undefined);
  }, []);

  return (
    <section id="solution" className="bg-bgGray py-14 md:py-20" aria-labelledby="solution-title">
      <div className="section-shell">
        <div className="section-heading">
          <div className="section-kicker">适合哪些团队</div>
          <h2 id="solution-title">项目多、时间紧、材料散时更有价值</h2>
          <p>适合需要持续完成需求分析、项目方案、工作量估算、报价和客户汇报，并希望减少重复整理的软件与数字化服务团队。</p>
        </div>

        <div className="mt-8 grid gap-5 md:mt-10 lg:grid-cols-3">
          {solutions.slice(0, 3).map((solution, index) => (
            <article key={solution.title} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(7,27,51,0.06)] transition hover:-translate-y-1 hover:shadow-[0_26px_68px_rgba(7,27,51,0.12)]">
              <div className="relative aspect-[16/9] overflow-hidden bg-primary">
                <Image
                  src={solution.heroImage || fallbackSolutions[index % fallbackSolutions.length].heroImage!}
                  alt={`${solution.title}的项目成果工作场景`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover transition duration-700 group-hover:scale-[1.035]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/70 via-primary/5 to-transparent" />
                <div className="absolute bottom-4 left-5 rounded-full border border-white/15 bg-primary/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                  {solution.icon}
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-primary">{solution.title}</h3>
                <p className="mt-3 min-h-[4.5rem] text-sm leading-7 text-slate-600">{solution.description}</p>
                <ul className="mt-5 space-y-3">
                  {solution.features.slice(0, 3).map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm leading-6 text-slate-700">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent1" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href={`/solution/${solution.slug}`} className="mt-7 inline-flex items-center text-sm font-semibold text-accent1 hover:text-blue-700">
                  查看适用方式
                  <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
