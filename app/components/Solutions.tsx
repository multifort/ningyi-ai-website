"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Solution {
  id?: number;
  icon: string;
  title: string;
  slug: string;
  description: string;
  features: string[];
}

export default function Solutions() {
  const [isVisible, setIsVisible] = useState(false);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 获取解决方案数据
    fetch("/api/content/solutions")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSolutions(data.data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("获取解决方案失败:", err);
        setLoading(false);
      });

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="solution"
      ref={sectionRef}
      className="py-8 bg-gradient-to-b from-gray-50 via-blue-50 to-white"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : (
          <>
        {/* 标题区 */}
        <div className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          {/* 装饰性标签 */}
          <div className="inline-block mb-4">
            <span className="px-4 py-2 bg-accent1/10 text-accent1 text-sm font-semibold rounded-full">
              🎯 行业解决方案
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
            面向工业制造的智能化解决方案
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            深耕行业多年，我们为不同场景提供定制化 AI 解决方案
          </p>
          {/* 装饰线条 */}
          <div className="mt-6 flex justify-center space-x-2">
            <div className="w-16 h-1 bg-gradient-to-r from-accent1 to-accent2 rounded-full"></div>
            <div className="w-2 h-1 bg-accent1 rounded-full"></div>
            <div className="w-8 h-1 bg-gradient-to-l from-accent1 to-accent2 rounded-full"></div>
          </div>
        </div>

        {/* 解决方案卡片 */}
        <div className="grid md:grid-cols-3 gap-8">
          {solutions.map((solution, index) => (
            <div
              key={index}
              className={`group relative transition-all duration-700 delay-${index * 150} ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
            >
              {/* 卡片容器 - 带渐变边框 */}
              <div className="relative h-full bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-500 transform group-hover:-translate-y-2">
                {/* 顶部渐变色条 */}
                <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${
                  index === 0 ? 'from-blue-500 to-cyan-400' :
                  index === 1 ? 'from-purple-500 to-pink-400' :
                  'from-orange-500 to-red-400'
                }`}></div>

                {/* 装饰性背景图案 */}
                <div className="absolute top-0 right-0 w-32 h-32 opacity-5 pointer-events-none">
                  <div className={`w-full h-full rounded-full bg-gradient-to-br ${
                    index === 0 ? 'from-blue-500 to-cyan-400' :
                    index === 1 ? 'from-purple-500 to-pink-400' :
                    'from-orange-500 to-red-400'
                  }`} style={{ filter: 'blur(40px)' }}></div>
                </div>

                <div className="relative p-8">
                  {/* 图标区域 */}
                  <div className="relative mb-6">
                    <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${
                      index === 0 ? 'from-blue-500 to-cyan-400' :
                      index === 1 ? 'from-purple-500 to-pink-400' :
                      'from-orange-500 to-red-400'
                    } flex items-center justify-center text-4xl shadow-lg transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                      {solution.icon}
                    </div>
                    {/* 图标光晕效果 */}
                    <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-30 blur-xl transition-all duration-500 ${
                      index === 0 ? 'bg-blue-500' :
                      index === 1 ? 'bg-purple-500' :
                      'bg-orange-500'
                    }`}></div>
                  </div>

                  {/* 标题 */}
                  <h3 className="text-2xl font-bold text-primary mb-3 group-hover:text-accent1 transition-colors duration-300">
                    {solution.title}
                  </h3>

                  {/* 描述 */}
                  <p className="text-base text-gray-600 mb-6 leading-relaxed">
                    {solution.description}
                  </p>

                  {/* 功能列表 */}
                  <ul className="space-y-3 mb-8">
                    {solution.features.map((feature, idx) => (
                      <li
                        key={idx}
                        className="flex items-start space-x-3 group/item"
                      >
                        <span className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-gradient-to-r ${
                          index === 0 ? 'from-blue-500 to-cyan-400' :
                          index === 1 ? 'from-purple-500 to-pink-400' :
                          'from-orange-500 to-red-400'
                        } flex items-center justify-center transform group-hover/item:scale-110 transition-transform duration-200`}>
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                        <span className="text-sm text-gray-700 group-hover/item:text-primary transition-colors duration-200">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* 按钮 */}
                  {solution.slug ? (
                    <Link 
                      href={`/solution/${solution.slug}`} 
                      className="group/btn w-full py-3 rounded-xl border-2 border-accent1 text-accent1 text-sm font-semibold hover:bg-accent1 hover:text-white transition-all duration-300 flex items-center justify-center space-x-2"
                    >
                      <span>了解详情</span>
                      <svg className="w-4 h-4 transform group-hover/btn:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ) : (
                    <button className="w-full py-3 rounded-xl border-2 border-accent1 text-accent1 text-sm font-semibold opacity-50 cursor-not-allowed flex items-center justify-center space-x-2">
                      <span>了解详情</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA 按钮 */}
        <div className={`text-center mt-16 transition-all duration-700 delay-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div className="relative inline-block">
            {/* 光晕背景 */}
            <div className="absolute inset-0 bg-accent1/20 blur-2xl rounded-full"></div>
            <Link href="/solution" className="relative px-10 py-4 bg-gradient-to-r from-accent1 to-accent2 text-white text-lg font-semibold rounded-full hover:shadow-2xl hover:scale-105 transition-all duration-300 flex items-center space-x-3">
              <span>获取完整解决方案清单</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
          </>
        )}
      </div>

      {/* 底部装饰波浪 */}
      <div className="absolute bottom-0 left-0 right-0 h-16 overflow-hidden">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-full">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" 
            className="fill-white" opacity="0.3"></path>
        </svg>
      </div>
    </section>
  );
}
