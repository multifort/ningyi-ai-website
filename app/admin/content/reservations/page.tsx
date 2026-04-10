"use client";
import { useEffect, useState } from "react";

interface Reservation {
  id: number;
  name: string;
  company: string;
  phone: string;
  description: string;
  status: string;
  createdAt: string;
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchReservations();
  }, []);

  const fetchReservations = async () => {
    const token = localStorage.getItem("admin_token");
    const res = await fetch("/api/content/reservations", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setReservations(data.data);
    setLoading(false);
  };

  const updateStatus = async (id: number, status: string) => {
    const token = localStorage.getItem("admin_token");
    await fetch("/api/content/reservations", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, status }),
    });
    fetchReservations();
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      pending: { text: "待联系", color: "bg-yellow-100 text-yellow-800" },
      contacted: { text: "已联系", color: "bg-blue-100 text-blue-800" },
      completed: { text: "已完成", color: "bg-green-100 text-green-800" },
    };
    const config = statusMap[status] || statusMap.pending;
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const filteredReservations = filter === "all" 
    ? reservations 
    : reservations.filter(r => r.status === filter);

  const stats = {
    total: reservations.length,
    pending: reservations.filter(r => r.status === 'pending').length,
    contacted: reservations.filter(r => r.status === 'contacted').length,
    completed: reservations.filter(r => r.status === 'completed').length,
  };

  if (loading) return <div className="text-center py-12">加载中...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary mb-2">预约信息管理</h1>
        <p className="text-gray-600">管理客户预约信息，及时跟进商机</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-primary">{stats.total}</div>
          <div className="text-sm text-gray-600">总预约数</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-yellow-500">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-sm text-gray-600">待联系</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-blue-400">
          <div className="text-2xl font-bold text-blue-600">{stats.contacted}</div>
          <div className="text-sm text-gray-600">已联系</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-sm text-gray-600">已完成</div>
        </div>
      </div>

      {/* 筛选 */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">筛选状态：</span>
          {[
            { key: "all", label: "全部" },
            { key: "pending", label: "待联系" },
            { key: "contacted", label: "已联系" },
            { key: "completed", label: "已完成" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                filter === item.key
                  ? "bg-accent1 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 预约列表 */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {filteredReservations.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无预约信息</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredReservations.map((r) => (
              <div key={r.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent1 to-accent2 flex items-center justify-center text-white font-semibold">
                      {r.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-primary">{r.name}</div>
                      <div className="text-sm text-gray-500">{r.company}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(r.status)}
                    <select
                      value={r.status}
                      onChange={(e) => updateStatus(r.id, e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg px-3 py-1 focus:ring-2 focus:ring-accent1 outline-none"
                    >
                      <option value="pending">待联系</option>
                      <option value="contacted">已联系</option>
                      <option value="completed">已完成</option>
                    </select>
                  </div>
                </div>
                <div className="ml-13 space-y-2">
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="text-gray-500">📱 手机号：</span>
                    <span className="text-gray-700">{r.phone}</span>
                  </div>
                  {r.description && (
                    <div className="flex items-start space-x-2 text-sm">
                      <span className="text-gray-500 flex-shrink-0">📝 需求：</span>
                      <span className="text-gray-700">{r.description}</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-2">
                    提交时间：{new Date(r.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
