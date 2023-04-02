"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv = __importStar(require("dotenv"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const crypto_1 = require("crypto");
dotenv.config({
    path: `${process.env.NODE_ENV?.split(" ").join("")}.env`,
});
const server = (0, express_1.default)();
const port = process.env.PORT || 3001;
const routes_1 = __importDefault(require("./mongodb/routes"));
const utils_1 = require("./utils");
const config_1 = __importDefault(require("./config/config"));
server.use((0, cors_1.default)());
server.use(express_1.default.json());
const middleware = async (req, res, next) => {
    const IP = req.ip || req.connection.remoteAddress;
    //logger.http(`Received ${req.method} request for ${req.url} from ${IP}`);
    const whitelist = config_1.default.API_WHITELIST || [];
    const isWhitelisted = IP
        ? whitelist.includes(IP?.replace("::ffff:", ""))
        : false;
    const secret = config_1.default.API_SECRET || "";
    const hash = (0, crypto_1.createHmac)("sha256", secret).update(req.path).digest("hex");
    //server side auth
    if (req.headers["hb-capital-auth"] !== hash && !isWhitelisted) {
        utils_1.logger.warn(`Unauthorized request from ${IP}`);
        res.status(401).send("Unauthorized");
        return;
    }
    const cacheInSeconds = 30;
    res.set("Cache-control", `public, max-age=${cacheInSeconds}`);
    next();
};
server.use(middleware);
server.use("/mongodb", routes_1.default);
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
server.use(limiter);
server.get("*", (_req, res) => {
    res.status(404).send({
        message: "Not found",
    });
});
server.post("*", (_req, res) => {
    res.status(404).send({
        message: "Not found",
    });
});
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
//# sourceMappingURL=server.js.map