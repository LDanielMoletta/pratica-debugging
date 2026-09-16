// src/server.ts
// Exercício 6 - Diagnóstico de processo com PM2 (VERSÃO CORRIGIDA)
//
// CAUSA DO PROBLEMA (na versão original deste arquivo):
//   O throw acontecia DENTRO de setTimeout → fora do ciclo da requisição.
//   Nenhum catch do Express alcança esse erro: ele sobe como
//   'uncaughtException' no event loop. O middleware de erro do Express
//   não captura porque a pilha já saiu da requisição quando o timer dispara.
//
// CORREÇÕES APLICADAS:
//   1) O trabalho assíncrono agora roda dentro de try/catch e a resposta
//      reflete o resultado real: 200 em sucesso, 500 com o erro logado.
//   2) Nenhuma exceção escapa para o event loop (causa raiz eliminada).
//   3) Rede de segurança: handlers globais de uncaughtException e
//      unhandledRejection REGISTRAM o erro e ENCERRAM o processo.
//      Continuar após um uncaughtException é arriscado (estado pode estar
//      inconsistente); reiniciar via PM2 é mais seguro que seguir rodando.
//   4) Encerramento controlado em resposta aos sinais (SIGINT/SIGTERM):
//      fecha o servidor e só então o processo termina com código 0.
import express from "express";
import { logger } from "./logger";

const app = express();

// Rota de saúde: mostra que a aplicação continua servindo normalmente
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Simula uma operação assíncrona que PODE falhar (ex.: processamento de fila)
async function processarFila(): Promise<void> {
  // Representa um erro real de processamento que antes era lançado solto
  throw new Error("falha ao processar a fila");
}

app.get("/crash", (_req, res) => {
  setTimeout(async () => {
    try {
      await processarFila();
      res.json({ ok: true });
    } catch (err) {
      // CORREÇÃO: o erro é registrado com stack pelo logger (exercício 4)
      // e a resposta reflete a realidade (500), em vez de derrubar o processo
      logger.error("falha ao processar a fila", { err });
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: "falha ao processar a fila" });
      }
    }
  }, 100);
});

const PORT = Number(process.env.PORT ?? 3000);

const server = app.listen(PORT, () => {
  logger.info("api no ar", { port: PORT });
});

// ---- Rede de segurança para erros NÃO capturados ----------------------
// Se ALGUM código do processo ainda lançar uma exceção sem tratamento,
// registramos e ENCERRAMOS. Deixar o processo vivo nesse estado pode
// causar comportamento inconsistente (dados meio processados etc).
function encerrarComErro(): void {
  server.close(() => process.exit(1));
  // Garantia: se close() travar, encerra mesmo assim (timeout de segurança)
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on("uncaughtException", (err) => {
  logger.error("uncaughtException capturada - encerrando processo", { err });
  encerrarComErro();
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection capturada - encerrando processo", { reason });
  encerrarComErro();
});

// ---- Encerramento controlado (sinais) ----------------------------------
// Trata o sinal recebido (pm2 restart/reload envia sinais ao processo):
// para de aceitar conexões novas, encerra as em andamento e sai com código 0.
function shutdownGraceful(signal: string): void {
  logger.info("sinal recebido - encerramento controlado", { signal });
  server.close(() => {
    logger.info("servidor fechado", { signal });
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdownGraceful("SIGINT"));
process.on("SIGTERM", () => shutdownGraceful("SIGTERM"));