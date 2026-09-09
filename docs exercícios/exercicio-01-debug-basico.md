# Exercício 1 - Debug Básico com console.log e console.trace

## Objetivo
Encontrar e corrigir falhas de lógica em `calculateTotal` usando `console.log` para observar variáveis e `console.trace` para rastrear o primeiro valor inesperado.

---

## Código Original (com falhas intencionais)

```typescript
function calculateTotal(prices: number[]): number {
  let subtotal = 0;
  for (let index = 0; index <= prices.length; index++) {   // BUG 1
    subtotal += prices[index];
  }
  if (subtotal > 100) {                                     // BUG 3
    return subtotal * 0.1;                                  // BUG 2
  }
  return subtotal;
}
```

---

## Registro da Investigação

**Sintoma:** A função retornava `NaN` em todos os cenários e valores incorretos quando não quebrava.

**Passos para reproduzir:**
1. Executar `calculateTotal([20, 30])` → retornou `NaN`
2. Executar `calculateTotal([])` → retornou `NaN`

**Resultado esperado:** Soma dos preços com 10% de desconto quando subtotal ≥ R$ 100,00.

**Resultado obtido:**
```
[20, 30]  → NaN
[40, 60]  → NaN
[80, 40]  → NaN
[]        → NaN
```

**Hipótese:** O loop acessa uma posição inexistente do array, somando `undefined` e contaminando o subtotal com `NaN`.

**Ferramenta utilizada:** `console.log` dentro do loop + `console.trace` no primeiro valor inesperado.

**Evidência encontrada (console.log):**
```
index: 0 | prices[index]: 20  | subtotal antes: 0
index: 1 | prices[index]: 30  | subtotal antes: 20
index: 2 | prices[index]: undefined | subtotal antes: 50   ← BUG 1
```

O último índice válido de um array com 2 itens é `1`, mas `index <= prices.length` permite `index = 2`. Acessar `prices[2]` retorna `undefined`, e `subtotal += undefined` produz `NaN`.

**Evidência encontrada (console.trace):**
```
Trace: [DEBUG] undefined detectado em index 2
    at calculateTotal (...exercicio-01-calculate-total.ts:14:15)
```
Confirmou que o `undefined` vinha do acesso fora dos limites, executado no loop da função.

---

## Erros Identificados (3 bugs)

| # | Local | Erro | Exemplo |
|---|-------|------|---------|
| 1 | Condição do loop | `index <= prices.length` acessa posição inexistente → `undefined` → `NaN` | `prices[2]` num array de 2 itens |
| 2 | Cálculo do desconto | `subtotal * 0.1` retorna só o **valor** do desconto (10% de 120 = 12) | Para 120 deveria retornar 108 |
| 3 | Limite do desconto | `subtotal > 100` exclui exatamente R$ 100,00 | Para 100 o desconto NÃO era aplicado |

---

## Correção Aplicada

```typescript
function calculateTotal(prices: number[]): number {
  let subtotal = 0;

  // CORREÇÃO 1: index < prices.length → nunca acessa posição inexistente
  for (let index = 0; index < prices.length; index++) {
    subtotal += prices[index];
  }

  // CORREÇÃO 3: >= 100 → desconto também em compras de exatamente R$ 100,00
  if (subtotal >= 100) {
    // CORREÇÃO 2: * 0.9 → retorna o total COM 10% de desconto (paga 90%)
    return subtotal * 0.9;
  }

  return subtotal;
}
```

---

## Verificação (4 cenários mínimos)

| Entrada | Subtotal | Esperado | Obtido | Status |
|---------|----------|----------|--------|--------|
| `[20, 30]` | 50 | 50 | 50 | ✅ |
| `[40, 60]` | 100 | 100 × 0.9 = 90 | 90 | ✅ |
| `[80, 40]` | 120 | 120 × 0.9 = 108 | 108 | ✅ |
| `[]` | 0 | 0 | 0 | ✅ |

Todos os logs temporários `[DEBUG]` foram **removidos** após a investigação (regra da lista).

---

## Aprendizados
- `prices.length` é a quantidade de itens; o último índice válido é `length - 1`
- Somar `undefined` propaga `NaN` silenciosamente
- O desconto (10%) é o valor **retirado**; o total com desconto é `total * 0.9`
- A condição "igual ou superior a" usa `>=`, não `>`
- `console.trace` mostra de onde a função foi chamada (stack trace) na hora exata do problema