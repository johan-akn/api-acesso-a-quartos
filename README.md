# API Acesso a Quartos

Backend para gerenciar o acesso a quartos alugados por fechaduras eletrônicas, com cadastro de pessoas, senhas temporárias e histórico de acessos.

Desenvolvido com **Node.js, Express, Axios e SQLite**. São quatro microservices — quartos, pessoas, senhas e acessos — com bancos separados e uma entrada única pelo API gateway.

## Como executar

Requer **Node.js 22.13 ou superior** e npm.

```bash
git clone https://github.com/johan-akn/api-acesso-a-quartos.git
cd api-acesso-a-quartos
npm ci
cp .env.example .env
npm start
```

A API fica disponível em `http://127.0.0.1:3000`. O comando inicia o gateway e os quatro serviços. Para encerrar, use `Ctrl+C`.

Os bancos são criados automaticamente na pasta `dados/`. As portas e a chave administrativa podem ser alteradas no `.env`.

## Como testar

Importe a [coleção do Postman](postman/atividade-3.postman_collection.json) e execute as requisições na ordem. Ela cadastra um quarto, uma pessoa e uma senha, testa entradas permitidas e negadas e consulta o histórico. Os IDs e as datas de validade são preenchidos automaticamente.

Para cadastros e consultas, envie a chave definida em `ADMIN_TOKEN`. O valor de demonstração é:

```http
Authorization: Bearer admin-local-123
```

A tentativa de abertura usa `POST /acessos`, sem a chave administrativa:

```json
{
  "fechaduraId": "FECH-101",
  "senha": "012345"
}
```

Use a identificação e a senha cadastradas. A entrada é permitida somente quando a resposta contém `"autorizado": true`. O quarto e a pessoa precisam estar ativos, e a senha deve estar dentro do período de validade.

## Rotas

Todas as rotas abaixo usam a URL base `http://127.0.0.1:3000`.

| Método             | Rota           | Função                                           |
| ------------------ | -------------- | ------------------------------------------------ |
| GET / POST         | `/quartos`     | Listar ou cadastrar quartos                      |
| GET / PUT / DELETE | `/quartos/:id` | Consultar, atualizar ou desativar quarto         |
| GET / POST         | `/pessoas`     | Listar ou cadastrar hóspedes e funcionários      |
| GET / PUT / DELETE | `/pessoas/:id` | Consultar, atualizar ou desativar pessoa         |
| GET / POST         | `/senhas`      | Listar metadados ou cadastrar senha com validade |
| GET / DELETE       | `/senhas/:id`  | Consultar metadados ou revogar senha             |
| POST               | `/acessos`     | Validar senha e registrar tentativa              |
| GET                | `/acessos`     | Consultar histórico; aceita `?quartoId=1`        |
| GET                | `/health`      | Verificar se o gateway está disponível           |

Envie JSON nas escritas. `PUT` exige os campos completos do cadastro. `DELETE` desativa ou revoga o registro, preservando o histórico. As senhas são strings de 4 a 12 dígitos; as datas devem incluir o fuso horário, como `2026-11-09T14:00:00-03:00`.

## Testes automatizados

```bash
npm test
```

Os testes usam portas e bancos temporários, sem alterar os cadastros locais.

A fechadura é simulada por requisições HTTP. O projeto não integra hardware nem envio de senhas por e-mail ou SMS. Para acompanhar o funcionamento do código, consulte o [roteiro de apresentação](APRESENTACAO.md).
