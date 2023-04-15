"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const index_1 = __importDefault(require("./index"));
const client = new index_1.default("admin");
const cacheInSeconds = 60 * 5;
router.get("/databases", async (req, res) => {
    const databases = await client.listDatabases();
    res.send(databases);
});
router.get("/collections/:database", async (req, res) => {
    const { database } = req.params;
    if (!database) {
        res.status(400).send("database query parameter is required");
        return;
    }
    const collections = await client.existingCollections(database);
    res.json(collections);
});
router.get("/count/:database/:collection", async (req, res) => {
    const { database, collection } = req.params;
    if (!collection || !database) {
        res
            .status(400)
            .send("database and collection query parameter is required");
        return;
    }
    const count = await client.getCount(collection, database);
    res.json(count);
});
router.get("/timeframe/:database/:collection", async (req, res) => {
    const { database, collection } = req.params;
    if (!database) {
        res.status(400).send("database query parameter is required");
        return;
    }
    const result = await client.getStartAndEndDates(database, collection);
    res.set("Cache-control", `public, max-age=${cacheInSeconds}`);
    res.json(result);
});
router.post("/backtests/:exchange", async (req, res) => {
    const { exchange } = req.params;
    if (!exchange) {
        res.status(400).send("exchange query parameter is required");
        return;
    }
    const result = await client.getBacktests(exchange, req.body.filter, req.body.project);
    res.set("Cache-control", `public, max-age=${cacheInSeconds}`);
    res.json(result);
});
exports.default = router;
//# sourceMappingURL=routes.js.map