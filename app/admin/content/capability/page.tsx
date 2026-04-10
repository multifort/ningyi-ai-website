"use client";
import { useEffect, useState } from "react";

interface CapabilityModule {
  id: number;
  icon: string;
  title: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export default function CapabilityPage() {
  const [modules, setModules] = useState<CapabilityModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    icon: "",
    title: "",
    description: "",
    sortOrder: 0,
  });

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    const res = await fetch("/api/content/capability");
    const data = await res.json();
    if (data.success) setModules(data.data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("admin_token");
    const method = editingId ? "PUT" : "POST";
    const body: any = { ...formData };
    if (editingId) body.id = editingId;

    await fetch("/api/content/capability", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    setShowForm(false);
    setEditingId(null);
    setFormData({ icon: "", title: "", description: "", sortOrder: 0 });
    fetchModules();
  };

  const handleEdit = (m: CapabilityModule) => {
    setEditingId(m.id);
    setFormData({
      icon: m.icon || "",
      title: m.title,
      description: m.description || "",
      sortOrder: m.sortOrder,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除吗？")) return;
    const token = localStorage.getItem("admin_token");
    await fetch(`/api/content/capability?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchModules();
  };

  if (loading) return <div className="text-center py-12">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">产品能力管理</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setFormData({ icon: "", title: "", description: "", sortOrder: 0 });
          }}
          className="px-6 py-3 bg-accent1 text-white rounded-lg hover:bg-accent1/90"
        >
          + 新增模块
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-primary mb-4">{editingId ? "编辑模块" : "新增模块"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">图标</label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                  placeholder="例如：🤖"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">排序号</label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">标题</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                取消
              </button>
              <button type="submit" className="px-6 py-2 bg-accent1 text-white rounded-lg hover:bg-accent1/90">
                保存
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {modules.map((m) => (
          <div key={m.id} className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-center mb-4">
              <div className="text-5xl mb-3">{m.icon}</div>
              <h3 className="text-xl font-semibold text-primary mb-2">{m.title}</h3>
              <p className="text-sm text-gray-600">{m.description}</p>
            </div>
            <div className="flex justify-center space-x-2">
              <button onClick={() => handleEdit(m)} className="px-4 py-2 text-accent1 hover:bg-accent1/10 rounded-lg">
                编辑
              </button>
              <button onClick={() => handleDelete(m.id)} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
