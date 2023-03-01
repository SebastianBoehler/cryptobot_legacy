import { timeKey as timeKeyBinance } from "../binance/utils";
import { timeKey as timeKeyCoinbase } from "../coinbase/utils";
import { timeKey as timeKeyDydx } from "../dydx/utils";

export function getTimeKey(database: string) {
  let _timeKey: TimeKey = "start";
  switch (database) {
    case "binance":
      _timeKey = timeKeyBinance;
      break;
    case "coinbase":
      _timeKey = timeKeyCoinbase;
      break;
    case "dydx":
      _timeKey = timeKeyDydx;
      break;
  }
  return _timeKey;
}

export type TimeKey = "start" | "openTime";
