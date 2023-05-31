import { addMinutes } from "date-fns";
import { generateIndicators } from "../generateIndicators";
import CryptoJS from "node:crypto";
import { OkxClient } from "./utils";

const okxClient = new OkxClient();

const symbol = "COMP-USDT-SWAP";
okxClient.subscribeToPriceData(symbol);
//okxClient.subscribeToPositionData(symbol);
//okxClient.subsribeToOderData(symbol);

async function test() {
  const start = new Date("2023-03-03T08:00:00.090+00:00");
  const indicators = await new generateIndicators("okx", "MANA-USDT-SWAP", 25);

  for (let i = 1; i < 10_000; i++) {
    const data = await indicators.getIndicators(
      new Date(addMinutes(start, i)).getTime()
    );
    console.log(JSON.stringify(data, null, 2));
  }

  for (let a = 1; a < 10_000; a++) {
    const data = await indicators.getIndicators(
      new Date(addMinutes(start, 10_000)).getTime()
    );
    const hash = CryptoJS.createHmac("SHA256", JSON.stringify(data)).digest(
      "hex"
    );
    console.log(hash);
  }
}

test();
