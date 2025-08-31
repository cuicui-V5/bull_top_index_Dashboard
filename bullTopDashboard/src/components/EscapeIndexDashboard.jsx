import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    Brush,
    Area,
    AreaChart,
    BarChart,
    Bar,
    ReferenceLine,
} from "recharts";
import {
    Sun,
    Clock,
    Calendar,
    Activity,
    Download,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    RefreshCw,
    Info,
    BarChart3,
    LineChart as LineChartIcon,
} from "lucide-react";
import {
    format,
    subDays,
    subMonths,
    subYears,
    isToday,
    isYesterday,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import toast, { Toaster } from "react-hot-toast";
import StatisticsPanel from "./StatisticsPanel";
import MarketSentimentPanel from "./MarketSentimentPanel";
import SettingsPanel from "./SettingsPanel";
import OverlaySelector from "./OverlaySelector";

// 叠加选项配置
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

// Apple-like visual language using Tailwind utility classes (assumes Tailwind is available)
// Production notes (performance):
// - We fetch the full data set once (~5k rows) and keep it in memory.
// - For charting we *decimate* (downsample) series to a target max points (default 800) using an even-spaced selection
//   so rendering is smooth while preserving overall shape.
// - For coarser views (week/month/year) we aggregate by the chosen period and take mean/last so we don't plot every day.
// - Heavy computations are memoized via useMemo so re-renders are cheap.
// - Recharts' ResponsiveContainer ensures the chart is GPU-accelerated where possible and only re-renders on size change.
// - If you want even smoother UI for really huge datasets, move downsampling/aggregation to a Web Worker.

// Helper: parse input row into normalized object
function parseRow(r) {
    // Some keys may have UTF-8 BOM; normalize key for date
    const dateKey =
        Object.keys(r).find(k => k.trim().match(/^日期$/)) || "日期";
    const dateRaw = r[dateKey] || r["日期"];
    const date = new Date(dateRaw);
    const safeNum = v => {
        if (v === null || v === undefined || v === "" || v === "NaN")
            return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    return {
        date,
        dateStr: dateRaw,
        hs300_close: safeNum(r.hs300_close),
        shanghai_close: safeNum(r.shanghai_close),
        hs300_ret: safeNum(r.hs300_ret),
        hs300_turnover_log: safeNum(r.hs300_turnover_log),
        hs300_amplitude: safeNum(r.hs300_amplitude),
        hs300_turnover_rate: safeNum(r.hs300_turnover_rate),
        margin_total: safeNum(r.margin_total),
        douyin_search: safeNum(r.douyin_search),
        crowding_z: safeNum(r.crowding_z),
        escape_index_0_100: safeNum(r.escape_index_0_100),
        escape_signal:
            r.escape_signal === "1" ||
            r.escape_signal === true ||
            r.escape_signal === "true",
        escape_level: r.escape_level || r.escape_level || "",
        raw: r,
    };
}

// Downsample an array to at most `target` points by selecting evenly spaced indices.
function downsampleEven(data, target) {
    const n = data.length;
    if (n <= target) return data;
    const out = [];
    for (let i = 0; i < target; i++) {
        const idx = Math.floor((i * n) / target);
        out.push(data[idx]);
    }
    // Ensure last point included
    if (out[out.length - 1] !== data[n - 1]) out[out.length - 1] = data[n - 1];
    return out;
}

// Aggregate data by period: 'day' (no agg), 'week', 'month', 'year'
function aggregateByPeriod(data, period) {
    if (period === "day") return data;
    const map = new Map();
    for (const d of data) {
        let key;
        const yy = d.date.getFullYear();
        const mm = d.date.getMonth() + 1;
        const dd = d.date.getDate();
        if (period === "week") {
            // ISO week-year-ish key: YYYY-Wn (simple approximate: year + week number by Jan 1 offset)
            const temp = new Date(d.date);
            const day = (temp.getDay() + 6) % 7; // Mon=0..Sun=6
            temp.setDate(temp.getDate() - day);
            key = `${temp.getFullYear()}-W${String(
                Math.floor(
                    (temp - new Date(temp.getFullYear(), 0, 1)) /
                        (7 * 24 * 3600 * 1000),
                ) + 1,
            )}`;
            // Simpler: group by Monday date
            key = temp.toISOString().slice(0, 10);
        } else if (period === "month") {
            key = `${yy}-${String(mm).padStart(2, "0")}`;
        } else if (period === "year") {
            key = `${yy}`;
        }
        const arr = map.get(key) || [];
        arr.push(d);
        map.set(key, arr);
    }
    const out = [];
    for (const [k, arr] of map.entries()) {
        // compute aggregated point: use last date as label, mean of escape_index
        const last = arr[arr.length - 1];
        const meanEscape =
            arr.reduce((s, x) => s + (x.escape_index_0_100 || 0), 0) /
            arr.length;
        out.push({
            date: last.date,
            dateStr: last.dateStr,
            escape_index_0_100: Number(meanEscape.toFixed(4)),
            hs300_close: last.hs300_close,
            shanghai_close: last.shanghai_close,
            douyin_search: last.douyin_search,
            margin_total: last.margin_total,
            hs300_turnover_rate: last.hs300_turnover_rate,
            crowding_z: last.crowding_z,
            raw: last.raw,
        });
    }
    // sort by date
    out.sort((a, b) => a.date - b.date);
    return out;
}

// Small utility to format date
function fmtDate(d) {
    if (!d) return "-";
    const dt = new Date(d);
    if (isToday(dt)) return "今天";
    if (isYesterday(dt)) return "昨天";
    return format(dt, "yyyy年MM月dd日", { locale: zhCN });
}

// Calculate trend analysis
function calculateTrend(data, days = 7) {
    if (!data || data.length < days) return null;
    const recent = data.slice(-days);
    const first = recent[0].escape_index_0_100 || 0;
    const last = recent[recent.length - 1].escape_index_0_100 || 0;
    const change = last - first;
    const changePercent = first > 0 ? (change / first) * 100 : 0;

    return {
        change,
        changePercent,
        trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
        direction: change > 0 ? "上升" : change < 0 ? "下降" : "持平",
    };
}

// Export data to CSV
function exportToCSV(data, filename = "escape_index_data.csv") {
    if (!data || data.length === 0) {
        toast.error("没有数据可导出");
        return;
    }

    const headers = [
        "日期",
        "逃顶指数",
        "沪深300收盘价",
        "上证指数收盘价",
        "换手率",
        "融资余额",
        "抖音热度",
        "拥挤度Z",
        "风险等级",
    ];
    const csvContent = [
        headers.join(","),
        ...data.map(row =>
            [
                row.date,
                row.escape_index_0_100 || "",
                row.hs300_close || "",
                row.shanghai_close || "",
                row.raw?.hs300_turnover_rate || "",
                row.raw?.margin_total || "",
                row.raw?.douyin_search || "",
                row.raw?.crowding_z || "",
                row.raw?.escape_level || "",
            ].join(","),
        ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
        type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("数据导出成功");
}

export default function EscapeIndexDashboard() {
    const [rawData, setRawData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    // UI state
    const [rangeStart, setRangeStart] = useState(null);
    const [rangeEnd, setRangeEnd] = useState(null);
    const [quickRange, setQuickRange] = useState("1year");
    const [view, setView] = useState("day"); // day, week, month, year
    const [maxPoints, setMaxPoints] = useState(800);
    const [chartType, setChartType] = useState("line"); // line, area, bar
    const [showTrend, setShowTrend] = useState(true);

    // 设置状态
    const [settings, setSettings] = useState({
        maxPoints: 800,
        defaultView: "day",
        defaultRange: "1y",
        dangerThreshold: 85,
        warningThreshold: 75,
        showTrend: true,
        showGrid: true,
        showBrush: true,
    });

    // 行情叠加状态 - 默认叠加显示上证指数
    const [selectedOverlays, setSelectedOverlays] = useState([
        "shanghai_close",
    ]);

    const fetchData = useCallback(async (showLoading = true) => {
        if (showLoading) setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                "https://chuanjiabao.cuijunyu.win:3001/api/data",
            );
            if (!res.ok) throw new Error(`${res.status}`);
            const json = await res.json();
            if (!json || !json.data)
                throw new Error("格式错误: 返回没有data字段");
            const parsed = json.data
                .map(parseRow)
                .filter(r => r.date && !Number.isNaN(r.date.getTime()));
            parsed.sort((a, b) => a.date - b.date);

            // 调试信息
            console.log("Data fetched - total records:", parsed.length);
            console.log("Latest record:", parsed[parsed.length - 1]);
            console.log(
                "Latest douyin_search:",
                parsed[parsed.length - 1]?.douyin_search,
            );

            setRawData(parsed);
            // default date range: quickRange
            const latest = parsed[parsed.length - 1].date;
            setRangeEnd(latest.toISOString().slice(0, 10));
            const defaultStart = new Date(latest);
            defaultStart.setFullYear(defaultStart.getFullYear() - 1);
            setRangeStart(defaultStart.toISOString().slice(0, 10));

            if (showLoading) {
                toast.success("数据加载成功");
            }
        } catch (e) {
            console.error(e);
            const errorMsg = e.message || "获取数据失败";
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            if (showLoading) setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // derive filtered data by date range
    const filtered = useMemo(() => {
        if (!rawData) return null;
        const start = rangeStart ? new Date(rangeStart) : rawData[0].date;
        const end = rangeEnd
            ? new Date(rangeEnd)
            : rawData[rawData.length - 1].date;
        // clamp
        const out = rawData.filter(r => r.date >= start && r.date <= end);
        return out;
    }, [rawData, rangeStart, rangeEnd]);

    // aggregated & downsampled series for chart
    const chartData = useMemo(() => {
        if (!filtered) return null;
        const agg = aggregateByPeriod(filtered, view);
        // transform to recharts-friendly format
        const series = agg.map(d => ({
            date: d.date.toISOString().slice(0, 10),
            escape: d.escape_index_0_100,
            hs300_close: d.hs300_close,
            shanghai_close: d.shanghai_close,
            raw: d.raw,
        }));
        // downsample if necessary
        const ds = downsampleEven(series, maxPoints);
        return ds;
    }, [filtered, view, maxPoints]);

    // 处理叠加数据
    const processedChartData = useMemo(() => {
        if (!chartData) return null;

        // 如果没有选择叠加，直接返回原数据
        if (selectedOverlays.length === 0) return chartData;

        // 处理每个叠加指标
        let processedData = [...chartData];

        selectedOverlays.forEach(overlayKey => {
            const option = OVERLAY_OPTIONS.find(opt => opt.key === overlayKey);
            if (!option) return;

            // 获取原始数据范围
            const values = chartData
                .map(d => d.raw?.[overlayKey])
                .filter(v => v !== null && v !== undefined && !isNaN(v));

            if (values.length === 0) return;

            const range = {
                min: Math.min(...values),
                max: Math.max(...values),
            };

            // 根据缩放类型处理数据
            processedData = processedData.map(d => {
                const rawValue = d.raw?.[overlayKey];
                if (
                    rawValue === null ||
                    rawValue === undefined ||
                    isNaN(rawValue)
                ) {
                    return { ...d, [overlayKey]: null };
                }

                let normalizedValue;

                if (option.scale === "log") {
                    // 对数缩放
                    const minVal = Math.max(option.minValue || 0.1, range.min);
                    const maxVal = option.maxValue || range.max;
                    normalizedValue =
                        (Math.log(rawValue) - Math.log(minVal)) /
                        (Math.log(maxVal) - Math.log(minVal));
                } else {
                    // 线性缩放
                    const minVal =
                        option.minValue !== null ? option.minValue : range.min;
                    const maxVal =
                        option.maxValue !== null ? option.maxValue : range.max;
                    normalizedValue = (rawValue - minVal) / (maxVal - minVal);
                }

                return {
                    ...d,
                    [overlayKey]: Math.max(
                        0,
                        Math.min(100, normalizedValue * 100),
                    ),
                };
            });
        });

        return processedData;
    }, [chartData, selectedOverlays]);

    // latest index shown at top
    const latestSummary = useMemo(() => {
        if (!rawData) return null;
        const last = rawData[rawData.length - 1];
        return last;
    }, [rawData]);

    // trend analysis
    const trendAnalysis = useMemo(() => {
        if (!filtered) return null;
        return calculateTrend(filtered, 7);
    }, [filtered]);

    // Quick range handler
    function applyQuickRange(key) {
        if (!rawData || rawData.length === 0) return;
        const latest = rawData[rawData.length - 1].date;
        const endStr = latest.toISOString().slice(0, 10);

        if (key === "all") {
            // 显示全部数据
            setRangeStart(rawData[0].date.toISOString().slice(0, 10));
            setRangeEnd(endStr);
        } else {
            const start = new Date(latest);
            if (key === "30d") start.setDate(start.getDate() - 30);
            else if (key === "3m") start.setMonth(start.getMonth() - 3);
            else if (key === "6m") start.setMonth(start.getMonth() - 6);
            else if (key === "1y") start.setFullYear(start.getFullYear() - 1);
            else if (key === "3y") start.setFullYear(start.getFullYear() - 3);
            else start.setFullYear(start.getFullYear() - 1);
            setRangeStart(start.toISOString().slice(0, 10));
            setRangeEnd(endStr);
        }
        setQuickRange(key);
    }

    // Handle refresh
    const handleRefresh = () => {
        setRefreshing(true);
        fetchData(false);
    };

    // Handle export
    const handleExport = () => {
        if (!filtered) {
            toast.error("没有数据可导出");
            return;
        }
        const filename = `escape_index_${rangeStart}_${rangeEnd}.csv`;
        exportToCSV(filtered, filename);
    };

    // Handle settings change
    const handleSettingsChange = newSettings => {
        setSettings(newSettings);
        setMaxPoints(newSettings.maxPoints);
        setShowTrend(newSettings.showTrend);
        toast.success("设置已保存");
    };

    // Handle settings reset
    const handleSettingsReset = () => {
        const defaultSettings = {
            maxPoints: 800,
            defaultView: "day",
            defaultRange: "1y",
            dangerThreshold: 80,
            warningThreshold: 70,
            showTrend: true,
            showGrid: true,
            showBrush: true,
        };
        setSettings(defaultSettings);
        setMaxPoints(defaultSettings.maxPoints);
        setShowTrend(defaultSettings.showTrend);
        toast.success("设置已重置");
    };

    // Handle overlay change
    const handleOverlayChange = newOverlays => {
        // 限制最多选择3个叠加
        if (newOverlays.length > 3) {
            toast.error("最多只能选择3个叠加指标");
            return;
        }
        setSelectedOverlays(newOverlays);
        if (newOverlays.length > 0) {
            toast.success(`已添加 ${newOverlays.length} 个叠加指标`);
        }
    };

    // render escape level badge
    function levelBadge(level) {
        let color = "bg-green-100 text-green-800";
        if (!level) return null;
        if (level.includes("危险") || level.includes("高"))
            color = "bg-yellow-100 text-yellow-800";
        if (level.includes("极")) color = "bg-red-100 text-red-800";
        if (level.includes("安全")) color = "bg-green-100 text-green-800";
        return (
            <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${color} ring-1 ring-inset ring-gray-200`}>
                {level}
            </span>
        );
    }

    // render trend indicator
    function TrendIndicator({ trend }) {
        if (!trend) return null;

        const isUp = trend.trend === "up";
        const isDown = trend.trend === "down";

        return (
            <div className="flex items-center gap-2">
                {isUp && <TrendingUp className="w-4 h-4 text-red-500" />}
                {isDown && <TrendingDown className="w-4 h-4 text-green-500" />}
                <span
                    className={`text-sm font-medium ${
                        isUp
                            ? "text-red-600"
                            : isDown
                            ? "text-green-600"
                            : "text-gray-600"
                    }`}>
                    {trend.direction} {Math.abs(trend.changePercent).toFixed(1)}
                    %
                </span>
            </div>
        );
    }

    // render chart based on type
    function renderChart() {
        if (!processedChartData) return null;

        const commonProps = {
            data: processedChartData,
            margin: { top: 20, right: 30, left: 0, bottom: 0 },
        };

        const renderLine = () => (
            <LineChart {...commonProps}>
                {settings.showGrid && (
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                    />
                )}
                <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                />
                <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                />
                <Tooltip
                    wrapperStyle={{
                        borderRadius: 8,
                        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                        border: "none",
                    }}
                    contentStyle={{
                        background: "white",
                        borderRadius: 8,
                    }}
                    formatter={(value, name, props) => {
                        if (name === "escape") return [value, "逃顶指数"];

                        // 处理叠加数据的显示
                        const overlayOption = OVERLAY_OPTIONS.find(
                            opt => opt.key === name,
                        );
                        if (overlayOption) {
                            const rawValue = props.payload.raw?.[name];
                            if (rawValue !== null && rawValue !== undefined) {
                                const formattedValue =
                                    typeof rawValue === "number"
                                        ? name === "douyin_search"
                                            ? rawValue >= 1000000
                                                ? (rawValue / 1000000).toFixed(
                                                      1,
                                                  ) + "M"
                                                : rawValue >= 1000
                                                ? (rawValue / 1000).toFixed(1) +
                                                  "K"
                                                : rawValue.toLocaleString()
                                            : rawValue.toLocaleString()
                                        : rawValue;
                                return [
                                    `${formattedValue}${overlayOption.unit}`,
                                    overlayOption.label,
                                ];
                            }
                        }

                        return [value, name];
                    }}
                    labelFormatter={label => `日期: ${label}`}
                    itemSorter={(a, b) => b.value - a.value}
                    content={({ payload, label }) => {
                        if (!payload || payload.length === 0) return null;
                        const p = payload[0].payload;
                        const raw = p.raw || {};
                        return (
                            <div
                                className="p-3"
                                style={{ minWidth: 220 }}>
                                <div className="font-medium">{label}</div>
                                <div className="mt-2 text-sm text-slate-600 space-y-1">
                                    <div>逃顶指数: {p.escape ?? "—"}</div>
                                    <div>
                                        上证指数收盘价:{" "}
                                        {raw.shanghai_close !== undefined
                                            ? parseFloat(
                                                  raw.shanghai_close,
                                              ).toFixed(2) + "点"
                                            : "—"}
                                    </div>
                                    <div>
                                        沪深300收盘价:{" "}
                                        {p.hs300_close !== undefined
                                            ? parseFloat(p.hs300_close).toFixed(
                                                  2,
                                              ) + "点"
                                            : "—"}
                                    </div>
                                    <div>
                                        换手率:{" "}
                                        {raw.hs300_turnover_rate !== undefined
                                            ? parseFloat(
                                                  raw.hs300_turnover_rate,
                                              ).toFixed(2) + "%"
                                            : "—"}
                                    </div>
                                    <div>
                                        融资余额:{" "}
                                        {raw.margin_total !== undefined
                                            ? parseFloat(
                                                  raw.margin_total,
                                              ).toFixed(1) + "亿"
                                            : "—"}
                                    </div>
                                    <div>
                                        抖音热度:{" "}
                                        {raw.douyin_search !== undefined
                                            ? raw.douyin_search >= 1000000
                                                ? (
                                                      raw.douyin_search /
                                                      1000000
                                                  ).toFixed(1) + "M"
                                                : raw.douyin_search >= 1000
                                                ? (
                                                      raw.douyin_search / 1000
                                                  ).toFixed(1) + "K"
                                                : raw.douyin_search.toLocaleString()
                                            : "—"}
                                    </div>
                                    <div>
                                        风险等级: {raw.escape_level ?? "—"}
                                    </div>
                                </div>
                            </div>
                        );
                    }}
                />
                <Line
                    type="monotone"
                    dataKey="escape"
                    stroke="#0ea5a4"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                />
                {/* 渲染叠加线条 */}
                {selectedOverlays.map(overlayKey => {
                    const option = OVERLAY_OPTIONS.find(
                        opt => opt.key === overlayKey,
                    );
                    if (!option) return null;

                    return (
                        <Line
                            key={overlayKey}
                            type="monotone"
                            dataKey={overlayKey}
                            stroke={option.color}
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                            dot={false}
                            isAnimationActive={false}
                        />
                    );
                })}
                {showTrend && settings.showGrid && (
                    <>
                        <ReferenceLine
                            y={settings.dangerThreshold}
                            stroke="#ef4444"
                            strokeDasharray="3 3"
                            label={{ value: "危险线", position: "top" }}
                        />
                        <ReferenceLine
                            y={settings.warningThreshold}
                            stroke="#f59e0b"
                            strokeDasharray="3 3"
                            label={{ value: "警告线", position: "top" }}
                        />
                    </>
                )}
                {settings.showBrush && (
                    <Brush
                        dataKey="date"
                        height={30}
                        stroke="#94a3b8"
                        travellerWidth={10}
                    />
                )}
            </LineChart>
        );

        const renderArea = () => (
            <AreaChart {...commonProps}>
                {settings.showGrid && (
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                    />
                )}
                <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                />
                <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                />
                <Tooltip
                    wrapperStyle={{
                        borderRadius: 8,
                        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                        border: "none",
                    }}
                    contentStyle={{
                        background: "white",
                        borderRadius: 8,
                    }}
                    formatter={(value, name, props) => {
                        if (name === "escape") return [value, "逃顶指数"];

                        // 处理叠加数据的显示
                        const overlayOption = OVERLAY_OPTIONS.find(
                            opt => opt.key === name,
                        );
                        if (overlayOption) {
                            const rawValue = props.payload.raw?.[name];
                            if (rawValue !== null && rawValue !== undefined) {
                                // 根据不同的指标类型进行格式化
                                if (
                                    name === "shanghai_close" ||
                                    name === "hs300_close"
                                ) {
                                    const formattedValue =
                                        parseFloat(rawValue).toFixed(2);
                                    return [
                                        `${formattedValue}点`,
                                        overlayOption.label,
                                    ];
                                } else if (name === "hs300_turnover_rate") {
                                    const formattedValue =
                                        parseFloat(rawValue).toFixed(2);
                                    return [
                                        `${formattedValue}%`,
                                        overlayOption.label,
                                    ];
                                } else if (name === "margin_total") {
                                    const formattedValue =
                                        parseFloat(rawValue).toFixed(1);
                                    return [
                                        `${formattedValue}亿`,
                                        overlayOption.label,
                                    ];
                                } else if (name === "douyin_search") {
                                    const formattedValue =
                                        rawValue >= 1000000
                                            ? (rawValue / 1000000).toFixed(1) +
                                              "M"
                                            : rawValue >= 1000
                                            ? (rawValue / 1000).toFixed(1) + "K"
                                            : rawValue.toLocaleString();
                                    return [
                                        formattedValue,
                                        overlayOption.label,
                                    ];
                                } else {
                                    const formattedValue =
                                        typeof rawValue === "number"
                                            ? rawValue.toLocaleString()
                                            : rawValue;
                                    return [
                                        `${formattedValue}${overlayOption.unit}`,
                                        overlayOption.label,
                                    ];
                                }
                            }
                        }

                        return [value, name];
                    }}
                    labelFormatter={label => `日期: ${label}`}
                />
                <Area
                    type="monotone"
                    dataKey="escape"
                    stroke="#0ea5a4"
                    fill="#0ea5a4"
                    fillOpacity={0.3}
                    strokeWidth={2}
                    isAnimationActive={false}
                />
                {/* 渲染叠加线条 */}
                {selectedOverlays.map(overlayKey => {
                    const option = OVERLAY_OPTIONS.find(
                        opt => opt.key === overlayKey,
                    );
                    if (!option) return null;

                    return (
                        <Line
                            key={overlayKey}
                            type="monotone"
                            dataKey={overlayKey}
                            stroke={option.color}
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                            dot={false}
                            isAnimationActive={false}
                        />
                    );
                })}
                {showTrend && settings.showGrid && (
                    <>
                        <ReferenceLine
                            y={settings.dangerThreshold}
                            stroke="#ef4444"
                            strokeDasharray="3 3"
                            label={{ value: "危险线", position: "top" }}
                        />
                        <ReferenceLine
                            y={settings.warningThreshold}
                            stroke="#f59e0b"
                            strokeDasharray="3 3"
                            label={{ value: "警告线", position: "top" }}
                        />
                    </>
                )}
                {settings.showBrush && (
                    <Brush
                        dataKey="date"
                        height={30}
                        stroke="#94a3b8"
                        travellerWidth={10}
                    />
                )}
            </AreaChart>
        );

        const renderBar = () => (
            <BarChart {...commonProps}>
                {settings.showGrid && (
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f1f5f9"
                    />
                )}
                <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                />
                <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                />
                <Tooltip
                    wrapperStyle={{
                        borderRadius: 8,
                        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                        border: "none",
                    }}
                    contentStyle={{
                        background: "white",
                        borderRadius: 8,
                    }}
                    formatter={(value, name, props) => {
                        if (name === "escape") return [value, "逃顶指数"];

                        // 处理叠加数据的显示
                        const overlayOption = OVERLAY_OPTIONS.find(
                            opt => opt.key === name,
                        );
                        if (overlayOption) {
                            const rawValue = props.payload.raw?.[name];
                            if (rawValue !== null && rawValue !== undefined) {
                                // 根据不同的指标类型进行格式化
                                if (
                                    name === "shanghai_close" ||
                                    name === "hs300_close"
                                ) {
                                    const formattedValue =
                                        parseFloat(rawValue).toFixed(2);
                                    return [
                                        `${formattedValue}点`,
                                        overlayOption.label,
                                    ];
                                } else if (name === "hs300_turnover_rate") {
                                    const formattedValue =
                                        parseFloat(rawValue).toFixed(2);
                                    return [
                                        `${formattedValue}%`,
                                        overlayOption.label,
                                    ];
                                } else if (name === "margin_total") {
                                    const formattedValue =
                                        parseFloat(rawValue).toFixed(1);
                                    return [
                                        `${formattedValue}亿`,
                                        overlayOption.label,
                                    ];
                                } else if (name === "douyin_search") {
                                    const formattedValue =
                                        rawValue >= 1000000
                                            ? (rawValue / 1000000).toFixed(1) +
                                              "M"
                                            : rawValue >= 1000
                                            ? (rawValue / 1000).toFixed(1) + "K"
                                            : rawValue.toLocaleString();
                                    return [
                                        formattedValue,
                                        overlayOption.label,
                                    ];
                                } else {
                                    const formattedValue =
                                        typeof rawValue === "number"
                                            ? rawValue.toLocaleString()
                                            : rawValue;
                                    return [
                                        `${formattedValue}${overlayOption.unit}`,
                                        overlayOption.label,
                                    ];
                                }
                            }
                        }

                        return [value, name];
                    }}
                    labelFormatter={label => `日期: ${label}`}
                />
                <Bar
                    dataKey="escape"
                    fill="#0ea5a4"
                    radius={[2, 2, 0, 0]}
                />
                {/* 渲染叠加线条 */}
                {selectedOverlays.map(overlayKey => {
                    const option = OVERLAY_OPTIONS.find(
                        opt => opt.key === overlayKey,
                    );
                    if (!option) return null;

                    return (
                        <Line
                            key={overlayKey}
                            type="monotone"
                            dataKey={overlayKey}
                            stroke={option.color}
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                            dot={false}
                            isAnimationActive={false}
                        />
                    );
                })}
                {showTrend && settings.showGrid && (
                    <>
                        <ReferenceLine
                            y={settings.dangerThreshold}
                            stroke="#ef4444"
                            strokeDasharray="3 3"
                            label={{ value: "危险线", position: "top" }}
                        />
                        <ReferenceLine
                            y={settings.warningThreshold}
                            stroke="#f59e0b"
                            strokeDasharray="3 3"
                            label={{ value: "警告线", position: "top" }}
                        />
                    </>
                )}
                {settings.showBrush && (
                    <Brush
                        dataKey="date"
                        height={30}
                        stroke="#94a3b8"
                        travellerWidth={10}
                    />
                )}
            </BarChart>
        );

        switch (chartType) {
            case "area":
                return renderArea();
            case "bar":
                return renderBar();
            default:
                return renderLine();
        }
    }

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8fa,white)] p-6">
            <Toaster position="top-right" />
            <div className="max-w-7xl mx-auto">
                <header className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">
                            牛市逃顶指数仪表盘
                        </h1>
                        <p className="mt-1 text-sm text-slate-500">
                            通过市场与情绪因子合成的逃顶指数（0-100），高分表明市场过热
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 sm:gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-medium text-slate-600 mb-1">
                                当前逃顶指数
                            </span>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex items-baseline gap-3">
                                    <span className="text-5xl font-bold text-slate-900">
                                        {latestSummary &&
                                            (latestSummary.escape_index_0_100 ??
                                                "—")}
                                    </span>
                                    {latestSummary &&
                                        levelBadge(latestSummary.escape_level)}
                                </div>
                            </div>
                            <span className="text-xs text-slate-400 mt-2">
                                更新：
                                {latestSummary
                                    ? fmtDate(latestSummary.date)
                                    : "—"}
                            </span>
                        </div>

                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="p-2 rounded-lg bg-white shadow-md ring-1 ring-gray-100 hover:bg-gray-50 disabled:opacity-50"
                            title="刷新数据">
                            <RefreshCw
                                className={`w-5 h-5 ${
                                    refreshing ? "animate-spin" : ""
                                }`}
                            />
                        </button>
                        <OverlaySelector
                            selectedOverlays={selectedOverlays}
                            onOverlayChange={handleOverlayChange}
                            data={filtered}
                        />
                        <SettingsPanel
                            settings={settings}
                            onSettingsChange={handleSettingsChange}
                            onReset={handleSettingsReset}
                        />
                    </div>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* 左侧面板 - 只保留当前风险解读 */}
                    <aside className="lg:col-span-1">
                        {/* 当前风险解读 */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-sm font-semibold">
                                    当前风险解读
                                </div>
                                <div className="text-xs text-slate-400">
                                    自动更新
                                </div>
                            </div>
                            <div className="text-sm text-slate-600 space-y-3">
                                <div>
                                    <div className="text-xs text-slate-400">
                                        最新日期
                                    </div>
                                    <div className="font-medium">
                                        {latestSummary
                                            ? fmtDate(latestSummary.date)
                                            : "—"}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-slate-400">
                                        逃顶指数
                                    </div>
                                    <div className="font-semibold text-lg">
                                        {latestSummary
                                            ? latestSummary.escape_index_0_100
                                            : "—"}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-slate-400">
                                        信号
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {latestSummary &&
                                        latestSummary.escape_signal ? (
                                            <span className="text-red-600 font-medium">
                                                触发
                                            </span>
                                        ) : (
                                            <span className="text-green-600 font-medium">
                                                未触发
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {trendAnalysis && (
                                    <div>
                                        <div className="text-xs text-slate-400">
                                            7日趋势
                                        </div>
                                        <TrendIndicator trend={trendAnalysis} />
                                    </div>
                                )}

                                <div>
                                    <div className="text-xs text-slate-400">
                                        说明
                                    </div>
                                    <div className="text-sm text-slate-600">
                                        {latestSummary &&
                                        latestSummary.escape_index_0_100 ? (
                                            <>
                                                {latestSummary.escape_index_0_100 >=
                                                80 ? (
                                                    <div className="space-y-2">
                                                        <div className="font-medium text-red-600">
                                                            ⚠️ 高风险区域
                                                        </div>
                                                        <div>
                                                            •
                                                            建议减仓或清仓，市场过热风险较大
                                                        </div>
                                                        <div>
                                                            •
                                                            关注资金面变化，避免追高
                                                        </div>
                                                        <div>
                                                            •
                                                            可考虑配置防御性资产
                                                        </div>
                                                    </div>
                                                ) : latestSummary.escape_index_0_100 >=
                                                  70 ? (
                                                    <div className="space-y-2">
                                                        <div className="font-medium text-orange-600">
                                                            ⚠️ 中等风险区域
                                                        </div>
                                                        <div>
                                                            •
                                                            建议适度减仓，保持谨慎
                                                        </div>
                                                        <div>
                                                            • 关注市场情绪变化
                                                        </div>
                                                        <div>
                                                            • 避免大幅加仓
                                                        </div>
                                                    </div>
                                                ) : latestSummary.escape_index_0_100 >=
                                                  50 ? (
                                                    <div className="space-y-2">
                                                        <div className="font-medium text-blue-600">
                                                            📊 正常区域
                                                        </div>
                                                        <div>
                                                            •
                                                            市场情绪正常，可保持当前仓位
                                                        </div>
                                                        <div>
                                                            • 关注趋势变化
                                                        </div>
                                                        <div>
                                                            • 适度配置，分散风险
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="font-medium text-green-600">
                                                            💡 低风险区域
                                                        </div>
                                                        <div>
                                                            •
                                                            市场情绪偏冷，可能存在机会
                                                        </div>
                                                        <div>
                                                            • 可考虑适度加仓
                                                        </div>
                                                        <div>
                                                            • 关注基本面改善信号
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            "当指数高于阈值（如80）系统会发出撤退建议。结合资金面与搜索热度进行判断，避免单一因子误报。"
                                        )}
                                    </div>
                                </div>

                                <div className="pt-4 space-y-2">
                                    <button
                                        onClick={handleExport}
                                        className="w-full py-2 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 flex items-center justify-center gap-2">
                                        <Download className="w-4 h-4" />
                                        导出当前范围数据（CSV）
                                    </button>
                                    <button
                                        onClick={() => setShowTrend(!showTrend)}
                                        className="w-full py-2 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 flex items-center justify-center gap-2">
                                        <Info className="w-4 h-4" />
                                        {showTrend ? "隐藏" : "显示"}危险线
                                    </button>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* 右侧主区域 - 包含图表和统计面板 */}
                    <section className="lg:col-span-3 space-y-6">
                        {/* 主图表区域 */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
                                <div className="flex items-center gap-3">
                                    <Activity size={18} />
                                    <div className="text-xs font-semibold">
                                        逃顶指数变化
                                    </div>
                                    <div className="text-xs text-slate-400 hidden sm:inline">
                                        (悬停可查看当日行情)
                                    </div>
                                    {trendAnalysis && (
                                        <TrendIndicator trend={trendAnalysis} />
                                    )}
                                </div>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                                    <div className="flex items-center gap-1 text-sm">
                                        <Calendar size={14} />
                                        <input
                                            type="date"
                                            className="text-sm p-1 border rounded-md"
                                            value={rangeStart || ""}
                                            onChange={e =>
                                                setRangeStart(e.target.value)
                                            }
                                        />
                                        <span className="mx-1">—</span>
                                        <input
                                            type="date"
                                            className="text-sm p-1 border rounded-md"
                                            value={rangeEnd || ""}
                                            onChange={e =>
                                                setRangeEnd(e.target.value)
                                            }
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1">
                                        <button
                                            onClick={() =>
                                                applyQuickRange("30d")
                                            }
                                            className={`px-2 py-1 rounded-md text-xs ring-1 ring-gray-100 ${
                                                quickRange === "30d"
                                                    ? "bg-slate-900 text-white"
                                                    : ""
                                            }`}>
                                            30天
                                        </button>
                                        <button
                                            onClick={() =>
                                                applyQuickRange("3m")
                                            }
                                            className={`px-2 py-1 rounded-md text-xs ring-1 ring-gray-100 ${
                                                quickRange === "3m"
                                                    ? "bg-slate-900 text-white"
                                                    : ""
                                            }`}>
                                            3月
                                        </button>
                                        <button
                                            onClick={() =>
                                                applyQuickRange("6m")
                                            }
                                            className={`px-2 py-1 rounded-md text-xs ring-1 ring-gray-100 ${
                                                quickRange === "6m"
                                                    ? "bg-slate-900 text-white"
                                                    : ""
                                            }`}>
                                            6月
                                        </button>
                                        <button
                                            onClick={() =>
                                                applyQuickRange("1y")
                                            }
                                            className={`px-2 py-1 rounded-md text-xs ring-1 ring-gray-100 ${
                                                quickRange === "1y"
                                                    ? "bg-slate-900 text-white"
                                                    : ""
                                            }`}>
                                            1年
                                        </button>
                                        <button
                                            onClick={() =>
                                                applyQuickRange("3y")
                                            }
                                            className={`px-2 py-1 rounded-md text-xs ring-1 ring-gray-100 ${
                                                quickRange === "3y"
                                                    ? "bg-slate-900 text-white"
                                                    : ""
                                            }`}>
                                            3年
                                        </button>
                                        <button
                                            onClick={() =>
                                                applyQuickRange("all")
                                            }
                                            className={`px-2 py-1 rounded-md text-xs ring-1 ring-gray-100 ${
                                                quickRange === "all"
                                                    ? "bg-slate-900 text-white"
                                                    : ""
                                            }`}>
                                            全部
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div
                                style={{ width: "100%", height: 420 }}
                                className="rounded-lg overflow-hidden">
                                {loading && (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <div className="flex items-center gap-2">
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            加载中...
                                        </div>
                                    </div>
                                )}
                                {error && (
                                    <div className="w-full h-full flex items-center justify-center text-red-500">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="w-5 h-5" />
                                            {error}
                                        </div>
                                    </div>
                                )}
                                {!loading && !chartData && (
                                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                                        暂无数据
                                    </div>
                                )}

                                {chartData && (
                                    <ResponsiveContainer>
                                        {renderChart()}
                                    </ResponsiveContainer>
                                )}
                            </div>

                            <div className="mt-4 flex flex-col lg:flex-row lg:items-center gap-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    {/* 叠加图例 */}
                                    {selectedOverlays.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm text-slate-500">
                                                叠加:
                                            </div>
                                            {selectedOverlays.map(
                                                overlayKey => {
                                                    const option =
                                                        OVERLAY_OPTIONS.find(
                                                            opt =>
                                                                opt.key ===
                                                                overlayKey,
                                                        );
                                                    if (!option) return null;

                                                    return (
                                                        <div
                                                            key={overlayKey}
                                                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-xs">
                                                            <div
                                                                className="w-3 h-3 rounded-full"
                                                                style={{
                                                                    backgroundColor:
                                                                        option.color,
                                                                }}
                                                            />
                                                            <span>
                                                                {option.label}
                                                            </span>
                                                        </div>
                                                    );
                                                },
                                            )}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2">
                                        <div className="text-sm text-slate-500">
                                            视图
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setView("day")}
                                                className={`px-2 py-1 rounded-md text-xs ${
                                                    view === "day"
                                                        ? "bg-slate-900 text-white"
                                                        : "ring-1 ring-gray-100"
                                                }`}>
                                                日
                                            </button>
                                            <button
                                                onClick={() => setView("week")}
                                                className={`px-2 py-1 rounded-md text-xs ${
                                                    view === "week"
                                                        ? "bg-slate-900 text-white"
                                                        : "ring-1 ring-gray-100"
                                                }`}>
                                                周
                                            </button>
                                            <button
                                                onClick={() => setView("month")}
                                                className={`px-2 py-1 rounded-md text-xs ${
                                                    view === "month"
                                                        ? "bg-slate-900 text-white"
                                                        : "ring-1 ring-gray-100"
                                                }`}>
                                                月
                                            </button>
                                            <button
                                                onClick={() => setView("year")}
                                                className={`px-2 py-1 rounded-md text-xs ${
                                                    view === "year"
                                                        ? "bg-slate-900 text-white"
                                                        : "ring-1 ring-gray-100"
                                                }`}>
                                                年
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className="text-sm text-slate-500">
                                            图表类型
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() =>
                                                    setChartType("line")
                                                }
                                                className={`p-1.5 rounded-md ${
                                                    chartType === "line"
                                                        ? "bg-slate-900 text-white"
                                                        : "ring-1 ring-gray-100"
                                                }`}
                                                title="折线图">
                                                <LineChartIcon className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setChartType("area")
                                                }
                                                className={`p-1.5 rounded-md ${
                                                    chartType === "area"
                                                        ? "bg-slate-900 text-white"
                                                        : "ring-1 ring-gray-100"
                                                }`}
                                                title="面积图">
                                                <BarChart3 className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setChartType("bar")
                                                }
                                                className={`p-1.5 rounded-md ${
                                                    chartType === "bar"
                                                        ? "bg-slate-900 text-white"
                                                        : "ring-1 ring-gray-100"
                                                }`}
                                                title="柱状图">
                                                <BarChart3 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="lg:ml-auto flex items-center gap-2 text-sm text-slate-500">
                                    <div>点数上限</div>
                                    <select
                                        value={maxPoints}
                                        onChange={e =>
                                            setMaxPoints(Number(e.target.value))
                                        }
                                        className="p-1 border rounded-md text-xs">
                                        <option value={300}>300</option>
                                        <option value={600}>600</option>
                                        <option value={800}>800</option>
                                        <option value={1200}>1200</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* 统计信息和市场情绪面板 - 左右分栏 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* 统计信息面板 */}
                            <StatisticsPanel
                                data={filtered}
                                latestData={latestSummary}
                            />

                            {/* 市场情绪面板 */}
                            <MarketSentimentPanel
                                data={filtered}
                                latestData={
                                    filtered && filtered.length > 0
                                        ? [...filtered]
                                              .reverse()
                                              .find(
                                                  d =>
                                                      d.douyin_search !==
                                                          null &&
                                                      d.douyin_search !==
                                                          undefined,
                                              )
                                        : null
                                }
                            />
                        </div>
                    </section>
                </main>

                <footer className="mt-6 text-center text-xs text-slate-400">
                    数据来源于网络 / 仅供参考，不构成投资建议
                </footer>
            </div>
        </div>
    );
}
