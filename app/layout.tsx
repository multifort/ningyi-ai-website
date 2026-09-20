import { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "企业项目方案与成果智能交付服务｜宁翼智能科技",
    template: "%s | 宁翼智能科技"
  },
  description: "宁翼智能科技面向软件公司、系统集成商和数字化服务团队，把零散客户资料转化为需求分析、功能清单、解决方案、工作量、报价建议、实施计划和汇报材料。",
  keywords: ["项目方案", "售前方案", "需求分析", "工作量估算", "项目报价", "系统集成方案", "数字化解决方案", "宁翼智能科技"],
  authors: [{ name: "宁翼智能科技" }],
  creator: "宁翼智能科技",
  publisher: "宁翼智能科技",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/images/favicon.png", type: "image/png", sizes: "256x256" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/images/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
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
    title: "企业项目方案与成果智能交付服务｜宁翼智能科技",
    description: "把零散客户需求，变成一套可讨论、可报价、可汇报、可交付的项目成果。",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "宁翼智能科技 - 企业项目方案与成果智能交付服务"
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
