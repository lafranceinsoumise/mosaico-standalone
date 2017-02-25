# Standalone Mosaico

This project aims at providing an environment for using [Mosaico](https://mosaico.io).

It features :

* Email composition with [Mosaico](https://mosaico.io)
* Template management (create, save, edit)
* Sending to test mailbox
* &laquo;View in browser&raquo; feature
* Merge tags replacement

# Install and run

You need NodeJS >= 7.6, Imagemagick and a local Redis server to make it run. The local Redis server can be launch
using the docker-compose file provided at the root of this project.

```bash
git clone git@github.com:guilro/mosaico-standalone.git
cd mosaico-standalone
npm install
cp config.js.dist config.js # edit this file
npm start
```

# Configuration and usage

Configure SMTP, sending address and users in `config.json`. Each user has private access to its own emails.

Place custom templates in `templates/custom`. They will appear in the creation form.

## Merge tag

You can send a `GET` or `POST` requests to the email URL `/emails/[uuid].html` with string parameters encoded in the body. You will get the email HTML with merge tags replaced.

To get the email URL by clicking on `View` and copy the email from the browser.

You can use this feature from other services to use Mosaico as an email templater&nbsp;!

# Changelog

* 0.2.0 :
    * security fixes (XSS injection)
    * allow all methods for merge tags
    * add pagination, duplicate and delete feature
    * BREAKING: require node>=7.6.0
* 0.1.0 : Mosaico version 0.15.0
