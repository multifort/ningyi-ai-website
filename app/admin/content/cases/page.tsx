"use client";
import { useEffect, useState } from "react";

interface CaseStudy {
  id: number;
  title: string;
  industry: string;
  problem: string;
  solution: string;
  results: Array<{ label: string; value: string; icon: string }>;
  sortOrder: number;
  isActive: boolean;
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    industry: "",
    problem: "",
    solution: "",
    results: [{ label: "", value: "", icon: "" }],
    sortOrder: 0,
  });

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    const res = await fetch("/api/content/cases");
    const data = await res.json();
    if (data.success) setCases(data.data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("admin_token");
    const method = editingId ? "PUT" : "POST";
    const body: any = { ...formData };
    if (editingId) body.id = editingId;

    await fetch("/api/content/cases", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    setShowForm(false);
    setEditingId(null);
    setFormData({ title: "", industry: "", problem: "", solution: "", results: [{ label: "", value: "", icon: "" }], sortOrder: 0 });
    fetchCases();
  };

  const handleEdit = (caseItem: CaseStudy) => {
    setEditingId(caseItem.id);
    setFormData({
      title: caseItem.title,
      industry: caseItem.industry || "",
      problem: caseItem.problem || "",
      solution: caseItem.solution || "",
      results: caseItem.results.length > 0 ? caseItem.results : [{ label: "", value: "", icon: "" }],
      sortOrder: caseItem.sortOrder,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除吗？")) return;
    const token = localStorage.getItem("admin_token");
    await fetch(`/api/content/cases?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchCases();
  };

  const addResult = () => {
    setFormData({ ...formData, results: [...formData.results, { label: "", value: "", icon: "" }] });
  };

  const removeResult = (index: number) => {
    const newResults = formData.results.filter((_, i) => i !== index);
    setFormData({ ...formData, results: newResults });
  };

  const updateResult = (index: number, field: string, value: string) => {
    const newResults = [...formData.results];
    newResults[index] = { ...newResults[index], [field]: value };
    setFormData({ ...formData, results: newResults });
  };

  if (loading) return <div className="text-center py-12">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">案例研究管理</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setFormData({ title: "", industry: "", problem: "", solution: "", results: [{ label: "", value: "", icon: "" }], sortOrder: 0 });
          }}
          className="px-6 py-3 bg-accent1 text-white rounded-lg hover:bg-accent1/90"
        >
          + 新增案例
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-primary mb-4">{editingId ? "编辑案例" : "新增案例"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">行业</label>
                <input
                  type="text"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">痛点</label>
              <textarea
                value={formData.problem}
                onChange={(e) => setFormData({ ...formData, problem: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">解决方案</label>
              <textarea
                value={formData.solution}
                onChange={(e) => setFormData({ ...formData, solution: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">成果列表</label>
                <button type="button" onClick={addResult} className="text-sm text-accent1 hover:underline">
                  + 添加成果
                </button>
              </div>
              <div className="space-y-3">
                {formData.results.map((result, index) => (
                  <div key={index} className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={result.icon}
                      onChange={(e) => updateResult(index, "icon", e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="图标"
                    />
                    <input
                      type="text"
                      value={result.label}
                      onChange={(e) => updateResult(index, "label", e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="标签"
                    />
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={result.value}
                        onChange={(e) => updateResult(index, "value", e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="数值"
                      />
                      {formData.results.length > 1 && (
                        <button type="button" onClick={() => removeResult(index)} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg">
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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

      <div className="space-y-4">
        {cases.map((caseItem) => (
          <div key={caseItem.id} className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-primary mb-2">{caseItem.title}</h3>
                <span className="inline-block px-3 py-1 bg-accent1/10 text-accent1 text-sm rounded-full">{caseItem.industry}</span>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => handleEdit(caseItem)} className="px-4 py-2 text-accent1 hover:bg-accent1/10 rounded-lg">
                  编辑
                </button>
                <button onClick={() => handleDelete(caseItem.id)} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg">
                  删除
                </button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">⚠️ 痛点</div>
                <p className="text-sm text-gray-600">{caseItem.problem}</p>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">💡 解决方案</div>
                <p className="text-sm text-gray-600">{caseItem.solution}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {caseItem.results.map((result, idx) => (
                <span key={idx} className="flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                  <span>{result.icon}</span>
                  <span className="text-gray-600">{result.label}:</span>
                  <span className="font-semibold text-accent1">{result.value}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
