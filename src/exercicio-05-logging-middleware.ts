// src/exercicio-05-logging-middleware.ts
// Exercício 5 - Middleware de logging de requisições (aplicação de demonstração)
//
// Executar: npx ts-node src/exercicio-05-logging-middleware.ts
// Testar:   as rotas /health, /usuarios/42, /erro, /lento e /rota-inexistente
//
// Ordem de registro dos middlewares (IMPORTANTE):
//   1. requestLogger        → ANTES das rotas (para não perder requisição alguma)
//   2. rotas da aplicação   → health, usuarios, erro, lento
//   3. middleware de erros  → DEPOIS de tudo (4 argumentos = tratamento de erro)

import express, { NextFunction, Request, Response } from "express";
import { logger } from "./logger";
import { requestLogger } from "./middlewares/request-logger";

const app = express();

// Observação sobre ordenação: o requestLogger precisa ser registrado ANTES
// das rotas. Se fosse depois, rotas como /health responderiam e o middleware
// nem seria executado (o original do exercício registrava após as rotas →
// nunca logava nada).

app.use(express.json());
app.use(requestLogger);

// Rota 1: saudação simples (200)
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Rota 2: rota com PARÂMETRO na URL (testa rota agregável 'rota/:id')
app.get("/usuarios/:id", (req, res) => {
  res.json({ id: req.params.id, nome: "Fulano" });
});

// Rota 3: rota que LANÇA exceção (testa status 500 com o erro associado)
app.get("/erro", () => {
  throw new Error("falha interna forcada pelo teste");
});

// Rota 4: rota LENTA (testa duração coerente com o atraso de 2 segundos)
app.get("/lento", (_req, res) => {
  setTimeout(() => {
    res.json({ lento: true });
  }, 2000);
});

// Rota 5: /rota-inexistente NÃO é registrada → retorna 404 pelo Express.
// Mesmo assim o requestLogger registra (404), porque foi registrado antes
// de todas as rotas e o evento 'finish' roda para qualquer resposta.

// Middleware de tratamento de ERROS (4 argumentos - o Express identifica pelo nº)
// Deve vir DEPOIS das rotas para capturar as exceções lançadas ali.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Registra o erro COM a stack (logger do exercício 4, sem segundo logger)
  logger.error("erro na requisicao", { err });
  res.status(500).json({ error: "erro interno" });
});

const PORT = Number(process.env.PORT ?? 3005);

// App exportado para permitir testes/integração em outros arquivos
export { app };

// Só inicia o servidor quando o arquivo é executado diretamente
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info("servidor de demonstracao no ar", { port: PORT });
  });
}