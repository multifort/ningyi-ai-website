"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const links = [
  { name: "能交付什么", href: "/#value", id: "value" },
  { name: "如何形成", href: "/#demo", id: "demo" },
  { name: "如何保障", href: "/#capability", id: "capability" },
  { name: "适合哪些团队", href: "/#solution", id: "solution" },
  { name: "交付成果", href: "/#case", id: "case" },
];

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    const sections = links
      .map((link) => document.getElementById(link.id))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: [0.05, 0.25] }
    );
    sections.forEach((section) => observer.observe(section));

    return () => {
      window.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, []);

  const solidHeader = isScrolled || isMobileMenuOpen;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
        solidHeader
          ? "border-slate-200/80 bg-white/95 shadow-[0_8px_32px_rgba(7,27,51,0.08)] backdrop-blur-xl"
          : "border-white/10 bg-primary/20 backdrop-blur-sm"
      }`}
    >
      <div className="section-shell flex h-[76px] items-center justify-between">
        <Link href="/#hero" aria-label="返回宁翼智能科技首页" className="relative z-10 flex items-center">
          <Image
            src={solidHeader ? "/images/logo.png" : "/images/logo-white.png"}
            alt="宁翼智能科技"
            width={154}
            height={44}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>

        <nav aria-label="主导航" className="hidden items-center gap-7 lg:flex">
          {links.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              className={`relative py-2 text-sm font-medium transition-colors ${
                activeSection === link.id
                  ? "text-accent1"
                  : solidHeader
                    ? "text-slate-600 hover:text-primary"
                    : "text-white/75 hover:text-white"
              }`}
            >
              {link.name}
              {activeSection === link.id && (
                <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-accent1" />
              )}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/product" className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${solidHeader ? "text-primary hover:bg-slate-100" : "text-white hover:bg-white/10"}`}>我的成果</Link>
          <Link
            href="/product/start"
            className="rounded-full bg-accent1 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(31,111,255,0.28)] transition hover:-translate-y-0.5 hover:bg-blue-600"
          >
            开启你的定制之旅
          </Link>
        </div>

        <button
          type="button"
          className={`rounded-lg p-2 lg:hidden ${solidHeader ? "text-primary" : "text-white"}`}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          aria-label={isMobileMenuOpen ? "关闭导航菜单" : "打开导航菜单"}
          aria-expanded={isMobileMenuOpen}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            {isMobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pb-5 pt-3 lg:hidden">
          <nav className="mx-auto flex max-w-lg flex-col" aria-label="移动端导航">
            {links.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="border-b border-slate-100 px-3 py-3.5 text-sm font-medium text-slate-700"
              >
                {link.name}
              </Link>
            ))}
            <Link
              href="/product"
              onClick={() => setIsMobileMenuOpen(false)}
              className="border-b border-slate-100 px-3 py-3.5 text-sm font-medium text-slate-700"
            >
              我的成果
            </Link>
            <Link
              href="/product/start"
              onClick={() => setIsMobileMenuOpen(false)}
              className="mt-4 rounded-xl bg-accent1 px-5 py-3 text-center text-sm font-semibold text-white"
            >
              开启你的定制之旅
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
