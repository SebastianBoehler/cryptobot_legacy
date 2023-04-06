export interface GeneratedCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime?: Date;
}

export interface GetBacktestOptions {
  _ids?: string[];
  testedAfter?: string;
  rule?: string;
  minProfit?: number;
}
