const sections = [
  ['Criar', [
    ['fig', '', 'Foto, GIF ou vídeo vira figurinha.'],
    ['figquadrada', '', 'Recorta o centro e preenche o quadrado.'],
    ['figtexto', 'meu texto', 'Escreve texto estilo meme em foto ou vídeo.'],
    ['figzoom', '', 'Anima uma foto com zoom.'],
    ['figloop', '', 'Faz um vídeo ou GIF ir e voltar.'],
    ['figdupla', '', 'Junta duas fotos. Responda a cada foto com !figdupla.'],
  ]],
  ['Som e vídeo', [
    ['figsom', '', 'Cria figurinha com som. Exemplo de trecho: !figsom 00:12 00:20.'],
    ['figsomquadrada', '', 'Recorta o centro com som. Também aceita início e fim.'],
    ['figsomvoz', '', 'Responda à figurinha ou vídeo e depois ao áudio com !figsomvoz.'],
    ['clip', '', 'Cria um MP4 quadrado curto com o áudio original.'],
  ]],
  ['Coleção pessoal', [
    ['salvar', 'nome', 'Responda a uma figurinha para guardá-la.'],
    ['usar', 'nome', 'Envia a figurinha que você guardou.'],
    ['help', '', 'Mostra este guia.'],
  ]],
];
const commands = new Set(sections.flatMap(([, entries]) => entries.map(([command]) => command)));
const takesArgs = new Set(['figtexto', 'figsom', 'figsomquadrada', 'salvar', 'usar']);
const help = [
  '*Comandos do bot*',
  'Coloque o comando na legenda ou responda à mídia com ele.',
  ...sections.flatMap(([title, entries]) => [
    '', `*${title}*`,
    ...entries.map(([command, example, detail]) => `!${command}${example ? ' ' + example : ''} — ${detail}`),
  ]),
  '',
  '*Jogos de grupo*',
  '!rabisca — Inicia o jogo de adivinhar desenhos. Exemplos: !rabisca esportes, !rabisca música, !rabisca natureza ou !rabisca fantasia.',
  '!dica — Mostra uma dica do desenho atual.',
  '!pular — Troca de desenho.',
  '!placar — Mostra os pontos da partida.',
  '!fim — Encerra a partida e mostra o placar. Disponível para quem iniciou.',
].join('\n');

function parseCommand(body) {
  const match = /^!(\w+)(?:\s+([\s\S]+))?$/.exec((body ?? '').trim());
  const mode = match?.[1].toLowerCase();
  if (!commands.has(mode) || (match[2] && !takesArgs.has(mode))) return null;
  return { mode, args: match[2] ?? '' };
}

function commandFrom(body) {
  return parseCommand(body)?.mode ?? null;
}

function textFrom(content) {
  return content?.conversation ?? content?.extendedTextMessage?.text
    ?? content?.imageMessage?.caption ?? content?.videoMessage?.caption
    ?? content?.documentMessage?.caption;
}

function messageCommand(content) {
  return commandFrom(textFrom(content));
}

function findMedia(content) {
  for (const kind of ['sticker', 'image', 'video', 'audio']) {
    if (content?.[kind + 'Message']) return [content[kind + 'Message'], kind];
  }
  const document = content?.documentMessage;
  const type = document?.mimetype?.split('/')[0];
  return ['image', 'video', 'audio'].includes(type) ? [document, 'document'] : [];
}

function parseTime(value) {
  if (/^\d{1,6}(?:[.,]\d{1,3})?$/.test(value)) return Number(value.replace(',', '.'));
  const match = /^(\d{1,4}):([0-5]\d(?:[.,]\d{1,3})?)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2].replace(',', '.')) : NaN;
}

function parseRange(args) {
  const values = args.split(/\s+/);
  if (values.length !== 2) return null;
  const [start, end] = values.map(parseTime);
  return Number.isFinite(start) && end > start && Math.round((end - start) * 1000) <= 10_000
    ? { start, end } : null;
}

function stickerPayload(data, audio) {
  return {
    sticker: data,
    isAnimated: data.includes('ANMF'),
    ...(audio ? { stickerAudio: audio } : {}),
  };
}

async function combineMedia(mode, owner, source, { pending, read, reply }) {
  const key = JSON.stringify([owner, mode]);
  const now = Date.now();
  for (const [id, entry] of pending) {
    if (entry.expires <= now) pending.delete(id);
  }
  const previous = pending.get(key);
  const dubbing = mode === 'figsomvoz';
  if (source.type === 'audio' && dubbing) {
    if (!previous) {
      await reply('Primeiro responda à figurinha ou ao vídeo com !figsomvoz. Depois responda ao áudio com o mesmo comando.');
      return null;
    }
  } else if (source.type === 'image' || (dubbing && source.type === 'video')) {
    if (dubbing || !previous) {
      if (pending.size >= 100 && !previous) pending.delete(pending.keys().next().value);
      pending.set(key, { source, expires: now + 5 * 60_000 });
      await reply(dubbing ? 'Agora responda à mensagem de voz ou ao áudio com !figsomvoz.'
        : 'Agora responda à segunda foto com !figdupla.');
      return null;
    }
  } else {
    await reply(dubbing ? 'Use !figsomvoz em uma figurinha, foto, vídeo ou mensagem de voz.'
      : 'Use !figdupla respondendo a cada uma das duas fotos.');
    return null;
  }

  const first = await read(previous.source);
  const second = await read(source);
  if (!first || !second) return null;
  return { first, second, finish: () => pending.delete(key) };
}

async function handleMessage(raw, { normalize, download, convert, send, collection, pending }) {
  const content = normalize(raw.message);
  const command = parseCommand(textFrom(content));
  if (!command || raw.key.fromMe || raw.key.remoteJid === 'status@broadcast') return;
  const { mode, args } = command;
  const reply = (text) => send({ text });
  if (mode === 'help') return reply(help);

  const owner = JSON.stringify([raw.key.remoteJid, raw.key.participant ?? raw.key.remoteJid]);
  const name = args.toLowerCase();
  if (mode === 'salvar' || mode === 'usar') {
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) return reply(`Use !${mode} nome. O nome aceita até 32 letras sem acento, números, hífen ou sublinhado.`);
    if (mode === 'usar') {
      const saved = await collection.load(owner, name);
      return saved ? send(saved) : reply(`Não encontrei “${name}” na sua coleção.`);
    }
  }

  const context = content.extendedTextMessage?.contextInfo ?? content.imageMessage?.contextInfo
    ?? content.videoMessage?.contextInfo ?? content.documentMessage?.contextInfo;
  const direct = findMedia(content);
  const [media, kind] = direct.length ? direct : findMedia(normalize(context?.quotedMessage));
  if (!media) {
    if (mode === 'salvar') return reply('Responda à figurinha que quer guardar com !salvar nome.');
    return reply(`Envie a mídia com !${mode} na legenda ou responda a ela com esse comando. Veja exemplos em !help.`);
  }

  const read = async ({ media: item, kind: category, mimetype }) => {
    const data = await download(item, category);
    if (!data?.length) {
      await reply('Não consegui baixar a mídia. Envie o arquivo de novo.');
      return null;
    }
    return { mimetype, data: data.toString('base64') };
  };
  const defaults = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/ogg', sticker: 'image/webp' };
  const mimetype = media.mimetype ?? defaults[kind];
  const type = mimetype?.split('/')[0].toLowerCase();
  const source = { media, kind, mimetype, type };

  if (mode === 'salvar') {
    if (kind !== 'sticker') return reply('Responda a uma figurinha com !salvar nome.');
    const sticker = await read(source);
    if (!sticker) return;
    const audio = media.audioMessage && await read({
      media: media.audioMessage, kind: 'audio', mimetype: 'audio/ogg',
    });
    if (media.audioMessage && !audio) return;
    const saved = await collection.save(owner, name, stickerPayload(
      Buffer.from(sticker.data, 'base64'), audio && Buffer.from(audio.data, 'base64'),
    ));
    return reply(saved ? `Guardei “${name}”. Para enviar, use !usar ${name}.` : 'Sua coleção já tem 50 nomes. Você pode reutilizar um nome existente.');
  }

  const soundSticker = mode === 'figsom' || mode === 'figsomquadrada';
  if ((soundSticker || mode === 'clip') && type !== 'video') {
    return reply(`Use !${mode} em um vídeo${soundSticker ? ' com faixa de áudio' : ''}.`);
  }
  if (mode === 'figzoom' && (type !== 'image' || kind === 'sticker' || mimetype === 'image/gif')) {
    return reply('Use !figzoom em uma foto.');
  }
  if (mode === 'figloop' && type !== 'video' && mimetype !== 'image/gif') {
    return reply('Use !figloop em um vídeo ou GIF.');
  }

  let options;
  if (soundSticker && args) {
    options = parseRange(args);
    if (!options) return reply(`Use !${mode} 00:12 00:20. Informe início e fim de um trecho de até 10 segundos.`);
  }
  if (mode === 'figtexto') {
    if (!args || [...args].length > 140) return reply('Use !figtexto seguido de uma frase de até 140 caracteres.');
    options = { text: args };
  }

  let input;
  let finish;
  if (mode === 'figdupla' || mode === 'figsomvoz') {
    const pair = await combineMedia(mode, owner, source, { pending, read, reply });
    if (!pair) return;
    input = pair.first;
    options = { second: pair.second };
    finish = pair.finish;
  } else {
    input = await read(source);
    if (!input) return;
  }

  const [visual, audio] = await convert(input, mode, options);
  if (mode === 'clip') return send({ video: visual.data, mimetype: visual.mimetype });
  if (soundSticker && !audio) {
    return reply(`Esse vídeo não tem faixa de áudio. Envie um vídeo com som para usar !${mode}.`);
  }

  const payload = stickerPayload(visual.data, soundSticker || mode === 'figsomvoz' ? audio?.data : null);
  await send(payload);
  finish?.();
}

module.exports = { commandFrom, messageCommand, handleMessage };
