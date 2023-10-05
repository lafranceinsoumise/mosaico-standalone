const express = require("express");
const newUuid = require("uuid/v4");
const wrap = require("./utils/wrap");
const dbPromise = require("./utils/db");
const config = require("../config");
const distTemplates = require("fs").readdirSync("./templates/dist");

var app = express.Router();

app.post(
  "/save",
  wrap(async (req, res) => {
    let db = await dbPromise;
    let html = req.body.html;

    if (!html) throw new Error("No content.");

    let uuid = req.body.uuid || newUuid();

    JSON.parse(req.body.metadata);
    JSON.parse(req.body.content);

    await db.run(
      "INSERT OR REPLACE INTO emails(uuid, user, metadata, content, html) VALUES(?, ?, ?, ?, ?)",
      [uuid, req.user, req.body.metadata, req.body.content, html]
    );

    res.status(202).json({ uuid: uuid });
  })
);

app.get(
  "/list/:index?",
  wrap(async (req, res) => {
    let db = await dbPromise;
    let sqlParams = [req.user];
    let sqlConditions = "WHERE user = ?";
    if (req.query.q) {
      for (let word of req.query.q.split(" ")) {
        sqlConditions += " AND content LIKE ?";
        sqlParams.push(`%${word}%`);
      }
    }

    let {
      nList,
    } = await db.get(
      `SELECT COUNT(uuid) as nList FROM emails ${sqlConditions}`,
      [...sqlParams]
    );
    let nPage = Math.ceil(nList / 10);
    let index = Number(req.params.index) || 1;
    let start = (index - 1) * 10;

    let mails = (
      await db.all(
        `SELECT * FROM emails ${sqlConditions} ORDER BY rowid DESC LIMIT ?, 10`,
        [...sqlParams, start]
      )
    ).map((email) => {
      let metadata = JSON.parse(email.metadata);

      return {
        view: "/emails/" + email.uuid + ".html",
        edit: "/edit/" + email.uuid,
        delete: "/delete/" + email.uuid,
        duplicate:
          "/duplicate?email_id=" + email.uuid + "&name=" + metadata.name,
        id: email.uuid,
        name: metadata.name,
        created: metadata.created,
        send: "/send/" + email.uuid,
      };
    });

    var templates = config.users
      .filter((user) => user.username === req.user)[0]
      .templates.map((name) => ({
        name: `${config.templateNames && config.templateNames[name] || name}`,
        url: `/new?template=/templates/custom/${name}/template.html`,
      }));

    templates = templates.concat(
      distTemplates.map((name) => ({
        name: `${name} [example]`,
        url: `/new?template=/templates/dist/${name}/template.html`,
      }))
    );

    res.render("list", {
      list: mails,
      templates,
      index: parseInt(index),
      nPage,
      searchQuery: req.query.q,
    });
  })
);

/**
 * Delete the mail in redis db
 */
app.post(
  "/delete",
  wrap(async (req, res) => {
    let db = await dbPromise;
    await db.run("DELETE FROM emails WHERE uuid = ?", [req.body.id]);

    res.redirect("/storage/list");
  })
);

/**
 * Duplicate the mail in redis db
 */
app.post(
  "/duplicate",
  wrap(async (req, res) => {
    let db = await dbPromise;
    let email = await db.get("SELECT * FROM emails WHERE uuid = ?", [
      req.body.id,
    ]);

    email.uuid = newUuid();
    email.metadata = JSON.stringify(
      Object.assign(JSON.parse(email.metadata), {
        name: req.body.email_name,
        created: Math.round(Date.now()),
      })
    );

    await db.run(
      "INSERT OR REPLACE INTO emails(uuid, user, metadata, content, html) VALUES(?, ?, ?, ?, ?)",
      [email.uuid, email.user, email.metadata, email.content, email.html]
    );

    return res.redirect("/storage/list");
  })
);

module.exports = app;
