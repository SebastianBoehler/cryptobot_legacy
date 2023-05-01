import { addDays } from "date-fns";
import Mongo from "./mongodb/index";
import { Exchanges } from "./types/trading";
import { calculateBacktestResult } from "./utils";
import BigNumber from "bignumber.js";
const mongo = new Mongo("okx");
const exchange: Exchanges = "okx";

async function main() {
  const setOfRules = await mongo.getSetOfField(
    "backtests",
    exchange,
    "strategyName"
  );
  const setOfSymbols = await mongo.getSetOfField(
    "backtests",
    exchange,
    "symbol"
  );
  const start = new Date("2022-12-31T07:16:42.198+00:00");
  const overallResult = [];

  ruleLoop: for (const rule of setOfRules) {
    const allTradesPromise = setOfSymbols.map(async (symbol) => {
      //console.log(rule, symbol);
      const { trades } = await mongo.getTradesOfBacktest(exchange, {
        strategyName: rule,
        symbol,
        start,
      });
      const result = calculateBacktestResult(trades, trades[0]?.netInvest || 0);
      return { symbol, rule, trades, result };
    });
    const allTrades = await Promise.all(allTradesPromise);

    //create an array of dates in weekly intervals from start to now
    const dates = [start];
    while (dates[dates.length - 1] < new Date()) {
      dates.push(addDays(dates[dates.length - 1], 21));
    }

    //console.log(allTrades);

    const profits = [];
    let prevResults = null;
    for (const [i, date] of dates.entries()) {
      if (i === 0) continue;
      //calculate backtest result for each symbol in the current timeframe
      const tempResults = allTrades.map((trade) => {
        const { trades } = trade;
        const filteredTrades = trades.filter(
          (trade) => trade.timestamp <= date && trade.timestamp >= dates[i - 1]
        );
        const tempResult = calculateBacktestResult(
          filteredTrades,
          filteredTrades[0]?.netInvest || 0
        );
        return { ...trade, trades: filteredTrades, result: tempResult };
      });

      const tempResultsSorted = tempResults.sort(
        (a, b) => b.result.netProfitInPercent - a.result.netProfitInPercent
      );
      if (prevResults) {
        const bestPrev = prevResults[0];
        //trade the symbol that was best last time
        const current = tempResultsSorted.find(
          (trade) => trade.symbol === bestPrev.symbol
        );
        if (current) {
          profits.push(
            new BigNumber(current.result.netProfitInPercent / 100 + 1)
          );
          console.log(
            `Prev best ${bestPrev.result.netProfitInPercent} Current best ${current.result.netProfitInPercent}`
          );
          if (current.result.netProfitInPercent < -100) {
            debugger;
          }
        }
      }
      prevResults = tempResultsSorted;
      //if (i >= 3) break;
    }

    //calc total profit prev profit * current profit
    const totalProfit = profits.reduce(
      (acc, curr) => acc.times(curr),
      BigNumber(1)
    );
    console.log({ rule, totalProfit: totalProfit.toNumber() });

    overallResult.push({
      rule,
      totalProfit: totalProfit.toFixed(2),
      profitInPercent: (totalProfit.toNumber() - 1) * 100,
    });
  }

  console.log(JSON.stringify(overallResult, null, 2));
}

main();
