// Статика (SPA) отдаётся ассетами Workers; этот обработчик получает только запросы,
// для которых нет файла и которые не являются навигацией браузера.
export default {
	fetch() {
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler;
