"use client"
import Image from "next/image";
import { FC, useState, useEffect } from "react";

const heroImages = [
  "/images/hero-bg/hero-1.jpg",
  "/images/hero-bg/hero-2.jpg",
  "/images/hero-bg/hero-3.jpg",
  "/images/hero-bg/hero-4.jpg",
];

const HeroSection: FC = () => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // 页面加载后触发动画
    setTimeout(() => setIsLoaded(true), 100);
    
    const timer = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % heroImages.length);
    }, 5000); // 每 5 秒切换一次

    return () => clearInterval(timer);
  }, []);

  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      {/* 轮播图背景 */}
      <div className="absolute inset-0 w-full h-full">
        {heroImages.map((src, index) => (
          <div
            key={src}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              index === currentImageIndex ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={src}
              alt={`Hero background ${index + 1}`}
              fill
              priority={index === 0} // 仅首图优先加载
              loading={index === 0 ? 'eager' : 'lazy'} // 懒加载后续图片
              className="object-cover"
              sizes="100vw"
              placeholder="blur" // 添加模糊占位效果
              blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=" // 实际的模糊占位图
            />
          </div>
        ))}
      </div>

      {/* 渐变遮罩 - 确保文字清晰可见 */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/70 via-primary/60 to-primary/80"></div>

      {/* 内容区域 */}
      <div className="max-w-3xl mx-auto relative z-10 text-center">
        <h1 className={`text-5xl md:text-7xl font-bold text-white mb-6 drop-shadow-lg transform transition-all duration-1000 ${
          isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
        }`}>企业 AI 管家</h1>
        <p className={`text-lg md:text-2xl text-white mb-8 drop-shadow-md transform transition-all duration-1000 delay-300 ${
          isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
        }`}>让企业拥有一支可管理、可执行、可进化的 AI 员工团队</p>
        <div className={`flex flex-col sm:flex-row justify-center gap-4 transform transition-all duration-1000 delay-500 ${
          isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
        }`}>
          <a
            href="#demo"
            className="px-8 py-3 bg-accent1 text-white rounded-xl font-semibold transition-all hover:bg-accent1/90 hover:scale-105 shadow-lg"
          >
            立即体验 Demo
          </a>
          <a
            href="#cta"
            className="px-8 py-3 border-2 border-white text-white rounded-xl font-semibold transition-all hover:bg-white/20 hover:scale-105 backdrop-blur-sm shadow-lg"
          >
            预约专属演示
          </a>
        </div>
      </div>

      {/* 轮播指示器 */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex space-x-2 z-10">
        {heroImages.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentImageIndex(index)}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              index === currentImageIndex
                ? "bg-white w-8"
                : "bg-white/50 hover:bg-white/75"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
};

export default HeroSection;