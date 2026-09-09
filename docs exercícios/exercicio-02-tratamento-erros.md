# Exercício 2 - Tratamento de Erros com try/catch e AppError

## Objetivo
Impedir resultados inválidos (Infinity, NaN) em uma divisão e diferenciar erros **esperados** (AppError) de erros **inesperados**, usando entrada tipada como `unknown`.

---

## Código Original (com falhas)

```typescript
interface DivisionInput {
  numerator: number;
  denominator: number;
}

function divide(input: DivisionInput): number {
  return input.numerator / input.denominator;   // sem validação
}

function execute(rawInput: unknown): void {
  // sem validação, sem try/catch
}
```

**Sintoma do código original:** `10 / 0` retorna `Infinity`, `0 / 0` retorna `NaN`, e `undefined` causava crash ao acessar `.numerator`.

---

## Por que divisão por zero NÃO lança exceção no JS?

Diferente de outras linguagens, JavaScript não lança erro ao dividir por zero. Ele retorna valores especiais:
- `10 / 0` → `Infinity`
- `0 / 0` → `NaN`

Por isso a validação **precisa ser feita manualmente**, e o resultado também precisa ser verificado com `Number.isFinite()`.

---

## Implementação

### 1. AppError (`src/errors/app-error.ts`)

```typescript
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);               // inicializa Error.message
    this.statusCode = statusCode;
    this.name = "AppError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}
```

**Decisões de design:**
- `readonly statusCode` → não pode ser alterado após criação
- `super(message)` → obrigatório em subclasse de `Error`
- `name = "AppError"` → identificação em logs

**Status codes usados:**
| Situação | Código | Significado |
|----------|--------|-------------|
| Entrada inválida | 400 | Bad Request (erro do cliente) |

---

### 2. divide com validação (`src/exercicio-02-error-handling.ts`)

```typescript
function divide(input: DivisionInput): number {
  if (input.denominator === 0) {
    throw new AppError("Denominador não pode ser zero", 400);
  }

  if (input.numerator === 0 && input.denominator === 0) {
    throw new AppError("Divisão 0/0 não é definida", 400);
  }

  const result = input.numerator / input.denominator;

  // Number.isFinite rejeita NaN, Infinity e -Infinity
  if (!Number.isFinite(result)) {
    throw new AppError("Resultado da divisão é inválido", 400);
  }

  return result;
}
```

---

### 3. execute com unknown e try/catch

```typescript
function execute(rawInput: unknown): void {
  // unknown EXIGE narrowing antes de usar (mais seguro que any)
  if (rawInput === null || typeof rawInput !== "object") {
    console.error("Entrada inválida: esperava um objeto com numerator e denominator");
    return;
  }

  const input = rawInput as Partial<DivisionInput>;

  if (typeof input.numerator !== "number" || typeof input.denominator !== "number") {
    console.error("Entrada inválida: numerator e denominator devem ser números");
    return;
  }

  try {
    const result = divide(input as DivisionInput);
    console.log("Resultado da divisão:", result);
  } catch (error: unknown) {
    if (error instanceof AppError) {
      // Erro CONHECIDO: mensagem amigável ao usuário (sem stack trace)
      console.error(`[${error.statusCode}] ${error.message}`);
      return;
    }

    // Erro INESPERADO: detalhes só no LOG do servidor, nunca para o usuário
    console.error("Erro inesperado:", error);
    console.error("Detalhes internos (apenas log):",
      error instanceof Error ? error.stack : String(error));
  }
}
```

---

## Por que `unknown` é mais seguro que `any`?

| `any` | `unknown` |
|-------|-----------|
| Permite qualquer operação sem verificação | Exige verificação (narrowing) antes de usar |
| Desativa a checagem do TypeScript | Mantém a checagem ativa |
| `rawInput.numerator` compila mesmo se rawInput não for objeto | Da erro até provar que é objeto |

**Prova no código:** com `unknown`, `rawInput.numerator` nem compila antes do `typeof rawInput !== "object"`.

---

## Questionamentos respondidos

**Divisão por zero lança exceção automaticamente?** Não. Retorna `Infinity`/`NaN`.
**Como detectar Infinity ou NaN?** `Number.isFinite(result)`.
**O catch deve retornar sucesso após uma falha?** Não. Falha é falha; o catch só registra a causa.
**Qual informação pertence ao usuário e qual ao log?** Usuário recebe mensagem + status; detalhes internos (stack) ficam no log do servidor.

---

## Cenários de Teste

| # | Entrada | Resultado | Tipo |
|---|---------|-----------|------|
| 1 | `{ numerator: 10, denominator: 2 }` | `5` | Sucesso |
| 2 | `{ numerator: 10, denominator: 0 }` | `[400] Denominador não pode ser zero` | AppError |
| 3 | `undefined` | `Entrada inválida: esperava objeto` | Validação |
| 4 | `{ numerator: "10", denominator: 2 }` | `Entrada inválida: devem ser números` | Validação |
| 5 | `null` | `Entrada inválida: esperava objeto` | Validação |
| 6 | `{ numerator: 0, denominator: 0 }` | `[400] Denominador não pode ser zero` | AppError |
| 7 | `{ numerator: 0, denominator: 5 }` | `0` | Sucesso |

**Critério atendido:** nenhuma entrada inválida produz `Infinity`, `NaN` ou falha silenciosa - todas são bloqueadas com mensagem clara.

---

## Validações
```bash
npx tsc --noEmit   # ✅ sem erros
npx eslint src     # ✅ sem warnings
```

---

## Aprendizados
- JS não lança exceção em divisão por zero - precisa validar
- `unknown` força o narrowing e impede "cortar caminho" com `any`
- `catch (error: unknown)` exige `instanceof` para estreitar o tipo
- Mensagem ao usuário ≠ detalhes internos (segurança)
- `Number.isFinite()` cobre `NaN`, `Infinity` e `-Infinity` de uma vez