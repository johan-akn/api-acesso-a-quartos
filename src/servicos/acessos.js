import {
  banco,
  chamar,
  criarApp,
  exigir,
  iniciar,
  portas,
  texto,
} from "../comum.js";

const app = criarApp("acessos");
const db = banco(
  "acessos",
  `CREATE TABLE IF NOT EXISTS acessos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, fechaduraId TEXT NOT NULL, quartoId INTEGER,
  pessoaId INTEGER, senhaId INTEGER, autorizado INTEGER NOT NULL,
  motivo TEXT NOT NULL, dataHora TEXT NOT NULL
)`,
);
app.get("/acessos", (req, res) => {
  const { quartoId } = req.query;
  if (quartoId !== undefined)
    exigir(/^\d+$/.test(quartoId), "quartoId inválido.");
  let registros;
  if (quartoId === undefined) {
    registros = db
      .prepare("SELECT * FROM acessos ORDER BY id DESC LIMIT 1000")
      .all();
  } else {
    registros = db
      .prepare(
        "SELECT * FROM acessos WHERE quartoId = ? ORDER BY id DESC LIMIT 1000",
      )
      .all(Number(quartoId));
  }
  res.json(registros.map((r) => ({ ...r, autorizado: Boolean(r.autorizado) })));
});
app.post("/acessos", async (req, res) => {
  const fechaduraId = texto(req.body.fechaduraId, "fechaduraId", 80);
  const dataHora = new Date().toISOString();
  let quarto;
  let decisao = { autorizado: false, motivo: "senha_invalida" };
  let status = 200;
  // 1. Valida o código. 2. Consulta o quarto. 3. Pede a verificação da senha.
  try {
    if (
      typeof req.body.senha !== "string" ||
      !/^\d{4,12}$/.test(req.body.senha)
    ) {
      status = 400;
    } else {
      quarto = await chamar(
        "quartos",
        `/quartos/fechadura/${encodeURIComponent(fechaduraId)}`,
      );
      if (quarto.ativo !== 1) {
        decisao = { autorizado: false, motivo: "quarto_inativo" };
      } else {
        decisao = await chamar("senhas", "/interno/verificar", "POST", {
          quartoId: quarto.id,
          senha: req.body.senha,
        });
      }
    }
  } catch (e) {
    if (e.status === 404)
      decisao = { autorizado: false, motivo: "fechadura_nao_cadastrada" };
    else {
      status = 503;
      decisao = { autorizado: false, motivo: "servico_indisponivel" };
    }
  }
  // 4. Grava a tentativa. 5. Responde à fechadura.
  // Se a gravação falhar, nenhuma autorização será enviada.
  const resultado = db
    .prepare(
      `INSERT INTO acessos
    (fechaduraId, quartoId, pessoaId, senhaId, autorizado, motivo, dataHora) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      fechaduraId,
      quarto?.id ?? null,
      decisao.pessoaId ?? null,
      decisao.senhaId ?? null,
      decisao.autorizado ? 1 : 0,
      decisao.motivo,
      dataHora,
    );
  res.status(status).json({
    id: Number(resultado.lastInsertRowid),
    autorizado: decisao.autorizado,
    motivo: decisao.motivo,
    dataHora,
  });
});
iniciar(app, portas.acessos);
