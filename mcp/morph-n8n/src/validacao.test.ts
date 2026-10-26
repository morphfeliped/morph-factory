import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RAIZ } from "./config.js";
import { checarFormatoWorkflow, validarSubworkflow } from "./validacao.js";

const PAYLOAD = { cliente_id: "clinica-exemplo", telefone: "5511999990000", args: {} };
const pastaOdonto = path.join(RAIZ, "verticais", "odonto", "tools");
const lerTool = (arquivo: string) => JSON.parse(readFileSync(path.join(pastaOdonto, arquivo), "utf8"));

test("as tools do odonto (exemplo copiado pelos agentes) passam na validação", () => {
  for (const arquivo of readdirSync(pastaOdonto)) {
    const r = validarSubworkflow(lerTool(arquivo), PAYLOAD);
    assert.deepEqual(r.erros, [], `${arquivo}: ${r.erros.join("; ")}`);
  }
});

test("rejeita JSON que não é workflow n8n", () => {
  assert.ok(checarFormatoWorkflow({}).length >= 2);
  assert.ok(checarFormatoWorkflow([]).length === 1);
  assert.deepEqual(checarFormatoWorkflow({ nodes: [{}], connections: {} }), []);
});

test("acusa trigger ausente, nó solto e falta do nó Retorno", () => {
  const wf = lerTool("consultar_horarios.json");
  wf.nodes = wf.nodes.filter((n: any) => n.name !== "Execute Workflow Trigger");
  wf.nodes.find((n: any) => n.name === "Retorno").name = "Fim";
  const r = validarSubworkflow(wf, PAYLOAD);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes("Trigger ausente")));
  assert.ok(r.erros.some((e) => e.includes('Falta o nó final "Retorno"')));
  assert.ok(r.erros.some((e) => e.includes("nó inexistente")));
});

test("acusa nó desconectado", () => {
  const wf = lerTool("consultar_horarios.json");
  wf.nodes.push({ name: "Solto", type: "n8n-nodes-base.code", parameters: {}, position: [0, 0] });
  const r = validarSubworkflow(wf, PAYLOAD);
  assert.ok(r.erros.some((e) => e.includes('"Solto"')));
});

test('"Validar args" ligado direto no HTTP é reprovado (exige o IF "Args ok?")', () => {
  const wf = lerTool("agendar_consulta.json");
  wf.nodes = wf.nodes.filter((n: any) => n.name !== "Args ok?");
  delete wf.connections["Args ok?"];
  wf.connections["Validar args"] = { main: [[{ node: "Criar agendamento", type: "main", index: 0 }]] };
  const r = validarSubworkflow(wf, PAYLOAD);
  assert.ok(r.erros.some((e) => e.includes('liga direto em "Criar agendamento"')));
});

test("Retorno precisa devolver { texto, dados } e ser o último nó", () => {
  const wf = lerTool("consultar_convenios.json");
  const retorno = wf.nodes.find((n: any) => n.name === "Retorno");
  retorno.parameters.jsCode = "return [{ json: { ok: true } }];";
  wf.connections.Retorno = { main: [[{ node: "Buscar convênios", type: "main", index: 0 }]] };
  const r = validarSubworkflow(wf, PAYLOAD);
  assert.ok(r.erros.some((e) => e.includes("deve ser o último")));
  assert.ok(r.erros.some((e) => e.includes("{ texto, dados }")));
});

test("Retorno do tipo Set com texto e dados é aceito", () => {
  const wf = lerTool("consultar_convenios.json");
  const retorno = wf.nodes.find((n: any) => n.name === "Retorno");
  retorno.type = "n8n-nodes-base.set";
  retorno.parameters = { assignments: { assignments: [{ name: "texto" }, { name: "dados" }] } };
  assert.deepEqual(validarSubworkflow(wf, PAYLOAD).erros, []);
});

test("valida o payload_teste e avisa sobre args declarados no trigger", () => {
  const wf = lerTool("agendar_consulta.json");
  const ruim = validarSubworkflow(wf, { cliente_id: "", telefone: "abc", args: [] });
  assert.equal(ruim.erros.length, 3);
  const parcial = validarSubworkflow(wf, { ...PAYLOAD, args: { data: "2026-10-20" } });
  assert.equal(parcial.ok, true);
  assert.deepEqual(parcial.avisos, [], "args parciais/alternativos não geram aviso");
  const vazio = validarSubworkflow(wf, PAYLOAD);
  assert.ok(vazio.avisos.some((a) => a.includes("nenhum dos args")));
  assert.ok(validarSubworkflow(wf).avisos.some((a) => a.includes("Sem payload_teste")));
});
