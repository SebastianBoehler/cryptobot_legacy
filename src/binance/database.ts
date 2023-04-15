import { MainClient } from "binance";
import config from "../config/config";
import { createChunks, logger, sleep } from "../utils";
import Mongo from "../mongodb";
import { subMinutes, subMonths } from "date-fns";
import { DatabaseType } from "../mongodb/types";

const startTime = subMonths(new Date(), 3).getTime();
const mongo = new Mongo("binance");
const client = new MainClient({
  api_key: config.BINANCE_API_KEY,
  api_secret: config.BINANCE_API_SECRET,
});

async function main() {
  const markets = await client.getExchangeInfo();
  const symbols = markets.symbols
    .filter(
      (market) =>
        config.BN_ENABLED_PAIRS.length === 0 ||
        (config.BN_ENABLED_PAIRS.includes(market.symbol) &&
          market.status === "TRADING" &&
          market.isSpotTradingAllowed)
    )
    .map((symbol) => symbol.symbol);

  const chunksOfSymbols = createChunks(symbols, 20);
  logger.info("symbols", symbols.length, symbols);

  while (true) {
    for (const chunk of chunksOfSymbols) {
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
        await sleep(1000 * 5);
      }
    }
  }
}

async function processSymbol(symbol: string) {
  const lastCandle = await mongo.readLastCandle(symbol);

  const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime);
  const secondsAgo = (new Date().getTime() - lastCandleTime.getTime()) / 1000;
  if (secondsAgo < 70) return;

  const candles = await client.getKlines({
    symbol,
    interval: "1m",
    limit: 1000, //1000
    startTime: lastCandle?.start.getTime() || startTime,
  });

  if (candles.length === 0) return;
  if (!lastCandle) {
    logger.info(`Creating unique index for ${symbol}`);
    await mongo.createUniqueIndex(symbol, "openTime");
  }

  logger.info(`Loaded ${candles.length} candles for ${symbol}`);

  const formatted: DatabaseType[] = candles.map((candle) => ({
    start: new Date(candle[0]),
    open: candle[1] + "",
    high: candle[2] + "",
    low: candle[3] + "",
    close: candle[4] + "",
    volume: candle[5] + "",
    //closeTime: new Date(candle[6]),
    //quoteAssetVolume: candle[7],
    //numberOfTrades: candle[8],
    //takerBuyBaseAssetVolume: candle[9],
    //takerBuyQuoteAssetVolume: candle[10],
    //ignore: candle[11],
  }));

  const filtered = formatted.filter(
    ({ start }) =>
      start.getTime() > (lastCandle?.start.getTime() || 0) &&
      start.getTime() < subMinutes(new Date(), 1).getTime()
  );
  logger.info(`Writing ${filtered.length} candles to ${symbol}`);
  if (filtered.length > 0) await mongo.writeMany(symbol, filtered);
}

main();
