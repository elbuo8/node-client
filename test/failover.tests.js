var _         = require('lodash');
var assert    = require('assert');
var protocol  = require('../lib/protocol');
var LimitdClient = require('../');
var MockServer   = require('./MockServer');
var async        = require('async');

var PORT = 9231;

describe('limitd client failover', function() {

  var client;
  var servers = [];

  // start three services
  beforeEach((done) => {
    servers = [];
    async.forEachSeries(_.range(3), (i, cb) => {
      var server = new MockServer({ port: PORT + i });
      server.listen(cb);
      servers.push(server);
    }, (err) => {
      if (err) { return done(err); }
      var config = {
        hosts: _.map(servers, (server, index) => {
          return 'limitd://localhost:' + (PORT + index);
        }),
        timeout: 3000
      };

      client = new LimitdClient(config);
      client.once('connect', () => {
        setTimeout(done, 100);
      });
    });
  });

  // close all services
  afterEach((done) => {
    client.disconnect();
    async.forEach(servers, (s, cb) => s.close(cb), done);
  });

  it('should connect to first service', function(done) {

    servers[0].once('request', function (request) {
      assert.equal(typeof request.id, 'string');
      assert.equal(request.method, protocol.Request.Method.TAKE);
      assert.equal(request.type, 'ip');
      assert.equal(request.count, 1);
      assert.equal(request.all, false);
      done();
    });

    client.take('ip', '191.12.23.32', 1);
  });

  it('should connect to second service when first is down', function(done) {

    servers[1].once('request', function (request) {
      assert.equal(typeof request.id, 'string');
      assert.equal(request.method, protocol.Request.Method.TAKE);
      assert.equal(request.type, 'ip');
      assert.equal(request.count, 1);
      assert.equal(request.all, false);
      done();
    });

    // stop first service
    servers[0].close(function (err) {
      if (err) { return done(err); }
      // invoke service
      setTimeout(() => {
        client.take('ip', '191.12.23.32', 1, err => done(err));
      }, 1000);
    });
  });

  it('should connect to first service after it is back', function(done) {

    servers[0].once('request', function (request) {
      assert.equal(typeof request.id, 'string');
      assert.equal(request.method, protocol.Request.Method.TAKE);
      assert.equal(request.type, 'ip');
      assert.equal(request.count, 1);
      assert.equal(request.all, false);
      done();
    });

    // stop first service
    servers[0].close(function (err) {
      assert.ok(!err);

      // wait a second
      setTimeout(function() {

        // restart first service
        servers[0].listen(function (err) {
          assert.ok(!err);

          // invoke service
          setTimeout(client.take.bind(client), 1000, 'ip', '191.12.23.32', 1);
        });
      }, 1000);
    });
  });

});
