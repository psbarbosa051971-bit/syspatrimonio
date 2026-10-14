import { useEffect, useRef, useState } from "react";

export function usePreenchimentoNfe() {
  const emissaoRef = useRef<HTMLInputElement>(null);
  const [camposPreenchidos, setCamposPreenchidos] = useState<Set<string>>(new Set());
  const [leitura, setLeitura] = useState(0);

  function registrarPreenchimento(valores: Record<string, string>, focarEmissao = true) {
    setCamposPreenchidos((atuais) => new Set([
      ...atuais,
      ...Object.keys(valores).filter((chave) => valores[chave]?.trim()),
      ...(valores.emissao_mes ? ["emissao"] : []),
    ]));
    if (focarEmissao) setLeitura((atual) => atual + 1);
  }

  useEffect(() => {
    if (!leitura) return;
    // Aguarda o campo exibir o mês/ano antes de selecionar o dia.
    const tempo = setTimeout(() => {
      const campo = emissaoRef.current;
      if (!campo) return;
      campo.focus();
      campo.setSelectionRange(0, 2);
    }, 0);
    return () => clearTimeout(tempo);
  }, [leitura]);

  return { emissaoRef, camposPreenchidos, registrarPreenchimento };
}
