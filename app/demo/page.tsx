import Header from "../components/Header";
import DemoShowcase from "../components/DemoShowcase";
import Footer from "../components/Footer";
import PageIntro, { PageClosing } from "../components/PageIntro";

export default function DemoPage() {
  return (
    <>
      <Header />
      <main>
        <PageIntro eyebrow="成果演示" valueStatement="项目事实如何持续形成成果" title="看见项目成果怎样一步步形成" description="从零散材料进入项目理解开始，逐步呈现信息缺口、范围关联和成果形成过程，重要判断始终保留确认边界。" imagePath="/images/project-delivery/hero-service-overview-v2.png" imageAlt="零散材料经过交付流程形成结构化成果" benefits={["看见材料缺口", "看见推演边界", "看见变更影响"]} />
        <DemoShowcase />
        <PageClosing title="想用自己的材料看一次？" description="提交当前项目的部分脱敏材料，我们将说明可形成哪些成果，以及还缺少哪些关键信息。" />
      </main>
      <Footer />
    </>
  );
}
