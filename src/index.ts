// Статика (SPA) отдаётся ассетами Workers. Воркер получает только запросы без файла
// в ассетах и не являющиеся навигацией браузера — например, запросы к /api/*.

export type Forecast = {
	current: {
		temperature_2m: number;
		apparent_temperature: number;
		relative_humidity_2m: number;
		wind_speed_10m: number;
		weather_code: number;
		is_day: number;
	};
	daily: {
		time: string[];
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		precipitation_probability_max: (number | null)[];
	};
};

export type Rates = {
	/** 1 USD в рублях */
	usdRub: number;
	/** 1 EUR в рублях */
	eurRub: number;
	/** 1 USD в тенге */
	usdKzt: number;
	updated: string;
};

export type Summary = { weather: Forecast; rates: Rates };

async function getJson<T>(url: string, ttl: number): Promise<T> {
	const res = await fetch(url, { cf: { cacheEverything: true, cacheTtl: ttl } });
	if (!res.ok) throw new Error(`${new URL(url).host}: ${res.status}`);
	return (await res.json()) as T;
}

function getWeather(lat: number, lon: number): Promise<Forecast> {
	const params = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lon),
		current:
			"temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
		daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
		timezone: "auto",
		forecast_days: "7",
		wind_speed_unit: "ms",
	});
	return getJson<Forecast>(`https://api.open-meteo.com/v1/forecast?${params}`, 600);
}

async function getRates(): Promise<Rates> {
	const data = await getJson<{
		result: string;
		time_last_update_utc: string;
		rates: Record<string, number>;
	}>("https://open.er-api.com/v6/latest/USD", 3600);
	const { RUB, EUR, KZT } = data.rates;
	if (data.result !== "success" || !RUB || !EUR || !KZT)
		throw new Error("open.er-api.com: неожиданный ответ");
	return { usdRub: RUB, eurRub: RUB / EUR, usdKzt: KZT, updated: data.time_last_update_utc };
}

function parseCoord(value: string | null, max: number): number | null {
	if (value === null || value.trim() === "") return null;
	const n = Number(value);
	return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

async function handleSummary(url: URL): Promise<Response> {
	const lat = parseCoord(url.searchParams.get("lat"), 90);
	const lon = parseCoord(url.searchParams.get("lon"), 180);
	if (lat === null || lon === null) {
		return Response.json(
			{ error: "Нужны параметры lat (−90…90) и lon (−180…180)" },
			{ status: 400 },
		);
	}
	try {
		// Погода и курсы запрашиваются одновременно, а не по очереди.
		const [weather, rates] = await Promise.all([getWeather(lat, lon), getRates()]);
		return Response.json({ weather, rates } satisfies Summary, {
			headers: { "Cache-Control": "public, max-age=300" },
		});
	} catch (e) {
		return Response.json(
			{ error: `Не удалось получить данные: ${(e as Error).message}` },
			{ status: 502 },
		);
	}
}

export default {
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/api/summary" && request.method === "GET") return handleSummary(url);
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler;
