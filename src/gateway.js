import axios from "axios";
import { criarApp, iniciar, portas } from "./comum.js";

const app = criarApp("gateway");
const token = process.env.ADMIN_TOKEN || "admin-local-123";

function autenticar(req, res, next) {
  if (req.headers.authorization !== `Bearer ${token}`) {
    return res
      .status(401)
      .json({ erro: "Chave administrativa inválida ou ausente." });
  }
  next();
}

async function encaminhar(req, res) {
  // Exemplo: /quartos/1 -> serviço "quartos".
  const servico = req.path.split("/")[1];
  const url = `http://127.0.0.1:${portas[servico]}${req.originalUrl}`;
  try {
    const resposta = await axios({
      url,
      method: req.method,
      data: req.body,
      timeout: 15000,
      proxy: false,
      // Encaminha também os erros HTTP retornados pelo serviço.
      validateStatus: () => true,
    });
    if (resposta.status === 204) return res.status(204).end();
    res.status(resposta.status).json(resposta.data);
  } catch {
    res.status(503).json({ erro: `Serviço de ${servico} indisponível.` });
  }
}

function metodoNaoPermitido(req, res) {
  res.status(405).json({ erro: "Método não permitido." });
}

// Cada rota pública aparece aqui. A rota interna de senhas não é exposta.
app
  .route("/quartos")
  .get(autenticar, encaminhar)
  .post(autenticar, encaminhar)
  .all(metodoNaoPermitido);
app
  .route("/quartos/:id")
  .get(autenticar, encaminhar)
  .put(autenticar, encaminhar)
  .delete(autenticar, encaminhar)
  .all(metodoNaoPermitido);
app
  .route("/pessoas")
  .get(autenticar, encaminhar)
  .post(autenticar, encaminhar)
  .all(metodoNaoPermitido);
app
  .route("/pessoas/:id")
  .get(autenticar, encaminhar)
  .put(autenticar, encaminhar)
  .delete(autenticar, encaminhar)
  .all(metodoNaoPermitido);
app
  .route("/senhas")
  .get(autenticar, encaminhar)
  .post(autenticar, encaminhar)
  .all(metodoNaoPermitido);
app
  .route("/senhas/:id")
  .get(autenticar, encaminhar)
  .delete(autenticar, encaminhar)
  .all(metodoNaoPermitido);
app
  .route("/acessos")
  .get(autenticar, encaminhar)
  // A fechadura envia a tentativa sem a chave administrativa.
  .post(encaminhar)
  .all(metodoNaoPermitido);

iniciar(app, Number(process.env.GATEWAY_PORT || 3000));
