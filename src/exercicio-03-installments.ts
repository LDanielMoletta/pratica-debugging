// exercicio-03-installments.ts
// VERSÃO CORRIGIDA após depuração com breakpoints
// (launch.json já configurado em .vscode/launch.json)

// INVESTIGAÇÃO COM BREAKPOINT (evidências registradas no docs):
// Breakpoint dentro do for permite inspecionar no painel VARIABLES:
// - Iteração 1: number=1, quantity=3, installmentValue=33.33, installments=[33.33]
// - Iteração 2: number=2, quantity=3, installmentValue=33.33, installments=[33.33, 33.33]
// - Condição number < 3 termina ao atingir number=3 → NUNCA identifica a 3ª parcela
// Watch: installments.length mostra 2 (esperado 3)

// BUG 1: 'number < quantity' → cria quantity - 1 parcelas
// Correção: 'number < quantity' com início em 0, ou 'number <= quantity' com início em 1
// Usamos início em 1 com '<= quantity' para manter 1-based igual ao original.

// BUG 2 (desafio adicional): 33.33 * 3 = 99.99 ≠ 100
// Regra monetária: a última parcela absorve a diferença de arredondamento.
// Remaining = total - soma das parcelas (0.01) → soma-se à última.

function buildInstallments(total: number, quantity: number): number[] {
  if (quantity <= 0) {
    return [];
  }

  const installmentValue = Number((total / quantity).toFixed(2));
  const installments: number[] = [];

  // CORREÇÃO 1: executa EXATAMENTE 'quantity' vezes (era quantity - 1)
  for (let number = 1; number <= quantity; number++) {
    installments.push(installmentValue);
  }

  // CORREÇÃO 2 (regra monetária): ajusta a última parcela com a diferença
  // soma até aqui = 99.99; total = 100 → lastParcel += (100 - 99.99) = 100.00
  const installmentsSum = installments.reduce((acc, value) => acc + value, 0);
  const difference = Number((total - installmentsSum).toFixed(2));

  if (difference !== 0) {
    installments[installments.length - 1] =
      Number((installments[installments.length - 1] + difference).toFixed(2));
  }

  return installments;
}

// ============ TESTES APÓS A CORREÇÃO ============

function showTest(total: number, quantity: number): void {
  const result = buildInstallments(total, quantity);
  const sum = Number(result.reduce((acc, value) => acc + value, 0).toFixed(2));
  console.log(
    `buildInstallments(${total}, ${quantity}) → parcelas: [${result.join(", ")}] | ` +
    `quantidade: ${result.length} | soma: ${sum}`
  );
}

console.log("=== Testes após a correção ===\n");

// Cenários do exercício
showTest(100, 3);       // deve criar 3 parcelas somando 100
showTest(100, 1);       // 1 parcela
showTest(100, 6);       // 6 parcelas somando 100 (16.67 * 6 = 100.02 → ajuste)
showTest(999.99, 3);    // soma exata com centavos
showTest(50, 4);        // 12.50 * 4 = 50 (sem arredondamento)