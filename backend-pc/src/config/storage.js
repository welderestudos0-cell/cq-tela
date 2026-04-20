// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DE ARMAZENAMENTO
//
// FOTOS_ROOT  → pasta externa onde ficam SOMENTE as fotos
// BACKEND_ROOT → dentro do próprio backend (JSON, PDF, uploads)
//
// Para mudar onde as fotos são salvas, altere apenas FOTOS_BASE abaixo.
// ─────────────────────────────────────────────────────────────────────────────

import path from "path";
import { fileURLToPath } from "url";

// ── Pasta externa das fotos ───────────────────────────────────────────────────
const FOTOS_BASE = "\\\\192.168.0.201\\desenvolvimento\\TESTE APLICATIVO CQ";
export const FOTOS_ROOT = path.join(FOTOS_BASE, "APLICATIVO");

// ── Pasta do backend (JSON, PDF, uploads) ────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const BACKEND_ROOT = path.join(__dirname, "..", "..");
