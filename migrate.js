const path = require('path');
const bluebird = require('bluebird');
const Redis = require('redis');
const fs = require('mz/fs');
bluebird.promisifyAll(Redis.RedisClient.prototype);
bluebird.promisifyAll(Redis.Multi.prototype);
const redis = Redis.createClient();

const dbPromise = require('./server/utils/db');

(async () => {
  let db = await dbPromise;
  let userEmailLists = await redis
    .keysAsync('mosaico:*');

  for (let userEmailList of userEmailLists) {
    let [, user] = userEmailList.match(/mosaico:(\w+):emails/);

    for (let i = await redis.llenAsync(userEmailList); i > 0; i--) {
      let uuid = await redis.lindexAsync(userEmailList, i - 1);

      let data, html;
      try {
        data = JSON.parse(await fs.readFile(path.join('./emails', `${uuid}.json`)));
        html = await fs.readFile(path.join('./emails', `${uuid}.html`));
      } catch (e) {
        continue;
      }

      try {
        await db.run('INSERT INTO emails(uuid, user, metadata, content, html) VALUES(?, ?, ?, ?, ?)', [
          uuid,
          user,
          JSON.stringify(data.metadata),
          JSON.stringify(data.content),
          html
        ]);
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT') {
          continue;
        }

        throw e;
      }

      console.log(uuid);
    }
  }

  console.log('OK');

  return;
})().catch(console.log);
