import bodyParser from "body-parser";
import RedisStore from "connect-redis";
import express from "express";
import session from "express-session";
import moment from "moment";
import morgan from "morgan";
import { fs } from "mz";
import nodemailer from "nodemailer";
import { htmlToText } from "nodemailer-html-to-text";
import path from "path";
import redis from "redis";
import sanitizeHtml from "sanitize-html";
import validator from "validator";

import config from "../config.js";
import passport from "./authentication.js";
import dl from "./dl.js";
import img from "./img.js";
import storage from "./storage.js";
import upload from "./upload.js";
import dbPromise from "./utils/db.js";
import wrap from "./utils/wrap.js";

const redisClient = redis.createClient();
await redisClient.connect();

const app = express();

const mailer = nodemailer.createTransport(config.emailTransport);
mailer.use("compile", htmlToText());

// Static files
app.use("/mosaico", express.static("./mosaico"));
app.use("/templates", (req, res, next) => {
  let reg = req.url.match(/\/(custom|dist)\/(.*)\/template.html/);
  if (!reg) return next();

  let [, folder, name] = reg;
  console.log(folder, name);

  fs.stat(path.join("./templates", req.url), (err) => {
    if (err && err.code === "ENOENT") {
      req.url = `/${folder}/${name}/template-${name}.html`;
    }

    return next();
  });
});

app.use("/templates", express.static("./templates"));
app.use("/uploads", express.static("./uploads"));

// Config
app.enable("trust proxy");
app.set("views", "./server/views");
app.set("view engine", "pug");
app.locals.moment = moment;
app.get("env") === "development" && app.use(morgan("dev"));
app.use(bodyParser.json({ limit: "5mb" }));
app.use(
  bodyParser.urlencoded({
    limit: "5mb",
    extended: true,
  }),
);

// Tool function
function isEmpty(obj) {
  for (let x in obj) {
    return false;
  }
  return true;
}

// Public routes
app.all(
  /^\/emails\/[A-F\d]{8}-[A-F\d]{4}-4[A-F\d]{3}-[89AB][A-F\d]{3}-[A-F\d]{12}\.(json|html)$/i,
  wrap(async (req, res) => {
    let [, uuid, extension] = req.path.match(
      /([A-F\d]{8}-[A-F\d]{4}-4[A-F\d]{3}-[89AB][A-F\d]{3}-[A-F\d]{12})\.(json|html)$/i,
    );
    let db = await dbPromise;

    let email = await db.get("SELECT * FROM emails WHERE uuid = ?", [uuid]);

    if (extension === "json") {
      return res.json({
        metadata: JSON.parse(email.metadata),
        content: JSON.parse(email.content),
      });
    }

    let html = String(email.html);

    for (let elem in req.method === "GET" ? req.query : req.body) {
      html = html.replace(
        new RegExp(`\\[${elem}\\]`, "g"),
        sanitizeHtml((req.method === "GET" ? req.query : req.body)[elem]),
      );
    }

    return res.send(html);
  }),
);

/**
 * See doc in module
 */
app.get("/img", img);

// Authentication

app.use(
  session({
    store: new RedisStore({
      client: redisClient,
      prefix: "mosaico-standalone",
    }),
    secret: config.secret,
    resave: true,
    saveUninitialized: true,
  }),
);
app.use(passport.initialize());
app.use(passport.session());

app.get("/login", (req, res) => {
  res.render("login");
});
app.use(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/storage/list",
    failureRedirect: "/login",
  }),
);
app.get("/logout", (req, res) => {
  req.logout();
  res.redirect("/");
});

// Private routes

app.use("/", (req, res, next) => {
  if (!req.user && process.env.NODE_ENV !== "test") {
    return res.redirect("/login");
  }
  if (!req.user && process.env.NODE_ENV === "test") req.user = "test";

  res.locals.user = req.user;

  return next();
});

app.get("/", (req, res) => {
  return res.redirect("/storage/list");
});

/**
 * /editor
 * GET load Mosaico
 */
app.get("/mosaico", (req, res) =>
  res.sendFile(path.join(process.cwd(), "mosaico.html")),
);
app.get("/new", (req, res) => {
  res.render("editor", { template: req.query.template });
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
app.get(
  "/send/:id",
  wrap(async (req, res) => {
    try {
      let logFile;

      try {
        await fs.access(path.join("./logs/" + req.params.id + ".csv"));
        logFile = true;
      } catch (e) {
        logFile = false;
      }

      res.render("send", {
        id: req.params.id,
        fromName: config.sendDefaults && config.sendDefaults.fromName,
        fromAddress: config.sendDefaults && config.sendDefaults.fromAddress,
        logFile,
      });
    } catch (e) {
      res.sendStatus(404);
    }
  }),
);

app.post(
  "/send/:id",
  wrap(async (req, res) => {
    let db = await dbPromise;
    let regEmail = /[a-zA-Z0-9_.+?$%^&*-]+@[a-zA-z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;
    let recipients = req.body.to.match(regEmail);
    let formErrors = {};

    if (!recipients) {
      formErrors["to"] = "No valid recipient.";
    }

    if (recipients && recipients.length > 500) {
      formErrors["to"] = "You cannot send more than 500 recipients.";
    }

    if (!validator.isLength(req.body.fromName, { min: 0, max: 250 })) {
      formErrors["fromName"] = "From name must not exceed 100 characters.";
    }

    if (!validator.isLength(req.body.mailSubject, { min: 0, max: 250 })) {
      formErrors["mailSubject"] = "Subject must not exceed 250 characters.";
    }

    if (!validator.isEmail(req.body.fromAddress)) {
      formErrors[
        "fromAdress"
      ] = `From email address ${req.body.fromAddress} is invalid.`;
    }

    if (!isEmpty(formErrors)) {
      return res.render("send", {
        id: req.params.id,
        errors: formErrors,
        form: {
          fromName: req.body.fromName,
          fromAddress: req.body.fromAddress,
          subject: req.body.subject,
          mailList: recipients ? recipients.join("\n") : "",
        },
      });
    }

    let logFile = fs.createWriteStream(`./logs/${req.params.id}.csv`, {
      flag: "a+",
      encoding: "utf-8",
    });

    let sendErrors = [];
    let sendSuccesses = [];

    let { html: content } = await db.get(
      "SELECT * FROM emails WHERE uuid = ?",
      [req.params.id],
    );

    let mailOptions = Object.assign({
      from:
        req.body.fromName.length > 0
          ? req.body.fromName + " <" + req.body.fromAddress + ">"
          : req.body.fromAddress,
      subject: req.body.mailSubject, // Subject line
      html: content, // html body
    });

    let hasPlaceholders = content.includes("[EMAIL]");

    for (let i = 0; i < recipients.length; i++) {
      let currentRecipient = recipients[i];

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
        mailOptions.html = content.replace(
          new RegExp("\\[EMAIL\\]", "g"),
          currentRecipient,
        );

      await new Promise((resolve) => {
        mailer.sendMail(mailOptions, (err) => {
          if (err) {
            logFile.write(
              `${new Date()};${currentRecipient};error;Error: ${err.message}\n`,
            );
            sendErrors.push({ email: currentRecipient, message: err.message });

            return resolve();
          }

          logFile.write(
            `${new Date()};${currentRecipient};success;Email sent\n`,
          );
          sendSuccesses.push(currentRecipient);

          return resolve();
        });
      });
    }

    req.session.sendSummary = {};
    req.session.sendSummary.errors = sendErrors;
    req.session.sendSummary.successes = sendSuccesses;

    return res.redirect(`/send/${req.params.id}/summary`);
  }),
);

app.get(
  "/send/:id/summary",
  wrap(async (req, res) => {
    let db = await dbPromise;
    if (!req.session.sendSummary) {
      return res.redirect(`/send/${req.params.id}`);
    }

    let sendSummary = req.session.sendSummary;
    delete req.session.sendSummary;

    let email = await db.get("SELECT * FROM emails WHERE uuid = ?", [
      req.params.id,
    ]);
    let mailName = JSON.parse(email.metadata).name;

    return res.render("sendSummary", {
      id: req.params.id,
      name: mailName,
      successes: sendSummary.successes,
      errors: sendSummary.errors,
    });
  }),
);

app.get(
  "/send/:id/export",
  wrap(async (req, res) => {
    res.download(path.join("./logs/", `${req.params.id}.csv`));
  }),
);

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

app.listen(process.env.PORT || 3000, "127.0.0.1", (err) => {
  if (err) return console.error(err);

  console.log("Listening on http://localhost:" + (process.env.PORT || 3000));
});

export default app;
