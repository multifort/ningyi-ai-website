"use client";
import Header from "../components/Header";
import ContactCTA from "../components/ContactCTA";
import Footer from "../components/Footer";

export default function CtaPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Hero 区域 */}
        <section className="relative py-20 bg-gradient-to-br from-primary via-primary/95 to-accent1/20 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              联系我们
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              立即开启企业智能化升级之旅，让 AI 管家为您的业务赋能
            </p>
          </div>
        </section>

        {/* 联系表单 */}
        <ContactCTA />

        {/* 联系方式 */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                多种联系方式
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                选择您最方便的方式与我们取得联系
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-8 border border-blue-100 text-center">
                <div className="text-5xl mb-4">📞</div>
                <h3 className="text-xl font-bold text-primary mb-3">电话咨询</h3>
                <p className="text-gray-600 mb-4">工作日 9:00-18:00</p>
                <a href="tel:400-xxx-xxxx" className="text-2xl font-bold text-accent1 hover:text-accent1/80 transition-colors">
                  400-xxx-xxxx
                </a>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 border border-purple-100 text-center">
                <div className="text-5xl mb-4">📧</div>
                <h3 className="text-xl font-bold text-primary mb-3">邮件咨询</h3>
                <p className="text-gray-600 mb-4">24 小时接收咨询</p>
                <a href="mailto:contact@ningyi-ai.com" className="text-lg font-semibold text-accent1 hover:text-accent1/80 transition-colors">
                  contact@ningyi-ai.com
                </a>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-8 border border-orange-100 text-center">
                <div className="text-5xl mb-4">💬</div>
                <h3 className="text-xl font-bold text-primary mb-3">在线客服</h3>
                <p className="text-gray-600 mb-4">实时在线解答</p>
                <button className="px-6 py-2 bg-accent1 text-white rounded-full font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-lg">
                  开始聊天
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 预约演示流程 */}
        <section className="py-16 bg-gradient-to-b from-white via-blue-50/30 to-white">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                预约演示流程
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                简单的三步，即可体验 AI 管家的强大功能
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  1
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  提交需求
                </h3>
                <p className="text-sm text-gray-600">
                  填写基本信息和需求描述
                </p>
              </div>

              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-400 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  2
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  顾问对接
                </h3>
                <p className="text-sm text-gray-600">
                  专业顾问与您沟通具体需求
                </p>
              </div>

              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-red-400 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  3
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">
                  专属演示
                </h3>
                <p className="text-sm text-gray-600">
                  安排线上或线下产品演示
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
                常见问题
              </h2>
              <p className="text-lg text-gray-600">
                您可能想了解的问题
              </p>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-primary mb-3">
                  Q: AI 管家部署需要多长时间？
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  A: 一般情况下，从需求调研到正式上线需要 2-4 周时间。具体时间取决于企业的规模、系统复杂度和集成需求。我们会在不影响正常生产的前提下，尽快完成部署。
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-primary mb-3">
                  Q: AI 管家能否与我们现有的系统集成？
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  A: 可以的。AI 管家支持与主流 ERP、MES、WMS 等系统进行集成，可以通过 API 接口、数据库连接等多种方式获取数据。我们有丰富的系统集成经验，可以确保平稳对接。
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-primary mb-3">
                  Q: 数据安全如何保障？
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  A: 我们采用多重安全措施保障数据安全：数据加密传输和存储、严格的访问控制、定期安全审计、支持私有化部署等。同时严格遵守相关法规，确保企业数据安全。
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-primary mb-3">
                  Q: AI 管家的收费标准是什么？
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  A: 我们提供灵活的收费方案，包括 SaaS 订阅制和私有化部署两种模式。具体费用会根据企业规模、功能需求和用户数量等因素确定。欢迎联系我们获取详细报价方案。
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-primary mb-3">
                  Q: 后续有技术支持吗？
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  A: 我们提供全方位的技术支持服务，包括 7x24 小时在线客服、专业技术团队支持、定期系统维护和升级、操作培训等。确保您在使用过程中无后顾之忧。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-gradient-to-br from-accent1/10 via-white to-accent2/10">
          <div className="max-w-4xl mx-auto px-4 md:px-6 text-center">
            <h2 className="text-3xl font-bold text-primary mb-6">
              准备好开启企业智能化升级了吗？
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              立即联系我们，获取专属解决方案
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="#hero"
                className="px-8 py-3 bg-accent1 text-white rounded-full font-semibold hover:bg-accent1/90 transition-all duration-300 shadow-lg"
              >
                返回首页
              </a>
              <a
                href="tel:400-xxx-xxxx"
                className="px-8 py-3 border-2 border-accent1 text-accent1 rounded-full font-semibold hover:bg-accent1/10 transition-all duration-300"
              >
                拨打电话
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
