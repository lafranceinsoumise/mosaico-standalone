'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');

var mailer = nodemailer.createTransport(config.emailTransport);

module.exports = (req, res, next) => {
  var source = req.body.html;

  if (req.body.action === 'download') {
    res.setHeader('Content-disposition', 'attachment; filename=' + req.body.filename);
    res.setHeader('Content-type', 'text/html');
    res.write(source);
    return res.end();
  }

  if (req.body.action === 'email') {
    var mailOptions = Object.assign({
      to: req.body.rcpt, // list of receivers
      subject: req.body.subject, // Subject line
      html: source // html body
    }, config.emailOptions);

    mailer.sendMail(mailOptions, (err, info) => {
      if (err) return next(err);

      return res.send('OK: '+info.response);
    });
  }
};
