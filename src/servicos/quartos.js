import {
  banco,
  buscar,
  criarApp,
  exigir,
  iniciar,
  portas,
  texto,
} from "../comum.js";

const app = criarApp("quartos");
const db = banco(
  "quartos",
  `CREATE TABLE IF NOT EXISTS quartos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  fechaduraId TEXT NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1
)`,
);

function validar(dados) {
  const nome = texto(dados.nome, "nome");
  const fechaduraId = texto(dados.fechaduraId, "fechaduraId", 80);
  exigir(
    dados.ativo === undefined || typeof dados.ativo === "boolean",
    "ativo deve ser booleano.",
  );
  const ativo = dados.ativo === false ? 0 : 1;
  return { nome, fechaduraId, ativo };
}

app.get("/quartos", (req, res) =>
  res.json(db.prepare("SELECT * FROM quartos ORDER BY id").all()),
);
app.get("/quartos/fechadura/:identificacao", (req, res) => {
  const quarto = db
    .prepare("SELECT * FROM quartos WHERE fechaduraId = ?")
    .get(req.params.identificacao);
  if (!quarto)
    return res.status(404).json({ erro: "Fechadura não cadastrada." });
  res.json(quarto);
});

app.get("/quartos/:id", (req, res) =>
  res.json(buscar(db, "quartos", req.params.id)),
);
app.post("/quartos", (req, res) => {
  const dados = validar(req.body);
  const resultado = db
    .prepare("INSERT INTO quartos (nome, fechaduraId, ativo) VALUES (?, ?, ?)")
    .run(dados.nome, dados.fechaduraId, dados.ativo);
  res
    .status(201)
    .json(buscar(db, "quartos", Number(resultado.lastInsertRowid)));
});
app.put("/quartos/:id", (req, res) => {
  const atual = buscar(db, "quartos", req.params.id);
  const dados = validar(req.body);
  db.prepare(
    "UPDATE quartos SET nome = ?, fechaduraId = ?, ativo = ? WHERE id = ?",
  ).run(dados.nome, dados.fechaduraId, dados.ativo, atual.id);
  res.json(buscar(db, "quartos", atual.id));
});
// Exclusão lógica preserva as referências e o histórico de acessos.
app.delete("/quartos/:id", (req, res) => {
  const atual = buscar(db, "quartos", req.params.id);
  db.prepare("UPDATE quartos SET ativo = 0 WHERE id = ?").run(atual.id);
  res.status(204).end();
});
iniciar(app, portas.quartos);
