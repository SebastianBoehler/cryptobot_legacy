import express, { Request, Response } from "express";
const router = express.Router();
import mongo from "./index";
import { GenerateIndicators } from "../generateIndicators";
const client = new mongo("admin");

const FIVE_MIN = 60 * 5;
const ONE_DAY = 60 * 60 * 24;

router.get("/databases", async (req: Request, res: Response) => {
  const databases = await client.listDatabases();
  res.send(databases);
});

router.get("/collections/:database", async (req: Request, res: Response) => {
  const { database } = req.params;
  if (!database) {
    res.status(400).send("database query parameter is required");
    return;
  }
  const collections = await client.existingCollections(database);
  res.json(collections);
});

router.get(
  "/count/:database/:collection",
  async (req: Request, res: Response) => {
    const { database, collection } = req.params;
    if (!collection || !database) {
      res
        .status(400)
        .send("database and collection query parameter is required");
      return;
    }
    const count = await client.getCount(collection, database);
    res.json(count);
  }
);

router.get(
  "/timeframe/:database/:collection",
  async (req: Request, res: Response) => {
    const { database, collection } = req.params;
    if (!database) {
      res.status(400).send("database query parameter is required");
      return;
    }

    const result = await client.getStartAndEndDates(database, collection);
    res.set("Cache-control", `public, max-age=${FIVE_MIN}`);
    res.json(result);
  }
);

router.get(
  "/indicators/:exchange/:symbol/:granularity",
  async (req: Request, res: Response) => {
    const { exchange, symbol, granularity } = req.params;
    if (!exchange || !symbol || !granularity) {
      res
        .status(400)
        .send("exchange, symbol and granularity query parameter is required");
      return;
    }

    const indicator = new GenerateIndicators(exchange, symbol, +granularity);
    await indicator.loadHistoricCandles();
    const data = await indicator.getIndicatorsForWholeTimeframe();
    res.set("Cache-control", `public, max-age=${ONE_DAY}`);
    res.json({
      count: data.length,
      symbol,
      granularity,
      data,
    });
  }
);

router.post("/backtests/:exchange", async (req: Request, res: Response) => {
  const { exchange } = req.params;
  if (!exchange) {
    res.status(400).send("exchange query parameter is required");
    return;
  }

  const result = await client.getBacktests(
    exchange,
    req.body.filter,
    req.body.project
  );
  res.set("Cache-control", `public, max-age=${FIVE_MIN}`);
  res.json(result);
});

router.get(
  "/symbolsSortedByVol/:exchange",
  async (req: Request, res: Response) => {
    const { exchange } = req.params;
    if (!exchange) {
      res.status(400).send("exchange query parameter is required");
      return;
    }

    const result = await client.symbolsSortedByVolume(exchange, true);
    res.set("Cache-control", `public, max-age=${ONE_DAY}`);
    res.json(result);
  }
);

export default router;
