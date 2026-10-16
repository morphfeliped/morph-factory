import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { caminhos, config } from "./config.js";
import { gravarJson, idFalso, log } from "./util.js";

/**
 * Cliente da API pública do n8n (/api/v1).
 * Em DRY_RUN nada sai da máquina: o request que seria feito é gravado em saida-simulada/n8n/.
 */

export interface WorkflowCriado {
  id: string;
  arquivo?: string;
}

function urlBase(): string {
  return config.n8nUrl || "https://SEU-N8N.exemplo.com";
}

async function chamarN8n(metodo: string, rota: string, corpo?: unknown): Promise<any> {
  if (!config.n8nUrl || !config.n8nApiKey) {
    throw new Error("DRY_RUN=false exige N8N_URL e N8N_API_KEY no .env.");
  }
  const r = await fetch(`${config.n8nUrl}/api/v1${rota}`, {
    method: metodo,
    headers: { "X-N8N-API-KEY": config.n8nApiKey, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`n8n respondeu ${r.status}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : {};
}

/** POST /api/v1/workflows. A API aceita apenas name, nodes, connections e settings. */
export async function criarWorkflow(nome: string, wf: any, prefixoId: string): Promise<WorkflowCriado> {
  const corpo = {
    name: nome,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" },
  };

  if (config.dryRun) {
    const id = idFalso(prefixoId);
    const arquivo = gravarJson(path.join(caminhos.saidaN8n, `${id}.json`), {
      simulado: true,
      criado_em: new Date().toISOString(),
      request: { metodo: "POST", url: `${urlBase()}/api/v1/workflows`, headers: { "X-N8N-API-KEY": "***" }, body: corpo },
      resposta_simulada: { id, name: nome, active: false },
    });
    log("n8n POST /workflows", `${nome} → id falso ${id} (${arquivo})`);
    return { id, arquivo };
  }

  const criado = await chamarN8n("POST", "/workflows", corpo);
  log("n8n POST /workflows", `${nome} → id ${criado.id}`);
  return { id: String(criado.id) };
}

/** Recupera um workflow (do arquivo simulado em DRY_RUN, ou GET /api/v1/workflows/:id). */
export async function buscarWorkflow(id: string): Promise<any> {
  if (config.dryRun) {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`id inválido: ${id}`);
    const arquivo = path.join(caminhos.saidaN8n, `${id}.json`);
    if (!existsSync(arquivo)) throw new Error(`Workflow ${id} não encontrado em saida-simulada/n8n/.`);
    return JSON.parse(readFileSync(arquivo, "utf8")).request.body;
  }
  return chamarN8n("GET", `/workflows/${encodeURIComponent(id)}`);
}
