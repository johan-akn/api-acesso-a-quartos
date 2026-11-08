import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const raiz = fileURLToPath(new URL("../", import.meta.url));
// Um arquivo e um processo para cada serviço, mais o gateway.
const arquivos = [
  "src/servicos/quartos.js",
  "src/servicos/pessoas.js",
  "src/servicos/senhas.js",
  "src/servicos/acessos.js",
  "src/gateway.js",
];
const processos = arquivos.map((arquivo) =>
  spawn(process.execPath, [resolve(raiz, arquivo)], {
    cwd: raiz,
    stdio: "inherit",
    env: process.env,
  }),
);
let encerrando = false;
function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  for (const filho of processos) filho.kill("SIGTERM");
  process.exitCode = codigo;
}
for (const filho of processos) {
  filho.on("error", () => encerrar(1));
  filho.on("exit", (codigo) => {
    if (!encerrando) encerrar(codigo || 1);
  });
}
process.on("SIGINT", () => encerrar());
process.on("SIGTERM", () => encerrar());
