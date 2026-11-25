const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Image } = require('node-webpmux');

const bundledFfmpeg = require('ffmpeg-static');
const binary = process.env.FFMPEG_PATH?.trim()
  || (bundledFfmpeg && existsSync(bundledFfmpeg) ? bundledFfmpeg : 'ffmpeg');
const tempRoot = path.join(__dirname, '..', '.media-tmp');
const seconds = '6';
const soundStickerSeconds = '10';
const square = 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos';
const stickerFilter = `${square},format=yuva420p,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1`;
const croppedStickerFilter = 'scale=512:512:force_original_aspect_ratio=increase:flags=lanczos,crop=512:512,format=yuv420p,setsar=1';
const clipFilter = `${square},pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;

class MediaError extends Error {}

function ffmpeg(args, input, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-hide_banner', '-loglevel', 'error', ...args], {
      windowsHide: true,
      cwd,
      timeout: 30_000,
    });
    const chunks = [];
    let diagnostics = '';
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => { diagnostics += chunk; });
    child.stdin.on('error', (error) => {
      if (!['EPIPE', 'EOF', 'ECONNRESET'].includes(error.code)) reject(error);
    });
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new MediaError('FFmpeg não encontrado. No Termux, instale com pkg install ffmpeg.'));
        return;
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(diagnostics.trim() || 'FFmpeg interrompido.'));
    });
    child.stdin.end(input);
  });
}

const stickerInfo = Buffer.from(JSON.stringify({
  'sticker-pack-id': 'orvex.projetinhobotfig',
  'sticker-pack-name': 'Figurinhas',
  'sticker-pack-publisher': 'feito por Orvex',
  emojis: [],
}));

async function addStickerInfo(data) {
  // Campo privado do EXIF usado para os dados do pacote de figurinhas.
  const header = Buffer.from('49492a00080000000100415707000000000016000000', 'hex');
  header.writeUInt32LE(stickerInfo.length, 14);
  const image = new Image();
  await image.load(data);
  image.exif = Buffer.concat([header, stickerInfo]);
  return image.save(null);
}

async function makeSticker(input, animated, framing, duration, { start = 0, cwd, effect } = {}) {
  const limit = animated ? 500_000 : 100_000;
  const profiles = animated ? [[12, 68], [9, 48], [6, 30]] : [[0, 78], [0, 50], [0, 25]];
  for (const [fps, quality] of profiles) {
    const frames = animated ? ['-t', duration] : ['-frames:v', '1'];
    const filter = effect === 'zoom'
      ? `${framing},zoompan=z='min(zoom+0.012,1.45)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${fps * 3}:s=512x512:fps=${fps}`
      : animated ? `fps=${fps},${framing}` : framing;
    const data = await ffmpeg([
      '-ss', String(start), '-i', input, '-map', '0:v:0', '-an', ...frames, '-vf', filter,
      '-c:v', animated ? 'libwebp_anim' : 'libwebp', '-quality', String(quality),
      '-compression_level', '4', '-loop', '0', '-f', 'webp', 'pipe:1',
    ], undefined, cwd);
    const actualLimit = data.includes('ANMF') ? limit : 100_000;
    if (!data.length || data.length > actualLimit) continue;
    const tagged = await addStickerInfo(data);
    if (tagged.length <= actualLimit) {
      return { data: tagged, mimetype: 'image/webp', filename: 'figurinha.webp' };
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

async function makeVoice(input, duration, start = 0) {
  try {
    const data = await ffmpeg([
      '-ss', String(start), '-i', input, '-map', '0:a:0', '-vn', '-af', 'apad', '-t', duration,
      '-c:a', 'libopus', '-ac', '1', '-b:a', '48k', '-f', 'ogg', 'pipe:1',
    ]);
    return data.length ? { data, mimetype: 'audio/ogg', filename: 'som.ogg' } : null;
  } catch (error) {
    if (error.message.includes('matches no streams')) return null;
    throw error;
  }
}

function mediaBytes(media) {
  const bytes = Buffer.from(media.data, 'base64');
  if (!bytes.length || bytes.length > 16 * 1024 * 1024) {
    throw new MediaError('Envie arquivos de até 16 MB.');
  }
  return bytes;
}

async function captionFilter(dir, text) {
  const font = [
    process.env.FIG_FONT_PATH,
    process.env.WINDIR && path.join(process.env.WINDIR, 'Fonts', 'arialbd.ttf'),
    '/system/fonts/Roboto-Bold.ttf',
    '/system/fonts/Roboto-Regular.ttf',
    '/system/fonts/Roboto-Regular.otf',
    '/system/fonts/Roboto-Regular-VF.ttf',
    '/system/fonts/RobotoFlex-Regular.ttf',
    '/system/fonts/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ].find((file) => file && existsSync(file));
  if (!font) throw new MediaError('Fonte não encontrada para !figtexto. Configure FIG_FONT_PATH.');
  await fs.copyFile(font, path.join(dir, 'caption.ttf'));

  const lines = [];
  let line = '';
  for (const word of text.trim().split(/\s+/u)) {
    for (const part of word.match(/.{1,24}/gu) ?? []) {
      const next = line ? line + ' ' + part : part;
      if ([...next].length > 24) {
        lines.push(line);
        line = part;
      } else {
        line = next;
      }
    }
  }
  if (line) lines.push(line);
  await fs.writeFile(path.join(dir, 'caption.txt'), lines.join('\n'));
  return 'drawtext=fontfile=caption.ttf:textfile=caption.txt:expansion=none:fontsize=27:fontcolor=white:borderw=3:bordercolor=black:line_spacing=4:x=(w-tw)/2:y=h-th-16';
}

async function prepareDuet(input, second, dir) {
  const other = path.join(dir, 'second');
  const output = path.join(dir, 'duet.png');
  await fs.writeFile(other, mediaBytes(second));
  const panel = 'scale=256:512:force_original_aspect_ratio=increase,crop=256:512,setsar=1';
  await ffmpeg([
    '-i', input, '-i', other, '-filter_complex_threads', '1',
    '-filter_complex', `[0:v]${panel}[left];[1:v]${panel}[right];[left][right]hstack`,
    '-frames:v', '1', '-update', '1', output,
  ]);
  return output;
}

async function prepareLoop(input, dir) {
  const output = path.join(dir, 'loop.mp4');
  await ffmpeg([
    '-i', input, '-filter_complex_threads', '1',
    '-filter_complex', "[0:v]trim=duration=3,setpts=PTS-STARTPTS,fps=12,scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,split[a][b];[b]reverse,setpts=PTS-STARTPTS[back];[a][back]concat=n=2:v=1:a=0[loop]",
    '-map', '[loop]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', output,
  ]);
  return output;
}

async function convertMedia(media, mode, { start = 0, end, text, second } = {}) {
  const mime = media.mimetype?.split(';')[0].toLowerCase();
  const video = mime?.startsWith('video/');
  if (!video && !mime?.startsWith('image/')) {
    throw new MediaError('Envie uma imagem ou um vídeo.');
  }
  const bytes = mediaBytes(media);

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

    const cropped = ['figquadrada', 'figsomquadrada', 'figzoom'].includes(mode);
    let framing = cropped ? croppedStickerFilter : stickerFilter;
    if (mode === 'figtexto') framing += ',' + await captionFilter(dir, text);

    const dubbed = mode === 'figsomvoz';
    const soundSticker = ['figsom', 'figsomquadrada'].includes(mode) && video;
    const duration = end === undefined ? (soundSticker || dubbed ? soundStickerSeconds : seconds)
      : String(Math.round((end - start) * 1000) / 1000);
    const animation = video || mime === 'image/gif' || ['figzoom', 'figloop'].includes(mode);
    let visualInput = input;
    if (mode === 'figdupla') visualInput = await prepareDuet(input, second, dir);
    if (mode === 'figloop') visualInput = await prepareLoop(input, dir);

    // Preserve os quadros da figurinha recebida ao trocar a faixa de áudio.
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    const sticker = dubbed && webp ? { data: bytes, mimetype: 'image/webp', filename: 'figurinha.webp' }
      : await makeSticker(visualInput, animation && mode !== 'figdupla', framing, duration, {
        start, cwd: dir, effect: mode === 'figzoom' ? 'zoom' : undefined,
      });
    if (!soundSticker && !dubbed) return [sticker];

    const animationMs = animationDurationMs(sticker.data);
    const audioDuration = animationMs ? `${Math.min(animationMs, Math.round(Number(duration) * 1000))}ms` : duration;
    let audioInput = input;
    if (dubbed) {
      audioInput = path.join(dir, 'dub');
      await fs.writeFile(audioInput, mediaBytes(second));
    }
    const audio = await makeVoice(audioInput, audioDuration, start);
    if (dubbed && !audio) throw new MediaError('Não encontrei áudio nessa mídia. Responda a uma mensagem de voz ou arquivo de áudio.');
    return audio ? [sticker, audio] : [sticker];
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { convertMedia, ffmpeg, MediaError };
