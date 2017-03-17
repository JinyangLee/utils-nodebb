'use strict';
global.nconf = require('nconf');
global.path = require("path");
nconf.argv().file({
    file: path.join(__dirname, '../config.json')
});
global.redis = require("redis");
global.async = require("async");
global.redis_conf = nconf.get("redis_conf");
global._ = require('lodash');
global.redisClient = redis.createClient(redis_conf.port, redis_conf.addr.h);
