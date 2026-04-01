"use client";
import Header from "../components/Header";
import Solutions from "../components/Solutions";
import SolutionTabs from "../components/SolutionTabs";
import Footer from "../components/Footer";

export default function SolutionPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Hero 区域 */}
        <section className="relative py-20 bg-gradient-to-br from-primary via-primary/95 to-accent1/20 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              行业场景
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              深耕行业多年，为不同场景提供定制化 AI 解决方案
            </p>
          </div>
        </section>

        {/* 行业解决方案 */}
        <Solutions />

        {/* 解决方案详情 */}
        <SolutionTabs />

        {/* 行业痛点深度解析 */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                行业痛点深度解析
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                深入理解行业挑战，提供针对性解决方案
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* 汽车制造 */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 border border-blue-100">
                <div className="text-4xl mb-4">🚗</div>
                <h3 className="text-xl font-bold text-primary mb-4">
                  汽车制造挑战
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">生产数据分散，难以形成完整视图</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">质量分析滞后，问题发现晚</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">供应链协同效率低</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">设备维护成本高</span>
                  </li>
                </ul>
              </div>

              {/* 电子制造 */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
                <div className="text-4xl mb-4">🔌</div>
                <h3 className="text-xl font-bold text-primary mb-4">
                  电子制造挑战
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">SMT 产线良率波动大</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">异常根因分析困难</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">工艺参数优化依赖经验</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">物料追溯复杂</span>
                  </li>
                </ul>
              </div>

              {/* 装配产线 */}
              <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 border border-orange-100">
                <div className="text-4xl mb-4">🏭</div>
                <h3 className="text-xl font-bold text-primary mb-4">
                  装配产线挑战
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">产线节拍不平衡</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">工位效率难以量化</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">瓶颈工序识别慢</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-500 mt-1">⚠️</span>
                    <span className="text-gray-700 text-sm">产能利用率低</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 解决方案优势 */}
        <section className="py-16 bg-gradient-to-b from-white via-blue-50/30 to-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                我们的解决方案优势
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                基于 AI 技术，为行业痛点提供创新解决方案
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
                    🤖
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      智能化分析
                    </h3>
                    <p className="text-gray-600">
                      AI 自动分析生产数据，实时发现异常，提供科学决策建议
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-2xl">
                    📊
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      可视化展示
                    </h3>
                    <p className="text-gray-600">
                      直观的数据可视化，让复杂数据一目了然，快速掌握生产状况
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">
                    🔄
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      持续优化
                    </h3>
                    <p className="text-gray-600">
                      基于机器学习持续学习和进化，不断优化分析模型和建议质量
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
                      定制化方案
                    </h3>
                    <p className="text-gray-600">
                      根据不同行业和企业特点，提供定制化 AI 管家方案
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
              为您的行业定制专属 AI 管家
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              了解 AI 管家如何为您的企业创造价值
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
