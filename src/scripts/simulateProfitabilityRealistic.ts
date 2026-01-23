import axios from 'axios';
import { ENV } from '../config/env';
import getMyBalance from '../utils/getMyBalance';
import { CopyStrategy, calculateOrderSize, CopyStrategyConfig } from '../config/copyStrategy';

// Simple console colors without chalk
const colors = {
    cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
    green: (text: string) => `\x1b[32m${text}\x1b[0m`,
    red: (text: string) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
    blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
    gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
    bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
};

interface Trade {
    id: string;
    timestamp: number;
    market: string;
    asset: string;
    side: 'BUY' | 'SELL';
    price: number;
    usdcSize: number;
    size: number;
    outcome: string;
}

interface Position {
    conditionId: string;
    market: string;
    outcome: string;
    outcomeIndex: number;
    asset: string;
    size: number;
    cost: number;
    avgEntryPrice: number;
    currentValue: number;
    realizedPnl: number;
    unrealizedPnl: number;
}

interface SimulatedPosition {
    market: string;
    outcome: string;
    sharesHeld: number;
    entryPrice: number;
    exitPrice: number | null;
    invested: number;
    currentValue: number;
    pnl: number;
    closed: boolean;
    trades: {
        timestamp: number;
        side: 'BUY' | 'SELL';
        traderPrice: number; // Trader's price
        yourPrice: number; // Your simulated price (with slippage)
        size: number;
        usdcSize: number;
        slippagePercent: number;
        slippageCost: number;
    }[];
}

interface SimulationResult {
    id: string;
    name: string;
    logic: string;
    timestamp: number;
    traderAddress: string;
    startingCapital: number;
    currentCapital: number;
    totalTrades: number;
    copiedTrades: number;
    skippedTrades: number;
    totalInvested: number;
    currentValue: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    roi: number;
    totalSlippageCost: number;
    avgSlippagePercent: number;
    positions: SimulatedPosition[];
}

const DEFAULT_TRADER_ADDRESS = '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b';
const TRADER_ADDRESS = (process.env.SIM_TRADER_ADDRESS || DEFAULT_TRADER_ADDRESS).toLowerCase();
const STARTING_CAPITAL = (() => {
    const raw = process.env.SIM_STARTING_CAPITAL;
    const value = raw ? Number(raw) : 1000;
    return Number.isFinite(value) && value > 0 ? value : 1000;
})();
const HISTORY_DAYS = (() => {
    const raw = process.env.SIM_HISTORY_DAYS;
    const value = raw ? Number(raw) : 7;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 7;
})();
const MULTIPLIER = ENV.TRADE_MULTIPLIER || 1.0;

// Realistic simulation parameters
const DETECTION_DELAY_SECONDS = (() => {
    const raw = process.env.SIM_DELAY_SECONDS;
    const value = raw ? Number(raw) : 10;
    return Number.isFinite(value) && value >= 0 ? value : 10;
})(); // Time between trader's trade and your detection

const BASE_SLIPPAGE_PERCENT = (() => {
    const raw = process.env.SIM_BASE_SLIPPAGE;
    const value = raw ? Number(raw) : 1.5;
    return Number.isFinite(value) && value >= 0 ? value : 1.5;
})(); // Base slippage %

const SLIPPAGE_PER_100USD = (() => {
    const raw = process.env.SIM_SLIPPAGE_PER_100;
    const value = raw ? Number(raw) : 0.5;
    return Number.isFinite(value) && value >= 0 ? value : 0.5;
})(); // Additional slippage per $100 order size

const TRANSACTION_FEE_PERCENT = (() => {
    const raw = process.env.SIM_FEE_PERCENT;
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value >= 0 ? value : 0;
})(); // Transaction fee %

// Strategy configuration
const STRATEGY = (() => {
    const raw = process.env.SIM_STRATEGY?.toUpperCase();
    if (raw === 'FIXED') return CopyStrategy.FIXED;
    if (raw === 'ADAPTIVE') return CopyStrategy.ADAPTIVE;
    return CopyStrategy.PERCENTAGE;
})();

const COPY_SIZE = (() => {
    const raw = process.env.SIM_COPY_SIZE || process.env.COPY_PERCENTAGE;
    const value = raw ? Number(raw) : (STRATEGY === CopyStrategy.FIXED ? 5.0 : 10.0);
    return Number.isFinite(value) && value > 0 ? value : (STRATEGY === CopyStrategy.FIXED ? 5.0 : 10.0);
})();

const MIN_ORDER_SIZE = (() => {
    const raw = process.env.SIM_MIN_ORDER_USD;
    const value = raw ? Number(raw) : 1.0;
    return Number.isFinite(value) && value > 0 ? value : 1.0;
})();

const MAX_ORDER_SIZE = (() => {
    const raw = process.env.SIM_MAX_ORDER_USD;
    const value = raw ? Number(raw) : 100.0;
    return Number.isFinite(value) && value > 0 ? value : 100.0;
})();

const MAX_TRADES_LIMIT = (() => {
    const raw = process.env.SIM_MAX_TRADES;
    const value = raw ? Number(raw) : 5000;
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5000;
})();

const COPY_CONFIG: CopyStrategyConfig = {
    strategy: STRATEGY,
    copySize: COPY_SIZE,
    tradeMultiplier: MULTIPLIER,
    maxOrderSizeUSD: MAX_ORDER_SIZE,
    minOrderSizeUSD: MIN_ORDER_SIZE,
};

/**
 * Calculate realistic slippage based on order size
 * Larger orders = more slippage
 */
function calculateSlippage(orderSize: number): number {
    const sizeBasedSlippage = (orderSize / 100) * SLIPPAGE_PER_100USD;
    return BASE_SLIPPAGE_PERCENT + sizeBasedSlippage;
}

/**
 * Calculate the actual price you would get, accounting for slippage and delay
 * BUY: You pay MORE than trader (price moves up)
 * SELL: You receive LESS than trader (price moves down)
 */
function getRealisticPrice(traderPrice: number, side: 'BUY' | 'SELL', orderSize: number): {
    yourPrice: number;
    slippagePercent: number;
} {
    const slippagePercent = calculateSlippage(orderSize);

    let yourPrice: number;
    if (side === 'BUY') {
        // Buying: price went up, you pay more
        yourPrice = traderPrice * (1 + slippagePercent / 100);
        // Cap at $1.00 (max price in prediction markets)
        yourPrice = Math.min(yourPrice, 0.999);
    } else {
        // Selling: price went down, you receive less
        yourPrice = traderPrice * (1 - slippagePercent / 100);
        // Floor at $0.001 (min price)
        yourPrice = Math.max(yourPrice, 0.001);
    }

    return { yourPrice, slippagePercent };
}

async function fetchBatch(offset: number, limit: number, sinceTimestamp: number): Promise<Trade[]> {
    const response = await axios.get(
        `https://data-api.polymarket.com/activity?user=${TRADER_ADDRESS}&type=TRADE&limit=${limit}&offset=${offset}`,
        {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        }
    );

    const trades: Trade[] = response.data.map((item: any) => ({
        id: item.id,
        timestamp: item.timestamp,
        market: item.slug || item.market,
        asset: item.asset,
        side: item.side,
        price: item.price,
        usdcSize: item.usdcSize,
        size: item.size,
        outcome: item.outcome || 'Unknown',
    }));

    return trades.filter((t) => t.timestamp >= sinceTimestamp);
}

async function fetchTraderActivity(): Promise<Trade[]> {
    try {
        const fs = await import('fs');
        const path = await import('path');

        // Check cache first
        const cacheDir = path.join(process.cwd(), 'trader_data_cache');
        const today = new Date().toISOString().split('T')[0];
        const cacheFile = path.join(cacheDir, `${TRADER_ADDRESS}_${HISTORY_DAYS}d_${today}.json`);

        if (fs.existsSync(cacheFile)) {
            console.log(colors.cyan('📦 Loading cached trader activity...'));
            const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            console.log(
                colors.green(`✓ Loaded ${cached.trades.length} trades from cache (${cached.name})`)
            );
            return cached.trades;
        }

        console.log(
            colors.cyan(
                `📊 Fetching trader activity from last ${HISTORY_DAYS} days (with parallel requests)...`
            )
        );

        const sinceTimestamp = Math.floor((Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000) / 1000);

        const firstBatch = await fetchBatch(0, 100, sinceTimestamp);
        let allTrades: Trade[] = [...firstBatch];

        if (firstBatch.length === 100) {
            const batchSize = 100;
            const maxParallel = 5;
            let offset = 100;
            let hasMore = true;

            while (hasMore && allTrades.length < MAX_TRADES_LIMIT) {
                const promises: Promise<Trade[]>[] = [];
                for (let i = 0; i < maxParallel; i++) {
                    promises.push(fetchBatch(offset + i * batchSize, batchSize, sinceTimestamp));
                }

                const results = await Promise.all(promises);
                let addedCount = 0;

                for (const batch of results) {
                    if (batch.length > 0) {
                        allTrades = allTrades.concat(batch);
                        addedCount += batch.length;
                    }
                    if (batch.length < batchSize) {
                        hasMore = false;
                        break;
                    }
                }

                if (addedCount === 0) {
                    hasMore = false;
                }

                if (allTrades.length >= MAX_TRADES_LIMIT) {
                    console.log(
                        colors.yellow(
                            `⚠️  Reached trade limit (${MAX_TRADES_LIMIT}), stopping fetch...`
                        )
                    );
                    allTrades = allTrades.slice(0, MAX_TRADES_LIMIT);
                    hasMore = false;
                }

                offset += maxParallel * batchSize;
                console.log(colors.gray(`  Fetched ${allTrades.length} trades so far...`));
            }
        }

        const sortedTrades = allTrades.sort((a, b) => a.timestamp - b.timestamp);
        console.log(colors.green(`✓ Fetched ${sortedTrades.length} trades from last ${HISTORY_DAYS} days`));

        // Save to cache
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const cacheData = {
            name: `trader_${TRADER_ADDRESS.slice(0, 6)}_${HISTORY_DAYS}d_${today}`,
            traderAddress: TRADER_ADDRESS,
            fetchedAt: new Date().toISOString(),
            period: `${HISTORY_DAYS}_days`,
            totalTrades: sortedTrades.length,
            trades: sortedTrades,
        };

        fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
        console.log(colors.green(`✓ Cached trades to: ${cacheFile}\n`));

        return sortedTrades;
    } catch (error) {
        console.error(colors.red('Error fetching trader activity:'), error);
        throw error;
    }
}

async function fetchTraderPositions(): Promise<Position[]> {
    try {
        console.log(colors.cyan('📈 Fetching trader positions...'));
        const response = await axios.get(
            `https://data-api.polymarket.com/positions?user=${TRADER_ADDRESS}`,
            {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            }
        );

        console.log(colors.green(`✓ Fetched ${response.data.length} positions`));
        return response.data;
    } catch (error) {
        console.error(colors.red('Error fetching positions:'), error);
        throw error;
    }
}

async function simulateCopyTrading(trades: Trade[]): Promise<SimulationResult> {
    console.log(colors.cyan('\n🎮 Starting REALISTIC simulation...\n'));
    console.log(colors.yellow(`⚠️  Simulation parameters:`));
    console.log(colors.gray(`   Detection delay: ${DETECTION_DELAY_SECONDS}s`));
    console.log(colors.gray(`   Base slippage: ${BASE_SLIPPAGE_PERCENT}%`));
    console.log(colors.gray(`   Slippage per $100: +${SLIPPAGE_PER_100USD}%`));
    console.log(colors.gray(`   Transaction fee: ${TRANSACTION_FEE_PERCENT}%\n`));

    let yourCapital = STARTING_CAPITAL;
    let totalInvested = 0;
    let copiedTrades = 0;
    let skippedTrades = 0;
    let totalSlippageCost = 0;
    let totalSlippagePercent = 0;

    const positions = new Map<string, SimulatedPosition>();

    for (const trade of trades) {
        const calculation = calculateOrderSize(
            COPY_CONFIG,
            trade.usdcSize,
            yourCapital
        );

        if (calculation.finalAmount === 0 || calculation.belowMinimum) {
            skippedTrades++;
            continue;
        }

        const orderSize = calculation.finalAmount;
        const positionKey = `${trade.asset}:${trade.outcome}`;

        if (trade.side === 'BUY') {
            // Calculate realistic price with slippage
            const { yourPrice, slippagePercent } = getRealisticPrice(trade.price, 'BUY', orderSize);
            const sharesReceived = orderSize / yourPrice;
            const slippageCost = orderSize * (slippagePercent / 100);

            // Apply transaction fee
            const feeAmount = orderSize * (TRANSACTION_FEE_PERCENT / 100);
            const totalCost = orderSize + feeAmount;

            if (totalCost > yourCapital) {
                skippedTrades++;
                continue;
            }

            if (!positions.has(positionKey)) {
                positions.set(positionKey, {
                    market: trade.market || trade.asset || 'Unknown market',
                    outcome: trade.outcome,
                    sharesHeld: 0,
                    entryPrice: yourPrice,
                    exitPrice: null,
                    invested: 0,
                    currentValue: 0,
                    pnl: 0,
                    closed: false,
                    trades: [],
                });
            }

            const pos = positions.get(positionKey)!;

            pos.sharesHeld += sharesReceived;
            pos.invested += totalCost;
            pos.currentValue = pos.sharesHeld * yourPrice;

            pos.trades.push({
                timestamp: trade.timestamp,
                side: 'BUY',
                traderPrice: trade.price,
                yourPrice: yourPrice,
                size: sharesReceived,
                usdcSize: totalCost,
                slippagePercent: slippagePercent,
                slippageCost: slippageCost,
            });

            yourCapital -= totalCost;
            totalInvested += totalCost;
            totalSlippageCost += slippageCost;
            totalSlippagePercent += slippagePercent;
            copiedTrades++;
        } else if (trade.side === 'SELL') {
            if (positions.has(positionKey)) {
                const pos = positions.get(positionKey)!;

                if (pos.sharesHeld <= 0) {
                    skippedTrades++;
                    continue;
                }

                // Estimate trader's sell percentage (still imperfect, but best we can do)
                const traderSellShares = trade.usdcSize / trade.price;
                const traderTotalShares = traderSellShares / 0.1; // Rough estimate
                const traderSellPercent = Math.min(traderSellShares / traderTotalShares, 1.0);

                const sharesToSell = Math.min(pos.sharesHeld * traderSellPercent, pos.sharesHeld);

                // Calculate realistic sell price with slippage
                const estimatedSellValue = sharesToSell * trade.price;
                const { yourPrice, slippagePercent } = getRealisticPrice(trade.price, 'SELL', estimatedSellValue);
                const sellAmount = sharesToSell * yourPrice;
                const slippageCost = estimatedSellValue * (slippagePercent / 100);

                // Apply transaction fee
                const feeAmount = sellAmount * (TRANSACTION_FEE_PERCENT / 100);
                const netSellAmount = sellAmount - feeAmount;

                pos.sharesHeld -= sharesToSell;
                pos.currentValue = pos.sharesHeld * yourPrice;
                pos.exitPrice = yourPrice;

                pos.trades.push({
                    timestamp: trade.timestamp,
                    side: 'SELL',
                    traderPrice: trade.price,
                    yourPrice: yourPrice,
                    size: sharesToSell,
                    usdcSize: netSellAmount,
                    slippagePercent: slippagePercent,
                    slippageCost: slippageCost,
                });

                yourCapital += netSellAmount;
                totalSlippageCost += slippageCost;
                totalSlippagePercent += slippagePercent;

                if (pos.sharesHeld < 0.01) {
                    pos.closed = true;
                    const totalBought = pos.trades
                        .filter((t) => t.side === 'BUY')
                        .reduce((sum, t) => sum + t.usdcSize, 0);
                    const totalSold = pos.trades
                        .filter((t) => t.side === 'SELL')
                        .reduce((sum, t) => sum + t.usdcSize, 0);
                    pos.pnl = totalSold - totalBought;
                }

                copiedTrades++;
            } else {
                skippedTrades++;
            }
        }
    }

    // Calculate current values
    const traderPositions = await fetchTraderPositions();
    let totalCurrentValue = yourCapital;
    let unrealizedPnl = 0;
    let realizedPnl = 0;

    for (const [key, simPos] of positions.entries()) {
        if (!simPos.closed) {
            const assetId = key.split(':')[0];
            const traderPos = traderPositions.find((tp) => tp.asset === assetId);

            if (traderPos) {
                const currentPrice = traderPos.currentValue / traderPos.size;
                simPos.currentValue = simPos.sharesHeld * currentPrice;
            }

            simPos.pnl = simPos.currentValue - simPos.invested;
            unrealizedPnl += simPos.pnl;
            totalCurrentValue += simPos.currentValue;
        } else {
            realizedPnl += simPos.pnl;
        }
    }

    const currentCapital =
        yourCapital +
        Array.from(positions.values())
            .filter((p) => !p.closed)
            .reduce((sum, p) => sum + p.currentValue, 0);

    const totalPnl = currentCapital - STARTING_CAPITAL;
    const roi = (totalPnl / STARTING_CAPITAL) * 100;
    const avgSlippagePercent = copiedTrades > 0 ? totalSlippagePercent / copiedTrades : 0;

    const strategyName = STRATEGY === CopyStrategy.FIXED ? 'FIXED' :
                        STRATEGY === CopyStrategy.ADAPTIVE ? 'ADAPTIVE' : 'PERCENTAGE';
    const copySizeLabel = STRATEGY === CopyStrategy.FIXED ? `${COPY_SIZE}usd` : `${COPY_SIZE}pct`;

    return {
        id: `sim_realistic_${TRADER_ADDRESS.slice(0, 8)}_${Date.now()}`,
        name: `${strategyName}_${TRADER_ADDRESS.slice(0, 6)}_${HISTORY_DAYS}d_${copySizeLabel}_realistic`,
        logic: `${STRATEGY.toLowerCase()}_realistic`,
        timestamp: Date.now(),
        traderAddress: TRADER_ADDRESS,
        startingCapital: STARTING_CAPITAL,
        currentCapital,
        totalTrades: trades.length,
        copiedTrades,
        skippedTrades,
        totalInvested,
        currentValue: totalCurrentValue,
        realizedPnl,
        unrealizedPnl,
        totalPnl,
        roi,
        totalSlippageCost,
        avgSlippagePercent,
        positions: Array.from(positions.values()),
    };
}

function printReport(result: SimulationResult) {
    console.log('\n' + colors.cyan('═'.repeat(80)));
    console.log(colors.cyan(`  📊 REALISTIC COPY TRADING SIMULATION REPORT`));
    console.log(colors.cyan('═'.repeat(80)) + '\n');

    console.log('Trader:', colors.blue(result.traderAddress));
    console.log('Strategy:', colors.yellow(STRATEGY));

    if (STRATEGY === CopyStrategy.FIXED) {
        console.log(
            'Copy Size:',
            colors.yellow(`$${COPY_SIZE}`),
            colors.gray('(fixed amount per trade)')
        );
    } else if (STRATEGY === CopyStrategy.PERCENTAGE) {
        console.log(
            'Copy Size:',
            colors.yellow(`${COPY_SIZE}%`),
            colors.gray('(of trader order size)')
        );
    }

    console.log();
    console.log(colors.bold('Realism Factors:'));
    console.log(`  Detection delay: ${colors.yellow(DETECTION_DELAY_SECONDS + 's')}`);
    console.log(`  Base slippage: ${colors.yellow(BASE_SLIPPAGE_PERCENT + '%')}`);
    console.log(`  Slippage per $100: ${colors.yellow('+' + SLIPPAGE_PER_100USD + '%')}`);
    console.log(`  Avg actual slippage: ${colors.yellow(result.avgSlippagePercent.toFixed(2) + '%')}`);
    console.log(`  Total slippage cost: ${colors.red('$' + result.totalSlippageCost.toFixed(2))}`);
    if (TRANSACTION_FEE_PERCENT > 0) {
        console.log(`  Transaction fee: ${colors.yellow(TRANSACTION_FEE_PERCENT + '%')}`);
    }
    console.log();

    console.log(colors.bold('Capital:'));
    console.log(`  Starting: ${colors.green('$' + result.startingCapital.toFixed(2))}`);
    console.log(`  Current:  ${colors.green('$' + result.currentCapital.toFixed(2))}`);
    console.log();

    console.log(colors.bold('Performance:'));
    const pnlColor = result.totalPnl >= 0 ? colors.green : colors.red;
    const roiColor = result.roi >= 0 ? colors.green : colors.red;
    const pnlSign = result.totalPnl >= 0 ? '+' : '';
    const roiSign = result.roi >= 0 ? '+' : '';
    console.log(`  Total P&L:     ${pnlColor(pnlSign + '$' + result.totalPnl.toFixed(2))}`);
    console.log(`  ROI:           ${roiColor(roiSign + result.roi.toFixed(2) + '%')}`);
    console.log(
        `  Realized:      ${result.realizedPnl >= 0 ? '+' : ''}$${result.realizedPnl.toFixed(2)}`
    );
    console.log(
        `  Unrealized:    ${result.unrealizedPnl >= 0 ? '+' : ''}$${result.unrealizedPnl.toFixed(2)}`
    );
    console.log();

    console.log(colors.bold('Trades:'));
    console.log(`  Total trades:  ${colors.cyan(String(result.totalTrades))}`);
    console.log(`  Copied:        ${colors.green(String(result.copiedTrades))}`);
    console.log(
        `  Skipped:       ${colors.yellow(String(result.skippedTrades))} (below $${MIN_ORDER_SIZE} minimum)`
    );
    console.log();

    const openPositions = result.positions.filter((p) => !p.closed);
    const closedPositions = result.positions.filter((p) => p.closed);

    console.log(colors.bold('Open Positions:'));
    console.log(`  Count: ${openPositions.length}\n`);

    openPositions.slice(0, 10).forEach((pos, i) => {
        const pnlStr =
            pos.pnl >= 0
                ? colors.green(`+$${pos.pnl.toFixed(2)}`)
                : colors.red(`-$${Math.abs(pos.pnl).toFixed(2)}`);
        const marketLabel = (pos.market || 'Unknown market').slice(0, 50);
        console.log(`  ${i + 1}. ${marketLabel}`);
        console.log(
            `     Outcome: ${pos.outcome} | Invested: $${pos.invested.toFixed(2)} | Value: $${pos.currentValue.toFixed(2)} | P&L: ${pnlStr}`
        );
    });

    if (openPositions.length > 10) {
        console.log(colors.gray(`\n  ... and ${openPositions.length - 10} more positions`));
    }

    if (closedPositions.length > 0) {
        console.log('\n' + colors.bold('Closed Positions:'));
        console.log(`  Count: ${closedPositions.length}\n`);

        closedPositions.slice(0, 5).forEach((pos, i) => {
            const pnlStr =
                pos.pnl >= 0
                    ? colors.green(`+$${pos.pnl.toFixed(2)}`)
                    : colors.red(`-$${Math.abs(pos.pnl).toFixed(2)}`);
            const marketLabel = (pos.market || 'Unknown market').slice(0, 50);
            console.log(`  ${i + 1}. ${marketLabel}`);
            console.log(`     Outcome: ${pos.outcome} | P&L: ${pnlStr}`);
        });

        if (closedPositions.length > 5) {
            console.log(
                colors.gray(`\n  ... and ${closedPositions.length - 5} more closed positions`)
            );
        }
    }

    console.log('\n' + colors.cyan('═'.repeat(80)) + '\n');

    // Comparison suggestion
    console.log(colors.yellow('💡 TIP: Compare with original simulation:'));
    console.log(colors.gray('   npm run simulate'));
    console.log(colors.gray('   This will show how much slippage and delay impact returns\n'));
}

async function main() {
    console.log(colors.cyan('\n🚀 REALISTIC COPY TRADING SIMULATION\n'));
    console.log(colors.gray(`Trader: ${TRADER_ADDRESS}`));
    console.log(colors.gray(`Starting Capital: $${STARTING_CAPITAL}`));
    console.log(colors.gray(`Strategy: ${STRATEGY}`));

    if (STRATEGY === CopyStrategy.FIXED) {
        console.log(colors.gray(`Copy Size: $${COPY_SIZE} (fixed per trade)`));
    } else if (STRATEGY === CopyStrategy.PERCENTAGE) {
        console.log(colors.gray(`Copy Size: ${COPY_SIZE}% (of trader order size)`));
    }

    console.log(colors.gray(`Multiplier: ${MULTIPLIER}x`));
    console.log(
        colors.gray(`History window: ${HISTORY_DAYS} day(s), max trades: ${MAX_TRADES_LIMIT}\n`)
    );

    try {
        const trades = await fetchTraderActivity();
        const result = await simulateCopyTrading(trades);
        printReport(result);

        // Save to JSON file
        const fs = await import('fs');
        const path = await import('path');
        const resultsDir = path.join(process.cwd(), 'simulation_results');

        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const tag = (() => {
            const raw = process.env.SIM_RESULT_TAG;
            if (!raw) return '';
            return '_' + raw.trim().replace(/[^a-zA-Z0-9-_]+/g, '-');
        })();
        const strategyName = STRATEGY.toLowerCase();
        const copySizeLabel = STRATEGY === CopyStrategy.FIXED ? `${COPY_SIZE}usd` : `${COPY_SIZE}pct`;
        const filename = `${strategyName}_${TRADER_ADDRESS}_${HISTORY_DAYS}d_${copySizeLabel}_realistic${tag}_${new Date().toISOString().split('T')[0]}.json`;
        const filepath = path.join(resultsDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf8');
        console.log(colors.green(`✓ Results saved to: ${filepath}\n`));

        console.log(colors.green('✓ Realistic simulation completed!\n'));
    } catch (error) {
        console.error(colors.red('\n✗ Simulation failed:'), error);
        process.exit(1);
    }
}

main();
