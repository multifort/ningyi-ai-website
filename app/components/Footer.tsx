"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type FooterLink = { title: string; href: string };

const fallbackConfig = {
  companyDescription: "宁翼智能科技提供企业项目方案与成果智能交付服务，帮助软件公司、系统集成商和数字化服务团队，把零散客户资料转化为结构清晰、口径一致、可继续修改的项目成果。",
  email: "contact@ningyi-ai.com",
  phone: "",
  address: "成都市高新区新川科技园",
  copyright: `© ${new Date().getFullYear()} 宁翼智能科技。All rights reserved.`,
};

const fallbackLinks = {
  product: [
    { title: "项目理解与需求分析", href: "/#demo" },
    { title: "方案与功能规划", href: "/#capability" },
    { title: "工作量与报价建议", href: "/#capability" },
    { title: "多成果一致性", href: "/#architecture" },
  ],
  solution: [
    { title: "软件定制项目", href: "/solution/software-customization" },
    { title: "系统集成项目", href: "/solution/system-integration-project" },
    { title: "企业数字化升级", href: "/solution/digital-transformation" },
  ],
  company: [
    { title: "交付成果", href: "/case" },
    { title: "免费分析项目", href: "/#cta" },
    { title: "联系宁翼", href: "mailto:contact@ningyi-ai.com" },
  ],
};

export default function Footer() {
  const [config, setConfig] = useState(fallbackConfig);
  const [links, setLinks] = useState(fallbackLinks);

  useEffect(() => {
    fetch("/api/content/footer")
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.success) return;
        const remoteConfig = payload.data?.config;
        if (remoteConfig) {
          setConfig({
            companyDescription: remoteConfig.companyDescription || fallbackConfig.companyDescription,
            email: remoteConfig.email || fallbackConfig.email,
            phone: remoteConfig.phone || "",
            address: remoteConfig.address || fallbackConfig.address,
            copyright: remoteConfig.copyright || fallbackConfig.copyright,
          });
        }
        if (payload.data?.links) setLinks(payload.data.links);
      })
      .catch(() => undefined);
  }, []);

  return (
    <footer className="border-t border-white/10 bg-[#041426] pb-6 pt-10 text-white">
      <div className="section-shell">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr]">
          <div>
            <Image src="/images/logo-white.png" alt="宁翼智能科技" width={160} height={46} className="h-11 w-auto object-contain" />
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">{config.companyDescription}</p>
            <div className="mt-6 space-y-2 text-sm text-slate-400">
              {config.email && <a href={`mailto:${config.email}`} className="block hover:text-white">{config.email}</a>}
              {config.phone && <a href={`tel:${config.phone}`} className="block hover:text-white">{config.phone}</a>}
              {config.address && <p>{config.address}</p>}
            </div>
          </div>

          {[
            ["成果能力", "product"],
            ["项目场景", "solution"],
            ["宁翼科技", "company"],
          ].map(([title, key]) => (
            <div key={key}>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <ul className="mt-4 space-y-3">
                {(links[key as keyof typeof links] || []).map((link: FooterLink) => (
                  <li key={`${link.title}-${link.href}`}>
                    <Link href={link.href} className="text-sm text-slate-400 transition hover:text-accent2">{link.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{config.copyright}</p>
          <p>企业项目方案与成果智能交付服务</p>
        </div>
      </div>
    </footer>
  );
}
