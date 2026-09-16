# Exercício 4 - Logs Estruturados com Winston

## Objetivo
Investigar por que o logger de um serviço de pedidos não exibia o início e o fim de cada processamento em produção, e corrigir para que **todo** caminho de execução gere registro, em formato estruturado, sem dados sensíveis.

---

## Código Original (com o defeito)

```typescript
import winston from 'winston';
export const logger = winston.createLogger({
  level: 'error',                                   // nível fixo
  transports: [new winston.transports.Console()]
});

export async function processOrder(orderId: string): Promise<number> {
  logger.info('inicio do processamento');
  const order = await findOrder(orderId);
  const total = order.items.reduce((sum, item) => sum + item.price, 0);
  logger.info('fim do processamento ' + JSON.stringify(order));  // concatena objeto inteiro
  return total;
}
```

---

## Registro da Investigação

**Sintoma:** Em produção, nenhuma linha de log de processamento aparecia. Em execução local, as únicas linhas visíveis eram as de `console.log` do roteiro de teste.

**Passos para reproduzir:**
1. Executar o arquivo com um pedido válido (`ORD-1`).
2. Executar com um pedido inexistente (`ORD-999`).
3. Observar o terminal.

**Resultado esperado:** Linhas de `inicio do processamento`, `fim do processamento` e, no caminho de erro, a falha registrada com detalhes.

**Resultado obtido (linhas copiadas do terminal, com o código original):**
```
--- CENARIO 1: pedido valido ORD-1 ---
retorno: 50
--- CENARIO 2: pedido inexistente ORD-999 ---
ERRO (relancado): Pedido ORD-999 nao encontrado
```
Nenhuma linha de log do Winston apareceu — nem o início, nem o fim, nem o erro.

**Hipótese:** As mensagens de `info` estão sendo filtradas pelo próprio logger antes de chegar ao console.

**Ferramenta utilizada:** Terminal (observação direta da saída) + leitura da configuração do Winston.

**Causa encontrada:**
1. **Nível do logger maior que o nível da mensagem.** O logger foi criado com `level: 'error'`, mas as linhas de início/fim são emitidas com `logger.info(...)`. Na hierarquia do Winston, `error` (0) é mais grave que `info` (6); o transport **descarta qualquer coisa com prioridade menor** que o nível configurado. Ou seja, como `info` < `error` na ordenação, as mensagens de início e fim são eliminadas **antes** de chegar ao console.
2. **Nível fixo.** O valor `'error'` estava gravado no código; produção e desenvolvimento compartilhavam o mesmo comportamento.
3. **Dados sensíveis concatenados na string.** `logger.info('fim do processamento ' + JSON.stringify(order))` imprimiria o objeto do pedido **inteiro**, incluindo o `cpf` do cliente, caso o nível permitisse.
4. **Caminho de erro sem registro de fim.** Se `findOrder` rejeitasse, a função saltaria direto para a rejeição e a última linha (`fim`) nunca rodaria.
5. **Erro perdendo stack.** `logger.error(err.message)` registra apenas o texto, sem a *stack trace* — o que impede saber onde a falha ocorreu.

---

## Correção Aplicada

### 1. `src/logger.ts` — configuração central (única em todo o projeto)

```typescript
const level = process.env.LOG_LEVEL ?? "info";   // nível por variável de ambiente

export const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),       // preserva stack de Errors
    winston.format.timestamp(),                    // data/hora automática nos campos
    stripSensitive(),                              // remove campos sensíveis (recursivo)
    process.env.NODE_ENV === "production"
      ? winston.format.json()                      // produção: JSON (leitura por máquina)
      : readableFormat                             // dev: texto legível para leitura humana
  ),
  transports: [new winston.transports.Console()],
});
```

Decisões:
- **Nível por ambiente:** `LOG_LEVEL=debug|info|warn|error`; sem variável, o padrão seguro é `info` (não omite `info` nem inunda com `debug`).
- **timestamp automático:** a data **não** é escrita à mão dentro da mensagem — ela entra como campo estruturado, permitindo leitura por máquina e ordenação confiável.
- **Metadados separados da mensagem:** `logger.info("inicio do processamento", { orderId })`. O objeto vai como campo, não concatenado na string.
- **Redação de dados sensíveis:** um formato `stripSensitive()` varre os metadados **recursivamente** e remove chaves como `cpf`, `token`, `cardNumber`, `senha`. Descobrimos durante o teste que varrer só a superfície deixava o CPF vazar quando ele estava aninhado (ex.: `customer.cpf`).

### 2. `src/exercicio-04-logs.ts` — `processOrder` corrigido

```typescript
export async function processOrder(orderId: string): Promise<number> {
  logger.info("inicio do processamento", { orderId });   // metadado estruturado

  let total = 0;
  try {
    const order = await findOrder(orderId);
    total = order.items.reduce((sum, item) => sum + item.price, 0);
    return total;
  } catch (err) {
    logger.error("falha ao processar pedido", { orderId, err });  // Error completo (stack)
    throw err;                                                     // relança: não engole o erro
  } finally {
    logger.info("fim do processamento", { orderId, total });       // roda SEMPRE (sucesso ou falha)
  }
}
```

O `finally` garante que a linha de fim **nunca** se perde, mesmo quando a função falha. O objeto do pedido **nunca** é logado inteiro — apenas `orderId` e `total`, que não são sensíveis.

---

## Linhas de log ANTES e DEPOIS da correção

**Antes (código original) — pedido válido:**
```
--- CENARIO 1: pedido valido ORD-1 ---
retorno: 50
```
Nenhuma linha de log. Silêncio completo.

**Depois — pedido válido (mesma chamada `processOrder("ORD-1")`):**
```
2026-09-16T22:26:36.098Z [info] inicio do processamento orderId=ORD-1
2026-09-16T22:26:36.112Z [info] fim do processamento orderId=ORD-1 total=50
```

**Depois — pedido inexistente (`processOrder("ORD-999")`), linha de erro COPIADA do terminal:**
```
2026-09-16T22:26:36.112Z [info] inicio do processamento orderId=ORD-999
2026-09-16T22:26:36.122Z [error] falha ao processar pedido orderId=ORD-999 err=AppError: Pedido ORD-999 nao encontrado
    at findOrder (C:\Users\User 1\Documents\tech-skills\aula type\pratica-debugging\src\exercicio-04-logs.ts:47:11)
    at async processOrder (C:\Users\User 1\Documents\tech-skills\aula type\pratica-debugging\src\exercicio-04-logs.ts:67:19)
    at async runExercicio04 (C:\Users\User 1\Documents\tech-skills\aula type\pratica-debugging\src\exercicio-04-logs.ts:91:5)
2026-09-16T22:26:36.125Z [info] fim do processamento orderId=ORD-999 total=0
```
O erro aparece **com a stack trace completa** e a linha de fim **não se perdeu** (total=0, pois o cálculo não concluiu).

---

## Cenários mínimos testados

| Cenário | Comando | O que foi verificado |
|---------|---------|----------------------|
| Pedido válido | `npx ts-node src/exercicio-04-logs.ts` | Início e fim aparecem, nessa ordem, com timestamp |
| Pedido inexistente | idem | Erro com stack + linha de fim emitida |
| `LOG_LEVEL=error` | `LOG_LEVEL=error npx ts-node src/exercicio-04-logs.ts` | Somente `[error]` permanece na saída (infos filtradas) |
| Dado sensível | idem | CPF **não aparece** em nenhuma linha impressa |

**Evidência do cenário de dado sensível (linha copiada do terminal):**
```
2026-09-16T22:26:36.125Z [info] debug checkout (teste de campo sensivel) orderId=ORD-2 customer={"name":"João Souza"}
```
O objeto `customer` tinha `{ name, cpf }`. A saída contém **apenas** o nome — o campo `cpf` foi removido pelo `stripSensitive` recursivo.

**Evidência do `LOG_LEVEL=error` (linha copiada do terminal):**
```
2026-09-16T22:26:39.449Z [error] falha ao processar pedido orderId=ORD-999 err=AppError: Pedido ORD-999 nao encontrado
    at findOrder (...exercicio-04-logs.ts:47:11)
```
As linhas `[info]` desapareceram; a linha `[error]` (mais grave) permaneceu.

---

## Desvio encontrado durante o teste (CPF vazando em objeto aninhado)

Na primeira versão do `stripSensitive`, o filtro só checava as chaves do **primeiro nível** do objeto logado. No cenário 3, metadados `{ orderId, customer }` passaram pela verificação (nem `orderId` nem `customer` estão na lista sensível) e o CPF **aninhado** em `customer.cpf` vazou:

```
2026-09-16T22:26:11.108Z [info] debug checkout (teste de campo sensivel) orderId=ORD-2 customer={"name":"João Souza","cpf":"987.654.321-00"}
```

**Correção aplicada:** o filtro passou a varrer os metadados **recursivamente** (`redactDeep`): percorre objetos e arrays internos e descarta qualquer chave sensível onde estiver. Ainda assim, a regra mais importante é **não logar objetos completos**: `processOrder` só registra `orderId` e `total`.

---

## Perguntas orientadoras respondidas

**Qual a diferença entre o nível do logger e o nível da mensagem?**
O nível do logger é o **limite** da configuração: mensagens com prioridade menor são descartadas. O nível da mensagem é o da **chamada** (`logger.info`, `logger.error`...). `level: 'error'` no logger significa "mostre só error (e acima)"; as chamadas `info` ficam abaixo desse limite e são filtradas.

**Por que `error` deve receber o objeto Error e não apenas a mensagem dele?**
`logger.error(err.message)` guarda só o texto. Passando `{ err }` (o objeto `Error` completo), o formato `errors({ stack: true })` preserva a **stack trace**, que mostra o arquivo e a linha onde o erro aconteceu — informação essencial para diagnosticar.

**O que muda entre a saída de desenvolvimento e a de produção?**
Desenvolvimento usa um formato legível (`printf` com nível e campos separados), bom para o olho humano. Produção usa **JSON estruturado**, facilmente consumido por ferramentas (ELK, grafana, agregadores). A troca é feita pela variável `NODE_ENV`.

**Por que escrever a data manualmente dentro da mensagem atrapalha a leitura por máquina?**
Em JSON, `"message": "2026-09-16 ... inicio"` mistura o dado no texto livre; um parser não consegue filtrar/ordenar por data de forma confiável. Com `timestamp` como **campo próprio**, a ferramenta ordena e filtra sem ambiguidade.

**Qual informação pertence ao log e qual pertence à resposta enviada ao usuário?**
Ao **log** pertence o diagnóstico completo (stack, arquivo, contexto interno). À **resposta** pertence apenas o que o cliente precisa saber (ex.: "pedido não encontrado", `404`). Detalhes internos na resposta vazam arquitetura e ajudam atacantes.

---

## Validações
```bash
npx tsc --noEmit   # ✅ sem erros
npm run lint       # ✅ sem warnings
```
Os 4 cenários mínimos acima foram executados e as saídas conferidas linha a linha.

---

## Aprendizados
- `level` do logger filtra as chamadas menos graves **antes** do transport.
- Nível configurável por ambiente (`process.env.LOG_LEVEL`) em vez de fixo no código.
- Metadados como objeto (`{ orderId }`), nunca concatenação (`'texto ' + obj`).
- `finally` é o bloco que garante registro em **todos** os caminhos de execução.
- Redação de dados sensíveis precisa ser **recursiva** (testar com campo aninhado).
- Registrar o erro como objeto preserva a stack; registrar `err.message` a perde.
- `console.log` não é logger de aplicação: Winston (ou Pino) entrega nível, timestamp e estrutura.