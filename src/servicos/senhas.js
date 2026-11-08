import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  banco,
  buscar,
  chamar,
  criarApp,
  erro,
  exigir,
  idValido,
  iniciar,
  portas,
} from "../comum.js";

const app = criarApp("senhas");
const db = banco(
  "senhas",
  `CREATE TABLE IF NOT EXISTS senhas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, quartoId INTEGER NOT NULL, pessoaId INTEGER NOT NULL,
  hash TEXT NOT NULL, salt TEXT NOT NULL, inicio TEXT NOT NULL, fim TEXT NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1
)`,
);

// Devolve somente os dados que o administrador pode consultar.
function publica(senha) {
  return {
    id: senha.id,
    quartoId: senha.quartoId,
    pessoaId: senha.pessoaId,
    inicio: senha.inicio,
    fim: senha.fim,
    ativa: senha.ativa,
  };
}
// O código recebido é transformado em hash para comparar com o banco.
function conferir(senha, registro) {
  return timingSafeEqual(
    scryptSync(senha, registro.salt, 32),
    Buffer.from(registro.hash, "hex"),
  );
}
function validarCodigo(senha) {
  exigir(
    typeof senha === "string" && /^\d{4,12}$/.test(senha),
    "senha deve conter de 4 a 12 dígitos, como texto.",
  );
}
function validarData(valor) {
  exigir(
    typeof valor === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(
        valor,
      ) &&
      Number.isFinite(Date.parse(valor)),
    "Use data ISO 8601 com fuso, como 2026-11-09T14:00:00-03:00.",
  );
  // Date.parse normaliza datas como 30 de fevereiro; rejeitamos esse caso.
  const dia = Number(valor.slice(8, 10));
  const ultimoDia = new Date(
    Date.UTC(Number(valor.slice(0, 4)), Number(valor.slice(5, 7)), 0),
  ).getUTCDate();
  exigir(dia >= 1 && dia <= ultimoDia, "Dia inválido para o mês.");
  return new Date(valor).toISOString();
}

app.get("/senhas", (req, res) =>
  res.json(db.prepare("SELECT * FROM senhas ORDER BY id").all().map(publica)),
);
app.get("/senhas/:id", (req, res) =>
  res.json(publica(buscar(db, "senhas", req.params.id))),
);
app.post("/senhas", async (req, res) => {
  const quartoId = idValido(req.body.quartoId);
  const pessoaId = idValido(req.body.pessoaId);
  validarCodigo(req.body.senha);
  const inicio = validarData(req.body.inicio);
  const fim = validarData(req.body.fim);
  exigir(inicio < fim, "O início deve ser anterior ao fim.");
  const quarto = await chamar("quartos", `/quartos/${quartoId}`);
  const pessoa = await chamar("pessoas", `/pessoas/${pessoaId}`);
  exigir(
    quarto.ativo === 1 && pessoa.ativo === 1,
    "Quarto e pessoa devem estar ativos.",
  );
  const cadastradas = db
    .prepare("SELECT * FROM senhas WHERE quartoId = ? AND ativa = 1")
    .all(quartoId);
  for (const cadastrada of cadastradas) {
    if (conferir(req.body.senha, cadastrada)) {
      throw erro(409, "Senha já utilizada neste quarto. Escolha outra.");
    }
  }
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(req.body.senha, salt, 32).toString("hex");
  const resultado = db
    .prepare(
      "INSERT INTO senhas (quartoId, pessoaId, hash, salt, inicio, fim) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(quartoId, pessoaId, hash, salt, inicio, fim);
  // O aplicativo conhece a senha enviada. Ela não será devolvida nem gravada em texto puro.
  res
    .status(201)
    .json(publica(buscar(db, "senhas", Number(resultado.lastInsertRowid))));
});
app.delete("/senhas/:id", (req, res) => {
  const senha = buscar(db, "senhas", req.params.id);
  db.prepare("UPDATE senhas SET ativa = 0 WHERE id = ?").run(senha.id);
  res.status(204).end();
});

// Rota interna: o gateway nunca expõe este caminho.
app.post("/interno/verificar", async (req, res) => {
  const quartoId = idValido(req.body.quartoId);
  validarCodigo(req.body.senha);
  const registros = db
    .prepare("SELECT * FROM senhas WHERE quartoId = ? AND ativa = 1")
    .all(quartoId);
  let senha;
  for (const registro of registros) {
    if (conferir(req.body.senha, registro)) {
      senha = registro;
      break;
    }
  }
  if (!senha) return res.json({ autorizado: false, motivo: "senha_incorreta" });
  const agora = new Date().toISOString();
  // Início inclusivo e fim exclusivo. O horário vem do servidor.
  if (agora < senha.inicio || agora >= senha.fim) {
    return res.json({
      autorizado: false,
      motivo: "fora_da_validade",
      senhaId: senha.id,
    });
  }
  let pessoa;
  try {
    pessoa = await chamar("pessoas", `/pessoas/${senha.pessoaId}`);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  if (!pessoa || pessoa.ativo !== 1)
    return res.json({ autorizado: false, motivo: "pessoa_inativa" });
  res.json({
    autorizado: true,
    motivo: "acesso_autorizado",
    pessoaId: pessoa.id,
    senhaId: senha.id,
  });
});
iniciar(app, portas.senhas);
