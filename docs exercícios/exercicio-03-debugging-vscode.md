# Exercício 3 - Debugging no VS Code com launch.json e ts-node

## Objetivo
Configurar o debugger do VS Code para rodar TypeScript via ts-node e encontrar, com breakpoints, por que `buildInstallments` não criava a quantidade correta de parcelas.

---

## Preparação

### Dependências instaladas
```bash
npm install --save-dev typescript ts-node @types/node
```

### Arquivo `.vscode/launch.json`
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug TypeScript",
      "cwd": "${workspaceFolder}",
      "runtimeArgs": ["-r", "ts-node/register"],
      "args": ["${workspaceFolder}/src/exercicio-03-installments.ts"],
      "console": "integratedTerminal",
      "sourceMaps": true
    }
  ]
}
```

**Explicação:**
- `runtimeArgs: ["-r", "ts-node/register"]` → o Node carrega o ts-node **antes** de executar, permitindo rodar `.ts` direto
- `args` → aponta o arquivo TypeScript a ser depurado
- `sourceMaps: true` → mapeia o JS compilado de volta para o TypeScript original (permite breakpoint na linha `.ts`)

### Como usar
1. Abrir o arquivo no VS Code
2. Colocar breakpoint (clique na margem esquerda) na linha `installments.push(installmentValue);`
3. Apertar `F5` (ou painel **Run and Debug**)
4. Depurar com **Step Over** (`F10`) para avançar iteração a iteração

---

## Código com Bug (original)

```typescript
function buildInstallments(total: number, quantity: number): number[] {
  const installmentValue = Number((total / quantity).toFixed(2));
  const installments: number[] = [];

  for (let number = 1; number < quantity; number++) {   // BUG
    installments.push(installmentValue);
  }

  return installments;
}
```

---

## Registro da Investigação

**Sintoma:** `buildInstallments(100, 3)` retornava `[33.33, 33.33]` (2 parcelas, esperado 3).

**Passos para reproduzir:** Executar `buildInstallments(100, 3)` e observar `result.length`.

**Resultado esperado:** 3 parcelas de 33.33 somando 100.
**Resultado obtido:** `[33.33, 33.33]`, `result.length = 2`, soma 66.66.

**Hipótese:** A condição do loop executa uma vez a menos que o necessário.

**Ferramenta utilizada:** Breakpoint dentro do `for` + painel **Variables/Watch** do VS Code.

**Evidências (valores observados em 2 iterações):**

| Iteração | number | quantity | installmentValue | installments |
|----------|--------|----------|------------------|--------------|
| 1ª | 1 | 3 | 33.33 | `[33.33]` |
| 2ª | 2 | 3 | 33.33 | `[33.33, 33.33]` |

**Watch adicionado:** `installments.length` → `2` (esperado `3`).

**Causa encontrada:** O loop inicia em `number = 1` e a condição é `number < quantity`. Para `quantity = 3`, as iterações são `number = 1` e `number = 2` (2 vezes). A 3ª parcela nunca é adicionada porque quando `number` chega a 3 a condição `3 < 3` é falsa. Ou seja, `quantity - 1` parcelas são criadas.

---

## Correção Aplicada

```typescript
function buildInstallments(total: number, quantity: number): number[] {
  if (quantity <= 0) {
    return [];
  }

  const installmentValue = Number((total / quantity).toFixed(2));
  const installments: number[] = [];

  // CORREÇÃO 1: < quantity → <= quantity (executa EXATAMENTE quantity vezes)
  for (let number = 1; number <= quantity; number++) {
    installments.push(installmentValue);
  }

  // CORREÇÃO 2 (desafio): regra monetária - última parcela absorve a diferença
  const installmentsSum = installments.reduce((acc, value) => acc + value, 0);
  const difference = Number((total - installmentsSum).toFixed(2));

  if (difference !== 0) {
    installments[installments.length - 1] =
      Number((installments[installments.length - 1] + difference).toFixed(2));
  }

  return installments;
}
```

---

## Por que o arredondamento monetário merece uma regra própria?

`33.33 × 3 = 99.99`, mas o total é 100. O `toFixed(2)` de cada parcela gera **1 centavo perdido** na soma.
Sem uma regra, o cliente pagaria 99.99 em vez de 100.00, e o sistema de compras ficaria "quebrado em centavos" persistentemente.
A regra adotada: **a última parcela recebe a diferença** (`100 - 99.99 = 0.01 → 33.34`).

---

## Resultados Após a Correção (2+ testes)

| Chamada | Parcelas | Quantidade | Soma |
|---------|----------|------------|------|
| `buildInstallments(100, 3)` | `[33.33, 33.33, 33.34]` | 3 | 100 ✅ |
| `buildInstallments(100, 1)` | `[100]` | 1 | 100 ✅ |
| `buildInstallments(100, 6)` | `[16.67 ×5, 16.65]` | 6 | 100 ✅ |
| `buildInstallments(999.99, 3)` | `[333.33, 333.33, 333.33]` | 3 | 999.99 ✅ |
| `buildInstallments(50, 4)` | `[12.5 ×4]` | 4 | 50 ✅ |

---

## Perguntas Obrigatórias Respondidas

**Qual a diferença entre Step Into, Step Over e Step Out?**
- **Step Over (F10)** → executa a linha atual sem entrar em funções chamadas (avança para a próxima linha do mesmo arquivo)
- **Step Into (F11)** → entra DENTRO da função chamada na linha atual (útil para inspecionar o interior)
- **Step Out (Shift+F11)** → sai da função atual e volta para quem a chamou

**Para que serve o painel Watch?**
Ele **fixa expressões** para acompanhar continuamente, mesmo que não estejam na linha atual. Adicionamos `installments.length` e vimos o array crescendo a cada iteração.

**O que aparece na Call Stack durante esse exercício?**
A pilha de chamadas: `buildInstallments(100, 3)` chamado pelo código de entrada (entry point), que foi executado via ts-node. Mostra a cadeia `calculate → Module.compiler → node` — prova de que a execução veio do arquivo `.ts` registrado.

**Qual a vantagem do breakpoint sobre vários console.log?**
- Não polui o código com logs temporários (que precisam ser removidos depois)
- Permite **pausar o tempo** e inspecionar TODAS as variáveis do escopo de uma vez
- Dá para acompanhar a evolução dos valores **sem reexecutar** a cada println
- O Watch mostra valores ao vivo sem modificar o fonte

---

## Validações
```bash
npx tsc --noEmit   # ✅ sem erros
npx eslint src     # ✅ sem warnings
```

---

## Aprendizados
- `ts-node/register` no `runtimeArgs` do launch.json habilita depuração de `.ts`
- Off-by-one em loop: para criar exatamente `N` itens com início em 1, use `<= N`
- Arredondamento por parcela acumula erro nos centavos → última parcela absorve
- Breakpoint > console.log: inspeciona escopo inteiro sem alterar o código