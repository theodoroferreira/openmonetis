/**
 * Formata um valor em moeda estrangeira no locale pt-BR.
 * Sempre em valor absoluto: quem exibe decide como mostrar o sinal.
 */
export function formatForeignCurrency(value: number, currency: string): string {
	try {
		return new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})
			.format(Math.abs(value))
			.replace(/[  ]/g, " ");
	} catch {
		return `${currency} ${Math.abs(value).toFixed(2).replace(".", ",")}`;
	}
}
