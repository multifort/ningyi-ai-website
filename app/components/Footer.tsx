import Image from "next/image";
import Link from "next/link";

interface FooterLink {
  name: string;
  href: string;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

const footerSections: FooterSection[] = [
  {
    title: "产品",
    links: [
      { name: "AI 生产管家", href: "/capability" },
      { name: "多 Agent 系统", href: "/capability" },
      { name: "Skill 执行平台", href: "/capability" },
      { name: "产品架构", href: "/#architecture" },
    ],
  },
  {
    title: "解决方案",
    links: [
      { name: "汽车制造", href: "/solution" },
      { name: "电子制造", href: "/solution" },
      { name: "智能装配", href: "/solution" },
      { name: "私有化部署", href: "/solution" },
    ],
  },
  {
    title: "公司",
    links: [
      { name: "关于我们", href: "/#about" },
      { name: "成功案例", href: "/case" },
      { name: "联系我们", href: "/cta" },
      { name: "加入我们", href: "/#careers" },
    ],
  },
];

const socialLinks = [
  { name: "微信公众号", icon: "💬" },
  { name: "LinkedIn", icon: "💼" },
  { name: "知乎", icon: "📖" },
];

export default function Footer() {
  return (
    <footer className="bg-primary text-white pt-12 pb-6">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        {/* 主内容区 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-8">
          {/* 公司信息 */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <Image
                src="/images/logo.png"
                alt="宁翼智能科技"
                width={160}
                height={45}
                className="object-contain"
              />
            </div>
            <p className="text-gray-300 text-sm leading-relaxed mb-4 max-w-md">
              宁翼智能科技是一家专注于企业级 AI 系统的科技公司，致力于通过人工智能技术，帮助企业实现智能化升级。让企业从"人驱动"走向"AI 驱动"，构建未来数字员工组织。
            </p>
            
            {/* 联系方式 */}
            <div className="space-y-2">
              <div className="flex items-center space-x-3 text-sm text-gray-300">
                <span className="text-accent1">📧</span>
                <span>contact@ningyi-ai.com</span>
              </div>
              <div className="flex items-center space-x-3 text-sm text-gray-300">
                <span className="text-accent1">📞</span>
                <span>400-xxx-xxxx</span>
              </div>
              <div className="flex items-center space-x-3 text-sm text-gray-300">
                <span className="text-accent1">📍</span>
                <span>上海市浦东新区张江高科技园区</span>
              </div>
            </div>

            {/* 社交媒体 */}
            <div className="flex space-x-4 mt-6">
              {socialLinks.map((social, index) => (
                <button
                  key={index}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-accent1 transition-all duration-300 flex items-center justify-center text-lg"
                  aria-label={social.name}
                >
                  {social.icon}
                </button>
              ))}
            </div>
          </div>

          {/* 链接区块 */}
          {footerSections.map((section, index) => (
            <div key={index}>
              <h3 className="text-base font-semibold mb-4 text-white">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-300 hover:text-accent1 transition-all duration-200"
                    >
                      {link.name}
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
              © {new Date().getFullYear()} 宁翼智能科技。All rights reserved.
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
