import { SELF } from "cloudflare:test";
import { expect, it } from "vite-plus/test";

it("воркер отвечает 404 на запросы без файла в ассетах", async () => {
	const response = await SELF.fetch("https://example.com/api/unknown");
	expect(response.status).toBe(404);
});
