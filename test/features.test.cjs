const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { handleMessage } = require('../src/handler.cjs');
const { ffmpeg, convertMedia } = require('../src/media.cjs');

test('envia o trecho selecionado para o conversor', async () => {
  const replies = [];
  await handleMessage({
    key: { remoteJid: 'test@s.whatsapp.net' },
    message: { videoMessage: { caption: '!figsom 00:12 00:20' } },
  }, {
    normalize: (content) => content,
    download: async () => Buffer.from('video'),
    convert: async (_, command, options) => {
      assert.equal(command, 'figsom');
      assert.deepEqual(options, { start: 12, end: 20 });
      return [{ data: Buffer.from('ANMF') }, { data: Buffer.from('audio') }];
    },
    send: async (payload) => replies.push(payload),
  });
  assert.equal(replies.length, 1);
  assert.ok(replies[0].stickerAudio);
});

test('gera texto, zoom, bumerangue, montagem e dublagem com mídia real', async () => {
  const [png, otherPng, video, voice] = await Promise.all([
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x100', '-frames:v', '1', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1']),
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:size=100x160', '-frames:v', '1', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1']),
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x100:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=880', '-t', '2', '-c:v', 'libx264', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1']),
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:a', 'libopus', '-f', 'ogg', 'pipe:1']),
  ]);
  const media = (mimetype, data) => ({ mimetype, data: data.toString('base64') });
  const photo = media('image/png', png);
  const motion = media('video/mp4', video);
  const [excerpt, excerptAudio] = await convertMedia(motion, 'figsom', { start: 0.5, end: 1.5 });
  assert.ok(excerpt.data.includes('ANMF'));
  const decodedAudio = await ffmpeg(['-i', 'pipe:0', '-f', 's16le', '-ar', '48000', '-ac', '1', 'pipe:1'],
    excerptAudio.data);
  assert.ok(decodedAudio.length > 72_000 && decodedAudio.length <= 96_000);
  const [plain] = await convertMedia(photo, 'fig');
  const [captioned] = await convertMedia(photo, 'figtexto', { text: 'Olá: 100%!' });
  assert.notDeepEqual(captioned.data, plain.data);
  const [zoom] = await convertMedia(photo, 'figzoom');
  assert.ok(zoom.data.includes('ANMF'));
  const [loop] = await convertMedia(motion, 'figloop');
  assert.ok(loop.data.includes('ANMF'));
  const [duo] = await convertMedia(photo, 'figdupla', { second: media('image/png', otherPng) });
  assert.equal(duo.data.toString('ascii', 8, 12), 'WEBP');
  const [dubbed, audio] = await convertMedia(media('image/webp', zoom.data), 'figsomvoz', { second: media('audio/ogg', voice) });
  assert.deepEqual(dubbed.data, zoom.data);
  assert.ok(audio.data.includes('OpusHead'));
});

test('coleção persiste por pessoa e preserva o som', async () => {
  const { createCollection } = require('../src/collection.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orvex-test-'));
  try {
    const sticker = Buffer.from('imagem');
    const stickerAudio = Buffer.from('som');
    await createCollection(dir).save('pessoa A', 'reacao', { sticker, stickerAudio, isAnimated: true });
    const collection = createCollection(dir);
    assert.deepEqual(await collection.load('pessoa A', 'reacao'), { sticker, stickerAudio, isAnimated: true });
    assert.equal(await collection.load('pessoa B', 'reacao'), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('dublagem mantém a primeira mídia separada por participante', async () => {
  const pending = new Map();
  const replies = [];
  let processed = 0;
  async function replyTo(participant, kind, value) {
    await handleMessage({
      key: { remoteJid: 'grupo@g.us', participant },
      message: { extendedTextMessage: { text: '!figsomvoz', contextInfo: {
        quotedMessage: { [kind + 'Message']: { value } },
      } } },
    }, {
      normalize: (content) => content,
      download: async (media) => Buffer.from(media.value),
      convert: async (first, mode, { second }) => {
        processed++;
        assert.equal(mode, 'figsomvoz');
        assert.equal(Buffer.from(first.data, 'base64').toString(), 'imagem A');
        assert.equal(Buffer.from(second.data, 'base64').toString(), 'voz A');
        return [{ data: Buffer.from('ANMF') }, { data: Buffer.from('dublagem') }];
      },
      send: async (payload) => replies.push(payload),
      pending,
    });
  }
  await replyTo('A', 'sticker', 'imagem A');
  await replyTo('B', 'audio', 'voz B');
  await replyTo('A', 'audio', 'voz A');
  assert.equal(processed, 1);
  assert.match(replies[1].text, /Primeiro/);
  assert.deepEqual(replies[2].stickerAudio, Buffer.from('dublagem'));
  assert.equal(pending.size, 0);
});
