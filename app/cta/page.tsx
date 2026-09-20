import Header from "../components/Header";
import ContactCTA from "../components/ContactCTA";
import Footer from "../components/Footer";
import PageIntro from "../components/PageIntro";

const steps = [
  { index: "01", title: "描述问题或上传材料", text: "可从需求片段、会议纪要或功能清单开始，不要求资料一次齐全。" },
  { index: "02", title: "登录并安全保存项目", text: "项目材料和填写内容按账号保存，后续可继续补充和查看。" },
  { index: "03", title: "持续查看形成中的成果", text: "系统展示项目理解、信息缺口、形成进度与可下载成果。" },
];

export default function CtaPage() {
  return (
    <>
      <Header />
      <main>
        <PageIntro eyebrow="开始形成项目成果" valueStatement="从一个真实项目直接开始" title="从当前项目开始，持续形成可用成果" description="描述需要解决的问题或上传已有材料。登录后系统会保存项目、展示理解结果，并逐步形成方案、估算、报价、实施与汇报成果。" primaryLabel="开始生成方案" primaryHref="/product/start" imagePath="/images/project-delivery/hero-project-understanding-v2.png" imageAlt="零散项目资料形成清晰的项目理解" benefits={["材料可以脱敏", "不要求资料齐全", "成果持续保存"]} />
        <ContactCTA />
        <section className="bg-bgGray py-14 md:py-20">
          <div className="section-shell">
            <div className="section-heading">
              <div className="eyebrow">分析流程</div>
              <h2>三步开始形成项目成果</h2>
              <p>不需要人工预审；从最少信息开始，系统会保留缺口与假设并持续推进。</p>
            </div>
            <div className="mt-8 grid gap-5 md:mt-10 md:grid-cols-3">
              {steps.map((step) => (
                <article key={step.index} className="rounded-2xl border border-slate-200 bg-white p-7">
                  <div className="font-display text-sm font-bold tracking-[0.14em] text-accent1">{step.index}</div>
                  <h3 className="mt-7 text-xl font-semibold text-primary">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
