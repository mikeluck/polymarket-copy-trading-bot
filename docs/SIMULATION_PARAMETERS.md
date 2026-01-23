# 模拟回测环境参数详解

本文档详细说明 Polymarket 跟单机器人回测模拟脚本的所有环境变量参数。

---

## 目录

1. [快速开始](#快速开始)
2. [核心参数](#核心参数)
3. [策略参数](#策略参数)
4. [资金管理参数](#资金管理参数)
5. [回测范围参数](#回测范围参数)
6. [真实模拟参数](#真实模拟参数)
7. [使用示例](#使用示例)
8. [参数组合建议](#参数组合建议)

---

## 快速开始

### 基础回测
```bash
npm run simulate
```

### 真实回测（包含滑点和延迟）
```bash
npm run simulate-realistic
```

### 批量回测
```bash
npm run sim quick      # 快速模式
npm run sim standard   # 标准模式
npm run sim full       # 完整模式
```

---

## 核心参数

### SIM_TRADER_ADDRESS

**说明**：要跟踪的交易者钱包地址

**类型**：字符串（以太坊地址格式）

**默认值**：`0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b`

**示例**：
```bash
SIM_TRADER_ADDRESS=0xe9c6312464b52aa3eff13d822b003282075995c9 npm run simulate
```

**说明**：
- 必须是有效的以太坊地址（42个字符，以 0x 开头）
- 大小写不敏感，会自动转为小写
- 这个地址应该是在 Polymarket 上有交易历史的账户

---

### SIM_STARTING_CAPITAL

**说明**：模拟回测的起始资金（美元）

**类型**：数字（正数）

**默认值**：`1000`

**示例**：
```bash
SIM_STARTING_CAPITAL=10000 npm run simulate
```

**说明**：
- 建议至少 $500，太小的资金会导致大量交易被跳过
- 常用值：
  - 小额测试：$500 - $1000
  - 中等测试：$2000 - $5000
  - 大额测试：$10000+

**注意事项**：
- 起始资金过小可能导致第一笔交易就用完所有资金
- 建议起始资金至少是平均订单金额的 20 倍以上

---

### SIM_HISTORY_DAYS

**说明**：回测的历史天数

**类型**：整数（正数）

**默认值**：`7`

**示例**：
```bash
SIM_HISTORY_DAYS=30 npm run simulate
```

**说明**：
- 回测会获取过去 N 天的交易历史
- 常用值：
  - 快速测试：7 天
  - 标准测试：30 天
  - 长期测试：90 天

**注意事项**：
- 天数越大，获取数据时间越长
- 某些交易者可能在早期没有足够的交易数据
- 建议先用 7 天快速验证，再用 30-90 天深入分析

---

## 策略参数

### SIM_STRATEGY

**说明**：复制交易的策略类型

**类型**：枚举字符串

**可选值**：
- `PERCENTAGE` - 百分比策略（默认）
- `FIXED` - 固定金额策略
- `ADAPTIVE` - 自适应策略

**默认值**：`PERCENTAGE`

**示例**：
```bash
# 百分比策略
SIM_STRATEGY=PERCENTAGE SIM_COPY_SIZE=10 npm run simulate

# 固定金额策略
SIM_STRATEGY=FIXED SIM_COPY_SIZE=50 npm run simulate

# 自适应策略
SIM_STRATEGY=ADAPTIVE SIM_COPY_SIZE=10 npm run simulate
```

---

#### PERCENTAGE 策略

**复制交易者订单的固定百分比**

**计算公式**：
```
你的订单金额 = 交易者订单金额 × (COPY_SIZE / 100) × MULTIPLIER
```

**适用场景**：
- 跟踪交易风格稳定的交易者
- 希望保持与交易者相同的资金比例
- 最常用的策略

**示例**：
```bash
# 复制 10% 的订单
SIM_STRATEGY=PERCENTAGE SIM_COPY_SIZE=10 npm run simulate

# 交易者下单 $100，你下单 $10
# 交易者下单 $1000，你下单 $100
```

**优点**：
- ✅ 自动适应交易者订单大小
- ✅ 保持资金使用比例一致
- ✅ 适合大多数场景

**缺点**：
- ❌ 交易者大单可能导致资金快速耗尽
- ❌ 交易者小单可能无法达到最小订单要求

---

#### FIXED 策略

**每笔交易固定金额**

**计算公式**：
```
你的订单金额 = COPY_SIZE × MULTIPLIER
```

**适用场景**：
- 严格控制每笔交易风险
- 资金较小，需要精确管理
- 交易者订单大小波动极大

**示例**：
```bash
# 每笔交易固定 $50
SIM_STRATEGY=FIXED SIM_COPY_SIZE=50 npm run simulate

# 无论交易者下单多少，你都下单 $50
```

**优点**：
- ✅ 风险可控，每笔损失有上限
- ✅ 资金消耗可预测
- ✅ 适合资金较小的账户

**缺点**：
- ❌ 无法充分利用交易者的大单机会
- ❌ 对小单可能过度投资

---

#### ADAPTIVE 策略

**根据交易者订单大小动态调整百分比**

**计算逻辑**：
```
小订单（< $500）：使用更高百分比（最多 15%）
大订单（> $500）：使用更低百分比（最低 5%）
```

**适用场景**：
- 交易者订单大小差异很大
- 希望在小单中更激进，大单中更保守
- 高级用户优化资金使用效率

**示例**：
```bash
SIM_STRATEGY=ADAPTIVE SIM_COPY_SIZE=10 npm run simulate

# 交易者 $100 订单 → 你用 15% = $15
# 交易者 $500 订单 → 你用 10% = $50
# 交易者 $2000 订单 → 你用 5% = $100
```

**优点**：
- ✅ 智能平衡风险和收益
- ✅ 避免大单过度消耗资金
- ✅ 小单获得更好的跟踪效果

**缺点**：
- ❌ 逻辑相对复杂
- ❌ 需要调优参数才能发挥最佳效果

---

### SIM_COPY_SIZE

**说明**：复制比例或金额（含义取决于策略）

**类型**：数字（正数）

**默认值**：
- `PERCENTAGE` 策略：`10`（表示 10%）
- `FIXED` 策略：`5`（表示 $5）
- `ADAPTIVE` 策略：`10`（表示基准 10%）

**示例**：
```bash
# PERCENTAGE: 复制 100% 的订单
SIM_STRATEGY=PERCENTAGE SIM_COPY_SIZE=100 npm run simulate

# FIXED: 每笔固定 $20
SIM_STRATEGY=FIXED SIM_COPY_SIZE=20 npm run simulate

# ADAPTIVE: 基准 15%
SIM_STRATEGY=ADAPTIVE SIM_COPY_SIZE=15 npm run simulate
```

**说明**：
- **PERCENTAGE 模式**：
  - `100` = 复制 100% 的订单金额
  - `10` = 复制 10% 的订单金额
  - 可以大于 100（如 `200` 表示 2 倍跟单）

- **FIXED 模式**：
  - 单位是美元
  - 建议设置为起始资金的 1-5%

- **ADAPTIVE 模式**：
  - 表示中等订单的百分比
  - 小订单会自动提高，大订单会自动降低

---

### TRADE_MULTIPLIER

**说明**：在策略计算结果上额外应用的乘数

**类型**：数字（正数）

**默认值**：`1.0`

**示例**：
```bash
# 2 倍跟单
TRADE_MULTIPLIER=2.0 npm run simulate

# 0.5 倍跟单（更保守）
TRADE_MULTIPLIER=0.5 npm run simulate
```

**计算示例**：
```bash
# PERCENTAGE 策略 + 乘数
SIM_STRATEGY=PERCENTAGE SIM_COPY_SIZE=10 TRADE_MULTIPLIER=2.0

交易者下单 $100
→ 基础计算：$100 × 10% = $10
→ 应用乘数：$10 × 2.0 = $20
→ 你的订单：$20
```

**使用场景**：
- 测试不同的激进程度
- 在保持策略不变的情况下快速调整仓位大小
- 批量回测中对比不同倍数的效果

---

## 资金管理参数

### SIM_MAX_ORDER_USD

**说明**：单笔订单的最大金额（美元）

**类型**：数字（正数）

**默认值**：`100`

**示例**：
```bash
SIM_MAX_ORDER_USD=10000 npm run simulate
```

**说明**：
- 即使策略计算出更大的订单，也会被限制在这个上限
- 主要用于风险控制
- 建议设置为起始资金的 10-20%

**计算示例**：
```bash
SIM_MAX_ORDER_USD=50

交易者下单 $1000，策略计算你应下单 $100
→ 超过最大限制 $50
→ 实际下单：$50
```

---

### SIM_MIN_ORDER_USD

**说明**：单笔订单的最小金额（美元）

**类型**：数字（正数）

**默认值**：`1.0`

**示例**：
```bash
# 允许非常小的订单
SIM_MIN_ORDER_USD=0.0001 npm run simulate

# 只执行大于 $5 的订单
SIM_MIN_ORDER_USD=5 npm run simulate
```

**说明**：
- 低于此金额的订单会被跳过
- 设置过高会导致大量小单被忽略
- 设置过低可能违反交易所的最小订单限制

**注意事项**：
- Polymarket 实际最小订单约为 $0.01-0.10
- 设置为 `0.0001` 可以测试所有订单（包括极小订单）
- 建议实盘测试时设置为 `1.0` 以上

---

### SIM_MAX_TRADES

**说明**：回测处理的最大交易笔数

**类型**：整数（正数）

**默认值**：`5000`

**示例**：
```bash
# 快速测试，只处理前 100 笔
SIM_MAX_TRADES=100 npm run simulate

# 完整测试
SIM_MAX_TRADES=10000 npm run simulate
```

**说明**：
- 用于限制处理的交易数量，加快测试速度
- 超过此数量的交易会被忽略
- 适合快速验证逻辑

---

## 回测范围参数

### SIM_RESULT_TAG

**说明**：结果文件的标签（用于批量回测区分）

**类型**：字符串

**默认值**：空字符串

**示例**：
```bash
SIM_RESULT_TAG=test_v1 npm run simulate
```

**说明**：
- 会被添加到输出文件名中
- 主要用于 `npm run sim` 批量回测
- 手动运行单次回测时通常不需要设置

---

## 真实模拟参数

这些参数只在 `npm run simulate-realistic` 中生效，用于模拟真实的市场条件。

### SIM_DELAY_SECONDS

**说明**：检测延迟（秒）- 从交易者下单到你检测到的时间差

**类型**：数字（非负数）

**默认值**：`10`

**示例**：
```bash
# 快速检测（3 秒延迟）
SIM_DELAY_SECONDS=3 npm run simulate-realistic

# 慢速检测（20 秒延迟）
SIM_DELAY_SECONDS=20 npm run simulate-realistic
```

**说明**：
- 模拟真实世界的检测延迟
- 延迟期间，价格已经发生变化
- 延迟越大，滑点成本越高

**建议值**：
- 理想情况：5-8 秒
- 一般情况：10-15 秒
- 差的情况：20-30 秒

---

### SIM_BASE_SLIPPAGE

**说明**：基础滑点百分比（%）

**类型**：数字（非负数）

**默认值**：`1.5`

**示例**：
```bash
# 低滑点（高流动性市场）
SIM_BASE_SLIPPAGE=0.5 npm run simulate-realistic

# 高滑点（低流动性市场）
SIM_BASE_SLIPPAGE=3.0 npm run simulate-realistic
```

**说明**：
- 即使是最小订单也会有的基础价格差
- 与订单大小无关的固定滑点
- 反映市场流动性和延迟造成的价格变化

**计算示例**：
```
交易者买入价格：$0.70
基础滑点：1.5%
你的实际买入价：$0.70 × (1 + 0.015) = $0.7105
```

---

### SIM_SLIPPAGE_PER_100

**说明**：每 $100 订单增加的滑点百分比（%）

**类型**：数字（非负数）

**默认值**：`0.5`

**示例**：
```bash
# 订单大小影响大
SIM_SLIPPAGE_PER_100=1.0 npm run simulate-realistic

# 订单大小影响小
SIM_SLIPPAGE_PER_100=0.2 npm run simulate-realistic
```

**说明**：
- 订单越大，对市场的影响越大，滑点越高
- 每 $100 订单额外增加的滑点

**滑点计算公式**：
```
总滑点 = 基础滑点 + (订单金额 / 100) × 每百滑点
```

**计算示例**：
```bash
订单金额：$250
基础滑点：1.5%
每百滑点：0.5%

总滑点 = 1.5% + (250 / 100) × 0.5%
       = 1.5% + 1.25%
       = 2.75%
```

---

### SIM_FEE_PERCENT

**说明**：交易手续费百分比（%）

**类型**：数字（非负数）

**默认值**：`0`

**示例**：
```bash
# 添加 0.1% 手续费
SIM_FEE_PERCENT=0.1 npm run simulate-realistic
```

**说明**：
- Polymarket 目前没有交易手续费
- 预留参数，用于模拟未来可能的手续费
- 或用于测试手续费对收益的影响

---

## 使用示例

### 示例 1：保守策略

**目标**：小额资金，保守跟单

```bash
SIM_STRATEGY=PERCENTAGE \
SIM_STARTING_CAPITAL=500 \
SIM_COPY_SIZE=5 \
SIM_TRADER_ADDRESS=0xe9c6312464b52aa3eff13d822b003282075995c9 \
SIM_HISTORY_DAYS=7 \
SIM_MAX_ORDER_USD=50 \
SIM_MIN_ORDER_USD=1 \
npm run simulate
```

**说明**：
- 起始资金 $500
- 只复制 5% 的订单
- 单笔最多 $50
- 适合测试和小额跟单

---

### 示例 2：激进策略

**目标**：大额资金，激进跟单

```bash
SIM_STRATEGY=PERCENTAGE \
SIM_STARTING_CAPITAL=10000 \
SIM_COPY_SIZE=100 \
TRADE_MULTIPLIER=2.0 \
SIM_TRADER_ADDRESS=0xe9c6312464b52aa3eff13d822b003282075995c9 \
SIM_HISTORY_DAYS=30 \
SIM_MAX_ORDER_USD=2000 \
SIM_MIN_ORDER_USD=0.0001 \
npm run simulate
```

**说明**：
- 起始资金 $10000
- 复制 100% 的订单，再 × 2 倍
- 单笔最多 $2000
- 捕捉所有交易机会

---

### 示例 3：固定金额策略

**目标**：每笔固定金额，严格控制风险

```bash
SIM_STRATEGY=FIXED \
SIM_STARTING_CAPITAL=2000 \
SIM_COPY_SIZE=20 \
SIM_TRADER_ADDRESS=0xe9c6312464b52aa3eff13d822b003282075995c9 \
SIM_HISTORY_DAYS=14 \
SIM_MAX_ORDER_USD=50 \
SIM_MIN_ORDER_USD=10 \
npm run simulate
```

**说明**：
- 起始资金 $2000
- 每笔固定 $20
- 单笔上限 $50（不太可能触发）
- 最小 $10（过滤小单）

---

### 示例 4：真实模拟（包含滑点）

**目标**：最接近真实交易的回测

```bash
SIM_STRATEGY=PERCENTAGE \
SIM_STARTING_CAPITAL=5000 \
SIM_COPY_SIZE=10 \
SIM_TRADER_ADDRESS=0xe9c6312464b52aa3eff13d822b003282075995c9 \
SIM_HISTORY_DAYS=30 \
SIM_MAX_ORDER_USD=500 \
SIM_MIN_ORDER_USD=1 \
SIM_DELAY_SECONDS=10 \
SIM_BASE_SLIPPAGE=1.5 \
SIM_SLIPPAGE_PER_100=0.5 \
npm run simulate-realistic
```

**说明**：
- 包含 10 秒检测延迟
- 基础滑点 1.5%
- 订单大小影响滑点
- 最真实的回测结果

---

### 示例 5：快速测试

**目标**：快速验证策略逻辑

```bash
SIM_STARTING_CAPITAL=1000 \
SIM_HISTORY_DAYS=7 \
SIM_MAX_TRADES=100 \
npm run simulate
```

**说明**：
- 只处理 7 天数据
- 最多 100 笔交易
- 其他参数使用默认值
- 适合快速迭代测试

---

## 参数组合建议

### 新手测试

```bash
SIM_STRATEGY=PERCENTAGE
SIM_STARTING_CAPITAL=1000
SIM_COPY_SIZE=10
SIM_HISTORY_DAYS=7
SIM_MAX_ORDER_USD=100
SIM_MIN_ORDER_USD=1
```

**特点**：保守、安全、易理解

---

### 标准配置

```bash
SIM_STRATEGY=PERCENTAGE
SIM_STARTING_CAPITAL=5000
SIM_COPY_SIZE=15
SIM_HISTORY_DAYS=30
SIM_MAX_ORDER_USD=500
SIM_MIN_ORDER_USD=1
```

**特点**：平衡风险和收益

---

### 高风险配置

```bash
SIM_STRATEGY=PERCENTAGE
SIM_STARTING_CAPITAL=10000
SIM_COPY_SIZE=50
TRADE_MULTIPLIER=2.0
SIM_HISTORY_DAYS=90
SIM_MAX_ORDER_USD=2000
SIM_MIN_ORDER_USD=0.0001
```

**特点**：激进、高收益、高风险

---

### 真实模拟配置

```bash
SIM_STRATEGY=ADAPTIVE
SIM_STARTING_CAPITAL=5000
SIM_COPY_SIZE=10
SIM_HISTORY_DAYS=30
SIM_MAX_ORDER_USD=500
SIM_MIN_ORDER_USD=1
SIM_DELAY_SECONDS=10
SIM_BASE_SLIPPAGE=1.5
SIM_SLIPPAGE_PER_100=0.5
```

**特点**：最接近实盘效果

---

## 常见问题

### Q1: 为什么大量交易被跳过？

**可能原因**：
1. `SIM_STARTING_CAPITAL` 太小，第一笔交易就用完了资金
2. `SIM_MIN_ORDER_USD` 设置过高
3. `SIM_COPY_SIZE` 太小，计算出的订单低于最小值

**解决方案**：
- 增加起始资金（建议至少 $1000）
- 降低最小订单限制
- 提高复制比例

---

### Q2: 回测结果与真实差距很大？

**可能原因**：
1. 使用了 `npm run simulate` 而不是 `simulate-realistic`
2. 滑点参数设置不合理
3. 检测延迟设置过于乐观

**解决方案**：
- 使用 `simulate-realistic` 真实回测
- 根据实盘 paper trading 调整滑点参数
- 保守估计检测延迟（建议 10-15 秒）

---

### Q3: 如何选择合适的策略？

**PERCENTAGE**：
- ✅ 交易者订单大小稳定
- ✅ 希望保持与交易者相同比例

**FIXED**：
- ✅ 严格控制每笔风险
- ✅ 资金较小（< $2000）

**ADAPTIVE**：
- ✅ 交易者订单大小波动大
- ✅ 希望优化资金使用效率
- ✅ 有经验的用户

---

### Q4: 多长的回测周期合适？

**建议**：
- **快速验证**：7 天
- **标准测试**：30 天
- **深度分析**：90 天

**注意**：
- 周期太短可能不具代表性
- 周期太长获取数据慢，且市场环境可能已变化
- 建议先 7 天快速筛选，再 30 天深入测试

---

### Q5: 起始资金设置多少合适？

**建议**：
```
起始资金 = 单笔平均订单金额 × 20-50 笔
```

**举例**：
- 如果平均订单 $50，建议起始资金 $1000-2500
- 如果平均订单 $200，建议起始资金 $4000-10000

**原因**：
- 太小：会很快耗尽，错过后续机会
- 太大：回测效果不够明显

---

## 总结

### 最常用参数组合

```bash
# 基础回测
SIM_STRATEGY=PERCENTAGE \
SIM_STARTING_CAPITAL=1000 \
SIM_COPY_SIZE=10 \
SIM_TRADER_ADDRESS=0xe9c6312464b52aa3eff13d822b003282075995c9 \
SIM_HISTORY_DAYS=7 \
SIM_MAX_ORDER_USD=100 \
SIM_MIN_ORDER_USD=1 \
npm run simulate
```

```bash
# 真实回测
SIM_STRATEGY=PERCENTAGE \
SIM_STARTING_CAPITAL=5000 \
SIM_COPY_SIZE=10 \
SIM_TRADER_ADDRESS=0xe9c6312464b52aa3eff13d822b003282075995c9 \
SIM_HISTORY_DAYS=30 \
SIM_MAX_ORDER_USD=500 \
SIM_MIN_ORDER_USD=1 \
SIM_DELAY_SECONDS=10 \
SIM_BASE_SLIPPAGE=1.5 \
SIM_SLIPPAGE_PER_100=0.5 \
npm run simulate-realistic
```

---

## 相关文档

- [真实回测指南](REALISTIC_SIMULATION.md) - 详细的滑点和延迟模拟说明
- [策略配置](../src/config/copyStrategy.ts) - 策略代码实现
- [回测脚本](../src/scripts/simulateProfitability.ts) - 基础回测实现
- [真实回测脚本](../src/scripts/simulateProfitabilityRealistic.ts) - 真实回测实现
