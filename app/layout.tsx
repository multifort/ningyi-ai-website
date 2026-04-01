import { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "宁翼智能科技官网 - 企业 AI 管家 | 数字员工操作系统",
    template: "%s | 宁翼智能科技"
  },
  description: "宁翼智能科技提供企业级 AI 管家系统，通过多 Agent 协同和 Skill 执行平台，让企业拥有一支可管理、可执行、可进化的 AI 员工团队。面向工业制造提供智能化解决方案。",
  keywords: ["AI 管家", "企业 AI", "数字员工", "多 Agent 系统", "工业智能化", "生产分析", "AI 解决方案", "智能制造", "宁翼智能科技"],
  authors: [{ name: "宁翼智能科技" }],
  creator: "宁翼智能科技",
  publisher: "宁翼智能科技",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://www.ningyi-ai.com"),
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://www.ningyi-ai.com",
    siteName: "宁翼智能科技官网",
    title: "宁翼智能科技官网 - 企业 AI 管家",
    description: "让企业拥有一支可管理、可执行、可进化的 AI 员工团队",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "宁翼智能科技 - 企业 AI 管家"
      }
    ]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1F3E" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans text-textDark bg-bgLight" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
