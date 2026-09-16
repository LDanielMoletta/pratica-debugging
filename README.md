# Prática de Debugging - Node.js + TypeScript

Lista de exercícios sobre técnicas de debugging:
- **Exercícios 1 a 3:** investigação com console, tratamento de erros tipado e depuração no VS Code (defeito visível em uma execução no terminal).
- **Exercícios 4 a 6:** observabilidade e diagnóstico (logs estruturais, middleware de logging e PM2) — o defeito aparece na **saída que a aplicação produz enquanto roda**.

---

## Estrutura do Projeto

```
pratica-debugging/
├── .vscode/
│   ├── launch.json               # Configuração do debugger (ts-node)
│   ├── settings.json             # Configurações do VS Code
│   └── extensions.json           # Extensões recomendadas
├── docs exercícios/               # Documentação acadêmica de cada exercício
│   ├── exercicio-01-debug-basico.md
│   ├── exercicio-02-tratamento-erros.md
│   ├── exercicio-03-debugging-vscode.md
│   ├── exercicio-04-logs-winston.md
│   ├── exercicio-05-middleware-logging.md
│   └── exercicio-06-diagnostico-pm2.md
├── ecosystem.config.js          # Configuração do PM2 (Exercício 6)
├── src/
│   ├── errors/
│   │   └── app-error.ts          # AppError (erro conhecido + statusCode)
│   ├── middlewares/
│   │   └── request-logger.ts    # Middleware de logging (Exercício 5)
│   ├── exercicio-01-calculate-total.ts   # Ex 1: console.log/trace
│   ├── exercicio-02-error-handling.ts    # Ex 2: try/catch + AppError
│   ├── exercicio-03-installments.ts      # Ex 3: parcelas + breakpoint
│   ├── logger.ts                 # Logger Winston (Exercício 4)
│   ├── exercicio-04-logs.ts      # Ex 4: processOrder + cenários
│   ├── exercicio-05-logging-middleware.ts  # Ex 5: app com 5 rotas
│   ├── teste-exercicio-05.ts     # Roteiro de teste do Ex 5
│   ├── server.ts                 # Ex 6: servidor sob PM2 (corrigido)
│   └── index.ts                  # Executa os exercícios 1 a 4
├── eslint.config.js
├── nodemon.json
├── package.json
└── tsconfig.json
```

---

## Exercícios

### 1. Debug básico com console.log e console.trace
`calculateTotal` tinha 3 bugs: off-by-one (NaN), desconto errado (`* 0.1` em vez de `* 0.9`) e limite errado (`>` em vez de `>=`).
**Registro completo da investigação:** sintoma → hipótese → evidências → correção → 4 cenários testados.

### 2. Tratamento de erros com try/catch e AppError
`divide` validava entradas e lançava `AppError`. `execute(rawInput: unknown)` estreitava o tipo com checks e separava erro esperado (mensagem + status) de erro inesperado (log interno).
**7 cenários testados:** divisão normal, denominador zero, undefined, tipos errados, null, 0/0 e 0/5.

### 3. Debugging no VS Code com launch.json e ts-node
`buildInstallments` criava `quantity - 1` parcelas. Encontrado com breakpoint no `for` + Watch `installments.length`.
**Correção:** `<= quantity` + regra monetária (última parcela absorve diferença de centavos).
**5 testes após correção,** incluindo a soma exata para 100 com 3 e 6 parcelas.

---

## Exercícios 4 a 6 - Observabilidade e Diagnóstico

Nesta lista o defeito **não aparece em uma única execução**: ele aparece na saída que a aplicação produz
(trechos de log reais, copiados durante a investigação). Em cada exercício seguimos o fluxo
**reproduzir → observar → formular hipótese → investigar → corrigir → verificar**.

### 4. Logs estruturados com Winston
O logger com `level: 'error'` fixo **escondia** as mensagens de `info` ("início"/"fim" nunca apareciam) e, quando apareciam, traziam o objeto do pedido **inteiro (com CPF)** concatenado na string.
**Correções:** nível via `process.env.LOG_LEVEL`, timestamp + formato estruturado, metadados separados da mensagem, erro com stack, `finally` garantindo a linha de fim e **redação recursiva de campos sensíveis** (descoberta de CPF vazando em `customer.cpf` durante o teste).
**4 cenários testados:** pedido válido, pedido inexistente, `LOG_LEVEL=error` e campo sensível invisível na saída.

### 5. Middleware de logging de requisições
O middleware original logava **antes** de `next()`: status sempre 200 e duração ~0ms, e registrado **depois** das rotas (nunca executava).
**Correções:** log no evento `finish` (status definitivo), `process.hrtime.bigint()` para duração real, registro **antes** das rotas, `req.route?.path` para rota agregável, `requestId` (UUID) para correlacionar linhas e evento `close` para cliente que cancela.
**5 cenários testados:** `/health` (200), `/rota-inexistente` (404 real), `/usuarios/42` (rota agregável `/usuarios/:id`), `/erro` (500 com erro associado) e `/lento` (duração 2003ms para atraso de 2s).

### 6. Diagnóstico de processo com PM2
`throw` dentro de `setTimeout` escapa do ciclo da requisição e vira `uncaughtException` — o middleware de erro do Express **não** alcança esse erro.
**Investigação real com PM2:** o wrapper do PM2 registra listeners de `uncaughtException` (pm2-io-bpm + `domain` do Node), o que **impede** a queda do processo nesta versão (Node 24 + PM2 7) → a exceção é só logada e o processo segue vivo em estado corrompido, sem incrementar restarts.
**Correção:** o trabalho assíncrono passou a rodar em `try/catch` (resposta reflete a realidade: 500 com erro logado), mais handlers globais que **registram e encerram** o processo, e encerramento controlado por sinais.
**Validação:** dois testes após a correção (`/health` 200 e `/crash` 500) com contador de restarts **estável**; crash loop de demonstração deixou o contador escalando até 13 (falha visível, não mascarada).

---

## Como Executar

```bash
# Instalar dependências
npm install
npm install -g pm2            # Exercício 6 (global)

# Rodar exercícios 1 a 4
npx ts-node src/index.ts
# ou
npm run dev

# Exercício 4 - cenários de log (com LOG_LEVEL=error para o cenário 4)
npx ts-node src/exercicio-04-logs.ts
LOG_LEVEL=error npx ts-node src/exercicio-04-logs.ts

# Exercício 5 - subir o servidor de demonstração e rodar o roteiro de teste
npx ts-node src/exercicio-05-logging-middleware.ts
npx ts-node src/teste-exercicio-05.ts

# Exercício 6 - subir a aplicação sob o PM2
pm2 start ecosystem.config.js
pm2 logs api
pm2 list
pm2 describe api
# encerrar
pm2 delete api

# Qualidade
npm run lint
```

---

## Validações

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | ✅ Sem erros |
| `npx eslint src` | ✅ Sem warnings |
| 4 cenários Ex 1 | ✅ |
| 7 cenários Ex 2 | ✅ |
| 5 testes Ex 3 | ✅ |
| 4 cenários Ex 4 (log) | ✅ |
| 5 requisições Ex 5 | ✅ |
| Exercício 6 (2 testes + restarts estáveis) | ✅ |

---

## Regras seguidas na entrega (da lista de exercícios)
- Nenhum `console.log` de investigação ficou no código final
- Validações não foram apagadas para esconder erro
- Nenhum `any` usado para contornar o TypeScript
- Nenhum `catch` vazio
- O registro (sintoma/hipótese/evidência/correção) está nos arquivos de docs
- `console.log` não é o logger final da aplicação (Winston é o logger)
- Nenhum dado sensível (CPF etc.) aparece na saída dos logs
- Nenhum nível de log foi silenciado para a saída "ficar limpa"
- O reinício automático do PM2 não foi usado como substituto de correção