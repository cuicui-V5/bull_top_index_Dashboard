const express = require("express");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const cors = require("cors"); // 导入 cors 库
const https = require("https"); // ✅ 导入 Node.js 的 https 模块

const app = express();

// 访问计数器
let accessCount = 0;
const startTime = new Date();

// 获取客户端IP地址的函数
function getClientIP(req) {
    return (
        req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.headers['x-client-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress ||
        '未知IP'
    ).split(',')[0].trim();
}

// 格式化时间的函数
function formatTime(date) {
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// 访问日志中间件
function accessLogger(req, res, next) {
    const clientIP = getClientIP(req);
    const timestamp = formatTime(new Date());
    const method = req.method;
    const url = req.originalUrl;
    const userAgent = req.headers['user-agent'] || '未知';
    
    accessCount++;
    
    // 输出详细的访问日志
    console.log(`🌐 [${timestamp}] API访问 #${accessCount}`);
    console.log(`   IP地址: ${clientIP}`);
    console.log(`   请求: ${method} ${url}`);
    console.log(`   用户代理: ${userAgent.substring(0, 80)}${userAgent.length > 80 ? '...' : ''}`);
    console.log(`   总访问次数: ${accessCount} (启动时间: ${formatTime(startTime)})`);
    console.log(`   ${'='.repeat(50)}`);
    
    // 记录请求开始时间
    req.startTime = Date.now();
    
    // 监听响应完成
    res.on('finish', () => {
        const responseTime = Date.now() - req.startTime;
        const statusCode = res.statusCode;
        console.log(`✅ [${formatTime(new Date())}] 响应完成 - 状态码: ${statusCode}, 耗时: ${responseTime}ms`);
        console.log(`   ${'-'.repeat(30)}`);
    });
    
    next();
}
// const port = 3000; // 原始 HTTP 端口
const httpsPort = 3001; // ✅ 定义 HTTPS 端口，通常是 443，但开发环境可以使用其他端口如 3001

// 使用 cors 中间件，允许所有来源的跨域请求
app.use(cors());

// 应用访问日志中间件
app.use(accessLogger);

// 定义 CSV 文件路径
const csvFilePath = path.join(__dirname, "逃顶指数.csv");

// 创建一个变量来存储缓存的数据
let cachedData = null;

// ✅ 配置 HTTPS 选项
const httpsOptions = {
    key: fs.readFileSync("/root/ygkkkca/private.key"), // 读取私钥文件
    cert: fs.readFileSync("/root/ygkkkca/cert.crt"), // 读取证书文件
};

// 异步读取 CSV 文件并将其转换为 JSON 数组
async function getCsvDataAsJson() {
    const results = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on("data", data => results.push(data))
            .on("end", () => {
                resolve(results);
            })
            .on("error", err => {
                reject(err);
            });
    });
}

// 在服务器启动时预先加载并缓存数据
async function loadDataAndCache() {
    try {
        console.log("正在加载 CSV 数据并建立缓存...");
        cachedData = await getCsvDataAsJson();
        console.log(`数据加载完成，共 ${cachedData.length} 条记录。`);
    } catch (error) {
        console.error("加载 CSV 文件失败:", error);
        // 如果加载失败，将缓存设为 null，API 将返回错误
        cachedData = null;
    }
}

// 定义一个 GET API 路由
app.get("/api/data", (req, res) => {
    // 检查缓存是否存在
    if (cachedData && cachedData.length > 0) {
        // 转换为列式存储格式
        const columns = Object.keys(cachedData[0]);
        const data = cachedData.map(row => columns.map(col => row[col]));
        
        // 如果缓存存在，直接返回缓存的数据
        res.json({
            status: "success",
            columns: columns,
            data: data,
            count: cachedData.length,
        });
    } else {
        // 如果缓存不存在，说明服务器启动时加载失败
        res.status(500).json({
            status: "error",
            message: "服务器未能成功加载数据，请稍后重试或检查CSV文件",
        });
    }
});

// 添加服务器统计信息接口
app.get("/api/stats", (req, res) => {
    const uptime = Date.now() - startTime;
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const uptimeSeconds = Math.floor((uptime % (1000 * 60)) / 1000);
    
    res.json({
        status: "success",
        stats: {
            totalAccess: accessCount,
            startTime: formatTime(startTime),
            uptime: `${uptimeHours}小时${uptimeMinutes}分${uptimeSeconds}秒`,
            serverTime: formatTime(new Date()),
            cachedDataCount: cachedData ? cachedData.length : 0,
            cachedDataAvailable: !!cachedData && cachedData.length > 0
        }
    });
});

// 添加健康检查接口
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: Date.now() - startTime,
        accessCount: accessCount,
        dataCached: !!cachedData
    });
});

// 启动服务器，并在启动前加载数据
loadDataAndCache().then(() => {
    // ✅ 使用 https.createServer 替代 app.listen
    https.createServer(httpsOptions, app).listen(httpsPort, () => {
        console.log(`🚀 HTTPS 服务器启动成功！`);
        console.log(`📡 服务器地址: https://localhost:${httpsPort}`);
        console.log(`📊 数据API: https://localhost:${httpsPort}/api/data`);
        console.log(`📈 统计信息: https://localhost:${httpsPort}/api/stats`);
        console.log(`💚 健康检查: https://localhost:${httpsPort}/health`);
        console.log(`📝 启动时间: ${formatTime(startTime)}`);
        console.log(`🔧 访问日志已启用，将显示详细的访问信息`);
        console.log(`${'='.repeat(60)}`);
    });
});
