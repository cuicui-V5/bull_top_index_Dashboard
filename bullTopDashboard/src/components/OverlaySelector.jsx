import React, { useState } from "react";
import { Layers, TrendingUp, TrendingDown, X } from "lucide-react";

const OVERLAY_OPTIONS = [
    {
        key: "hs300_close",
        label: "沪深300收盘价",
        color: "#3b82f6",
        unit: "点",
        scale: "linear",
        minValue: 0,
        maxValue: null, // 动态计算
    },
    {
        key: "shanghai_close",
        label: "上证指数收盘价",
        color: "#dc2626",
        unit: "点",
        scale: "linear",
        minValue: 0,
        maxValue: null, // 动态计算
    },
    {
        key: "hs300_turnover_rate",
        label: "换手率",
        color: "#f59e0b",
        unit: "%",
        scale: "log", // 使用对数缩放
        minValue: 0.1,
        maxValue: 10,
    },
    {
        key: "margin_total",
        label: "融资余额",
        color: "#10b981",
        unit: "亿元",
        scale: "linear",
        minValue: 0,
        maxValue: null, // 动态计算
    },
    {
        key: "douyin_search",
        label: "抖音热度",
        color: "#8b5cf6",
        unit: "",
        scale: "linear",
        minValue: 0,
        maxValue: null, // 动态计算
    },
    {
        key: "crowding_z",
        label: "拥挤度Z",
        color: "#ef4444",
        unit: "",
        scale: "linear",
        minValue: -3,
        maxValue: 3,
    },
    {
        key: "hs300_amplitude",
        label: "振幅",
        color: "#06b6d4",
        unit: "%",
        scale: "linear",
        minValue: 0,
        maxValue: 10,
    },
];

export default function OverlaySelector({
    selectedOverlays,
    onOverlayChange,
    data,
}) {
    const [isOpen, setIsOpen] = useState(false);

    // 计算每个指标的数据范围
    const getDataRange = key => {
        if (!data || data.length === 0) return { min: 0, max: 100 };

        const values = data
            .map(d => d.raw?.[key])
            .filter(v => v !== null && v !== undefined && !isNaN(v));

        if (values.length === 0) return { min: 0, max: 100 };

        return {
            min: Math.min(...values),
            max: Math.max(...values),
        };
    };

    // 处理数据缩放
    const processOverlayData = (key, data) => {
        if (!data || data.length === 0) return [];

        const option = OVERLAY_OPTIONS.find(opt => opt.key === key);
        if (!option) return [];

        const range = getDataRange(key);
        const values = data
            .map(d => d.raw?.[key])
            .filter(v => v !== null && v !== undefined);

        if (values.length === 0) return [];

        let processedValues;

        if (option.scale === "log") {
            // 对数缩放
            const minVal = Math.max(option.minValue || 0.1, range.min);
            const maxVal = option.maxValue || range.max;
            processedValues = values.map(v => {
                const normalized =
                    (Math.log(v) - Math.log(minVal)) /
                    (Math.log(maxVal) - Math.log(minVal));
                return Math.max(0, Math.min(100, normalized * 100));
            });
        } else {
            // 线性缩放
            const minVal =
                option.minValue !== null ? option.minValue : range.min;
            const maxVal =
                option.maxValue !== null ? option.maxValue : range.max;
            processedValues = values.map(v => {
                const normalized = (v - minVal) / (maxVal - minVal);
                return Math.max(0, Math.min(100, normalized * 100));
            });
        }

        return data.map((d, i) => ({
            ...d,
            [key]: processedValues[i] || null,
        }));
    };

    const handleOverlayToggle = key => {
        const newOverlays = selectedOverlays.includes(key)
            ? selectedOverlays.filter(k => k !== key)
            : [...selectedOverlays, key];
        onOverlayChange(newOverlays);
    };

    const getOverlayColor = key => {
        const option = OVERLAY_OPTIONS.find(opt => opt.key === key);
        return option?.color || "#6b7280";
    };

    const getOverlayLabel = key => {
        const option = OVERLAY_OPTIONS.find(opt => opt.key === key);
        return option?.label || key;
    };

    return (
        <div className="relative">
            {/* 叠加按钮 */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-2 rounded-lg border-2 transition-colors ${
                    selectedOverlays.length > 0
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
                title="行情叠加">
                <Layers className="w-5 h-5" />
                {selectedOverlays.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {selectedOverlays.length}
                    </span>
                )}
            </button>

            {/* 叠加选择面板 */}
            {isOpen && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-lg ring-1 ring-gray-200 p-4 z-50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold">行情叠加</h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-3">
                        {/* 已选择的叠加 */}
                        {selectedOverlays.length > 0 && (
                            <div>
                                <div className="text-xs text-slate-500 mb-2">
                                    已选择
                                </div>
                                <div className="space-y-2">
                                    {selectedOverlays.map(key => (
                                        <div
                                            key={key}
                                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            getOverlayColor(
                                                                key,
                                                            ),
                                                    }}
                                                />
                                                <span className="text-sm font-medium">
                                                    {getOverlayLabel(key)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() =>
                                                    handleOverlayToggle(key)
                                                }
                                                className="text-red-500 hover:text-red-700">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 可选择的叠加 */}
                        <div>
                            <div className="text-xs text-slate-500 mb-2">
                                可选择
                            </div>
                            <div className="space-y-2">
                                {OVERLAY_OPTIONS.filter(
                                    option =>
                                        !selectedOverlays.includes(option.key),
                                ).map(option => (
                                    <button
                                        key={option.key}
                                        onClick={() =>
                                            handleOverlayToggle(option.key)
                                        }
                                        className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        option.color,
                                                }}
                                            />
                                            <span className="text-sm">
                                                {option.label}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            {option.unit}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 说明 */}
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <div className="text-xs text-blue-700">
                                <div className="font-medium mb-1">
                                    使用说明：
                                </div>
                                <div className="space-y-1">
                                    <div>• 换手率使用对数缩放以突出变化</div>
                                    <div>• 其他指标使用线性缩放</div>
                                    <div>• 最多可同时叠加3个指标</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
