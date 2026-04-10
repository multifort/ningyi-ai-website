"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface CaseStudiesProps {
  industryFilter?: string;
}

interface CaseStudy {
  id?: number;
  title: string;
  industry: string;
  problem: string;
  solution: string;
  results: Array<{ label: string; value: string; icon: string }>;
}

export default function CaseStudies({ industryFilter }: CaseStudiesProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 构建 API URL
    const apiUrl = industryFilter 
      ? `/api/content/cases?industry=${encodeURIComponent(industryFilter)}`
      : '/api/content/cases';
    
    // 获取案例数据
    fetch(apiUrl)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCaseStudies(data.data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("获取案例失败:", err);
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
      id="case"
      ref={sectionRef}
      className={`py-8 ${industryFilter ? 'bg-white' : 'bg-gray-50'}`}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : caseStudies.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-lg">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-gray-500 text-lg">暂无相关案例</p>
          </div>
        ) : (
          <>
        {/* 标题区 */}
        <div className={`text-center mb-10 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
            客户正在获得的真实价值
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            看看这些企业如何通过 AI 管家实现智能化升级
          </p>
        </div>

        {/* 案例卡片 */}
        <div className={`grid gap-6 ${caseStudies.length === 1 ? 'max-w-3xl mx-auto' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
          {caseStudies.map((study, index) => (
            <div
              key={index}
              className={`group relative bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${
                caseStudies.length === 1 ? 'p-8' : 'p-6'
              }`}
            >
              {caseStudies.length === 1 && (
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent1 to-accent2 rounded-t-xl"></div>
              )}
              
              {/* 行业标签 */}
              <div className="inline-block px-3 py-1 bg-accent1/10 text-accent1 text-sm font-semibold rounded-full mb-5">
                {study.industry}
              </div>

              {/* 标题 */}
              <h3 className="text-xl font-bold text-primary mb-6">
                {study.title}
              </h3>

              {caseStudies.length === 1 ? (
                /* 单案例布局：垂直卡片组 */
                <div className="space-y-6">
                  {/* 痛点卡片 */}
                  <div className="bg-red-50/50 border border-red-100 rounded-lg p-5">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-2">核心痛点</h4>
                        <p className="text-gray-700 text-sm leading-relaxed">
                          {study.problem}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 解决方案卡片 */}
                  <div className="bg-green-50/50 border border-green-100 rounded-lg p-5">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-2">解决方案</h4>
                        <p className="text-gray-700 text-sm leading-relaxed">
                          {study.solution}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 成果数据区 */}
                  <div className="bg-gradient-to-br from-primary/5 to-accent1/5 border border-gray-100 rounded-lg p-5">
                    <h4 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                      <svg className="w-5 h-5 text-accent1" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                      </svg>
                      <span>业务成果</span>
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      {study.results.map((result, idx) => (
                        <div key={idx} className="text-center p-3 bg-white rounded-lg shadow-sm border border-gray-100">
                          <div className="text-lg font-bold text-accent1 mb-1">{result.value}</div>
                          <div className="text-xs text-gray-600">{result.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* 多案例常规布局 */
                <>
                  {/* 痛点 */}
                  <div className="mb-4">
                    <div className="flex items-start space-x-2 mb-2">
                      <span className="text-red-500 text-lg">⚠️</span>
                      <span className="font-semibold text-primary">痛点：</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed pl-7">
                      {study.problem}
                    </p>
                  </div>

                  {/* 解决方案 */}
                  <div className="mb-5">
                    <div className="flex items-start space-x-2 mb-2">
                      <span className="text-accent1 text-lg">💡</span>
                      <span className="font-semibold text-primary">解决：</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed pl-7">
                      {study.solution}
                    </p>
                  </div>

                  {/* 结果数据 */}
                  <div className="border-t border-gray-100 pt-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <span className="text-green-500 text-lg">✅</span>
                      <span className="font-semibold text-primary">成果：</span>
                    </div>
                    <div className="space-y-2">
                      {study.results.map((result, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{result.icon}</span>
                            <span className="text-xs text-gray-600">{result.label}</span>
                          </div>
                          <span className="text-sm font-bold text-accent1">
                            {result.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* CTA 按钮 */}
        <div className={`text-center mt-10 transition-all duration-700 delay-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <Link href="/case" className="inline-block px-8 py-3 bg-accent1 text-white text-base font-semibold rounded-full hover:bg-accent1/90 transition-all duration-300 shadow-lg">
            查看完整案例库 👉
          </Link>
        </div>
          </>
        )}
      </div>
    </section>
  );
}
