import { CoinbaseAdvanced } from "./utils";
import Mongo from "../mongodb";
import { addMinutes, getUnixTime, subMinutes, subMonths } from "date-fns";
import { createChunks, logger, sleep } from "../utils";
import config from "../config/config";
import { DatabaseType } from "../mongodb/types";

const startTime = subMonths(new Date(), 3).getTime();
const client = new CoinbaseAdvanced(config.CB_API_KEY);
const mongo = new Mongo("coinbase");

async function main() {
  const products = await client.listProducts();
  let symbols: string[] = products.map((item) => item.product_id);

  if (config.CB_ENABLED_PAIRS.length > 0)
    symbols = symbols.filter((item) => config.CB_ENABLED_PAIRS.includes(item));

  const chunks = createChunks(symbols, 5);

  while (true) {
    for (const chunk of chunks) {
      try {
        const result = await Promise.allSettled(chunk.map(processSymbol));
        logger.info(
          `Successfully updated ${
            result.filter((r) => r.status === "fulfilled").length
          } symbols`
        );
      } catch (error: unknown) {
        logger.error(error);
      } finally {
        await sleep(1000);
      }
    }
  }
}

async function processSymbol(symbol: string) {
  const lastCandle = await mongo.readLastCandle(symbol);

  const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime);
  const secondsAgo = (new Date().getTime() - lastCandleTime.getTime()) / 1000;
  if (secondsAgo < 70) return;

  //logger.info('lastCandle', new Date(lastCandle ? addMinutes(lastCandle.start, 1) : startTime).toString(), lastCandle)
  const candles = await client.getKlines({
    symbol,
    interval: "ONE_MINUTE",
    startTime: getUnixTime(
      lastCandle ? addMinutes(lastCandle.start, 1) : startTime
    ),
    endTime: getUnixTime(
      lastCandle
        ? addMinutes(lastCandle.start, 101)
        : addMinutes(startTime, 100)
    ),
  });

  if (!candles || candles.length === 0) return;

  logger.info(`Loaded ${candles.length} candles for ${symbol}`);

  const formatted: DatabaseType[] = candles
    .filter(
      (item) =>
        +item.start > getUnixTime(lastCandle?.start || 0) &&
        +item.start < getUnixTime(subMinutes(new Date(), 1))
    )
    .map((candle: any) => {
      return {
        ...candle,
        start: new Date(candle.start * 1000),
      };
    });

  if (formatted.length > 0) {
    if (!lastCandle) {
      logger.info(`Creating unique index for ${symbol}`);
      await mongo.createUniqueIndex(symbol, "start");
    }
    await mongo.writeMany(symbol, formatted);
  }
}

main();
