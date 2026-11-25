const { ffmpeg } = require('./media.cjs');

const creditsUrl = 'https://github.com/VinicioLP/ProjetinhoBotFig#rabisca';

const themes = ['animais', 'comidas', 'objetos'];
const controls = new Set(['rabisca', 'dica', 'pular', 'placar', 'chute']);
const aliases = {
  cachorro: ['cão'],
  'tartaruga marinha': ['tartaruga'],
  bicicleta: ['bike'],
  'guarda-chuva': ['sombrinha'],
  relógio: ['relógio de parede'],
};

function normalizeGuess(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function renderDrawing({ drawing }) {
  const canvasWidth = 640;
  const canvasHeight = 360;
  const pixels = Buffer.alloc(canvasWidth * canvasHeight * 3, 255);
  function dot(x, y) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 9) continue;
        const offset = ((y + dy) * canvasWidth + x + dx) * 3;
        pixels.fill(22, offset, offset + 3);
      }
    }
  }

  const points = drawing.flatMap(([xs, ys]) => xs.map((x, i) => [x, ys[i]]));
  const left = Math.min(...points.map(([x]) => x));
  const top = Math.min(...points.map(([, y]) => y));
  const width = Math.max(...points.map(([x]) => x)) - left;
  const height = Math.max(...points.map(([, y]) => y)) - top;
  const scale = 294 / Math.max(width, height, 1);
  function position(x, y) {
    return [(canvasWidth - width * scale) / 2 + (x - left) * scale,
      (canvasHeight - height * scale) / 2 + (y - top) * scale];
  }

  for (const [xs, ys] of drawing) {
    for (let i = 0; i < xs.length; i++) {
      const [x0, y0] = position(xs[Math.max(0, i - 1)], ys[Math.max(0, i - 1)]);
      const [x1, y1] = position(xs[i], ys[i]);
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let step = 0; step <= steps; step++) {
        dot(Math.round(x0 + (x1 - x0) * step / steps), Math.round(y0 + (y1 - y0) * step / steps));
      }
    }
  }

  return ffmpeg([
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${canvasWidth}x${canvasHeight}`, '-i', 'pipe:0',
    '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2pipe', 'pipe:1',
  ], pixels);
}

function makeDeck(entries, history, random) {
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  entries.sort((a, b) => (history.answers.get(a.answer) ?? 0) - (history.answers.get(b.answer) ?? 0)
    || (history.drawings.get(a.id ?? a.answer) ?? 0) - (history.drawings.get(b.id ?? b.answer) ?? 0));
  const answers = new Set();
  return entries.filter((entry) => {
    if (answers.has(entry.answer)) return false;
    answers.add(entry.answer);
    return true;
  });
}

function createRabisca({
  deck = require('../data/rabisca.json'), random = Math.random,
  render = renderDrawing,
  schedule = setTimeout, cancel = clearTimeout, onError = console.error,
} = {}) {
  const games = new Map();
  const lastScores = new Map();
  const histories = new Map();

  function scorePayload(game, heading) {
    const ranking = [...game.scores].sort((a, b) => b[1] - a[1]);
    const total = ranking.reduce((sum, [, points]) => sum + points, 0);
    return {
      text: [heading, `Total do grupo: *${total} pontos*`, '', ranking.length ? '*Placar*' : 'Ninguém pontuou nesta partida.',
        ...ranking.map(([player, score], i) => `${i + 1}. @${player.split('@')[0]} • ${score} pontos`),
      ].join('\n'),
      mentions: ranking.map(([player]) => player),
    };
  }

  function closeRound(game) {
    if (game.round?.timer != null) cancel(game.round.timer);
    game.round = null;
  }

  async function finish(group, game, send, reason) {
    closeRound(game);
    games.delete(group);
    const result = scorePayload(game, reason);
    lastScores.set(group, result);
    await send(result);
  }

  async function nextRound(group, game, send) {
    const entry = game.deck.shift();
    if (!entry) return finish(group, game, send, 'Fim de partida. Vocês chegaram ao fim do baralho!');
    try {
      const thumbnail = await render(entry);
      if (games.get(group) !== game) return;
      await send({
        text: `*Rabisca • desenho ${++game.number}*\nTema: ${entry.theme}. Vocês têm 60 segundos.\nMande seu palpite ou use !dica e !pular.`,
        externalAdReply: {
          title: 'Qual é o desenho?',
          body: 'Desenho do Google Quick, Draw! • CC BY 4.0',
          thumbnail,
          sourceUrl: creditsUrl,
          mediaType: 1,
          renderLargerThumbnail: true,
          showAdAttribution: false,
        },
        linkPreview: null,
      });
      if (games.get(group) !== game) return;
      const count = ++game.history.count;
      game.history.answers.set(entry.answer, count);
      game.history.drawings.set(entry.id ?? entry.answer, count);
      const round = { entry, usedHint: false, deadline: Date.now() + 60_000 };
      game.round = round;
      round.timer = schedule(async () => {
        if (games.get(group) !== game || game.round !== round) return;
        try {
          await finish(group, game, send, `Tempo esgotado! A resposta era *${entry.answer}*.`);
        } catch (error) {
          onError(error);
        }
      }, 60_000);
    } catch (error) {
      if (games.get(group) === game) {
        closeRound(game);
        games.delete(group);
      }
      throw error;
    }
  }

  async function handle({ group, player, text, send }) {
    if (!group?.endsWith('@g.us') || !player || !text) return false;
    const trimmed = text.trim();
    const command = /^!(\w+)(?:\s+(.+))?$/i.exec(trimmed);
    const control = command?.[1].toLowerCase();
    const arg = command?.[2]?.toLowerCase();
    const game = games.get(group);
    if (!controls.has(control) && (trimmed.startsWith('!') || !game?.round)) return false;
    const reply = (message) => send({ text: message });

    if (control === 'rabisca') {
      if (arg === 'fim') {
        if (!game) await reply('Nenhuma partida em andamento.');
        else if (game.owner !== player) await reply('Quem iniciou a partida pode encerrá-la.');
        else await finish(group, game, send, 'Partida encerrada.');
        return true;
      }
      if (game) await reply('Já tem uma partida neste grupo. Mande seu palpite!');
      else if (arg && arg !== 'geral' && !themes.includes(arg)) await reply('Use !rabisca, !rabisca animais, !rabisca comidas ou !rabisca objetos.');
      else {
        const history = histories.get(group) ?? { count: 0, answers: new Map(), drawings: new Map() };
        histories.set(group, history);
        const cards = makeDeck(deck.filter((entry) => !arg || arg === 'geral' || entry.theme === arg), history, random);
        const state = { owner: player, number: 0, deck: cards, hints: 3, skips: 3, scores: new Map(), round: null, history };
        games.set(group, state);
        await nextRound(group, state, send);
      }
      return true;
    }

    if (control === 'placar') {
      if (game) await send(scorePayload(game, 'Placar da partida atual'));
      else if (lastScores.has(group)) await send(lastScores.get(group));
      else await reply('Ainda não tem placar. Comece com !rabisca.');
      return true;
    }

    const round = game?.round;
    if (!round) {
      if (control) await reply(game ? 'O próximo desenho está chegando.' : 'Comece uma partida com !rabisca.');
      return Boolean(control);
    }

    const { answer } = round.entry;
    if (Date.now() >= round.deadline) {
      await finish(group, game, send, `Tempo esgotado! A resposta era *${answer}*.`);
      return true;
    }

    if (control === 'dica') {
      if (round.usedHint) await reply('Este desenho já recebeu uma dica.');
      else if (!game.hints) await reply('As três dicas desta partida acabaram.');
      else {
        round.usedHint = true;
        game.hints--;
        const letters = [...answer].filter((char) => /\p{L}/u.test(char)).length;
        await reply(`Dica: ${letters} letras, começa com *${answer[0].toUpperCase()}*. Restam ${game.hints} dicas.`);
      }
      return true;
    }

    if (control === 'pular' && !game.skips) {
      await reply('Os três pulos desta partida acabaram.');
      return true;
    }
    const guess = normalizeGuess(control === 'chute' ? (arg ?? '') : trimmed);
    const correct = [answer, ...(aliases[answer] ?? [])].some((value) => normalizeGuess(value) === guess);
    if (control !== 'pular' && !correct) return control === 'chute';

    closeRound(game);
    try {
      if (control === 'pular') {
        game.skips--;
        await send(scorePayload(game, `Desenho pulado. Era *${answer}*. Restam ${game.skips} pulos.`));
      } else {
        const total = (game.scores.get(player) ?? 0) + 10;
        game.scores.set(player, total);
        await send({
          text: `@${player.split('@')[0]} acertou *${answer}*! +10 pontos. Total: *${total} pontos*.`,
          mentions: [player],
        });
      }
      if (games.get(group) === game) await nextRound(group, game, send);
    } catch (error) {
      if (games.get(group) === game) games.delete(group);
      throw error;
    }
    return true;
  }

  return {
    handle,
    stop() {
      for (const game of games.values()) closeRound(game);
      games.clear();
    },
  };
}

module.exports = { createRabisca, renderDrawing };
