# -*- coding: utf-8 -*-
"""
牛市逃顶指数计算器 — 完整优化版

主要优化点：
1. 新增估值因子，增强模型预测能力。
2. 权重再平衡，将因子划分为情绪、交易、趋势、估值四个维度。
3. 增大最终指数的平滑窗口，减少尖锐度。
4. 调整部分因子计算窗口，降低短期噪声。
"""
import argparse
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

DEFAULT_FILES = {
    "hs300": "沪深300历史数据.csv",
    "csiall": "中证全指历史数据.csv",
    "margin": "融资融券历史数据.csv",
    "douyin": "抖音搜索指数.csv",
    "pe": "沪深300历史市盈率.csv",  # 新增市盈率数据文件
}
DEFAULT_OUTPUT = "逃顶指数.csv"


def try_read_csv(path, **kwargs):
    """尝试多种编码读取CSV文件"""
    encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312"]
    last_err = None
    for enc in encodings:
        try:
            return pd.read_csv(path, encoding=enc, **kwargs)
        except Exception as e:
            last_err = e
    raise last_err


def parse_date_series(series):
    """智能解析日期列"""
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
    """将指定列转换为数值型"""
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def robust_rolling_z(series, window=60, trend_window=None, min_periods=None):
    """
    稳健 rolling Z：先用 trend_window 的 rolling median 去趋势（可选），
    然后用 window 的 rolling median 和 rolling MAD 计算 Z = (x-med)/ (1.4826*MAD)
    """
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
    """截断 Z 分数，防止极端值影响过大"""
    return s.clip(lower=low, upper=high)


def logistic_to_0_100(x, k=1.2, x0=0.0):
    """将 Z 分数映射到 0-100 区间"""
    z = np.clip((x - x0) * k, -50, 50)
    return 100.0 / (1.0 + np.exp(-z))


# --------- loaders ----------
def load_hs300(path):
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("沪深300数据缺少'日期'列")
    df["日期"] = parse_date_series(df["日期"])
    possible_turnover_cols = [
        c for c in df.columns if str(c).strip() in ["换手率", "换手"]
    ]
    turnover_col = possible_turnover_cols[0] if possible_turnover_cols else None
    df = to_numeric(
        df,
        ["收盘", "成交额", "振幅", "涨跌幅"] + ([turnover_col] if turnover_col else []),
    )
    df = df.sort_values("日期").reset_index(drop=True)
    df.rename(
        columns={
            "收盘": "hs300_close",
            "成交额": "hs300_turnover_amt",
            "振幅": "hs300_amplitude",
            "涨跌幅": "hs300_pct_chg",
        },
        inplace=True,
    )
    df["hs300_ret"] = df["hs300_close"].pct_change()
    df["hs300_turnover_log"] = (
        np.log1p(df["hs300_turnover_amt"])
        if "hs300_turnover_amt" in df.columns
        else np.nan
    )
    if turnover_col:
        df["hs300_turnover_rate"] = df[turnover_col]
        if df["hs300_turnover_rate"].max(skipna=True) > 10:
            df["hs300_turnover_rate"] = df["hs300_turnover_rate"] / 100.0
    else:
        df["hs300_turnover_rate"] = np.nan
    return df[
        [
            "日期",
            "hs300_close",
            "hs300_ret",
            "hs300_turnover_log",
            "hs300_amplitude",
            "hs300_turnover_rate",
        ]
    ]


def load_csiall(path):
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("中证全指数据缺少'日期'列")
    df["日期"] = parse_date_series(df["日期"])
    df = to_numeric(df, ["收盘", "成交额", "振幅", "涨跌幅"])
    df = df.sort_values("日期").reset_index(drop=True)
    df.rename(
        columns={
            "收盘": "csi_close",
            "成交额": "csi_turnover_amt",
            "振幅": "csi_amplitude",
            "涨跌幅": "csi_pct_chg",
        },
        inplace=True,
    )
    df["csi_ret"] = df["csi_close"].pct_change()
    df["csi_turnover_log"] = (
        np.log1p(df["csi_turnover_amt"]) if "csi_turnover_amt" in df.columns else np.nan
    )
    return df[["日期", "csi_close", "csi_ret", "csi_turnover_log", "csi_amplitude"]]


def load_margin(path):
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("融资融券数据缺少'日期'列")
    df["日期"] = parse_date_series(df["日期"])
    df = to_numeric(df, ["融资余额", "融券余额"])
    df = df.sort_values("日期").reset_index(drop=True)
    df["margin_total"] = df.get("融资余额", np.nan) + df.get("融券余额", np.nan)
    df["margin_total_log"] = (
        np.log1p(df["margin_total"]) if "margin_total" in df.columns else np.nan
    )
    return df[["日期", "margin_total", "margin_total_log"]]


def load_douyin(path):
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("抖音搜索数据缺少'日期'列")
    search_col = next(
        (
            c
            for c in df.columns
            if str(c).strip().replace(" ", "")
            in ["搜索量", "搜索指数", "Search", "search", "index"]
        ),
        None,
    )
    if search_col is None:
        search_col = df.columns[1] if len(df.columns) >= 2 else "搜索量"
    df["日期"] = parse_date_series(df["日期"])
    df = to_numeric(df, [search_col])
    df = df.sort_values("日期").reset_index(drop=True)
    df.rename(columns={search_col: "douyin_search"}, inplace=True)
    df["douyin_search_log"] = (
        np.log1p(df["douyin_search"]) if "douyin_search" in df.columns else np.nan
    )
    return df[["日期", "douyin_search", "douyin_search_log"]]


def load_pe_data(path):
    """加载沪深300历史市盈率数据"""
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("市盈率数据缺少'日期'列")
    if "滚动市盈率" not in df.columns:
        raise ValueError("市盈率数据缺少'滚动市盈率'列")
    df["日期"] = parse_date_series(df["日期"])
    df = to_numeric(df, ["滚动市盈率"])
    df.rename(columns={"滚动市盈率": "hs300_pe_ttm"}, inplace=True)
    return df[["日期", "hs300_pe_ttm"]]


# --------- feature engineering ----------
def build_features(merged):
    """
    基于优化方案，生成各维度特征
    - 统一滚动窗口为60日，以减少噪声
    """
    out = merged.copy().sort_values("日期").reset_index(drop=True)
    long_trend = 252  # 一年滚动中位数去趋势

    # 1. 交易与流动性维度 (window=60)
    out["turnover_log_all"] = out[["hs300_turnover_log", "csi_turnover_log"]].mean(
        axis=1, skipna=True
    )
    out["turnover_heat_z"] = robust_rolling_z(
        out["turnover_log_all"], window=60, trend_window=long_trend
    )
    out["turnover_heat_z"] = clip_series(out["turnover_heat_z"])
    out["turnover_rate_heat_z"] = robust_rolling_z(
        out["hs300_turnover_rate"], window=60, trend_window=long_trend
    )
    out["turnover_rate_heat_z"] = clip_series(out["turnover_rate_heat_z"])
    out["amplitude_mean"] = out[["hs300_amplitude", "csi_amplitude"]].mean(
        axis=1, skipna=True
    )
    out["amplitude_heat_z"] = robust_rolling_z(
        out["amplitude_mean"], window=60, trend_window=None
    )
    out["amplitude_heat_z"] = clip_series(out["amplitude_heat_z"])

    # 2. 情绪与舆情维度 (window=60或120)
    out["search_heat_z"] = robust_rolling_z(
        out["douyin_search_log"], window=60, trend_window=long_trend
    )
    out["search_heat_z"] = clip_series(out["search_heat_z"])
    out["margin_heat_z"] = robust_rolling_z(
        out["margin_total_log"], window=120, trend_window=long_trend
    )  # 杠杆变化慢，窗口稍长
    out["margin_heat_z"] = clip_series(out["margin_heat_z"])

    # 3. 价格趋势与动能维度 (window=60)
    out["ret_mean"] = out[["hs300_ret", "csi_ret"]].mean(axis=1, skipna=True)
    out["ret_10d"] = (
        out["ret_mean"]
        .rolling(10, min_periods=1)
        .apply(lambda x: (np.prod(1 + x) - 1) if len(x) > 0 else np.nan, raw=False)
    )
    out["price_accel_z"] = robust_rolling_z(
        out["ret_10d"], window=60, trend_window=None
    )  # 窗口调整为60日
    out["price_accel_z"] = clip_series(out["price_accel_z"])
    out["hs300_ma200"] = out["hs300_close"].rolling(200, min_periods=1).mean()
    out["ma_spread"] = out["hs300_close"] / out["hs300_ma200"] - 1
    out["ma_spread_z"] = robust_rolling_z(
        out["ma_spread"], window=60, trend_window=None
    )
    out["ma_spread_z"] = clip_series(out["ma_spread_z"])
    out["up_ratio"] = (out["hs300_ret"] > 0).rolling(20, min_periods=1).mean()
    out["up_ratio_z"] = robust_rolling_z(out["up_ratio"], window=60, trend_window=None)
    out["up_ratio_z"] = clip_series(out["up_ratio_z"])

    # 4. 估值维度 (新增，window=120)
    out["pe_valuation_z"] = robust_rolling_z(
        out["hs300_pe_ttm"], window=120, trend_window=long_trend
    )
    out["pe_valuation_z"] = clip_series(out["pe_valuation_z"])

    return out


# --------- combine into index ----------
def combine_to_escape_index(df, logistic_k=1.2, logistic_x0=0.0, signal_threshold=75):
    """
    根据优化方案重新分配权重
    """
    # 按照维度重新分配权重，总和为10
    weights = {
        # 维度1: 情绪与舆情 (总权重2.5)
        "search_heat_z": 1.25,
        "margin_heat_z": 1.25,
        # 维度2: 交易与流动性 (总权重2.5)
        "turnover_heat_z": 1.25,
        "turnover_rate_heat_z": 1.25,
        "amplitude_heat_z": 1.0,  # 振幅权重略低，防止短期噪音
        # 维度3: 价格趋势与动能 (总权重3.0)
        "price_accel_z": 1.0,
        "ma_spread_z": 1.0,
        "up_ratio_z": 1.0,
        # 维度4: 估值 (总权重2.0)
        "pe_valuation_z": 2.0,
    }

    z_cols = [c for c in weights.keys()]
    z_mat = df[z_cols]
    available = ~z_mat.isna()
    w = pd.Series(weights)
    w_df = pd.DataFrame(
        np.tile(w.values, (len(df), 1)), index=df.index, columns=w.index
    )
    w_df = w_df.where(available, np.nan)
    w_sum = w_df.sum(axis=1)
    w_df = w_df.div(w_sum.replace(0, np.nan), axis=0)

    # 修正：当某一行的所有因子都缺失时，w_sum为0，w_df会出现除0 NaN
    crowding_z = (z_mat * w_df).sum(axis=1)

    score_raw = logistic_to_0_100(crowding_z, k=logistic_k, x0=logistic_x0)

    # 优化: 增大平滑窗口至10日，使曲线更平滑
    score_smoothed = pd.Series(score_raw).ewm(span=10, adjust=False).mean().values

    out = df.copy()
    out["crowding_z"] = crowding_z
    out["escape_index_raw"] = np.round(score_raw, 3)
    out["escape_index_0_100"] = np.round(score_smoothed, 2)
    out["escape_signal"] = (out["escape_index_0_100"] >= signal_threshold).astype(int)

    def label(s):
        if pd.isna(s):
            return "NA"
        if s >= 85:
            return "极度警戒"
        if s >= 75:
            return "强警戒"
        if s >= 60:
            return "警惕"
        return "相对安全"

    out["escape_level"] = out["escape_index_0_100"].apply(label)
    return out


# --------- main ----------
def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--hs300", default=DEFAULT_FILES["hs300"])
    parser.add_argument("--csiall", default=DEFAULT_FILES["csiall"])
    parser.add_argument("--margin", default=DEFAULT_FILES["margin"])
    parser.add_argument("--douyin", default=DEFAULT_FILES["douyin"])
    parser.add_argument("--pe", default=DEFAULT_FILES["pe"])  # 新增参数
    parser.add_argument("--out", default=DEFAULT_OUTPUT)
    parser.add_argument("--signal", type=float, default=75.0)
    args = parser.parse_args(argv)

    print("--- 步骤1: 读取数据 ---")
    hs300 = load_hs300(args.hs300)
    csiall = load_csiall(args.csiall)
    merged = pd.merge(hs300, csiall, on="日期", how="outer")

    try:
        margin = load_margin(args.margin)
        merged = pd.merge(merged, margin, on="日期", how="left")
        merged = merged.sort_values("日期").set_index("日期")
        merged[["margin_total", "margin_total_log"]] = merged[
            ["margin_total", "margin_total_log"]
        ].ffill()
        merged = merged.reset_index()
    except Exception as e:
        print(f"警告：融资融券读取失败或格式不符，忽略该项。错误：{e}")

    try:
        douyin = load_douyin(args.douyin)
        merged = pd.merge(merged, douyin, on="日期", how="left")
    except Exception as e:
        print(f"警告：抖音搜索读取失败或格式不符，忽略该项。错误：{e}")

    try:
        pe_data = load_pe_data(args.pe)
        merged = pd.merge(merged, pe_data, on="日期", how="left")
        merged = merged.sort_values("日期").set_index("日期")
        merged["hs300_pe_ttm"] = merged[
            "hs300_pe_ttm"
        ].ffill()  # 估值数据也进行前向填充
        merged = merged.reset_index()
    except Exception as e:
        print(f"警告：沪深300市盈率读取失败或格式不符，忽略该项。错误：{e}")

    print("\n--- 步骤2: 生成特征 ---")
    features = build_features(merged)

    print("\n--- 步骤3: 计算并输出逃顶指数 ---")
    result = combine_to_escape_index(features, signal_threshold=args.signal)

    cols = [
        "日期",
        "hs300_close",
        "hs300_pe_ttm",
        "hs300_ret",
        "hs300_turnover_log",
        "hs300_amplitude",
        "hs300_turnover_rate",
        "csi_close",
        "csi_ret",
        "csi_turnover_log",
        "csi_amplitude",
        "margin_total",
        "douyin_search",
        "turnover_heat_z",
        "turnover_rate_heat_z",
        "price_accel_z",
        "amplitude_heat_z",
        "margin_heat_z",
        "search_heat_z",
        "pe_valuation_z",  # 新增
        "ma_spread",
        "ma_spread_z",
        "up_ratio",
        "up_ratio_z",
        "crowding_z",
        "escape_index_raw",
        "escape_index_0_100",
        "escape_signal",
        "escape_level",
    ]

    cols = [c for c in cols if c in result.columns]
    outdf = result[cols].sort_values("日期")
    outdf.to_csv(args.out, index=False, encoding="utf-8-sig")
    print(f"已输出优化后的逃顶指数到文件: {args.out}")


if __name__ == "__main__":
    main()
