"use client";
import { useEffect, useState } from "react";

interface DemoQuestion {
  id: number;
  question: string;
  response: { summary: string; anomalies: string; advice: string };
  sortOrder: number;
  isActive: boolean;
}

export default function DemoPage() {
  const [questions, setQuestions] = useState<DemoQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    question: "",
    response: { summary: "", anomalies: "", advice: "" },
    sortOrder: 0,
  });

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    const res = await fetch("/api/content/demo");
    const data = await res.json();
    if (data.success) setQuestions(data.data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("admin_token");
    const method = editingId ? "PUT" : "POST";
    const body: any = { ...formData };
    if (editingId) body.id = editingId;

    await fetch("/api/content/demo", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    setShowForm(false);
    setEditingId(null);
    setFormData({ question: "", response: { summary: "", anomalies: "", advice: "" }, sortOrder: 0 });
    fetchQuestions();
  };

  const handleEdit = (q: DemoQuestion) => {
    setEditingId(q.id);
    setFormData({
      question: q.question,
      response: q.response,
      sortOrder: q.sortOrder,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除吗？")) return;
    const token = localStorage.getItem("admin_token");
    await fetch(`/api/content/demo?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchQuestions();
  };

  if (loading) return <div className="text-center py-12">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">Demo 对话管理</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setFormData({ question: "", response: { summary: "", anomalies: "", advice: "" }, sortOrder: 0 });
          }}
          className="px-6 py-3 bg-accent1 text-white rounded-lg hover:bg-accent1/90"
        >
          + 新增对话
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-primary mb-4">{editingId ? "编辑对话" : "新增对话"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">用户问题</label>
              <textarea
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">回复摘要</label>
              <input
                type="text"
                value={formData.response.summary}
                onChange={(e) => setFormData({ ...formData, response: { ...formData.response, summary: e.target.value } })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">异常信息</label>
              <textarea
                value={formData.response.anomalies}
                onChange={(e) => setFormData({ ...formData, response: { ...formData.response, anomalies: e.target.value } })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">建议</label>
              <textarea
                value={formData.response.advice}
                onChange={(e) => setFormData({ ...formData, response: { ...formData.response, advice: e.target.value } })}
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

      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.id} className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-start space-x-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm flex-shrink-0">👤</div>
                  <div className="bg-gray-50 rounded-lg px-4 py-2 flex-1">
                    <p className="text-sm text-gray-800">{q.question}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 justify-end">
                  <div className="bg-blue-50 rounded-lg px-4 py-2 flex-1 border border-blue-100">
                    <p className="text-sm font-semibold text-accent1 mb-2">{q.response.summary}</p>
                    {q.response.anomalies && (
                      <p className="text-xs text-gray-600 whitespace-pre-line">⚠️ {q.response.anomalies}</p>
                    )}
                    {q.response.advice && (
                      <p className="text-xs text-gray-600 whitespace-pre-line mt-2">💡 {q.response.advice}</p>
                    )}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm flex-shrink-0">🤖</div>
                </div>
              </div>
              <div className="flex space-x-2 ml-4">
                <button onClick={() => handleEdit(q)} className="px-4 py-2 text-accent1 hover:bg-accent1/10 rounded-lg">
                  编辑
                </button>
                <button onClick={() => handleDelete(q.id)} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg">
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
