"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

interface FooterConfig {
  companyDescription: string;
  email: string;
  phone: string;
  address: string;
  copyright: string;
}

interface FooterLink {
  title: string;
  href: string;
}

export default function Footer() {
  const [config, setConfig] = useState<FooterConfig>({
    companyDescription: "",
    email: "",
    phone: "",
    address: "",
    copyright: "",
  });
  const [links, setLinks] = useState({
    product: [] as FooterLink[],
    solution: [] as FooterLink[],
    company: [] as FooterLink[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFooterConfig();
  }, []);

  const fetchFooterConfig = async () => {
    try {
      const res = await fetch("/api/content/footer");
      const data = await res.json();
      if (data.success) {
        setConfig(data.data.config);
        setLinks(data.data.links);
      }
    } catch (error) {
      console.error("获取 Footer 配置失败:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <footer className="bg-primary text-white py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
          加载中...
        </div>
      </footer>
    );
  }

  return (
    <footer className="bg-primary text-white pt-12 pb-6">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        {/* 主内容区 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-8">
          {/* 公司信息 */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <Image
                src="/images/logo-white.png"
                alt="宁翼智能科技"
                width={160}
                height={45}
                className="object-contain"
              />
            </div>
            <p className="text-gray-300 text-sm leading-relaxed mb-4 max-w-md">
              {config.companyDescription}
            </p>
            
            {/* 联系方式 */}
            <div className="space-y-2">
              {config.email && (
                <div className="flex items-center space-x-3 text-sm text-gray-300">
                  <span className="text-accent1">📧</span>
                  <span>{config.email}</span>
                </div>
              )}
              {config.phone && (
                <div className="flex items-center space-x-3 text-sm text-gray-300">
                  <span className="text-accent1">📞</span>
                  <span>{config.phone}</span>
                </div>
              )}
              {config.address && (
                <div className="flex items-center space-x-3 text-sm text-gray-300">
                  <span className="text-accent1">📍</span>
                  <span>{config.address}</span>
                </div>
              )}
            </div>

            {/* 社交媒体 */}
            <div className="flex space-x-4 mt-6">
              {["💬", "💼", "📖"].map((icon, index) => (
                <button
                  key={index}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-accent1 transition-all duration-300 flex items-center justify-center text-lg"
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* 链接区块 */}
          {[
            { title: "产品", key: "product" },
            { title: "解决方案", key: "solution" },
            { title: "公司", key: "company" },
          ].map((section) => (
            <div key={section.key}>
              <h3 className="text-base font-semibold mb-4 text-white">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {links[section.key as keyof typeof links].map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-300 hover:text-accent1 transition-all duration-200"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 底部分割线 */}
        <div className="border-t border-white/10 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            {/* 版权信息 */}
            <p className="text-sm text-gray-400">
              {config.copyright || `© ${new Date().getFullYear()} 宁翼智能科技。All rights reserved.`}
            </p>

            {/* 备案信息 */}
            <div className="flex items-center space-x-6 text-sm text-gray-400">
              <a href="#" className="hover:text-accent1 transition-all duration-200">
                隐私政策
              </a>
              <a href="#" className="hover:text-accent1 transition-all duration-200">
                服务条款
              </a>
              <a href="#" className="hover:text-accent1 transition-all duration-200">
                沪 ICP 备 xxxxxxxx 号
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
