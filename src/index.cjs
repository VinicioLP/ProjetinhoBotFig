const path = require('node:path');
const qr = require('qrcode-terminal');
const { createCollection } = require('./collection.cjs');
const { messageCommand, handleMessage } = require('./handler.cjs');
const { convertMedia, MediaError } = require('./media.cjs');

const authPath = path.join(__dirname, '..', '.plogme_auth');
const maxBytes = 16 * 1024 * 1024;

async function main() {
  const {
    makeWASocket, DisconnectReason, useMultiFileAuthState, DEFAULT_CONNECTION_CONFIG,
    normalizeMessageContent, downloadContentFromMessage,
  } = await import('plogme');
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const collection = createCollection();
  const pending = new Map();
  let socket;
  let retryTimer;
  let stopped = false;
  let busy = false;
  let retries = 0;
  let pendingSave = Promise.resolve();

  async function download(media, kind) {
    if (Number(media.fileLength) > maxBytes) throw new MediaError('Envie uma imagem ou um vídeo de até 16 MB.');
    const stream = await downloadContentFromMessage(media, kind);
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > maxBytes) throw new MediaError('Envie uma imagem ou um vídeo de até 16 MB.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
  }

  function connect() {
    const current = makeWASocket({
      auth: state,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      logger: DEFAULT_CONNECTION_CONFIG.logger.child({}, { level: 'warn' }),
    });
    socket = current;
    current.ev.on('creds.update', () => {
      pendingSave = pendingSave.then(saveCreds)
        .catch((error) => console.error('Falha ao salvar sessão:', error.message));
    });
    current.ev.on('connection.update', ({ qr: code, connection, lastDisconnect }) => {
      if (stopped || current !== socket) return;
      if (code) {
        console.log('Abra WhatsApp → Aparelhos conectados e escaneie o QR abaixo.');
        qr.generate(code, { small: true });
      }
      if (connection === 'open') {
        retries = 0;
        console.log('Bot online. Envie !help para ver os comandos.');
      }
      if (connection !== 'close') return;
      const status = lastDisconnect?.error?.output?.statusCode;
      if (status === DisconnectReason.loggedOut || status === DisconnectReason.connectionReplaced) {
        console.error('Sessão encerrada pelo WhatsApp. Consulte o README para vincular de novo.');
        return;
      }
      const delay = status === DisconnectReason.restartRequired ? 0 : Math.min(30_000, 1_000 * 2 ** retries++);
      retryTimer = setTimeout(connect, delay);
    });

    current.ev.on('messages.upsert', async ({ type, messages }) => {
      if (type !== 'notify' || current !== socket || stopped) return;
      for (const raw of messages) {
        const { remoteJid, fromMe } = raw.key;
        if (!remoteJid || fromMe || remoteJid === 'status@broadcast'
          || !messageCommand(normalizeMessageContent(raw.message))) continue;

        const send = (payload) => current.sendMessage(remoteJid, payload, { quoted: raw });
        const sendText = (text) => send({ text })
          .catch((error) => console.error('Falha ao enviar resposta:', error.message));
        if (busy) {
          await sendText('Estou processando outra mídia. Tente novamente em alguns segundos.');
          continue;
        }

        busy = true;
        try {
          await handleMessage(raw, { normalize: normalizeMessageContent, download, convert: convertMedia, send, collection, pending });
        } catch (error) {
          if (!(error instanceof MediaError)) console.error('Falha no comando:', error.message);
          await sendText(error instanceof MediaError ? error.message
            : 'Não consegui processar ou enviar a mídia. Tente outra imagem ou vídeo.');
        } finally {
          busy = false;
        }
      }
    });
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(retryTimer);
    socket?.end();
    await pendingSave;
    process.exit(0);
  }

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  connect();
}

main().catch((error) => {
  console.error('Falha ao iniciar:', error.message);
  process.exitCode = 1;
});
