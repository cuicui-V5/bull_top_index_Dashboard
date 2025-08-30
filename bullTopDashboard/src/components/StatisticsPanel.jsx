import React from "react";
import {
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Info,
    BarChart3,
} from "lucide-react";

export default function StatisticsPanel({ data, latestData }) {
    if (!data || !latestData) return null;

    // 计算统计数据
    const stats = React.useMemo(() => {
        const values = data
            .map(d => d.escape_index_0_100)
            .filter(v => v !== null);
        if (values.length === 0) return null;

        const sorted = [...values].sort((a, b) => a - b);
        const current = latestData.escape_index_0_100 || 0;

        return {
            current,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            median: sorted[Math.floor(sorted.length / 2)],
            percentile90: sorted[Math.floor(sorted.length * 0.9)],
            percentile75: sorted[Math.floor(sorted.length * 0.75)],
            percentile25: sorted[Math.floor(sorted.length * 0.25)],
            percentile10: sorted[Math.floor(sorted.length * 0.1)],
        };
    }, [data, latestData]);

    if (!stats) return null;

    const getRiskLevel = value => {
        if (value >= 80)
            return {
                level: "极高风险",
                color: "text-red-600",
                bg: "bg-red-50",
            };
        if (value >= 70)
            return {
                level: "高风险",
                color: "text-orange-600",
                bg: "bg-orange-50",
            };
        if (value >= 60)
            return {
                level: "中等风险",
                color: "text-yellow-600",
                bg: "bg-yellow-50",
            };
        if (value >= 40)
            return {
                level: "低风险",
                color: "text-blue-600",
                bg: "bg-blue-50",
            };
        return {
            level: "极低风险",
            color: "text-green-600",
            bg: "bg-green-50",
        };
    };

    const currentRisk = getRiskLevel(stats.current);

    return (
        <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">统计信息</div>
                <BarChart3 className="w-4 h-4 text-slate-400" />
            </div>

            <div className="space-y-4">
                {/* 当前状态 */}
                <div className="p-3 rounded-lg bg-gray-50">
                    <div className="text-xs text-slate-500 mb-1">当前状态</div>
                    <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold">
                            {stats.current.toFixed(2)}
                        </div>
                        <div
                            className={`px-2 py-1 rounded-full text-xs font-medium ${currentRisk.bg} ${currentRisk.color}`}>
                            {currentRisk.level}
                        </div>
                    </div>
                </div>

                {/* 分位数信息 */}
                <div>
                    <div className="text-xs text-slate-500 mb-2">
                        历史分位数
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>90%分位</span>
                            <span className="font-medium">
                                {stats.percentile90.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>75%分位</span>
                            <span className="font-medium">
                                {stats.percentile75.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>中位数</span>
                            <span className="font-medium">
                                {stats.median.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>25%分位</span>
                            <span className="font-medium">
                                {stats.percentile25.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>10%分位</span>
                            <span className="font-medium">
                                {stats.percentile10.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 极值信息 */}
                <div>
                    <div className="text-xs text-slate-500 mb-2">极值</div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="text-center p-2 rounded-lg bg-red-50">
                            <div className="text-xs text-red-600">最高值</div>
                            <div className="text-lg font-bold text-red-700">
                                {stats.max.toFixed(2)}
                            </div>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-green-50">
                            <div className="text-xs text-green-600">最低值</div>
                            <div className="text-lg font-bold text-green-700">
                                {stats.min.toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 平均值 */}
                <div className="text-center p-3 rounded-lg bg-blue-50">
                    <div className="text-xs text-blue-600 mb-1">平均值</div>
                    <div className="text-xl font-bold text-blue-700">
                        {stats.avg.toFixed(2)}
                    </div>
                </div>

                {/* 风险提示 */}
                {stats.current >= 70 && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                                <div className="font-medium text-red-800 mb-1">
                                    高风险警告
                                </div>
                                <div className="text-red-700 text-xs">
                                    当前指数处于历史高位，建议密切关注市场变化，考虑适当减仓。
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
