# Prática de Debugging - Node.js + TypeScript

Lista de exercícios sobre técnicas de debugging: investigação com console, tratamento de erros tipado e depuração no VS Code.

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
│   └── exercicio-03-debugging-vscode.md
├── src/
│   ├── errors/
│   │   └── app-error.ts          # AppError (erro conhecido + statusCode)
│   ├── exercicio-01-calculate-total.ts   # Ex 1: console.log/trace
│   ├── exercicio-02-error-handling.ts    # Ex 2: try/catch + AppError
│   ├── exercicio-03-installments.ts      # Ex 3: parcelas + breakpoint
│   └── index.ts                  # Executa todos os exercícios
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

## Como Executar

```bash
# Instalar dependências
npm install

# Rodar todos os exercícios
npx ts-node src/index.ts
# ou
npm run dev

# Qualidade
npm run lint

# Depuração no VS Code
# 1. abra src/exercicio-03-installments.ts
# 2. coloque breakpoint no for
# 3. F5 → "Debug TypeScript"
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

---

## Regras seguidas na entrega (da lista de exercícios)
- Nenhum `console.log` de investigação ficou no código final
- Validações não foram apagadas para esconder erro
- Nenhum `any` usado para contornar o TypeScript
- Nenhum `catch` vazio
- O registro (sintoma/hipótese/evidência/correção) está nos arquivos de docs