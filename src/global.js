'use strict';
global.nconf = require('nconf');
global.path = require("path");
nconf.argv().file({
    file: path.join(__dirname, '../config.json')
});
global.redis = require("redis");
global.redis_conf = nconf.get("redis_conf");
global._ = require('lodash');

var bluebird = require('bluebird');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);
global.redisClient = redis.createClient(redis_conf.port, redis_conf.addr.wisp);
