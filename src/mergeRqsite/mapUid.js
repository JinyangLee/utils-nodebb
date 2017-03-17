"use strict";

var MapUid = {},

    //data loaded from json, provided by Jeffery
    jsonData,

    //store all data loaded from nodebb redis
    keyInfo = {},
    keyInstances = [],

    //map from nodebb uid to nodebb email, notice that mutiple uid may point to same email
    nodebbUidEmail = {},

    //map from email to rqsite-uid
    emailUid = {},

    //map from nodebb-uid to rqsite-uid
    uidMap = {};
    
function getAllNodebbUserKey() {
    var pattern = /^user:[0-9]+$/i;

    return new Promise((resolve, reject) => {
        redisClient.keys('user:*', (err, results) => {
            if (err) return reject(err);
            resolve(results.filter(k => k.match(pattern)));
        });
    });
}

MapUid.getJsonData = () => {
    jsonData = require('/Users/lithium/Downloads/email_username_userid');
    for (var i = 0; i < jsonData.length; i++) {
        emailUid[jsonData[i].email] = jsonData[i].user_id;
    }
    return jsonData;
};

MapUid.getUidMapping = () => {
    return getAllNodebbUserKey().then(getAllNodebbUserIdEmail)
                                .then(buildUidMapping);


    function getAllNodebbUserIdEmail(keys) {
        return Promise.all(keys.map(key => {
            return new Promise((resolve, reject) => {
                redisClient.hmget(key, ["uid", "email"], (err, results) => {
                    if(err) return reject(err);
                    nodebbUidEmail[results[0]] = results[1].toLowerCase();
                    resolve();
                });
            });
        }));
    }

    function buildUidMapping() {
        for (var nodebbUid in nodebbUidEmail) {
            var email = nodebbUidEmail[nodebbUid],
                rqsiteUid = emailUid[email];
            
            uidMap[nodebbUid] = rqsiteUid;
        }
    }
};

MapUid.getAllKeys = () => {
    return new Promise((resolve, reject) => {
        redisClient.keys('*', (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results);
        })
    });
}

MapUid.getKeyInfo = (key) => {
    if (key && key.map) { 
        return Promise.all(key.map(k => MapUid.getKeyInfo(k)));
    }
    if (key) {
        keyInfo[key] = new RedisKeyInstance(key);
        return keyInfo[key].init();
    }
    throw new Error('invalid key: ', key);    
}

MapUid.wash = () => {
    for (var key in keyInfo) {
        keyInfo[key].washKey();
        keyInfo[key].washContent();
    }
}

MapUid.overwriteDB = () => {
    function delOriginalKeys() {
        return Promise.all(keyInstances.map(instance => instance.delKey()));
    }
    
    function writeNewKeys() {
        return Promise.all(keyInstances.map(instance => instance.overwriteContent()));
    }

    return delOriginalKeys().then(writeNewKeys);
}

MapUid.replaceUserslugWithRqsiteUid = () => {
    function replaceSlug(key) {
        return new Promise((resolve, reject) => {
            redisClient.hgetall(key, (err, result) => {
                if(err) return reject(err);
                redisClient.hset(key, 'userslug', result.uid, (err) => {
                    if(err) return reject(err);
                    resolve();
                });
            });
        });
    }
    return getAllNodebbUserKey()
        .then(keys => Promise.all(keys.map(key => replaceSlug(key))));
}

function RedisKeyInstance (key) {
    this.key = key;
    this.id = ++RedisKeyInstance.instanceCount;
    this.needWashVal = false;

    keyInstances.push(this);
}

RedisKeyInstance.instanceCount = 0;

RedisKeyInstance.prototype.needWash = function(need) {
    if (need === undefined) return this.needWashVal;

    if (need) {
        if (!this.newKey) {
            this.newKey = this.key;
            //console.log('set newKey: ', this.newKey);
        }

        if (!this.newContent) {
            this.newContent = this.content;
            //console.log('set newContent: ', this.newKey);
        }
    }
    this.needWashVal = need;
}

RedisKeyInstance.prototype.init = function () {
    var self = this;

    return initType()
            .then(initContent);
    
    function initType () {
        return new Promise((resolve, reject) => {
            redisClient.type(self.key, (err, result) => {
                if (err) {
                    return reject(err);
                }
                self.type = result;
                resolve(result);
            });
        }); 
    }

    function initContent (type) {
        return new Promise((resolve, reject) => {
            function callback(err, result) {
                if (err) {
                    reject(err);
                }
                self.content = result;
                resolve();
            }
            switch (type) {
                case 'hash':
                    redisClient.hgetall(self.key, callback); 
                    break;
                case 'zset':
                    redisClient.zrange(self.key, 0, -1, 'WITHSCORES', callback);
                    break;
                case 'set':
                    redisClient.smembers(self.key, callback);
                    break;
                case 'string':
                    redisClient.get(self.key, callback);
                    break;
                default:
                    reject('unknown key type: ' + type);
                    break;
            }
        });
    }
}

RedisKeyInstance.prototype.printInfo = function() {
    var self = this;
    console.log("print info !!!");
    console.log(self.key, self.newKey, self.content, self.newContent);
}

RedisKeyInstance.prototype.getRqsiteUid = function (nodebbUid) {
    if (!uidMap[nodebbUid]) {
        //throw new Error('invalid nodebbUid ' + nodebbUid + ' : can\'t mapping to rqsiteUid');
        console.log('invalid nodebbUid ' + nodebbUid + ' : can\'t mapping to rqsiteUid, key: ' + this.key);
        return undefined;
    }

    return uidMap[nodebbUid]; 
}

RedisKeyInstance.prototype.washKey = function () {
    var pattern = /(user|uid|follow|followers|following):([0-9]+)/i,
        match = this.key.match(pattern);
    
    if (!match || !match.length) {
        return;
    }

    if (match.length !== 3) console.log('abnormal match: ', match);

    var oldUid = match[2],
        newUid = uidMap[oldUid];
    if (!newUid) {
        //throw new Error('unknown uid: ' + oldUid);
        console.log('unknown uid: ' + oldUid + '  : ' + newUid);
    }
    this.newKey = this.key.replace(oldUid, newUid);
    this.needWash(true);
}

RedisKeyInstance.prototype.washContent = function () {
    var self = this;

    if (!this.content) {
        console.log('content not initied, key: ' + this.key);
    }

    function matchAny (str, regs) {
        for (var i = 0; i < regs.length; i++) {
            if (str.match(regs[i])) return true;
        }
        return false;
    }
    
    var methods = {
        hash: () => {
            //fields: uid
            var pattern1 = /^(post|user|event|topic|pt):([0-9]+)$/i,

                //fields: from, nid
                pattern2 = /^notifications:.*/i,

                //fields: all
                pattern3 = /^[a-z]+:uid$/i,

                ignorePattern = /^(us:perm.*|group:cid:[0-9]+:privileges:groups:.*|user:[0-9]+:settings$)/i;
            
           // if (!this.key.match(pattern1) && !this.key.match(pattern2) && !this.key.match(pattern3) && !this.key.match(ignorePattern)) {
           //     console.log(this.key);
           // }
            if (self.key.match(pattern1)) {

                self.needWash(true);
                self.newContent = _.assign({}, self.content);
                self.newContent.uid && ( self.newContent.uid = self.getRqsiteUid(self.newContent.uid) )

            } else if (self.key.match(pattern2)) {
                self.needWash(true);
                self.newContent = _.assign({}, self.content);

                var from = self.newContent.from,
                    nid = self.newContent.nid;
                
                if (from) {
                    if (!self.newContent.from) console.log(self.key);
                    self.newContent.from = self.getRqsiteUid(from);
                }
                if (nid) {
                    var match = nid.match(/(:|^)uid:([0-9]+)(:|$)/i);
                    if (match && match[2]){
                        self.newContent.nid = nid.replace('uid:' + match[2], 'uid:' + self.getRqsiteUid(match[2]));
                    }
                }
            } else if (this.key.match(pattern3)) {
                self.needWash(true);
                self.newContent = _.assign({}, self.content);

                for(var item in self.newContent) {
                    self.newContent[item] = self.getRqsiteUid(self.newContent[item]);
                }
            }
        },
        zset: () => {
            var ignorePatterns = [
                /^uid:[0-9]+:(ip|tids_read|topics|favourites|followed_tids|posts|upvote|pts)$/i,
                /^cid:[0-9]+:(tids|pids|tids:(posts|votes)|uid:[0-9]+:tids)$/i,
                /^tid:[0-9]+:posts($|:votes$)/i,
                /^group:cid:[0-9]+:privileges:groups:topics:(reply|create):members$/i,
                /^group:cid:[0-9]+:privileges:groups:(read|find):members$/i,
                /^groups:createtime$/i,
                /^(topics|pts):(views|tid|votes|lastposttime|postcount|posts|recent)$/i,
                /^analytics:.*$/i,
                /^ip:recent$/i,
                /^events:time$/i,
                /^posts:pid$/i,
                /^categories:cid$/i,
                /null/i
            ],

            //need to replace total value as uid.
            pattern1 = [
                /^(followers|following):[0-9]+$/i,
                /^users:(joindate|online|reputation|postcount)$/i,
                /^group:(administrators|registered-users):members$/i,
                /^ip:.*:uid$/i
            ],

            //need to replace pattern like uid:[0-9]+
            pattern2 = /^(notifications|uid:[0-9]+:notifications:(read|unread))$/i

            if (matchAny(self.key, ignorePatterns)) return;

            if (matchAny(self.key, pattern1)) {
                self.needWash(true);
                self.newContent = self.content.concat();

                for (var i = 0; i < self.newContent.length; i+=2) {
                    self.newContent[i] = self.getRqsiteUid(self.newContent[i]);
                }                
            } else if (self.key.match(pattern2)) {
                self.needWash(true);
                self.newContent = self.content.concat();

                for (var j = 0; j < self.newContent.length; j+=2) {
                    var nodebbUid = self.newContent[j].match(/uid:([0-9]+)/i)[1];
                    self.newContent[j] = self.newContent[j].replace(/uid:[0-9]+/i, 'uid:' + self.getRqsiteUid(nodebbUid));
                }
            }
        },
        set: () => {
            //replace all members as uid.
            var patterns = [
                /^tid:[0-9]+:followers$/i,
                /^pid:[0-9]+:(users_favourited|upvote)$/i,
                /^cid:[0-9]+:read_by_uid$/i
            ];
            
            if (matchAny(self.key, patterns)) {
                self.needWash(true);
                self.newContent = self.content.map((val) => {
                    return self.getRqsiteUid(val);
                });
            }
        },
        string: () => {
            //nothing to do
            return;
        }
    }

    return methods[this.type] && methods[this.type]();
}

RedisKeyInstance.prototype.delKey = function() {
    var self = this;
    return new Promise((resolve, reject) => {
        if (!self.needWash()) return resolve();

        redisClient.del(this.key, (err) => {
            if (err) {
                throw new Error(err);
            }
            resolve();
        });
    });
}
RedisKeyInstance.prototype.overwriteContent = function() {
    var self = this,
        overwriteMethods = {
            hash: (callback) => {
                var arr = [];
                for (var i in self.newContent) {
                    arr.push(i, self.newContent[i]);
                }
                redisClient.hmset(self.newKey, arr, callback);
            },
            zset: (callback) => {
                // var scores = self.newContent.reduce((prev, cur, index) => {
                //     if (!(index % 2)) prev.push(cur); 
                //     return prev;
                // }, []),
                // values = self.newContent.reduce((prev, cur, index) => {
                //     if (index % 2) prev.push(cur); 
                //     return prev;
                // }, []);
                // var args = self.newContent.reduce((prev, cur, index) => {
                //     if (!(index % 2)) {
                //         prev.push([cur]);
                //     }else {
                //         prev[prev.length - 1].push(cur);
                //     }

                //     return prev;
                // }, [self.newKey]);
                var args = self.newContent.reduce((prev, cur, index)=> {
                     if (!(index % 2)) {
                        prev.push([cur]);
                    }else {
                        prev[prev.length - 1].push(parseInt(cur));
                    }
                    return prev;
                }, []);

                Promise.all(args.map(content => {
                    return new Promise((resolve, reject) => {
                        redisClient.zadd(self.newKey, content[1], content[0], (err) => {
                            if (err) {
                                console.log(self.newKey, content);
                                return reject(err);
                            }
                            resolve();
                        });
                    });
                })).then(() => {
                    callback(null);
                });
            },
            set: (callback) => {
                //redisClient.sadd(self.newKey, self.newContent, callback);
                Promise.all(self.newContent.map(content => {
                    return new Promise((resolve, reject) => {
                        redisClient.sadd(self.newKey, content, (err) => {
                            if (err) {
                                self.printInfo();
                                return reject(err);
                            }
                            resolve();
                        });
                    });
                })).then(() => {
                    callback(null);
                });

            },
            string: (callback) => {
                callback(null);
            }
        };
    return new Promise((resolve, reject) => {
        if (!self.needWash()) return resolve();

        self.type && overwriteMethods[self.type]((err) => {
            if(err) {
                self.printInfo();
                console.log(err);
                return reject(err);
            }
            resolve();
        }); 
    });
}
module.exports = MapUid;

