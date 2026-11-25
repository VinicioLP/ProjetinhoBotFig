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
  assert.ok(sent[0].image);
  await Promise.all([go('maca'), go('maçã', '2@s.whatsapp.net')]);
  assert.equal(sent.filter(message => message.text?.includes('+10')).length, 1);
  await expire();
  assert.match(sent.at(-1).text, /gato/);
  assert.match(sent.at(-1).text, /10 pontos/);
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
  assert.equal(deck.length, 192);
  assert.equal(new Set(deck.map(card => card.category)).size, 24);
  assert.deepEqual([...new Set(deck.map(card => card.theme))], ['animais', 'comidas', 'objetos']);
  const image = await renderDrawing(deck[0]);
  assert.equal(image.readUInt16BE(0), 0xffd8);
  assert.equal(image.readUInt16BE(image.length - 2), 0xffd9);
});
