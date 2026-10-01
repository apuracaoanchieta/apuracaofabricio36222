# Apuração — Fabricio Petri 36.222

Sistema de apuração paralela de votos para Deputado Estadual (ES).

**Um link só** (`index.html`) abre a tela inicial com as três opções de acesso: **Sou fiscal**, **Apuração** e **Partido / Candidato**. Em cada área há o botão **Início** para voltar às opções.

| Área | Arquivo | Acesso |
|---|---|---|
| **Fiscal** | `fiscal.html` | Link aberto (sem senha). Envia local, seção, votos e foto do BU. Funciona sem internet: guarda no celular e envia sozinho quando a conexão volta. |
| **Apuração** | `apuracao.html` | Só senha. Confere os BUs, corrige votos, resolve envios repetidos, lança manualmente (inclusive outros municípios), vê gráficos e altera todos os parâmetros. |
| **Partido** | `partido.html` | Só senha. Só visualiza. Mostra separado o que está **confirmado** e o que está **em conferência**. |

Os painéis atualizam sozinhos a cada 30 segundos. O banco de dados é uma planilha do Google Sheets e as fotos ficam numa pasta do Google Drive.

---

## Testar agora (modo demonstração)

Do jeito que está (`API_URL: 'DEMO'` no arquivo `assets/js/config.js`), o sistema já funciona **sem planilha**, com dados fictícios salvos só no navegador. Serve para ver o visual e treinar os fiscais.

- Apuração: senha `apuracao`
- Partido: senha `partido`

No modo demonstração aparece uma faixa escura no topo. Ela some quando você liga a planilha (passo 2).

---

## Passo 1 — Criar a planilha e a API (Google Apps Script)

Use a **conta Google do partido**.

1. Crie uma **planilha nova e vazia** no Google Sheets (ex.: "Apuração 2026 – Fabricio Petri").
2. Menu **Extensões → Apps Script**.
3. Apague o conteúdo que aparece no editor e cole **todo** o conteúdo do arquivo `Code.gs` (entregue separado, fora desta pasta, porque contém as senhas: **não suba esse arquivo no GitHub**).
4. As senhas de acesso ficam no topo do código (`SENHA_INICIAL_APURACAO` e `SENHA_INICIAL_PARTIDO`).
5. Clique em **Salvar** (ícone de disquete).
6. Na barra de cima, escolha a função **`instalar`** e clique em **Executar**.
   O Google vai pedir autorização: **Revisar permissões → escolha a conta → Avançado → Acessar (não seguro) → Permitir**. Isso é normal para scripts próprios.
   A planilha ganha as abas `CONFIG`, `LOCAIS`, `SECOES`, `LANCAMENTOS`, `USUARIOS` e `LOG`, já com os 32 locais e 98 seções de Anchieta (base 2024), e é criada a pasta de fotos no Drive.
7. Clique em **Implantar → Nova implantação**.
   - Tipo (engrenagem): **App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Clique em **Implantar** e **copie a URL do app da Web** (termina em `/exec`).

> O login é só com senha. Depois dá para trocar as senhas em **Apuração → Parâmetros → Senhas**. Rodar `instalar` de novo volta para as senhas escritas no código.
> A senha da Apuração também abre a área do Partido.

## Passo 2 — Ligar o site à planilha

Abra `assets/js/config.js` e cole a URL copiada:

```js
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/SEU-CODIGO/exec',
  ATUALIZAR_A_CADA_SEGUNDOS: 30
};
```

## Passo 3 — Publicar no GitHub Pages

1. No GitHub, crie um repositório (ex.: `apuracao-fabricio`).
2. Envie **todos os arquivos desta pasta** mantendo a pasta `assets/`. Pelo site: **Add file → Upload files** e arraste o conteúdo.
3. **Settings → Pages → Branch: `main` / pasta `/ (root)` → Save**.
4. Em 1 ou 2 minutos o **link único** fica assim:
   `https://SEU-USUARIO.github.io/apuracao-fabricio/`
   É esse link que você manda para fiscais, equipe de apuração e partido; cada um escolhe a sua opção na tela inicial.

Se quiser, existe também o atalho que abre direto o formulário do fiscal (`.../fiscal.html`). Os dois aparecem, com botão de copiar, em **Apuração → Parâmetros → Geral**.

---

## Extras da Apuração (aba Painel)

- **Modo telão** (`telao.html`): tela cheia para a TV do comitê, com o total de votos, as urnas apuradas e os 5 maiores locais. Atualiza sozinho a cada 30 s. Abre com a senha da Apuração ou do Partido (o Partido também tem o botão de TV no topo). Na TV: clique em **Tela cheia** ou aperte **F**.
- **Exportar Excel**: baixa uma planilha .xlsx com as abas *Resumo*, *Por local*, *Por seção* (incluindo seções sem envio) e *Todos os envios* (histórico completo, com link da foto do BU).
- **Relatório para impressão** (`relatorio.html`): relatório em A4 com resumo, votos por local e por seção. Escolha o município e se quer só os votos confirmados, depois **Imprimir / Salvar PDF**. Abre só com a senha da Apuração.

## Antes do domingo (checklist)

- [ ] Em **Parâmetros → Locais e seções**, confira os locais e seções de 2026 (dá para editar, criar, desativar ou **importar uma lista** colando `LOCAL;SEÇÃO`).
- [ ] Faça 2 ou 3 envios de teste pelo celular, incluindo um com o celular em modo avião (ele deve dizer "Guardado no celular" e enviar sozinho depois).
- [ ] Confira esses envios na Apuração e veja se aparecem no Partido.
- [ ] Apague as linhas de teste da aba `LANCAMENTOS` na planilha (pode apagar a linha inteira).
- [ ] Se quiser, **feche o recebimento** (Parâmetros → Geral) e abra só no horário da apuração.
- [ ] Peça aos fiscais para abrir o link uma vez **antes** (com internet), para o celular guardar a página e a lista de locais.

## No dia

- Os envios chegam em **Conferência**, os mais antigos primeiro. Abra o BU, compare o número com a foto, corrija se precisar e clique em **Validar e ir para o próximo** (a tecla Enter também valida).
- Seção com dois envios aparece no topo em vermelho: escolha **Usar este** no correto; os outros ficam como *substituídos*.
- BU que chegou por WhatsApp ou de outro município: **Lançar manualmente** (entra direto como confirmado; locais e seções novos são criados na hora).
- Nada é apagado: rejeitados e substituídos ficam em **Todos os envios** e podem voltar para conferência.

---

## Se precisar alterar o código do Apps Script depois

Edite (ou cole o código novo inteiro), salve e vá em **Implantar → Gerenciar implantações → lápis (editar) → Versão: Nova versão → Implantar**. Assim a URL continua a mesma e não é preciso mexer no `config.js`.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| Faixa "MODO DEMONSTRAÇÃO" continua aparecendo | A URL não foi colada no `config.js`, ou o GitHub ainda não atualizou (aguarde 1–2 min e recarregue). |
| "Sem conexão com a internet" mesmo com internet | A implantação precisa estar com **Quem pode acessar: Qualquer pessoa**. Confira também se a URL termina em `/exec`. |
| "Aba ... não encontrada" | A função `instalar` não foi executada nessa planilha. |
| Esqueceu a senha | Escreva a senha desejada no topo do código do Apps Script, salve e rode `instalar` de novo. |
| Fiscal diz que não aparece o local dele | Confira se o local e a seção estão **ativos** e no **município dos fiscais** (Parâmetros). |

## Segurança

- O link do fiscal é aberto, como era no Google Forms: qualquer pessoa com o link pode enviar. Por isso todo envio passa pela conferência com foto antes de virar "confirmado".
- As senhas ficam na planilha apenas como código embaralhado (hash), nunca em texto.
- Os acessos de Apuração e Partido duram 48 h; trocar uma senha derruba quem estava conectado com a antiga.
- A aba `LOG` registra logins, validações e alterações de parâmetros.
- Use a conta Google e os equipamentos da campanha/partido, não os de órgãos públicos.

## Estrutura

```
index.html          Tela inicial (link único com as 3 opções)
telao.html          Modo telão (TV)
relatorio.html      Relatório para impressão / PDF
fiscal.html         Fiscal
apuracao.html       Apuração
partido.html        Partido
sw.js, manifest     Funcionamento offline do fiscal
assets/css/app.css  Visual (cores da campanha)
assets/js/config.js URL da API  ← único arquivo que você precisa editar
assets/js/core.js   Regras do sistema (as mesmas usadas no Apps Script)
```
