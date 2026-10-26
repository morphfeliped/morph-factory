#!/usr/bin/env node
/**
 * Valida pelo terminal todas as tools de um vertical, com as mesmas regras do validar_workflow.
 * Uso: npm run validar -- <vertical>      (ex.: npm run validar -- oficina)
 * O payload de teste de cada tool sai do jsonExample do próprio trigger.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { caminhos } from "./config.js";
import { TIPO_TRIGGER_TOOL, validarSubworkflow } from "./validacao.js";

const vertical = process.argv[2];
if (!vertical) {
  console.error("Uso: npm run validar -- <vertical>");
  process.exit(2);
}
const pasta = path.join(caminhos.verticais, vertical, "tools");
if (!existsSync(pasta)) {
  console.error(`Vertical "${vertical}" não tem tools/ em verticais/.`);
  process.exit(2);
}

let falhas = 0;
for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith(".json"))) {
  const wf = JSON.parse(readFileSync(path.join(pasta, arquivo), "utf8"));
  const trigger = wf.nodes?.find((n: any) => n.type === TIPO_TRIGGER_TOOL);
  let payload: unknown;
  try {
    payload = JSON.parse(trigger?.parameters?.jsonExample ?? "");
  } catch {
    payload = undefined;
  }
  const r = validarSubworkflow(wf, payload);
  if (!r.ok) falhas++;
  console.log(`${r.ok ? "✓" : "✗"} ${arquivo}`);
  for (const e of r.erros) console.log(`    erro:  ${e}`);
  for (const a of r.avisos) console.log(`    aviso: ${a}`);
}
console.log(falhas ? `\n${falhas} tool(s) reprovada(s).` : "\nTodas as tools passaram.");
process.exit(falhas ? 1 : 0);
