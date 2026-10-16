import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Raiz do repositório morph-fabrica.
 * O build fica em mcp/morph-n8n/dist, então a raiz está 3 níveis acima.
 * Pode ser sobrescrita com MORPH_ROOT.
 */
const aqui = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(process.env.MORPH_ROOT ?? path.join(aqui, "..", "..", ".."));

/** Carrega o .env da raiz sem dependências extras (não sobrescreve variáveis já definidas). */
function carregarEnv(): void {
  const arquivo = path.join(RAIZ, ".env");
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || linha.trim().startsWith("#")) continue;
    const [, chave, bruto] = m;
    const valor = bruto.replace(/^["']|["']$/g, "");
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}
carregarEnv();

export const config = {
  /** Modo simulação: ligado por padrão. Só desliga com DRY_RUN=false explícito. */
  dryRun: (process.env.DRY_RUN ?? "true").toLowerCase() !== "false",
  n8nUrl: (process.env.N8N_URL ?? "").replace(/\/$/, ""),
  n8nApiKey: process.env.N8N_API_KEY ?? "",
  metaToken: process.env.META_TOKEN ?? "",
  metaGraphVersion: process.env.META_GRAPH_VERSION ?? "v21.0",
};

export const caminhos = {
  contrato: path.join(RAIZ, "core", "contrato-core.md"),
  coreWorkflow: path.join(RAIZ, "core", "core.workflow.json"),
  verticais: path.join(RAIZ, "verticais"),
  clientes: path.join(RAIZ, "clientes"),
  saidaN8n: path.join(RAIZ, "saida-simulada", "n8n"),
  saidaMeta: path.join(RAIZ, "saida-simulada", "meta"),
};

/** Nomes de vertical, tool e cliente: minúsculas, números, _ e - (evita path traversal). */
export const NOME_VALIDO = /^[a-z][a-z0-9_-]{1,40}$/;

export function exigirNome(valor: string, campo: string): void {
  if (!NOME_VALIDO.test(valor)) {
    throw new Error(`${campo} inválido: "${valor}". Use minúsculas, números, "_" ou "-" (ex.: agendar_revisao).`);
  }
}
