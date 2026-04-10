"use client";
import { useEffect, useState } from "react";
import RichTextEditor from "../../components/RichTextEditor";

interface Solution {
  id: number;
  icon: string;
  title: string;
  slug: string;
  description: string;
  features: string[];
  heroImage: string;
  painPoints: string;
  solutionDetail: string;
  advantage: string;
  sortOrder: number;
  isActive: boolean;
}

export default function SolutionsPage() {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    icon: "",
    title: "",
    slug: "",
    description: "",
    features: [""],
    heroImage: "",
    painPoints: "",
    solutionDetail: "",
    advantage: "",
    sortOrder: 0,
  });
  const [activeTab, setActiveTab] = useState<'basic' | 'detail'>('basic');

  useEffect(() => {
    fetchSolutions();
  }, []);

  const fetchSolutions = async () => {
    const res = await fetch("/api/content/solutions");
    const data = await res.json();
    if (data.success) {
      setSolutions(data.data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("admin_token");
    const url = editingId ? "/api/content/solutions" : "/api/content/solutions";
    const method = editingId ? "PUT" : "POST";

    const body: any = { ...formData };
    if (editingId) body.id = editingId;

    await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    setShowForm(false);
    setEditingId(null);
    setFormData({ icon: "", title: "", slug: "", description: "", features: [""], heroImage: "", painPoints: "", solutionDetail: "", advantage: "", sortOrder: 0 });
    fetchSolutions();
  };

  const handleEdit = (solution: Solution) => {
    setEditingId(solution.id);
    setFormData({
      icon: solution.icon || "",
      title: solution.title,
      slug: solution.slug || "",
      description: solution.description || "",
      features: solution.features.length > 0 ? solution.features : [""],
      heroImage: solution.heroImage || "",
      painPoints: solution.painPoints || "",
      solutionDetail: solution.solutionDetail || "",
      advantage: solution.advantage || "",
      sortOrder: solution.sortOrder,
    });
    setShowForm(true);
    setActiveTab('basic');
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除吗？")) return;
    const token = localStorage.getItem("admin_token");
    await fetch(`/api/content/solutions?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchSolutions();
  };

  const addFeature = () => {
    setFormData({ ...formData, features: [...formData.features, ""] });
  };

  const removeFeature = (index: number) => {
    const newFeatures = formData.features.filter((_, i) => i !== index);
    setFormData({ ...formData, features: newFeatures });
  };

  const updateFeature = (index: number, value: string) => {
    const newFeatures = [...formData.features];
    newFeatures[index] = value;
    setFormData({ ...formData, features: newFeatures });
  };

  if (loading) return <div className="text-center py-12">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">解决方案管理</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setFormData({ icon: "", title: "", slug: "", description: "", features: [""], heroImage: "", painPoints: "", solutionDetail: "", advantage: "", sortOrder: 0 });
          }}
          className="px-6 py-3 bg-accent1 text-white rounded-lg hover:bg-accent1/90 transition-all"
        >
          + 新增解决方案
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-primary mb-4">
            {editingId ? "编辑解决方案" : "新增解决方案"}
          </h2>
          
          {/* Tab 切换 */}
          <div className="flex space-x-4 mb-6 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('basic')}
              className={`pb-3 px-4 font-medium transition-all ${
                activeTab === 'basic'
                  ? 'text-accent1 border-b-2 border-accent1'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              基本信息
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('detail')}
              className={`pb-3 px-4 font-medium transition-all ${
                activeTab === 'detail'
                  ? 'text-accent1 border-b-2 border-accent1'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              详情页内容
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 基本信息 Tab */}
            {activeTab === 'basic' && (
              <>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">图标</label>
                    <input
                      type="text"
                      value={formData.icon}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                      placeholder="例如：🚗"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Slug</label>
                    <input
                      type="text"
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                      placeholder="car-manufacturing"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">用于 URL：/solution/{formData.slug || 'slug'}</p>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hero 背景图 URL</label>
                  <input
                    type="text"
                    value={formData.heroImage}
                    onChange={(e) => setFormData({ ...formData, heroImage: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                    placeholder="/images/solution-hero.jpg"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">特性列表</label>
                    <button
                      type="button"
                      onClick={addFeature}
                      className="text-sm text-accent1 hover:underline"
                    >
                      + 添加特性
                    </button>
                  </div>
                  <div className="space-y-2">
                    {formData.features.map((feature, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={feature}
                          onChange={(e) => updateFeature(index, e.target.value)}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                          placeholder={`特性 ${index + 1}`}
                        />
                        {formData.features.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeFeature(index)}
                            className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* 详情页内容 Tab */}
            {activeTab === 'detail' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">核心痛点（富文本）</label>
                  <RichTextEditor
                    value={formData.painPoints}
                    onChange={(value) => setFormData({ ...formData, painPoints: value })}
                    placeholder="输入核心痛点内容..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">解决方案详情（富文本）</label>
                  <RichTextEditor
                    value={formData.solutionDetail}
                    onChange={(value) => setFormData({ ...formData, solutionDetail: value })}
                    placeholder="输入解决方案详情..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">方案优势（富文本）</label>
                  <RichTextEditor
                    value={formData.advantage}
                    onChange={(value) => setFormData({ ...formData, advantage: value })}
                    placeholder="输入方案优势..."
                  />
                </div>
              </>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-accent1 text-white rounded-lg hover:bg-accent1/90"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {solutions.map((solution) => (
          <div key={solution.id} className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className="text-4xl">{solution.icon}</div>
                <div>
                  <h3 className="text-xl font-semibold text-primary mb-2">{solution.title}</h3>
                  <p className="text-gray-600 mb-3">{solution.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {solution.features.map((feature, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(solution)}
                  className="px-4 py-2 text-accent1 hover:bg-accent1/10 rounded-lg transition-all"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(solution.id)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
