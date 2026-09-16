// src/exercicio-04-logs.ts
// Exercício 4 - Logs estruturados com Winston
// O serviço deveria registrar o início e o fim de cada processamento e qualquer
// erro de execução. No código original isso não acontecia. Investigação e
// correções descritas no docs exercícios/exercicio-04-logs-winston.md

import { AppError } from "./errors/app-error";
import { logger } from "./logger";

// ---- Tipos que representam um pedido ------------------------------
// A interface Order contém 'cpf' justamente para provar que dados
// sensíveis NUNCA aparecem no log (o logger remove/evita esses campos)
interface OrderItem {
  name: string;
  price: number;
}

interface Order {
  id: string;
  customer: { name: string; cpf: string };
  items: OrderItem[];
}

// "Banco de dados" em memória usado nos testes
const orders: Order[] = [
  {
    id: "ORD-1",
    customer: { name: "Maria Silva", cpf: "123.456.789-00" },
    items: [
      { name: "caneca", price: 20 },
      { name: "caderno", price: 30 },
    ],
  },
  {
    id: "ORD-2",
    customer: { name: "João Souza", cpf: "987.654.321-00" },
    items: [{ name: "teclado", price: 150 }],
  },
];

// Simula uma consulta assíncrona ao "banco de dados"
async function findOrder(orderId: string): Promise<Order> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  const order = orders.find((item) => item.id === orderId);
  if (!order) {
    // AppError (criado nos exercícios 1-3): erro esperado, com status HTTP
    throw new AppError(`Pedido ${orderId} nao encontrado`, 404);
  }
  return order;
}

// Processa um pedido e retorna o total
//
// CORREÇÕES em relação ao código original do exercício:
// 1) 'inicio' agora é info (antes o nível do logger era 'error' → nunca aparecia)
// 2) metadados como OBJETO SUPLICADO ({ orderId }), não concatenados na string
// 3) o log de 'fim' NÃO recebe o objeto do pedido inteiro (que contém cpf)
//    → apenas orderId e total, que são dados seguros
// 4) try/catch/finally: o erro é registrado com stack E a linha de 'fim'
//    é emitida também no caminho de erro (finally roda sempre)
// 5) o erro é RELANÇADO (throw err) para o chamador - não é "engolido"
export async function processOrder(orderId: string): Promise<number> {
  logger.info("inicio do processamento", { orderId });

  let total = 0;
  try {
    const order = await findOrder(orderId);
    total = order.items.reduce((sum, item) => sum + item.price, 0);
    return total;
  } catch (err) {
    // Passa o objeto Error como metadado (não apenas err.message):
    // assim o formato errors({ stack: true }) preserva a stack completa
    logger.error("falha ao processar pedido", { orderId, err });
    throw err;
  } finally {
    // finally executa SEMPRE: sucesso ou falha → a linha de fim nunca se perde
    logger.info("fim do processamento", { orderId, total });
  }
}

// ---- Demonstração dos cenários do exercício 4 ---------------------
// Cada bloco imprime um título via console.log (apenas para separar os cenários
// na leitura do terminal). As LINHAS DE LOG são produzidas pelo Winston.
export async function runExercicio04(): Promise<void> {
  console.log("CENARIO 1 - Pedido valido (ORD-1 existe)");
  const total = await processOrder("ORD-1");
  console.log(`   -> retorno da funcao: ${total}\n`);

  console.log("CENARIO 2 - Pedido inexistente (ORD-999 nao existe)");
  try {
    await processOrder("ORD-999");
  } catch (err) {
    // O erro JÁ foi registrado no log (com stack) dentro do processOrder.
    // Aqui apenas repassa o que aconteceu para o terminal e segue o teste.
    console.log(`   -> processOrder relancou o erro: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  console.log("CENARIO 3 - Pedido valido com dado sensivel no metadado");
  // Propositalmente tentamos logar o objeto do cliente inteiro (com cpf)
  // para demonstrar que o formato do logger REMOVE o campo antes do print
  const order = orders[1];
  logger.info("debug checkout (teste de campo sensivel)", {
    orderId: order.id,
    customer: order.customer, // contém cpf - deve sumir da saída
  });
  console.log("   -> nenhuma linha acima pode conter o cpf 987.654.321-00\n");

  console.log("CENARIO 4 - Nivel LOG_LEVEL=error (testado separadamente via env)");
  console.log("   -> execute: LOG_LEVEL=error npx ts-node src/exercicio-04-logs.ts");
}

// Executa os cenários quando o arquivo é rodado diretamente
// (npx ts-node src/exercicio-04-logs.ts)
void runExercicio04();