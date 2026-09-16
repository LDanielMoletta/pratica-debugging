// src/middlewares/request-logger.ts
// Exercício 5 - Middleware de logging de requisições
//
// CORREÇÕES em relação ao código original do exercício:
// 1) O log NÃO é emitido antes de next(): esperamos o evento 'finish' da
//    resposta. Só nesse momento res.statusCode tem o valor DEFINITIVO
//    (o original gravava o status antes das rotas rodarem → sempre 200)
// 2) Duração medida com process.hrtime.bigint() (relógio de alta resolução,
//    adequado para intervalos curtos) e convertida para milissegundos.
//    O original media em cima de next() → sempre ~0ms
// 3) Evento 'close' como reserva: se o cliente cancelar no meio, 'finish'
//    não dispara, mas 'close' dispara → o registro não é perdido.
//    Uma flag evita duplicar a linha quando os dois eventos ocorrem
// 4) requestId (UUID) gerado por requisição e devolvido no header
//    'x-request-id': permite correlacionar todas as linhas de UMA requisição
// 5) route usa req.route?.path (padrão agregável '/usuarios/:id'), caindo
//    para req.originalUrl quando a rota não existe (404)

import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { logger } from "../logger";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Identificador único para correlacionar as linhas de uma mesma requisição
  // (se o cliente enviar x-request-id, respeitamos; senão geramos um UUID)
  const requestId = typeof req.header("x-request-id") === "string"
    ? String(req.header("x-request-id"))
    : randomUUID();

  // Devolvemos o id no header da resposta (útil para o cliente reportar no suporte)
  res.setHeader("x-request-id", requestId);

  // Relógio de ALTA RESOLUÇÃO para medir intervalos curtos (nanosegundos)
  // Date.now() tem resolução de milissegundos → não serve para medir o tempo
  // de uma requisição rápida (o original usava Date e dava ~0ms)
  const start = process.hrtime.bigint();

  let alreadyLogged = false;

  // Loga a linha final da requisição
  const logRequest = (): void => {
    if (alreadyLogged) {
      return; // 'finish' seguido de 'close' → não logar duas vezes
    }
    alreadyLogged = true;

    // Converte nanosegundos em milissegundos (1000000n = 1.000.000 ns = 1 ms)
    const durationMs = Number((process.hrtime.bigint() - start) / 1000000n);

    // req.route?.path devolve o PADRÃO da rota ('/usuarios/:id'), agregável.
    // Quando a rota não existe (404), req.route é undefined → cai em originalUrl.
    logger.info("request", {
      requestId,
      method: req.method,
      route: req.route?.path ?? req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
    });
  };

  // 'finish' → a resposta foi totalmente enviada ao SO (header + corpo)
  res.on("finish", logRequest);

  // 'close' → a conexão foi encerrada (pode ter sido cancelada pelo cliente).
  // Se 'finish' não veio, logamos aqui para não perder o registro
  res.on("close", logRequest);

  // Continua a cadeia. O log vem dos eventos, NUNCA antes de next()
  next();
}