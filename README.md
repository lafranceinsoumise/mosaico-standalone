# Standalone Mosaico

This project aims at providing an environment for using [Mosaico](https://mosaico.io).

It features :

* Email composition with [Mosaico](https://mosaico.io)
* Template management (create, save, edit)
* Sending to test mailbox
* &laquo;View in browser&raquo; feature
* Merge tags replacement

# Install and run

You need NodeJS >= 22 and a Redis server. A local Redis server can be launched
using the docker-compose file provided at the root of this project.

```bash
git clone git@github.com:lafranceinsoumise/mosaico-standalone.git
cd mosaico-standalone
npm install
cp config.js.dist config.js # edit this file
docker compose up -d
SESSION_SECRET=$(openssl rand -base64 48) npm start
```

Environment variables:

* `SESSION_SECRET`: session secret, if not set directly in `config.js` (required)
* `REDIS_URL`: Redis connection URL (default `redis://localhost:6379`)
* `DATABASE_PATH`: SQLite database file (default `./database.sqlite`)
* `PORT`: HTTP port (default `3000`), the server only listens on `127.0.0.1`

The app is meant to run behind a reverse proxy which must forward the `Host`
header (or `X-Forwarded-Host`) and `X-Forwarded-Proto`. Set `https: true` in
`config.js` when served over HTTPS.

# Configuration and usage

Configure SMTP, sending address and users in `config.js`. Each user has private access to its own emails.

Passwords can be stored hashed: run `npm run hash-password` and paste the output
in the `password` field.

Place custom templates in `templates/custom`. They will appear in the creation form.

## Merge tag

You can send a `GET` or `POST` requests to the email URL `/emails/[uuid].html` with string parameters encoded in the body. You will get the email HTML with merge tags replaced.

To get the email URL by clicking on `View` and copy the email from the browser.

You can use this feature from other services to use Mosaico as an email templater&nbsp;!

# Changelog

* 0.4.0 :
    * security fixes: per-user access control on emails and send logs, image
      uploads restricted to real images, no more remote fetching in `/img`,
      sandboxed email and upload pages, CSRF protection, login rate limiting,
      hashed passwords support, hardened session cookie
    * replace ImageMagick (`gm`) and `jquery-file-upload-middleware` with `sharp` and `multer`
    * update to Express 5 and up-to-date dependencies
    * BREAKING: require node>=22, logout is now a POST, `/emails/[uuid].json` requires authentication,
      `/img` only processes images from `uploads/` and `templates/`
* 0.3.0 :
    * update deps
* 0.2.0 :
    * security fixes (XSS injection)
    * allow all methods for merge tags
    * add pagination, duplicate and delete feature
    * BREAKING: require node>=7.6.0
* 0.1.0 : Mosaico version 0.15.0
