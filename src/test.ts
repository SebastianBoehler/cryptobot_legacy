import { addDays, subDays } from "date-fns";
import Mongo from "./mongodb/index";
import { Exchanges, OrderObject } from "./types/trading";
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
  const start = new Date("2022-11-17T19:06:00");
  const allResults = [];
  const allTrades: OrderObject[] = [];

  ruleLoop: for (const rule of setOfRules) {
    const allTradesPromise = setOfSymbols.map(async (symbol) => {
      //console.log(rule, symbol);
      const { trades } = await mongo.getTradesOfBacktest(exchange, {
        strategyName: rule,
        symbol,
        //start,
      });
      const result = calculateBacktestResult(trades, trades[0]?.netInvest || 0);
      return { symbol, rule, trades, result };
    });
    const trades = await Promise.all(allTradesPromise);
    allResults.push(...trades);
    //console.log(allTrades);
  }

  //create an array of dates in intervals from start to now
  //how often to get backtets result and decide if it is worth to invest
  const dayInterval = 2;
  const dates = [start];
  while (dates[dates.length - 1] < new Date()) {
    dates.push(addDays(dates[dates.length - 1], dayInterval));
  }

  const profits = [];
  let prevResults = null;
  const listOfDates = dates.entries();
  for (const [i, date] of listOfDates) {
    if (i <= 6) continue;

    const tempResults = allResults.map((trade) => {
      const { trades } = trade;
      const filteredTrades = trades.filter(
        ({ timestamp }) => timestamp <= date && timestamp > subDays(date, 12) //10 = 1.76
      );
      const tempResult = calculateBacktestResult(
        filteredTrades,
        filteredTrades[0]?.netInvest || 0
      );
      return { ...trade, result: tempResult, trades: filteredTrades };
    });

    //sort by netProfitInPercent and if NaN then put to the end
    const tempResultsSorted = tempResults
      .filter((item) => !isNaN(item.result.netProfitInPercent))
      .sort(
        (a, b) => b.result.netProfitInPercent - a.result.netProfitInPercent
      );

    console.log(`Date ${i - 6} ${date.toISOString()}`);

    if (prevResults) {
      //TODO: use best 10 and get the best where all criteria are met
      const bestPrev = prevResults[0];
      if (!bestPrev) {
        prevResults = tempResultsSorted;
        continue;
      }
      const { result } = bestPrev;
      if (
        bestPrev &&
        result.netProfitInPercent > 30 &&
        result.successRate > 0.4 &&
        result.avgTimeInLossInPercent < 40
        //result.avgHoldDuration < 400
      ) {
        //calculate profit for last best on this day
        const result = allResults.find(
          (item) =>
            item.symbol === bestPrev.symbol && item.rule === bestPrev.rule
        )!;
        const trades = result.trades.filter(
          (trade) =>
            trade.timestamp <= date &&
            trade.timestamp > subDays(date, dayInterval)
        );
        allTrades.push(...trades);

        const current = calculateBacktestResult(
          trades,
          trades[0]?.netInvest || 0
        );

        if (!isNaN(current.netProfitInPercent))
          profits.push(new BigNumber(current.netProfitInPercent / 100 + 1));
        console.log(
          `Prev best ${bestPrev.result.netProfitInPercent} Current best ${current.netProfitInPercent}`
        );
      } else {
        console.log("skip day ingored profit");
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
  const result = calculateBacktestResult(
    allTrades,
    allTrades[0]?.netInvest || 0
  );
  const { successRate, avgHoldDuration, avgTimeInLossInPercent } = result;
  console.log({
    totalProfit: totalProfit.toNumber(),
    successRate,
    avgHoldDuration,
    avgTimeInLossInPercent,
  });
}

main();
