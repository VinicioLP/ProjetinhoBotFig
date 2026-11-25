# Bot de figurinha sonora para WhatsApp

O comando `!figsom` usa o envio experimental de áudio embutido do `plogme`. Os testes verificam o áudio na mensagem gerada. O ícone e a reprodução dependem de o WhatsApp reconhecer o formato recebido.

## Rodar no Windows

Com Node.js 22 ou superior, abra o PowerShell nesta pasta e rode:

```powershell
npm ci
npm start
```

A instalação baixa o FFmpeg. No celular da conta do bot, abra **WhatsApp → Aparelhos conectados → Conectar um aparelho** e escaneie o QR do terminal. A sessão do `plogme` fica em `.plogme_auth`. A troca de biblioteca exige vincular a conta uma vez pelo QR novo.

Mantenha o terminal aberto. Para parar, use **Ctrl+C**. Se precisar trocar de conta ou refazer uma sessão encerrada, pare o bot, renomeie a pasta `.plogme_auth` e inicie novamente. Essa pasta contém credenciais da sessão.

## Usar

Mande `!help` para ver os comandos por categoria. Coloque o comando na legenda ou responda à mídia com ele.

### Criar figurinhas

| Comando | Como usar |
| --- | --- |
| `!fig` | Converte foto, GIF ou vídeo em figurinha sem som. |
| `!figquadrada` | Recorta o centro e preenche o quadrado de 512 × 512 px. |
| `!figtexto eu só ia dar uma olhada` | Escreve uma frase de até 140 caracteres em uma foto ou vídeo. |
| `!figzoom` | Faz uma foto virar uma animação com zoom. |
| `!figloop` | Faz os primeiros três segundos de um vídeo ou GIF irem e voltarem. |
| `!figdupla` | Responda à primeira foto com o comando e depois à segunda foto com o mesmo comando. |

### Som e vídeo

| Comando | Como usar |
| --- | --- |
| `!figsom` | Converte um vídeo com áudio em figurinha sonora de até 10 segundos. |
| `!figsom 00:12 00:20` | Usa o trecho de 12 a 20 segundos. O trecho pode ter até 10 segundos. |
| `!figsomquadrada` | Faz uma figurinha sonora com recorte central. Também aceita início e fim. |
| `!figsomvoz` | Responda à figurinha, foto ou vídeo e depois à mensagem de voz com o mesmo comando. |
| `!clip` | Cria um MP4 quadrado de até seis segundos com o áudio original. |

Nos comandos de duas etapas, envie a segunda mídia em até cinco minutos, na mesma conversa. Cada arquivo pode ter até 16 MB. Se o FFmpeg não encontrar uma fonte para `!figtexto`, defina `FIG_FONT_PATH` para o caminho de uma fonte TTF instalada.

### Coleção pessoal

Responda a uma figurinha com `!salvar surtando`. Depois, mande `!usar surtando` na mesma conversa. Cada pessoa pode guardar até 50 nomes por conversa. Usar o mesmo nome substitui a figurinha anterior. O bot guarda a coleção em `.sticker-collection`, que fica fora do Git.


## Rabisca

Mande `!rabisca` em um grupo para misturar todos os desenhos. Para escolher um tema, use `!rabisca` seguido de animais, comidas, objetos, transportes, esportes, música, profissões, natureza, fantasia ou tecnologia.

- Mande o palpite como mensagem normal ou use `!chute palavra`. O primeiro acerto vale 10 pontos. O bot mostra quem acertou e seu total antes de abrir o próximo desenho.
- O desenho é enviado como prévia de link na conversa, sem foto em anexo. O link leva ao guia e aos créditos. Cada resposta só entra uma vez por partida, e o bot prioriza palavras e desenhos que o grupo viu há mais tempo.
- Cada desenho tem 60 segundos. Se ninguém acertar a tempo, a partida termina e o bot revela a resposta e o placar.
- O grupo tem três usos de `!dica` e três de `!pular` por partida. Cada desenho só pode receber uma dica, e pular já abre outro desenho.
- `!placar` mostra a pontuação atual ou a da última partida do grupo. Quem iniciou pode encerrar com `!fim` ou `!rabisca fim`. O placar fica na memória até reiniciar o bot.

Os traços vêm do [Google Quick, Draw! Dataset](https://github.com/googlecreativelab/quickdraw-dataset), com desenhos contribuídos pelos jogadores e disponibilizados por Google, Inc. sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). O arquivo `data/rabisca.json` contém um recorte de 332 desenhos de 59 categorias. Os rótulos foram traduzidos para português e os traços são centralizados e renderizados como imagem pelo bot.

O arquivo `data/rabisca-openmoji.json` acrescenta 32 ilustrações em preto e branco do [OpenMoji](https://openmoji.org/), distribuídas sob [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). O bot centraliza e redimensiona as ilustrações para o cartão. Os cartões derivados dessas ilustrações mantêm a mesma licença. [Arquivos de origem](https://github.com/hfg-gmuend/openmoji/tree/5acb7f049c45c57a98449122d470de9f09bb6794/black/618x618).


A expansão `data/rabisca-expansao.json` reúne 209 respostas novas e leva o jogo a 300 respostas distintas. Cada carta registra a imagem original, a autoria, a licença e, quando aplicável, sinônimos em português. As imagens foram rasterizadas e redimensionadas para os cartões. Os ícones de Game-icons.net também tiveram as cores invertidas para o fundo claro.

- [Tabler Icons](https://github.com/tabler/tabler-icons), por Paweł Kuna e colaboradores, sob [MIT](data/LICENSE-TABLER.txt).
- [Game-icons.net](https://game-icons.net/about.html), sob [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) ou CC0 quando indicado no arquivo. Os autores individuais aparecem nos cartões e na base.
- [Openclipart](https://openclipart.org/faq), sob [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Os autores e páginas originais estão na base.

## Testes

```powershell
npm test
```



## Rodar no Android com Termux

O celular executa o bot diretamente e pode ficar com a tela apagada. O GitHub guarda o código e permite puxar atualizações. O bot usa uma conexão de saída para o WhatsApp, então nenhuma porta precisa ser aberta no roteador.

1. Instale o [Termux pelo F-Droid](https://f-droid.org/packages/com.termux/).
2. Abra o Termux e execute:

   ```sh
   pkg update && pkg upgrade
   pkg install git nodejs-lts npm ffmpeg
   git clone https://github.com/VinicioLP/ProjetinhoBotFig.git
   cd ProjetinhoBotFig
   npm ci --ignore-scripts
   termux-wake-lock
   npm start
   ```

   O projeto fica na pasta privada do Termux. O bot encontra o FFmpeg instalado pelo Termux. Se a conversão falhar por falta de FFmpeg, rode ffmpeg -version para conferir a instalação.

3. No WhatsApp da conta do bot, abra **Aparelhos conectados → Conectar um aparelho** e escaneie o QR no Termux. Se for usar o WhatsApp no mesmo celular, exiba o QR temporariamente em outra tela que você controle. Aguarde **Bot online** e mande **!help** de outra conta.
4. Nas configurações do Android, marque o Termux como **Sem restrições** em uso de bateria, se disponível. Mantenha o aparelho ligado e conectado à internet. Teste **!help** com a tela apagada. O Android ainda pode encerrar o Termux em segundo plano, dependendo do aparelho.

### Iniciar após reiniciar o Android

Instale o [Termux:Boot pelo F-Droid](https://f-droid.org/packages/com.termux.boot/) e abra o aplicativo uma vez. Depois de vincular o WhatsApp e testar o bot, crie o script no Termux:

```sh
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/start-bot" <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd "$HOME/ProjetinhoBotFig" || exit 1
exec node src/index.cjs >> "$HOME/projetinho-bot.log" 2>&1
EOF
chmod +x "$HOME/.termux/boot/start-bot"
```

Após reiniciar e desbloquear o celular, consulte o log com `tail -f ~/projetinho-bot.log`. Saia da visualização com **Ctrl+C**. Se o bot pedir um QR novo, trate o log como privado.

### Atualizar o bot no celular

Pare a instância que estiver rodando. Se ela estiver aberta no Termux, use **Ctrl+C**. Se tiver sido iniciada pelo Termux:Boot, rode `pkill -TERM -f '^node src/index[.]cjs$'` no Termux.

```sh
cd ~/ProjetinhoBotFig
git pull --ff-only
npm ci --ignore-scripts
termux-wake-lock
npm start
```

A pasta `.plogme_auth` guarda as credenciais localmente e já está no `.gitignore`. Mantenha a pasta no celular para reutilizar a sessão.
