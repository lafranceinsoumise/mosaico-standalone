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

app.get('/list/:index?', wrap(async (req, res) => {
  var nList = await redis.llenAsync(`mosaico:${req.user}:emails`);
  var nPage = Math.ceil(nList/10);
  var index = (req.params.index || 1);
  if (index == 0){index=1;}
  if (index > nPage){index=nPage;}
  var start = ((index-1)*10);
  var end = start+9;

  var mails = (await Promise.all(
    (await redis.lrangeAsync(`mosaico:${req.user}:emails`, start, end))
    .map(async (id) => {
      try {
        var data = JSON.parse(await fs.readFile(path.join('./emails', `${id}.json`)));
      } catch (e) {
        if (e.code === 'ENOENT') {
          await redis.lremAsync(`mosaico:${req.user}:emails`, 0, id);
        }

        return;
      }

      return {
        view: '/emails/' + id + '.html',
        edit: '/edit/' + id,
        delete: '/delete/' + id,
        duplicate: '/duplicate?email_id=' + id +'&name=' + data.metadata.name ,
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

  res.render('list', {list: mails, templates: templates, index: parseInt(index), nPage: nPage});
}));

/**
 * Delete the mail in redis db
 */
app.post('/delete', wrap(async (req, res) => {
  await redis.lremAsync(`mosaico:${req.user}:emails`, 0, req.body.id);
  res.redirect('/storage/list');
}));

/**
 * Duplicate the mail in redis db
 */
app.post('/duplicate', wrap(async (req, res) => {
  var content_json = await fs.readFile(path.join('./emails/', req.body.id+'.json'), {encoding: 'utf-8'});

  var metadata = JSON.parse(content_json).metadata;
  metadata.name = req.body.email_name; //new name

  var uuid = newUuid();
  await redis.lpushAsync(`mosaico:${req.user}:emails`, uuid);
  await fs.writeFile(`./emails/${uuid}.html`, fs.readFile(path.join('./emails/', req.body.id+'.html'), {encoding: 'utf-8'}));
  await fs.writeFile(`./emails/${uuid}.json`, JSON.stringify({
    metadata: metadata,
    content: JSON.parse(content_json).content
  }));

  res.redirect('/storage/list');
}));

module.exports = app;
