import type { Metadata } from "next";

export const metadata: Metadata = { title: "我的成果", robots: { index: false, follow: false } };

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
