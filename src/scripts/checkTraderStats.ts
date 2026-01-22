import { ENV } from '../config/env';
import fetchData from '../utils/fetchData';
import getMyBalance from '../utils/getMyBalance';
import chalk from 'chalk';

const TRADER_ADDRESSES = ENV.USER_ADDRESSES;

interface Position {
    asset: string;
    conditionId: string;
    size: number;
    avgPrice: number;
    initialValue: number;
    currentValue: number;
    cashPnl: number;
    percentPnl: number;
    totalBought: number;
    realizedPnl: number;
    percentRealizedPnl: number;
    curPrice: number;
    title?: string;
    slug?: string;
    outcome?: string;
}

const checkTraderStats = async () => {
    console.log(chalk.cyan('\n🔍 FETCHING TRADER PERFORMANCE (LIVE DATA FROM POLYMARKET)\n'));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const address of TRADER_ADDRESSES) {
        console.log(chalk.bold.blue(`👤 TRADER: ${address}`));

        try {
            // 1. Get Balance
            const balance = await getMyBalance(address);

            // 2. Get Positions
            const positionsUrl = `https://data-api.polymarket.com/positions?user=${address}`;
            const positions: Position[] = await fetchData(positionsUrl);

            let totalValue = balance;
            let totalUnrealizedPnl = 0;
            let totalRealizedPnl = 0;
            let activePositions = 0;

            if (positions && positions.length > 0) {
                positions.forEach((pos) => {
                    totalValue += pos.currentValue || 0;
                    totalUnrealizedPnl += pos.cashPnl || 0;
                    totalRealizedPnl += pos.realizedPnl || 0;
                    if (pos.size > 0.01) activePositions++;
                });
            }

            console.log(`   💰 Wallet Balance: $${balance.toFixed(2)}`);
            console.log(`   📊 Active Positions: ${activePositions}`);
            console.log(`   💵 Current Net Worth: $${totalValue.toFixed(2)}`);

            const unrealizedColor = totalUnrealizedPnl >= 0 ? chalk.green : chalk.red;
            const realizedColor = totalRealizedPnl >= 0 ? chalk.green : chalk.red;
            const totalPnl = totalUnrealizedPnl + totalRealizedPnl;
            const totalColor = totalPnl >= 0 ? chalk.green.bold : chalk.red.bold;

            console.log(`   📈 Unrealized P&L: ${unrealizedColor('$' + totalUnrealizedPnl.toFixed(2))}`);
            console.log(`   ✅ Realized P&L:   ${realizedColor('$' + totalRealizedPnl.toFixed(2))}`);
            console.log(`   ✨ Total P&L:      ${totalColor('$' + totalPnl.toFixed(2))}`);

            if (activePositions > 0) {
                console.log(chalk.gray('\n   Top 3 Positions:'));
                const topPositions = [...positions]
                    .filter(p => p.size > 0.01)
                    .sort((a, b) => Math.abs(b.cashPnl) - Math.abs(a.cashPnl))
                    .slice(0, 3);

                topPositions.forEach(p => {
                    const pnlStr = p.cashPnl >= 0 ? chalk.green(`+$${p.cashPnl.toFixed(2)}`) : chalk.red(`-$${Math.abs(p.cashPnl).toFixed(2)}`);
                    console.log(`      • ${p.title || 'Market'}: ${pnlStr} (${(p.percentPnl || 0).toFixed(1)}%)`);
                });
            }

        } catch (error) {
            console.error(chalk.red(`   ❌ Error fetching stats for ${address}:`), error instanceof Error ? error.message : 'Unknown error');
        }
        console.log('\n' + chalk.gray('─────────────────────────────────────────────────────') + '\n');
    }

    console.log(chalk.cyan('✅ Performance check completed.\n'));
};

checkTraderStats();
