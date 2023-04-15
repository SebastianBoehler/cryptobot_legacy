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

export interface DatabaseType {
  start: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}
