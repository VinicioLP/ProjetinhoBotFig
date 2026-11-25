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
  assert.equal(sent[0].externalAdReply.renderLargerThumbnail, true);
  assert.deepEqual(sent[0].externalAdReply.thumbnail, Buffer.from('imagem'));
  assert.doesNotMatch(sent[0].text, /https:\/\//);
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

test('plogme codifica o desenho como cartão com miniatura grande', async () => {
  const { generateWAMessageContent } = await import('plogme');
  const deck = require('../data/rabisca.json').slice(0, 1);
  const game = createRabisca({ deck, schedule: () => 1, cancel: () => {} });
  let encoded;
  await game.handle({
    group: 'teste@g.us', player: '1@s.whatsapp.net', text: '!rabisca',
    send: async (payload) => { encoded = await generateWAMessageContent(payload, {}); },
  });
  const card = encoded.extendedTextMessage.contextInfo.externalAdReply;
  assert.equal(card.renderLargerThumbnail, true);
  assert.equal(card.showAdAttribution, false);
  assert.equal(Buffer.from(card.thumbnail).readUInt16BE(0), 0xffd8);
  assert.equal(encoded.imageMessage, null);
});
