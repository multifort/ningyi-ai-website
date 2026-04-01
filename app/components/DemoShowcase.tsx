"use client"
import { FC, useState, useEffect, useRef } from "react";

const DemoShowcase: FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [typingText, setTypingText] = useState("");
  const [showAIResponse, setShowAIResponse] = useState(false);
  const [aiTypingText, setAiTypingText] = useState({ summary: "", anomalies: "", advice: "" });
  const [isAiTyping, setIsAiTyping] = useState(false);

  const questions = [
    "今天生产情况怎么样？",
    "有哪些异常情况？",
    "如何优化生产良率？",
  ];

  const aiResponses = [
    {
      summary: "总产量：12000（↑5%）",
      anomalies: "A 线停机 2 小时，B 线良率下降",
      advice: "检查设备 X，优化工艺参数",
    },
    {
      summary: "发现 3 项异常",
      anomalies: "1. A 线停机 2 小时\n2. B 线良率降至 92%\n3. 设备 X 温度过高",
      advice: "建议立即检查设备 X 的冷却系统",
    },
    {
      summary: "良率优化建议",
      anomalies: "当前平均良率：94.5%",
      advice: "1. 调整设备 X 参数\n2. 优化工艺流程\n3. 加强巡检频次",
    },
  ];

  // 自动播放对话动画
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= questions.length * 2 - 1) {
          // 循环播放：重置到开始
          return 0;
        }
        return prev + 1;
      });
    }, 3500); // 每 3.5 秒切换一次

    return () => clearInterval(timer);
  }, []);

  // 打字效果
  useEffect(() => {
    if (currentStep % 2 === 0 && currentStep < questions.length * 2) {
      const questionIndex = currentStep / 2;
      const targetText = questions[questionIndex];
      let charIndex = 0;
      setTypingText("");
      setShowAIResponse(false);
      setIsAiTyping(false);
      setAiTypingText({ summary: "", anomalies: "", advice: "" });

      const typingTimer = setInterval(() => {
        if (charIndex < targetText.length) {
          setTypingText(targetText.slice(0, charIndex + 1));
          charIndex++;
        } else {
          clearInterval(typingTimer);
          setTimeout(() => setShowAIResponse(true), 300);
        }
      }, 80); // 每个字符 80ms，更快的打字速度

      return () => clearInterval(typingTimer);
    }
  }, [currentStep]);

  // AI 回复打字效果
  useEffect(() => {
    if (showAIResponse && !isAiTyping) {
      const currentQuestionIndex = Math.floor(currentStep / 2);
      const currentResponse = aiResponses[currentQuestionIndex];
      
      if (!currentResponse) return;
      
      setIsAiTyping(true);
      const { summary, anomalies, advice } = currentResponse;

      // 使用 async/await 实现打字效果
      const typeSummary = async () => {
        for (let i = 0; i < summary.length; i++) {
          await new Promise(resolve => setTimeout(() => {
            setAiTypingText(prev => ({ ...prev, summary: summary.slice(0, i + 1) }));
            resolve(null);
          }, 60));
        }
      };

      const typeAnomalies = async () => {
        for (let i = 0; i < anomalies.length; i++) {
          await new Promise(resolve => setTimeout(() => {
            setAiTypingText(prev => ({ ...prev, anomalies: anomalies.slice(0, i + 1) }));
            resolve(null);
          }, 50));
        }
      };

      const typeAdvice = async () => {
        for (let i = 0; i < advice.length; i++) {
          await new Promise(resolve => setTimeout(() => {
            setAiTypingText(prev => ({ ...prev, advice: advice.slice(0, i + 1) }));
            resolve(null);
          }, 50));
        }
      };

      // 执行打字
      const runTyping = async () => {
        await typeSummary();
        await typeAnomalies();
        await typeAdvice();
      };

      runTyping();
    }
  }, [showAIResponse, currentStep, isAiTyping]);

  const currentQuestionIndex = Math.floor(currentStep / 2);
  const currentResponse = aiResponses[currentQuestionIndex];

  return (
    <section id="demo" className="py-8 bg-bgGray flex flex-col items-center">
      <h2 className="text-3xl font-bold text-primary mb-6">真实体验 AI 如何为企业工作</h2>
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-5 border border-gray-100">
        <div className="space-y-2 min-h-[260px]">
          {/* 显示已完成的对话 */}
          {Array.from({ length: currentQuestionIndex }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              {/* 用户消息 */}
              <div className="flex items-start">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center mr-2 text-base flex-shrink-0 shadow-sm">
                  <span className="text-white text-xs">👤</span>
                </div>
                <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[75%]">
                  <p className="text-sm text-textDark leading-relaxed">{questions[idx]}</p>
                </div>
              </div>
              {/* AI 回复 */}
              <div className="flex items-start justify-end">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%] border border-blue-100">
                  <p className="text-sm font-semibold text-accent1 leading-relaxed">{aiResponses[idx].summary}</p>
                  <p className="text-xs text-textGray mt-1.5 leading-relaxed whitespace-pre-line">⚠️ {aiResponses[idx].anomalies}</p>
                  <p className="text-xs text-textGray mt-1.5 leading-relaxed whitespace-pre-line">💡 {aiResponses[idx].advice}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-500 flex items-center justify-center ml-2 text-base flex-shrink-0 shadow-sm">
                  <span className="text-white text-sm">🤖</span>
                </div>
              </div>
            </div>
          ))}

          {/* 当前正在输入的对话 */}
          {currentStep < questions.length * 2 && (
            <div className="space-y-2">
              {/* 用户消息 */}
              <div className="flex items-start">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center mr-2 text-base flex-shrink-0 shadow-sm">
                  <span className="text-white text-xs">👤</span>
                </div>
                <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[75%]">
                  <p className="text-sm text-textDark leading-relaxed">{typingText}</p>
                  {typingText && !showAIResponse && (
                    <span className="inline-block w-2 h-4 bg-accent1 ml-1 animate-pulse rounded-sm"></span>
                  )}
                </div>
              </div>
              {/* AI 回复 */}
              {showAIResponse && currentResponse && (
                <div className="flex items-start justify-end animate-fade-in">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%] border border-blue-100">
                    {/* 摘要 */}
                    <p className="text-sm font-semibold text-accent1 leading-relaxed">
                      {aiTypingText.summary}
                      {isAiTyping && (!aiTypingText.anomalies || !aiTypingText.advice) && (
                        <span className="inline-block w-2 h-4 bg-accent1 ml-1 animate-pulse rounded-sm"></span>
                      )}
                    </p>
                    {/* 异常信息 */}
                    {aiTypingText.anomalies && (
                      <p className="text-xs text-textGray mt-1.5 leading-relaxed whitespace-pre-line">
                        ⚠️ {aiTypingText.anomalies}
                      </p>
                    )}
                    {/* 建议 */}
                    {aiTypingText.advice && (
                      <p className="text-xs text-textGray mt-1.5 leading-relaxed whitespace-pre-line">
                        💡 {aiTypingText.advice}
                      </p>
                    )}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-500 flex items-center justify-center ml-2 text-base flex-shrink-0 shadow-sm">
                    <span className="text-white text-sm">🤖</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <button className="px-6 py-2.5 bg-accent1 text-white rounded-full font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105">
          立即体验 AI 管家
        </button>
      </div>
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out;
        }
      `}</style>
    </section>
  );
};

export default DemoShowcase;