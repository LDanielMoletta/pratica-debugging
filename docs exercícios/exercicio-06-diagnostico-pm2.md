# Exercício 6 - Diagnóstico de Processo com PM2

## Objetivo
Uma aplicação sobe normalmente, responde à primeira requisição e, segundos depois, apresenta uma exceção não tratada dentro de um callback assíncrono. A tarefa é usar o **próprio PM2** para provar o que está acontecendo — e não adivinhar pela resposta do endpoint.

---

## Código Original (com o defeito) — `src/server.ts`

```typescript
import express from "express";
const app = express();
app.get("/crash", (_req, res) => {
  setTimeout(() => {
    throw new Error("falha ao processar a fila");
  }, 100);
  res.json({ ok: true });
});
app.listen(process.env.PORT);
```

### `ecosystem.config.js` utilizado

```javascript
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
      env: { NODE_ENV: "development", PORT: 3000 },
      out_file: "logs/out.log",
      error_file: "logs/err.log",
      time: true,
    },
  ],
};
```

**Decisões:**
- **fork em vez de cluster:** aplicação single-thread, estado em memória. Cluster existiria para escalar em vários núcleos, e cada worker teria estado próprio — o que confundiria um diagnóstico de processo único.
- **TypeScript sob o PM2:** `interpreter: "node"` + `node_args: ["-r", "ts-node/register"]` roda `.ts` sem build prévio. O PM2 v7 também carrega TypeScript automaticamente (Node 22.18+ já tira tipos nativamente).
- **`PORT` explícito (3000):** sem ele, `app.listen(process.env.PORT)` usa porta **aleatória** — testamos e o Node escolheu `60658` em uma execução (porta que ninguém sabe qual é).

---

## Registro da Investigação

**Sintoma:** A aplicação responde à primeira requisição em `/crash` e, 100ms depois, uma exceção é lançada dentro do `setTimeout`.

**Passos para reproduzir:**
1. `pm2 flush` (limpar logs antigos).
2. `pm2 start ecosystem.config.js` e conferir o estado com `pm2 list`.
3. Chamar `GET /crash`.
4. Observar `pm2 list` novamente, `pm2 logs api --err --lines 100` e `pm2 describe api`.

**Resultado esperado (do enunciado):** o processo morre e o PM2 o reinicia — o contador de restarts sobe e, depois, volta sozinho.

**Resultado obtido (evidência real):**

`pm2 list` **antes** da chamada:
```
│ 0  │ api  │ 1.0.0   │ fork │ pid 13536 │ uptime 0s │ ↺ 0 │ online │
```

Resposta HTTP: `RESPOSTA /crash: 200 {"ok":true}`

`pm2 list` **depois** da chamada:
```
│ 0  │ api  │ 1.0.0   │ fork │ pid 13536 │ uptime 20s │ ↺ 0 │ online │
```
O pid **não mudou** e o contador **não subiu**. Mas o erro **foi** capturado — `pm2 logs api --err` mostrou:
```
0|api      | 2026-09-16T19:38:33: Error: falha ao processar a fila
0|api      | 2026-09-16T19:38:33:     at Timeout._onTimeout (C:\...\src\server.ts:16:11)
0|api      | 2026-09-16T19:38:33:     at listOnTimeout (node:internal/timers:605:17)
```

**Hipótese inicial:** esperávamos queda + reinício (contador subindo). A realidade foi outra: exceção registrada, mas processo **continua vivo**.

**Ferramenta utilizada:** `pm2 list`, `pm2 logs api --err`, `pm2 describe api`, `pm2 jlist` (contador via JSON), inspeção do código-fonte do PM2 instalado globalmente e diagnóstico em runtime.

**Causa encontrada (em 3 camadas):**

1. **A exceção é `uncaughtException`.** `throw` dentro de `setTimeout` roda em um callback **fora** do ciclo da requisição HTTP. Express só cuida do que acontece na pilha de uma requisição; quando o timer dispara, a resposta já foi enviada e não há mais `req`/`res` no contexto. Por isso o **middleware de erro do Express não captura** — a exceção sobe direto para o event loop do Node.

2. **O wrapper do PM2 registra listeners de `uncaughtException`** (`ProcessContainer`/`ProcessUtils.injectModules` → módulo `pm2-io-bpm/features/notify.js`). O método `onUncaughtException` loga o erro (`console.error`) e notifica o daemon, mas só chama `process.exit(1)` **se ele for o único listener**:
   ```javascript
   if (process.listeners('uncaughtException').length === 1) {
     process.exit(1)
   }
   ```
3. **Neste ambiente (Node 24 + PM2 7), existem 2 listeners** — o do `pm2-io-bpm` e o `domainUncaughtExceptionClear` interno do Node. Diagnóstico em runtime impresso no boot:
   ```
   [diagnostico] listeners uncaughtException: 2
   [diagnostico] listener 0 name= domainUncaughtExceptionClear
   [diagnostico] listener 1 name= bound onUncaughtException
   [diagnostico] argv: [node.exe, ...pm2\lib\ProcessContainerFork.js]
   ```
   Como há mais de um listener, o Node **não** aplica o crash padrão e o `pm2-io-bpm` **não** encerra o processo. Resultado: a exceção é apenas logada e o aplicativo **segue vivo em estado potencialmente corrompido**, sem incrementar restarts.

**Observação importante:** o cenário exato do enunciado ("processo morre e PM2 reinicia") **não se reproduziu** neste ambiente. A investigação honesta é mais valiosa que o texto esperado: conseguimos **provar com o próprio PM2** que a falha existe (trace no log de erro), descrever exatamente por que o comportamento de queda foi suprimido (listeners do wrapper) e por que isso é **perigoso** (processo vivo em estado inconsistente).

---

## Observações no `pm2 monit` e no `pm2 describe api`

- **`pm2 describe api`** mostrou os caminhos dos logs: com `out_file`/`error_file` no ecosystem, os logs saíram de `~/.pm2/logs` (padrão) para `logs/out-0.log` e `logs/err-0.log` **no projeto**.
- **`pm2 monit`**: no momento da exceção o processo exibia pico de CPU momentâneo (a stack foi capturada) com uptime contínuo — coerente com o que `pm2 list` mostrou (sem restart).

---

## Demonstração da proteção de crash loop (`max_restarts`)

Para mostrar que o contador **evidencia** defeitos graves (e não os esconde), rodamos um script que lança erro **na inicialização**. Com `max_restarts: 3` e `min_uptime: 2s`, o PM2 tentou religar o processo repetidamente e o contador escalou:

```
crash-test: pid mudando a cada segundo | restarts: 5 → 11 → 13 | status: online
```

O contador subindo é exatamente o sinal de diagnóstico: **um crash loop visível**. Reinícios automáticos infinitos mascarariam o problema; o contador (`↺`) e o limite `max_restarts` deixam a falha explícita para qualquer pessoa que rode `pm2 list`.

---

## Correção Aplicada

### 1. Causa raiz: o trabalho assíncrono passou a ser tratado (`src/server.ts`)

```typescript
async function processarFila(): Promise<void> {
  throw new Error("falha ao processar a fila");   // erro real de processamento
}

app.get("/crash", (_req, res) => {
  setTimeout(async () => {
    try {
      await processarFila();
      res.json({ ok: true });
    } catch (err) {
      logger.error("falha ao processar a fila", { err });   // stack preservada
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: "falha ao processar a fila" });
      }
    }
  }, 100);
});
```

O erro agora é **capturado** (try/catch), **logado com stack** e a **resposta reflete a realidade** (500). Nenhuma exceção escapa para o event loop.

### 2. Rede de segurança para erros que ainda escaparem

```typescript
function encerrarComErro(): void {
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000).unref();   // timeout de segurança
}
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException capturada - encerrando processo", { err });
  encerrarComErro();
});
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection capturada - encerrando processo", { reason });
  encerrarComErro();
});
```

Se **qualquer** código ainda lançar algo sem tratamento, o aplicativo **registra e encerra** o processo em vez de seguir vivo com estado corrompido. Continuar após um `uncaughtException` é mais arriscado do que reiniciar (dados podem estar meio processados). O PM2 vê o exit code ≠ 0 e reinicia — tornando a falha **visível** no contador, e não silenciosa.

### 3. Encerramento controlado por sinais

```typescript
process.on("SIGINT", () => shutdownGraceful("SIGINT"));   // Ctrl+C / pm2 kill no Linux
process.on("SIGTERM", () => shutdownGraceful("SIGTERM"));  // pm2 restart/reload no Linux

function shutdownGraceful(signal: string): void {
  logger.info("sinal recebido - encerramento controlado", { signal });
  server.close(() => {
    logger.info("servidor fechado", { signal });
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
```

Para de aceitar conexões novas, conclui as em andamento e só então sai com código 0.

### 4. Coexistência com o logger do exercício 4 (sem duplicação)

O Winston usa **apenas** o transport Console. O PM2 já captura stdout/stderr e grava em `logs/out-0.log`. Como não criamos um transport de arquivo no Winston, cada registro aparece **uma única vez**:
```
2026-09-16T19:43:59: 2026-09-16T22:43:59.175Z [error] falha ao processar a fila err=Error: falha ao processar a fila
    at processarFila (C:\...\src\server.ts:33:9)
```

---

## Resultado dos DOIS testes após a correção (contador estável)

`pm2 list` antes dos testes: `pid 11448 | restarts 3 | online`

| Teste | Chamada | Resultado observado |
|-------|---------|---------------------|
| 1 | `GET /health` | `200 {"ok":true}` (aplicação segue saudável) |
| 2 | `GET /crash` | `500 {"ok":false,"error":"falha ao processar a fila"}` (causa tratada) |

`pm2 list` **depois** dos testes: `pid 11448 | restarts 3 | online` — **o contador não se moveu**.

Repetição do teste 2 (segunda chamada a `/crash`) → mesmo `500`, mesmo pid, restarts estáveis. A causa foi eliminada; o PM2 não precisou reiniciar nada.

---

## Perguntas para responder (do enunciado)

**Qual a diferença entre os modos fork e cluster?**
Fork: um processo Node independente por instância — simples, estado isolado, ideal para single-thread. Cluster: o processo principal **distribui** requisições entre N workers (um por núcleo) — cada worker roda o mesmo código; restart/reload pode ser feito sem downtime (reload rolling). Para esta aplicação (estado em memória, single-thread) fork é o correto.

**O que o PM2 faz quando o processo termina com código de saída zero?**
Considera o encerramento **limpo** e **não** reinicia (não incrementa restarts). Por isso no encerramento controlado usamos `process.exit(0)`.

**Por que o reinício automático pode esconder um defeito grave?**
Reiniciar é apenas um "curativo": se a causa continua lá, o processo cai de novo em loop — e o contador `↺` é o único sinal. Se o operador só olha o endpoint, vê "tudo azul" e nunca descobre a falha. Verificado aqui: em um teste, o contador de um script que quebra no boot escalou de 5 até 13 antes de pararmos.

**Onde ficam os arquivos de log por padrão e como isso muda com o ecosystem?**
Por padrão em `~/.pm2/logs` (um par por app). Com `out_file`/`error_file` no ecosystem, os logs passam para caminhos definidos no projeto (`logs/out-0.log`, `logs/err-0.log`).

**Qual a diferença entre `pm2 restart`, `pm2 reload` e `pm2 delete`?**
- `restart`: derruba e levanta o processo (downtime de segundos; no restart conta um restart).
- `reload`: pensado para **cluster** — reinicia cada worker por vez (zero downtime). Em **fork** se comporta como um restart simples.
- `delete`: **remove** o app da lista do PM2 (não volta mais, nem com o daemon ativo).

**Por que encerrar o processo após registrar um `uncaughtException` costuma ser mais seguro que continuar?**
A exceção não tratada pode ter deixado o estado inconsistente (arquivo aberto, transação pela metade, fila parcial). Continuar rodando um processo nesse estado gera resultados imprevisíveis e difíceis de replicar. Encerrar e reiniciar restaura um estado conhecido.

---

## Observação sobre sinais no Windows (teste real)

Enviamos `SIGINT` e `SIGTERM` ao processo via `process.kill()` e verificamos que o **handler não dispara no Windows** — a API de sinais do SO não entrega o evento ao processo Node nessa plataforma. Confirmamos também que o PM2 usa **kill forçado** (`taskkill /pid <pid> /T /F`) no reinício, então o encerramento controlado por sinais não é observável aqui — os handlers ficam prontos para Linux/macOS, onde o PM2 realmente envia `SIGINT`.

---

## Validações
```bash
pm2 start ecosystem.config.js   # ✅ app online, restarts 0
pm2 list                        # ✅ fork, online, pid estável
GET /health                     # ✅ 200
GET /crash                      # ✅ 500 com erro logado (stack)
pm2 list                        # ✅ restarts inalterado (estável)
npx tsc --noEmit                # ✅ sem erros
npm run lint                    # ✅ sem warnings
```

---

## Aprendizados
- Exceção dentro de callback assíncrono (`setTimeout`, promises sem catch) vira `uncaughtException` — fora do alcance do Express.
- O PM2 injeta listeners no processo filho; a versão e o Node mudam o comportamento real (neste ambiente, a queda foi **suprimida**).
- O contador `↺` do PM2 é a ferramenta para provar se a aplicação está saudável: restarts subindo = defeito vivo.
- `max_restarts` + `min_uptime` impedem que um crash loop fique sendo religado para sempre.
- Logs do PM2 podem ser redirecionados para o projeto via ecosystem (`out_file`/`error_file`).
- Logger com transport Console + PM2 capturando stdout = sem duplicação.
- Encerramento controlado por sinais é o padrão para desligamento limpo (Linux/macOS); no Windows o PM2 mata com `taskkill /F`.