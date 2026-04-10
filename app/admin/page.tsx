"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }

      // 保存 token 到 localStorage
      localStorage.setItem("admin_token", data.token);
      
      // 跳转到管理后台首页
      router.push("/admin/dashboard");
    } catch (err) {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      {/* 背景图片 */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ backgroundImage: `url('/images/hero-bg/hero-4.jpg')` }}
      />
      {/* 渐变遮罩层 */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/70 to-accent1/80" />
      
      {/* 登录卡片 */}
      <div className="relative z-10 bg-white rounded-3xl shadow-2xl p-10 w-full max-w-lg border border-white/10 backdrop-blur-lg mx-4">
        {/* 标题区域 */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent1 bg-clip-text text-transparent mb-3">
            宁翼智能科技官网管理系统
          </h1>
          <div className="w-20 h-1 bg-gradient-to-r from-accent1 to-accent2 mx-auto rounded-full" />
        </div>

        <form onSubmit={handleLogin} className="space-y-8">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-r-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div className="group">
              <label className="block text-sm font-medium text-gray-600 mb-2 group-focus-within:text-accent1 transition-colors">
                用户名
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:border-accent1 focus:ring-4 focus:ring-accent1/10 outline-none transition-all bg-gray-50/50 hover:bg-white focus:bg-white"
                  placeholder="请输入用户名"
                  required
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-sm font-medium text-gray-600 mb-2 group-focus-within:text-accent1 transition-colors">
                密码
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3.5 border-2 border-gray-200 rounded-xl focus:border-accent1 focus:ring-4 focus:ring-accent1/10 outline-none transition-all bg-gray-50/50 hover:bg-white focus:bg-white"
                  placeholder="请输入密码"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-accent1 to-accent2 text-white py-4 rounded-xl font-semibold hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {loading ? "登录中..." : "登 录"}
          </button>
        </form>
      </div>
    </div>
  );
}
