# Note-Chan

Widget de notas, listas e eventos que fica ancorado no canto da tela — leve, sempre visível e **local por padrão**: sem conta, sem login, tudo em `data.json` na sua máquina. A única coisa que sai do computador é opcional — a sincronização com o Google Agenda, que só liga se você conectar sua conta em Configurações.

Também tem um mapa de hábitos, com histórico de sequência no estilo do GitHub, e um bichinho virtual pra dar uma desculpa carinhosa pra você completar suas tarefas (desligado por enquanto, ver [Bichinho virtual](#bichinho-virtual)).

Feito com [Electron](https://www.electronjs.org/) puro (sem framework de UI) para Windows.

## Índice

- [Funcionalidades](#funcionalidades)
- [Ferramentas de texto](#ferramentas-de-texto)
- [Instalação](#instalação)
- [Atualizações](#atualizações)
- [Uso](#uso)
- [Onde ficam os seus dados](#onde-ficam-os-seus-dados)
- [Sincronização com o Google Agenda](#sincronização-com-o-google-agenda)
- [Desenvolvimento](#desenvolvimento)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Licença](#licença)

## Funcionalidades

### Widget

- Fica ancorado no canto inferior esquerdo da tela, sempre visível por cima das outras janelas.
- Modo bandeja: recolhe pra só a barra de título, clique expande de novo.
- Atalho global pra mostrar/ocultar (`Ctrl+Alt+N` por padrão), captura rápida de nota (`Ctrl+Alt+Q`) e evento rápido (`Ctrl+Alt+E`) de qualquer lugar do Windows — todos configuráveis.
- Passar o mouse nas abas Notas e Eventos mostra os atalhos globais daquela aba, com as teclas configuradas no momento.
- Arrastar um arquivo pra cima do widget cria uma nota com o conteúdo dele (texto lido direto; outros formatos viram um atalho pro caminho do arquivo).
- Navegação completa por teclado: setas para mover entre cards, `Enter` abre/fecha, `Delete` exclui (com confirmação em dois toques), `Esc` recolhe.
- Busca por título entre os cards da aba atual — clique na lupa ou `Ctrl+F`, ignora acentuação.
- Cronômetro e temporizador embutidos, com o tempo restante/decorrido aparecendo discretamente na própria barra de título mesmo com o painel fechado.

### Bichinho virtual

> **Desligado na 1.3.0.** A bolha e o painel não aparecem, completar tarefa não mexe nos status e as notificações dele param. Nada foi apagado: os status salvos ficam como estão e tudo volta trocando `pet` para `true` em `src/js/Features.js`. O desenho do mascote na janela de alarme continua.

Um mascote em pixel art com 4 status: vida, fome, carência e higiene.

- Fome zera em 24h, carência em 30h e higiene em 60h — e o relógio só corre com o **computador ligado e o app rodando**: tempo com o app fechado, com a máquina dormindo ou hibernando não conta. Voltar de um fim de semana não encontra o bichinho faminto, ele fica como foi deixado.
- Carência é a única que a interação segura (abrir o app, dar carinho, brincar); vida se recupera sozinha quando os outros três estão em dia.
- Completar tarefas e eventos nas outras abas recupera fome automaticamente — comida na aba dele é só um bônus manual.
- Três abas de interação: Comida, Brinquedos e Higiene, cada ação com um ganho de status diferente.
- Ganha XP e sobe de nível com o tempo de cuidado.
- Ícone flutuante no canto inferior direito do widget abre o painel dele.

### Notas, Listas e Eventos

Três abas, cada uma com seus próprios cards, arrastáveis para reordenar:

- **Notas** — texto livre, com prévia recolhida e editor expandido. O botão de expandir no canto do card abre a nota numa **janela própria, estilo bloco de notas**: redimensionável, com entrada na barra de tarefas, contador de palavras/caracteres/linhas e gravação automática. `Ctrl+Alt+J` cria uma nota já abrindo direto nesse modo. O que você escreve na janela aparece no widget e vice-versa.
- **Listas** — itens com checkbox, reordenáveis, "Enter" continua a lista igual Notion/Todoist. Com todos os itens marcados, o card aparece como concluído.
- **Eventos** — data, recorrência (diária/semanal/mensal/anual), horário de início/fim opcional, link, checklist próprio, e alarme sonoro que toca na hora marcada (sintetizado via Web Audio, sem depender de arquivo de áudio externo). Eventos sem horário avisam quando o widget é aberto no dia marcado, em vez de tocar o alarme. Evento recorrente avança sozinho para a próxima ocorrência quando a data passa, e o evento único vira concluído sozinho no dia seguinte ao da data — não existe "marcar como feito" no evento; o que se marca são as tarefas do checklist dele. O botão **Salvar** grava e já sincroniza com o Google, mostrando o resultado no próprio botão.
  - **Modo agenda** — o botão ao lado de "+ Novo evento" troca os cards por uma lista por dia, no estilo da agenda do Google: os próximos 30 dias (com "Mostrar mais 30 dias" no fim), cada ocorrência dos eventos recorrentes no seu dia, a cor da primeira tag do evento, o dia de hoje destacado e os eventos únicos atrasados no topo. Clicar num evento volta para os cards com ele aberto. O modo escolhido fica salvo.

Cada nota/lista/evento pode receber **tags** coloridas (gerenciadas em Configurações, com rolagem horizontal quando há muitas), exibidas como pills no card.

### Mapa de hábitos

Bolha própria no widget (o ícone de caixa marcada), abaixo da do bichinho.

- Cada hábito tem nome e frequência: diária, semanal, quinzenal ou mensal.
- Marcar como feito vale para o período inteiro: o hábito semanal fica concluído até a semana seguinte, o mensal até o mês seguinte.
- Histórico de sequência em quadradinhos, no estilo do gráfico de contribuições do GitHub, e a contagem de períodos seguidos. O período atual ainda pendente não quebra a sequência.
- Os pendentes ficam no topo da lista e os já feitos descem para o fim.
- Modo compacto por hábito: só os últimos 7 dias, na mesma linha do nome.
- Com algum hábito pendente, a bolha ganha um "!" no canto pra avisar.

### Evento rápido

`Ctrl+Alt+E` (ou "Evento rápido" na bandeja) abre um popup pra criar um evento sem abrir o widget: título, data, horário de início e fim e recorrência.

### Aniversariantes

Aba dedicada dentro de Configurações: nome, data e categoria (família/amigo/trabalho), com indicador de quantos dias faltam e idade que a pessoa vai fazer.

### Notificações

Além do alarme de eventos, o app avisa em dois outros momentos, sempre "na voz" do bichinho e sem tom de cobrança:

- Quando fome, higiene, carência ou vida do bichinho ficam baixos — no máximo um aviso por status a cada 3h, pra não virar spam. Na 1.3.0 esse aviso está desligado junto com o bichinho.
- Quando há eventos sem horário marcados para o dia, ao abrir o widget.

Clicar numa notificação do bichinho abre o widget direto no painel dele.

### Configurações

- 6 temas prontos: Dourado, Kuromi, Hello Kitty, Cinnamoroll, Gudetama e D'Lírio.
- Transparência do widget ajustável.
- Alarme de eventos: ligar/desligar, volume e escolha de som (4 opções sintetizadas).
- Atalhos globais reconfiguráveis (gravados clicando e pressionando a combinação desejada).
- Editor de texto: tamanho padrão da fonte da nota, tamanho da indentação do TAB e os atalhos de formatação (ver [Ferramentas de texto](#ferramentas-de-texto)).
- Sincronização com o Google Agenda: conectar/desconectar a conta e sincronizar sob demanda (ver [seção dedicada](#sincronização-com-o-google-agenda) abaixo).
- Atualizações: versão instalada e verificação manual de versão nova (ver [Atualizações](#atualizações)).
- Iniciar junto com o Windows (desligado por padrão): o app abre recolhido, no modo bandeja. Quem manda é o registro do Windows, então desativar pelo Gerenciador de Tarefas → Aplicativos de inicialização também aparece aqui. Só funciona na versão instalada, e o desinstalador remove a entrada.
- `Esc` fecha a janela de Configurações (durante a gravação de um atalho, ele só cancela a gravação).

## Ferramentas de texto

O conteúdo da nota é texto formatado, não texto cru. A barra aparece no card ao expandir e na janela do bloco de notas.

| Ferramenta | Onde | Atalho padrão |
|---|---|---|
| Negrito | Nota (widget e janela) | `Ctrl+B` |
| Itálico | Nota (widget e janela) | `Ctrl+I` |
| Sublinhado | Nota (widget e janela) | `Ctrl+U` |
| Lista | Nota (widget e janela) | `Ctrl+Shift+L` |
| Lista numerada | Nota (widget e janela) | `Ctrl+Shift+O` |
| Alinhamento (4 opções) | Só na janela | — |
| Bloco de código | Só na janela | — |
| Tamanho da fonte | Só na janela | — |

Alinhamento, bloco de código e tamanho de fonte ficam só na janela porque num card de 320px de largura não teriam onde caber, e nem apareceriam na prévia.

Além dos botões:

- **TAB** indenta o texto e, dentro de uma lista, cria sublista (`Shift+TAB` volta um nível).
- **`->` e `<-`** viram → e ← enquanto você digita. Isso vale em **todo o app** — item de tarefa, checklist de evento, título de card, nome de aniversariante, tag e captura rápida —, e não só na nota. Fica de fora do campo de link do evento (é URL) e da busca (filtra em vez de escrever).
- **Esc** encerra a edição da nota no widget. Dentro do editor o Enter quebra linha, senão não existiria lista de vários itens.

Os atalhos de formatação são **do editor, não do sistema**: valem com o cursor dentro da nota. Um `Ctrl+B` registrado como atalho global roubaria o negrito de todos os outros programas abertos no Windows, então eles são configurados à parte dos atalhos globais, em Configurações → Geral → Editor de texto — onde também ficam o tamanho padrão da fonte e quantos espaços o TAB insere.

Texto colado de outro programa passa por uma limpeza: negrito, itálico, listas e alinhamento sobrevivem; fonte, cor e classe do site de origem são descartadas, para o texto respeitar o tema do app e não inchar o `data.json`.

## Instalação

### Baixando o instalador

Pegue o `Note-Chan-Setup-<versão>.exe` mais recente na [página de releases](https://github.com/BadPineapple/Note-Chan/releases) e rode. O instalador é em português, mostra a licença, deixa escolher a pasta e cria os atalhos na Área de Trabalho e numa pasta "Note-Chan" no Menu Iniciar. Não precisa de privilégio de administrador (instala só para o seu usuário).

Instalar por cima de uma versão anterior substitui os arquivos do programa e **preserva seus dados** — eles ficam em outro lugar (ver [Onde ficam os seus dados](#onde-ficam-os-seus-dados)).

### Desinstalando

Por qualquer um dos dois caminhos:

- **Menu Iniciar** → pasta Note-Chan → "Desinstalar Note-Chan".
- **Configurações do Windows** → Aplicativos → Aplicativos instalados → Note-Chan → Desinstalar.

A desinstalação remove o programa e os atalhos, mas **não apaga suas notas**: o `data.json` e os backups continuam em `%APPDATA%/NoteChan` caso você reinstale depois. Para apagar de vez, exclua essa pasta na mão.

### Compilando você mesmo

Pré-requisitos: [Node.js](https://nodejs.org/) 22.12 ou mais novo (LTS) e npm.

```bash
npm install
npm run dist
```

O instalador é gerado em `dist/Note-Chan-Setup-<versão>.exe`.

As artes do instalador (painel lateral e faixa do topo) ficam em `build/*.bmp` e já vêm versionadas. Para regerá-las depois de mexer no visual, rode `npm run art` — ver [Ícone do app](#ícone-do-app).

## Atualizações

O app **verifica** se saiu uma versão nova, mas nunca baixa nem instala nada sozinho:

- Uma vez por dia (e só na versão instalada, não em desenvolvimento), consulta o release mais recente no GitHub e compara com a versão em execução.
- Havendo uma versão nova, aparece uma notificação do sistema; clicar nela abre a página de download no navegador.
- O aviso é dado **uma vez por versão** — quem viu e decidiu atualizar depois não é lembrado todo dia.
- Em Configurações → Geral → Atualizações dá para verificar na hora, a qualquer momento.

Não há dependência de runtime para isso: é um `GET` na API pública do GitHub com o `fetch` nativo. Sem internet ou atrás de um proxy, a verificação simplesmente falha em silêncio e o app segue funcionando igual.

## Uso

| Atalho | Ação |
|---|---|
| `Ctrl+Alt+N` (padrão) | Mostrar/ocultar o widget |
| `Ctrl+Alt+Q` (padrão) | Captura rápida de nota (de qualquer app) |
| `Ctrl+Alt+J` (padrão) | Nova nota já aberta em janela (modo bloco de notas) |
| `Ctrl+Alt+E` (padrão) | Evento rápido (de qualquer app) |
| `Ctrl+F` | Abrir a busca por card |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Negrito / itálico / sublinhado, dentro da nota |
| `Ctrl+Shift+L` / `Ctrl+Shift+O` | Lista / lista numerada, dentro da nota |
| `TAB` | Indentar (dentro de lista, criar sublista) |
| `←` / `→` | Trocar de aba |
| `↑` / `↓` | Navegar entre os cards |
| `Enter` | Abrir/fechar o card selecionado |
| `Delete` | Excluir o card selecionado (2º toque confirma) |
| `Esc` | Fechar a busca, o cronômetro ou o painel de hábitos, se algum estiver aberto; senão, recolhe o widget. Em Configurações, fecha a janela |

Os atalhos globais (`Ctrl+Alt+N`, `Ctrl+Alt+Q`, `Ctrl+Alt+J` e `Ctrl+Alt+E`) podem ser trocados em Configurações → Geral.

O ícone da bandeja do sistema também dá acesso rápido a: abrir o widget, captura rápida, evento rápido, criar nota/lista/evento/aniversariante direto, Configurações e Sair.

## Onde ficam os seus dados

Tudo fica em `data.json` dentro da pasta de dados do usuário do Windows (`%APPDATA%/NoteChan`). O arquivo tem um `schemaVersion`: quando um campo muda de significado, a conversão roda uma vez na abertura (o conteúdo da nota, por exemplo, era texto puro e passou a ser HTML). A cada gravação:

- Uma cópia do estado anterior é mantida (`data.json.bak`) como rede de segurança contra uma escrita corrompida.
- Um snapshot datado é salvo em `backups/` uma vez por dia, mantendo os últimos 14 dias.

Se você conectar o Google Agenda, o token de acesso fica em `google-auth.enc`, criptografado com o cofre de credenciais do próprio Windows (`safeStorage` do Electron) — nunca em texto puro, nunca dentro do `data.json`.

Logs de execução ficam em `logs/runtime.log` (rotacionado a cada 2 MB), úteis pra diagnosticar problemas sem precisar abrir o DevTools. Cada linha traz a **origem** — `main`, `widget`, `nota`, `configuracoes`, `captura` ou `alarme` —, porque com várias janelas abertas saber de onde veio a mensagem é metade do diagnóstico:

```
[2026-08-21T00:25:25.477Z] [INFO ] [main]   [WINDOW] widget criado — bandeja
[2026-08-21T00:25:25.656Z] [INFO ] [widget] [JANELA] Iniciada.
```

Exceção não tratada e promessa rejeitada sem tratamento são registradas com a pilha completa, tanto no processo principal quanto em qualquer janela — antes elas sumiam em silêncio. O main também anota quando um renderer morre ou falha ao carregar, que são os casos em que a própria janela não tem como relatar nada. Mensagem repetida vira uma contagem (`repetida 42x`) em vez de encher o arquivo, que é justamente o que um erro em laço faria.

## Sincronização com o Google Agenda

Recurso opcional e de mão dupla: eventos e aniversariantes criados no Note-Chan vão pro seu **calendário principal** do Google, e o que você cria direto no Google Agenda aparece no Note-Chan.

> Detalhamento técnico completo — fluxo OAuth, ordem da sincronização, o que sobe e o que não sobe, e o projeto de sincronizar entre máquinas — em [`docs/google.md`](docs/google.md).

- **Direção do conflito**: cada sincronização primeiro envia o que você editou aqui e só depois lê o que está lá — então uma edição local chega ao Google, mas se o mesmo evento mudou dos dois lados desde a última sincronização, o Google vence.
- **Eventos que já existiam na sua agenda**: quando você edita aqui um evento que não foi criado pelo Note-Chan, só título, data e horário sobem. Recorrência e descrição ficam intactas do lado do Google — o modelo de recorrência daqui é mais simples que o de lá, e reenviá-lo trocaria um "toda segunda e quarta até dezembro" por um "toda semana".
- **Recorrência**: sincroniza como evento recorrente de verdade no Google (RRULE); o "concluído" (automático, quando a data passa) é só uma informação do Note-Chan — o Google não tem esse conceito.
- **Como identifica o que é seu**: cada evento/aniversariante criado pelo app carrega uma marcação invisível (`extendedProperties`) no lado do Google, pra atualizar/excluir só o que é dele sem tocar nos seus outros compromissos.
- **Aniversariantes**: só sincronizam de forma confiável num sentido (Note-Chan → Google, como evento anual). Um evento anual recorrente criado direto no Google **não** vira aniversariante aqui — entra como evento comum, pra não arriscar categorizar errado.
- **Quando roda**: ao abrir o widget (sair do modo bandeja), a cada 15 minutos com o app rodando, e sob demanda pelo botão "Sincronizar agora" em Configurações → Geral. Uma sincronização por vez — pedidos que chegam durante outra em andamento aproveitam a mesma.

### Configurando pela primeira vez

Sincronização exige credenciais OAuth próprias (o app não vem com uma chave compartilhada):

1. Crie um projeto em [console.cloud.google.com](https://console.cloud.google.com), ative a **Google Calendar API**.
2. Configure a tela de consentimento OAuth (Externo/Testing, adicionando seu e-mail como usuário de teste — dispensa verificação do Google pra uso pessoal).
3. Crie uma credencial **OAuth 2.0 → App para computador** e copie o Client ID e o Client Secret.
4. Copie `src/js/main/google/GoogleAuthConfig.example.js` para `src/js/main/google/GoogleAuthConfig.js` (esse arquivo é gitignored) e preencha os dois valores.
5. Em Configurações → Geral → Google Agenda, clique em Conectar e autorize pelo navegador.

## Desenvolvimento

```bash
npm install
npm start        # roda o app em modo desenvolvimento (DevTools abre junto)
npm run dist      # gera o instalador Windows em dist/
```

Não há framework de build nem bundler — os arquivos em `src/html` e `src/js` são servidos como estão pelo Electron.

### Ícone do app

`assets/img/icon.png` (1024×1024) é gerado a partir de `scripts/icon-source.html` — um SVG renderizado num `BrowserWindow` do Electron e salvo em disco. Pra ajustar o mascote, edite o SVG e rode:

```bash
npm run art
```

O mesmo comando regera as artes do instalador (`build/installerSidebar.bmp`, `build/uninstallerSidebar.bmp` e `build/installerHeader.bmp`) a partir de `scripts/installer-sidebar.html` e `scripts/installer-header.html`. O NSIS só aceita BMP nessas imagens, então `scripts/generate-installer-art.js` renderiza o SVG num `BrowserWindow` e escreve o BMP de 24 bits na mão — não vale puxar uma dependência de conversão de imagem só pra isso.

O electron-builder converte o PNG do ícone pro `.ico` do instalador automaticamente (exige no mínimo 256×256 de origem).

### Ícones da interface

Toda a interface usa SVG do conjunto [Lucide](https://lucide.dev/) (ISC license) embutido diretamente no HTML/JS — sem emoji, sem fonte de ícone, sem dependência em tempo de execução. `src/js/Icons.js` guarda o miolo de cada ícone usado (`Icons.svg("nome", tamanho)` devolve a tag `<svg>` pronta, herdando a cor do tema via `currentColor`). Pra adicionar um ícone novo, pegue o path em `unpkg.com/lucide-static/icons/<nome>.svg` e acrescente uma entrada no objeto `ICONS`.

## Arquitetura

- **Processo principal** (`src/js/Main.js`) — dono das janelas, da bandeja do sistema, dos atalhos globais, do alarme e notificações, da sincronização com o Google (`src/js/main/google/`) e da persistência (`DataManager.js`). Nenhuma janela do renderer tem acesso a Node.js (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`).
- **Renderer** (`src/js/preload.js` + `Widget.js`, `Settings.js`, `QuickCapture.js`, `QuickEvent.js`, `Alarm.js`) — cada janela HTML fala com o processo principal só através de um `window.api` restrito, exposto via `contextBridge` com uma lista fechada de canais IPC permitidos.
- **Módulos do widget** (`src/js/widget/`): `CardBase` (o que os cards dividem: tags, cabeçalho, arrastar e checklist), `NoteCard`, `ListCard`, `EventCard`, `ExtraTools` (busca e cronômetro), `TamaPet` e `HabitTracker`. O `Widget.js` só coordena: estado, gravação, abas, render do quadro, teclado e boot.
- **Módulos das Configurações** (`src/js/settings/`): um por aba ou bloco — `AppearanceSettings`, `ShortcutRecorder`, `BirthdayCards`, `TagCards`, `GoogleSettings` e `UpdateSettings`.
- Os módulos do renderer seguem o mesmo padrão: `criar({ dependências })` devolve uma API pequena, e os dados são lidos por `obterDados()` em vez de guardar o objeto.
- **Chaves de funcionalidade** (`src/js/Features.js`): lidas pelo widget e pelo processo principal; hoje só `pet`.
- **Janelas**: widget (notas/listas/eventos/hábitos/bichinho), Configurações, captura rápida, evento rápido, o popup de alarme e a nota em janela — cada uma é um `BrowserWindow` isolado. A nota em janela é a única redimensionável e a única que aparece na barra de tarefas; pode haver várias abertas ao mesmo tempo, uma por nota.
- **Módulos compartilhados** (UMD, `require()` no main e `<script>` global no renderer): `EventUtils.js` (datas/recorrência), `TagUtils.js` (paleta de tags), `TamaSprite.js` (desenho do bichinho em SVG por fórmula), `Icons.js` (ícones da UI), `UiUtils.js` (escape de HTML, confirmação de exclusão em dois toques e afins), `RichText.js` (o formato da nota: limpeza, conversão para texto e migração) e `RichEditor.js` (comportamento do editor e a barra de ferramentas, iguais nos dois lugares onde se escreve nota).

## Stack

- [Electron](https://www.electronjs.org/) — runtime desktop
- JavaScript puro no front-end (sem React/Vue/framework nenhum) e CSS com variáveis para os temas — `src/html/css/Theme.css` concentra tanto a paleta (`--bg-rgb`, `--accent-rgb`, ...) quanto a forma (fonte, arredondamento, contorno e sombra dos cartões), e é o único arquivo que as cinco janelas carregam em comum
- [electron-builder](https://www.electron.build/) — empacotamento e instalador NSIS
- [Lucide](https://lucide.dev/) — conjunto de ícones SVG da interface
- Fonte embutida em `assets/fonts/`, usada só pelo tema D'Lírio: [Kalam](https://fonts.google.com/specimen/Kalam) (SIL OFL 1.1), manuscrita, em toda a interface. Vai embutida porque o CSP das janelas é `font-src 'self'` — o texto da licença fica ao lado dos arquivos
- Google Calendar API v3, via `fetch` nativo do Node/Electron (sem SDK) — só para quem conectar a sincronização

## Licença

MIT — veja [LICENSE](LICENSE).

A fonte embutida tem licença própria, que não é a do projeto: `assets/fonts/Kalam-OFL.txt` (SIL OFL 1.1). Os ícones Lucide são ISC.
