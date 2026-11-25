const assert = require('node:assert/strict');
const test = require('node:test');
const { handleMessage } = require('../src/handler.cjs');

test('responde a vídeo citado com uma única figurinha sonora', async () => {
  const quoted = { videoMessage: { mimetype: 'video/mp4' } };
  const raw = { key: { remoteJid: '123@s.whatsapp.net' }, message: {
    extendedTextMessage: { text: '!figsom', contextInfo: { quotedMessage: quoted } },
  } };
  const sticker = Buffer.from('imagem ANMF');
  const audio = Buffer.from('opus');
  const replies = [];
  await handleMessage(raw, {
    normalize: (message) => message,
    download: async (media, kind) => {
      assert.equal(media, quoted.videoMessage);
      assert.equal(kind, 'video');
      return Buffer.from('video');
    },
    convert: async () => [
      { mimetype: 'image/webp', data: sticker },
      { mimetype: 'audio/ogg', data: audio },
    ],
    send: async (payload) => replies.push(payload),
  });
  assert.deepEqual(replies, [{ sticker, stickerAudio: audio, isAnimated: true }]);
});

test('!fig envia a animação sem anexar áudio', async () => {
  const sticker = Buffer.from('imagem ANMF');
  const replies = [];
  await handleMessage({
    key: { remoteJid: '123@s.whatsapp.net' },
    message: { videoMessage: { caption: '!fig', mimetype: 'video/mp4' } },
  }, {
    normalize: (message) => message,
    download: async () => Buffer.from('video'),
    convert: async () => [{ data: sticker }, { data: Buffer.from('opus') }],
    send: async (payload) => replies.push(payload),
  });
  assert.deepEqual(replies, [{ sticker, isAnimated: true }]);
});

test('!figsom explica a falta de áudio sem enviar figurinha muda', async () => {
  const replies = [];
  await handleMessage({
    key: { remoteJid: '123@s.whatsapp.net' },
    message: { videoMessage: { caption: '!figsom', mimetype: 'video/mp4' } },
  }, {
    normalize: (message) => message,
    download: async () => Buffer.from('video'),
    convert: async () => [{ data: Buffer.from('imagem ANMF') }],
    send: async (payload) => replies.push(payload),
  });
  assert.equal(replies.length, 1);
  assert.match(replies[0].text, /faixa de áudio/);
});

test('!help lista os comandos sem precisar de mídia', async () => {
  const replies = [];
  await handleMessage({
    key: { remoteJid: '123@s.whatsapp.net' },
    message: { conversation: '!help' },
  }, {
    normalize: (message) => message,
    send: async (payload) => replies.push(payload),
  });
  assert.equal(replies.length, 1);
  for (const command of ['!fig', '!figquadrada', '!figsom', '!figsomquadrada', '!clip', '!help']) {
    assert.ok(replies[0].text.includes(command + ' '), command);
  }
});
