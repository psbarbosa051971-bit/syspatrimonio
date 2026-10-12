// A máscara é apenas visual; não altera os códigos gravados no cadastro.
export function normalizarCodigoRed(codigo: string): string {
  return codigo.trim().replace(/[.\s]/g, "");
}

export function formatarCodigoRed(codigo: string): string {
  const numeros = normalizarCodigoRed(codigo);
  return /^\d+$/.test(numeros) ? numeros.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : codigo;
}
