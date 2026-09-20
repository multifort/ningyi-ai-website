import ProductWorkspace from "./ProductWorkspace";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录我的成果",
  description: "登录宁翼智能成果中心，继续查看项目方案与交付成果。",
};

export default function ProductPage() { return <ProductWorkspace />; }
