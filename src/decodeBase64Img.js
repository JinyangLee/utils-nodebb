'use strict';

require('./global');
var fs = require('fs'),
    crypto = require('crypto'),
    md5 = data => crypto.createHash('md5').update(data).digest('hex');

const IMAGE_CONTENT_REG = /\<img [^\>]*src=\"data:image\/(png|jpg|jpeg|gif)\;base64\,([^\>\"\']*)[^\>]*\>/i;
const IMAGE_CONTENT_REG_GLOBAL = /\<img [^\>]*src=\"data:image\/(png|jpg|jpeg|gif)\;base64\,([^\>\"\']*)[^\>]*\>/ig;
const IMAGE_CONTENT_SRC_REG = /src=\"data:image\/(png|jpg|jpeg|gif)\;base64\,([^\>\"\']*)\"/i;
const domain = "huntress";

redisClient.zrange('posts:pid', 0, -1, (err, pids) => {
    // Promise.all(
    //     pids.map(pid => {
    //         return new Promise((resolve, reject) => {
    //             redisClient.hget(`post:${pid}`, 'content', (err, content) => {
    //                 processContent(content, pid)
    //                     .then(() => resolve());
    //             });
    //         });
    //     })
    // ).then(() => console.log('SUCC!'));
    sequence(
        pids.map(pid => {
            return new Promise((resolve, reject) => {
                redisClient.hget(`post:${pid}`, 'content', (err, content) => {
                    processContent(content, pid)
                        .then(() => resolve());
                });
            });
        })
    ).then(() => console.log('SUCC!'));
});

const sequence = async tasks => {
    var res = [];

    while (tasks.length) {
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
        await tasks.shift()().then(Array.prototype.push.bind(res));
    }

    return res;
};

async function processContent(content, pid) {
    var matches = content.match(IMAGE_CONTENT_REG_GLOBAL);
    if (!matches) return;

    for (var i = 0; i < matches.length; ++i) {
        await processContentItem(matches[i], pid);
    }

    return new Promise((resolve, reject) => {
        redisClient.hset(`post:${pid}`, 'content', content, (err) => {
            if (err) {
                console.warn(`[Warning] write redis failed for post ${pid}`);
                reject(err);
            }else{
                console.log(`[Succ] write redis sccessed for post ${pid}`);
                resolve(); 
            }
        });
    });


    function mkdir(str){
        !fs.existsSync(str) && fs.mkdirSync(str);
    } 

    function processContentItem(outerHTML, pid) {
        return new Promise((resolve) => {
            var match = outerHTML.match(IMAGE_CONTENT_REG),
                src = outerHTML.match(IMAGE_CONTENT_SRC_REG)[0],
                postFix = match[1],
                data = match[2],
                dataBuf = Buffer.from(data),
                md5Hash = md5(dataBuf),
                sharding = md5Hash.slice(-2),
                fileName = `${md5Hash}.${postFix}`;
            
            //console.log(outerHTML);
            //console.log(src);
            //console.log(postFix);
            //console.log(data);
            //console.log(fileName);
            //content.replace(outerHTML, '//static.fuck.com/upload/b569c5602d15120751120af5a3691375.png');

            content = content.replace(src, `src="//static.${domain}.com/upload/${sharding}/${fileName}"`);
            mkdir(`/Users/lithium/upload/${sharding}/`);
            
            fs.writeFile(`/Users/lithium/upload/${sharding}/${fileName}`, Buffer.from(data, 'base64'), err => {
                if (err) {
                    //console.log(err);
                    console.warn(`[Warning] writeFile failed for post ${pid}`);
                }
                console.log(`[Succ] writeFile sccessed for post ${pid}, image src: src="//static.${domain}.com/upload/${sharding}/${fileName}"`);
                resolve();
            });
        });
    }

}