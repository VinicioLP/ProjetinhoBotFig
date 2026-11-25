const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

function createCollection(root = path.join(__dirname, '..', '.sticker-collection')) {
  function fileFor(owner, name) {
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) throw new Error('Nome de figurinha inválido.');
    const account = createHash('sha256').update(owner).digest('hex');
    return path.join(root, account, name + '.json');
  }

  return {
    async save(owner, name, payload) {
      const file = fileFor(owner, name);
      const dir = path.dirname(file);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const entries = await fs.readdir(dir);
      if (entries.filter((entry) => entry.endsWith('.json')).length >= 50 && !entries.includes(path.basename(file))) {
        return false;
      }
      const temp = path.join(dir, randomUUID() + '.tmp');
      const record = {
        sticker: payload.sticker.toString('base64'),
        audio: payload.stickerAudio?.toString('base64'),
        animated: payload.isAnimated,
      };
      try {
        await fs.writeFile(temp, JSON.stringify(record), { mode: 0o600 });
        await fs.rename(temp, file);
      } finally {
        await fs.rm(temp, { force: true });
      }
      return true;
    },

    async load(owner, name) {
      try {
        const record = JSON.parse(await fs.readFile(fileFor(owner, name), 'utf8'));
        const payload = { sticker: Buffer.from(record.sticker, 'base64'), isAnimated: record.animated };
        if (record.audio) payload.stickerAudio = Buffer.from(record.audio, 'base64');
        return payload;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}

module.exports = { createCollection };
