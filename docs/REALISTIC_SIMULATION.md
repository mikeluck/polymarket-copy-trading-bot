# Realistic Simulation Guide

## 问题背景

原始的回测脚本 (`npm run simulate`) 有一个重大缺陷：**它假设你能以交易者的成交价格买入/卖出**。

但在现实中：
1. **检测延迟**：从交易者下单到你检测到，需要 5-15 秒
2. **价格滑点**：延迟期间价格已经变动，你买入时更贵，卖出时更便宜
3. **订单大小影响**：订单越大，对价格的影响越大

## 新的真实回测

新的回测脚本 (`npm run simulate-realistic`) 加入了这些真实因素。

### 核心改进

#### 1. 价格滑点模拟

```typescript
// BUY: 你支付的价格更高
yourPrice = traderPrice * (1 + slippage%)

// SELL: 你收到的价格更低
yourPrice = traderPrice * (1 - slippage%)
```

#### 2. 动态滑点计算

```
总滑点 = 基础滑点 + 订单大小滑点

例如：
- 基础滑点：1.5%
- $100 订单额外滑点：0.5%
- 如果你下 $50 订单：
  总滑点 = 1.5% + (50/100 * 0.5%) = 1.75%
```

#### 3. 可配置参数

通过环境变量控制模拟参数：

```bash
# 起始资金（美元）- 模拟开始时的资金
SIM_STARTING_CAPITAL=1000   # 默认: $1000

# 检测延迟（秒）- 从交易者下单到你检测到
SIM_DELAY_SECONDS=10        # 默认: 10秒

# 基础滑点（%）- 最小的价格变动
SIM_BASE_SLIPPAGE=1.5       # 默认: 1.5%

# 订单规模滑点 - 每 $100 增加的滑点
SIM_SLIPPAGE_PER_100=0.5    # 默认: 0.5%

# 交易手续费（%）- 可选
SIM_FEE_PERCENT=0           # 默认: 0%
```

## 使用方法

### 基础用法

```bash
# 运行真实模拟
npm run simulate-realistic
```

### 对比测试

建议先运行原始回测，再运行真实回测，对比结果：

```bash
# 1. 原始回测（理想情况）
npm run simulate

# 2. 真实回测（包含滑点和延迟）
npm run simulate-realistic

# 3. 比较结果差异
```

### 自定义配置

```bash
# 测试不同的起始资金
SIM_STARTING_CAPITAL=500 npm run simulate-realistic

# 测试不同的交易者
SIM_TRADER_ADDRESS=0x1234... npm run simulate-realistic

# 测试不同的回测周期
SIM_HISTORY_DAYS=30 npm run simulate-realistic

# 测试不同的策略和金额
SIM_STRATEGY=FIXED SIM_COPY_SIZE=10 npm run simulate-realistic

# 测试高滑点场景（如小市场、大订单）
SIM_BASE_SLIPPAGE=3.0 SIM_SLIPPAGE_PER_100=1.0 npm run simulate-realistic

# 测试低延迟场景（如有更快的监控系统）
SIM_DELAY_SECONDS=3 SIM_BASE_SLIPPAGE=0.5 npm run simulate-realistic

# 组合配置
SIM_STARTING_CAPITAL=2000 SIM_HISTORY_DAYS=30 SIM_COPY_SIZE=5 npm run simulate-realistic
```

## 结果对比示例

### 原始回测结果
```
Starting Capital: $1000.00
Current Capital:  $1275.00
Total P&L:        +$275.00
ROI:              +27.5%
```

### 真实回测结果
```
Starting Capital: $1000.00
Current Capital:  $1060.00
Total P&L:        +$60.00
ROI:              +6.0%

Slippage Cost:    $215.00
Avg Slippage:     2.15%
```

**差异分析**：
- 理想 ROI: 27.5%
- 真实 ROI: 6.0%
- **滑点成本吃掉了 78% 的利润！**

## 理解滑点影响

### 示例场景

交易者在 `t=0` 时刻操作：
```
买入 "Yes" @ $0.70
```

你在 `t=10s` 时检测到并下单：
```
- 市场已经反应，价格涨到 $0.735
- 你的滑点：5%
- 你的成交价：$0.735 * 1.05 = $0.77
- 额外成本：($0.77 - $0.70) / $0.70 = 10%
```

后来市场涨到 $0.90：
```
交易者利润：($0.90 - $0.70) / $0.70 = 28.6%
你的利润：  ($0.90 - $0.77) / $0.77 = 16.9%
```

**你少赚了 41% 的利润！**

## 如何提高准确性

### 1. 实际测试最重要

在 paper trading 模式下运行一段时间：
```bash
PAPER_TRADING=true npm start
```

记录：
- 检测到交易的延迟
- 实际下单价格 vs 交易者价格
- 真实滑点百分比

### 2. 根据实测数据调整参数

如果你的实测数据显示：
- 平均延迟：8 秒
- 平均滑点：2.3%

则设置：
```bash
SIM_DELAY_SECONDS=8 SIM_BASE_SLIPPAGE=2.3 npm run simulate-realistic
```

### 3. 不同市场使用不同参数

大型热门市场（高流动性）：
```bash
SIM_BASE_SLIPPAGE=0.8 SIM_SLIPPAGE_PER_100=0.3
```

小型冷门市场（低流动性）：
```bash
SIM_BASE_SLIPPAGE=3.0 SIM_SLIPPAGE_PER_100=1.5
```

## 决策建议

### ✅ 继续考虑跟单，如果：
- 真实回测 ROI > 10%（年化）
- 滑点成本 < 总利润的 30%
- 至少 100 笔交易样本
- 多个不同时期的回测都盈利

### ⚠️ 谨慎考虑，如果：
- 真实回测 ROI = 5-10%
- 滑点成本 = 30-50% 利润
- 样本量较小（< 50 笔）

### ❌ 不建议跟单，如果：
- 真实回测 ROI < 5%
- 滑点成本 > 50% 利润
- 原始回测盈利但真实回测亏损
- 极度依赖少数大赢的交易

## 下一步

1. **运行真实回测**
   ```bash
   npm run simulate-realistic
   ```

2. **分析结果**
   - 查看 `simulation_results/` 目录下的详细 JSON 报告
   - 对比原始回测和真实回测的差异

3. **实盘验证**
   - 用极小金额（$20-50）在 paper trading 模式测试
   - 记录真实延迟和滑点
   - 调整模拟参数

4. **持续监控**
   - 定期重新回测
   - 比较模拟结果和实际结果
   - 根据实际表现调整策略

## 技术细节

### 滑点公式

```typescript
function calculateSlippage(orderSize: number): number {
    return BASE_SLIPPAGE_PERCENT + (orderSize / 100) * SLIPPAGE_PER_100USD;
}

// 例子：$50 订单
// 滑点 = 1.5% + (50/100) * 0.5% = 1.75%
```

### 买入价格计算

```typescript
function getBuyPrice(traderPrice: number, orderSize: number): number {
    const slippage = calculateSlippage(orderSize);
    const yourPrice = traderPrice * (1 + slippage / 100);
    return Math.min(yourPrice, 0.999); // 最高 $0.999
}
```

### 卖出价格计算

```typescript
function getSellPrice(traderPrice: number, orderSize: number): number {
    const slippage = calculateSlippage(orderSize);
    const yourPrice = traderPrice * (1 - slippage / 100);
    return Math.max(yourPrice, 0.001); // 最低 $0.001
}
```

## 常见问题

**Q: 为什么滑点这么大？**
A: Polymarket 很多市场流动性不足，延迟 10 秒价格变化很正常。你可以降低 `SIM_BASE_SLIPPAGE` 测试最优情况。

**Q: 真实回测还是太乐观？**
A: 可能。真实情况可能更差，因为：
- 订单簿深度不足
- 网络延迟波动
- API 限流
- 市场突发事件

**Q: 如何知道我的实际滑点？**
A: 运行 paper trading 并记录每笔交易：
```typescript
// 交易者价格 vs 你的实际成交价
actualSlippage = (yourPrice - traderPrice) / traderPrice * 100
```

**Q: 可以设置 0 滑点吗？**
A: 可以，但不现实。即使是 HFT（高频交易）也有滑点。建议至少设置 0.5%。
