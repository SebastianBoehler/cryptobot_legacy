"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = __importDefault(require("./index"));
const sqlClient = new index_1.default('ftx');
(async () => {
    const tables = await sqlClient.getTablesInDatabase('ftx');
    console.log(`Tables: ${tables.length}`);
    const time = new Date();
    time.setDate(time.getDate() - 90);
    console.log(time.toLocaleString());
    let index = 0;
    for (const table of tables) {
        console.log(`Running on ${table} ${index}/${tables.length}`);
        index++;
        //move into modify.ts file
        await sqlClient.deleteRows(table, `WHERE time <= ${time.getTime()}`);
        await sqlClient.changeColumnType(table, 'time', 'VARCHAR(13) NOT NULL');
        await sqlClient.changeColumnType(table, 'open', 'VARCHAR(100)');
        await sqlClient.changeColumnType(table, 'close', 'VARCHAR(100)');
        await sqlClient.changeColumnType(table, 'price', 'VARCHAR(100)');
        await sqlClient.changeColumnType(table, 'high', 'VARCHAR(100)');
        await sqlClient.changeColumnType(table, 'low', 'VARCHAR(100)');
        await sqlClient.changeColumnType(table, 'ask', 'VARCHAR(100)')
            .catch(() => { });
        await sqlClient.changeColumnType(table, 'bid', 'VARCHAR(100)')
            .catch(() => { });
        await sqlClient.changeColumnType(table, 'volume', 'VARCHAR(150)');
        await sqlClient.createIndex(table, 'time')
            .catch(() => { });
    }
})();
//# sourceMappingURL=modify.js.map