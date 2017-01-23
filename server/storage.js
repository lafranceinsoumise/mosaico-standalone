'use strict';

const bluebird = require('bluebird');
const express = require('express');
const fs = require('mz/fs');
const newUuid = require('uuid/v4');
const path = require('path');
const Redis = require('redis');
bluebird.promisifyAll(Redis.RedisClient.prototype);
bluebird.promisifyAll(Redis.Multi.prototype);
const redis = Redis.createClient();
const wrap = require('./utils/wrap');

var app = express.Router();

app.post('/save', wrap(async (req, res) => {
  var source = req.body.html;

  if (!source) throw new Error('No content.');

  var uuid = (req.body.uuid || newUuid());
  await req.body.uuid || redis.lpushAsync(`mosaico:${req.user}:emails`, uuid);
  await fs.writeFile(`./emails/${uuid}.html`, source);
  await fs.writeFile(`./emails/${uuid}.json`, JSON.stringify({
    metadata: JSON.parse(req.body.metadata),
    content: JSON.parse(req.body.content)
  }));

  res.status(202).json({uuid: uuid});
}));

app.get('/list', wrap(async (req, res) => {
  var mails = (await Promise.all(
    (await redis.lrangeAsync(`mosaico:${req.user}:emails`, 0, 100))
    .map(async (id) => {
      try {
        var data = JSON.parse(await fs.readFile(path.join('./emails', `${id}.json`)));
      } catch (e) {
        if (e.code === 'ENOENT') {
          await redis.lremAsync(`mosaico:${res.user}:emails`, 0, id);
        }

        return;
      }

      return {
        view: '/emails/' + id + '.html',
        edit: '/edit/' + id,
        delete: '/delete/' + id,
        id: id,
        name: data.metadata.name,
        created: data.metadata.created
      };
    })
  ))
  .filter(mail => (typeof mail !== 'undefined'));

  var templates = (await fs.readdir('./templates/dist'))
    .map(name => ({name: name, url: `/new?template=/templates/dist/${name}/template-${name}.html`}))
    .concat(
      (await fs.readdir('./templates/custom'))
      .filter(name => (name !== '.gitkeep'))
      .map(name => ({name: `${name} (Custom)`, url: `/new?template=/templates/custom/${name}/template-${name}.html`}))
    );

  res.render('list', {list: mails, templates: templates});
}));

/**
 * Delete the mail in redis db
 */
app.post('/delete', wrap(async (req, res) => {
  console.log(req.id);
  await redis.lremAsync(`mosaico:${req.user}:emails`, 0, req.body.id);
  res.redirect('/storage/list');
}));

module.exports = app;
