const assert = require('node:assert/strict');
const test = require('node:test');
const { createRabisca } = require('../src/rabisca.cjs');

test('primeiro acerto ganha 10, avança e a rodada sem acerto encerra a partida', async () => {
  const sent = [];
  const deck = ['maçã', 'gato', 'bolo'].map(answer => ({ answer, theme: 'geral' }));
  let expire;
  const game = createRabisca({
    deck, random: () => 0.999, render: async () => Buffer.from('imagem'),
    schedule: (callback) => { expire = callback; return 1; },
    cancel: () => {},
  });
  const go = (text, player = '1@s.whatsapp.net') =>
    game.handle({ group: 'teste@g.us', player, text, send: async payload => sent.push(payload) });
  await go('!rabisca');
  assert.match(sent[0].text, /Rabisca/);
  assert.deepEqual(sent[0].linkPreview.jpegThumbnail, Buffer.from('imagem'));
  assert.equal(sent[0].image, undefined);


  await Promise.all([go('maca'), go('maçã', '2@s.whatsapp.net')]);
  assert.equal(sent.filter(message => message.text?.includes('+10')).length, 1);
  await go('gato');
  assert.ok(sent.some(message => message.text?.includes('Total: *20 pontos*')));
  await expire();
  assert.match(sent.at(-1).text, /bolo/);
  assert.match(sent.at(-1).text, /20 pontos/);
  assert.equal(await go('gato'), false);
});

test('permite uma dica por desenho e três pulos por partida', async () => {
  const sent = [];
  const game = createRabisca({
    deck: ['gato', 'bola', 'pato', 'mesa'].map(answer => ({ answer, theme: 'geral' })),
    random: () => 0.999, render: async () => Buffer.from('imagem'),
    schedule: () => 1, cancel: () => {},
  });
  const go = (text) => game.handle({ group: 'teste@g.us', player: '1@s.whatsapp.net', text,
    send: async payload => sent.push(payload) });
  await go('!rabisca');
  for (let round = 0; round < 3; round++) {
    await go('!dica');
    assert.match(sent.at(-1).text, /letras/);
    if (!round) {
      await go('!dica');
      assert.match(sent.at(-1).text, /já recebeu/);
    }
    await go('!pular');
  }
  await go('!dica');
  assert.match(sent.at(-1).text, /acabaram/);
  await go('!pular');
  assert.match(sent.at(-1).text, /acabaram/);
});

test('a base local contém temas e rende um JPEG sem acesso à internet', async () => {
  const deck = require('../data/rabisca.json');
  const { renderDrawing } = require('../src/rabisca.cjs');
  assert.equal(deck.length, 332);
  assert.equal(new Set(deck.map(card => card.category)).size, 59);
  assert.deepEqual([...new Set(deck.map(card => card.theme))], ['animais', 'comidas', 'objetos']);
  const image = await renderDrawing(deck[0]);
  assert.equal(image.readUInt16BE(0), 0xffd8);
  assert.equal(image.readUInt16BE(image.length - 2), 0xffd9);
});

test('evita repetir a resposta na partida e prioriza palavras ainda não vistas pelo grupo', async () => {
  const deck = [
    { id: '1', answer: 'gato', theme: 'animais' },
    { id: '2', answer: 'gato', theme: 'animais' },
    { id: '3', answer: 'pato', theme: 'animais' },
    { id: '4', answer: 'pato', theme: 'animais' },
  ];
  const opened = [];
  const sent = [];
  const game = createRabisca({
    deck, random: () => 0.999,
    render: async ({ id }) => { opened.push(id); return Buffer.from('imagem'); },
    schedule: () => 1, cancel: () => {},
  });
  const go = (text) => game.handle({ group: 'teste@g.us', player: '1@s.whatsapp.net', text,
    send: async payload => sent.push(payload) });
  await go('!rabisca');
  await go('!rabisca fim');
  await go('!rabisca');
  await go('pato');
  await go('gato');
  assert.deepEqual(opened, ['1', '3', '2']);
  assert.match(sent.at(-1).text, /fim do baralho/);
});

test('plogme codifica o desenho como prévia de link sem anexo de imagem', async () => {
  const { generateWAMessageContent, prepareWAMessageMedia } = await import('plogme');
  const deck = require('../data/rabisca.json').slice(0, 1);
  const game = createRabisca({
    deck, schedule: () => 1, cancel: () => {},
    uploadPreview: async (thumbnail) => {
      const { imageMessage } = await prepareWAMessageMedia({
        image: thumbnail, jpegThumbnail: thumbnail, width: 640, height: 360,
      }, {
        upload: async () => ({ mediaUrl: 'https://example.invalid/preview', directPath: '/preview' }),
        mediaTypeOverride: 'thumbnail-link',
      });
      return imageMessage;
    },
  });
  let encoded;
  await game.handle({
    group: 'teste@g.us', player: '1@s.whatsapp.net', text: '!rabisca',
    send: async (payload) => {
      encoded = await generateWAMessageContent(payload, {
        upload: async () => ({ mediaUrl: 'https://example.invalid/image', directPath: '/image' }),
      });
    },
  });
  const message = encoded.extendedTextMessage;
  assert.equal(encoded.imageMessage, null);
  assert.match(message.text, /Rabisca/);
  assert.match(message.text, /\*🐾 Tema: Animais\*/u);
  assert.match(message.matchedText, /^https:\/\//);
  assert.equal(message.title, 'Qual é o desenho?');
  assert.equal(Buffer.from(message.jpegThumbnail).readUInt16BE(0), 0xffd8);
  assert.equal(message.thumbnailDirectPath, '/preview');
  assert.equal(message.thumbnailWidth, 640);
  assert.equal(message.contextInfo?.externalAdReply, undefined);
});

test('!fim encerra a partida para quem iniciou e publica o placar', async () => {
  const sent = [];
  let cancelled = 0;
  const game = createRabisca({
    deck: [{ answer: 'gato', theme: 'animais' }],
    render: async () => Buffer.from('imagem'),
    schedule: () => 1, cancel: () => { cancelled++; },
  });
  const go = (text, player = '1@s.whatsapp.net') => game.handle({
    group: 'teste@g.us', player, text, send: async (payload) => sent.push(payload),
  });
  await go('!rabisca');
  await go('!fim', '2@s.whatsapp.net');
  assert.match(sent.at(-1).text, /Quem iniciou/);
  assert.equal(cancelled, 0);
  assert.equal(await go('!fim'), true);
  assert.match(sent.at(-1).text, /Partida encerrada/);
  assert.match(sent.at(-1).text, /Total do grupo/);
  assert.equal(cancelled, 1);
  assert.equal(await go('gato'), false);
});

test('tema Transportes usa ilustrações OpenMoji e credita a fonte no cartão', async () => {
  const sent = [];
  const deck = require('../data/rabisca-openmoji.json');
  const game = createRabisca({ deck, schedule: () => 1, cancel: () => {} });
  await game.handle({
    group: 'teste@g.us', player: '1@s.whatsapp.net', text: '!rabisca transportes',
    send: async (payload) => sent.push(payload),
  });
  assert.match(sent[0].text, /\*🚗 Tema: Transportes\*/u);
  assert.match(sent[0].linkPreview.description, /OpenMoji.*CC BY-SA 4\.0/);
  assert.equal(sent[0].linkPreview.jpegThumbnail.readUInt16BE(0), 0xffd8);
  assert.equal(sent[0].image, undefined);
});

test('Rabisca aceita sinônimos cadastrados em português', async () => {
  const sent = [];
  const game = createRabisca({
    deck: [{ answer: 'bola de futebol', aliases: ['bola'], theme: 'esportes' }],
    render: async () => Buffer.from('imagem'),
    schedule: () => 1, cancel: () => {},
  });
  const go = (text) => game.handle({ group: 'teste@g.us', player: '1@s.whatsapp.net', text,
    send: async (payload) => sent.push(payload) });
  await go('!rabisca esportes');
  assert.match(sent[0].text, /Tema: Esportes/);
  await go('bola');
  assert.ok(sent.some(message => message.text?.includes('+10 pontos')));
});

test('baralho ampliado reúne três novas fontes e pelo menos 300 respostas distintas', () => {
  const cards = [
    ...require('../data/rabisca.json'),
    ...require('../data/rabisca-openmoji.json'),
    ...require('../data/rabisca-expansao.json'),
  ];
  const expansion = cards.filter(card => card.asset);
  assert.deepEqual([...new Set(expansion.map(card => card.source))].sort(),
    ['game-icons', 'openclipart', 'tabler']);
  assert.equal(new Set(cards.map(card => card.answer)).size, 300);
  assert.ok(expansion.every(card => card.png && card.asset && card.author));
});
