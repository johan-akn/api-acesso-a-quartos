import express from "express";
import axios from "axios";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export const portas = {
  quartos: Number(process.env.QUARTOS_PORT || 3001),
  pessoas: Number(process.env.PESSOAS_PORT || 3002),
  senhas: Number(process.env.SENHAS_PORT || 3003),
  acessos: Number(process.env.ACESSOS_PORT || 3004),
};

export function erro(status, mensagem) {
  const falha = new Error(mensagem);
  falha.status = status;
  return falha;
}

export function exigir(condicao, mensagem) {
  if (!condicao) throw erro(400, mensagem);
}

export function texto(valor, campo, max = 150) {
  exigir(
    typeof valor === "string" && valor.trim().length > 0 && valor.length <= max,
    `${campo} deve ser um texto de 1 a ${max} caracteres.`,
  );
  return valor.trim();
}

export function idValido(valor) {
  exigir(
    typeof valor === "number" ||
      (typeof valor === "string" && /^[1-9]\d*$/.test(valor)),
    "ID inválido.",
  );
  const id = Number(valor);
  exigir(Number.isSafeInteger(id) && id > 0, "ID inválido.");
  return id;
}

export function buscar(db, tabela, id) {
  const registro = db
    .prepare(`SELECT * FROM ${tabela} WHERE id = ?`)
    .get(idValido(id));
  if (!registro) throw erro(404, "Registro não encontrado.");
  return registro;
}

// Cada processo abre somente seu próprio arquivo SQLite.
export function banco(nome, esquema) {
  const pasta = resolve(process.env.DATA_DIR || "dados");
  mkdirSync(pasta, { recursive: true });
  const db = new DatabaseSync(resolve(pasta, `${nome}.sqlite`));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(esquema);
  return db;
}

export async function chamar(servico, caminho, metodo = "GET", dados) {
  try {
    const resposta = await axios({
      url: `http://127.0.0.1:${portas[servico]}${caminho}`,
      method: metodo,
      data: dados,
      timeout: 4000,
      proxy: false,
    });
    return resposta.data;
  } catch (e) {
    if (e.response)
      throw erro(
        e.response.status,
        e.response.data.erro || "Falha no serviço.",
      );
    throw erro(503, `Serviço de ${servico} indisponível.`);
  }
}

export function criarApp(nome) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use((req, res, next) => {
    if (
      ["POST", "PUT", "PATCH"].includes(req.method) &&
      (!req.body || Array.isArray(req.body) || typeof req.body !== "object")
    ) {
      return res
        .status(400)
        .json({ erro: "Envie um objeto JSON no corpo da requisição." });
    }
    next();
  });
  app.get("/health", (req, res) => res.json({ servico: nome, status: "ok" }));
  return app;
}

export function iniciar(app, porta) {
  app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
  app.use((e, req, res, next) => {
    if (e.code?.startsWith("ERR_SQLITE") && e.message.includes("UNIQUE")) {
      return res.status(409).json({ erro: "Identificação já cadastrada." });
    }
    const status = e.status || 500;
    if (status >= 500) console.error(e.message);
    res
      .status(status)
      .json({ erro: status === 500 ? "Erro interno do serviço." : e.message });
  });
  // A demonstração fica acessível apenas nesta máquina.
  const servidor = app.listen(porta, "127.0.0.1", () =>
    console.log(`API em http://127.0.0.1:${porta}`),
  );
  servidor.on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  });
  for (const sinal of ["SIGTERM", "SIGINT"])
    process.on(sinal, () => servidor.close(() => process.exit(0)));
}
