import React from "react";
import {
    TrendingUp,
    TrendingDown,
    Activity,
    Users,
    DollarSign,
    Search,
} from "lucide-react";

export default function MarketSentimentPanel({ data, latestData }) {
    if (!data || !latestData) return null;

    // 计算情绪指标变化
    const sentiment = React.useMemo(() => {
        if (!data || !latestData) return null;

        // 找到latestData在data中的索引
        const idx = data.findIndex(d => d === latestData);

        // 辅助函数：向前找前一条有值的
        function findPrevWithValue(key) {
            for (let i = idx - 1; i >= 0; i--) {
                if (data[i][key] !== null && data[i][key] !== undefined) {
                    return data[i][key];
                }
            }
            return null;
        }

        const calculateChange = (currentVal, prevVal) => {
            if (
                currentVal === null ||
                currentVal === undefined ||
                prevVal === null ||
                prevVal === undefined
            )
                return { change: 0, percent: 0, trend: "flat" };
            const change = currentVal - prevVal;
            const percent = prevVal !== 0 ? (change / prevVal) * 100 : 0;
            return {
                change,
                percent,
                trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
            };
        };

        return {
            douyin: calculateChange(
                latestData.douyin_search,
                findPrevWithValue("douyin_search"),
            ),
            margin: calculateChange(
                latestData.margin_total,
                findPrevWithValue("margin_total"),
            ),
            turnover: calculateChange(
                latestData.hs300_turnover_rate,
                findPrevWithValue("hs300_turnover_rate"),
            ),
            crowding: calculateChange(
                latestData.crowding_z,
                findPrevWithValue("crowding_z"),
            ),
        };
    }, [data, latestData]);

    if (!sentiment) return null;

    const renderIndicator = (title, value, change, icon, color = "blue") => {
        const colorClasses = {
            blue: "text-blue-600 bg-blue-50",
            green: "text-green-600 bg-green-50",
            red: "text-red-600 bg-red-50",
            yellow: "text-yellow-600 bg-yellow-50",
        };

        return (
            <div className="p-3 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        {icon}
                        <span className="text-sm font-medium">{title}</span>
                    </div>
                    {change && (
                        <div
                            className={`flex items-center gap-1 text-xs ${
                                change.trend === "up"
                                    ? "text-red-600"
                                    : change.trend === "down"
                                    ? "text-green-600"
                                    : "text-gray-600"
                            }`}>
                            {change.trend === "up" && (
                                <TrendingUp className="w-3 h-3" />
                            )}
                            {change.trend === "down" && (
                                <TrendingDown className="w-3 h-3" />
                            )}
                            <span>
                                {change.percent > 0 ? "+" : ""}
                                {change.percent.toFixed(1)}%
                            </span>
                        </div>
                    )}
                </div>
                <div className="text-lg font-bold">
                    {value !== null && value !== undefined && value !== ""
                        ? typeof value === "number"
                            ? value >= 1000000
                                ? (value / 1000000).toFixed(1) + "M"
                                : value >= 1000
                                ? (value / 1000).toFixed(1) + "K"
                                : value.toLocaleString()
                            : value
                        : "—"}
                </div>
            </div>
        );
    };

    const getSentimentLevel = () => {
        const indicators = [
            latestData.douyin_search,
            latestData.margin_total,
            latestData.hs300_turnover_rate,
            latestData.crowding_z,
        ].filter(v => v !== null && v !== undefined);

        if (indicators.length === 0)
            return { level: "未知", color: "text-gray-600", bg: "bg-gray-50" };

        // 简单的情绪评分逻辑
        let score = 0;
        if (latestData.douyin_search > 100000) score += 1; // 调整抖音热度阈值
        if (latestData.margin_total > 10000) score += 1;
        if (latestData.hs300_turnover_rate > 2) score += 1;
        if (latestData.crowding_z > 1) score += 1;

        if (score >= 3)
            return { level: "过热", color: "text-red-600", bg: "bg-red-50" };
        if (score >= 2)
            return {
                level: "偏热",
                color: "text-orange-600",
                bg: "bg-orange-50",
            };
        if (score >= 1)
            return { level: "正常", color: "text-blue-600", bg: "bg-blue-50" };
        return { level: "偏冷", color: "text-green-600", bg: "bg-green-50" };
    };

    const sentimentLevel = getSentimentLevel();

    return (
        <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">市场情绪指标</div>
                <Activity className="w-4 h-4 text-slate-400" />
            </div>

            <div className="space-y-4">
                {/* 整体情绪状态 */}
                <div className={`p-3 rounded-lg ${sentimentLevel.bg}`}>
                    <div className="text-xs text-slate-500 mb-1">整体情绪</div>
                    <div className="flex items-center justify-between">
                        <div className="text-lg font-bold">
                            {sentimentLevel.level}
                        </div>
                        <div
                            className={`text-sm font-medium ${sentimentLevel.color}`}>
                            {sentimentLevel.level}
                        </div>
                    </div>
                </div>

                {/* 各指标 */}
                <div className="grid grid-cols-1 gap-3">
                    {renderIndicator(
                        "抖音热度",
                        latestData.douyin_search,
                        sentiment.douyin,
                        <Search className="w-4 h-4" />,
                        "blue",
                    )}

                    {renderIndicator(
                        "融资余额",
                        latestData.margin_total,
                        sentiment.margin,
                        <DollarSign className="w-4 h-4" />,
                        "green",
                    )}

                    {renderIndicator(
                        "换手率",
                        latestData.hs300_turnover_rate + "%",
                        sentiment.turnover,
                        <Activity className="w-4 h-4" />,
                        "yellow",
                    )}

                    {renderIndicator(
                        "拥挤度Z",
                        latestData.crowding_z,
                        sentiment.crowding,
                        <Users className="w-4 h-4" />,
                        "red",
                    )}
                </div>

                {/* 情绪解读 */}
                <div className="p-3 rounded-lg bg-gray-50">
                    <div className="text-xs text-slate-500 mb-2">情绪解读</div>
                    <div className="text-sm text-slate-700">
                        {sentimentLevel.level === "过热" &&
                            "市场情绪过热，投资者需谨慎，注意风险控制。"}
                        {sentimentLevel.level === "偏热" &&
                            "市场情绪偏热，建议适度减仓，保持理性。"}
                        {sentimentLevel.level === "正常" &&
                            "市场情绪正常，可保持当前仓位，关注变化。"}
                        {sentimentLevel.level === "偏冷" &&
                            "市场情绪偏冷，可能存在投资机会。"}
                        {sentimentLevel.level === "未知" &&
                            "数据不足，无法判断当前情绪状态。"}
                    </div>
                </div>
            </div>
        </div>
    );
}
