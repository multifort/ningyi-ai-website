"use client";
import { useEffect, useRef, useState } from "react";

interface CaseStudy {
  title: string;
  industry: string;
  problem: string;
  solution: string;
  results: Array<{ label: string; value: string; icon: string }>;
}

const caseStudies: CaseStudy[] = [
  {
    title: "某大型制造企业",
    industry: "汽车制造",
    problem: "每天需要 2 小时人工整理生产日报，数据分散在多个系统中，管理决策滞后",
    solution: "引入 AI 生产管家，自动从 MES/ERP 系统获取数据，一键生成生产分析报告",
    results: [
      { label: "报告生成时间", value: "2 小时 → 30 秒", icon: "⏱️" },
      { label: "管理效率提升", value: "95%", icon: "📈" },
      { label: "人力优化", value: "替代 1.5 个岗位", icon: "👥" },
    ],
  },
  {
    title: "某电子工厂产线",
    industry: "电子制造",
    problem: "设备异常无法提前识别，良率波动大，停机损失严重",
    solution: "部署 AI 实时监控系统，自动分析生产数据并预警异常情况",
    results: [
      { label: "停机损失降低", value: "20%+", icon: "📉" },
      { label: "异常响应速度", value: "提升 3 倍", icon: "⚡" },
      { label: "良率提升", value: "3.5%", icon: "🎯" },
    ],
  },
  {
    title: "某装配生产线",
    industry: "智能装配",
    problem: "产线节拍不平衡，效率瓶颈难以定位，产能利用率低",
    solution: "应用 AI 节拍优化系统，实时监控各工位效率并提供优化建议",
    results: [
      { label: "产能利用率", value: "提升 18%", icon: "📊" },
      { label: "决策响应速度", value: "提升 10 倍", icon: "🚀" },
      { label: "月度成本节省", value: "¥15 万+", icon: "💰" },
    ],
  },
];

export default function CaseStudies() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
      className="py-8 bg-gray-50"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6">
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
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {caseStudies.map((study, index) => (
            <div
              key={index}
              className={`bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 transition-all duration-700 delay-${index * 150} ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
              }`}
            >
              {/* 行业标签 */}
              <div className="inline-block px-3 py-1 bg-accent1/10 text-accent1 text-sm font-semibold rounded-full mb-4">
                {study.industry}
              </div>

              {/* 标题 */}
              <h3 className="text-xl font-bold text-primary mb-3">
                {study.title}
              </h3>

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
            </div>
          ))}
        </div>

        {/* CTA 按钮 */}
        <div className={`text-center mt-10 transition-all duration-700 delay-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <button className="px-8 py-3 bg-accent1 text-white text-base font-semibold rounded-full hover:bg-accent1/90 transition-all duration-300 shadow-lg">
            查看完整案例库 👉
          </button>
        </div>
      </div>
    </section>
  );
}
