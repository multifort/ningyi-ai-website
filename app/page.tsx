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
    "alternateName": "NingYi Technology",
    "url": "https://www.ningyi-ai.com",
    "logo": "https://www.ningyi-ai.com/images/logo.png",
    "description": "宁翼智能科技提供企业项目方案与成果智能交付服务，把零散项目材料转化为需求、方案、估算、报价、实施和汇报成果。",
    "areaServed": "CN",
    "industry": "Software Development",
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "email": "contact@ningyi-ai.com",
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
      <main>
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
