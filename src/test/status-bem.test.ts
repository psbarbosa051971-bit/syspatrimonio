import { describe, expect, it } from "vitest";
import { classeStatusBem, statusBem } from "@/lib/status-bem";

describe("status de localização dos bens", () => {
  it("usa não localizado como padrão, inclusive para registros antigos", () => {
    const bem = { conferido: false };
    expect(statusBem(bem)).toBe("NÃO LOCALIZADO");
    expect(classeStatusBem(bem)).toBe("bem-nao-localizado");
  });

  it("preserva há conferir quando esse status estiver registrado", () => {
    expect(statusBem({ conferido: false, status: "HÁ CONFERIR" })).toBe("HÁ CONFERIR");
  });

  it("prioriza a marcação de localizado e usa a classe azul", () => {
    const bem = { conferido: true, status: "NÃO LOCALIZADO" };
    expect(statusBem(bem)).toBe("LOCALIZADO");
    expect(classeStatusBem(bem)).toBe("bem-localizado");
  });
});
