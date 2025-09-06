// 构建前数据更新脚本
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API 端点
const API_URL = 'https://chuanjiabao.cuijunyu.win:3001/api/data';

// 本地数据文件路径
const LOCAL_DATA_PATH = path.join(__dirname, 'public', 'data', 'data.json');

// 更新本地数据的函数
async function updateLocalData() {
    console.log('开始更新本地数据...');
    
    try {
        // 请求 API 数据
        console.log(`正在从 ${API_URL} 获取数据...`);
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.columns || !data.data) {
            throw new Error('API 返回数据格式错误');
        }
        
        console.log(`获取到 ${data.data.length} 条数据记录`);
        
        // 确保目录存在
        const publicDataDir = path.dirname(LOCAL_DATA_PATH);
        
        if (!fs.existsSync(publicDataDir)) {
            fs.mkdirSync(publicDataDir, { recursive: true });
        }
        
        // 保存数据
        const jsonData = JSON.stringify(data, null, 2);
        
        fs.writeFileSync(LOCAL_DATA_PATH, jsonData, 'utf8');
        console.log(`数据已保存到: ${LOCAL_DATA_PATH}`);
        
        console.log('本地数据更新完成！');
        return true;
        
    } catch (error) {
        console.error('更新本地数据失败:', error.message);
        
        // 检查本地文件是否存在
        if (fs.existsSync(LOCAL_DATA_PATH)) {
            console.log('使用现有的本地数据继续构建...');
            return true;
        }
        
        console.error('没有可用的本地数据，构建可能失败');
        return false;
    }
}

// 主函数
async function main() {
    const success = await updateLocalData();
    if (!success) {
        process.exit(1);
    }
}

// 运行主函数
main().catch(console.error);