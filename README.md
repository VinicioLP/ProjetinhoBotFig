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

| Comando | Resultado |
| --- | --- |
| `!help` | Lista de comandos e instruções de uso |
| `!fig` em uma foto | Figurinha estática |
| `!fig` em um GIF ou vídeo | Figurinha animada sem áudio |
| `!figsom` em um vídeo com áudio | Envio experimental de figurinha sonora |
| `!figsomquadrada` em um vídeo com áudio | Figurinha sonora com recorte central de 512 × 512 px, sem bordas |
| `!clip` em um vídeo | Vídeo quadrado em MP4 com o áudio original, quando houver |

Coloque o comando na legenda ou responda à mídia com ele. Para testar de ponta a ponta, envie um vídeo com áudio e a legenda `!figsom` de outra conta, espere a resposta e toque no ícone de som da figurinha no celular. O bot aceita até 16 MB. !figsom e !figsomquadrada usam os primeiros 10 segundos de vídeo e áudio. !fig e !clip usam até 6 segundos.

## Testes

```powershell
npm test
```



## Rodar no Android com Termux

O celular executa o bot diretamente e pode ficar com a tela apagada. O GitHub guarda o código e permite puxar atualizações. O bot usa uma conexão de saída para o WhatsApp, então nenhuma porta precisa ser aberta no roteador.

1. Instale o [Termux pelo F-Droid](https://f-droid.org/packages/com.termux/).
2. Abra o Termux e execute:

   ```sh
   pkg update
   pkg install git nodejs-lts npm ffmpeg
   git clone https://github.com/VinicioLP/ProjetinhoBotFig.git
   cd ProjetinhoBotFig
   npm ci --ignore-scripts
   termux-wake-lock
   FFMPEG_PATH="$(command -v ffmpeg)" npm start
   ```

   O projeto fica na pasta privada do Termux. O comando usa o FFmpeg do Android e dispensa o binário que o npm normalmente baixa.

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
export FFMPEG_PATH="$(command -v ffmpeg)"
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
FFMPEG_PATH="$(command -v ffmpeg)" npm start
```

A pasta `.plogme_auth` guarda as credenciais localmente e já está no `.gitignore`. Mantenha a pasta no celular para reutilizar a sessão.
