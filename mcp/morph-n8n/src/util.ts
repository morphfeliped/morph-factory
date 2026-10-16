import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { RAIZ, config } from "./config.js";

/** Logs legíveis no stderr (o stdout é exclusivo do protocolo MCP). */
export function log(acao: string, detalhe = ""): void {
  const hora = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  const modo = config.dryRun ? "SIMULADO" : "REAL";
  console.error(`[morph-n8n ${hora}] [${modo}] ${acao}${detalhe ? " — " + detalhe : ""}`);
}

export const PREFIXO = () => (config.dryRun ? "[SIMULADO] " : "");

export function idFalso(prefixo: string): string {
  return `sim-${prefixo}-${randomBytes(3).toString("hex")}`;
}

export function gravarJson(arquivo: string, dados: unknown): string {
  mkdirSync(path.dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, JSON.stringify(dados, null, 2) + "\n", "utf8");
  return relativo(arquivo);
}

export function relativo(arquivo: string): string {
  return path.relative(RAIZ, arquivo).split(path.sep).join("/");
}

/** Resposta padrão de ferramenta MCP: texto legível + JSON com os dados. */
export function resposta(texto: string, dados?: unknown) {
  const conteudo = [{ type: "text" as const, text: PREFIXO() + texto }];
  if (dados !== undefined) conteudo.push({ type: "text" as const, text: JSON.stringify(dados, null, 2) });
  return { content: conteudo };
}

export function erro(texto: string, dados?: unknown) {
  return { ...resposta("ERRO: " + texto, dados), isError: true };
}

/** Aceita o workflow como objeto ou como string JSON. */
export function parseJson(valor: unknown, campo: string): any {
  if (typeof valor !== "string") return valor;
  try {
    return JSON.parse(valor);
  } catch (e) {
    throw new Error(`${campo} não é um JSON válido: ${(e as Error).message}`);
  }
}
