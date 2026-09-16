# Exercício 5 - Middleware de Logging de Requisições

## Objetivo
Corrigir um middleware que deveria registrar método, rota, status da resposta e tempo de cada requisição, mas registrava **sempre status 200 e duração zero**, mesmo em rotas lentas ou que retornam 404 — e, na maioria dos casos, nem chegava a ser executado.

---

## Código Original (com o defeito)

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = new Date();
  logger.info('request', {
    method: req.method,
    route: req.path,
    status: res.statusCode,      // lido NESTE momento (ainda não é definitivo)
    duration: new Date() - start // medido na hora (ainda não passou nenhum tempo)
  });
  next();
}
// registro no app (POSIÇÃO ERRADA - depois das rotas)
app.get('/health', handler);
app.use(requestLogger);
```

---

## Registro da Investigação

**Sintoma:** Em todos os testes o status saía 200 e o tempo saía zero, mesmo em rotas lentas ou que retornam 404.

**Passos para reproduzir:**
1. Registrar rotas `/health` (rápida) e `/lento` (atraso de 2s).
2. Registrar o middleware **depois** das rotas.
3. Chamar `/health`, `/lento`, `/rota-inexistente` e `/usuarios/42`, observando terminal e respostas.

**Resultado esperado:** Uma linha de log por requisição, com o status real (200/404/...) e a duração real.

**Resultado obtido (linhas copiadas do terminal, com o middleware original):**
```
RESPOSTA /health -> 200 (em 48ms)
RESPOSTA /lento -> 200 (em 2023ms)
[logger] request {"method":"GET","route":"/rota-inexistente","status":200,"duration":0}
RESPOSTA /rota-inexistente -> 404 (em 3ms)
[logger] request {"method":"GET","route":"/usuarios/42","status":200,"duration":0}
RESPOSTA /usuarios/42 -> 404 (em 2ms)
```

Observe dois comportamentos reveladores:
- **`/health` e `/lento` não geraram log nenhum** — o middleware veio **depois** das rotas e nunca foi alcançado.
- Quando gerou log (`/rota-inexistente`, `/usuarios/42`), registrou `"status":200,"duration":0` enquanto a resposta real era **404** e (no caso do `/usuarios/42`) a rota nem existia.

**Hipótese:** O log está sendo emitido no momento errado (antes de `next()`) e o middleware está registrado no lugar errado (depois das rotas).

**Ferramenta utilizada:** Terminal + resposta HTTP real (via `fetch`) comparando o que o servidor **respondeu** com o que o logger **escreveu**.

**Causas encontradas (4):**
1. **Posição errada na cadeia:** o Express executa os middlewares na ordem de registro. Rotas registradas **antes** do middleware respondem e encerram a cadeia — o `requestLogger` (registrado depois) **nunca roda** para elas. Por isso `/health` e `/lento` não logaram.
2. **Status lido cedo demais:** `res.statusCode` no momento do log ainda vale o **default 200**. O Express só define o status definitivo no final da resposta (o 404, por exemplo, é aplicado pelo handler final). Como o log saiu antes de `next()`, o status impressionado foi o do meio do fluxo.
3. **Duração medida imediatamente:** `start` e a medição acontecem na mesma instrução, antes de qualquer trabalho. Para rotas normais a diferença é ~0ms. Para medir intervalos curtos o correto é usar um relógio de **alta resolução** (`process.hrtime.bigint()`, em nanosegundos), não `Date`.
4. **Erro de tipagem:** `new Date() - start` **nem compila** em TypeScript estrito (`TS2362`/`TS2363`: operação aritmética não permitida entre `Date`). Tivemos que ajustar para `new Date().getTime() - start.getTime()` apenas para conseguir reproduzir o comportamento.

---

## Correção Aplicada

### 1. `src/middlewares/request-logger.ts`

```typescript
import { randomUUID } from "node:crypto";
import { logger } from "../logger";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = typeof req.header("x-request-id") === "string"
    ? String(req.header("x-request-id"))
    : randomUUID();

  res.setHeader("x-request-id", requestId);

  const start = process.hrtime.bigint();   // relógio de alta resolução (ns)
  let alreadyLogged = false;

  const logRequest = (): void => {
    if (alreadyLogged) return;             // finish seguido de close → não duplicar
    alreadyLogged = true;
    const durationMs = Number((process.hrtime.bigint() - start) / 1000000n); // ns → ms
    logger.info("request", {
      requestId,
      method: req.method,
      route: req.route?.path ?? req.originalUrl,   // padrão agregável quando existe rota
      statusCode: res.statusCode,                  // AGORA está definitivo
      durationMs,
    });
  };

  res.on("finish", logRequest);   // resposta totalmente enviada
  res.on("close", logRequest);    // cliente cancelou no meio (finish não viria)
  next();
}
```

Decisões de projeto:
- **Emitir no evento `finish`:** é disparado quando a resposta foi entregue ao SO (header + corpo). Só aí `res.statusCode` tem o valor **definitivo**. Por isso o log **não** vem antes de `next()`.
- **Evento `close` como reserva:** se o cliente desligar no meio da requisição, `finish` nunca dispara, mas `close` dispara — o registro não se perde. A flag `alreadyLogged` evita linha duplicada quando os dois eventos ocorrem.
- **`process.hrtime.bigint()`:** mede em nanosegundos, adequado para intervalos curtos. Convertemos para `durationMs` (número), que é um campo **numérico** — fácil de somar/médi em agregadores (um texto `'132ms'` não é agregável).
- **`route` agregável:** `req.route?.path` devolve o **padrão** da rota (`/usuarios/:id`), não o valor concreto (`/usuarios/42`). Assim o log não explode a cardinalidade. Quando a rota não existe (`req.route` undefined), cai em `req.originalUrl`.
- **`requestId`:** UUID por requisição, devolvido no header `x-request-id`. Junta todas as linhas de uma mesma requisição no log.
- **Posição correta:** o middleware é registrado **antes** das rotas (`app.use(requestLogger)` antes de qualquer rota), então cobre requisições que existem e as que não existem.

### 2. `src/exercicio-05-logging-middleware.ts` — ordem de registro

```typescript
app.use(express.json());
app.use(requestLogger);           // 1º de todos
app.get("/health", ...);          // rotas depois
app.get("/usuarios/:id", ...);
app.get("/erro", () => { throw new Error("falha interna forcada pelo teste"); });
app.get("/lento", ...);
app.use((err, _req, res, _next) => {   // 4 argumentos = middleware de ERRO, por último
  logger.error("erro na requisicao", { err });
  res.status(500).json({ error: "erro interno" });
});
```

O middleware de erro vem **depois** de todas as rotas para capturar exceções lançadas nelas. Como o `requestLogger` é o primeiro e o log sai no `finish`, a requisição da rota `/erro` é registrada **uma única vez**, com `statusCode: 500` e o erro associado no log de erro.

---

## Linhas de log ANTES e DEPOIS

**Antes — `/rota-inexistente` (resposta real 404):**
```
[logger] request {"method":"GET","route":"/rota-inexistente","status":200,"duration":0}
```

**Depois — `/rota-inexistente` (resposta real 404):**
```
2026-09-16T22:37:21.527Z [info] request requestId=7bea161c-82ab-4b94-a730-f5e505d8d530 method=GET route=/rota-inexistente statusCode=404 durationMs=1
```

**Depois — `/usuarios/42` (rota agregável):**
```
2026-09-16T22:37:21.524Z [info] request requestId=4573fa7d-5a74-4ba8-a874-3c7e4b34cb61 method=GET route=/usuarios/:id statusCode=200 durationMs=1
```
Repare que o registro usa `/usuarios/:id` (o padrão), não `/usuarios/42`.

**Depois — `/lento` (atraso de 2s):**
```
2026-09-16T22:37:23.538Z [info] request requestId=b325b7ea-c164-4efd-b68e-6792ec652f32 method=GET route=/lento statusCode=200 durationMs=2003
```

---

## Saída dos cinco cenários da tabela

| Requisição | Expectativa | Linha observada (copiada) |
|------------|-------------|---------------------------|
| `GET /health` | 200, duração > 0 | `route=/health statusCode=200 durationMs=3` |
| `GET /rota-inexistente` | 404 (não 200) | `route=/rota-inexistente statusCode=404 durationMs=1` |
| `GET /usuarios/42` | rota agregável | `route=/usuarios/:id statusCode=200 durationMs=1` |
| `GET /erro` | 500, erro associado, 1 única linha | `[error] erro na requisicao err=Error: falha interna forcada pelo teste` + stack + `route=/erro statusCode=500 durationMs=4` |
| `GET /lento` | duração coerente com 2s | `route=/lento statusCode=200 durationMs=2003` |

A rota `/erro` gerou **dois** registros distintos (o `[error]` com a stack, do handler de erro, e o `[info] request ... statusCode=500`) — exatamente o esperado: o erro associado ao log de request, sem duplicar a linha `request`.

---

## Perguntas orientadoras respondidas

**Por que o log de conclusão não pode ser emitido antes de `next()`?**
Porque naquele ponto a rota ainda **não rodou**: o status é o default (200) e a duração é zero. O evento `finish` é o sinal de que tudo terminou.

**Qual campo permite juntar todas as linhas de uma mesma requisição?**
O `requestId` (UUID). Mesmo que uma requisição gere várias linhas (request + erro + segurança), todas carregam o mesmo id.

**Por que registrar o corpo completo da requisição é um risco?**
O corpo pode conter senha, token, CPF ou cartão. Vazar isso no log expõe dados sensíveis a qualquer pessoa com acesso aos arquivos de log. Só o que é necessário para diagnóstico (method, rota, status, duração, id) entra.

**Onde entra o middleware de tratamento de erros na ordem de registro?**
Por último, depois de todas as rotas. Ele captura exceções que as rotas lançaram e que nenhum outro middleware tratou.

**Qual a vantagem de um campo numérico de duração sobre um texto como '132ms'?**
Números são agregáveis: dá para calcular média, p95, máximos. Texto exige parsing e quebra qualquer ordem de grandeza.

---

## Validações
```bash
npx tsc --noEmit   # ✅ sem erros
npm run lint       # ✅ sem warnings
npx ts-node src/teste-exercicio-05.ts   # ✅ 5 requisições com status/duração reais
```

---

## Aprendizados
- A **ordem de registro** decide se o middleware alcança as requisições (antes das rotas = cobertura total).
- `res.statusCode` só é definitivo no evento `finish`.
- Relógio de alta resolução (`hrtime.bigint`) para medir intervalos curtos; `Date` não serve.
- `req.route?.path` agrega rotas com parâmetro; `req.originalUrl` é o fallback para 404.
- `close` cobre o cliente que cancela; flag evita duplicação.
- `requestId` correlaciona as linhas de uma mesma requisição.