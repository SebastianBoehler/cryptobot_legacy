export interface OHLCResponse {
  error: string[];
  result: {
    [key: string]: OHLCCandle[];
    //last: number;
  };
}

type OHLCCandle = [
  number, //time
  string, //open
  string, //high
  string, //low
  string, //close
  string, //vwap
  string, //volume
  number //count
];

export interface TradablePairsResponse {
  error: string[];
  result: {
    [key: string]: TradablePair;
  };
}

export interface TradablePair {
  altname: string;
  wsname: string;
  aclass_base: string;
  base: string;
  aclass_quote: string;
  quote: string;
  lot: string; //deprecated
  pair_decimals: number;
  cost_decimals: number;
  lot_decimals: number;
  lot_multiplier: number;
  leverage_buy: number[];
  leverage_sell: number[];
  fees: number[][];
  fees_maker: number[][];
  fee_volume_currency: string;
  margin_call: number;
  margin_stop: number;
  ordermin: string;
  costmin: string;
  tick_size: string;
  status: string;
  long_position_limit: number;
  short_position_limit: number;
}
