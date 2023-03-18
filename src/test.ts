import { getUnixTime } from "date-fns";
import { CoinbaseAdvanced } from "./coinbase/utils";
import config from "./config/config";

const coinbase = new CoinbaseAdvanced(config.CB_API_KEY);

async function test() {
  const candles = await coinbase.getKlines({
    symbol: "BTC-USD",
    interval: "ONE_MINUTE",
    startTime: getUnixTime(Date.now() - 1000 * 60 * 299),
    endTime: getUnixTime(Date.now()),
  });

  console.log(candles.length);
}

test();
