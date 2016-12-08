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

  describe('GET /emails/test.html', function() {
    it('should serve raw content', function(done) {
      request(app)
        .get('/emails/test.html')
        .expect('[EMAIL] test [VARIABLE]\n', done)
      ;
    });
  });

  describe('POST /emails/test.html', function() {
    it('should replace merge tags', function(done) {
      request(app)
        .post('/emails/test.html')
        .type('form')
        .send({EMAIL: 'test@example.com'})
        .send({VARIABLE: 'variable'})
        .expect('test@example.com test variable\n', done)
      ;
    });
  });
});
