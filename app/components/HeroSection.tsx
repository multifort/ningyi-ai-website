"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type HeroConfig = {
  title: string;
  subtitle: string;
  ctaPrimaryText: string;
  ctaPrimaryLink: string;
  ctaSecondaryText: string;
  ctaSecondaryLink: string;
};

type HeroSlide = {
  imagePath: string;
  edgeBackgroundLeft: string;
  edgeBackgroundRight: string;
  kicker: string;
  title: string;
  description: string;
  benefits: string[];
  alt: string;
};

const defaultConfig: HeroConfig = {
  title: "企业项目方案与成果智能交付服务",
  subtitle: "把文档、会议纪要、功能表格与需求片段，整理成可汇报、可评审、可执行的项目成果。",
  ctaPrimaryText: "开始生成方案",
  ctaPrimaryLink: "/product/start",
  ctaSecondaryText: "交付成果",
  ctaSecondaryLink: "#case",
};

const defaultSlides: HeroSlide[] = [
  {
    imagePath: "/images/project-delivery/hero-service-overview-v4.png",
    edgeBackgroundLeft: "linear-gradient(180deg, #000620 0%, #000822 25%, #000823 50%, #000925 75%, #010a1e 100%)",
    edgeBackgroundRight: "linear-gradient(180deg, #010924 0%, #010925 25%, #000924 50%, #010925 75%, #010c25 100%)",
    kicker: "从项目材料到完整成果",
    title: "企业项目方案与成果智能交付服务",
    description: "把文档、会议纪要、功能表格与需求片段，整理成可汇报、可评审、可执行的项目成果。",
    benefits: ["方案形成更快", "内容逻辑更清晰", "交付结果更一致"],
    alt: "零散项目材料经过交付工坊形成多类项目成果",
  },
  {
    imagePath: "/images/project-delivery/hero-project-understanding-v4.png",
    edgeBackgroundLeft: "linear-gradient(180deg, #010e28 0%, #000d2b 25%, #010e2a 50%, #010d2a 75%, #010f26 100%)",
    edgeBackgroundRight: "linear-gradient(180deg, #02102d 0%, #010d2f 25%, #020f35 50%, #01123c 75%, #011130 100%)",
    kicker: "项目理解",
    title: "先把零散资料，\n整理成一套清晰可执行的\n项目事实",
    description: "从需求片段、会议纪要、功能清单与外部系统信息中，\n快速识别目标、范围、约束与待确认事项，\n帮助团队先把项目共识建立起来。",
    benefits: ["目标清楚", "边界明确", "缺口可确认"],
    alt: "零散项目资料汇入结构清晰的项目事实文件",
  },
  {
    imagePath: "/images/project-delivery/hero-scope-cost-linkage-v4.png",
    edgeBackgroundLeft: "linear-gradient(180deg, #00051a 0%, #010921 25%, #010b26 50%, #010924 75%, #010b1f 100%)",
    edgeBackgroundRight: "linear-gradient(180deg, #020820 0%, #010722 25%, #000b32 50%, #010d3b 75%, #010b27 100%)",
    kicker: "范围与成本联动",
    title: "范围一变，工作量、周期与报价同步更新",
    description: "让功能范围、角色投入、实施周期与报价建议保持关联，减少重复修改、口径冲突和沟通成本。",
    benefits: ["工作量联动", "周期联动", "报价依据清楚"],
    alt: "项目功能范围与工作量、周期和报价建议保持关联",
  },
  {
    imagePath: "/images/project-delivery/hero-multi-deliverable-v4.png",
    edgeBackgroundLeft: "linear-gradient(180deg, #010c23 0%, #010b24 25%, #010d26 50%, #010b24 75%, #010e22 100%)",
    edgeBackgroundRight: "linear-gradient(180deg, #010d25 0%, #020b22 25%, #010a22 50%, #010b23 75%, #010e26 100%)",
    kicker: "多成果一致交付",
    title: "一份项目事实，持续形成多类一致成果",
    description: "需求、功能、方案、估算、报价、实施与汇报共享同一项目口径，减少重复整理与交付偏差。",
    benefits: ["统一项目事实", "七类标准成果", "变更影响可追踪"],
    alt: "统一项目事实生成多种一致的项目成果文件",
  },
];

function CarouselNavIcon({ index }: { index: number }) {
  if (index === 2) {
    return (
      <svg viewBox="0 0 48 48" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true">
        <path d="M24 5l17 9.5v19L24 43 7 33.5v-19z" />
        <path d="M7 14.5L24 24l17-9.5M24 24v19" />
      </svg>
    );
  }

  if (index === 3) {
    return (
      <svg viewBox="0 0 48 48" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="24" cy="24" r="18" />
        <path d="M15 24l6 6 13-15" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 5h15l8 8v30H13z" />
      <path d="M28 5v9h9M19 23h11M19 29h11M19 35h8" />
    </svg>
  );
}

export default function HeroSection() {
  const [config, setConfig] = useState(defaultConfig);
  const [slides, setSlides] = useState(defaultSlides);
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const revealTimer = window.setTimeout(() => setReady(true), 80);

    fetch("/api/content/hero")
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.success) return;
        const remote = payload.data?.config;
        if (remote) {
          setConfig({
            title: remote.title || defaultConfig.title,
            subtitle: remote.subtitle || defaultConfig.subtitle,
            ctaPrimaryText: remote.ctaPrimaryText || remote.cta_primary_text || defaultConfig.ctaPrimaryText,
            ctaPrimaryLink: remote.ctaPrimaryLink || remote.cta_primary_link || defaultConfig.ctaPrimaryLink,
            ctaSecondaryText: remote.ctaSecondaryText || remote.cta_secondary_text || defaultConfig.ctaSecondaryText,
            ctaSecondaryLink: remote.ctaSecondaryLink || remote.cta_secondary_link || defaultConfig.ctaSecondaryLink,
          });
        }

        const remoteImages = payload.data?.images as Array<Partial<HeroSlide>> | undefined;
        if (remoteImages?.length) {
          setSlides(
            remoteImages.map((image, index) => ({
              ...defaultSlides[index % defaultSlides.length],
              imagePath: image.imagePath || defaultSlides[index % defaultSlides.length].imagePath,
              kicker: image.kicker || defaultSlides[index % defaultSlides.length].kicker,
              title: image.title || defaultSlides[index % defaultSlides.length].title,
              description: image.description || defaultSlides[index % defaultSlides.length].description,
              benefits: image.benefits?.length ? image.benefits : defaultSlides[index % defaultSlides.length].benefits,
              alt: image.alt || defaultSlides[index % defaultSlides.length].alt,
            }))
          );
        }
      })
      .catch(() => undefined);

    return () => window.clearTimeout(revealTimer);
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || slides.length < 2) return;
    const slideTimer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      6800
    );
    return () => window.clearInterval(slideTimer);
  }, [slides.length]);

  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [active, slides.length]);

  const showPrevious = () => {
    setActive((current) => (current - 1 + slides.length) % slides.length);
  };

  const showNext = () => {
    setActive((current) => (current + 1) % slides.length);
  };

  return (
    <section id="hero" className="relative min-h-[700px] overflow-hidden bg-[#010c1f] text-white lg:h-[clamp(580px,100svh,760px)] lg:min-h-0" aria-roledescription="carousel" aria-label="企业项目成果宣传">
      <div className="absolute inset-0">
        {slides.map((slide, index) => (
          <div
            key={slide.imagePath}
            className={`hero-visual-layer transition-opacity duration-700 ${index === active ? "opacity-100" : "pointer-events-none opacity-0"}`}
            aria-hidden={index !== active}
          >
            <span className="absolute inset-y-0 left-0 w-1/2" style={{ backgroundImage: slide.edgeBackgroundLeft }} />
            <span className="absolute inset-y-0 right-0 w-1/2" style={{ backgroundImage: slide.edgeBackgroundRight }} />
            <Image
              src={slide.imagePath}
              alt={index === active ? slide.alt : ""}
              fill
              sizes="100vw"
              quality={95}
              className="hero-scene-image object-contain"
              priority={index === 0}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={showPrevious}
        aria-label="上一张宣传图"
        className="hero-arrow hero-arrow-left"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={showNext}
        aria-label="下一张宣传图"
        className="hero-arrow hero-arrow-right"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div className="section-shell hero-shell relative z-10 min-h-[700px] pb-10 pt-36 lg:flex lg:h-full lg:min-h-0 lg:items-center lg:pb-0 lg:pt-[76px]">
        <div>
          <div className={`hero-copy-panel max-w-[44rem] transition duration-700 ${active === 0 ? "lg:max-w-[440px] xl:max-w-[540px]" : active === 1 ? "lg:max-w-[520px] xl:max-w-[700px]" : "lg:max-w-[420px] xl:max-w-[650px]"} ${ready ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"}`}>
            {(() => {
              const slide = slides[active] || defaultSlides[0];
              const copy = active === 0
                ? { ...slide, title: config.title.replace("成果智能", "成果\n智能"), description: config.subtitle }
                : slide;
              return (
                <div key={`${slide.imagePath}-copy`} aria-live="polite">
                  <p className={`text-sm font-semibold tracking-[0.1em] text-accent2 sm:text-base ${active === 1 ? "flex items-center gap-3 text-accent1" : ""}`}>
                    {active === 1 && <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent1/15 text-accent1"><CarouselNavIcon index={1} /></span>}
                    {copy.kicker}
                  </p>
                  <h1 className={`mt-5 max-w-[42rem] whitespace-pre-line font-display text-[2.55rem] font-bold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl md:text-6xl ${active === 0 ? "lg:text-[2.6rem] xl:text-[3.5rem]" : active === 1 ? "lg:text-[2.65rem] xl:text-[3.35rem]" : "lg:text-[2.75rem] xl:text-[3.5rem]"}`}>
                    {copy.title}
                  </h1>
                  <p className={`mt-6 max-w-xl whitespace-pre-line text-base leading-8 text-slate-200 sm:text-lg ${active === 0 ? "lg:max-w-[380px] xl:max-w-xl" : ""} ${active === 1 ? "lg:leading-9" : ""}`}>{copy.description}</p>
                  {active !== 1 && (
                    <div className={`mt-7 grid grid-cols-3 gap-2 xl:flex xl:max-w-none xl:flex-wrap xl:gap-3 ${active === 0 ? "lg:max-w-[380px]" : ""}`}>
                      {copy.benefits.map((benefit, index) => (
                        <span key={benefit} className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.055] px-2 py-3 text-center text-xs font-semibold text-white backdrop-blur-md xl:px-5 xl:text-left xl:text-sm">
                          <span className={`mr-2 h-2 w-2 rounded-full ${index === 1 ? "bg-accent2" : index === 2 ? "bg-accentWarm" : "bg-accent1"}`} />
                          {benefit}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-8 flex flex-wrap gap-3">
                    <a href="/product/start" className="rounded-full bg-accent1 px-6 py-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(31,111,255,0.35)] transition hover:-translate-y-0.5 hover:bg-blue-600">开启你的定制之旅</a>
                    <a href="#case" className="rounded-full border border-white/20 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10">交付成果</a>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

      </div>
    </section>
  );
}
