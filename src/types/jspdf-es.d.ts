// Tipos para a importação direta do bundle ESM do jspdf,
// usada porque o campo "exports" do jspdf não resolve na raiz no build do servidor.
declare module "jspdf/dist/jspdf.es.min.js" {
  export * from "jspdf";
}
