/**
 * Aritmetica de data em UTC sobre strings `YYYY-MM-DD`.
 *
 * Usa UTC de proposito: cotacao de cambio e um fato de calendario, nao um
 * instante. Usar horario local faria a data mudar conforme o fuso do
 * servidor self-hosted.
 */
export function shiftIsoDate(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split("-").map(Number);
	const base = Date.UTC(year, month - 1, day);
	const shifted = new Date(base + days * 24 * 60 * 60 * 1000);
	return shifted.toISOString().slice(0, 10);
}
