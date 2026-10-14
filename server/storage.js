import { randomUUID } from "node:crypto";

import express from "express";

import { templatesFor } from "./templates.js";
import dbPromise from "./utils/db.js";

const app = express.Router();

app.post("/save", async (req, res) => {
  let db = await dbPromise;
  let { uuid, html, metadata, content } = req.body || {};

  if (!html) return res.status(400).send("No content.");

  try {
    JSON.parse(metadata);
    JSON.parse(content);
  } catch (e) {
    return res.status(400).send("Invalid metadata or content.");
  }

  if (uuid) {
    let { changes } = await db.run(
      "UPDATE emails SET metadata = ?, content = ?, html = ? WHERE uuid = ? AND user = ?",
      [metadata, content, html, uuid, req.user],
    );
    if (!changes) return res.sendStatus(404);
  } else {
    uuid = randomUUID();
    await db.run(
      "INSERT INTO emails(uuid, user, metadata, content, html) VALUES(?, ?, ?, ?, ?)",
      [uuid, req.user, metadata, content, html],
    );
  }

  res.status(202).json({ uuid: uuid });
});

app.get("/list{/:index}", async (req, res) => {
  let db = await dbPromise;
  let searchQuery = typeof req.query.q === "string" ? req.query.q : "";
  let sqlParams = [req.user];
  let sqlConditions = "WHERE user = ?";
  for (let word of searchQuery.split(" ").filter(Boolean)) {
    sqlConditions += " AND content LIKE ?";
    sqlParams.push(`%${word}%`);
  }

  let { nList } = await db.get(
    `SELECT COUNT(uuid) as nList FROM emails ${sqlConditions}`,
    [...sqlParams],
  );
  let nPage = Math.ceil(nList / 10);
  let index = Math.max(1, parseInt(req.params.index) || 1);
  let start = (index - 1) * 10;

  let mails = (
    await db.all(
      `SELECT * FROM emails ${sqlConditions} ORDER BY rowid DESC LIMIT ?, 10`,
      [...sqlParams, start],
    )
  ).map((email) => {
    let metadata = JSON.parse(email.metadata);

    return {
      view: "/emails/" + email.uuid + ".html",
      edit: "/edit/" + email.uuid,
      delete: "/delete/" + email.uuid,
      duplicate:
        "/duplicate?email_id=" +
        email.uuid +
        "&name=" +
        encodeURIComponent(metadata.name ?? ""),
      id: email.uuid,
      name: metadata.name,
      created: metadata.created,
      send: "/send/" + email.uuid,
    };
  });

  const templates = templatesFor(req.user).map((t) => ({
    name: t.name,
    url: `/new?template=${encodeURIComponent(t.url)}`,
  }));

  res.render("list", {
    list: mails,
    templates,
    index,
    nPage,
    searchQuery,
  });
});

app.post("/delete", async (req, res) => {
  let db = await dbPromise;
  await db.run("DELETE FROM emails WHERE uuid = ? AND user = ?", [
    req.body?.id,
    req.user,
  ]);

  res.redirect("/storage/list");
});

app.post("/duplicate", async (req, res) => {
  let db = await dbPromise;
  let email = await db.get("SELECT * FROM emails WHERE uuid = ? AND user = ?", [
    req.body?.id,
    req.user,
  ]);

  if (!email) return res.sendStatus(404);

  email.uuid = randomUUID();
  email.metadata = JSON.stringify(
    Object.assign(JSON.parse(email.metadata), {
      name: req.body.email_name,
      created: Math.round(Date.now()),
    }),
  );

  await db.run(
    "INSERT INTO emails(uuid, user, metadata, content, html) VALUES(?, ?, ?, ?, ?)",
    [email.uuid, email.user, email.metadata, email.content, email.html],
  );

  return res.redirect("/storage/list");
});

export default app;
