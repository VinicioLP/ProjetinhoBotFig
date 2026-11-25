const assert = require('node:assert/strict');
const test = require('node:test');

test('identifica comandos completos e ignora conversa normal', async () => {
  const { commandFrom } = require('../src/handler.cjs');
  assert.equal(commandFrom(' !FIG '), 'fig');
  assert.equal(commandFrom('!clip'), 'clip');
  assert.equal(commandFrom('!figsomquadrada'), 'figsomquadrada');
  assert.equal(commandFrom('!figura'), null);
  assert.equal(commandFrom('manda um !fig'), null);
});

test('gera figurinha WebP, áudio Opus e vídeo com áudio de um vídeo real', async () => {
  const { convertMedia, ffmpeg } = require('../src/media.cjs');
  const video = await ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=size=160x100:rate=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', '1', '-c:v', 'libx264', '-c:a', 'aac',
    '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1',
  ]);
  const input = { mimetype: 'video/mp4', data: video.toString('base64') };
  const [sticker, audio] = await convertMedia(input, 'figsom');
  assert.equal(sticker.data.toString('ascii', 8, 12), 'WEBP');
  assert.ok(sticker.data.includes('ANMF'));
  assert.ok(sticker.data.length <= 500_000);
  assert.ok(audio.data.includes('OpusHead'));
  const { generateWAMessageContent, proto } = await import('plogme');
  const message = await generateWAMessageContent({
    sticker: sticker.data, stickerAudio: audio.data, isAnimated: true,
  }, {
    upload: async (_file, { mediaType }) => ({
      mediaUrl: 'https://example.invalid/' + mediaType,
      directPath: '/' + mediaType,
    }),
  });
  const decoded = proto.Message.decode(proto.Message.encode(message).finish());
  assert.equal(decoded.stickerMessage.isAnimated, true);
  assert.equal(decoded.stickerMessage.audioMessage.directPath, '/audio');
  assert.equal(decoded.audioMessage, null);
  const [cropped, croppedAudio] = await convertMedia(input, 'figsomquadrada');
  assert.equal(cropped.data.toString('ascii', 12, 16), 'VP8X');
  assert.equal(cropped.data.readUIntLE(24, 3) + 1, 512);
  assert.equal(cropped.data.readUIntLE(27, 3) + 1, 512);
  const normalFrame = sticker.data.indexOf('ANMF');
  assert.ok(sticker.data.readUIntLE(normalFrame + 17, 3) + 1 < 512);
  const croppedFrame = cropped.data.indexOf('ANMF');
  assert.equal(cropped.data.readUIntLE(croppedFrame + 17, 3) + 1, 512);
  assert.equal(cropped.data.toString('ascii', croppedFrame + 24, croppedFrame + 28), 'VP8 ');
  assert.ok(croppedAudio.data.includes('OpusHead'));
  assert.equal((await convertMedia(input, 'fig')).length, 1);
  const [clip] = await convertMedia(input, 'clip');
  assert.equal(clip.data.toString('ascii', 4, 8), 'ftyp');
  await ffmpeg(['-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], clip.data);
});

test('gera figurinha estática de uma foto e só figurinha de vídeo mudo', async () => {
  const { convertMedia, ffmpeg } = require('../src/media.cjs');
  const source = ['-f', 'lavfi', '-i', 'testsrc2=size=160x100:rate=15'];
  const png = await ffmpeg([...source, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
  const [photo] = await convertMedia({ mimetype: 'image/png', data: png.toString('base64') }, 'fig');
  assert.equal(photo.data.toString('ascii', 8, 12), 'WEBP');
  assert.ok(photo.data.length <= 100_000);
  const pixels = await ffmpeg(['-i', 'pipe:0', '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'], photo.data);
  const pixel = (x, y) => pixels.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4);
  assert.equal(pixel(0, 480)[3], 0);
  let whitePixels = 0;
  for (let y = 465; y < 501; y++) {
    for (let x = 150; x < 362; x++) {
      const [r, g, b, alpha] = pixel(x, y);
      if (alpha > 220 && Math.min(r, g, b) > 220) whitePixels++;
    }
  }
  assert.ok(whitePixels > 80, 'assinatura branca no rodapé');

  const video = await ffmpeg([
    ...source, '-t', '1', '-c:v', 'libx264',
    '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1',
  ]);
  const output = await convertMedia({ mimetype: 'video/mp4', data: video.toString('base64') }, 'figsom');
  assert.deepEqual(output.map(({ mimetype }) => mimetype), ['image/webp']);
});

test('figurinhas sonoras sincronizam a duração do áudio com a animação de até dez segundos', async () => {
  const { convertMedia, ffmpeg } = require('../src/media.cjs');
  const video = await ffmpeg([
    '-f', 'lavfi', '-i', 'color=c=red:size=160x100:rate=12',
    '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-vf', "drawbox=x=10:y=10:w=40:h=40:color=blue:t=fill:enable='gte(t,8)'",
    '-t', '11', '-c:v', 'libx264', '-c:a', 'aac',
    '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1',
  ]);
  const input = { mimetype: 'video/mp4', data: video.toString('base64') };
  for (const mode of ['figsom', 'figsomquadrada']) {
    const [sticker, audio] = await convertMedia(input, mode);
    let duration = 0;
    for (let offset = 12; offset + 8 <= sticker.data.length;) {
      const size = sticker.data.readUInt32LE(offset + 4);
      if (sticker.data.toString('ascii', offset, offset + 4) === 'ANMF') {
        duration += sticker.data.readUIntLE(offset + 20, 3);
      }
      offset += 8 + size + (size % 2);
    }
    assert.ok(duration >= 9_800 && duration <= 10_000, `animação de ${mode}: ${duration} ms`);
    const lastPage = audio.data.lastIndexOf('OggS');
    const samples = audio.data.readBigUInt64LE(lastPage + 6) - BigInt(audio.data.readUInt16LE(audio.data.indexOf('OpusHead') + 10));
    assert.equal(samples, BigInt(duration) * 48n, mode);
  }
});

test('usa o FFmpeg do PATH quando o pacote não oferece binário', async () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const bundled = process.env.FFMPEG_PATH || require('ffmpeg-static');
  const env = { ...process.env };
  delete env.FFMPEG_PATH;
  if (bundled && path.isAbsolute(bundled)) {
    env.PATH = path.dirname(bundled) + path.delimiter + env.PATH;
  }
  const output = execFileSync(process.execPath, ['-e', `
    require('ffmpeg-static');
    require.cache[require.resolve('ffmpeg-static')].exports = null;
    require('./src/media.cjs').ffmpeg(['-version'])
      .then(data => process.stdout.write(data))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  `], { env, cwd: path.join(__dirname, '..') });
  assert.match(output.toString(), /ffmpeg version/);
});
