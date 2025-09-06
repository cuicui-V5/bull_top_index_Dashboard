# A股牛市逃顶指数系统 - 开发文档

## 项目概述

本项目是一个完整的A股市场逃顶指数分析系统，包含数据获取、指数计算、后端服务和前端展示四个核心模块。系统通过多维度市场数据合成逃顶指数（0-100），帮助投资者识别市场过热信号。

### 系统架构

```
stock_data/
├── bullTopDashboard/          # 前端仪表盘 (React + Vite)
├── bullTopServer/            # 后端API服务 (Node.js + Express)
├── bulltop_escape_calc/      # 数据计算模块 (Python + Pandas)
└── README.md
```

## 核心功能

1. **数据自动获取**：从akshare API获取沪深300、上证指数、融资融券等市场数据
2. **多维度分析**：情绪、交易、趋势、估值四个维度的因子分析
3. **逃顶指数计算**：基于权重分配合成0-100的逃顶指数
4. **实时仪表盘**：Web端实时展示逃顶指数和市场数据
5. **风险预警**：根据指数阈值提供风险等级和投资建议

## 模块详解

### 1. 数据计算模块 (bulltop_escape_calc)

#### 技术栈
- Python 3.7+
- Pandas, NumPy
- akshare (数据源)
- 命令行工具

#### 核心文件
- `complete_bull_top_escape_calculator.py` - 主计算程序
- `bull_top_escape_index - v2.py` - 计算引擎
- `get_market_data.py` - 数据获取工具

#### 数据源
- **沪深300指数**：市场基准指数
- **上证指数**：A股主要指数
- **中证全指**：全市场指数
- **融资融券数据**：市场杠杆指标
- **市盈率数据**：估值指标
- **抖音搜索指数**：市场情绪指标（需手动提供）

#### 计算逻辑

```python
# 四大维度权重分配
情绪与舆情 (25%):
    - 抖音搜索热度: 12.5%
    - 融资融券热度: 12.5%

交易与流动性 (25%):
    - 成交额热度: 12.5%
    - 换手率热度: 12.5%
    - 振幅热度: 10%

价格趋势与动能 (30%):
    - 价格加速度: 10%
    - 均线偏离度: 10%
    - 上涨比例: 10%

估值 (20%):
    - 市盈率估值: 20%
```

#### 使用方法

```bash
# 完整运行（推荐）
python complete_bull_top_escape_calculator.py

# 使用现有数据
python complete_bull_top_escape_calculator.py --skip-fetch

# 强制重新获取数据
python complete_bull_top_escape_calculator.py --force-refresh

# 自定义输出文件
python complete_bull_top_escape_calculator.py --out "我的逃顶指数.csv"

# 调整信号阈值
python complete_bull_top_escape_calculator.py --signal 80
```

#### 输出文件
生成的`逃顶指数.csv`包含：
- 基础数据：日期、各指数收盘价、市盈率
- 技术指标：各项Z分数指标
- 逃顶指数：0-100指数值、信号、风险等级

### 2. 后端服务模块 (bullTopServer)

#### 技术栈
- Node.js + Express
- CSV数据服务
- HTTPS支持
- CORS跨域

#### 核心文件
- `serverHttps.js` - HTTPS服务器
- `package.json` - 依赖配置
- `逃顶指数.csv` - 数据文件

#### 功能特性
- **HTTPS服务**：生产级安全连接
- **数据缓存**：内存缓存提升性能
- **CORS支持**：跨域访问
- **错误处理**：完善的异常处理机制

#### API接口
```javascript
GET /api/data
Response:
{
    "status": "success",
    "data": [...],  // 逃顶指数数据
    "count": 1000   // 数据条数
}
```

#### 部署说明
1. 安装依赖：`npm install`
2. 确保SSL证书配置正确
3. 确保逃顶指数.csv文件存在
4. 启动服务：`node serverHttps.js`
5. 服务端口：3001

### 3. 前端仪表盘 (bullTopDashboard)

#### 技术栈
- React 18
- Vite构建工具
- Recharts图表库
- TailwindCSS样式
- Lucide React图标

#### 核心文件
- `src/components/EscapeIndexDashboard.jsx` - 主仪表盘组件
- `src/components/StatisticsPanel.jsx` - 统计面板
- `src/components/MarketSentimentPanel.jsx` - 市场情绪面板
- `src/components/SettingsPanel.jsx` - 设置面板
- `src/components/OverlaySelector.jsx` - 叠加选择器

#### 功能特性
- **实时图表**：逃顶指数趋势图
- **多指标叠加**：支持上证指数、换手率等指标叠加显示
- **时间范围选择**：支持自定义时间范围和快速选择
- **数据聚合**：支持日/周/月/年视图
- **风险预警**：实时风险等级和投资建议
- **数据导出**：CSV格式数据导出
- **响应式设计**：适配桌面和移动设备

#### 组件架构
```
App
└── EscapeIndexDashboard
    ├── AboutModal (关于弹窗)
    ├── StatisticsPanel (统计面板)
    ├── MarketSentimentPanel (市场情绪面板)
    ├── SettingsPanel (设置面板)
    └── OverlaySelector (叠加选择器)
```

#### 数据处理
- **数据降采样**：大量数据点自动降采样到800个点
- **数据聚合**：支持按周/月/年聚合
- **数据缓存**：内存缓存提升性能
- **错误处理**：网络错误和数据异常处理

#### 开发和部署
```bash
# 开发环境
npm install
npm run dev

# 生产构建
npm run build
npm run preview
```

## 数据流程

### 1. 数据获取流程
```
akshare API → Python计算模块 → CSV文件
```

### 2. 数据服务流程
```
CSV文件 → Node.js后端 → REST API
```

### 3. 前端展示流程
```
REST API → React前端 → 用户界面
```

## 部署指南

### 1. 环境要求
- Python 3.7+ (数据计算)
- Node.js 16+ (后端服务)
- npm/yarn (前端构建)

### 2. 数据计算部署
```bash
cd bulltop_escape_calc
pip install pandas numpy akshare
python complete_bull_top_escape_calculator.py
```

### 3. 后端服务部署
```bash
cd bullTopServer
npm install
# 配置SSL证书路径
node serverHttps.js
```

### 4. 前端部署
```bash
cd bullTopDashboard
npm install
npm run build
# 将dist目录部署到Web服务器
```

## 配置说明

### 1. 数据计算配置
- 信号阈值：默认75，可通过`--signal`参数调整
- 输出文件：默认"逃顶指数.csv"
- 数据源：支持强制刷新和跳过获取

### 2. 后端服务配置
- 端口：3001
- SSL证书：需要配置private.key和cert.crt
- 数据文件：逃顶指数.csv

### 3. 前端配置
- API地址：https://chuanjiabao.cuijunyu.win:3001
- 开发端口：3001
- 图表点数限制：默认800点

## 维护和监控

### 1. 数据更新
- 建议每日运行数据计算脚本
- 监控数据获取成功率
- 定期检查数据完整性

### 2. 服务监控
- 监控API服务状态
- 检查HTTPS证书有效期
- 监控服务器资源使用情况

### 3. 性能优化
- 数据缓存机制
- 图表渲染优化
- 网络请求优化

## 故障排除

### 1. 数据获取失败
- 检查网络连接
- 验证akshare API可用性
- 检查API调用频率限制

### 2. 后端服务问题
- 检查SSL证书配置
- 验证CSV文件存在性
- 检查端口占用情况

### 3. 前端显示问题
- 检查API连接
- 验证CORS配置
- 检查浏览器控制台错误

## 开发规范

### 1. 代码风格
- Python：遵循PEP 8规范
- JavaScript：使用ES6+语法
- CSS：使用TailwindCSS类名

### 2. 文档规范
- 代码注释使用中文
- 函数和组件添加文档字符串
- 更新README和开发文档

### 3. 版本控制
- 使用Git进行版本管理
- 提交信息使用中文
- 定期创建版本标签

## 安全考虑

### 1. 数据安全
- 敏感数据不存储在客户端
- 使用HTTPS传输数据
- 定期备份重要数据

### 2. 系统安全
- 及时更新依赖包
- 监控系统日志
- 限制API访问频率

### 3. 网络安全
- 配置适当的CORS策略
- 使用SSL证书
- 监控异常访问

## 扩展开发

### 1. 新增数据源
- 在Python模块中添加数据获取函数
- 更新数据合并逻辑
- 调整权重分配

### 2. 新增指标
- 在前端添加新的图表组件
- 更新数据处理逻辑
- 添加配置选项

### 3. 功能增强
- 添加用户认证
- 增加数据导出格式
- 优化移动端体验

## 联系和支持

如有技术问题或建议，请：
1. 检查本文档的故障排除部分
2. 查看各模块的README文件
3. 检查代码注释和日志信息
4. 联系开发团队获取技术支持

---

*本文档最后更新时间：2024年*