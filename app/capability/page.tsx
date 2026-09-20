import Header from "../components/Header";
import ProductCapability from "../components/ProductCapability";
import ProductArchitecture from "../components/ProductArchitecture";
import Footer from "../components/Footer";
import PageIntro, { PageClosing } from "../components/PageIntro";

export default function CapabilityPage() {
  return (
    <>
      <Header />
      <main>
        <PageIntro eyebrow="交付能力" valueStatement="企业项目方案与成果智能交付服务" title="围绕项目成果组织完整交付能力" description="从理解项目、梳理范围，到关联工作量、周期和报价，再形成可编辑成果并检查变更影响，能力始终服务于实际交付。" imagePath="/images/project-delivery/hero-scope-cost-linkage-v2.png" imageAlt="功能范围与工作量周期和报价保持关联" benefits={["项目理解", "范围与成本联动", "多成果一致交付"]} />
        <ProductCapability />
        <ProductArchitecture />
        <PageClosing title="从一项高频任务开始" description="不需要一次性整理所有企业知识。选一个正在推进的项目，先验证方案、报价或汇报材料的形成过程。" />
      </main>
      <Footer />
    </>
  );
}
