import Header from "./components/Header";
import HeroSection from "./components/HeroSection";
import ValueNumber from "./components/ValueNumber";
import DemoShowcase from "./components/DemoShowcase";
import ProductCapability from "./components/ProductCapability";
import ProductArchitecture from "./components/ProductArchitecture";
import Solutions from "./components/Solutions";
import SolutionTabs from "./components/SolutionTabs";
import CaseStudies from "./components/CaseStudies";
import ContactCTA from "./components/ContactCTA";
import Footer from "./components/Footer";

export default function Page() {
  // JSON-LD 结构化数据
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "宁翼智能科技",
    "alternateName": "NingYi AI",
    "url": "https://www.ningyi-ai.com",
    "logo": "https://www.ningyi-ai.com/images/logo.png",
    "description": "宁翼智能科技提供企业级 AI 管家系统，通过多 Agent 协同和 Skill 执行平台，让企业拥有一支可管理、可执行、可进化的 AI 员工团队",
    "foundingDate": "2024",
    "areaServed": "CN",
    "industry": "Software Development",
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "email": "contact@ningyi-ai.com",
      "telephone": "400-xxx-xxxx",
      "areaServed": "CN",
      "availableLanguage": ["Chinese"]
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main className="pt-20">
        <HeroSection />
        <ValueNumber />
        <DemoShowcase />
        <ProductCapability />
        <ProductArchitecture />
        <Solutions />
        <SolutionTabs />
        <CaseStudies />
        <ContactCTA />
      </main>
      <Footer />
    </>
  );
}
