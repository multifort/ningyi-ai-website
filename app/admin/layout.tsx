"use client";
import { ReactNode, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // 检查登录状态
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token && pathname !== "/admin") {
      router.push("/admin");
    }
  }, [pathname, router]);

  // 如果在登录页，不显示布局
  if (pathname === "/admin") {
    return <>{children}</>;
  }

  const menuItems = [
    { path: "/admin/dashboard", label: "仪表盘", icon: "📊" },
    { path: "/admin/content/hero", label: "Hero 配置", icon: "🎨" },
    { path: "/admin/content/solutions", label: "解决方案", icon: "💡" },
    { path: "/admin/content/scenarios", label: "行业场景", icon: "🏭" },
    { path: "/admin/content/cases", label: "案例研究", icon: "📈" },
    { path: "/admin/content/demo", label: "Demo 对话", icon: "💬" },
    { path: "/admin/content/capability", label: "产品能力", icon: "🔧" },
    { path: "/admin/content/stats", label: "价值数据", icon: "📉" },
    { path: "/admin/content/reservations", label: "预约信息", icon: "📝" },
    { path: "/admin/content/footer", label: "Footer 配置", icon: "🔗" },
    { path: "/admin/profile", label: "修改密码", icon: "🔒" },
  ];

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    router.push("/admin");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 侧边栏 */}
      <aside className="w-64 bg-white shadow-lg">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-lg font-bold text-primary">宁翼智能科技官网管理系统</h1>
        </div>

        <nav className="p-4">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg mb-2 transition-all ${
                pathname === item.path
                  ? "bg-accent1 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
