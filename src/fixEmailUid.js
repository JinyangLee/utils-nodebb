"use strict";

var Fix = {};

Fix.getUids = () => {
    return new Promise((resolve, reject) => {
        //From "user:joindate"
        // redisClient.zrange("users:joindate", 0, -1, (err, result) => {
        //     console.log(`Users total got: ${result.length}`);
        //     err ? reject(err) : resolve(result);
        // });

        //From username:uid
        redisClient.hgetall("username:uid", (err, results) => {
            if(err) {
                reject(err);
            }
            var uids = [];
            for(var name in results){
                uids.push(results[ name ]);
            }
            resolve(uids);
        });
    });
}

Fix.getEmailUidFromRqstieData = () => {
    return new Promise((resolve, reject) => {
        //From username:uid, get username from JSON file provided by rqsite
        var usernameEmail = require('/Users/lithium/Downloads/email_username'),
            names = usernameEmail.map(item => item.full_name),
            emails = usernameEmail.map(item => item.email);

        console.log(`total items: ${usernameEmail.length}`);
        redisClient.hmget('username:uid', names, (err, results) => {
            if(err) reject(err);
            var count = results.length,
                uid_email = [];

            results.forEach((uid, index) => {
                if( !uid ) {
                    count --;
                    console.log(`user not found in nodebb, email: ${emails[ index ]}, name: ${names[ index ]}`);
                }else {
                    uid_email.push([ emails[ index ], uid ]);
                }
            });
            console.log(`${count} uids found !`);
            console.log(uid_email, uid_email.length);
            resolve(uid_email);
        });
    });
}

Fix.getEmailUid = uids => {
    var taskQueue = uids.map(uid =>
        new Promise(function(resolve, reject) {
            redisClient.hget(`user:${uid}`, 'email', (err, email) => {
                if(err) {
                    reject(err);
                }else {
                    if(!email || email === '') console.log(`empty email for user ${uid}`)
                    resolve([email, uid]);
                }
            });
        })
    )
    return Promise.all(taskQueue)
            .then(values => {
                console.log(`Emails total got: ${values.length}`);
                return values;
            });
}

Fix.setEmailUid = values => {
    return new Promise((resolve, reject) => {
        redisClient.hmset('email:uid', values.reduce((prev, cur) => prev.concat(cur)), err => {
            console.log(`Emails total set: ${values.length}`);
            err ? reject(err) : resolve();
        });
    });
}

Fix.printDuplication = values => {
    var map = {};
    values.forEach(val => {
        if( map[ val[0] ] ) {
            console.log(`Duplication email: ${val[0]}, userId: ${map[ val[0] ]} and ${val[1]}`);
            Fix.compareDuplication([ map[ val[0] ],  val[1] ]);
        }else{
            map[ val[0] ] = val[1];
        }
    });
    return values;
}

Fix.compareDuplication = (uids) => {
    var keysToShow = ['email', 'uid', 'username', 'fullname', 'joindate.date', 'lastonline.date', 'lastposttime.date', 'topiccount', 'postcount'];

    function getInfo(uid) {
        return new Promise((resolve, reject) => {
            redisClient.hgetall(`user:${uid}`, (err, data) => {
                err ? reject(err) : resolve(data);
            })
        });
    }

    return Promise
            .all(uids.map(uid => getInfo(uid)))
            .then(results => {
                results.forEach(userData => {
                    keysToShow.forEach(key => {
                        var isDate = false,
                            key = key.split('.'),
                            value;

                        if( key.length > 1 ) isDate = true;
                        value = isDate ? new Date(parseInt(userData[ key[0] ])).toLocaleDateString() : userData[ key[0] ];
                        console.log(`${key[0]}: ${value}`);
                    });
                    console.log(`-----------`);
                });
                console.log(`***************************`);
            })
}

module.exports = Fix;
