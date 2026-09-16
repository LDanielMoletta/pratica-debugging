// ecosystem.config.js
// Configuração do PM2 para o Exercício 6
//
// script      → arquivo que o PM2 executa (TypeScript, precisa de interpretador)
// interpreter → 'node' com ts-node/register: roda .ts sem build prévio.
//               Alternativa seria apontar para dist/server.js após npm run build
// instances   → 1 no modo fork: aplicação com estado em memória e single-thread,
//               sem necessidade de distribuir carga entre workers (cluster seria
//               para escalar em múltiplos núcleos e cada worker teria estado próprio)
// max_restarts→ limite de reinícios rápidos: impede que um crash loop fique
//               sendo mascarado por reinícios automáticos infinitos
// min_uptime  → tempo mínimo de "vida" para considerar o processo estável;
//               se cair antes disso várias vezes, o PM2 desiste de reiniciar
// logs        → saída capturada em logs/ (o PM2 move stdout/stderr para arquivo,
//               o logger Winston não precisa de transport de arquivo próprio,
//               senão os registros duplicariam)
module.exports = {
  apps: [
    {
      name: "api",
      script: "src/server.ts",
      interpreter: "node",
      node_args: ["-r", "ts-node/register"],
      exec_mode: "fork",
      instances: 1,
      max_restarts: 5,
      min_uptime: "2s",
      env: {
        NODE_ENV: "development",
        PORT: 3000,
      },
      out_file: "logs/out.log",
      error_file: "logs/err.log",
      time: true,
    },
  ],
};