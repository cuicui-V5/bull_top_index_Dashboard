const express = require("express");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const cors = require("cors"); // 导入 cors 库
const https = require("https"); // ✅ 导入 Node.js 的 https 模块

const app = express();
// const port = 3000; // 原始 HTTP 端口
const httpsPort = 3001; // ✅ 定义 HTTPS 端口，通常是 443，但开发环境可以使用其他端口如 3001

// 使用 cors 中间件，允许所有来源的跨域请求
app.use(cors());

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
    if (cachedData) {
        // 如果缓存存在，直接返回缓存的数据
        res.json({
            status: "success",
            data: cachedData,
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

// 启动服务器，并在启动前加载数据
loadDataAndCache().then(() => {
    // ✅ 使用 https.createServer 替代 app.listen
    https.createServer(httpsOptions, app).listen(httpsPort, () => {
        console.log(
            `HTTPS 服务器正在运行，请访问 https://localhost:${httpsPort}`,
        );
        console.log(`API 接口地址: https://localhost:${httpsPort}/api/data`);
    });
});
