"use client";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    solutions: 0,
    cases: 0,
    demos: 0,
    capabilities: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem("admin_token");
        
        const [solutionsRes, casesRes, demoRes, capabilityRes] = await Promise.all([
          fetch("/api/content/solutions", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/content/cases", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/content/demo", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/content/capability", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const [solutions, cases, demos, capabilities] = await Promise.all([
          solutionsRes.json(),
          casesRes.json(),
          demoRes.json(),
          capabilityRes.json(),
        ]);

        setStats({
          solutions: solutions.data?.length || 0,
          cases: cases.data?.length || 0,
          demos: demos.data?.length || 0,
          capabilities: capabilities.data?.length || 0,
        });
      } catch (error) {
        console.error("获取统计数据失败:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    { label: "解决方案", value: stats.solutions, icon: "💡", color: "from-blue-500 to-cyan-400" },
    { label: "案例研究", value: stats.cases, icon: "📈", color: "from-purple-500 to-pink-400" },
    { label: "Demo 对话", value: stats.demos, icon: "💬", color: "from-green-500 to-emerald-400" },
    { label: "产品能力", value: stats.capabilities, icon: "🔧", color: "from-orange-500 to-red-400" },
  ];

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-primary mb-8">欢迎使用 CMS 管理后台</h1>

      {/* 统计卡片 */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="text-4xl">{stat.icon}</span>
              <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${stat.color} opacity-20`}></div>
            </div>
            <div className="text-3xl font-bold text-primary mb-1">{stat.value}</div>
            <div className="text-sm text-gray-600">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 快捷操作 */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-semibold text-primary mb-4">快捷操作</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <a href="/admin/content/hero" className="p-4 border-2 border-gray-200 rounded-lg hover:border-accent1 hover:bg-accent1/5 transition-all">
            <div className="text-2xl mb-2">🎨</div>
            <div className="font-medium text-primary">编辑 Hero 配置</div>
            <div className="text-sm text-gray-500 mt-1">修改首页标题和轮播图</div>
          </a>
          <a href="/admin/content/solutions" className="p-4 border-2 border-gray-200 rounded-lg hover:border-accent1 hover:bg-accent1/5 transition-all">
            <div className="text-2xl mb-2">💡</div>
            <div className="font-medium text-primary">管理解决方案</div>
            <div className="text-sm text-gray-500 mt-1">添加或编辑行业方案</div>
          </a>
          <a href="/admin/content/cases" className="p-4 border-2 border-gray-200 rounded-lg hover:border-accent1 hover:bg-accent1/5 transition-all">
            <div className="text-2xl mb-2">📈</div>
            <div className="font-medium text-primary">管理案例研究</div>
            <div className="text-sm text-gray-500 mt-1">更新客户成功案例</div>
          </a>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <div className="font-medium text-blue-900">使用提示</div>
            <div className="text-sm text-blue-700 mt-1">
              所有修改会立即保存到数据库，前端页面会自动获取最新内容。如需查看效果，请访问网站首页。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
