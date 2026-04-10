"use client"
import { useState, useEffect } from "react";
import Link from "next/link";

interface Scenario {
  id: number;
  icon: string;
  title: string;
  slug: string;
  subtitle: string;
  pain: string;
  solution: string;
  heroImage: string;
}

export default function SolutionTabs() {
  const [active, setActive] = useState(0);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScenarios();
  }, []);

  const fetchScenarios = async () => {
    try {
      const res = await fetch("/api/content/scenarios");
      const data = await res.json();
      if (data.success) {
        setScenarios(data.data);
      }
    } catch (error) {
      console.error("获取场景失败:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || scenarios.length === 0) {
    return null;
  }

  return (
    <section id="solution-tabs" className="py-8 bg-gradient-to-b from-white via-blue-50/30 to-white flex flex-col items-center relative overflow-hidden">
      {/* 装饰性背景 */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent1/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent2/5 rounded-full blur-3xl"></div>
      
      <div className="relative z-10 max-w-4xl mx-auto px-4">
        {/* 标题区 */}
        <div className="text-center mb-12">
          {/* 装饰标签 */}
          <div className="inline-block mb-4">
            <span className="px-4 py-2 bg-accent1/10 text-accent1 text-sm font-semibold rounded-full">
              ✨ 行业场景
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
            深耕行业场景，提供定制化解决方案
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            针对不同行业特点，我们提供专业的人工智能解决方案
          </p>
          {/* 装饰线条 */}
          <div className="mt-6 flex justify-center space-x-2">
            <div className="w-16 h-1 bg-gradient-to-r from-accent1 to-accent2 rounded-full"></div>
            <div className="w-2 h-1 bg-accent1 rounded-full"></div>
            <div className="w-8 h-1 bg-gradient-to-l from-accent1 to-accent2 rounded-full"></div>
          </div>
        </div>

        {/* 标签页按钮 */}
        <div className="flex flex-wrap justify-center gap-3 mb-10 relative">
          {scenarios.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActive(i)}
              className={`group relative px-6 py-3 rounded-full font-medium transition-all duration-300 transform hover:scale-105 ${
                active === i 
                  ? "bg-gradient-to-r from-accent1 to-accent2 text-white shadow-lg shadow-accent1/30" 
                  : "bg-white text-gray-700 border-2 border-accent1/30 hover:border-accent1 hover:shadow-md"
              }`}
            >
              <span className="flex items-center space-x-2">
                <span className="text-lg">{s.icon}</span>
                <span>{s.title}</span>
              </span>
              {/* 激活状态光晕 */}
              {active === i && (
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-accent1 to-accent2 blur-lg opacity-50 animate-pulse"></div>
              )}
            </button>
          ))}
        </div>

        {/* 内容卡片 */}
        <div className="relative">
          {/* 卡片容器 - 带渐变边框 */}
          <div className="relative bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* 顶部渐变色条 */}
            <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${
              active === 0 ? 'from-blue-500 to-cyan-400' :
              active === 1 ? 'from-purple-500 to-pink-400' :
              'from-orange-500 to-red-400'
            }`}></div>

            {/* 装饰性背景图案 */}
            <div className="absolute top-0 right-0 w-40 h-40 opacity-5">
              <div className={`w-full h-full rounded-full bg-gradient-to-br ${
                active === 0 ? 'from-blue-500 to-cyan-400' :
                active === 1 ? 'from-purple-500 to-pink-400' :
                'from-orange-500 to-red-400'
              }`} style={{ filter: 'blur(50px)' }}></div>
            </div>

            <div className="relative p-8 md:p-10">
              {/* 标题和图标 */}
              <div className="flex items-center space-x-4 mb-6">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${
                  active === 0 ? 'from-blue-500 to-cyan-400' :
                  active === 1 ? 'from-purple-500 to-pink-400' :
                  'from-orange-500 to-red-400'
                } flex items-center justify-center text-3xl shadow-lg`}>
                  {scenarios[active].icon}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-primary">
                    {scenarios[active].title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{scenarios[active].subtitle || 'Industry Solution'}</p>
                </div>
              </div>

              {/* 痛点区域 */}
              <div className="mb-6">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-red-500">核心痛点</span>
                </div>
                <p className="text-base text-gray-700 pl-11 leading-relaxed">
                  {scenarios[active].pain}
                </p>
              </div>

              {/* 解决方案区域 */}
              <div>
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-green-500">解决方案</span>
                </div>
                <p className="text-base text-gray-700 pl-11 leading-relaxed">
                  {scenarios[active].solution}
                </p>
              </div>

              {/* CTA 按钮 */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                {scenarios[active].slug ? (
                  <Link 
                    href={`/solution/${scenarios[active].slug}`} 
                    className="group w-full md:w-auto px-8 py-3 bg-gradient-to-r from-accent1 to-accent2 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-accent1/30 transform hover:scale-105 transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <span>了解详细方案</span>
                    <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : (
                  <button className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-accent1 to-accent2 text-white font-semibold rounded-xl opacity-50 cursor-not-allowed flex items-center justify-center space-x-2">
                    <span>了解详细方案</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 底部阴影装饰 */}
          <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-3/4 h-8 bg-black/10 rounded-full blur-xl"></div>
        </div>
      </div>
    </section>
  );
}
