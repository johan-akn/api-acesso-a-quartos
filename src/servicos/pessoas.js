import {
  banco,
  buscar,
  criarApp,
  exigir,
  iniciar,
  portas,
  texto,
} from "../comum.js";

const app = criarApp("pessoas");
const db = banco(
  "pessoas",
  `CREATE TABLE IF NOT EXISTS pessoas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
)`,
);

function validar(dados) {
  const nome = texto(dados.nome, "nome");
  const email = texto(dados.email, "email").toLowerCase();
  exigir(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "E-mail inválido.");
  const tipo = dados.tipo;
  exigir(
    ["hospede", "limpeza", "manutencao"].includes(tipo),
    "Tipo deve ser hospede, limpeza ou manutencao.",
  );
  exigir(
    dados.ativo === undefined || typeof dados.ativo === "boolean",
    "ativo deve ser booleano.",
  );
  const ativo = dados.ativo === false ? 0 : 1;
  return { nome, email, tipo, ativo };
}

app.get("/pessoas", (req, res) =>
  res.json(db.prepare("SELECT * FROM pessoas ORDER BY id").all()),
);

app.get("/pessoas/:id", (req, res) =>
  res.json(buscar(db, "pessoas", req.params.id)),
);
app.post("/pessoas", (req, res) => {
  const dados = validar(req.body);
  const resultado = db
    .prepare(
      "INSERT INTO pessoas (nome, email, tipo, ativo) VALUES (?, ?, ?, ?)",
    )
    .run(dados.nome, dados.email, dados.tipo, dados.ativo);
  res
    .status(201)
    .json(buscar(db, "pessoas", Number(resultado.lastInsertRowid)));
});
app.put("/pessoas/:id", (req, res) => {
  const atual = buscar(db, "pessoas", req.params.id);
  const dados = validar(req.body);
  db.prepare(
    "UPDATE pessoas SET nome = ?, email = ?, tipo = ?, ativo = ? WHERE id = ?",
  ).run(dados.nome, dados.email, dados.tipo, dados.ativo, atual.id);
  res.json(buscar(db, "pessoas", atual.id));
});
// Exclusão lógica preserva as referências e o histórico de acessos.
app.delete("/pessoas/:id", (req, res) => {
  const atual = buscar(db, "pessoas", req.params.id);
  db.prepare("UPDATE pessoas SET ativo = 0 WHERE id = ?").run(atual.id);
  res.status(204).end();
});
iniciar(app, portas.pessoas);
