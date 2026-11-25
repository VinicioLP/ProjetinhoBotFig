const commands = new Map([
  ['fig', 'Cria uma figurinha de foto, GIF ou vídeo.'],
  ['figsom', 'Cria uma figurinha com o som do vídeo, até 10 segundos.'],
  ['figsomquadrada', 'Recorta o centro do vídeo e cria uma figurinha quadrada com som, até 10 segundos.'],
  ['clip', 'Cria um vídeo quadrado curto com o áudio original.'],
  ['help', 'Mostra esta lista de comandos.'],
]);

function commandFrom(body) {
  const match = /^!(\w+)$/i.exec((body ?? '').trim());
  const command = match?.[1].toLowerCase();
  return commands.has(command) ? command : null;
}

function messageCommand(content) {
  return commandFrom(content?.conversation ?? content?.extendedTextMessage?.text
    ?? content?.imageMessage?.caption ?? content?.videoMessage?.caption
    ?? content?.documentMessage?.caption);
}

function findMedia(content) {
  if (content?.imageMessage) return [content.imageMessage, 'image'];
  if (content?.videoMessage) return [content.videoMessage, 'video'];
  const document = content?.documentMessage;
  const kind = document?.mimetype?.split('/')[0];
  if (kind === 'image' || kind === 'video') return [document, 'document'];
  return [];
}

async function handleMessage(raw, { normalize, download, convert, send }) {
  const content = normalize(raw.message);
  const mode = messageCommand(content);
  if (!mode || raw.key.fromMe || raw.key.remoteJid === 'status@broadcast') return;

  if (mode === 'help') {
    const lines = [...commands].map(([command, description]) => `!${command} — ${description}`);
    await send({ text: [
      '*Comandos do bot*',
      ...lines,
      '',
      'Para converter uma mídia, coloque o comando na legenda ou responda à mídia com ele.',
    ].join('\n') });
    return;
  }

  const context = content.extendedTextMessage?.contextInfo ?? content.imageMessage?.contextInfo
    ?? content.videoMessage?.contextInfo ?? content.documentMessage?.contextInfo;
  const direct = findMedia(content);
  const [media, kind] = direct.length ? direct : findMedia(normalize(context?.quotedMessage));
  if (!media) {
    await send({ text: `Envie uma imagem ou vídeo com !${mode} na legenda, ou responda à mídia com esse comando.` });
    return;
  }

  const data = await download(media, kind);
  if (!data?.length) {
    await send({ text: 'Não consegui baixar a mídia. Envie o arquivo de novo.' });
    return;
  }

  const mimetype = media.mimetype ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const soundSticker = mode === 'figsom' || mode === 'figsomquadrada';
  if (soundSticker && !mimetype.toLowerCase().startsWith('video/')) {
    await send({ text: `Use !${mode} em um vídeo com faixa de áudio.` });
    return;
  }

  const [visual, audio] = await convert({ mimetype, data: data.toString('base64') }, mode);
  if (mode === 'clip') {
    await send({ video: visual.data, mimetype: visual.mimetype });
    return;
  }

  const payload = { sticker: visual.data, isAnimated: visual.data.includes('ANMF') };
  if (soundSticker) {
    if (!audio) {
      await send({ text: `Esse vídeo não tem faixa de áudio. Envie um vídeo com som para usar !${mode}.` });
      return;
    }
    payload.stickerAudio = audio.data;
  }
  await send(payload);
}

module.exports = { commandFrom, messageCommand, handleMessage };
