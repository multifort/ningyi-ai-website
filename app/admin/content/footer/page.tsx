"use client";
import { useEffect, useState } from "react";

interface FooterConfig {
  companyDescription: string;
  email: string;
  phone: string;
  address: string;
  copyright: string;
}

interface FooterLink {
  title: string;
  href: string;
}

export default function FooterPage() {
  const [config, setConfig] = useState<FooterConfig>({
    companyDescription: "",
    email: "",
    phone: "",
    address: "",
    copyright: "",
  });
  const [links, setLinks] = useState({
    product: [{ title: "", href: "" }],
    solution: [{ title: "", href: "" }],
    company: [{ title: "", href: "" }],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchFooterConfig();
  }, []);

  const fetchFooterConfig = async () => {
    const res = await fetch("/api/content/footer");
    const data = await res.json();
    if (data.success) {
      setConfig(data.data.config);
      setLinks(data.data.links);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    const token = localStorage.getItem("admin_token");
    const res = await fetch("/api/content/footer", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ config, links }),
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

  const addLink = (category: string) => {
    setLinks({
      ...links,
      [category]: [...links[category as keyof typeof links], { title: "", href: "" }],
    });
  };

  const removeLink = (category: string, index: number) => {
    const newLinks = [...links[category as keyof typeof links]];
    newLinks.splice(index, 1);
    setLinks({ ...links, [category]: newLinks });
  };

  const updateLink = (category: string, index: number, field: string, value: string) => {
    const newLinks = [...links[category as keyof typeof links]];
    newLinks[index] = { ...newLinks[index], [field]: value };
    setLinks({ ...links, [category]: newLinks });
  };

  if (loading) return <div className="text-center py-12">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">Footer 配置管理</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-accent1 text-white rounded-lg hover:bg-accent1/90 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${message.includes("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
        </div>
      )}

      {/* 公司信息 */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-primary mb-4">公司信息</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">公司简介</label>
            <textarea
              value={config.companyDescription}
              onChange={(e) => setConfig({ ...config, companyDescription: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
              placeholder="宁翼智能科技是一家专注于..."
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">联系邮箱</label>
              <input
                type="email"
                value={config.email}
                onChange={(e) => setConfig({ ...config, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                placeholder="contact@ningyi-ai.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">联系电话</label>
              <input
                type="text"
                value={config.phone}
                onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                placeholder="400-xxx-xxxx"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">公司地址</label>
            <input
              type="text"
              value={config.address}
              onChange={(e) => setConfig({ ...config, address: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
              placeholder="上海市浦东新区张江高科技园区"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">版权信息</label>
            <input
              type="text"
              value={config.copyright}
              onChange={(e) => setConfig({ ...config, copyright: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
              placeholder="© 2024 宁翼智能科技。All rights reserved."
            />
          </div>
        </div>
      </div>

      {/* 链接管理 */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-primary mb-4">导航链接</h2>
        
        {(["product", "solution", "company"] as const).map((category) => (
          <div key={category} className="mb-6 last:mb-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-700">
                {category === "product" ? "产品" : category === "solution" ? "解决方案" : "公司"}
              </h3>
              <button
                onClick={() => addLink(category)}
                className="text-sm text-accent1 hover:underline"
              >
                + 添加链接
              </button>
            </div>

            <div className="space-y-2">
              {links[category].map((link, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={link.title}
                    onChange={(e) => updateLink(category, index, "title", e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                    placeholder="链接名称"
                  />
                  <input
                    type="text"
                    value={link.href}
                    onChange={(e) => updateLink(category, index, "href", e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent1 outline-none"
                    placeholder="链接地址"
                  />
                  {links[category].length > 1 && (
                    <button
                      onClick={() => removeLink(category, index)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      删除
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
