// src/errors/app-error.ts
// AppError representa um erro CONHECIDO/ESPERADO da aplicação
// Diferente de Error nativo, transporta também o statusCode HTTP

export class AppError extends Error {
  // readonly: não pode ser alterado após a criação
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    // super inicializa Error.message (obrigatório em subclasse de Error)
    super(message);

    this.statusCode = statusCode;
    this.name = "AppError";

    // Captura a stack trace apontando para onde o erro foi lançado
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}