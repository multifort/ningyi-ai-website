"use client"
import { useEffect, useState, useRef } from "react";

export default function ValueNumber() {
  const [inView, setInView] = useState(false);
  const [animatedValues, setAnimatedValues] = useState<number[]>([0, 0, 0]);
  const ref = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !inView) {
          setInView(true);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [inView]);

  // 数字增长动画
  useEffect(() => {
    if (!inView) return;

    const targetValues = stats.map(s => s.value);
    const durations = [2000, 2000, 2000]; // 每个数字的动画时长（毫秒）
    const startTimes = [0, 300, 600]; // 每个数字的开始延迟
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const newValues = targetValues.map((target, index) => {
        const elapsed = currentTime - startTime - startTimes[index];
        if (elapsed < 0) return 0;
        
        const progress = Math.min(elapsed / durations[index], 1);
        // 使用 ease-out-easing 让动画更自然
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        return Math.floor(target * easeProgress);
      });

      setAnimatedValues(newValues);

      // 如果还有数字在动画中，继续下一帧
      if (newValues.some((val, i) => val < targetValues[i])) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [inView]);

  const stats = [
    { label: "生产日报生成效率提升", value: 95, suffix: "%" },
    { label: "关键异常识别效率提升", value: 3, suffix: "倍" },
    { label: "管理决策响应速度提升", value: 10, suffix: "倍" },
  ];

  return (
    // 使用 semantic HTML
    <section id="value" aria-label="核心价值数据" className="py-12 bg-bgGray flex flex-col items-center">
      <div className={`text-center mb-10 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
        <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">客户正在获得的真实价值</h2>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          看看这些企业如何通过 AI 管家实现智能化升级
        </p>
      </div>
      <div ref={ref} role="list" aria-label="统计数据列表" className="grid md:grid-cols-3 gap-6 w-full max-w-4xl">
        {stats.map((s, index) => (
          <div 
            key={s.label} 
            role="listitem"
            aria-label={`${s.label}: ${animatedValues[index]}${s.suffix}`}
            className={`bg-white rounded-xl shadow-lg p-6 flex flex-col items-center transform hover:scale-105 transition-all duration-300 ${
              inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
            style={{ transitionDelay: `${index * 150}ms` }}
          >
            <div className="text-5xl font-bold text-accent1 mb-2">
              {animatedValues[index]}{s.suffix}
            </div>
            <div className="text-sm text-gray-600 text-center leading-relaxed">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
