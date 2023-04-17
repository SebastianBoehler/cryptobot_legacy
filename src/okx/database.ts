import { RestClient } from "okx-api";
import { createChunks, logger, sleep } from "../utils";
import Mongo from "../mongodb/index";
import { subMonths, addMinutes } from "date-fns";
import { DatabaseType } from "../mongodb/types";

const mongo = new Mongo("okx");
const okxClient = new RestClient({
  apiKey: "42975a9f-9662-48fa-be91-4bd552244c84",
  apiSecret: "1B4A1C25855CD1754828CD72776D0357",
  apiPass: "Okx+27102001",
});
const startTime = subMonths(new Date(), 5).getTime();

async function processSymbol(symbol: string) {
  const lastCandle = await mongo.readLastCandle(symbol);
  const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime);
  const secondsAgo = (new Date().getTime() - lastCandleTime.getTime()) / 1000;
  if (secondsAgo < 70) return;

  //logger.info(`Loading candles since ${lastCandleTime} for ${symbol}`);
  const candles = await okxClient.getHistoricCandles(symbol, "1m", {
    //after: lastCandleTime.getTime() + "",
    after: addMinutes(lastCandleTime, 100).getTime() + "",
  });

  if (!candles || candles.length === 0) return;
  candles.sort((a, b) => +a[0] - +b[0]);

  //logger.debug(`Earliest candle: ${new Date(+candles[0][0])}}`);
  //logger.debug(`Latest candle: ${new Date(+candles[candles.length - 1][0])}}`);
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
        //! FIX WITH TYPES UPDATE
        //@ts-ignore
        volume: candle[7]!,
        start: new Date(+candle[0]),
      };
    })
    .filter(
      ({ start }) =>
        start.getTime() > lastCandleTime.getTime() &&
        start.getTime() < new Date().getTime()
    );

  if (data.length) await mongo.writeMany(symbol, data);
}

async function main() {
  const markets = await okxClient.getTickers("SWAP");
  const symbols = markets.map((market) => market.instId);

  const chunks = createChunks(symbols, 10);

  async function runChunks() {
    logger.info("Running chunks");
    for (const chunk of chunks) {
      try {
        await Promise.all(chunk.map(processSymbol));
        logger.info(`Successfully updated ${chunk.length} symbols`);
      } catch (e) {
        logger.error(e);
        await sleep(1000 * 35);
      } finally {
        await sleep(800);
      }
    }

    runChunks();
  }

  runChunks();
}

main();
