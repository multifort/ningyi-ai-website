import { useEffect, useRef, useState } from 'react';

interface UseAnimationOptions {
  threshold?: number;
  triggerOnce?: boolean;
  delay?: number;
}

/**
 * 通用动画 Hook - 当元素进入视口时触发动画
 * @param options 配置选项
 * @returns [ref, isVisible] ref 绑定到目标元素，isVisible 表示是否可见
 */
export function useAnimateOnView(options: UseAnimationOptions = {}) {
  const {
    threshold = 0.1,
    triggerOnce = true,
    delay = 0,
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // 延迟触发
          const timer = setTimeout(() => {
            setIsVisible(true);
          }, delay);

          if (triggerOnce) {
            observer.disconnect();
          }
          
          return () => clearTimeout(timer);
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold, triggerOnce, delay]);

  return [ref, isVisible] as const;
}

/**
 * 页面加载动画 Hook
 * @param delay 延迟时间（毫秒）
 * @returns isLoaded 是否已加载
 */
export function usePageLoad(delay = 100) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return isLoaded;
}
