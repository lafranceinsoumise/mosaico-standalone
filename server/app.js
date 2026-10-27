import fs from "node:fs/promises";
import path from "node:path";

import { RedisStore } from "connect-redis";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";
import moment from "moment";
import morgan from "morgan";
import { createClient } from "redis";
import sanitizeHtml from "sanitize-html";
import validator from "validator";

import config from "../config.js";
import passport from "./authentication.js";
import dl from "./dl.js";
import img from "./img.js";
import mailer from "./mailer.js";
import storage from "./storage.js";
import { templatesFor } from "./templates.js";
import upload from "./upload.js";
import dbPromise from "./utils/db.js";

if (!config.secret || config.secret === "cat keyboard") {
  throw new Error("Set a strong, random `secret` in config.js.");
}

const UUID =
  /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const app = express();

// Config
app.set("trust proxy", "loopback");
app.set("views", "./server/views");
app.set("view engine", "pug");
app.locals.moment = moment;
app.get("env") === "development" && app.use(morgan("dev"));
app.use(
  helmet({
    // Mosaico relies on inline scripts and eval
    contentSecurityPolicy: false,
    // images are embedded in emails read from other origins
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: { action: "sameorigin" },
    // with no-referrer, browsers send `Origin: null` on form posts
    referrerPolicy: { policy: "same-origin" },
  }),
);

// Static files
const sandbox = (req, res, next) => {
  res.set("Content-Security-Policy", "sandbox");
  next();
};

app.use("/mosaico", express.static("./mosaico"));
app.use("/templates", (req, res, next) => {
  let reg = req.url.match(/^\/(custom|dist)\/([\w-]+)\/template\.html$/);
  if (!reg) return next();

  let [, folder, name] = reg;

  fs.stat(path.join("./templates", req.url))
    .catch((err) => {
      if (err.code === "ENOENT") {
        req.url = `/${folder}/${name}/template-${name}.html`;
      }
    })
    .finally(next);
});

app.use("/templates", express.static("./templates"));
app.use("/uploads", sandbox, express.static("./uploads"));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb" }));

// Public routes
app.all(/^\/emails\/([^/]+)\.html$/, sandbox, async (req, res) => {
  let uuid = req.params[0];
  if (!UUID.test(uuid)) return res.sendStatus(404);

  let db = await dbPromise;
  let email = await db.get("SELECT html FROM emails WHERE uuid = ?", [uuid]);
  if (!email) return res.sendStatus(404);

  let html = String(email.html);
  let tags = (req.method === "GET" ? req.query : req.body) || {};

  for (let [tag, value] of Object.entries(tags)) {
    let replacement = sanitizeHtml(String(value));
    html = html.replaceAll(`[${tag}]`, () => replacement);
  }

  return res.type("html").send(html);
});

/**
 * See doc in module
 */
app.get("/img", img);

// Authentication

app.use(
  session({
    name: "mosaico.sid",
    store: new RedisStore({
      client: redisClient,
      prefix: "mosaico-standalone",
    }),
    secret: config.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: Boolean(config.https),
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// CSRF: reject state-changing requests coming from another site
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  let source = req.get("Origin") || req.get("Referer");
  if (!source) return next();

  try {
    if (new URL(source).host === req.host) return next();
  } catch (e) {
    // invalid header, rejected below
  }

  return res.sendStatus(403);
});

app.get("/login", (req, res) => {
  res.render("login");
});
app.post(
  "/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
  }),
  passport.authenticate("local", {
    successRedirect: "/storage/list",
    failureRedirect: "/login",
  }),
);
app.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

// Private routes

app.use((req, res, next) => {
  if (!req.user) {
    return res.redirect("/login");
  }

  res.locals.user = req.user;

  return next();
});

app.param("id", (req, res, next, id) => {
  if (!UUID.test(id)) return res.sendStatus(404);
  next();
});

const findOwnEmail = async (req, res, next) => {
  let db = await dbPromise;
  let email = await db.get("SELECT * FROM emails WHERE uuid = ? AND user = ?", [
    req.params.id,
    req.user,
  ]);
  if (!email) return res.sendStatus(404);

  res.locals.email = email;
  next();
};

app.get("/", (req, res) => {
  return res.redirect("/storage/list");
});

app.get("/emails/:id.json", findOwnEmail, (req, res) => {
  let { email } = res.locals;
  return res.json({
    metadata: JSON.parse(email.metadata),
    content: JSON.parse(email.content),
  });
});

/**
 * /editor
 * GET load Mosaico
 */
app.get("/mosaico", (req, res) =>
  res.sendFile(path.join(process.cwd(), "mosaico.html")),
);
app.get("/new", (req, res) => {
  let template = req.query.template;
  if (!templatesFor(req.user).some((t) => t.url === template)) {
    return res.sendStatus(400);
  }
  res.render("editor", { template });
});
app.get("/edit/:id", (req, res) => {
  res.render("editor", { id: req.params.id });
});

/**
 * /delete
 * GET delete request
 */
app.get("/delete/:id", (req, res) => {
  res.render("delete", { id: req.params.id });
});

/**
 * /send/:id
 * GET send form
 */
const logPath = (id) => path.join("./logs", `${id}.csv`);

app.get("/send/:id", findOwnEmail, async (req, res) => {
  let logFile = await fs.access(logPath(req.params.id)).then(
    () => true,
    () => false,
  );

  res.render("send", {
    id: req.params.id,
    fromName: config.sendDefaults && config.sendDefaults.fromName,
    fromAddress: config.sendDefaults && config.sendDefaults.fromAddress,
    logFile,
  });
});

app.post("/send/:id", findOwnEmail, async (req, res) => {
  let {
    to = "",
    fromName = "",
    fromAddress = "",
    mailSubject = "",
  } = req.body || {};
  let regEmail = /[a-zA-Z0-9_.+?$%^&*-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;
  let recipients = String(to).match(regEmail);
  let formErrors = {};

  if (!recipients) {
    formErrors["noTo"] = "No valid recipient.";
  }

  if (recipients && recipients.length > 500) {
    formErrors["toManyTo"] = "You cannot send more than 500 recipients.";
  }

  if (!validator.isLength(String(fromName), { min: 0, max: 250 })) {
    formErrors["tooLongName"] = "From name must not exceed 250 characters.";
  }

  if (!validator.isLength(String(mailSubject), { min: 0, max: 250 })) {
    formErrors["tooLongSubject"] = "Subject must not exceed 250 characters.";
  }

  if (!validator.isEmail(String(fromAddress))) {
    formErrors["invalidFromAdress"] =
      `From email address ${fromAddress} is invalid.`;
  }

  if (Object.keys(formErrors).length > 0) {
    return res.render("send", {
      id: req.params.id,
      errors: formErrors,
      fromName,
      fromAddress,
      mailSubject,
      mailList: recipients ? recipients.join("\n") : "",
    });
  }

  let logFile = (await fs.open(logPath(req.params.id), "a")).createWriteStream({
    encoding: "utf-8",
  });

  let sendErrors = [];
  let sendSuccesses = [];

  let content = res.locals.email.html;

  let mailOptions = {
    from: { name: String(fromName), address: String(fromAddress) },
    subject: String(mailSubject),
    html: content,
  };

  let hasPlaceholders = content.includes("[EMAIL]");

  for (let currentRecipient of recipients) {
    if (!validator.isEmail(currentRecipient)) {
      logFile.write(
        `${new Date()};${currentRecipient};error;Error: Invalid address\n`,
      );
      sendErrors.push({
        email: currentRecipient,
        message: "Invalid address.",
      });
      continue;
    }

    mailOptions.to = currentRecipient;
    if (hasPlaceholders)
      mailOptions.html = content.replaceAll("[EMAIL]", () => currentRecipient);

    try {
      await mailer.sendMail(mailOptions);
    } catch (err) {
      logFile.write(
        `${new Date()};${currentRecipient};error;Error: ${err.message}\n`,
      );
      sendErrors.push({ email: currentRecipient, message: err.message });
      continue;
    }

    logFile.write(`${new Date()};${currentRecipient};success;Email sent\n`);
    sendSuccesses.push(currentRecipient);
  }

  logFile.end();

  req.session.sendSummary = {};
  req.session.sendSummary.errors = sendErrors;
  req.session.sendSummary.successes = sendSuccesses;

  return res.redirect(`/send/${req.params.id}/summary`);
});

app.get("/send/:id/summary", findOwnEmail, async (req, res) => {
  if (!req.session.sendSummary) {
    return res.redirect(`/send/${req.params.id}`);
  }

  let sendSummary = req.session.sendSummary;
  delete req.session.sendSummary;

  let mailName = JSON.parse(res.locals.email.metadata).name;

  return res.render("sendSummary", {
    id: req.params.id,
    name: mailName,
    successes: sendSummary.successes,
    errors: sendSummary.errors,
  });
});

app.get("/send/:id/export", findOwnEmail, (req, res) => {
  res.download(logPath(req.params.id));
});

/**
 * /duplicate
 * GET delete request
 */
app.get("/duplicate", (req, res) => {
  res.render("duplicate", { id: req.query.email_id, name: req.query.name });
});

/**
 * /upload/
 * GET returns a JSON list of previously uploaded images
 * POST to upload images (using the jQuery-file-upload protocol)
 * when uploading it also create thumbnails for each uploaded image.
 */
app.use("/upload", upload);

/**
 * POST
 * receives a post with the html body and a parameter asking for "download" or "email".
 * (it does inlining using Styliner) since Mosaico 0.15 CSS inlining happens in the client.
 * if asked to send an email it sends it using nodemailer
 */
app.post("/dl", dl);

/**
 * See docs in module
 */
app.use("/storage", storage);

export default app;
