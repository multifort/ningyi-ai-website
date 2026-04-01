"use client";
import { useEffect, useRef, useState, FC } from "react";

const ProductArchitecture: FC = () => {
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

  const layers = [
    {
      title: "企业 AI 管家",
      description: "统一交互入口，理解需求并调度任务",
      icon: "🎯",
      gradient: "from-blue-500 to-cyan-400",
      shadow: "shadow-blue-200",
    },
    {
      title: "多 Agent 协同系统",
      description: "模拟企业岗位角色，实现协同决策",
      icon: "🤖",
      gradient: "from-purple-500 to-pink-400",
      shadow: "shadow-purple-200",
    },
    {
      title: "Skill 执行能力层",
      description: "打通 ERP/MES，实现数据获取与自动执行",
      icon: "⚡",
      gradient: "from-orange-500 to-red-400",
      shadow: "shadow-orange-200",
    },
    {
      title: "企业业务系统",
      subtitle: "ERP / MES / WMS",
      description: "企业现有业务系统与数据源",
      icon: "🏢",
      gradient: "from-gray-600 to-gray-700",
      shadow: "shadow-gray-200",
    },
  ];

  return (
    <section 
      id="architecture" 
      ref={sectionRef}
      className="py-8 bg-gradient-to-b from-white to-gray-50 flex flex-col items-center"
    >
      {/* 标题区 */}
      <div className={`text-center mb-12 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
        <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
          产品架构图
        </h2>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          分层架构设计，构建完整的企业 AI 员工体系
        </p>
      </div>

      {/* 架构图 - 使用 semantic HTML */}
      <article 
        aria-label="产品架构图" 
        className="relative flex flex-col items-center space-y-2"
      >
        {layers.map((layer, idx) => (
          <div 
            key={idx}
            className={`relative w-full max-w-2xl transition-all duration-700 delay-${idx * 150} ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
          >
            {/* 连接线 */}
            {idx > 0 && (
              <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{top: "-16px", zIndex: 10}}>
                <div className="w-0.5 h-4 bg-gradient-to-b from-gray-300 to-gray-400"></div>
                <div className="w-3 h-3 bg-accent1 rounded-full mt-1 animate-pulse"></div>
              </div>
            )}

            {/* 层级卡片 */}
            <div 
              className={`bg-gradient-to-r ${layer.gradient} rounded-2xl p-1 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 ${layer.shadow}`}
            >
              <div className="bg-white/95 backdrop-blur-sm rounded-xl p-5">
                <div className="flex items-center space-x-4">
                  {/* 序号 */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${layer.gradient} flex items-center justify-center text-white font-bold text-lg shadow-md`}>
                    {idx + 1}
                  </div>

                  {/* 图标 */}
                  <div className="text-4xl flex-shrink-0">{layer.icon}</div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="text-lg font-bold text-primary truncate">
                        {layer.title}
                      </h3>
                      {layer.subtitle && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full whitespace-nowrap">
                          {layer.subtitle}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {layer.description}
                    </p>
                  </div>

                  {/* 装饰箭头 */}
                  <div className="flex-shrink-0">
                    <svg 
                      className="w-6 h-6 text-gray-400" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M19 14l-7 7m0 0l-7-7m7 7V3" 
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* 底部装饰光晕 */}
        <div className={`mt-8 transition-all duration-700 delay-600 ${isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}>
          <div className="relative">
            <div className="absolute inset-0 bg-accent1/20 blur-xl rounded-full"></div>
            <div className="relative bg-gradient-to-r from-accent1 to-accent2 text-white px-8 py-3 rounded-full font-semibold shadow-lg">
              🚀 构建企业智能化闭环
            </div>
          </div>
        </div>
      </article>
    </section>
  );
};

export default ProductArchitecture;