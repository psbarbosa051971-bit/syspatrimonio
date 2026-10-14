import type { Json, Tables } from "@/integrations/supabase/types";

export const simNao = ["Sim", "Não"];
export const gruposChecklist = [
  { titulo: "Acessórios/equipamentos", campos: [
    { chave: "antena", nome: "Antena", opcoes: ["Comum", "Elétrica"] },
    { chave: "calota", nome: "Calota", opcoes: ["Comum", "Especial", "Sem calotas"] },
    { chave: "rodas", nome: "Rodas", opcoes: ["Comum", "Liga leve", "Alumínio"] },
    { chave: "manual", nome: "Manual do proprietário", opcoes: simNao },
    { chave: "som", nome: "Som", opcoes: ["Com multimídia", "Sem rádio"] },
    { chave: "acendedor", nome: "Acendedor de cigarros", opcoes: simNao },
    { chave: "chave_reserva", nome: "Chave reserva", opcoes: simNao },
    { chave: "alto_falante", nome: "Alto-falante", opcoes: simNao },
    { chave: "farol_auxiliar", nome: "Farol auxiliar", opcoes: simNao },
    { chave: "ar_condicionado", nome: "Ar-condicionado", opcoes: simNao },
    { chave: "cambio", nome: "Câmbio", opcoes: ["Manual / mecânico", "Automático", "Automatizado", "CVT"] },
    { chave: "estepe", nome: "Estepe", opcoes: simNao },
    { chave: "drl", nome: "DRL / luz diurna", opcoes: simNao },
  ] },
  { titulo: "Acessórios especiais", campos: [
    { chave: "bancos", nome: "Bancos", opcoes: ["Couro", "Tecido", "Híbrido"] },
    { chave: "usb_110v", nome: "USB / 110 V", opcoes: simNao },
    { chave: "computador", nome: "Computador de bordo", opcoes: simNao },
    { chave: "direcao", nome: "Direção", opcoes: ["Mecânica", "Hidráulica", "Elétrica"] },
    { chave: "teto_solar", nome: "Teto solar", opcoes: simNao },
    { chave: "tracao", nome: "Tração", opcoes: ["4x2", "4x4"] },
    { chave: "airbag", nome: "Airbag", opcoes: simNao },
    { chave: "retrovisor", nome: "Retrovisor", opcoes: ["Manual", "Elétrico"] },
    { chave: "freio", nome: "Tipo de freio", opcoes: ["ABS", "Comum"] },
    { chave: "gps", nome: "GPS", opcoes: simNao },
    { chave: "camera_re", nome: "Câmera de ré", opcoes: simNao },
    { chave: "saida_emergencia", nome: "Saída de emergência", opcoes: simNao },
    { chave: "cadeira_rodas", nome: "Cadeira de rodas", opcoes: simNao },
    { chave: "elevador", nome: "Elevador", opcoes: simNao },
  ] },
  { titulo: "Ferramentas", campos: [
    { chave: "triangulo", nome: "Triângulo", opcoes: simNao },
    { chave: "macaco", nome: "Macaco", opcoes: simNao },
    { chave: "chave_roda", nome: "Chave de roda", opcoes: simNao },
    { chave: "alicate", nome: "Alicate", opcoes: simNao },
  ] },
  { titulo: "Estado do veículo", campos: ["Pintura", "Tapeçaria", "Pneus", "Mecânica", "Elétrica", "Lataria"].map((nome) => ({
    chave: nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), nome, opcoes: ["Bom", "Regular", "Péssimo"],
  })) },
];

export function ehVeiculo(bem: Pick<Tables<"bens">, "descricao" | "tipo">): boolean {
  const texto = `${bem.descricao} ${bem.tipo ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  // O prefixo identifica o veículo mesmo no plural e com motor/peças na descrição.
  if (/^\s*VEICULOS?\b/.test(texto)) return true;
  // Não confunde peças ou brinquedos com veículos completos.
  if (/\b(PECAS?|PNEUS?|BATERIA|BRINQUEDO|MINIATURA|CARRINHO|MOTOR|CARRO DE MAO|CARRO PARA|CARRO DE TRANSPORTE|CARRO DE EMERGENCIA|CARRO MACA|CARRO DE CURATIVO|CARRO DE LIMPEZA)\b/.test(texto)
    && !/^\s*(VEICULO|AUTOMOVEL|CAMINHAO|ONIBUS|MICRO.?ONIBUS|MOTOCICLETA|AMBULANCIA|CAMIONETA|CAMINHONETE)\b/.test(texto)) return false;
  return /\b(VEICULOS?|AUTOMOVEL|AUTOMOVEIS|CARRO|CAMINHAO|CAMINHOES|CAMINHONETE|CAMIONETA|ONIBUS|MICRO.?ONIBUS|MOTOCICLETA|MOTONETA|AMBULANCIA|FURGAO|VAN|UTILITARIO)\b/.test(texto);
}

export function lerDadosRecebimento(json: Json | undefined): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return Object.fromEntries(Object.entries(json).filter((entrada): entrada is [string, string] => typeof entrada[1] === "string"));
}

// Separa apenas identificadores reconhecidos; mantém marca, modelo, cor e motorização.
export function extrairDadosVeiculo(descricao: string): { modelo: string; dados: Record<string, string> } {
  const dados: Record<string, string> = {};
  const numero = String.raw`(?:N(?:\s*[º°o.]|\b)\s*)?[:=\-]?\s*`;
  const campos: { chave: string; padrao: RegExp; validar?: (valor: string) => boolean }[] = [
    { chave: "ano_modelo", padrao: new RegExp(String.raw`\bANO\s*(?:\/\s*|[- ]\s*)MOD(?:ELO)?\.?\s*[:=\-]?\s*(\d{4}\s*[/\-]\s*\d{4})\b`, "gi") },
    { chave: "chassi", padrao: new RegExp(String.raw`\bCHASS[IÍ]S?\s*${numero}([A-Z0-9]{11,17})\b`, "gi") },
    { chave: "renavam", padrao: new RegExp(String.raw`\bRENAVAM\s*${numero}(\d{9,11})\b`, "gi") },
    { chave: "motor", padrao: new RegExp(String.raw`\bMOTOR\s*${numero}([A-Z0-9][A-Z0-9*./-]{3,})\b`, "gi"),
      validar: (valor) => (valor.match(/\d/g) ?? []).length >= 4 },
    { chave: "placa", padrao: new RegExp(String.raw`\bPLACA\s*${numero}([A-Z]{3}\s*-?\s*\d[A-Z0-9]\d{2})\b`, "gi") },
    { chave: "km", padrao: /\b(?:KM|QUILOMETRAGEM)\s*[:=\-]?\s*(\d+(?:[.,]\d+)*)\b/gi },
  ];
  let modelo = descricao;
  for (const { chave, padrao, validar } of campos) {
    modelo = modelo.replace(padrao, (trecho: string, valor: string) => {
      if (validar && !validar(valor)) return trecho;
      // Em caso de identificadores repetidos, não descarta informações diferentes.
      const extraido = chave === "km" ? valor.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")
        : valor.replace(/\s/g, "").replace(/^(\d{4})-(\d{4})$/, "$1/$2");
      if (dados[chave] && dados[chave] !== extraido) return trecho;
      dados[chave] = extraido;
      return " ";
    });
  }
  modelo = modelo.replace(/\bSEMIN\s*$/i, "")
    .replace(/\s+/g, " ").replace(/\s+([,;])/g, "$1")
    .replace(/(?:\s*[,;/|]\s*){2,}/g, ", ")
    .replace(/^[\s,;/|\-]+|[\s,;/|\-]+$/g, "").trim();
  return { modelo, dados };
}

export function descricaoDetalhada(dados: Record<string, string>, modelo = ""): string {
  return [
    `VEÍCULO/MODELO: ${modelo.trim()}`,
    ...[["ANO/MOD", "ano_modelo"], ["CHASSI", "chassi"], ["MOTOR Nº", "motor"], ["RENAVAM", "renavam"], ["PLACA", "placa"], ["KM", "km"]]
      .map(([nome, chave]) => `${nome}: ${dados[chave]?.trim() ?? ""}`),
  ].join("\n");
}
