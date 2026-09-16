// src/logger.ts
// Configuração central do logger da aplicação (Winston)
// Este é o ÚNICO logger do projeto: os exercícios 4 e 5 usam esta mesma instância
//
// Diferenças em relação ao código original exercício 4:
// 1) O nível NÃO é fixo ('error'): é lido de process.env.LOG_LEVEL com padrão seguro 'info'
//    (no original, nível 'error' fazia as linhas de 'info' nunca aparecerem)
// 2) O formato agora inclui timestamp e grava metadados estruturados (dev) ou JSON (produção)
// 3) Campos sensíveis conhecidos (cpf, token, cartão, senha...) são REMOVIDOS antes de imprimir
// 4) O formato errors({ stack: true }) preserva a stack trace de erros no log

import winston from "winston";

// Nível controlado por variável de ambiente:
//   LOG_LEVEL=error  → somente mensagens de erro (ou mais graves) na saída
//   LOG_LEVEL=debug  → o nível mais detalhado
//   sem variável     → 'info' (padrão seguro: não omite info nem inunda com debug)
const level = process.env.LOG_LEVEL ?? "info";

// Chaves consideradas SENSÍVEIS: se algum metadado chegar aqui com uma dessas
// chaves, o campo é removido da saída. Funciona como o redact do Pino.
const SENSITIVE_KEYS = ["cpf", "token", "password", "senha", "card", "cardNumber", "cartao"];

// Remove campos sensíveis de forma RECURSIVA (procura também dentro de
// objetos aninhados, ex: customer.cpf). A primeira tentativa só varria a
// superfície e o cpf aninhado em customer vazou para a saída (evidência e
// correção documentadas no docs do exercício 4).
function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 10) {
    return value; // proteção contra objetos muito profundos
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, depth + 1));
  }

  // Errors passam INTACTOS: convertê-los em objeto simples perderia a
  // mensagem e a stack (message/stack não são propriedades enumeráveis).
  // O stack é preservado depois, no formato de saída (dev) ou no JSON.
  if (value instanceof Error) {
    return value;
  }

  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      if (SENSITIVE_KEYS.includes(key)) {
        continue; // o campo inteiro é descartado (nem o nome aparece)
      }
      result[key] = redactDeep(source[key], depth + 1);
    }
    return result;
  }

  return value;
}

// Formato personalizado que FILTRA a saída: se algum metadado chegar com
// chave sensível (mesmo dentro de sub-objetos), o campo é removido antes do print
const stripSensitive = winston.format((info) => {
  if (info && typeof info === "object") {
    for (const key of Object.keys(info)) {
      info[key] = redactDeep(info[key]);
    }
  }
  return info;
});

// Converte um valor em texto para a saída "legível" (desenvolvimento)
// Erros viram stack trace (que é o que queremos ver no terminal)
function stringify(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

// Saída legível para desenvolvimento (facilita ler no terminal)
const readableFormat = winston.format.printf((info) => {
  const { timestamp, level: logLevel, message, ...meta } = info;
  const fields = Object.keys(meta)
    .filter((key) => meta[key] !== undefined)
    .map((key) => `${key}=${stringify(meta[key])}`);

  return `${timestamp} [${logLevel}] ${String(message)}${fields.length > 0 ? " " + fields.join(" ") : ""}`;
});

export const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    // errors({ stack: true }) preserva o stack quando um Error é logado
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    stripSensitive(),
    // Desenvolvimento: texto legível. Produção: JSON estruturado (leitura por máquina)
    process.env.NODE_ENV === "production" ? winston.format.json() : readableFormat
  ),
  // Console é suficiente nesta etapa (o PM2 já captura a saída padrão - exercício 6)
  transports: [new winston.transports.Console()],
});