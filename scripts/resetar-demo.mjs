#!/usr/bin/env node
// Volta o repositório ao estado "antes da demo": apaga tudo que os agentes geraram,
// preservando os exemplos versionados (verticais/odonto, clientes/clinica-exemplo.json).
// Uso: node scripts/resetar-demo.mjs [--sim]   (--sim só lista o que seria apagado)
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const simular = process.argv.includes("--sim");
const PRESERVAR = {
  verticais: new Set(["odonto"]),
  clientes: new Set(["clinica-exemplo.json"]),
  "saida-simulada": new Set([".gitkeep"]),
};

const alvos = [];
for (const [pasta, manter] of Object.entries(PRESERVAR)) {
  const dir = path.join(raiz, pasta);
  if (!existsSync(dir)) continue;
  for (const item of readdirSync(dir)) {
    if (!manter.has(item)) alvos.push(path.join(dir, item));
  }
}

if (!alvos.length) {
  console.log("Nada a apagar: a demo já está zerada.");
  process.exit(0);
}
for (const alvo of alvos) {
  const rel = path.relative(raiz, alvo).split(path.sep).join("/");
  const tipo = statSync(alvo).isDirectory() ? "pasta" : "arquivo";
  if (simular) console.log(`[--sim] apagaria ${tipo} ${rel}`);
  else {
    rmSync(alvo, { recursive: true, force: true });
    console.log(`apagado: ${rel}`);
  }
}
console.log(simular ? `${alvos.length} item(ns) seriam apagados.` : `Demo zerada (${alvos.length} item(ns)).`);
