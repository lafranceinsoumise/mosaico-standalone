# Standalone Mosaico

This project aims at providing an environment for using [Mosaico](mosaico.io).

# Install and run
```bash
git clone git@github.com:guilro/mosaico-standalone.git
cd mosaico-standalone
npm install
npm start
```

You need a template to start a new mail. Templates are in `templates` directory. Pass the template path to the editor after the hash.

`http://localhost:3000/editor#/templates/dist/versafix-1/template-versafix-1.html`

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
