type Place = { name: string; admin?: string; country?: string; lat: number; lon: number };

type Forecast = {
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

const app = document.getElementById("app")!;
const FAV_KEY = "weather:favorites";
const DEFAULT_PLACES: Place[] = [
	{ name: "Москва", country: "Россия", lat: 55.7558, lon: 37.6173 },
	{ name: "Астана", country: "Казахстан", lat: 51.1801, lon: 71.446 },
	{ name: "Лондон", country: "Великобритания", lat: 51.5072, lon: -0.1276 },
	{ name: "Токио", country: "Япония", lat: 35.6762, lon: 139.6503 },
];

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function describe(code: number, isDay = 1): { icon: string; text: string } {
	if (code === 0) return { icon: isDay ? "☀️" : "🌙", text: "Ясно" };
	if (code === 1 || code === 2) return { icon: isDay ? "🌤️" : "☁️", text: "Малооблачно" };
	if (code === 3) return { icon: "☁️", text: "Пасмурно" };
	if (code === 45 || code === 48) return { icon: "🌫️", text: "Туман" };
	if (code >= 51 && code <= 57) return { icon: "🌦️", text: "Морось" };
	if (code >= 61 && code <= 67) return { icon: "🌧️", text: "Дождь" };
	if (code >= 71 && code <= 77) return { icon: "🌨️", text: "Снег" };
	if (code >= 80 && code <= 82) return { icon: "🌧️", text: "Ливень" };
	if (code === 85 || code === 86) return { icon: "🌨️", text: "Снегопад" };
	if (code >= 95) return { icon: "⛈️", text: "Гроза" };
	return { icon: "🌡️", text: "—" };
}

function loadFavorites(): Place[] {
	try {
		const raw = localStorage.getItem(FAV_KEY);
		return raw ? (JSON.parse(raw) as Place[]) : [];
	} catch {
		return [];
	}
}

function saveFavorites(list: Place[]) {
	try {
		localStorage.setItem(FAV_KEY, JSON.stringify(list));
	} catch {
		/* хранилище недоступно */
	}
}

const sameSpot = (a: Place, b: Place) =>
	Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;

function placeHref(p: Place) {
	return `/place/${p.lat.toFixed(4)}/${p.lon.toFixed(4)}?${new URLSearchParams({ name: p.name, ...(p.country ? { country: p.country } : {}) })}`;
}

async function searchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
	const url = `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: query, count: "6", language: "ru" })}`;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error("Не удалось выполнить поиск");
	const data = (await res.json()) as {
		results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[];
	};
	return (data.results ?? []).map((r) => ({
		name: r.name,
		admin: r.admin1,
		country: r.country,
		lat: r.latitude,
		lon: r.longitude,
	}));
}

async function fetchForecast(p: Place): Promise<Forecast> {
	const params = new URLSearchParams({
		latitude: String(p.lat),
		longitude: String(p.lon),
		current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
		daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
		timezone: "auto",
		forecast_days: "7",
		wind_speed_unit: "ms",
	});
	const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
	if (!res.ok) throw new Error("Не удалось получить прогноз");
	return (await res.json()) as Forecast;
}

function shell(inner: string) {
	app.innerHTML = `
		<div class="wrap">
			<header class="top"><a href="/" data-link>⛅ Погода</a></header>
			<div class="search">
				<input id="q" type="search" placeholder="Найти город…" autocomplete="off" aria-label="Поиск города" />
				<ul class="results" id="results"></ul>
			</div>
			${inner}
		</div>`;
	bindSearch();
}

function bindSearch() {
	const input = document.getElementById("q") as HTMLInputElement;
	const results = document.getElementById("results")!;
	let timer: number | undefined;
	let ctrl: AbortController | undefined;

	input.addEventListener("input", () => {
		window.clearTimeout(timer);
		ctrl?.abort();
		const q = input.value.trim();
		if (q.length < 2) {
			results.innerHTML = "";
			return;
		}
		timer = window.setTimeout(async () => {
			ctrl = new AbortController();
			try {
				const places = await searchPlaces(q, ctrl.signal);
				results.innerHTML = places.length
					? places
							.map(
								(p) =>
									`<li><a href="${esc(placeHref(p))}" data-link>${esc(p.name)} <small>${esc([p.admin, p.country].filter(Boolean).join(", "))}</small></a></li>`,
							)
							.join("")
					: `<li><a href="#" onclick="return false">Ничего не найдено</a></li>`;
			} catch (e) {
				if ((e as Error).name !== "AbortError") results.innerHTML = `<li><a href="#" onclick="return false">Ошибка поиска</a></li>`;
			}
		}, 300);
	});
}

function renderHome() {
	document.title = "Погода";
	const favs = loadFavorites();
	const chips = (list: Place[]) =>
		`<div class="chips">${list.map((p) => `<a class="chip" href="${esc(placeHref(p))}" data-link>${esc(p.name)}</a>`).join("")}</div>`;
	shell(`
		${favs.length ? `<div class="card"><h2>Избранное</h2>${chips(favs)}</div>` : ""}
		<div class="card"><h2>Популярные города</h2>${chips(DEFAULT_PLACES)}</div>`);
}

async function renderPlace(place: Place) {
	document.title = `Погода — ${place.name}`;
	shell(`<div class="card muted">Загрузка…</div>`);
	const slot = app.querySelector(".wrap")!.lastElementChild as HTMLElement;
	try {
		const f = await fetchForecast(place);
		const cur = describe(f.current.weather_code, f.current.is_day);
		const isFav = loadFavorites().some((p) => sameSpot(p, place));
		const fmt = new Intl.DateTimeFormat("ru", { weekday: "short", day: "numeric", month: "short" });
		const days = f.daily.time
			.map((t, i) => {
				const d = describe(f.daily.weather_code[i]);
				const rain = f.daily.precipitation_probability_max[i];
				return `<li>
					<span>${esc(fmt.format(new Date(t + "T12:00")))}</span>
					<span title="${esc(d.text)}">${d.icon}</span>
					<span class="muted rain">${rain == null ? "" : `💧 ${rain}%`}</span>
					<span class="range">${Math.round(f.daily.temperature_2m_max[i])}° / <span class="muted">${Math.round(f.daily.temperature_2m_min[i])}°</span></span>
				</li>`;
			})
			.join("");
		slot.outerHTML = `
			<div class="card">
				<div class="now">
					<div>
						<h1>${esc(place.name)}</h1>
						<div class="muted">${esc([place.admin, place.country].filter(Boolean).join(", "))}</div>
						<div class="temp">${Math.round(f.current.temperature_2m)}°C</div>
						<div>${esc(cur.text)}</div>
					</div>
					<div class="icon" aria-hidden="true">${cur.icon}</div>
				</div>
				<div class="stats">
					<div><span>Ощущается как</span>${Math.round(f.current.apparent_temperature)}°C</div>
					<div><span>Влажность</span>${f.current.relative_humidity_2m}%</div>
					<div><span>Ветер</span>${f.current.wind_speed_10m} м/с</div>
				</div>
				<p><button class="fav" id="fav">${isFav ? "★ В избранном" : "☆ В избранное"}</button></p>
			</div>
			<div class="card"><h2>Прогноз на 7 дней</h2><ul class="days">${days}</ul></div>
			<p class="muted">Данные: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></p>`;
		document.getElementById("fav")!.addEventListener("click", () => {
			const list = loadFavorites();
			const idx = list.findIndex((p) => sameSpot(p, place));
			if (idx >= 0) list.splice(idx, 1);
			else list.push(place);
			saveFavorites(list);
			document.getElementById("fav")!.textContent = idx >= 0 ? "☆ В избранное" : "★ В избранном";
		});
	} catch (e) {
		slot.outerHTML = `<div class="card error">${esc((e as Error).message)}</div>`;
	}
}

function route() {
	const url = new URL(location.href);
	const m = url.pathname.match(/^\/place\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/?$/);
	if (m) {
		const lat = Number(m[1]);
		const lon = Number(m[2]);
		if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
			void renderPlace({
				name: url.searchParams.get("name") ?? "Выбранное место",
				country: url.searchParams.get("country") ?? undefined,
				lat,
				lon,
			});
			return;
		}
	}
	renderHome();
}

document.addEventListener("click", (e) => {
	const a = (e.target as Element).closest<HTMLAnchorElement>("a[data-link]");
	if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
	e.preventDefault();
	history.pushState(null, "", a.getAttribute("href")!);
	route();
});
window.addEventListener("popstate", route);
route();
