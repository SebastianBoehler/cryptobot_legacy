export class AvgCandleSize {
  private length: number;
  private candleRanges: number[];

  constructor(length: number) {
    this.length = length;
    this.candleRanges = [];
  }

  // Add a new candle's high and low to calculate the range
  nextValue(high: number, low: number): number {
    const range = high - low;
    this.candleRanges.push(range);

    // Keep the array length within the specified length
    if (this.candleRanges.length > this.length) {
      this.candleRanges.shift(); // Remove the oldest value
    }

    return this.calculateAvgCandleRange();
  }

  // Calculate the average candle range
  private calculateAvgCandleRange(): number {
    if (this.candleRanges.length === 0) {
      return 0; // Return 0 if there is no data yet
    }

    const totalRange = this.candleRanges.reduce((acc, range) => acc + range, 0);
    return totalRange / this.candleRanges.length;
  }
}
