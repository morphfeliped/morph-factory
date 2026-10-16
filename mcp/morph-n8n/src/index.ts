#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { RAIZ, caminhos, config, exigirNome } from "./config.js";
import { chamarGraph } from "./meta.js";
import { buscarWorkflow, criarWorkflow } from "./n8n.js";
import { erro, gravarJson, log, parseJson, relativo, resposta } from "./util.js";
import { checarFormatoWorkflow, validarSubworkflow } from "./validacao.js";

/** Variáveis que o próprio core preenche em tempo de execução (ver contrato-core.md). */
const VARIAVEIS_DO_CORE = ["data_hoje", "nome_contato"];

const server = new McpServer({ name: "morph-n8n", version: "0.1.0" });

/** Envolve o handler: loga, captura exceções e devolve erro legível ao agente. */
function seguro<A>(nome: string, fn: (args: A) => Promise<any>) {
  return async (args: A) => {
    log(`→ ${nome}`, resumoArgs(args));
    try {
      return await fn(args);
    } catch (e) {
      log(`✗ ${nome}`, (e as Error).message);
      return erro((e as Error).message);
    }
  };
}

function resumoArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  return Object.entries(args as Record<string, unknown>)
    .map(([k, v]) => {
      if (k === "pin") return "pin=******";
      if (typeof v === "string") return `${k}=${v.length > 40 ? v.slice(0, 40) + "…" : v}`;
      return `${k}=${typeof v === "object" ? "{…}" : v}`;
    })
    .join(" ");
}

function lerJson(arquivo: string): any {
  return JSON.parse(readFileSync(arquivo, "utf8"));
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// ───────────────────────── Leitura ─────────────────────────

server.registerTool(
  "ler_contrato_core",
  { description: "Retorna core/contrato-core.md: o contrato que todo vertical e toda tool devem seguir.", inputSchema: {} },
  seguro("ler_contrato_core", async () => resposta("Contrato do core:\n\n" + readFileSync(caminhos.contrato, "utf8"))),
);

server.registerTool(
  "listar_verticais",
  { description: "Lista os verticais existentes em verticais/ com descrição e tools registradas.", inputSchema: {} },
  seguro("listar_verticais", async () => {
    const lista = readdirSync(caminhos.verticais)
      .filter((d) => statSync(path.join(caminhos.verticais, d)).isDirectory())
      .map((d) => {
        const arq = path.join(caminhos.verticais, d, "vertical.json");
        if (!existsSync(arq)) return { nome: d, status: "em construção (sem vertical.json)" };
        const v = lerJson(arq);
        return { nome: d, status: "registrado", descricao: v.descricao, tools: (v.tools ?? []).map((t: any) => t.nome) };
      });
    return resposta(`${lista.length} vertical(is) encontrado(s).`, lista);
  }),
);

// ───────────────────────── n8n ─────────────────────────

server.registerTool(
  "criar_subworkflow",
  {
    description:
      "Cria o subworkflow n8n de UMA tool de um vertical. Valida o formato (nodes + connections), salva em " +
      "verticais/<vertical>/tools/<nome>.json e envia ao n8n (em DRY_RUN grava em saida-simulada/n8n/ e devolve id falso). " +
      "Depois chame validar_workflow com o id retornado.",
    inputSchema: {
      nome: z.string().describe("Nome da tool em snake_case, verbo_substantivo (ex.: agendar_revisao)"),
      vertical: z.string().describe("Nome do vertical (ex.: oficina)"),
      workflow_json: z
        .union([z.string(), z.record(z.any())])
        .describe("Workflow n8n completo (objeto ou string JSON) com nodes e connections"),
    },
  },
  seguro("criar_subworkflow", async ({ nome, vertical, workflow_json }) => {
    exigirNome(nome, "nome");
    exigirNome(vertical, "vertical");
    const wf = parseJson(workflow_json, "workflow_json");
    const errosFormato = checarFormatoWorkflow(wf);
    if (errosFormato.length) return erro("Não é um JSON de workflow n8n.", { erros: errosFormato });

    const nomeWorkflow = `morph.${vertical}.${nome}`;
    const arquivoTool = gravarJson(path.join(caminhos.verticais, vertical, "tools", `${nome}.json`), {
      name: nomeWorkflow,
      ...wf,
    });
    const criado = await criarWorkflow(nomeWorkflow, wf, `${vertical}-${nome}`.replace(/_/g, "-"));

    return resposta(`Subworkflow "${nomeWorkflow}" criado com id ${criado.id}. Próximo passo: validar_workflow.`, {
      id: criado.id,
      nome_workflow: nomeWorkflow,
      arquivo_tool: arquivoTool,
      arquivo_simulado: criado.arquivo,
    });
  }),
);

server.registerTool(
  "validar_workflow",
  {
    description:
      "Valida um subworkflow já criado: trigger presente, nós conectados, nó final 'Retorno' devolvendo { texto, dados } " +
      "e payload_teste no formato { cliente_id, telefone, args }. Retorna ok/erros/avisos.",
    inputSchema: {
      id: z.string().describe("id retornado por criar_subworkflow"),
      payload_teste: z
        .union([z.string(), z.record(z.any())])
        .optional()
        .describe('Entrada de teste, ex.: {"cliente_id":"oficina-exemplo","telefone":"5511999990000","args":{...}}'),
    },
  },
  seguro("validar_workflow", async ({ id, payload_teste }) => {
    const wf = await buscarWorkflow(id);
    const payload = payload_teste === undefined ? undefined : parseJson(payload_teste, "payload_teste");
    const r = validarSubworkflow(wf, payload);
    const modo = config.dryRun ? "validação estática" : "validação estática do workflow publicado";
    log(r.ok ? "✓ validar_workflow" : "✗ validar_workflow", `${id}: ${r.erros.length} erro(s), ${r.avisos.length} aviso(s)`);
    const titulo = r.ok
      ? `Workflow ${id} OK (${modo}).`
      : `Workflow ${id} REPROVADO (${modo}): ${r.erros.length} erro(s). Corrija e chame criar_subworkflow de novo.`;
    return resposta(titulo, r);
  }),
);

server.registerTool(
  "registrar_vertical",
  {
    description:
      "Grava verticais/<nome>/vertical.json, listando o prompt e as tools. As variáveis {{...}} são extraídas do prompt.md. " +
      "Chame só depois que prompt.md e todas as tools existirem e estiverem validadas.",
    inputSchema: {
      nome: z.string().describe("Nome do vertical (ex.: oficina)"),
      descricao: z.string().describe("Uma frase sobre o vertical"),
      tools: z
        .array(
          z.object({
            nome: z.string(),
            descricao: z.string().describe("Quando o agente de IA deve usar esta tool"),
            workflow_id: z.string().optional(),
            args: z.record(z.string()).optional().describe('Ex.: {"placa":"string, obrigatório"}'),
          }),
        )
        .min(1),
    },
  },
  seguro("registrar_vertical", async ({ nome, descricao, tools }) => {
    exigirNome(nome, "nome");
    const pasta = path.join(caminhos.verticais, nome);
    const promptArq = path.join(pasta, "prompt.md");
    if (!existsSync(promptArq)) return erro(`Falta ${relativo(promptArq)}. Crie o prompt antes de registrar.`);

    const faltando = tools.filter((t) => !existsSync(path.join(pasta, "tools", `${t.nome}.json`))).map((t) => t.nome);
    if (faltando.length) return erro("Tools sem arquivo em tools/. Crie com criar_subworkflow.", { faltando });

    const prompt = readFileSync(promptArq, "utf8");
    const usadas = [...new Set([...prompt.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];
    const vertical = {
      nome,
      descricao,
      versao: "0.1.0",
      prompt: "prompt.md",
      variaveis: usadas.filter((v) => !VARIAVEIS_DO_CORE.includes(v)),
      tools: tools.map((t) => ({ ...t, arquivo: `tools/${t.nome}.json` })),
      registrado_em: new Date().toISOString(),
    };
    const arquivo = gravarJson(path.join(pasta, "vertical.json"), vertical);
    return resposta(`Vertical "${nome}" registrado com ${tools.length} tool(s) em ${arquivo}.`, vertical);
  }),
);

server.registerTool(
  "criar_cliente",
  {
    description:
      "Cria um cliente de um vertical: grava clientes/<id>.json e gera o workflow do cliente a partir do core " +
      "(core.workflow.json + prompt e tools do vertical). config deve ter nome_empresa e as variáveis exigidas pelo vertical.",
    inputSchema: {
      vertical: z.string(),
      config: z
        .union([z.string(), z.record(z.any())])
        .describe("Config do cliente. Ver clientes/clinica-exemplo.json como modelo."),
    },
  },
  seguro("criar_cliente", async ({ vertical, config: cfgBruta }) => {
    exigirNome(vertical, "vertical");
    const cfg = parseJson(cfgBruta, "config");
    const arqVertical = path.join(caminhos.verticais, vertical, "vertical.json");
    if (!existsSync(arqVertical)) return erro(`Vertical "${vertical}" não registrado (falta vertical.json).`);
    const v = lerJson(arqVertical);
    if (!cfg.nome_empresa) return erro("config.nome_empresa é obrigatório.");

    const variaveis = cfg.variaveis ?? {};
    const faltando = (v.variaveis as string[]).filter((nome) => variaveis[nome] === undefined);
    if (faltando.length) return erro("config.variaveis não traz todas as variáveis do prompt.", { faltando });

    const id = cfg.id ?? `${vertical}-${slug(cfg.nome_empresa)}`;
    exigirNome(id, "id do cliente");

    // Monta o workflow do cliente a partir do core genérico
    const wf = structuredClone(lerJson(caminhos.coreWorkflow));
    const promptTemplate = readFileSync(path.join(caminhos.verticais, vertical, v.prompt), "utf8");
    const noConfig = wf.nodes.find((n: any) => n.name === "Config do cliente");
    noConfig.parameters.assignments.assignments = [
      { id: "cfg-1", name: "cliente_id", value: id, type: "string" },
      { id: "cfg-2", name: "vertical", value: vertical, type: "string" },
      { id: "cfg-3", name: "prompt_template", value: promptTemplate, type: "string" },
      { id: "cfg-4", name: "variaveis", value: JSON.stringify(variaveis), type: "object" },
      { id: "cfg-5", name: "telefone_humano", value: cfg.transbordo?.telefone_humano ?? "", type: "string" },
    ];
    // Injeta um nó "Tool Workflow" por tool do vertical, ligado ao Agente IA (conexão ai_tool)
    v.tools.forEach((t: any, i: number) => {
      const nomeNo = `Tool: ${t.nome}`;
      wf.nodes.push({
        id: `tool-${i + 1}`,
        name: nomeNo,
        type: "@n8n/n8n-nodes-langchain.toolWorkflow",
        typeVersion: 2,
        position: [1500 + i * 180, 620],
        parameters: {
          name: t.nome,
          description: t.descricao,
          source: "database",
          workflowId: { __rl: true, mode: "id", value: t.workflow_id ?? `morph.${vertical}.${t.nome}` },
          workflowInputs: {
            mappingMode: "defineBelow",
            value: {
              cliente_id: id,
              telefone: "={{ $('Extrair mensagem').item.json.telefone }}",
              args: "={{ $fromAI('args', 'Argumentos da tool em JSON', 'json') }}",
            },
          },
        },
      });
      wf.connections[nomeNo] = { ai_tool: [[{ node: "Agente IA", type: "ai_tool", index: 0 }]] };
    });

    const criado = await criarWorkflow(`morph.cliente.${id}`, wf, `cliente-${id}`);
    const cliente = {
      id,
      vertical,
      ...cfg,
      n8n: { workflow_id: criado.id, nome_workflow: `morph.cliente.${id}` },
      criado_em: new Date().toISOString(),
    };
    const arquivo = gravarJson(path.join(caminhos.clientes, `${id}.json`), cliente);
    return resposta(`Cliente "${id}" criado (${arquivo}) e workflow do cliente gerado com id ${criado.id}.`, {
      cliente_id: id,
      arquivo_cliente: arquivo,
      workflow_id: criado.id,
      arquivo_simulado: criado.arquivo,
      tools_ligadas: v.tools.map((t: any) => t.nome),
    });
  }),
);

// ───────────────────────── Meta (WhatsApp Cloud API) ─────────────────────────

server.registerTool(
  "meta_inscrever_waba",
  {
    description: "Inscreve o app da Morph na WABA do cliente (POST /{waba_id}/subscribed_apps) para receber webhooks.",
    inputSchema: { waba_id: z.string().describe("ID da WhatsApp Business Account do cliente") },
  },
  seguro("meta_inscrever_waba", async ({ waba_id }) => {
    const r = await chamarGraph("inscrever_waba", "POST", `${waba_id}/subscribed_apps`, {}, { success: true });
    return resposta(`App inscrito na WABA ${waba_id}.`, r);
  }),
);

server.registerTool(
  "meta_registrar_numero",
  {
    description: "Registra o número na Cloud API (POST /{phone_number_id}/register) com PIN de 6 dígitos (verificação em 2 etapas).",
    inputSchema: {
      phone_number_id: z.string(),
      pin: z.string().describe("PIN de 6 dígitos da verificação em duas etapas"),
    },
  },
  seguro("meta_registrar_numero", async ({ phone_number_id, pin }) => {
    if (!/^\d{6}$/.test(pin)) return erro("O PIN deve ter exatamente 6 dígitos.");
    const corpo = { messaging_product: "whatsapp", pin: config.dryRun ? "******" : pin };
    const r = await chamarGraph("registrar_numero", "POST", `${phone_number_id}/register`, corpo, { success: true });
    return resposta(`Número ${phone_number_id} registrado na Cloud API.`, r);
  }),
);

server.registerTool(
  "meta_criar_template",
  {
    description:
      "Cria um template de mensagem (POST /{waba_id}/message_templates). Fica PENDING até a Meta aprovar.",
    inputSchema: {
      waba_id: z.string(),
      template: z
        .union([z.string(), z.record(z.any())])
        .describe('Ex.: {"name":"boas_vindas","language":"pt_BR","category":"UTILITY","components":[{"type":"BODY","text":"Olá {{1}}!"}]}'),
    },
  },
  seguro("meta_criar_template", async ({ waba_id, template }) => {
    const t = parseJson(template, "template");
    const erros: string[] = [];
    if (!/^[a-z0-9_]{1,512}$/.test(t.name ?? "")) erros.push("name deve ter só minúsculas, números e _.");
    if (!t.language) erros.push('language obrigatório (ex.: "pt_BR").');
    if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(t.category)) erros.push("category: UTILITY, MARKETING ou AUTHENTICATION.");
    if (!Array.isArray(t.components) || !t.components.some((c: any) => c.type === "BODY")) erros.push("components precisa de um BODY.");
    if (erros.length) return erro("Template inválido.", { erros });

    const simulada = { id: `sim-template-${Date.now()}`, status: "PENDING", category: t.category };
    const r = await chamarGraph("criar_template", "POST", `${waba_id}/message_templates`, t, simulada);
    return resposta(`Template "${t.name}" enviado para aprovação da Meta (status ${r.resposta.status ?? "?"}).`, r);
  }),
);

// ───────────────────────── Início ─────────────────────────

async function main() {
  await server.connect(new StdioServerTransport());
  log("servidor iniciado", `raiz=${RAIZ} DRY_RUN=${config.dryRun}`);
}

main().catch((e) => {
  console.error("[morph-n8n] falha ao iniciar:", e);
  process.exit(1);
});
