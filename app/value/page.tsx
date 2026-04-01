"use client";
import Header from "../components/Header";
import ValueNumber from "../components/ValueNumber";
import Footer from "../components/Footer";

export default function ValuePage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Hero 区域 */}
        <section className="relative py-20 bg-gradient-to-br from-primary via-primary/95 to-accent1/20 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              核心价值
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              用数据证明 AI 管家的真实价值，让企业智能化升级效果可量化、可感知
            </p>
          </div>
        </section>

        {/* 核心价值数据 */}
        <ValueNumber />

        {/* 详细价值说明 */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="grid md:grid-cols-3 gap-8">
              {/* 价值 1 */}
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-3xl shadow-lg">
                  ⚡
                </div>
                <h3 className="text-xl font-bold text-primary mb-3">
                  效率提升
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  生产日报生成效率提升 95%，从数小时缩短至分钟级，让管理团队更快响应市场变化
                </p>
              </div>

              {/* 价值 2 */}
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-400 flex items-center justify-center text-3xl shadow-lg">
                  🎯
                </div>
                <h3 className="text-xl font-bold text-primary mb-3">
                  精准识别
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  关键异常识别效率提升 3 倍，实时发现生产过程中的质量问题，降低不良率
                </p>
              </div>

              {/* 价值 3 */}
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-red-400 flex items-center justify-center text-3xl shadow-lg">
                  🚀
                </div>
                <h3 className="text-xl font-bold text-primary mb-3">
                  决策加速
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  管理决策响应速度提升 10 倍，基于实时数据和 AI 分析，快速制定最优策略
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 应用场景 */}
        <section className="py-16 bg-gradient-to-b from-white via-blue-50/30 to-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                价值应用场景
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                AI 管家在各个环节为企业创造真实价值
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
                    📊
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      生产数据分析
                    </h3>
                    <p className="text-gray-600">
                      自动收集、整理和分析生产数据，生成详细报告，帮助管理层快速了解生产状况
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-2xl">
                    🔔
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      异常预警
                    </h3>
                    <p className="text-gray-600">
                      实时监控生产过程，及时发现异常情况并预警，避免问题扩大化
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">
                    💡
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      智能决策建议
                    </h3>
                    <p className="text-gray-600">
                      基于数据分析结果，提供可执行的决策建议，辅助管理层制定最优方案
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-2xl">
                    📈
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      持续优化
                    </h3>
                    <p className="text-gray-600">
                      通过机器学习不断学习和进化，持续提升分析准确性和建议质量
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
              立即体验 AI 管家带来的价值提升
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              预约专属演示，了解如何为您的企业定制 AI 管家方案
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="#demo"
                className="px-8 py-3 bg-accent1 text-white rounded-full font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-lg"
              >
                立即体验
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
