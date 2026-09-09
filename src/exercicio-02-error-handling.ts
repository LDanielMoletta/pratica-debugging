// exercicio-02-error-handling.ts
// Tratamento de erros com try/catch e AppError
// Objetivo: impedir resultados inválidos (Infinity, NaN) e diferenciar
// erros esperados (AppError) de erros inesperados

import { AppError } from "./errors/app-error";

// Contrato de entrada da divisão
interface DivisionInput {
  numerator: number;
  denominator: number;
}

// Função de divisão com validação
// Lança AppError (erro esperado) para entradas inválidas
function divide(input: DivisionInput): number {
  // Regra 1: denominador não pode ser zero
  // (divisão por zero NÃO lança exceção no JS - retorna Infinity)
  if (input.denominator === 0) {
    throw new AppError("Denominador não pode ser zero", 400);
  }

  // Regra 2: numerador não pode ser zero em divisão (0/0 = NaN)
  // Na verdade 0/0 dá NaN, e NaN é inválido - vamos proibir 0/0 explicitamente
  if (input.numerator === 0 && input.denominator === 0) {
    throw new AppError("Divisão 0/0 não é definida", 400);
  }

  const result = input.numerator / input.denominator;

  // Regra 3: o resultado precisa ser um número finito válido
  // Number.isFinite() rejeita NaN, Infinity e -Infinity
  if (!Number.isFinite(result)) {
    throw new AppError("Resultado da divisão é inválido", 400);
  }

  return result;
}

// Função executora: recebe dados externos (desconhecidos) e orquestra o fluxo
// rawInput: unknown (mais seguro que any - obriga a estreitar o tipo)
function execute(rawInput: unknown): void {
  // Validação da ENTRADA (dados externos não são confiáveis)
  // unknown exige verificação antes de usar - não dá pra acessar rawInput.numerator direto
  if (rawInput === null || typeof rawInput !== "object") {
    console.error("Entrada inválida: esperava um objeto com numerator e denominator");
    return;
  }

  // Após a verificação, TS sabe que é objeto, mas ainda precisa dos campos
  // Estreitamento (narrowing): acessamos com tipagem segura via 'in' ou cast controlado
  const input = rawInput as Partial<DivisionInput>;

  // Validação de presença e tipo dos campos
  if (typeof input.numerator !== "number" || typeof input.denominator !== "number") {
    console.error("Entrada inválida: numerator e denominator devem ser números");
    return;
  }

  try {
    // Chamada segura dentro do try/catch
    const result = divide(input as DivisionInput);

    // Erro tratado não é motivo de sucesso; aqui o fluxo completou normalmente
    console.log("Resultado da divisão:", result);
  } catch (error: unknown) {
    // catch captura TUDO (AppError E erros inesperados)
    if (error instanceof AppError) {
      // Erro CONHECIDO: mensagem amigável para o usuário (sem stack trace)
      console.error(`[${error.statusCode}] ${error.message}`);
      return;
    }

    // Erro INESPERADO: loga detalhes no servidor, mas não expõe ao usuário
    console.error("Erro inesperado:", error);
    console.error("Detalhes internos (apenas log):", error instanceof Error ? error.stack : String(error));
  }
}

// ============ CENÁRIOS DE TESTE ============

console.log("1) Divisão normal (10 / 2)");
execute({ numerator: 10, denominator: 2 });

console.log("\n2) Denominador zero (10 / 0) → AppError");
execute({ numerator: 10, denominator: 0 });

console.log("\n3) Entrada undefined");
execute(undefined);

console.log("\n4) Tipos incorretos (numerator string)");
execute({ numerator: "10" as unknown as number, denominator: 2 });

console.log("\n5) Entrada null");
execute(null);

console.log("\n6) 0/0 → NaN → AppError");
execute({ numerator: 0, denominator: 0 });

console.log("\n7) Numerador 0 com denominador válido (0/5 = 0)");
execute({ numerator: 0, denominator: 5 });