/* global use, db */
// MongoDB Copy Trading Simulation Playground

// 1. 选择数据库 (根据你的 MONGO_URI 环境，默认通常是 'test')
use('test');

// 定义我们要查的交易员地址
const traders = [
    '0xe9c6312464b52aa3eff13d822b003282075995c9',
    '0x9765c3074cfc388dc6a7443efc2b3a4d2a8d4ead'
];

// --- 查询 1: 查看最近的 5 条模拟成交记录 (以第一个交易员为例) ---
console.log('--- 最近的模拟成交记录 ---');
db.getCollection(`user_activities_${traders[0]}`).find(
    { bot: true },
    { title: 1, side: 1, price: 1, myUsdcSize: 1, mySize: 1, timestamp: 1 }
).sort({ timestamp: -1 }).limit(5);

// --- 查询 2: 统计纸面交易的总投入和总回收 (聚合查询) ---
console.log('--- 纸面交易损益汇总 ---');
const stats = [];

traders.forEach(address => {
    const collectionName = `user_activities_${address}`;
    const result = db.getCollection(collectionName).aggregate([
        { $match: { bot: true } },
        {
            $group: {
                _id: "$side",
                totalAmount: { $sum: "$myUsdcSize" },
                count: { $sum: 1 }
            }
        }
    ]).toArray();

    if (result.length > 0) {
        console.log(`交易员 ${address} 的统计:`, JSON.stringify(result, null, 2));
    }
});

// --- 查询 3: 查看当前的模拟持仓 (即买入后还没卖掉的) ---
console.log('--- 当前模拟持仓 (myBoughtSize > 0) ---');
db.getCollection(`user_activities_${traders[0]}`).find(
    { bot: true, side: 'BUY', myBoughtSize: { $gt: 0 } },
    { title: 1, outcome: 1, myBoughtSize: 1 }
);