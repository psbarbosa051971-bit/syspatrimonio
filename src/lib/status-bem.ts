type BemComStatus = { conferido: boolean; status?: string };

/** O status de localização é independente do tipo de aquisição do bem. */
export function statusBem(bem: BemComStatus): string {
  if (bem.conferido) return "LOCALIZADO";
  return bem.status === "HÁ CONFERIR" ? "HÁ CONFERIR" : "NÃO LOCALIZADO";
}

export function classeStatusBem(bem: BemComStatus): string {
  return bem.conferido ? "bem-localizado" : "bem-nao-localizado";
}
