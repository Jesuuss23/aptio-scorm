/** Montos en dólares como en el prototipo: US$ 58.20. */
export const usd = (n: number) => `US$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
