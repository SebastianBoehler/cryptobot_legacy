export interface GeneratedCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime?: Date;
}

export interface GetBacktestOptions {
  testedAfter?: string;
  rule?: string;
  minProfit?: number;
}
