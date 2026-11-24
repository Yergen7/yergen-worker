import { SELF } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => vi.restoreAllMocks());

const forecast = { current: { temperature_2m: 1 }, daily: { time: [] } };
const rates = {
	result: "success",
	time_last_update_utc: "now",
	rates: { RUB: 100, EUR: 0.5, KZT: 500 },
};

it("воркер отвечает 404 на запросы без файла в ассетах", async () => {
	const response = await SELF.fetch("https://example.com/api/unknown");
	expect(response.status).toBe(404);
});

it("/api/summary проверяет координаты", async () => {
	for (const q of ["", "?lat=abc&lon=1", "?lat=91&lon=1", "?lat=1&lon=181", "?lat=1"]) {
		const response = await SELF.fetch(`https://example.com/api/summary${q}`);
		expect(response.status, q).toBe(400);
	}
});

it("/api/summary запрашивает погоду и курсы одновременно (Promise.all)", async () => {
	const started: string[] = [];
	const release: (() => void)[] = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const host = new URL(typeof input === "string" ? input : (input as Request).url).host;
		started.push(host);
		// Ни один из ответов не вернётся, пока не начаты оба запроса.
		await new Promise<void>((resolve) => {
			release.push(resolve);
			if (release.length === 2) release.forEach((r) => r());
		});
		return Response.json(host.startsWith("api.open-meteo") ? forecast : rates);
	});

	const response = await SELF.fetch("https://example.com/api/summary?lat=55.75&lon=37.62");
	expect(response.status).toBe(200);
	expect(started.sort()).toEqual(["api.open-meteo.com", "open.er-api.com"]);
	expect(await response.json()).toEqual({
		weather: forecast,
		rates: { usdRub: 100, eurRub: 200, usdKzt: 500, updated: "now" },
	});
});

it("/api/summary отвечает 502, если один из источников недоступен", async () => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const host = new URL(typeof input === "string" ? input : (input as Request).url).host;
		return host === "open.er-api.com"
			? new Response("fail", { status: 500 })
			: Response.json(forecast);
	});
	const response = await SELF.fetch("https://example.com/api/summary?lat=1&lon=1");
	expect(response.status).toBe(502);
});
