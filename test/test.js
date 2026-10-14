/* eslint-env mocha */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import request from "supertest";

process.env.DATABASE_PATH = ":memory:";
process.env.SESSION_SECRET ||= randomBytes(32).toString("hex");

const { default: config } = await import("../config.js");
const { hashPassword } = await import("../server/authentication.js");
const { default: app } = await import("../server/app.js");

const salt = randomBytes(16);
config.secret ||= process.env.SESSION_SECRET;
config.users.push(
  { username: "alice", password: "alice-pass", templates: [] },
  {
    username: "bob",
    password: `scrypt:${salt.toString("base64")}:${hashPassword("bob-pass", salt).toString("base64")}`,
    templates: [],
  },
);

async function login(username, password) {
  const agent = request.agent(app);
  await agent
    .post("/login")
    .type("form")
    .send({ username, password })
    .expect(302)
    .expect("Location", "/storage/list");
  return agent;
}

async function createEmail(agent, html = "<p>Hello [NAME]</p>") {
  const res = await agent
    .post("/storage/save")
    .type("form")
    .send({
      html,
      metadata: JSON.stringify({ name: "test", created: Date.now() }),
      content: JSON.stringify({}),
    })
    .expect(202);
  return res.body.uuid;
}

describe("Authentication", function () {
  it("redirects anonymous users to /login", async function () {
    await request(app).get("/").expect(302).expect("Location", "/login");
  });

  it("rejects wrong credentials", async function () {
    await request(app)
      .post("/login")
      .type("form")
      .send({ username: "alice", password: "nope" })
      .expect(302)
      .expect("Location", "/login");
  });

  it("accepts plain and hashed passwords", async function () {
    const agent = await login("bob", "bob-pass");
    await agent.get("/").expect(302).expect("Location", "/storage/list");
    await (await login("alice", "alice-pass")).get("/storage/list").expect(200);
  });

  it("logs out with POST", async function () {
    const agent = await login("alice", "alice-pass");
    await agent.post("/logout").expect(302);
    await agent.get("/storage/list").expect(302).expect("Location", "/login");
  });

  it("rejects cross-site POST requests", async function () {
    const agent = await login("alice", "alice-pass");
    await agent
      .post("/storage/save")
      .set("Origin", "https://evil.example")
      .type("form")
      .send({ html: "x", metadata: "{}", content: "{}" })
      .expect(403);
  });

  it("lets browsers send their origin on same-site posts", async function () {
    await request(app).get("/login").expect("Referrer-Policy", "same-origin");
  });
});

describe("Emails ownership", function () {
  let alice, bob, uuid;

  before(async function () {
    alice = await login("alice", "alice-pass");
    bob = await login("bob", "bob-pass");
    uuid = await createEmail(alice);
  });

  it("lets the owner read the JSON", async function () {
    await alice.get(`/emails/${uuid}.json`).expect(200);
  });

  it("hides emails from other users", async function () {
    await bob.get(`/emails/${uuid}.json`).expect(404);
    await bob.get(`/send/${uuid}`).expect(404);
    await bob.get(`/send/${uuid}/export`).expect(404);
    await bob
      .post(`/send/${uuid}`)
      .type("form")
      .send({ to: "x@example.com", fromAddress: "y@example.com" })
      .expect(404);
    await bob
      .post("/storage/duplicate")
      .type("form")
      .send({ id: uuid })
      .expect(404);
  });

  it("does not let other users overwrite or delete emails", async function () {
    await bob
      .post("/storage/save")
      .type("form")
      .send({ uuid, html: "pwned", metadata: "{}", content: "{}" })
      .expect(404);
    await bob.post("/storage/delete").type("form").send({ id: uuid });

    const res = await request(app).get(`/emails/${uuid}.html`).expect(200);
    assert.match(res.text, /Hello/);
  });

  it("rejects non-uuid ids", async function () {
    await alice.get("/send/..%2F..%2Fconfig/export").expect(404);
  });
});

describe("Public email view", function () {
  let uuid;

  before(async function () {
    uuid = await createEmail(await login("alice", "alice-pass"));
  });

  it("is sandboxed", async function () {
    const res = await request(app).get(`/emails/${uuid}.html`).expect(200);
    assert.equal(res.headers["content-security-policy"], "sandbox");
  });

  it("replaces merge tags literally and sanitizes values", async function () {
    const res = await request(app)
      .get(`/emails/${uuid}.html`)
      .query({ NAME: "$&<script>alert(1)</script>", "(a+)+$": "x" })
      .expect(200);
    assert.equal(res.text, "<p>Hello $&amp;</p>");
  });

  it("returns 404 for unknown emails", async function () {
    await request(app)
      .get("/emails/00000000-0000-4000-8000-000000000000.html")
      .expect(404);
  });
});

describe("Editor", function () {
  it("only loads allowed templates", async function () {
    const agent = await login("alice", "alice-pass");
    await agent
      .get("/new")
      .query({ template: "/templates/dist/versafix-1/template.html" })
      .expect(200);
    await agent
      .get("/new")
      .query({ template: "https://evil.example/template.html" })
      .expect(400);
  });
});

describe("Uploads and images", function () {
  let agent;
  const created = [];

  before(async function () {
    agent = await login("alice", "alice-pass");
  });

  after(async function () {
    for (const name of created) {
      await fs.rm(path.join("uploads", name), { force: true });
      await fs.rm(path.join("uploads", "thumbnail", name), { force: true });
    }
  });

  it("rejects non-image files", async function () {
    const res = await agent
      .post("/upload/")
      .attach("files[]", Buffer.from("<script>alert(1)</script>"), "x.html")
      .expect(200);
    assert.ok(res.body.files[0].error);
  });

  it("stores images, then resizes them", async function () {
    const png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();

    const res = await agent
      .post("/upload/")
      .attach("files[]", png, "red.png")
      .expect(200);
    const [file] = res.body.files;
    created.push(file.name);
    assert.match(file.name, /^[\w-]+\.png$/);

    const img = await request(app)
      .get("/img")
      .query({ src: file.url, method: "resize", params: "150,null" })
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect("Content-Type", /png/);
    const { width, height } = await sharp(img.body).metadata();
    assert.deepEqual([width, height], [150, 100]);
  });

  it("refuses remote or out-of-tree sources", async function () {
    for (const src of [
      "http://169.254.169.254/latest/meta-data",
      "/uploads/../config.js",
      "/uploads/%2e%2e/config.js",
    ]) {
      await request(app)
        .get("/img")
        .query({ src, method: "resize", params: "10,10" })
        .expect(400);
    }
  });

  it("bounds placeholder sizes", async function () {
    await request(app)
      .get("/img")
      .query({ method: "placeholder", params: "600,200" })
      .expect(200)
      .expect("Content-Type", /png/);
    await request(app)
      .get("/img")
      .query({ method: "placeholder", params: "100000,100000" })
      .expect(400);
  });

  it("serves uploads sandboxed", async function () {
    const res = await request(app).get(`/uploads/${created[0]}`).expect(200);
    assert.equal(res.headers["content-security-policy"], "sandbox");
  });
});
