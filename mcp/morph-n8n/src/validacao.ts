/**
 * Validações estáticas de workflows n8n, seguindo core/contrato-core.md.
 * Usadas em DRY_RUN (e também antes de enviar ao n8n de verdade).
 */

export const TIPO_TRIGGER_TOOL = "n8n-nodes-base.executeWorkflowTrigger";
export const NOME_NO_RETORNO = "Retorno";

export interface ResultadoValidacao {
  ok: boolean;
  erros: string[];
  avisos: string[];
}

interface No {
  name: string;
  type: string;
  parameters?: Record<string, any>;
  position?: unknown;
}

/** Checagem mínima de formato: é um workflow n8n (tem nodes e connections)? */
export function checarFormatoWorkflow(wf: any): string[] {
  const erros: string[] = [];
  if (!wf || typeof wf !== "object" || Array.isArray(wf)) return ["O workflow deve ser um objeto JSON."];
  if (!Array.isArray(wf.nodes) || wf.nodes.length === 0) erros.push('Faltando "nodes" (lista não vazia).');
  if (!wf.connections || typeof wf.connections !== "object" || Array.isArray(wf.connections)) {
    erros.push('Faltando "connections" (objeto).');
  }
  return erros;
}

/** Saídas "main" de um nó: lista de nomes de nós de destino. */
function destinos(connections: Record<string, any>, origem: string): string[] {
  const main = connections[origem]?.main;
  if (!Array.isArray(main)) return [];
  return main.flat().filter(Boolean).map((c: any) => c.node);
}

function retornoTemContrato(no: No): boolean {
  const p = no.parameters ?? {};
  if (no.type === "n8n-nodes-base.code") {
    const js = String(p.jsCode ?? "");
    return /\btexto\b/.test(js) && /\bdados\b/.test(js);
  }
  if (no.type === "n8n-nodes-base.set") {
    const nomes = (p.assignments?.assignments ?? []).map((a: any) => a.name);
    return nomes.includes("texto") && nomes.includes("dados");
  }
  return false;
}

export function validarSubworkflow(wf: any, payloadTeste?: any): ResultadoValidacao {
  const erros = checarFormatoWorkflow(wf);
  const avisos: string[] = [];
  if (erros.length) return { ok: false, erros, avisos };

  const nodes: No[] = wf.nodes;
  const connections: Record<string, any> = wf.connections;
  const nomes = new Set<string>();

  // 1. Nós bem formados e com nome único
  for (const n of nodes) {
    if (!n.name || !n.type) erros.push(`Nó sem "name" ou "type": ${JSON.stringify(n).slice(0, 80)}`);
    if (nomes.has(n.name)) erros.push(`Nome de nó duplicado: "${n.name}".`);
    nomes.add(n.name);
    if (!n.parameters) avisos.push(`Nó "${n.name}" sem "parameters".`);
    if (!n.position) avisos.push(`Nó "${n.name}" sem "position" (o editor do n8n vai reposicionar).`);
  }

  // 2. Trigger presente (exatamente um Execute Workflow Trigger)
  const triggers = nodes.filter((n) => n.type === TIPO_TRIGGER_TOOL);
  if (triggers.length === 0) erros.push(`Trigger ausente: a tool precisa de um nó "${TIPO_TRIGGER_TOOL}".`);
  if (triggers.length > 1) erros.push("Mais de um Execute Workflow Trigger no mesmo subworkflow.");

  // 3. Conexões apontam para nós existentes
  for (const [origem, saidas] of Object.entries(connections)) {
    if (!nomes.has(origem)) erros.push(`Conexão sai de um nó inexistente: "${origem}".`);
    for (const destino of destinos({ [origem]: saidas }, origem)) {
      if (!nomes.has(destino)) erros.push(`Conexão "${origem}" → "${destino}" aponta para nó inexistente.`);
    }
  }

  // 4. Todos os nós alcançáveis a partir do trigger
  if (triggers.length === 1) {
    const visitados = new Set<string>([triggers[0].name]);
    const fila = [triggers[0].name];
    while (fila.length) {
      for (const d of destinos(connections, fila.shift()!)) {
        if (!visitados.has(d)) {
          visitados.add(d);
          fila.push(d);
        }
      }
    }
    for (const n of nodes) {
      if (!visitados.has(n.name)) erros.push(`Nó desconectado (não é alcançado pelo trigger): "${n.name}".`);
    }
  }

  // 5. Saída no formato do contrato: nó final "Retorno" devolvendo { texto, dados }
  const retorno = nodes.find((n) => n.name === NOME_NO_RETORNO);
  if (!retorno) {
    erros.push(`Falta o nó final "${NOME_NO_RETORNO}" (contrato: toda tool termina nele).`);
  } else {
    if (destinos(connections, retorno.name).length) erros.push(`O nó "${NOME_NO_RETORNO}" deve ser o último (sem saídas).`);
    if (!retornoTemContrato(retorno)) {
      erros.push(`O nó "${NOME_NO_RETORNO}" deve ser Code ou Set e devolver { texto, dados }.`);
    }
  }

  // 6. Payload de teste no formato de entrada do contrato
  if (payloadTeste !== undefined) {
    const p = payloadTeste;
    if (!p || typeof p !== "object") erros.push("payload_teste deve ser um objeto { cliente_id, telefone, args }.");
    else {
      if (typeof p.cliente_id !== "string" || !p.cliente_id) erros.push("payload_teste.cliente_id ausente (string).");
      if (typeof p.telefone !== "string" || !/^\+?\d{10,15}$/.test(p.telefone)) {
        erros.push("payload_teste.telefone ausente ou fora do formato E.164 (ex.: 5511999990000).");
      }
      if (!p.args || typeof p.args !== "object" || Array.isArray(p.args)) erros.push("payload_teste.args deve ser um objeto.");
      else if (triggers.length === 1) {
        const esperados = argsDoTrigger(triggers[0]);
        for (const chave of esperados) {
          if (!(chave in p.args)) avisos.push(`payload_teste.args não traz "${chave}", declarado no trigger.`);
        }
      }
    }
  } else {
    avisos.push("Sem payload_teste: validação de entrada não executada.");
  }

  return { ok: erros.length === 0, erros, avisos };
}

/** Lê as chaves de args declaradas no jsonExample do trigger (se houver). */
function argsDoTrigger(trigger: No): string[] {
  try {
    const exemplo = JSON.parse(String(trigger.parameters?.jsonExample ?? "{}"));
    return Object.keys(exemplo.args ?? {});
  } catch {
    return [];
  }
}
