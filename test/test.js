/* eslint-env mocha */
'use strict';

const request = require('supertest');

const app = require('../server');

describe('Request', function() {
  describe('GET /', function() {
    it('should redirect to /storage/list', function(done) {
      request(app)
        .get('/')
        .expect(302)
        .expect('Location', '/storage/list', done)
      ;
    });
  });
});
