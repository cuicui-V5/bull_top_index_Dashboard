import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Brush,
} from "recharts";
import { Sun, Clock, Calendar, Activity } from "lucide-react";

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
  const dateKey = Object.keys(r).find((k) => k.trim().match(/^日期$/)) || "日期";
  const dateRaw = r[dateKey] || r["日期"];
  const date = new Date(dateRaw);
  const safeNum = (v) => {
    if (v === null || v === undefined || v === "" || v === "NaN") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    date,
    dateStr: dateRaw,
    hs300_close: safeNum(r.hs300_close),
    hs300_ret: safeNum(r.hs300_ret),
    hs300_turnover_log: safeNum(r.hs300_turnover_log),
    hs300_amplitude: safeNum(r.hs300_amplitude),
    hs300_turnover_rate: safeNum(r.hs300_turnover_rate),
    margin_total: safeNum(r.margin_total),
    douyin_search: safeNum(r.douyin_search),
    crowding_z: safeNum(r.crowding_z),
    escape_index_0_100: safeNum(r.escape_index_0_100),
    escape_signal: r.escape_signal === "1" || r.escape_signal === true || r.escape_signal === "true",
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
      key = `${temp.getFullYear()}-W${String(Math.floor((temp - new Date(temp.getFullYear(),0,1))/(7*24*3600*1000))+1)}`;
      // Simpler: group by Monday date
      key = temp.toISOString().slice(0,10);
    } else if (period === "month") {
      key = `${yy}-${String(mm).padStart(2,'0')}`;
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
    const meanEscape = arr.reduce((s, x) => s + (x.escape_index_0_100 || 0), 0) / arr.length;
    out.push({
      date: last.date,
      dateStr: last.dateStr,
      escape_index_0_100: Number((meanEscape).toFixed(4)),
      hs300_close: last.hs300_close,
      raw: last.raw,
    });
  }
  // sort by date
  out.sort((a,b) => a.date - b.date);
  return out;
}

// Small utility to format date
function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString();
}

export default function EscapeIndexDashboard() {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);
  const [quickRange, setQuickRange] = useState("1year");
  const [view, setView] = useState("day"); // day, week, month, year
  const [maxPoints, setMaxPoints] = useState(800);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("http://localhost:3000/api/data");
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (!json || !json.data) throw new Error("格式错误: 返回没有data字段");
        const parsed = json.data.map(parseRow).filter((r) => r.date && !Number.isNaN(r.date.getTime()));
        parsed.sort((a,b) => a.date - b.date);
        if (!cancelled) {
          setRawData(parsed);
          // default date range: quickRange
          const latest = parsed[parsed.length - 1].date;
          setRangeEnd(latest.toISOString().slice(0,10));
          const defaultStart = new Date(latest);
          defaultStart.setFullYear(defaultStart.getFullYear()-1);
          setRangeStart(defaultStart.toISOString().slice(0,10));
        }
      } catch (e) {
        console.error(e);
        setError(e.message || "Fetch error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // derive filtered data by date range
  const filtered = useMemo(() => {
    if (!rawData) return null;
    const start = rangeStart ? new Date(rangeStart) : rawData[0].date;
    const end = rangeEnd ? new Date(rangeEnd) : rawData[rawData.length-1].date;
    // clamp
    const out = rawData.filter((r) => r.date >= start && r.date <= end);
    return out;
  }, [rawData, rangeStart, rangeEnd]);

  // aggregated & downsampled series for chart
  const chartData = useMemo(() => {
    if (!filtered) return null;
    const agg = aggregateByPeriod(filtered, view);
    // transform to recharts-friendly format
    const series = agg.map((d) => ({
      date: d.date.toISOString().slice(0,10),
      escape: d.escape_index_0_100,
      hs300_close: d.hs300_close,
      raw: d.raw,
    }));
    // downsample if necessary
    const ds = downsampleEven(series, maxPoints);
    return ds;
  }, [filtered, view, maxPoints]);

  // latest index shown at top
  const latestSummary = useMemo(() => {
    if (!rawData) return null;
    const last = rawData[rawData.length - 1];
    return last;
  }, [rawData]);

  // Quick range handler
  function applyQuickRange(key) {
    if (!rawData || rawData.length === 0) return;
    const latest = rawData[rawData.length - 1].date;
    const endStr = latest.toISOString().slice(0,10);
    const start = new Date(latest);
    if (key === "30d") start.setDate(start.getDate()-30);
    else if (key === "3m") start.setMonth(start.getMonth()-3);
    else if (key === "6m") start.setMonth(start.getMonth()-6);
    else if (key === "1y") start.setFullYear(start.getFullYear()-1);
    else if (key === "2y") start.setFullYear(start.getFullYear()-2);
    else start.setFullYear(start.getFullYear()-1);
    setRangeStart(start.toISOString().slice(0,10));
    setRangeEnd(endStr);
    setQuickRange(key);
  }

  // render escape level badge
  function levelBadge(level) {
    let color = "bg-green-100 text-green-800";
    if (!level) return null;
    if (level.includes("危险") || level.includes("高")) color = "bg-yellow-100 text-yellow-800";
    if (level.includes("极")) color = "bg-red-100 text-red-800";
    if (level.includes("安全")) color = "bg-green-100 text-green-800";
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${color} ring-1 ring-inset ring-gray-200`}>{level}</span>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8fa,white)] p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">牛市逃顶指数仪表盘</h1>
            <p className="mt-1 text-sm text-slate-500">通过市场与情绪因子合成的逃顶指数（0-100），高分表明市场过热</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-slate-500">当前逃顶指数</div>
              <div className="mt-1 flex items-baseline gap-3">
                <div className="text-4xl font-bold text-slate-900">{latestSummary && (latestSummary.escape_index_0_100 ?? "—")}</div>
                <div>{latestSummary && levelBadge(latestSummary.escape_level)}</div>
              </div>
              <div className="text-xs text-slate-400">更新：{latestSummary ? fmtDate(latestSummary.date) : "—"}</div>
            </div>
            <div className="p-3 rounded-2xl bg-white shadow-md ring-1 ring-gray-100">
              <div className="text-xs text-slate-500">风险提示</div>
              <div className="font-medium text-sm mt-1 text-slate-800">{latestSummary ? latestSummary.escape_level : "—"}</div>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Activity size={18} />
                <div className="font-semibold">逃顶指数变化</div>
                <div className="text-xs text-slate-400">(悬停可查看当日行情)</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm">
                  <Calendar size={14} />
                  <input
                    type="date"
                    className="text-sm p-1 border rounded-md"
                    value={rangeStart || ""}
                    onChange={(e) => setRangeStart(e.target.value)}
                  />
                  <span className="mx-1">—</span>
                  <input
                    type="date"
                    className="text-sm p-1 border rounded-md"
                    value={rangeEnd || ""}
                    onChange={(e) => setRangeEnd(e.target.value)}
                  />
                </div>
                <div className="hidden sm:flex items-center gap-1">
                  <button onClick={() => applyQuickRange("30d")} className="px-3 py-1 rounded-md text-sm ring-1 ring-gray-100">30天</button>
                  <button onClick={() => applyQuickRange("3m")} className="px-3 py-1 rounded-md text-sm ring-1 ring-gray-100">三个月</button>
                  <button onClick={() => applyQuickRange("6m")} className="px-3 py-1 rounded-md text-sm ring-1 ring-gray-100">半年</button>
                  <button onClick={() => applyQuickRange("1y")} className="px-3 py-1 rounded-md text-sm ring-1 ring-gray-100">一年</button>
                  <button onClick={() => applyQuickRange("2y")} className="px-3 py-1 rounded-md text-sm ring-1 ring-gray-100">两年</button>
                </div>
              </div>
            </div>

            <div style={{ width: "100%", height: 420 }} className="rounded-lg overflow-hidden">
              {loading && <div className="w-full h-full flex items-center justify-center">加载中...</div>}
              {error && <div className="text-red-500">{error}</div>}
              {!loading && !chartData && <div className="text-slate-400">暂无数据</div>}

              {chartData && (
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip
                      wrapperStyle={{ borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.08)", border: "none" }}
                      contentStyle={{ background: "white", borderRadius: 8 }}
                      formatter={(value, name, props) => {
                        if (name === 'escape') return [value, '逃顶指数'];
                        return [value, name];
                      }}
                      labelFormatter={(label) => `日期: ${label}`}
                      itemSorter={(a,b) => b.value - a.value}
                      content={({ payload, label }) => {
                        if (!payload || payload.length === 0) return null;
                        const p = payload[0].payload;
                        // show rich tooltip with selected raw row fields
                        const raw = p.raw || {};
                        return (
                          <div className="p-3" style={{ minWidth: 220 }}>
                            <div className="font-medium">{label}</div>
                            <div className="mt-2 text-sm text-slate-600">
                              <div>逃顶指数: {p.escape ?? '—'}</div>
                              <div>hs300 收盘: {p.hs300_close ?? '—'}</div>
                              {raw.hs300_turnover_rate !== undefined && <div>换手率: {raw.hs300_turnover_rate}</div>}
                              {raw.margin_total !== undefined && <div>融资余额: {raw.margin_total}</div>}
                              {raw.douyin_search !== undefined && <div>抖音热度: {raw.douyin_search}</div>}
                              {raw.crowding_z !== undefined && <div>拥挤度 Z: {raw.crowding_z}</div>}
                              {raw.escape_level !== undefined && <div>风险等级: {raw.escape_level}</div>}
                            </div>
                          </div>
                        );
                      }}
                    />

                    <Line type="monotone" dataKey="escape" stroke="#0ea5a4" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Brush dataKey="date" height={30} stroke="#94a3b8" travellerWidth={10} />

                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="text-sm text-slate-500">视图</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setView('day')} className={`px-3 py-1 rounded-md ${view==='day' ? 'bg-slate-900 text-white' : 'ring-1 ring-gray-100'}`}>日视图</button>
                <button onClick={() => setView('week')} className={`px-3 py-1 rounded-md ${view==='week' ? 'bg-slate-900 text-white' : 'ring-1 ring-gray-100'}`}>周视图</button>
                <button onClick={() => setView('month')} className={`px-3 py-1 rounded-md ${view==='month' ? 'bg-slate-900 text-white' : 'ring-1 ring-gray-100'}`}>月视图</button>
                <button onClick={() => setView('year')} className={`px-3 py-1 rounded-md ${view==='year' ? 'bg-slate-900 text-white' : 'ring-1 ring-gray-100'}`}>年视图</button>
              </div>

              <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
                <div>图表点数上限</div>
                <select value={maxPoints} onChange={(e)=>setMaxPoints(Number(e.target.value))} className="ml-2 p-1 border rounded-md">
                  <option value={300}>300</option>
                  <option value={600}>600</option>
                  <option value={800}>800</option>
                  <option value={1200}>1200</option>
                </select>
              </div>
            </div>

          </section>

          <aside className="lg:col-span-1 bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold">当前风险解读</div>
              <div className="text-xs text-slate-400">自动更新</div>
            </div>
            <div className="text-sm text-slate-600 space-y-3">
              <div>
                <div className="text-xs text-slate-400">最新日期</div>
                <div className="font-medium">{latestSummary ? fmtDate(latestSummary.date) : '—'}</div>
              </div>

              <div>
                <div className="text-xs text-slate-400">逃顶指数</div>
                <div className="font-semibold text-lg">{latestSummary ? latestSummary.escape_index_0_100 : '—'}</div>
              </div>

              <div>
                <div className="text-xs text-slate-400">信号</div>
                <div className="flex items-center gap-2">{latestSummary && latestSummary.escape_signal ? <span className="text-red-600 font-medium">触发</span> : <span className="text-green-600 font-medium">未触发</span>}</div>
              </div>

              <div>
                <div className="text-xs text-slate-400">说明</div>
                <div className="text-sm text-slate-600">当指数高于阈值（如80）系统会发出撤退建议。结合资金面与搜索热度进行判断，避免单一因子误报。</div>
              </div>

              <div className="pt-4">
                <button className="w-full py-2 rounded-xl bg-slate-900 text-white font-medium">导出当前范围数据（CSV）</button>
              </div>
            </div>
          </aside>
        </main>

        <footer className="mt-6 text-center text-xs text-slate-400">数据来源：本地 API / 仅供参考，不构成投资建议</footer>
      </div>
    </div>
  );
}
