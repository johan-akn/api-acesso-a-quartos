# Roteiro para estudar e apresentar

## Demonstração

1. Execute `npm ci` e `npm start`. Mostre os cinco processos e os quatro arquivos em `dados/`.
2. Importe a coleção no Postman e execute na ordem: quarto, pessoa, senha e tentativa correta.
3. Tente código errado, código vencido, consulte o histórico e mostre `autorizado: false`.
4. Revogue a senha e tente novamente. Mostre que a senha anteriormente válida parou de abrir.
5. Execute `npm test` para demonstrar os cenários adicionais, incluindo falha de dependência.

## Caminho de uma tentativa

O `POST /acessos` entra no gateway. Ele identifica o recurso pelo caminho e encaminha ao serviço de acessos com Axios. Esse serviço consulta quartos pela identificação da fechadura. Se o quarto estiver ativo, consulta a rota interna de senhas. Senhas compara o hash do código, confere a validade e consulta a situação da pessoa. Acessos grava a decisão no próprio SQLite e então responde. A fechadura simulada vê `autorizado` e decide abrir ou permanecer fechada.

## Ordem para ler o código

1. **`quartos.js`**: comece pelo cadastro mais simples. `req.body` contém os dados enviados; `validar` devolve um objeto com campos nomeados; `db.prepare(...).run(...)` grava o quarto; `res.json` envia a resposta.
2. **`pessoas.js`**: usa o mesmo padrão, com nome, e-mail e tipo de pessoa.
3. **`gateway.js`**: leia primeiro as rotas no final. Cada método chama `autenticar` e depois `encaminhar`. A tentativa de acesso chama apenas `encaminhar`. A função identifica o serviço pelo primeiro trecho da URL e envia a requisição com Axios.
4. **`senhas.js`**: cadastro valida pessoa, quarto e período; verificação procura o código em um laço `for`, confere o período e consulta a pessoa. `publica` lista os campos que podem aparecer nas respostas.
5. **`acessos.js`**: acompanhe as cinco etapas comentadas: validar código, consultar quarto, verificar senha, gravar tentativa e responder.
6. **`comum.js`**: reúne funções repetidas, como abrir o banco, fazer uma chamada HTTP, validar campos e tratar erros.
7. **`scripts/iniciar.js`**: a lista `arquivos` contém exatamente os cinco programas que `npm start` inicia.

## Funções que aparecem várias vezes

- `app.get`, `app.post`, `app.put`, `app.delete`: definem o que acontece em cada rota e método HTTP.
- `req.params`: valores do caminho, como o ID em `/quartos/1`; `req.body`: objeto JSON enviado; `req.query`: filtros depois de `?`.
- `res.status(...).json(...)`: escolhe o status HTTP e devolve JSON.
- `prepare`: prepara uma consulta SQL; `run`: executa escrita; `get`: lê um registro; `all`: lê uma lista.
- `async` e `await`: permitem aguardar respostas de outros serviços antes de continuar.
- `chamar`: faz uma requisição REST para outro serviço e devolve o JSON recebido.
- `buscar`: consulta um ID no banco do próprio serviço ou devolve erro 404.
- `exigir`: se a condição for falsa, interrompe a requisição com erro 400.
- `next`: passa a requisição para a próxima função da rota, depois de autenticar.

## Requisitos do enunciado e onde estão

| Requisito                                             | Implementação                               |
| ----------------------------------------------------- | ------------------------------------------- |
| Cadastro de quartos e fechaduras                      | Serviço `quartos.js`, campo `fechaduraId`   |
| Cadastro de hóspedes, limpeza e manutenção            | Serviço `pessoas.js`, campo `tipo`          |
| Senha vinculada à pessoa e ao quarto com início e fim | Serviço `senhas.js`                         |
| Autorizar ou negar e registrar tentativas             | Serviço `acessos.js`                        |
| Entrada REST pelo gateway                             | Rotas explícitas em `gateway.js`            |
| Banco próprio por serviço                             | Quatro arquivos SQLite, abertos com `banco` |
| Consultar dados de outro serviço por requisição       | Função `chamar`, com Axios                  |
| Testar sem frontend                                   | Coleção do Postman e testes de integração   |

## Perguntas para entender o código

**Por que são microservices?** Cada um roda em processo próprio, possui porta e banco próprios e se comunica por requisições. Compartilhar funções utilitárias não compartilha dados.

**Para que serve o gateway?** Oferece uma entrada única, autentica as operações administrativas e encaminha cada recurso ao serviço correto. Não contém regras de validade de senha.

**Por que não consultar diretamente o banco de pessoas no serviço de senhas?** Isso violaria a separação dos dados. O serviço de pessoas é responsável por responder sobre seu cadastro por REST.

**Como uma senha com zero à esquerda funciona?** É enviada como string. Um número JSON eliminaria o zero e é rejeitado.

**Como a validade é comparada?** As datas recebidas têm fuso e são convertidas para ISO UTC. Nesse formato, a ordenação das strings corresponde à ordem cronológica. A senha vale quando `inicio <= agora < fim`. O cliente não escolhe o horário da tentativa.

**Por que hash com salt?** O banco não guarda o código original. `scryptSync` deriva um hash usando um salt aleatório; `timingSafeEqual` compara os bytes. O PIN continua sendo um segredo de baixa entropia; esse mecanismo não substitui proteção contra tentativas repetidas em uma implantação real.

**O que são prepared statements?** O SQL tem marcadores `?`, e os valores são passados separadamente para `run` ou `get`. Entradas do usuário não são concatenadas nas consultas. Os nomes de tabelas da função `buscar` são constantes do código.

**O que acontece se um serviço cair?** A requisição tem timeout. Acessos registra `servico_indisponivel` e nega a entrada. Se o próprio serviço de acessos não estiver disponível, o gateway retorna 503 e não há registro nesse serviço.

**Por que usar exclusão lógica?** Para manter IDs, credenciais e histórico coerentes. `DELETE` desativa quarto/pessoa ou revoga senha. Senhas antigas deixam de funcionar para cadastros inativos.

**Por que não há chave estrangeira para pessoaId?** O registro da pessoa pertence a outro banco. A referência é validada por REST, não por uma foreign key entre bancos.

**Como o código chega ao hóspede?** O administrador define o código no aplicativo/Postman e o compartilha. O projeto implementa o cadastro e a validação; não integra um serviço externo de mensagens.

**Qual a diferença entre 200 e autorizado?** HTTP 200 significa que a tentativa foi processada. A permissão está no booleano `autorizado`, que pode ser falso mesmo com HTTP 200.

## Antes da apresentação

Leia cada serviço, altere um cadastro pelo Postman e acompanhe o fluxo acima no código. Faça uma pequena modificação por conta própria e explique seu efeito. Use o projeto como base de estudo e siga as regras da disciplina sobre autoria e uso de ferramentas.
