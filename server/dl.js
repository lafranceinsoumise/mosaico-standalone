import validator from "validator";

import config from "../config.js";
import mailer from "./mailer.js";

export default async (req, res) => {
  const { action, html: source, filename, rcpt, subject } = req.body || {};

  if (typeof source !== "string") return res.sendStatus(400);

  if (action === "download") {
    res.attachment(String(filename || "email.html"));
    res.type("text/html");
    return res.send(source);
  }

  if (action === "email") {
    if (typeof rcpt !== "string" || !validator.isEmail(rcpt)) {
      return res.status(400).send("Invalid recipient.");
    }

    const info = await mailer.sendMail({
      to: rcpt,
      subject: String(subject || ""),
      html: source,
      ...config.emailOptions,
    });

    return res.send("OK: " + info.response);
  }

  return res.sendStatus(400);
};
