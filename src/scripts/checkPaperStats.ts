import mongoose from 'mongoose';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';

const TRADER_ADDRESSES = ENV.USER_ADDRESSES;

async function connectDB() {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(ENV.MONGO_URI);
    }
}

async function checkPaperStats() {
    console.log('\n📊 ' + '='.repeat(60));
    console.log('📈 PAPER TRADING PERFORMANCE REPORT');
    console.log('='.repeat(60));

    try {
        await connectDB();

        const allStats = [];
        let totalOverallCost = 0;
        let totalOverallRevenue = 0;

        for (const trader of TRADER_ADDRESSES) {
            const UserActivity = getUserActivityModel(trader);

            // Fetch all bot-executed trades
            const activities = await UserActivity.find({ bot: true }).sort({ timestamp: 1 }).exec();

            if (activities.length === 0) continue;

            let buyVolume = 0;
            let sellVolume = 0;
            let buyTokens = 0;
            let sellTokens = 0;

            // Group by market to find open positions
            const markets = new Map<string, {
                title: string,
                tokensHeld: number,
                cost: number,
                outcome: string
            }>();

            for (const act of activities) {
                const amount = act.myUsdcSize || 0;
                const tokens = act.mySize || 0;
                const asset = act.asset || 'UnknownAsset';

                if (act.side === 'BUY') {
                    buyVolume += amount;
                    buyTokens += tokens;

                    if (!markets.has(asset)) {
                        markets.set(asset, {
                            title: act.title || 'Unknown',
                            tokensHeld: 0,
                            cost: 0,
                            outcome: act.outcome || 'N/A'
                        });
                    }
                    const m = markets.get(asset)!;
                    m.tokensHeld += tokens;
                    m.cost += amount;
                } else if (act.side === 'SELL') {
                    sellVolume += amount;
                    sellTokens += tokens;

                    if (markets.has(asset)) {
                        const m = markets.get(asset)!;
                        m.tokensHeld -= tokens;
                    }
                }
            }

            totalOverallCost += buyVolume;
            totalOverallRevenue += sellVolume;

            const openPositions = Array.from(markets.entries())
                .filter(([_, m]) => m.tokensHeld > 0.01)
                .map(([id, m]) => ({ id: id || 'Unknown', ...m }));

            allStats.push({
                trader: trader.slice(0, 8) + '...',
                buys: buyVolume,
                sells: sellVolume,
                profit: sellVolume - buyVolume, // This is raw cashflow pnl
                openCount: openPositions.length
            });

            console.log(`\n👨‍💻 Trader: ${trader}`);
            console.log(`   Total Invested:  $${buyVolume.toFixed(2)}`);
            console.log(`   Total Recovered: $${sellVolume.toFixed(2)}`);
            console.log(`   Net Cashflow:    ${(sellVolume - buyVolume) >= 0 ? '🟢' : '🔴'} $${(sellVolume - buyVolume).toFixed(2)}`);

            if (openPositions.length > 0) {
                console.log(`   📂 Open Positions: ${openPositions.length}`);
                openPositions.forEach(p => {
                    console.log(`      • ${p.title} (${p.outcome}): ${p.tokensHeld.toFixed(2)} tokens`);
                });
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('🌎 GLOBAL SUMMARY');
        console.log('='.repeat(60));
        console.log(`💰 Total Invested:  $${totalOverallCost.toFixed(2)}`);
        console.log(`💵 Total Recovered: $${totalOverallRevenue.toFixed(2)}`);
        console.log(`📊 Total Cash P&L:  ${(totalOverallRevenue - totalOverallCost) >= 0 ? '🟢' : '🔴'} $${(totalOverallRevenue - totalOverallCost).toFixed(2)}`);
        console.log('='.repeat(60) + '\n');

    } catch (err) {
        console.error('❌ Error calculating stats:', err);
    } finally {
        await mongoose.disconnect();
    }
}

checkPaperStats();
