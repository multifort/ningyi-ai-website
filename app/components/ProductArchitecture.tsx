"use client";

import { useEffect, useState } from "react";
import { defaultDeliveryContent } from "../../lib/delivery-content";

function StageIllustration({ index }: { index: number }) {
  if (index === 0) {
    return (
      <svg viewBox="0 0 260 170" className="h-full w-full" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="arch-folder" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#3990ff" /><stop offset="1" stopColor="#123f9e" /></linearGradient>
          <filter id="arch-shadow-1"><feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#000" floodOpacity=".3" /></filter>
        </defs>
        <ellipse cx="130" cy="150" rx="100" ry="12" fill="#0d4d91" opacity=".5" />
        <rect x="37" y="63" width="48" height="69" rx="6" fill="#eaf3ff" stroke="#55a0ff" filter="url(#arch-shadow-1)" transform="rotate(-10 37 63)" />
        <text x="52" y="91" fill="#286bd3" fontSize="17" fontWeight="700">文</text><path d="M50 101h25m-27 10h23" stroke="#8fb5eb" strokeWidth="4" strokeLinecap="round" />
        <rect x="89" y="34" width="53" height="85" rx="6" fill="#eef8ff" stroke="#55a0ff" filter="url(#arch-shadow-1)" transform="rotate(5 89 34)" />
        <text x="105" y="62" fill="#158b7a" fontSize="18" fontWeight="700">表</text><path d="M102 74h28m-29 10h28m-29 10h23" stroke="#8fb5eb" strokeWidth="4" strokeLinecap="round" />
        <rect x="130" y="71" width="62" height="55" rx="7" fill="#fff" stroke="#55a0ff" filter="url(#arch-shadow-1)" transform="rotate(9 130 71)" />
        <path d="M143 86h35m-37 10h39m-41 10h31" stroke="#8fb5eb" strokeWidth="4" strokeLinecap="round" /><text x="141" y="121" fill="#286bd3" fontSize="10" fontWeight="600">会议纪要</text>
        <path d="M28 102h64l12 13h122l-12 43H40L28 102Z" fill="url(#arch-folder)" stroke="#4aa7ff" strokeWidth="2" filter="url(#arch-shadow-1)" />
        <path d="M119 120v24m-9-9 9 9 9-9" stroke="#68dfff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (index === 1) {
    return (
      <svg viewBox="0 0 260 170" className="h-full w-full" fill="none" aria-hidden="true">
        <defs><filter id="arch-shadow-2"><feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#000" floodOpacity=".3" /></filter></defs>
        <ellipse cx="130" cy="151" rx="100" ry="12" fill="#07526c" opacity=".55" />
        <rect x="42" y="39" width="115" height="108" rx="10" fill="#0a4164" stroke="#39d5e6" filter="url(#arch-shadow-2)" />
        {[0, 1, 2].map((row) => <g key={row} transform={`translate(58 ${61 + row * 27})`}><rect width="77" height="19" rx="4" fill="#dffaff" fillOpacity=".88" /><rect x="8" y="5" width="9" height="9" rx="2" fill="#20bfcf" /><path d="M24 7h40m-40 6h30" stroke="#397b98" strokeWidth="3" strokeLinecap="round" /></g>)}
        <path d="M166 55h25v22h25m-25 0v28h25m-25-28h-21" stroke="#43dbe8" strokeWidth="3" strokeLinecap="round" />
        <rect x="208" y="43" width="26" height="26" rx="5" fill="#55d9e5" /><rect x="208" y="94" width="26" height="26" rx="5" fill="#1a7f97" stroke="#43dbe8" />
        <circle cx="157" cy="111" r="31" fill="#082e4d" fillOpacity=".8" stroke="#6ee8f0" strokeWidth="5" filter="url(#arch-shadow-2)" /><path d="m179 134 22 22" stroke="#6ee8f0" strokeWidth="9" strokeLinecap="round" />
      </svg>
    );
  }

  if (index === 2) {
    return (
      <svg viewBox="0 0 260 170" className="h-full w-full" fill="none" aria-hidden="true">
        <defs><filter id="arch-shadow-3"><feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#000" floodOpacity=".3" /></filter></defs>
        <ellipse cx="130" cy="151" rx="103" ry="12" fill="#30267f" opacity=".5" />
        <path d="M48 75h55l20-25h48l19 35h33" stroke="#6f67ff" strokeWidth="4" /><path d="M104 75v49h56" stroke="#45cfff" strokeWidth="4" />
        <rect x="31" y="57" width="79" height="67" rx="9" fill="#172b72" stroke="#716dff" filter="url(#arch-shadow-3)" /><path d="M48 77h44m-44 14h35m-35 14h41" stroke="#8fdcff" strokeWidth="5" strokeLinecap="round" /><path d="m40 76 4 4 7-9m-11 19 4 4 7-9m-11 19 4 4 7-9" stroke="#53d5ff" strokeWidth="2" />
        <rect x="133" y="27" width="54" height="54" rx="9" fill="#3b2a9c" stroke="#9b86ff" filter="url(#arch-shadow-3)" /><circle cx="160" cy="54" r="13" stroke="#fff" strokeWidth="7" /><path d="M160 34v8m0 24v8m-20-20h8m24 0h8" stroke="#fff" strokeWidth="5" />
        <rect x="123" y="101" width="75" height="50" rx="8" fill="#211c68" stroke="#716dff" filter="url(#arch-shadow-3)" /><path d="M137 139v-14h10v14m7 0v-27h10v27m7 0v-20h10v20" stroke="#8b82ff" strokeWidth="5" />
        <rect x="190" y="77" width="49" height="57" rx="8" fill="#e8eeff" stroke="#8b82ff" filter="url(#arch-shadow-3)" /><path d="M190 91h49" stroke="#716dff" strokeWidth="7" /><path d="M201 103h8m8 0h8m-24 10h8m8 0h8" stroke="#9aaee0" strokeWidth="4" />
        <circle cx="198" cy="143" r="18" fill="#e2a347" filter="url(#arch-shadow-3)" /><text x="198" y="149" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="700">¥</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 260 170" className="h-full w-full" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="arch-folder-4" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#438dff" /><stop offset="1" stopColor="#11337e" /></linearGradient>
        <filter id="arch-shadow-4"><feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#000" floodOpacity=".3" /></filter>
      </defs>
      <ellipse cx="130" cy="151" rx="101" ry="12" fill="#0b4784" opacity=".55" />
      {[
        { x: 42, y: 40, r: -8, title: "需求" }, { x: 96, y: 23, r: 3, title: "功能" }, { x: 151, y: 39, r: 9, title: "方案" },
      ].map((doc) => <g key={doc.title} transform={`translate(${doc.x} ${doc.y}) rotate(${doc.r})`}><rect width="65" height="91" rx="7" fill="#f1f7ff" stroke="#62a5ff" filter="url(#arch-shadow-4)" /><text x="12" y="25" fill="#29466d" fontSize="11" fontWeight="700">{doc.title}</text><path d="M12 38h41m-41 12h35m-35 12h40m-40 12h28" stroke="#99b7df" strokeWidth="4" strokeLinecap="round" /></g>)}
      <path d="M29 98h72l12 12h119l-12 48H40L29 98Z" fill="url(#arch-folder-4)" stroke="#54adff" strokeWidth="2" filter="url(#arch-shadow-4)" />
      <circle cx="166" cy="130" r="24" fill="#245ab6" stroke="#a9d8ff" strokeWidth="4" /><path d="m154 130 8 8 17-20" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StageDetailIcon({ index }: { index: number }) {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {index === 0 ? <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Zm-3 9 2 2 4-5" strokeLinecap="round" strokeLinejoin="round" /> : index === 1 ? <path d="M5 6h2m3 0h9M5 12h2m3 0h9M5 18h2m3 0h9" strokeLinecap="round" /> : index === 2 ? <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Zm-3 9 2 2 4-5" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M5 19h4l10-10-4-4L5 15v4Zm8-12 4 4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export default function ProductArchitecture() {
  const [content, setContent] = useState(defaultDeliveryContent.architecture);

  useEffect(() => {
    fetch("/api/content/delivery")
      .then((response) => response.json())
      .then((payload) => payload.success && payload.data?.architecture && setContent(payload.data.architecture))
      .catch(() => undefined);
  }, []);

  return (
    <section id="architecture" className="relative overflow-hidden bg-[radial-gradient(circle_at_50%_30%,#0c315f_0%,#071b33_58%,#041225_100%)] py-14 text-white md:py-20" aria-labelledby="architecture-title">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 opacity-20 [background-image:linear-gradient(24deg,transparent_48%,rgba(31,111,255,.35)_49%,transparent_50%)] [background-size:90px_90px]" aria-hidden="true" />
      <div className="section-shell relative">
        <div>
          <div className="section-heading max-w-none">
            <div className="section-kicker section-kicker-dark">{content.kicker}</div>
            <h2 id="architecture-title" className="!text-white">{content.title}</h2>
          </div>
          <p className="mt-4 max-w-4xl text-base leading-8 text-slate-300">
            {content.description}
          </p>
        </div>

        <div className="relative mt-9 md:mt-10">
          <div className="grid gap-4 lg:grid-cols-4">
            {content.stages.slice(0, 4).map((stage, index) => (
              <article key={stage.title} className="relative flex min-h-[470px] flex-col overflow-visible rounded-2xl border border-white/15 bg-white/[0.045] p-5 backdrop-blur-sm">
                {index < Math.min(content.stages.length, 4) - 1 && (
                  <span className="architecture-flow-arrow pointer-events-none absolute -right-6 top-[41%] z-20 hidden h-8 w-8 items-center justify-center lg:flex" aria-hidden="true">
                    <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none">
                      <path className="architecture-arrow-track" d="M3 16h23" strokeLinecap="round" />
                      <path className="architecture-arrow-energy" d="M3 16h23" strokeLinecap="round" style={{ animationDelay: `${index * -0.22}s` }} />
                      <path className="architecture-arrow-head" d="m19 9 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: `${index * -0.22}s` }} />
                    </svg>
                  </span>
                )}
                <div className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full border bg-primary font-display text-lg font-bold shadow-[0_0_0_7px_rgba(7,27,51,.75)] ${index === 2 ? "border-violet-400 text-violet-300" : "border-accent2/70 text-accent2"}`}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="mt-1 h-[175px] w-full"><StageIllustration index={index} /></div>
                <div className={`text-center text-xs font-semibold tracking-[0.12em] ${index === 2 ? "text-violet-300" : "text-accent2"}`}>{stage.step}</div>
                <h3 className="mt-2 text-center text-xl font-bold">{stage.title}</h3>
                <p className="mt-3 text-center text-sm leading-7 text-slate-300">{stage.description}</p>
                <div className={`mt-auto flex items-center justify-center gap-2 border-t border-white/10 pt-4 text-xs ${index === 2 ? "text-violet-300" : "text-accent2"}`}>
                  <StageDetailIcon index={index} />
                  <span>{stage.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-7 grid gap-4 rounded-2xl border border-accent1/50 bg-white/[0.045] px-6 py-5 text-sm leading-6 text-slate-200 backdrop-blur-sm md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-accent2/60 bg-accent1/15 text-accent2 shadow-[0_0_24px_rgba(75,215,232,.2)]"><StageDetailIcon index={0} /></span>
            <span>{content.note}</span>
          </div>
          <span className="hidden h-12 w-px bg-white/20 md:block" aria-hidden="true" />
          <div className="flex items-center justify-center gap-3 text-lg font-bold text-accentWarm md:text-xl">
            <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 5h12v5c0 5-2 8-6 10-4-2-6-5-6-10V5Zm0 3H5v3c0 3 2 5 6 5m11-8h5v3c0 3-2 5-6 5M16 20v5m-5 2h10" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>{content.promise}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
