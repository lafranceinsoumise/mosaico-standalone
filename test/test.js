/* eslint-env mocha */
"use strict";

import request from "supertest";

import app from "../server/index.js";

describe("Request", function () {
  describe("GET /", function () {
    it("should redirect to /storage/list/1", function (done) {
      request(app)
        .get("/")
        .expect(302)
        .expect("Location", "/storage/list/1", done);
    });
  });

  describe("Storage routes", function () {
    it("should redirect /storage/list to /storage/list/1", function (done) {
      request(app)
        .get("/storage/list")
        .expect(302)
        .expect("Location", "/storage/list/1", done);
    });

    it("should redirect /storage/list with query params", function (done) {
      request(app)
        .get("/storage/list?q=test")
        .expect(302)
        .expect("Location", "/storage/list/1?q=test", done);
    });
  });

  describe("Authentication", function () {
    it("should allow access to login page", function (done) {
      request(app).get("/login").expect(200, done);
    });

    it("should authenticate valid user", function (done) {
      request(app)
        .post("/login")
        .send({ username: "admin", password: "password" })
        .expect(302)
        .expect("Location", "/storage/list/1", done);
    });

    it("should reject invalid credentials", function (done) {
      request(app)
        .post("/login")
        .send({ username: "admin", password: "wrong" })
        .expect(302)
        .expect("Location", "/login", done);
    });
  });

  describe("Static assets", function () {
    it("should serve mosaico static files", function (done) {
      request(app).get("/mosaico/mosaico.min.js").expect(200, done);
    });

    it("should serve template files", function (done) {
      request(app)
        .get("/templates/dist/tedc15/template-tedc15.html")
        .expect(200, done);
    });
  });

  describe("API endpoints", function () {
    let agent = request.agent(app);

    before(function (done) {
      // Authenticate the agent
      agent
        .post("/login")
        .send({ username: "admin", password: "password" })
        .end(done);
    });

    it("should allow authenticated access to storage list", function (done) {
      agent.get("/storage/list/1").expect(200, done);
    });

    it("should handle search queries", function (done) {
      agent.get("/storage/list/1?q=test").expect(200, done);
    });

    it("should handle pagination", function (done) {
      agent.get("/storage/list/2").expect(200, done);
    });
  });
});
