"use strict";

var nconf = require('nconf'),
    path = require("path");

    nconf.argv().file({
        file: path.join(__dirname, '../config.json')
    });

var redis = require("redis"),
    Remarkable = require("remarkable"),
    async = require("async"),
    redis_conf = nconf.get("redis_conf"),
    redisClient = redis.createClient(redis_conf.port, redis_conf.addr.p),
    md_conf = nconf.get("markdown_conf") || {},
    md_parser = null,
    cids = redis_conf.category_id,
    utils = {};

    function test(func, next){
        func(function(err, result){
            console.log(err, result);
            next(err, result);
        });
    }

    utils.getMdSettings = function(next){
        redisClient.hgetall('settings:markdown', next);
    }

    utils.getAllTidsByCids = function(next){
        var tids = [],
            asyncQueue = [];

        cids.forEach(function(cid){
            var query = "cid:" + cid + ":tids";

            asyncQueue.push(function(next){
                redisClient.zrange(query, 0, -1, function(err, result){
                    if(err) next(err);
                    tids = tids.concat(result);
                    next();
                });
            });
        });

        async.parallel(asyncQueue, function(err){
            next(err, tids);
        })
    }

    utils.getAllTids = function(next){
        var set = "topics:tid";
        redisClient.zrange(set, 0, -1, next);
    }

    utils.getAllNotRemovedTids = function(next){
        var set = "topics:recent";
        redisClient.zrange(set, 0, -1, next);
    }

    utils.getTopicField = function(tid, field, next){
        redisClient.hget("topic:" + tid, field, next);
    }

    utils.getPostField = function(pid, field, next){
        redisClient.hget("post:" + pid, field, next);
    }

    utils.setPostField = function(obj, field, next){
        redisClient.hset("post:" + obj.pid, field, obj.value, next);
    }

    utils.getPostsField = function(pids, field, next){
        var asyncQueue = [],
            fieldValues = [];

        pids.forEach(function(pid){
            asyncQueue.push(function(next){
                utils.getPostField(pid, field, function(err, res){
                    if(err) return next(err);
                    fieldValues.push({
                        pid: pid,
                        value: res
                    });
                    next();
                });
            });
        });

        async.parallel(asyncQueue, function(err){
            if(err) return next(err);
            next(null, fieldValues);
        });
    }

    utils.setPostsField = function(objs, field, next){
        var asyncQueue = [];

        objs.forEach(function(obj){
            asyncQueue.push(function(next){
                utils.setPostField(obj, field, next);
            });
        });

        async.parallel(asyncQueue, next);
    }

    utils.getAllPids = function(tids, next){
        var asyncQueue = [],
            pids = [];

        tids.forEach(function(tid){
            asyncQueue.push(function(next){
                async.parallel([
                    function(next){
                        utils.getTopicField(tid, "mainPid", function(err, res){
                            if(err) return next(err);
                            pids.push(res);
                            next();
                        })
                    },
                    function(next){
                        var query = "tid:" + tid + ":posts";
                        redisClient.zrange(query, 0, -1, function(err, res){
                            if(err) return next(err);
                            pids = pids.concat(res);
                            next();
                        });
                    }], next);
            });
        });

        async.parallel(asyncQueue, function(err, result){
            if(err) return next(err);
            next(null, pids);
        });
    }

    utils.renderWithMarkdown = function(str, next){
        if(!md_parser){
            var config = {};
            utils.getMdSettings(function(err, options){
                options = options || {};
                for(var field in md_conf.defaults) {
                    // If not set in config (nil)
                    if (!options.hasOwnProperty(field)) {
                        config[field] = md_conf.defaults[field];
                    } else {
                        if (field !== 'langPrefix' && field !== 'highlightTheme' && field !== 'headerPrefix') {
                            config[field] = options[field] === 'on' ? true : false;
                        } else {
                            config[field] = options[field];
                        }
                    }
                }
                delete config.highlight;
                console.log(options);
                md_parser = new Remarkable(config);
                next(null, md_parser.render(str));
            });
        }else{
            next(null, md_parser.render(str));
        }
    }

    utils.run = function(next){
        //test(utils.getMdSettings, next);
        //test(utils.getAllTidsByCids, next);
        async.waterfall([
            utils.getAllTidsByCids,
            utils.getAllPids,
            function getAllContents(results, next){
                utils.getPostsField(results, "content", next);
            },
            function renderContents(results, next){
                // results.forEach(function(res, index){
                //     results[index].value = res.value + "加个后缀";
                // });
                // utils.setPostsField(results, "content", next);
                var asyncQueue = [];
                results.forEach(function(obj, index){
                    asyncQueue.push(function(next){
                        utils.renderWithMarkdown(obj.value, function(err, renderedStr){
                            results[index].value = renderedStr;
                            console.log(renderedStr);
                            next();
                        });
                    });
                });
                async.parallel(asyncQueue, function(){
                    utils.setPostsField(results, "content", next);
                });

            }],
            function(err, result){
                //console.log(err, result);
                return next();
            }
        );
    }

    utils.createAllTopicsSortedBySet = function(set, next){
        var count = 0;
        async.waterfall([
            function(next){
                utils.getAllNotRemovedTids(next);
            },
            function(tids, next){
                function modifyAndCreate(tid, next){
                    async.waterfall([
                        function(next){
                            utils.getTopicField(tid, set, next);
                        },
                        function(lpt, next){
                            redisClient.zadd('topics:' + set, lpt, tid, next);
                            ++count;
                        }
                    ], function(err, result){
                        if(err){
                            console.log(err);
                        }else{
                            next(null, result);
                        }
                    });
                }
                var asyncQueue = [];
                tids.forEach(function(val, idx){
                    asyncQueue.push(function(next){
                        modifyAndCreate(val, next);
                    });
                });

                async.parallel(asyncQueue, next);
            }
        ], function(err, result){
            console.log('createAllTopicsSortedBySet: ' + set +' DONE', 'created: ' + count + ' keys.');
        });
    }

    utils.createAllTopicsSortedByVotes = function(next){
        var count = 0;
        async.waterfall([
            function(next){
                utils.getAllNotRemovedTids(next);
            },
            function(tids, next){
                function calcVotesPerTopic(tid, next){
                    var total = 0;
                    async.parallel({
                        mainPidVotes: function(next){
                            async.waterfall([
                                function(next){
                                    utils.getTopicField(tid, 'mainPid', next);
                                },
                                function(mainPid, next){
                                    redisClient.hget('post:' + mainPid, 'votes', next);
                                },
                                function(votes, next){
                                    var result = parseInt(votes);
                                    next(null, isNaN(result) ? 0 : result);
                                }
                            ], next);
                        },
                        otherPostsVotes: function(next){
                            async.waterfall([
                                function(next){
                                    redisClient.zrange('tid:' + tid + ':posts:votes', 0, -1, 'withscores', next);
                                },
                                function(results, next){
                                    var sum = 0;
                                    results.forEach(function(val, idx){
                                        if(idx % 2){
                                            sum += parseInt(val);
                                        }
                                    });
                                    next(null, sum);
                                }
                            ], next);
                        }
                    }, function(err, results){
                        total = ( parseInt(results.mainPidVotes) + results.otherPostsVotes );
                        redisClient.zadd('topics:votes', total, tid, function(err, result){
                            if(err){
                                console.log(err);
                            }else{
                                next(null, result)
                            }
                        });
                        count ++;
                    });

                }
                var asyncQueue = [];
                tids.forEach(function(val, idx){
                    asyncQueue.push(function(next){
                        calcVotesPerTopic(val, next);
                    });
                });

                async.parallel(asyncQueue, next);
            }
        ], function(err, result){
            console.log('createAllTopicsSortedByVotes DONE', 'created: ' + count + ' keys.');
        });
    }

module.exports = utils;
