# -*- coding: utf-8 -*-
"""
完整的牛市逃顶指数计算器 — 数据获取 + 指数计算一体化

功能特点：
1. 自动获取所有必要的数据源
2. 计算优化的逃顶指数
3. 包含上证指数收盘价数据
4. 完善的错误处理和数据验证
5. 详细的数据输出和日志记录
"""
import argparse
import warnings
import time
import os
import sys
import numpy as np
import pandas as pd

# 尝试导入akshare，如果失败则提示安装
try:
    import akshare as ak

    AKSHARE_AVAILABLE = True
except ImportError:
    AKSHARE_AVAILABLE = False
    print("警告：未安装akshare库，将无法自动获取数据。请运行：pip install akshare")

warnings.filterwarnings("ignore")

# 默认文件配置
DEFAULT_FILES = {
    "hs300": "沪深300历史数据.csv",
    "csiall": "中证全指历史数据.csv",
    "shanghai": "上证指数历史数据.csv",  # 新增上证指数
    "margin": "融资融券历史数据.csv",
    "douyin": "抖音搜索指数.csv",
    "pe": "沪深300历史市盈率.csv",
}
DEFAULT_OUTPUT = "逃顶指数.csv"


def log_message(message, level="INFO"):
    """统一的日志输出"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {level}: {message}")


def check_file_exists(file_path):
    """检查文件是否存在且不为空"""
    if not os.path.exists(file_path):
        return False
    try:
        return os.path.getsize(file_path) > 0
    except:
        return False


# ========== 数据获取模块 ==========
def get_margin_data():
    """获取融资融券历史数据"""
    if not AKSHARE_AVAILABLE:
        log_message("akshare不可用，跳过融资融券数据获取", "WARNING")
        return False

    log_message("正在获取融资融券历史数据...")
    try:
        df_margin = ak.stock_margin_account_info()
        if df_margin.empty:
            log_message("融资融券数据为空", "ERROR")
            return False

        file_path = DEFAULT_FILES["margin"]
        df_margin.to_csv(file_path, index=False, encoding="utf-8-sig")
        log_message(f"融资融券历史数据已保存至 {file_path} (共{len(df_margin)}条记录)")
        return True
    except Exception as e:
        log_message(f"获取融资融券历史数据失败: {e}", "ERROR")
        return False


def get_pe_data():
    """获取沪深300历史市盈率数据"""
    if not AKSHARE_AVAILABLE:
        log_message("akshare不可用，跳过市盈率数据获取", "WARNING")
        return False

    log_message("正在获取沪深300历史市盈率数据...")
    try:
        df_pe = ak.stock_index_pe_lg(symbol="沪深300")
        if df_pe.empty:
            log_message("市盈率数据为空", "ERROR")
            return False

        file_path = DEFAULT_FILES["pe"]
        df_pe.to_csv(file_path, index=False, encoding="utf-8-sig")
        log_message(f"沪深300历史市盈率数据已保存至 {file_path} (共{len(df_pe)}条记录)")
        return True
    except Exception as e:
        log_message(f"获取沪深300历史市盈率数据失败: {e}", "ERROR")
        return False


def get_index_data(symbol, name, file_key):
    """获取指定指数的历史行情数据"""
    if not AKSHARE_AVAILABLE:
        log_message(f"akshare不可用，跳过{name}数据获取", "WARNING")
        return False

    log_message(f"正在获取{name}({symbol})历史行情数据...")
    try:
        df_index = ak.index_zh_a_hist(
            symbol=symbol, period="daily", start_date="19700101", end_date="22220101"
        )
        if df_index.empty:
            log_message(f"{name}数据为空", "ERROR")
            return False

        file_path = DEFAULT_FILES[file_key]
        df_index.to_csv(file_path, index=False, encoding="utf-8-sig")
        log_message(f"{name}历史数据已保存至 {file_path} (共{len(df_index)}条记录)")
        return True
    except Exception as e:
        log_message(f"获取{name}历史数据失败: {e}", "ERROR")
        return False


def fetch_all_data(force_refresh=False):
    """获取所有必要的数据"""
    log_message("开始数据获取流程...")

    # 检查是否需要获取数据
    if not force_refresh:
        existing_files = [f for f in DEFAULT_FILES.values() if check_file_exists(f)]
        if len(existing_files) >= 4:  # 至少需要4个核心文件
            log_message(f"发现现有数据文件: {existing_files}")
            log_message("使用现有数据文件，如需重新获取请使用 --force-refresh 参数")
            return True

    if not AKSHARE_AVAILABLE:
        log_message("akshare不可用，无法获取数据", "ERROR")
        return False

    success_count = 0

    # 获取融资融券数据
    if get_margin_data():
        success_count += 1
    time.sleep(3)

    # 获取市盈率数据
    if get_pe_data():
        success_count += 1
    time.sleep(3)

    # 获取指数数据
    index_configs = [
        ("000300", "沪深300", "hs300"),
        ("000985", "中证全指", "csiall"),
        ("000001", "上证指数", "shanghai"),  # 新增上证指数
    ]

    for symbol, name, key in index_configs:
        if get_index_data(symbol, name, key):
            success_count += 1
        time.sleep(3)

    log_message(
        f"数据获取完成，成功获取 {success_count}/{len(index_configs) + 2} 个数据源"
    )
    return success_count >= 3  # 至少需要3个数据源才能继续


# ========== 数据处理模块 ==========
def try_read_csv(path, **kwargs):
    """尝试多种编码读取CSV文件"""
    if not check_file_exists(path):
        raise FileNotFoundError(f"文件不存在: {path}")

    encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312"]
    last_err = None
    for enc in encodings:
        try:
            df = pd.read_csv(path, encoding=enc, **kwargs)
            if df.empty:
                raise ValueError(f"文件为空: {path}")
            return df
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


# ========== 数据加载模块 ==========
def load_hs300(path):
    """加载沪深300数据"""
    log_message(f"加载沪深300数据: {path}")
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

    log_message(f"沪深300数据加载完成，共{len(df)}条记录")
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
    """加载中证全指数据"""
    log_message(f"加载中证全指数据: {path}")
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

    log_message(f"中证全指数据加载完成，共{len(df)}条记录")
    return df[["日期", "csi_close", "csi_ret", "csi_turnover_amt", "csi_turnover_log", "csi_amplitude"]]


def load_shanghai(path):
    """加载上证指数数据"""
    log_message(f"加载上证指数数据: {path}")
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("上证指数数据缺少'日期'列")

    df["日期"] = parse_date_series(df["日期"])
    df = to_numeric(df, ["收盘", "成交额", "振幅", "涨跌幅"])
    df = df.sort_values("日期").reset_index(drop=True)

    df.rename(
        columns={
            "收盘": "shanghai_close",
            "成交额": "shanghai_turnover_amt",
            "振幅": "shanghai_amplitude",
            "涨跌幅": "shanghai_pct_chg",
        },
        inplace=True,
    )

    df["shanghai_ret"] = df["shanghai_close"].pct_change()

    log_message(f"上证指数数据加载完成，共{len(df)}条记录")
    return df[["日期", "shanghai_close", "shanghai_ret", "shanghai_amplitude"]]


def load_margin(path):
    """加载融资融券数据"""
    log_message(f"加载融资融券数据: {path}")
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

    log_message(f"融资融券数据加载完成，共{len(df)}条记录")
    return df[["日期", "margin_total", "margin_total_log"]]


def load_douyin(path):
    """加载抖音搜索数据"""
    log_message(f"加载抖音搜索数据: {path}")
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

    log_message(f"抖音搜索数据加载完成，共{len(df)}条记录")
    return df[["日期", "douyin_search", "douyin_search_log"]]


def load_pe_data(path):
    """加载沪深300历史市盈率数据"""
    log_message(f"加载市盈率数据: {path}")
    df = try_read_csv(path)
    if "日期" not in df.columns:
        raise ValueError("市盈率数据缺少'日期'列")
    if "滚动市盈率" not in df.columns:
        raise ValueError("市盈率数据缺少'滚动市盈率'列")

    df["日期"] = parse_date_series(df["日期"])
    df = to_numeric(df, ["滚动市盈率"])
    df.rename(columns={"滚动市盈率": "hs300_pe_ttm"}, inplace=True)

    log_message(f"市盈率数据加载完成，共{len(df)}条记录")
    return df[["日期", "hs300_pe_ttm"]]


# ========== 特征工程模块 ==========
def robust_rolling_z(series, window=60, trend_window=None, min_periods=None):
    """稳健 rolling Z分数计算"""
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
    """截断Z分数"""
    return s.clip(lower=low, upper=high)


def logistic_to_0_100(x, k=1.2, x0=0.0):
    """将Z分数映射到0-100区间"""
    z = np.clip((x - x0) * k, -50, 50)
    return 100.0 / (1.0 + np.exp(-z))


def build_features(merged):
    """基于优化方案，生成各维度特征"""
    log_message("开始特征工程...")
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
    )
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
    )
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

    # 4. 估值维度 (window=120)
    out["pe_valuation_z"] = robust_rolling_z(
        out["hs300_pe_ttm"], window=120, trend_window=long_trend
    )
    out["pe_valuation_z"] = clip_series(out["pe_valuation_z"])

    log_message("特征工程完成")
    return out


# ========== 指数计算模块 ==========
def combine_to_escape_index(df, logistic_k=1.2, logistic_x0=0.0, signal_threshold=75):
    """计算逃顶指数"""
    log_message("开始计算逃顶指数...")

    # 按照维度重新分配权重，总和为10
    weights = {
        # 维度1: 情绪与舆情 (总权重2.5)
        "search_heat_z": 1.25,
        "margin_heat_z": 1.25,
        # 维度2: 交易与流动性 (总权重2.5)
        "turnover_heat_z": 1.25,
        "turnover_rate_heat_z": 1.25,
        "amplitude_heat_z": 1.0,
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

    log_message("逃顶指数计算完成")
    return out


# ========== 主函数 ==========
def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="完整的牛市逃顶指数计算器")
    parser.add_argument("--force-refresh", action="store_true", help="强制重新获取数据")
    parser.add_argument(
        "--skip-fetch", action="store_true", help="跳过数据获取，使用现有文件"
    )
    parser.add_argument("--out", default=DEFAULT_OUTPUT, help="输出文件名")
    parser.add_argument("--signal", type=float, default=75.0, help="信号阈值")
    args = parser.parse_args()

    log_message("=== 牛市逃顶指数计算器启动 ===")

    # 步骤1: 数据获取
    if not args.skip_fetch:
        log_message("步骤1: 数据获取")
        if not fetch_all_data(force_refresh=args.force_refresh):
            log_message("数据获取失败，程序退出", "ERROR")
            return 1
    else:
        log_message("跳过数据获取，使用现有文件")

    # 步骤2: 数据加载和合并
    log_message("步骤2: 数据加载和合并")
    try:
        # 加载核心数据
        hs300 = load_hs300(DEFAULT_FILES["hs300"])
        csiall = load_csiall(DEFAULT_FILES["csiall"])
        merged = pd.merge(hs300, csiall, on="日期", how="outer")

        # 加载上证指数数据
        try:
            shanghai = load_shanghai(DEFAULT_FILES["shanghai"])
            merged = pd.merge(merged, shanghai, on="日期", how="left")
        except Exception as e:
            log_message(f"上证指数数据加载失败: {e}", "WARNING")

        # 加载可选数据
        optional_data = [
            ("margin", load_margin),
            ("douyin", load_douyin),
            ("pe", load_pe_data),
        ]

        for data_key, loader_func in optional_data:
            try:
                data = loader_func(DEFAULT_FILES[data_key])
                merged = pd.merge(merged, data, on="日期", how="left")
                log_message(f"{data_key}数据合并成功")
            except Exception as e:
                log_message(f"{data_key}数据加载失败: {e}", "WARNING")

        # 前向填充缺失值
        merged = merged.sort_values("日期").set_index("日期")
        merged = merged.ffill()
        merged = merged.reset_index()

        log_message(f"数据合并完成，共{len(merged)}条记录")

    except Exception as e:
        log_message(f"数据加载失败: {e}", "ERROR")
        return 1

    # 步骤3: 特征工程
    log_message("步骤3: 特征工程")
    try:
        features = build_features(merged)
    except Exception as e:
        log_message(f"特征工程失败: {e}", "ERROR")
        return 1

    # 步骤4: 计算逃顶指数
    log_message("步骤4: 计算逃顶指数")
    try:
        result = combine_to_escape_index(features, signal_threshold=args.signal)
    except Exception as e:
        log_message(f"指数计算失败: {e}", "ERROR")
        return 1

    # 步骤5: 输出结果
    log_message("步骤5: 输出结果")
    try:
        # 选择输出列
        output_cols = [
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
            "csi_turnover_amt",  # 新增中证全指成交额原始数据
            "csi_amplitude",
            "shanghai_close",
            "shanghai_ret",
            "shanghai_amplitude",  # 新增上证指数数据
            "margin_total",
            "douyin_search",
            "turnover_heat_z",
            "turnover_rate_heat_z",
            "price_accel_z",
            "amplitude_heat_z",
            "margin_heat_z",
            "search_heat_z",
            "pe_valuation_z",
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

        # 只输出存在的列
        available_cols = [c for c in output_cols if c in result.columns]
        outdf = result[available_cols].sort_values("日期")

        outdf.to_csv(args.out, index=False, encoding="utf-8-sig")
        log_message(f"逃顶指数已输出到: {args.out}")

        # 输出统计信息
        latest = outdf.iloc[-1] if len(outdf) > 0 else None
        if latest is not None:
            log_message(f"最新日期: {latest['日期']}")
            log_message(f"最新逃顶指数: {latest.get('escape_index_0_100', 'N/A')}")
            log_message(f"警戒级别: {latest.get('escape_level', 'N/A')}")

        log_message("=== 计算完成 ===")
        return 0

    except Exception as e:
        log_message(f"结果输出失败: {e}", "ERROR")
        return 1


if __name__ == "__main__":
    sys.exit(main())
