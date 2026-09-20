import Header from "../components/Header";
import CaseStudies from "../components/CaseStudies";
import Footer from "../components/Footer";
import PageIntro, { PageClosing } from "../components/PageIntro";

export default function CasePage() {
  return (
    <>
      <Header />
      <main>
        <PageIntro eyebrow="交付成果" valueStatement="看得见、可复核的项目成果" title="从成果结构，看清内容与交付边界" description="通过脱敏项目样例说明材料如何被组织为方案、估算、报价、实施与汇报成果，同时明确事实基础、推演内容和待确认事项。" imagePath="/images/project-delivery/hero-multi-deliverable-v2.png" imageAlt="一份项目事实形成多类一致的交付成果" benefits={["成果结构清楚", "内容可以复核", "判断边界有标记"]} />
        <CaseStudies />
        <PageClosing title="验证你的项目能形成什么成果" description="提供部分脱敏材料，我们会先说明事实基础、待确认事项和适合验证的成果类型。" />
      </main>
      <Footer />
    </>
  );
}
