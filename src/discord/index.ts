import { WebhookClient } from 'discord.js';

const webhook = new WebhookClient({
    url: 'https://discord.com/api/webhooks/1028221196782809179/wD_3iAnPlQ0SijG9gEUwX4ViYHHb6xOWWKhM4B9z8kGF3ZY5HlyiKPbe4qIfsgWPiGmv',
});

export const sendToWebhook = async (message: string) => {
    await webhook.send(message);
}