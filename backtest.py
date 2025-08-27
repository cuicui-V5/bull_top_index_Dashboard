# -*- coding: utf-8 -*-
"""
牛市逃顶指数 — 自动回测与粗网格寻优（面向敏感/日线/提前5天检测）

保存为: bull_top_escape_index_backtest.py

运行:
    python bull_top_escape_index_backtest.py

说明:
- 默认读取文件:
    沪深300历史数据.csv
    中证全指历史数据.csv
    融资融券历史数据.csv
    抖音搜索指数.csv
- 回测基准顶部:
    2007-10-16, 2015-06-12, 2021-02-18
- 目标: 在每个顶部的 前5个交易日（top-5 ... top-1）内至少有一次信号才视为“命中”。
- 输出:
    - best_weights.json (最佳权重)
    - backtest_grid_results.csv (每组权重的 TP/FP/score)
    - escape_index_best.csv (使用最佳权重生成的时间序列与信号)

作者: ChatGPT（为你写的优化版回测脚本）
"""
import os
import sys
import math
import json
import argparse
import warnings
from itertools import product
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ------------------ 配置 ------------------
DEFAULT_FILES = {
    "hs300": "沪深300历史数据.csv",
    "csiall": "中证全指历史数据.csv",
    "margin": "融资融券历史数据.csv",
    "douyin": "抖音搜索指数.csv",
}
OUT_DIR = "./bt_outputs"
os.makedirs(OUT_DIR, exist_ok=True)

# 历史顶点（你已认可）
BULL_TOPS = [ "2015-06-12", "2021-02-18", "2024-10-08"]
BULL_TOPS = [pd.to_datetime(d) for d in BULL_TOPS]

# 回测参数
ADVANCE_DAYS = 7   # 要求信号在顶部前5天内出现
SIGNAL_THRESHOLD = 75.0  # 触发阈值（可调整）
LOGISTIC_K = 1.2   # logistic 映射陡峭度（用于 escape index）
SMOOTH_SPAN = 3    # EWMA 平滑 span

# ------------------ 工具函数（同优化脚本的稳健实现） ------------------
def try_read_csv(path, **kwargs):
    encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312"]
    last_err = None
    for enc in encodings:
        try:
            return pd.read_csv(path, encoding=enc, **kwargs)
        except Exception as e:
            last_err = e
    raise last_err

def parse_date_series(series):
    s = series.astype(str).str.strip()
    try:
        return pd.to_datetime(s, errors="raise")
    except Exception:
        pass
    try:
        return pd.to_datetime(s, format="%Y%m%d", errors="raise")
    except Exception:
        pass
    return pd.to_datetime(s, errors="coerce")

def to_numeric(df, cols):
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df

def robust_rolling_z(series, window=60, trend_window=None, min_periods=None):
    if min_periods is None:
        min_periods = max(3, window // 2)
    s = series.copy()
    if trend_window:
        trend = s.rolling(trend_window, min_periods=1).median()
        resid = s - trend
    else:
        resid = s
    med = resid.rolling(window, min_periods=min_periods).median()
    mad = (resid - med).abs().rolling(window, min_periods=min_periods).median()
    std_est = mad * 1.4826
    z = (resid - med) / std_est
    z = z.replace([np.inf, -np.inf], np.nan)
    return z

def clip_series(s, low=-3.0, high=3.0):
    return s.clip(lower=low, upper=high)

def logistic_to_0_100(x, k=1.2, x0=0.0):
    z = np.clip((x - x0) * k, -50, 50)
    return 100.0 / (1.0 + np.exp(-z))

# ------------------ 数据加载器 ------------------
def load_hs300(path):
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("沪深300数据缺少'日期'列")
    df["日期"] = parse_date_series(df["日期"])
    possible_turnover_cols = [c for c in df.columns if str(c).strip() in ["换手率", "换手"]]
    turnover_col = possible_turnover_cols[0] if possible_turnover_cols else None
    df = to_numeric(df, ["收盘", "成交额", "振幅", "涨跌幅"] + ([turnover_col] if turnover_col else []))
    df = df.sort_values("日期").reset_index(drop=True)
    df.rename(columns={"收盘":"hs300_close", "成交额":"hs300_turnover_amt", "振幅":"hs300_amplitude", "涨跌幅":"hs300_pct_chg"}, inplace=True)
    df["hs300_ret"] = df["hs300_close"].pct_change()
    df["hs300_turnover_log"] = np.log1p(df["hs300_turnover_amt"]) if "hs300_turnover_amt" in df.columns else np.nan
    if turnover_col:
        df["hs300_turnover_rate"] = df[turnover_col]
        if df["hs300_turnover_rate"].max(skipna=True) > 10:
            df["hs300_turnover_rate"] = df["hs300_turnover_rate"] / 100.0
    else:
        df["hs300_turnover_rate"] = np.nan
    return df[["日期", "hs300_close", "hs300_ret", "hs300_turnover_log", "hs300_amplitude", "hs300_turnover_rate"]]

def load_csiall(path):
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("中证全指数据缺少'日期'列")
    df["日期"] = parse_date_series(df["日期"])
    df = to_numeric(df, ["收盘", "成交额", "振幅", "涨跌幅"])
    df = df.sort_values("日期").reset_index(drop=True)
    df.rename(columns={"收盘":"csi_close", "成交额":"csi_turnover_amt", "振幅":"csi_amplitude", "涨跌幅":"csi_pct_chg"}, inplace=True)
    df["csi_ret"] = df["csi_close"].pct_change()
    df["csi_turnover_log"] = np.log1p(df["csi_turnover_amt"]) if "csi_turnover_amt" in df.columns else np.nan
    return df[["日期", "csi_close", "csi_ret", "csi_turnover_log", "csi_amplitude"]]

def load_margin(path):
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("融资融券数据缺少'日期'列")
    df["日期"] = parse_date_series(df["日期"])
    df = to_numeric(df, ["融资余额", "融券余额"])
    df = df.sort_values("日期").reset_index(drop=True)
    df["margin_total"] = df.get("融资余额", np.nan) + df.get("融券余额", np.nan)
    df["margin_total_log"] = np.log1p(df["margin_total"]) if "margin_total" in df.columns else np.nan
    return df[["日期", "margin_total", "margin_total_log"]]

def load_douyin(path):
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("抖音搜索数据缺少'日期'列")
    search_col = None
    for c in df.columns:
        if str(c).strip().replace(" ", "") in ["搜索量", "搜索指数", "Search", "search", "index"]:
            search_col = c
            break
    if search_col is None:
        search_col = "搜索量"
        if search_col not in df.columns:
            if len(df.columns) >= 2:
                search_col = df.columns[1]
            else:
                raise ValueError("抖音搜索数据未找到搜索量列")
    df["日期"] = parse_date_series(df["日期"])
    df = to_numeric(df, [search_col])
    df = df.sort_values("日期").reset_index(drop=True)
    df.rename(columns={search_col:"douyin_search"}, inplace=True)
    df["douyin_search_log"] = np.log1p(df["douyin_search"]) if "douyin_search" in df.columns else np.nan
    return df[["日期", "douyin_search", "douyin_search_log"]]

# ------------------ 特征构建 ------------------
def build_features(merged):
    out = merged.copy().sort_values("日期").reset_index(drop=True)
    long_trend = 252
    out["turnover_log_all"] = out[["hs300_turnover_log", "csi_turnover_log"]].mean(axis=1, skipna=True)
    out["turnover_heat_z"] = clip_series(robust_rolling_z(out["turnover_log_all"], window=60, trend_window=long_trend))
    out["turnover_rate_heat_z"] = clip_series(robust_rolling_z(out["hs300_turnover_rate"], window=60, trend_window=long_trend))
    out["search_heat_z"] = clip_series(robust_rolling_z(out["douyin_search_log"], window=60, trend_window=long_trend))
    out["margin_heat_z"] = clip_series(robust_rolling_z(out["margin_total_log"], window=120, trend_window=long_trend))
    out["amplitude_mean"] = out[["hs300_amplitude", "csi_amplitude"]].mean(axis=1, skipna=True)
    out["amplitude_heat_z"] = clip_series(robust_rolling_z(out["amplitude_mean"], window=20, trend_window=None))
    out["ret_mean"] = out[["hs300_ret", "csi_ret"]].mean(axis=1, skipna=True)
    out["ret_10d"] = out["ret_mean"].rolling(10, min_periods=1).apply(lambda x: (np.prod(1 + x) - 1) if len(x) > 0 else np.nan, raw=False)
    out["price_accel_z"] = clip_series(robust_rolling_z(out["ret_10d"], window=20, trend_window=None))
    out["hs300_ma200"] = out["hs300_close"].rolling(200, min_periods=1).mean()
    out["ma_spread"] = out["hs300_close"] / out["hs300_ma200"] - 1
    out["ma_spread_z"] = clip_series(robust_rolling_z(out["ma_spread"], window=60, trend_window=None))
    out["up_ratio"] = (out["hs300_ret"] > 0).rolling(20, min_periods=1).mean()
    out["up_ratio_z"] = clip_series(robust_rolling_z(out["up_ratio"], window=60, trend_window=None))
    return out

# ------------------ 合成与信号 ------------------
def combine_with_weights(df, weight_dict, logistic_k=LOGISTIC_K, signal_threshold=SIGNAL_THRESHOLD):
    """
    weight_dict keys should include:
    turnover_heat_z, turnover_rate_heat_z, search_heat_z, margin_heat_z,
    price_accel_z, amplitude_heat_z, ma_spread_z, up_ratio_z
    """
    z_cols = list(weight_dict.keys())
    z_mat = df[z_cols]
    available = ~z_mat.isna()
    w = pd.Series(weight_dict)
    w_df = pd.DataFrame(np.tile(w.values, (len(df), 1)), index=df.index, columns=w.index)
    w_df = w_df.where(available, np.nan)
    w_sum = w_df.sum(axis=1)
    w_df = w_df.div(w_sum.replace(0, np.nan), axis=0)
    crowding_z = (z_mat * w_df).sum(axis=1)
    score_raw = logistic_to_0_100(crowding_z, k=logistic_k, x0=0.0)
    score_smoothed = pd.Series(score_raw).ewm(span=SMOOTH_SPAN, adjust=False).mean().values
    out = df.copy()
    out["crowding_z"] = crowding_z
    out["escape_index_raw"] = np.round(score_raw, 3)
    out["escape_index_0_100"] = np.round(score_smoothed, 2)
    out["escape_signal"] = (out["escape_index_0_100"] >= signal_threshold).astype(int)
    return out

# ------------------ 回测度量 ------------------
def evaluate_signals(df, tops, advance_days=5):
    """
    - tops: list of pd.Timestamp (peaks)
    - If any signal in window [top - advance_days, top - 1] -> TP for that top.
    - FP: count of signals on days not counted as TP windows (i.e., signals outside any TP window).
    Returns: (tp_count, fp_count, signal_days_total)
    """
    df_signals = df[["日期", "escape_signal"]].copy()
    df_signals["日期"] = pd.to_datetime(df_signals["日期"])
    signal_dates = set(df_signals.loc[df_signals["escape_signal"] == 1, "日期"].dt.normalize())
    tp = 0
    used_dates_for_tp = set()
    for top in tops:
        # window: top - advance_days ... top - 1
        start = (top - pd.Timedelta(days=advance_days)).normalize()
        end = (top - pd.Timedelta(days=1)).normalize()
        # need to consider traded dates only (we'll accept any date in the set range)
        hit = any((d >= start and d <= end) for d in signal_dates)
        if hit:
            tp += 1
            # mark those dates within window as used by tp
            for d in list(signal_dates):
                if d >= start and d <= end:
                    used_dates_for_tp.add(d)
    # FP: signals not used in TP windows
    fp_dates = [d for d in signal_dates if d not in used_dates_for_tp]
    fp = len(fp_dates)
    total_signals = len(signal_dates)
    return tp, fp, total_signals

# ------------------ 网格生成（粗网格、灵敏导向） ------------------
def generate_weight_grid(step=0.1):
    """
    我们先在五大类上做粗网格:
      w_liq (liquidity = turnover + turnover_rate),
      w_search,
      w_margin,
      w_price (price_accel + ma_spread + up_ratio),
      w_ampl (amplitude)
    然后将 liq 分成 0.5/0.5, price 分为 0.6/0.25/0.15 (相对经验分配).
    返回 list of weight dicts matching the full keys.
    """
    grid = []
    choices = [i * step for i in range(int(1/step)+1)]
    for w_liq in choices:
        for w_search in choices:
            for w_margin in choices:
                for w_price in choices:
                    for w_ampl in choices:
                        s = w_liq + w_search + w_margin + w_price + w_ampl
                        if abs(s - 1.0) < 1e-9:
                            # distribute sub-weights
                            wd = {}
                            wd["turnover_heat_z"] = w_liq * 0.5
                            wd["turnover_rate_heat_z"] = w_liq * 0.5
                            # price split
                            wd["price_accel_z"] = w_price * 0.6
                            wd["ma_spread_z"] = w_price * 0.25
                            wd["up_ratio_z"] = w_price * 0.15
                            wd["search_heat_z"] = w_search
                            wd["margin_heat_z"] = w_margin
                            wd["amplitude_heat_z"] = w_ampl
                            grid.append(wd)
    return grid

# ------------------ 主流程 ------------------
def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--hs300", default=DEFAULT_FILES["hs300"])
    parser.add_argument("--csiall", default=DEFAULT_FILES["csiall"])
    parser.add_argument("--margin", default=DEFAULT_FILES["margin"])
    parser.add_argument("--douyin", default=DEFAULT_FILES["douyin"])
    parser.add_argument("--outdir", default=OUT_DIR)
    parser.add_argument("--step", type=float, default=0.2, help="grid step for coarse search (default 0.2). smaller -> more combos")
    parser.add_argument("--signal", type=float, default=SIGNAL_THRESHOLD)
    parser.add_argument("--advance", type=int, default=ADVANCE_DAYS)
    args = parser.parse_args(argv)

    outdir = args.outdir
    os.makedirs(outdir, exist_ok=True)

    print("读取数据...")
    hs300 = load_hs300(args.hs300)
    csiall = load_csiall(args.csiall)
    merged = pd.merge(hs300, csiall, on="日期", how="outer")

    try:
        margin = load_margin(args.margin)
        merged = pd.merge(merged, margin, on="日期", how="left")
        merged = merged.sort_values("日期").set_index("日期")
        merged[["margin_total", "margin_total_log"]] = merged[["margin_total", "margin_total_log"]].ffill()
        merged = merged.reset_index()
    except Exception as e:
        print("警告：融资融券读取失败或格式不符，忽略该项。", e)

    try:
        douyin = load_douyin(args.douyin)
        merged = pd.merge(merged, douyin, on="日期", how="left")
    except Exception as e:
        print("警告：抖音搜索读取失败或格式不符，忽略该项。", e)

    print("构造因子...")
    features = build_features(merged)

    # prepare grid
    print("生成网格（step=", args.step, ")...")
    grid = generate_weight_grid(step=args.step)
    print("网格大小：", len(grid))

    results = []
    best_score = -1e9
    best_w = None
    best_res_df = None

    print("开始遍历网格并回测（可能需要些时间，视网格大小而定）...")
    for idx, wd in enumerate(grid):
        combined = combine_with_weights(features, wd, logistic_k=LOGISTIC_K, signal_threshold=args.signal)
        tp, fp, total_signals = evaluate_signals(combined, BULL_TOPS, advance_days=args.advance)
        # 目标函数（灵敏导向）: 强调 TP，适度惩罚 FP
        # score = TP * 100 - FP * 1  (你要灵敏，TP 权重大)
        score = tp * 100.0 - fp * 1.0
        results.append({
            "idx": idx,
            "tp": tp,
            "fp": fp,
            "total_signals": total_signals,
            "score": score,
            "weights": wd
        })
        if score > best_score:
            best_score = score
            best_w = wd
            best_res_df = combined.copy()
        # print 进度
        if (idx + 1) % max(1, len(grid)//10) == 0:
            print(f"进度: {idx+1}/{len(grid)}   best_score={best_score}")

    # 保存网格结果
    df_grid = pd.DataFrame([{
        "idx": r["idx"],
        "tp": r["tp"],
        "fp": r["fp"],
        "total_signals": r["total_signals"],
        "score": r["score"],
        **{k: r["weights"].get(k, 0.0) for k in ["turnover_heat_z","turnover_rate_heat_z","search_heat_z","margin_heat_z","price_accel_z","amplitude_heat_z","ma_spread_z","up_ratio_z"]}
    } for r in results])

    grid_csv = os.path.join(outdir, "backtest_grid_results.csv")
    df_grid.to_csv(grid_csv, index=False, encoding="utf-8-sig")
    print("已保存网格回测结果:", grid_csv)

    # 保存最佳权重与结果
    best_json = os.path.join(outdir, "best_weights.json")
    with open(best_json, "w", encoding="utf-8") as f:
        json.dump({"best_score": best_score, "best_weights": best_w}, f, ensure_ascii=False, indent=2)
    print("已保存最佳权重:", best_json)

    best_csv = os.path.join(outdir, "escape_index_best.csv")
    if best_res_df is not None:
        # 美化并保存
        cols_pref = ["日期","hs300_close","hs300_ret","hs300_turnover_log","hs300_amplitude","hs300_turnover_rate",
                     "csi_close","csi_ret","csi_turnover_log","csi_amplitude","margin_total","douyin_search"]
        cols_feat = [c for c in best_res_df.columns if c.endswith("_z") or c in ["crowding_z","escape_index_raw","escape_index_0_100","escape_signal","escape_level","ma_spread","up_ratio"]]
        out_cols = [c for c in cols_pref + cols_feat if c in best_res_df.columns]
        best_res_df[out_cols].sort_values("日期").to_csv(best_csv, index=False, encoding="utf-8-sig")
        print("最佳配置的逃顶指数已保存：", best_csv)
    else:
        print("未找到最佳结果数据（可能网格为空）")

    print("完成。最佳 score =", best_score)
    print("最佳权重（示例）：")
    print(best_w)
    print("说明：TP = 在每个历史顶部前5天内是否出现信号（每个顶部最多计1次）。FP = 历史中未被用作 TP 的信号天数。")
    print("你可以在", outdir, "看到输出文件：backtest_grid_results.csv, best_weights.json, escape_index_best.csv")

if __name__ == "__main__":
    main()
