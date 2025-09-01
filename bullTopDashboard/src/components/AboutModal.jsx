import React from "react";
import { X } from "lucide-react";

export default function AboutModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                    <h2 className="text-xl font-bold text-gray-900">关于 A股牛市逃顶指数仪表盘</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        aria-label="关闭"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div className="prose prose-sm max-w-none">
                        <p className="text-gray-600">
                            A股牛市逃顶指数仪表盘是一个基于大数据分析的股市情绪监测工具，旨在帮助投资者更好地把握市场时机，规避风险。
                        </p>
                        
                        <h3 className="text-lg font-semibold text-gray-900 mt-6">核心功能</h3>
                        <ul className="list-disc pl-5 space-y-2 text-gray-600">
                            <li><strong>逃顶指数计算</strong>：通过多维度市场因子合成0-100的风险指数，帮助识别市场过热信号</li>
                            <li><strong>实时数据监控</strong>：持续跟踪沪深300、上证指数等关键市场指标</li>
                            <li><strong>情绪因子分析</strong>：融合换手率、融资余额、社交媒体热度等情绪指标</li>
                            <li><strong>可视化图表</strong>：直观展现历史数据趋势和当前风险水平</li>
                            <li><strong>风险预警系统</strong>：设置危险线、警戒线、安全线三级风险预警机制</li>
                        </ul>
                        
                        <h3 className="text-lg font-semibold text-gray-900 mt-6">工作原理</h3>
                        <p className="text-gray-600">
                            系统采用Python后端进行数据收集和指数计算，Node.js服务器提供API接口，前端React应用展示数据：
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-gray-600">
                            <li><strong>数据采集层</strong>：使用akshare库自动获取沪深300、中证全指、上证指数的历史行情及融资融券、市盈率等数据</li>
                            <li><strong>特征工程层</strong>：对原始数据进行稳健Z分数标准化，消除量纲影响</li>
                            <li><strong>指数计算层</strong>：加权合成四大维度因子，通过Logistic函数映射到0-100区间</li>
                            <li><strong>服务接口层</strong>：Node.js服务器提供HTTPS API接口，供前端实时获取数据</li>
                        </ul>
                        
                        <h3 className="text-lg font-semibold text-gray-900 mt-6">指数计算流程</h3>
                        <p className="text-gray-600">
                            逃顶指数通过四个维度的市场因子进行加权合成：
                        </p>
                        <div className="mt-2 space-y-3 text-gray-600">
                            <div>
                                <strong className="text-gray-900">1. 情绪与舆情维度 (25%)：</strong>
                                <div className="ml-4 mt-1">• 抖音搜索热度 (12.5%)</div>
                                <div className="ml-4">• 融资融券热度 (12.5%)</div>
                            </div>
                            <div>
                                <strong className="text-gray-900">2. 交易与流动性维度 (25%)：</strong>
                                <div className="ml-4 mt-1">• 成交额热度 (12.5%)</div>
                                <div className="ml-4">• 换手率热度 (12.5%)</div>
                                <div className="ml-4">• 振幅热度 (10%)</div>
                            </div>
                            <div>
                                <strong className="text-gray-900">3. 价格趋势与动能维度 (30%)：</strong>
                                <div className="ml-4 mt-1">• 价格加速度 (10%)</div>
                                <div className="ml-4">• 均线偏离度 (10%)</div>
                                <div className="ml-4">• 上涨比例 (10%)</div>
                            </div>
                            <div>
                                <strong className="text-gray-900">4. 估值维度 (20%)：</strong>
                                <div className="ml-4 mt-1">• 市盈率估值 (20%)</div>
                            </div>
                        </div>
                        
                        <h3 className="text-lg font-semibold text-gray-900 mt-6">风险等级说明</h3>
                        <ul className="list-disc pl-5 space-y-2 text-gray-600">
                            <li><strong>0-59 相对安全</strong>：市场情绪相对平稳，可考虑适当加仓</li>
                            <li><strong>60-74 警惕</strong>：需要关注市场变化，保持谨慎</li>
                            <li><strong>75-84 强警戒</strong>：市场过热，建议谨慎操作</li>
                            <li><strong>85-100 极度警戒</strong>：市场极度过热，建议减仓或清仓</li>
                        </ul>
                        
                        <h3 className="text-lg font-semibold text-gray-900 mt-6">使用指南</h3>
                        <ul className="list-disc pl-5 space-y-2 text-gray-600">
                            <li><strong>操作建议</strong>：
                                <ul className="list-none mt-1 space-y-1">
                                    <li>• 危险区域建议减仓或清仓</li>
                                    <li>• 警戒区域建议保持谨慎</li>
                                    <li>• 安全区域可考虑适当加仓</li>
                                </ul>
                            </li>
                            <li><strong>观察要点</strong>：
                                <ul className="list-none mt-1 space-y-1">
                                    <li>• 关注指数连续多日处于高位的情况</li>
                                    <li>• 结合叠加指标综合判断市场趋势</li>
                                    <li>• 留意7日趋势变化，及时调整策略</li>
                                </ul>
                            </li>
                        </ul>
                        
                        <h3 className="text-lg font-semibold text-gray-900 mt-6">免责声明</h3>
                        <p className="text-gray-600">
                            本工具仅供学习交流使用，不构成任何投资建议。投资有风险，入市需谨慎。用户应结合自身情况独立判断并承担相应风险。
                        </p>
                        
                        <div className="mt-6 pt-4 border-t border-gray-200">
                            <p className="text-sm text-gray-500 text-center">
                                © {new Date().getFullYear()} A股牛市逃顶指数仪表盘 | 数据来源：网络公开数据
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}