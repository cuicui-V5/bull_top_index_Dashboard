// 模拟数据生成器
function generateMockData() {
    const data = [];
    const startDate = new Date("2020-01-01");
    const endDate = new Date();

    for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 1)
    ) {
        // 跳过周末
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        // 生成模拟数据
        const baseIndex =
            30 +
            Math.sin(
                (d.getTime() / (365 * 24 * 60 * 60 * 1000)) * Math.PI * 2,
            ) *
                20;
        const noise = (Math.random() - 0.5) * 10;
        const escapeIndex = Math.max(0, Math.min(100, baseIndex + noise));

        data.push({
            日期: d.toISOString().slice(0, 10),
            hs300_close: 3000 + Math.random() * 1000,
            hs300_ret: (Math.random() - 0.5) * 0.1,
            hs300_turnover_log: Math.log(1 + Math.random() * 5),
            hs300_amplitude: Math.random() * 0.1,
            hs300_turnover_rate: Math.random() * 5,
            margin_total: 1000000 + Math.random() * 500000,
            douyin_search: Math.random() * 100,
            crowding_z: (Math.random() - 0.5) * 2,
            escape_index_0_100: Math.round(escapeIndex * 100) / 100,
            escape_signal: escapeIndex > 70 ? "1" : "0",
            escape_level:
                escapeIndex > 80
                    ? "极高风险"
                    : escapeIndex > 60
                    ? "高风险"
                    : escapeIndex > 40
                    ? "中等风险"
                    : "低风险",
        });
    }

    return data;
}

// 如果直接运行这个文件，输出模拟数据
if (typeof window === "undefined") {
    console.log(JSON.stringify({ data: generateMockData() }, null, 2));
}

export { generateMockData };
