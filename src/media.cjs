const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const binary = process.env.FFMPEG_PATH || require('ffmpeg-static');
const tempRoot = path.join(__dirname, '..', '.media-tmp');
const seconds = '6';
const soundStickerSeconds = '10';
const square = 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos';
const stickerFilter = `${square},format=yuva420p,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1`;
const croppedStickerFilter = 'scale=512:512:force_original_aspect_ratio=increase:flags=lanczos,crop=512:512,format=yuv420p,setsar=1';
const clipFilter = `${square},pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;

class MediaError extends Error {}

function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-hide_banner', '-loglevel', 'error', ...args], {
      windowsHide: true,
      timeout: 30_000,
    });
    const chunks = [];
    let diagnostics = '';
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => { diagnostics += chunk; });
    child.stdin.on('error', (error) => {
      if (!['EPIPE', 'EOF', 'ECONNRESET'].includes(error.code)) reject(error);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(diagnostics.trim() || 'FFmpeg interrompido.'));
    });
    child.stdin.end(input);
  });
}

async function makeSticker(input, animated, framing, duration) {
  const limit = animated ? 500_000 : 100_000;
  const profiles = animated ? [[12, 68], [9, 48], [6, 30]] : [[0, 78], [0, 50], [0, 25]];
  for (const [fps, quality] of profiles) {
    const frames = animated ? ['-t', duration] : ['-frames:v', '1'];
    const filter = animated ? `fps=${fps},${framing}` : framing;
    const data = await ffmpeg([
      '-i', input, '-map', '0:v:0', '-an', ...frames, '-vf', filter,
      '-c:v', animated ? 'libwebp_anim' : 'libwebp', '-quality', String(quality),
      '-compression_level', '4', '-loop', '0', '-f', 'webp', 'pipe:1',
    ]);
    const actualLimit = data.includes('ANMF') ? limit : 100_000;
    if (data.length && data.length <= actualLimit) {
      return { data, mimetype: 'image/webp', filename: 'figurinha.webp' };
    }
  }
  throw new MediaError('A figurinha ficou grande demais. Tente um vídeo mais curto ou uma imagem mais simples.');
}

function animationDurationMs(webp) {
  let duration = 0;
  // Cada bloco ANMF guarda a duração do quadro em três bytes.
  for (let offset = 12; offset + 8 <= webp.length;) {
    const size = webp.readUInt32LE(offset + 4);
    if (size >= 16 && offset + 8 + size <= webp.length
      && webp.toString('ascii', offset, offset + 4) === 'ANMF') {
      duration += webp.readUIntLE(offset + 20, 3);
    }
    offset += 8 + size + (size % 2);
  }
  return duration;
}

async function makeVoice(input, duration) {
  try {
    const data = await ffmpeg([
      '-i', input, '-map', '0:a:0', '-vn', '-af', 'apad', '-t', duration,
      '-c:a', 'libopus', '-ac', '1', '-b:a', '48k', '-f', 'ogg', 'pipe:1',
    ]);
    return data.length ? { data, mimetype: 'audio/ogg', filename: 'som.ogg' } : null;
  } catch (error) {
    if (error.message.includes('matches no streams')) return null;
    throw error;
  }
}

async function convertMedia(media, mode) {
  const mime = media.mimetype?.split(';')[0].toLowerCase();
  const video = mime?.startsWith('video/');
  if (!video && !mime?.startsWith('image/')) {
    throw new MediaError('Envie uma imagem ou um vídeo.');
  }
  const bytes = Buffer.from(media.data, 'base64');
  if (!bytes.length || bytes.length > 16 * 1024 * 1024) {
    throw new MediaError('Envie uma imagem ou um vídeo de até 16 MB.');
  }

  await fs.mkdir(tempRoot, { recursive: true });
  const dir = await fs.mkdtemp(path.join(tempRoot, 'job-'));
  try {
    const input = path.join(dir, 'input');
    await fs.writeFile(input, bytes);
    if (mode === 'clip') {
      if (!video) throw new MediaError('Use !clip em um vídeo para manter a imagem e o som juntos.');
      const output = path.join(dir, 'clipe.mp4');
      await ffmpeg([
        '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-t', seconds,
        '-vf', clipFilter, '-r', '24', '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-movflags', '+faststart', output,
      ]);
      return [{ data: await fs.readFile(output), mimetype: 'video/mp4', filename: 'clipe.mp4' }];
    }

    const cropped = mode === 'figsomquadrada';
    const framing = cropped ? croppedStickerFilter : stickerFilter;
    const soundSticker = (mode === 'figsom' || cropped) && video;
    const duration = soundSticker ? soundStickerSeconds : seconds;
    const sticker = await makeSticker(input, video || mime === 'image/gif', framing, duration);
    let audio = null;
    if (soundSticker) {
      const animationMs = animationDurationMs(sticker.data);
      const audioDuration = animationMs ? `${animationMs}ms` : duration;
      audio = await makeVoice(input, audioDuration);
    }
    return audio ? [sticker, audio] : [sticker];
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { convertMedia, ffmpeg, MediaError };
