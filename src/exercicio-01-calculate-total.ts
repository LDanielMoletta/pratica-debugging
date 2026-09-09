// exercicio-01-calculate-total.ts
// VERSÃO CORRIGIDA após investigação com console.log, console.trace e console.trace
// Logs temporários removidos conforme regra da lista de exercícios

// Correções aplicadas (justificadas pelas evidências da investigação):
// 1. index < prices.length (era <=) → evita ler prices[index] === undefined e NaN
// 2. subtotal >= 100 (era >) → desconto se aplica a compras de EXATAMENTE R$ 100,00
// 3. subtotal * 0.9 (era * 0.1) → retorna o total COM 10% de desconto, não o valor do desconto

function calculateTotal(prices: number[]): number {
  let subtotal = 0;

  for (let index = 0; index < prices.length; index++) {
    subtotal += prices[index];
  }

  if (subtotal >= 100) {
    // Desconto de 10% → subtotal * 0.9 (paga 90% do valor)
    return subtotal * 0.9;
  }

  return subtotal;
}

// Cenários mínimos exigidos (abaixo, no limite, acima do limite e lista vazia)
console.log("=== [20, 30] abaixo do limite (esperado 50) ===");
console.log("Resultado:", calculateTotal([20, 30]));

console.log("\n=== [40, 60] exatamente no limite (esperado 90 = 100 * 0.9) ===");
console.log("Resultado:", calculateTotal([40, 60]));

console.log("\n=== [80, 40] acima do limite (esperado 108 = 120 * 0.9) ===");
console.log("Resultado:", calculateTotal([80, 40]));

console.log("\n=== [] lista vazia (esperado 0) ===");
console.log("Resultado:", calculateTotal([]));