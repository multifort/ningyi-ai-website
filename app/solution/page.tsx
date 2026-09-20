import Header from "../components/Header";
import Solutions from "../components/Solutions";
import SolutionTabs from "../components/SolutionTabs";
import Footer from "../components/Footer";
import PageIntro, { PageClosing } from "../components/PageIntro";

export default function SolutionPage() {
  return (
    <>
      <Header />
      <main>
        <PageIntro eyebrow="适用对象与任务" valueStatement="为项目制团队持续交付专业成果" title="为持续产出项目成果的团队服务" description="面向软件公司、系统集成商与数字化服务团队，覆盖需求理解、售前方案、工作量估算、报价和实施准备等连续任务。" imagePath="/images/project-delivery/project-team-coordination.png" imageAlt="项目团队协同梳理方案计划和汇报材料" benefits={["中小软件公司", "系统集成服务商", "售前与项目团队"]} />
        <Solutions />
        <SolutionTabs />
        <PageClosing title="把当前项目带进来" description="我们先判断材料是否足以支撑目标成果，再给出缺口、处理边界与验证方式。" />
      </main>
      <Footer />
    </>
  );
}
