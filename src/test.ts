import { addMinutes, subHours } from "date-fns";
import { generateIndicators } from "./generateIndicators";
import mongodb from "./mongodb";
import { logger } from "./utils";
const myMongo = new mongodb("dydx");

const exchange = "coinbase";
const symbol = "BTC-EUR";

async function test() {
  const indicatorGen = new generateIndicators(exchange, symbol, 60);

  const result = await myMongo.getStartAndEndDates(exchange, symbol);

  if (!result) return;
  const { end } = result;

  const start = subHours(end, 24 * 7);

  for (let i = 100; i < Infinity; i++) {
    const timestamp = addMinutes(start, i);
    if (timestamp.getTime() > end.getTime()) {
      logger.info(`End of data reached`);
      break;
    }
    const indicators = await indicatorGen.getIndicators(timestamp.getTime());
    logger.info(`Time: ${timestamp.toLocaleString()}`);
    logger.info(indicators);
  }
}

test();
