import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

const raiz = new URL("../", import.meta.url);
async function portaLivre() {
  const servidor = createServer();
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const porta = servidor.address().port;
  await new Promise((resolve) => servidor.close(resolve));
  return porta;
}

test("Backend completo pelo gateway", { timeout: 60000 }, async (t) => {
  const pasta = await mkdtemp(join(tmpdir(), "appbooking-teste-"));
  const nomes = ["quartos", "pessoas", "senhas", "acessos", "gateway"];
  const portas = {};
  for (const nome of nomes) portas[nome] = await portaLivre();
  const env = { ...process.env, DATA_DIR: pasta, ADMIN_TOKEN: "teste-admin" };
  for (const nome of nomes)
    env[`${nome.toUpperCase()}_PORT`] = String(portas[nome]);
  const processos = {};
  let logs = "";
  function iniciar(nome) {
    const caminho =
      nome === "gateway" ? "src/gateway.js" : `src/servicos/${nome}.js`;
    const filho = spawn(process.execPath, [new URL(caminho, raiz).pathname], {
      env,
    });
    filho.stdout.on("data", (d) => {
      logs += d;
    });
    filho.stderr.on("data", (d) => {
      logs += d;
    });
    processos[nome] = filho;
  }
  async function parar(nome) {
    const filho = processos[nome];
    if (filho.exitCode !== null || filho.signalCode !== null) return;
    const saiu = once(filho, "exit");
    filho.kill("SIGTERM");
    await saiu;
  }
  async function pronto(nome) {
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${portas[nome]}/health`);
        if (r.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Serviço ${nome} não iniciou. ${logs}`);
  }
  async function api(metodo, rota, corpo, admin = true) {
    const res = await fetch(`http://127.0.0.1:${portas.gateway}${rota}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(admin ? { Authorization: "Bearer teste-admin" } : {}),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    return {
      status: res.status,
      dados: res.status === 204 ? null : await res.json(),
    };
  }
  try {
    for (const nome of nomes) iniciar(nome);
    await Promise.all(nomes.map(pronto));
    let quarto, pessoa, senha;
    const agora = Date.now();
    const periodo = {
      inicio: new Date(agora - 60000).toISOString(),
      fim: new Date(agora + 3600000).toISOString(),
    };
    const acesso = (codigo) =>
      api("POST", "/acessos", { fechaduraId: "F101", senha: codigo }, false);
    await t.test(
      "cadastros exigem administrador e rotas internas ficam bloqueadas",
      async () => {
        assert.equal(
          (await api("GET", "/pessoas", undefined, false)).status,
          401,
        );
        assert.equal((await api("POST", "/interno/verificar", {})).status, 404);
      },
    );
    await t.test("cadastra quarto e impede fechadura duplicada", async () => {
      const r = await api("POST", "/quartos", {
        nome: "Quarto 101",
        fechaduraId: "F101",
      });
      assert.equal(r.status, 201);
      quarto = r.dados;
      assert.equal(
        (await api("POST", "/quartos", { nome: "Outro", fechaduraId: "F101" }))
          .status,
        409,
      );
    });
    await t.test("cadastra hóspede e valida tipos e corpo", async () => {
      const r = await api("POST", "/pessoas", {
        nome: "Ana",
        email: "ana@exemplo.com",
        tipo: "hospede",
      });
      assert.equal(r.status, 201);
      pessoa = r.dados;
      assert.equal(
        (
          await api("POST", "/pessoas", {
            nome: "Ana",
            email: "a@b.com",
            tipo: "outro",
          })
        ).status,
        400,
      );
      assert.equal((await api("POST", "/pessoas", [])).status, 400);
      assert.equal((await api("POST", "/pessoas")).status, 400);
    });
    const cadastro = (codigo) => ({
      quartoId: quarto.id,
      pessoaId: pessoa.id,
      senha: codigo,
      ...periodo,
    });
    await t.test(
      "valida referências, fuso, calendário e intervalo",
      async () => {
        assert.equal(
          (await api("POST", "/senhas", { ...cadastro("1234"), pessoaId: 999 }))
            .status,
          404,
        );
        assert.equal(
          (
            await api("POST", "/senhas", {
              ...cadastro("1234"),
              inicio: "2026-11-01T12:00:00",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await api("POST", "/senhas", {
              ...cadastro("1234"),
              inicio: "2026-02-30T12:00:00Z",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await api("POST", "/senhas", {
              ...cadastro("1234"),
              inicio: periodo.fim,
              fim: periodo.inicio,
            })
          ).status,
          400,
        );
      },
    );
    await t.test("cadastra senha sem expor hash nem código", async () => {
      const r = await api("POST", "/senhas", cadastro("1234"));
      assert.equal(r.status, 201);
      senha = r.dados;
      for (const campo of ["hash", "salt", "senha"])
        assert.equal(campo in senha, false);
      assert.equal(
        (await api("POST", "/senhas", cadastro("1234"))).status,
        409,
      );
    });
    await t.test("autoriza senha válida e recusa senha incorreta", async () => {
      assert.equal((await acesso("1234")).dados.autorizado, true);
      assert.equal((await acesso("9999")).dados.motivo, "senha_incorreta");
    });
    await t.test(
      "registra código malformado e fechadura desconhecida",
      async () => {
        assert.equal((await acesso(1234)).status, 400);
        const r = await api(
          "POST",
          "/acessos",
          { fechaduraId: "NAO-EXISTE", senha: "1234" },
          false,
        );
        assert.equal(r.dados.motivo, "fechadura_nao_cadastrada");
      },
    );
    await t.test("recusa senha vencida ou futura", async () => {
      for (const [codigo, inicio, fim] of [
        ["2222", agora - 120000, agora - 60000],
        ["3333", agora + 3600000, agora + 7200000],
      ]) {
        assert.equal(
          (
            await api("POST", "/senhas", {
              ...cadastro(codigo),
              inicio: new Date(inicio).toISOString(),
              fim: new Date(fim).toISOString(),
            })
          ).status,
          201,
        );
        assert.equal((await acesso(codigo)).dados.motivo, "fora_da_validade");
      }
    });
    await t.test("senha não abre outro quarto", async () => {
      await api("POST", "/quartos", {
        nome: "Quarto 102",
        fechaduraId: "F102",
      });
      const r = await api(
        "POST",
        "/acessos",
        { fechaduraId: "F102", senha: "1234" },
        false,
      );
      assert.equal(r.dados.autorizado, false);
    });
    await t.test(
      "desativar pessoa bloqueia senha existente; PUT permite reativar",
      async () => {
        assert.equal(
          (await api("DELETE", `/pessoas/${pessoa.id}`)).status,
          204,
        );
        assert.equal((await acesso("1234")).dados.motivo, "pessoa_inativa");
        assert.equal(
          (
            await api("PUT", `/pessoas/${pessoa.id}`, {
              nome: "Ana",
              email: "ana@exemplo.com",
              tipo: "hospede",
              ativo: true,
            })
          ).status,
          200,
        );
        assert.equal((await acesso("1234")).dados.autorizado, true);
      },
    );
    await t.test(
      "funcionários de limpeza e manutenção recebem acesso",
      async () => {
        for (const [tipo, codigo] of [
          ["limpeza", "4444"],
          ["manutencao", "5555"],
        ]) {
          const p = await api("POST", "/pessoas", {
            nome: tipo,
            email: `${tipo}@exemplo.com`,
            tipo,
          });
          assert.equal(
            (
              await api("POST", "/senhas", {
                ...cadastro(codigo),
                pessoaId: p.dados.id,
              })
            ).status,
            201,
          );
          assert.equal((await acesso(codigo)).dados.autorizado, true);
        }
      },
    );
    await t.test(
      "serviço fora do ar nega entrada e registra motivo",
      async () => {
        await parar("senhas");
        const r = await acesso("1234");
        assert.equal(r.status, 503);
        assert.equal(r.dados.autorizado, false);
        assert.equal(r.dados.motivo, "servico_indisponivel");
        iniciar("senhas");
        await pronto("senhas");
        assert.equal((await acesso("1234")).dados.autorizado, true);
      },
    );
    await t.test(
      "histórico persiste após reiniciar o serviço e não contém códigos",
      async () => {
        const antes = (await api("GET", "/acessos")).dados;
        assert(antes.some((a) => a.autorizado));
        assert(antes.some((a) => !a.autorizado));
        assert(antes.some((a) => a.motivo === "servico_indisponivel"));
        assert(antes.every((a) => !("senha" in a)));
        await parar("acessos");
        iniciar("acessos");
        await pronto("acessos");
        assert.deepEqual((await api("GET", "/acessos")).dados, antes);
        assert(
          (await api("GET", `/acessos?quartoId=${quarto.id}`)).dados.every(
            (a) => a.quartoId === quarto.id,
          ),
        );
      },
    );
    await t.test(
      "revogar senha e desativar quarto bloqueiam abertura",
      async () => {
        assert.equal((await api("DELETE", `/senhas/${senha.id}`)).status, 204);
        assert.equal((await acesso("1234")).dados.autorizado, false);
        await api("DELETE", `/quartos/${quarto.id}`);
        assert.equal((await acesso("4444")).dados.motivo, "quarto_inativo");
      },
    );
    await t.test(
      "cada serviço possui arquivo próprio e senha está protegida",
      async () => {
        for (const nome of nomes.filter((n) => n !== "gateway")) {
          const db = new DatabaseSync(join(pasta, `${nome}.sqlite`));
          const tabelas = db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'sqlite_sequence'",
            )
            .all();
          assert.deepEqual(
            tabelas.map((t) => t.name),
            [nome],
          );
          if (nome === "senhas") {
            const r = db.prepare("SELECT hash, salt FROM senhas LIMIT 1").get();
            assert.equal(r.hash.length, 64);
            assert.equal(r.salt.length, 32);
            assert.notEqual(r.hash, "1234");
          }
          db.close();
        }
      },
    );
  } finally {
    await Promise.all(nomes.filter((n) => processos[n]).map(parar));
    await rm(pasta, { recursive: true, force: true });
  }
});
