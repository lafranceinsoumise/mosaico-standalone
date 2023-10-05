import nodemailer from "nodemailer";
import { htmlToText } from "nodemailer-html-to-text";

import config from "../config.js";

const mailer = nodemailer.createTransport(config.emailTransport);
mailer.use("compile", htmlToText());

export default (req, res, next) => {
  const source = req.body.html;

  if (req.body.action === "download") {
    res.setHeader(
      "Content-disposition",
      "attachment; filename=" + req.body.filename,
    );
    res.setHeader("Content-type", "text/html");
    res.write(source);
    return res.end();
  }

  if (req.body.action === "email") {
    const mailOptions = Object.assign(
      {
        to: req.body.rcpt, // list of receivers
        subject: req.body.subject, // Subject line
        html: source, // html body
      },
      config.emailOptions,
    );

    mailer.sendMail(mailOptions, (err, info) => {
      if (err) return next(err);

      return res.send("OK: " + info.response);
    });
  }
};
