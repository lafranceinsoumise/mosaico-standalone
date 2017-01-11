# Standalone Mosaico

This project aims at providing an environment for using [Mosaico](mosaico.io).

# Install and run

You need Imagemagick and a local Redis server to make it run.

```bash
git clone git@github.com:guilro/mosaico-standalone.git
cd mosaico-standalone
npm install
cp config.js.dist config.js # edit this file
npm start
```

# Backend

The backend is very basic, based on the development backend of Mosaico. It handles image uploads.

# Todo

* test emails
* download emails
* authentication and user management
* save emails on server
* view emails in browser

# Changelog

* 0.1.0 : Mosaico version 0.15.0
