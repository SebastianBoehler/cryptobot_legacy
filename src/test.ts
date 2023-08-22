import { generateIndicators } from "./generateIndicators";
import { logger, sleep } from "./utils";

async function main() {
  const indicator = new generateIndicators("okx", "BTC-USDT-SWAP", 15);
  await indicator.loadHistoricCandles();

  while (true) {
    const { ema_8, candle } = await indicator.getIndicators(
      new Date().getTime()
    );
    logger.info({ ema_8, start: candle.start });

    await sleep(1000 * 60);
  }
}

main();
