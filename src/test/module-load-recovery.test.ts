import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isModuleLoadError, recoverModuleLoad } from "@/lib/module-load-recovery";

const loadError = new TypeError(
  "Failed to fetch dynamically imported module: https://example.test/assets/departamentos.js",
);

let reload: ReturnType<typeof vi.fn>;
let storage: Map<string, string>;
let online: boolean;

beforeEach(() => {
  reload = vi.fn();
  storage = new Map();
  online = true;
  vi.spyOn(Date, "now").mockReturnValue(100_000);
  vi.stubGlobal("window", {
    navigator: { get onLine() { return online; } },
    location: { reload },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Recuperação do carregamento da página", () => {
  it("reconhece falhas de importação nos navegadores", () => {
    expect(isModuleLoadError(loadError)).toBe(true);
    expect(isModuleLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isModuleLoadError("error loading dynamically imported module")).toBe(true);
    expect(isModuleLoadError(new Error("Erro ao salvar departamento"))).toBe(false);
  });

  it("recarrega apenas uma vez dentro do intervalo, inclusive após nova tentativa", () => {
    expect(recoverModuleLoad(loadError)).toBe(true);
    expect(recoverModuleLoad(loadError)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.mocked(Date.now).mockReturnValue(160_001);
    expect(recoverModuleLoad(loadError)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("não recarrega por outros erros ou quando está sem conexão", () => {
    expect(recoverModuleLoad(new Error("Erro no formulário"))).toBe(false);
    online = false;
    expect(recoverModuleLoad(loadError)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("evita ciclos quando o navegador bloqueia o armazenamento", () => {
    vi.stubGlobal("window", {
      navigator: { onLine: true },
      location: { reload },
      get sessionStorage() { throw new Error("Acesso bloqueado"); },
    });
    expect(recoverModuleLoad(loadError)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("não acessa recursos do navegador durante a execução no servidor", () => {
    vi.stubGlobal("window", undefined);
    expect(recoverModuleLoad(loadError)).toBe(false);
  });
});
