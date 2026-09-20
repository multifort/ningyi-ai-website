import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ProductIntake from "../../components/ProductIntake";

export const metadata: Metadata = {
  title: "开启你的定制之旅",
  description: "说明需要解决的问题或上传现有材料，开始形成企业项目方案与可交付成果。",
  robots: { index: false, follow: false },
};

export default function ProductStartPage() {
  return (
    <main className="min-h-screen bg-[#f5f8fc]">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="section-shell flex h-[76px] items-center justify-between gap-5">
          <Link href="/" aria-label="返回宁翼智能科技官网">
            <Image src="/images/logo.png" alt="宁翼智能科技" width={154} height={44} className="h-10 w-auto object-contain" priority />
          </Link>
          <nav className="flex items-center gap-3 text-sm font-semibold" aria-label="定制入口导航">
            <Link href="/" className="hidden rounded-full px-4 py-2.5 text-slate-600 hover:bg-slate-100 sm:block">返回官网</Link>
            <Link href="/product" className="rounded-full border border-slate-200 px-4 py-2.5 text-primary hover:border-blue-200 hover:bg-blue-50">我的成果</Link>
          </nav>
        </div>
      </header>
      <ProductIntake />
    </main>
  );
}
