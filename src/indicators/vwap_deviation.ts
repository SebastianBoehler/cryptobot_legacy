export class VWAPDeviation {
  private ls: boolean;
  private type: "Average Deviation" | "Standard Deviation";
  private length: number;
  private source: number[] = [];
  private volume: number[] = [];
  private vwmean: number[] = [];
  private deviation: number[] = [];
  private upperDeviation2: number = 0;
  private upperDeviation3: number = 0;
  private lowerDeviation2: number = 0;
  private lowerDeviation3: number = 0;

  constructor(
    ls: boolean,
    type: "Average Deviation" | "Standard Deviation",
    length: number
  ) {
    this.ls = ls;
    this.type = type;
    this.length = length;
  }

  nextValue(
    closePrice: number,
    candleVolume: number
  ): {
    basis: number;
    upperDeviation2: number;
    upperDeviation3: number;
    lowerDeviation2: number;
    lowerDeviation3: number;
  } {
    this.source.push(closePrice);
    this.volume.push(candleVolume);

    const maxDataLength = 1000; // Set the maximum length for the arrays here

    if (this.source.length > maxDataLength) {
      this.source.splice(0, this.source.length - maxDataLength);
      this.volume.splice(0, this.volume.length - maxDataLength);
    }

    this.calculateVWAPMean();
    this.calculateVWAPDeviation();

    //return only latest value NOT full array of basis and deviations
    return {
      basis: this.vwmean[this.vwmean.length - 1],
      upperDeviation2: this.upperDeviation2,
      upperDeviation3: this.upperDeviation3,
      lowerDeviation2: this.lowerDeviation2,
      lowerDeviation3: this.lowerDeviation3,
    };
  }

  private pine_vwmean(x: number[], y: number[]): number {
    let d_sum = 0;
    let w_sum = 0;
    for (let i = 0; i < y.length; i++) {
      const cd = x[i];
      const cw = y[i];
      d_sum += cw * cd;
      w_sum += cw;
    }
    return d_sum / w_sum;
  }

  private pine_vwstdev(x: number[], y: number[], b: number): number {
    let d_sum = 0.0;
    let w_sum = 0.0;
    for (let i = 0; i < y.length; i++) {
      const cd = x[i];
      const cw = y[i];
      d_sum += cw * Math.pow(cd - b, 2);
      w_sum += cw;
    }
    return Math.sqrt(d_sum / w_sum);
  }

  private pine_vwavdev(x: number[], y: number[], b: number): number {
    let d_sum = 0.0;
    let w_sum = 0.0;
    for (let i = 0; i < y.length; i++) {
      const cd = x[i];
      const cw = y[i];
      d_sum += cw * Math.abs(cd - b);
      w_sum += cw;
    }
    return d_sum / w_sum;
  }

  private calculateVWAPMean(): void {
    const lastIndex = this.source.length - 1;
    if (lastIndex >= this.length - 1) {
      let vwprices = this.source.slice(
        lastIndex - this.length + 1,
        lastIndex + 1
      );
      const vwvolumes = this.volume.slice(
        lastIndex - this.length + 1,
        lastIndex + 1
      );

      // Apply log-space transformation if ls is true
      if (this.ls) {
        vwprices = vwprices.map((price) => Math.log(price));
      }

      const vwmean = this.pine_vwmean(vwprices, vwvolumes);
      this.vwmean.push(vwmean);
    }
  }

  private calculateVWAPDeviation(): void {
    const lastIndex = this.source.length - 1;
    if (lastIndex >= this.length - 1) {
      const vwmean = this.vwmean[this.vwmean.length - 1];

      let dev: number;
      if (this.type === "Standard Deviation") {
        const vwprices = this.source.slice(
          lastIndex - this.length + 1,
          lastIndex + 1
        );
        const vwvolumes = this.volume.slice(
          lastIndex - this.length + 1,
          lastIndex + 1
        );
        dev = this.pine_vwstdev(vwprices, vwvolumes, vwmean);
      } else {
        const vwprices = this.source.slice(
          lastIndex - this.length + 1,
          lastIndex + 1
        );
        const vwvolumes = this.volume.slice(
          lastIndex - this.length + 1,
          lastIndex + 1
        );

        if (vwprices.length === 1) {
          // If only one element in vwprices, set deviation to 0
          dev = 0;
        } else {
          dev = this.pine_vwavdev(vwprices, vwvolumes, vwmean);
        }
      }
      this.deviation.push(dev);

      // Calculate Upper and Lower Deviations (2nd and 3rd)
      const upperDeviation2 = vwmean + dev * 2;
      const upperDeviation3 = vwmean + dev * 3;
      const lowerDeviation2 = vwmean - dev * 2;
      const lowerDeviation3 = vwmean - dev * 3;

      this.upperDeviation2 = upperDeviation2;
      this.upperDeviation3 = upperDeviation3;
      this.lowerDeviation2 = lowerDeviation2;
      this.lowerDeviation3 = lowerDeviation3;
    }
  }
}
