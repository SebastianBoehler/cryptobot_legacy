import express, { Express, Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { createHmac } from "crypto";

dotenv.config({
  path: `${process.env.NODE_ENV?.split(" ").join("")}.env`,
});

const server: Express = express();
const port = process.env.PORT || 3001;

import mongoRoutes from "./mongodb/routes";
import { logger } from "./utils";
import config from "./config/config";

server.use(cors());
server.use(express.json());

const middleware = async (req: Request, res: Response, next: any) => {
  const IP = req.ip || req.connection.remoteAddress;
  //logger.http(`Received ${req.method} request for ${req.url} from ${IP}`);

  const whitelist = config.API_WHITELIST || [];
  const isWhitelisted = IP
    ? whitelist.includes(IP?.replace("::ffff:", ""))
    : false;

  const secret = config.API_SECRET || "";
  const hash = createHmac("sha256", secret).update(req.path).digest("hex");

  //server side auth
  if (req.headers["hb-capital-auth"] !== hash && !isWhitelisted) {
    logger.warn(`Unauthorized request from ${IP}`);
    res.status(401).send("Unauthorized");
    return;
  }

  const cacheInSeconds = 30;
  res.set("Cache-control", `public, max-age=${cacheInSeconds}`);
  next();
};

server.use(middleware);

server.use("/mongodb", mongoRoutes);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

server.use(limiter);

server.get("*", (_req: Request, res: Response) => {
  res.status(404).send({
    message: "Not found",
  });
});

server.post("*", (_req: Request, res: Response) => {
  res.status(404).send({
    message: "Not found",
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
