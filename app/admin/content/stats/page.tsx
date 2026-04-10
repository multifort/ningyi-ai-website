"use client";
import { useEffect, useState } from "react";

interface ValueStat {
  id: number;
  label: string;
  value: number;
  suffix: string;
  sortOrder: number;
  isActive: boolean;
}

export default function StatsPage() {
  const [stats, setStats] = useState<ValueStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const res = await fetch("/api/content/stats");
    const data = await res.json();
    if (data.success) setStats(data.data);
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    const token = localStorage.getItem("admin_token");
    const res = await fetch("/api/content/stats", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stats }),
    });

    const data = await res.json();
    if (data.success) {
      setMessage("✅ 保存成功！");
      setTimeout(() => setMessage(""), 3000);
    } else {
      setMessage("❌ 保存失败");
    }
    setSaving(false);
  };

  const updateStat = (index: number, field: string, value: any) => {
    const newStats = [...stats];
    newStats[index] = { ...newStats[index], [field]: value };
    setStats(newStats);
  };

  if (loading) return <div className="text-center py-12">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">价值数据管理</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-accent1 text-white rounded-lg hover:bg-accent1/90 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存修改"}
        </button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${message.includes("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">排序</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">标签</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">数值</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">单位</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {stats.map((stat, index) => (
              <tr key={stat.id}>
                <td className="px-6 py-4">
                  <input
                    type="number"
                    value={stat.sortOrder}
                    onChange={(e) => updateStat(index, "sortOrder", Number(e.target.value))}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                  />
                </td>
                <td className="px-6 py-4">
                  <input
                    type="text"
                    value={stat.label}
                    onChange={(e) => updateStat(index, "label", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                  />
                </td>
                <td className="px-6 py-4">
                  <input
                    type="number"
                    value={stat.value}
                    onChange={(e) => updateStat(index, "value", Number(e.target.value))}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                  />
                </td>
                <td className="px-6 py-4">
                  <input
                    type="text"
                    value={stat.suffix}
                    onChange={(e) => updateStat(index, "suffix", e.target.value)}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                  />
                </td>
                <td className="px-6 py-4">
                  <select
                    value={stat.isActive ? 1 : 0}
                    onChange={(e) => updateStat(index, "isActive", Number(e.target.value) === 1)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                  >
                    <option value={1}>启用</option>
                    <option value={0}>禁用</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <div className="font-medium text-blue-900">提示</div>
            <div className="text-sm text-blue-700 mt-1">
              直接在表格中编辑数据，修改完成后点击"保存修改"按钮即可。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
