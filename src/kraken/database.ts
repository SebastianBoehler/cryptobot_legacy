import { createChunks, logger, sleep } from "../utils";
import Kraken from "./utils";
import Mongo from "../mongodb/index";
import { subMinutes, subMonths } from "date-fns";
import { DatabaseType } from "./types";

const client = new Kraken();
const mongo = new Mongo("kraken");
const startTime = subMonths(new Date(), 3).getTime();

async function processSymbol(symbol: string) {
  const lastCandle = (await mongo.readLastCandle(
    symbol,
    "start"
  )) as unknown as DatabaseType;
  const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime);
  const secondsAgo = (new Date().getTime() - lastCandleTime.getTime()) / 1000;
  if (secondsAgo < 70) return;

  logger.info(`Loading candles since ${lastCandleTime} for ${symbol}`);
  const candles = await client.getOHLCdata(symbol, 1, lastCandleTime);

  if (!candles || candles.length === 0) return;
  logger.debug(`Earliest candle: ${new Date(candles[0][0] * 1000)}}`);
  logger.debug(
    `Latest candle: ${new Date(candles[candles.length - 1][0] * 1000)}}`
  );
  if (!lastCandle) {
    logger.info(`Creating unique index for ${symbol}`);
    await mongo.createUniqueIndex(symbol, "start");
  }

  const data: DatabaseType[] = candles
    .map((candle) => {
      return {
        high: candle[2],
        low: candle[3],
        open: candle[1],
        close: candle[4],
        volume: candle[6],
        start: new Date(candle[0] * 1000),
      };
    })
    .filter(
      (candle) =>
        candle.start.getTime() > lastCandleTime.getTime() &&
        candle.start.getTime() < subMinutes(new Date(), 1).getTime()
    );

  await mongo.writeMany(symbol, data);
}

async function main() {
  const pairs = await client.getTradablePairs();
  const symbols = Object.keys(pairs);
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

main();
