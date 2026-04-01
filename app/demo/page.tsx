"use client";
import Header from "../components/Header";
import DemoShowcase from "../components/DemoShowcase";
import Footer from "../components/Footer";

export default function DemoPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Hero 区域 */}
        <section className="relative py-20 bg-gradient-to-br from-primary via-primary/95 to-accent1/20 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Demo 展示
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              真实体验 AI 管家如何为企业工作，智能分析、精准预警、科学决策
            </p>
          </div>
        </section>

        {/* Demo 展示 */}
        <DemoShowcase />

        {/* 功能特点 */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                AI 管家核心能力
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                通过对话式交互，轻松获取专业级数据分析和建议
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                <div className="text-4xl mb-4">🤖</div>
                <h3 className="text-xl font-bold text-primary mb-3">
                  智能问答
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  自然语言提问，AI 管家理解业务场景，提供针对性分析和解答
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-xl font-bold text-primary mb-3">
                  数据分析
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  自动整理生产数据，生成详细报告，关键指标一目了然
                </p>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 border border-orange-100">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-primary mb-3">
                  异常预警
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  实时监测生产过程，及时发现异常并预警，避免问题扩大
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 使用场景 */}
        <section className="py-16 bg-gradient-to-b from-white via-gray-50 to-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                典型使用场景
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                AI 管家适用于企业日常运营的各个环节
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
                    📅
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      每日生产汇报
                    </h3>
                    <p className="text-gray-600">
                      自动生成生产日报，包括产量、质量、设备状态等关键信息，节省人工统计时间
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-2xl">
                    🔍
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      质量问题追溯
                    </h3>
                    <p className="text-gray-600">
                      快速定位质量问题原因，分析关联因素，提供改进建议
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">
                    📈
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      产能分析优化
                    </h3>
                    <p className="text-gray-600">
                      分析产能利用率，识别瓶颈工序，提出优化建议
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-2xl">
                    🎯
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      目标达成追踪
                    </h3>
                    <p className="text-gray-600">
                      实时监控生产目标达成情况，预测完成时间，及时调整策略
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-gradient-to-br from-accent1/10 via-white to-accent2/10">
          <div className="max-w-4xl mx-auto px-4 md:px-6 text-center">
            <h2 className="text-3xl font-bold text-primary mb-6">
              准备好体验 AI 管家的强大能力了吗？
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              立即预约专属演示，为您的企业定制 AI 管家方案
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="#hero"
                className="px-8 py-3 bg-accent1 text-white rounded-full font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-lg"
              >
                返回首页
              </a>
              <a
                href="#cta"
                className="px-8 py-3 border-2 border-accent1 text-accent1 rounded-full font-semibold hover:bg-accent1/10 transition-all duration-300"
              >
                预约演示
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
