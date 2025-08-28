import akshare as ak
import time
import pandas as pd

def get_margin_data():
    """
    获取融资融券历史数据并保存为 CSV 文件。
    """
    print("正在获取融资融券历史数据...")
    try:
        df_margin = ak.stock_margin_account_info()
        file_path = '融资融券历史数据.csv'
        df_margin.to_csv(file_path, index=False, encoding='utf-8-sig')
        print(f"融资融券历史数据已成功保存至 {file_path}")
    except Exception as e:
        print(f"获取融资融券历史数据时出错: {e}")

def get_csi300_pe_data(delay=3):
    """
    获取沪深300历史市盈率数据并保存为 CSV 文件。
    """
    print("正在获取沪深300历史市盈率数据...")
    try:
        # 使用 akshare 提供的接口获取沪深300市盈率数据
        df_pe = ak.stock_index_pe_lg(symbol="沪深300")
        file_path = '沪深300市盈率.csv'
        df_pe.to_csv(file_path, index=False, encoding='utf-8-sig')
        print(f"沪深300历史市盈率数据已成功保存至 {file_path}")
    except Exception as e:
        print(f"获取沪深300历史市盈率数据时出错: {e}")
    
    # 添加延时，防止 API 被 ban
    print(f"等待 {delay} 秒后获取下一个数据...")
    time.sleep(delay)

def get_index_data(symbol, name, delay=3):
    """
    获取指定指数的历史行情数据并保存为 CSV 文件。
    
    参数:
    symbol (str): 指数代码。
    name (str): 指数名称，用于文件名。
    delay (int): 延时秒数。
    """
    print(f"正在获取 {name} ({symbol}) 的历史行情数据...")
    try:
        # 获取从最早时间到今日的所有数据
        df_index = ak.index_zh_a_hist(symbol=symbol, period="daily", start_date="19700101", end_date="22220101")
        file_path = f'{name}历史数据.csv'
        df_index.to_csv(file_path, index=False, encoding='utf-8-sig')
        print(f"{name} 历史数据已成功保存至 {file_path}")
    except Exception as e:
        print(f"获取 {name} 历史数据时出错: {e}")
    
    # 添加延时，防止 API 被 ban
    print(f"等待 {delay} 秒后获取下一个数据...")
    time.sleep(delay)

def main():
    """
    主函数，依次执行获取数据和保存的操作。
    """
    # 获取融资融券数据
    get_margin_data()
    
    # 延时，防止连续调用接口过快
    time.sleep(5)
    
    # 获取沪深300历史市盈率数据
    get_csi300_pe_data()
    
    # 延时，防止连续调用接口过快
    time.sleep(5)
    
    # 获取沪深300和中证全指的历史行情数据
    get_index_data(symbol="000300", name="沪深300")
    get_index_data(symbol="000985", name="中证全指")

if __name__ == "__main__":
    main()
