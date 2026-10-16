import path from "node:path";
import { caminhos, config } from "./config.js";
import { gravarJson, log } from "./util.js";

/**
 * Chamadas à Graph API da Meta (WhatsApp Cloud API).
 * Em DRY_RUN o request é gravado em saida-simulada/meta/ e a resposta é simulada.
 */

export interface ResultadoMeta {
  simulado: boolean;
  request: { metodo: string; url: string; body: unknown };
  resposta: any;
  arquivo?: string;
}

export async function chamarGraph(
  acao: string,
  metodo: "POST" | "GET",
  rota: string,
  corpo: unknown,
  respostaSimulada: unknown,
): Promise<ResultadoMeta> {
  const url = `https://graph.facebook.com/${config.metaGraphVersion}/${rota}`;
  const request = { metodo, url, body: corpo };

  if (config.dryRun) {
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const arquivo = gravarJson(path.join(caminhos.saidaMeta, `${carimbo}-${acao}.json`), {
      simulado: true,
      acao,
      request: { ...request, headers: { Authorization: "Bearer ***" } },
      resposta_simulada: respostaSimulada,
    });
    log(`Meta ${metodo} /${rota}`, `${acao} (${arquivo})`);
    return { simulado: true, request, resposta: respostaSimulada, arquivo };
  }

  if (!config.metaToken) throw new Error("DRY_RUN=false exige META_TOKEN no .env.");
  const r = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${config.metaToken}`, "Content-Type": "application/json" },
    body: metodo === "POST" && corpo ? JSON.stringify(corpo) : undefined,
  });
  const resposta = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Graph API respondeu ${r.status}: ${JSON.stringify(resposta).slice(0, 300)}`);
  log(`Meta ${metodo} /${rota}`, `${acao} ok`);
  return { simulado: false, request, resposta };
}
