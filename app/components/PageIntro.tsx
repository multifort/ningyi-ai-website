import Image from "next/image";
import Link from "next/link";

type PageIntroProps = {
  eyebrow: string;
  valueStatement?: string;
  title: string;
  description: string;
  primaryLabel?: string;
  primaryHref?: string;
  imagePath?: string;
  imageAlt?: string;
  benefits?: string[];
};

export default function PageIntro({
  eyebrow,
  valueStatement = "企业项目方案与成果智能交付服务",
  title,
  description,
  primaryLabel = "开始生成方案",
  primaryHref = "/product/start",
  imagePath,
  imageAlt = "企业项目成果交付场景",
  benefits = [],
}: PageIntroProps) {
  return (
    <section className="relative min-h-[610px] overflow-hidden bg-primary pb-14 pt-28 text-white md:pb-16 md:pt-32 lg:min-h-[650px]">
      {imagePath && (
        <div className="page-intro-visual">
          <Image src={imagePath} alt={imageAlt} fill sizes="(min-width: 1024px) 60vw, 100vw" quality={95} className="object-cover object-[66%_center] lg:object-right" priority />
        </div>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(1,12,31,0.98)_0%,rgba(1,12,31,0.91)_38%,rgba(1,12,31,0.3)_64%,rgba(1,12,31,0.04)_88%)]" />
      <div className="project-grid absolute inset-0 opacity-25" aria-hidden="true" />
      <div className="section-shell relative z-10 flex min-h-[438px] items-center lg:min-h-[490px]">
        <div className="max-w-[43rem]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold tracking-[0.08em] text-slate-300">
            <span className="h-px w-10 bg-accent2" aria-hidden="true" />
            <span>{eyebrow}</span>
            <span className="text-accent2">{valueStatement}</span>
          </div>
          <h1 className="mt-6 max-w-[42rem] font-display text-4xl font-bold leading-[1.08] tracking-[-0.035em] sm:text-5xl md:text-[3.7rem]">
            {title}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 md:text-lg">{description}</p>
          {benefits.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2.5">
              {benefits.map((benefit, index) => (
                <span key={benefit} className="inline-flex items-center rounded-xl border border-white/15 bg-white/[0.055] px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md">
                  <span className={`mr-2 h-2 w-2 rounded-full ${index === 1 ? "bg-accent2" : index === 2 ? "bg-accentWarm" : "bg-accent1"}`} />
                  {benefit}
                </span>
              ))}
            </div>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={primaryHref} className="rounded-full bg-accent1 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-blue-600">
              {primaryLabel}
            </Link>
            <Link href="/#demo" className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/10">
              查看成果演示
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PageClosing({ title, description }: { title: string; description: string }) {
  return (
    <section className="bg-white py-14 md:py-16">
      <div className="section-shell">
        <div className="rounded-[2rem] bg-primary px-6 py-10 text-center text-white shadow-xl md:px-12 md:py-12">
          <h2 className="font-display text-3xl font-bold tracking-[-0.025em] md:text-4xl">{title}</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-300">{description}</p>
          <Link href="/product/start" className="mt-8 inline-flex rounded-full bg-accent1 px-7 py-3 text-sm font-semibold text-white transition hover:bg-blue-600">
            开始生成方案
          </Link>
        </div>
      </div>
    </section>
  );
}
