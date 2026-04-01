"use client";
import Header from "../components/Header";
import CaseStudies from "../components/CaseStudies";
import Footer from "../components/Footer";

export default function CasePage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Hero 区域 */}
        <section className="relative py-20 bg-gradient-to-br from-primary via-primary/95 to-accent1/20 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              成功案例
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              看看这些企业如何通过 AI 管家实现智能化升级，获得真实业务价值
            </p>
          </div>
        </section>

        {/* 成功案例展示 */}
        <CaseStudies />

        {/* 客户评价 */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                客户评价
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                听听使用 AI 管家的企业怎么说
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100">
                <div className="flex items-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-blue-200 flex items-center justify-center text-2xl mr-4">
                    👨‍💼
                  </div>
                  <div>
                    <h4 className="font-bold text-primary">张经理</h4>
                    <p className="text-sm text-gray-600">某汽车零部件企业 生产总监</p>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "自从引入了 AI 管家，我们的生产日报生成时间从 3 小时缩短到 5 分钟，而且数据准确性大幅提升。现在每天早上一上班就能看到详细的生产报告，让我们能够快速响应问题。"
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 border border-purple-100">
                <div className="flex items-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-purple-200 flex items-center justify-center text-2xl mr-4">
                    👩‍💼
                  </div>
                  <div>
                    <h4 className="font-bold text-primary">李总</h4>
                    <p className="text-sm text-gray-600">某电子制造企业 总经理</p>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "AI 管家帮助我们发现了多个之前没有注意到的质量问题。通过实时监控和预警，我们的不良率降低了 15%，客户满意度显著提升。这个投资非常值得！"
                </p>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-8 border border-orange-100">
                <div className="flex items-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-orange-200 flex items-center justify-center text-2xl mr-4">
                    👨‍
                  </div>
                  <div>
                    <h4 className="font-bold text-primary">王厂长</h4>
                    <p className="text-sm text-gray-600">某装备制造企业 厂长</p>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "最让我满意的是 AI 管家的学习能力。它越用越聪明，现在能够准确预测设备故障，让我们提前安排维护，避免了多次可能的停机事故。"
                </p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 border border-green-100">
                <div className="flex items-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-green-200 flex items-center justify-center text-2xl mr-4">
                    👩‍🔬
                  </div>
                  <div>
                    <h4 className="font-bold text-primary">陈博士</h4>
                    <p className="text-sm text-gray-600">某新能源企业 技术总监</p>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "AI 管家不仅提升了效率，更重要的是改变了我们的工作方式。现在我们的决策更加数据驱动，更加科学。团队可以把更多精力放在创新和优化上。"
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 实施流程 */}
        <section className="py-16 bg-gradient-to-b from-white via-gray-50 to-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                实施流程
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                简单的四步，即可开启企业智能化升级之旅
              </p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  1
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  需求调研
                </h3>
                <p className="text-sm text-gray-600">
                  深入了解企业痛点和需求
                </p>
              </div>

              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-400 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  2
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  方案设计
                </h3>
                <p className="text-sm text-gray-600">
                  定制化 AI 管家解决方案
                </p>
              </div>

              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-red-400 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  3
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  部署实施
                </h3>
                <p className="text-sm text-gray-600">
                  快速部署和系统集成
                </p>
              </div>

              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  4
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  持续优化
                </h3>
                <p className="text-sm text-gray-600">
                  不断学习和改进
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-gradient-to-br from-accent1/10 via-white to-accent2/10">
          <div className="max-w-4xl mx-auto px-4 md:px-6 text-center">
            <h2 className="text-3xl font-bold text-primary mb-6">
              成为我们的下一个成功案例
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              立即预约演示，了解 AI 管家如何为您的企业创造价值
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
