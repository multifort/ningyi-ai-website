import Header from "../components/Header";
import ValueNumber from "../components/ValueNumber";
import Footer from "../components/Footer";
import PageIntro, { PageClosing } from "../components/PageIntro";

const values = [
  { index: "01", title: "减少从零整理", text: "让需求文档、会议纪要、功能表格与历史方案先形成同一份项目事实，减少反复翻找和人工拼接。" },
  { index: "02", title: "保持成果一致", text: "功能范围、工作量、报价、计划和汇报材料引用同一套事实关系，项目变化时能够同步检查影响。" },
  { index: "03", title: "把判断留给人", text: "已确认事实、推演建议和待确认事项分别标记，关键范围、价格与承诺始终由项目负责人确认。" },
];

export default function ValuePage() {
  return (
    <>
      <Header />
      <main>
        <PageIntro eyebrow="核心价值" valueStatement="让零散知识重新形成项目成果" title="把零散知识，变成可继续推进项目的成果" description="企业已有的文档、纪要、表格和历史方案围绕当前项目被理解、关联，形成可核对、可修改、可继续使用的交付内容。" imagePath="/images/project-delivery/hero-multi-deliverable-v2.png" imageAlt="统一项目事实持续形成多类项目成果" benefits={["减少从零整理", "保持成果一致", "关键判断由人确认"]} />
        <ValueNumber />
        <section className="bg-bgGray py-14 md:py-20">
          <div className="section-shell grid gap-5 lg:grid-cols-3">
            {values.map((item) => (
              <article key={item.index} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_14px_40px_rgba(7,27,51,0.05)]">
                <div className="font-display text-sm font-bold tracking-[0.14em] text-accent1">{item.index}</div>
                <h2 className="mt-8 text-2xl font-semibold text-primary">{item.title}</h2>
                <p className="mt-4 leading-7 text-slate-600">{item.text}</p>
              </article>
            ))}
          </div>
        </section>
        <PageClosing title="先用一个真实项目验证成果" description="提供一份可脱敏的需求材料，我们先帮助梳理项目事实、缺口与可生成成果范围。" />
      </main>
      <Footer />
    </>
  );
}
