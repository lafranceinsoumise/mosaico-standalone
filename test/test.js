/* eslint-env mocha */
"use strict";

import request from "supertest";

import app from "../server/index.js";

describe("Request", function () {
  describe("GET /", function () {
    it("should redirect to /storage/list", function (done) {
      request(app)
        .get("/")
        .expect(302)
        .expect("Location", "/storage/list", done);
    });
  });
});
