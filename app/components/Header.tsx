"use client"
import { useEffect, useState } from "react";
import Image from "next/image";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');

  const links = [
    { name: "首页", href: "#hero" },
    { name: "核心价值", href: "#value" },
    { name: "Demo 展示", href: "#demo" },
    { name: "产品能力", href: "#capability" },
    { name: "行业场景", href: "#solution" },
    { name: "成功案例", href: "#case" },
    { name: "联系我们", href: "#cta" },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);

      // 查找当前激活的区块
      const sections = links.map(link => link.href.substring(1));
      const scrollPosition = window.scrollY + 120; // 加上 header 的高度

      for (let i = sections.length - 1; i >= 0; i--) {
        const sectionId = sections[i];
        const element = document.getElementById(sectionId);
        if (element && scrollPosition >= element.offsetTop) {
          setActiveSection(`#${sectionId}`);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  
  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      const headerOffset = 80; // Header 的高度
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${isScrolled ? "bg-white/95 backdrop-blur-md shadow-lg" : "bg-transparent"}`}
    >
      <div className="w-full px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <Image
            src="/images/logo.png"
            alt="宁翼智能科技"
            width={140}
            height={40}
            className="object-contain"
            priority
          />
        </div>
        
        {/* 桌面导航 */}
        <nav className="hidden md:flex space-x-6">
          {links.map((link) => (
            <a 
              key={link.href} 
              href={link.href} 
              onClick={(e) => {
                e.preventDefault();
                scrollToSection(link.href);
              }}
              className={`text-sm md:text-base font-medium transition-all duration-300 cursor-pointer ${
                activeSection === link.href 
                  ? 'text-accent1 font-semibold'
                  : 'text-primary hover:text-accent1'
              }`}
            >
              {link.name}
            </a>
          ))}
        </nav>
        
        {/* 桌面按钮 */}
        <div className="hidden md:flex space-x-3 ml-8">
          <button className="px-4 py-1.5 rounded-full bg-accent1 text-white text-sm font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-md">立即体验 Demo</button>
          <button className="px-4 py-1.5 rounded-full border border-accent1 text-accent1 text-sm font-semibold hover:bg-accent1/10 transition-all duration-300">预约专属演示</button>
        </div>
        
        {/* 移动端汉堡菜单按钮 */}
        <button 
          className="md:hidden p-2 text-primary"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="切换菜单"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>
      
      {/* 移动端菜单 */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-lg">
          <nav className="flex flex-col py-4">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(link.href);
                }}
                className={`px-6 py-3 transition-all duration-200 ${
                  activeSection === link.href
                    ? 'bg-accent1/10 text-accent1 font-semibold border-l-4 border-accent1'
                    : 'text-primary hover:bg-gray-50'
                }`}
              >
                {link.name}
              </a>
            ))}
            <div className="flex flex-col space-y-3 px-6 pt-4 mt-2 border-t border-gray-100">
              <button className="w-full px-4 py-2 rounded-full bg-accent1 text-white text-sm font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-md">立即体验 Demo</button>
              <button className="w-full px-4 py-2 rounded-full border border-accent1 text-accent1 text-sm font-semibold hover:bg-accent1/10 transition-all duration-300">预约专属演示</button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
