// src/teste-exercicio-05.ts
// Roteiro de teste do Exercício 5: sobe a aplicação de demonstração,
// dispara as 5 requisições do checklist e encerra o servidor.
// As linhas de log (Winston) aparecem no terminal junto com os resultados.
//
// Executar: npx ts-node src/teste-exercicio-05.ts

import { app } from "./exercicio-05-logging-middleware";
import { logger } from "./logger";

const PORT = 3010;

const server = app.listen(PORT, async () => {
  const rotas = [
    { method: "GET", path: "/health" }, // 200
    { method: "GET", path: "/usuarios/42" }, // 200 (rota com parâmetro)
    { method: "GET", path: "/rota-inexistente" }, // 404
    { method: "GET", path: "/erro" }, // 500
    { method: "GET", path: "/lento" }, // 200 após 2s
  ];

  for (const rota of rotas) {
    try {
      const resposta = await fetch(`http://localhost:${PORT}${rota.path}`);
      console.log(`RESPOSTA ${rota.method} ${rota.path} -> ${resposta.status}`);
    } catch (err) {
      console.error(`FALHA ${rota.method} ${rota.path}`, err);
    }
  }

  // Pequena espera para o logger emitir a última linha antes de fechar
  setTimeout(() => {
    server.close();
    logger.info("teste concluido, servidor fechado");
  }, 300);
});