"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToWebhook = void 0;
const discord_js_1 = require("discord.js");
const webhook = new discord_js_1.WebhookClient({
    url: 'https://discord.com/api/webhooks/1028221196782809179/wD_3iAnPlQ0SijG9gEUwX4ViYHHb6xOWWKhM4B9z8kGF3ZY5HlyiKPbe4qIfsgWPiGmv',
});
const sendToWebhook = async (message) => {
    await webhook.send(message);
};
exports.sendToWebhook = sendToWebhook;
//# sourceMappingURL=index.js.map