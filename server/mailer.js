import { convert } from "html-to-text";
import nodemailer from "nodemailer";

import config from "../config.js";

const mailer = nodemailer.createTransport(config.emailTransport);

mailer.use("compile", (mail, callback) => {
  if (mail.data.html && !mail.data.text) {
    mail.data.text = convert(String(mail.data.html));
  }
  callback();
});

export default mailer;
