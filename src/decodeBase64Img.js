'use strict';

require('./global');
var fs = require('fs'),
    md5 = require('md5');

const IMAGE_CONTENT_REG = /\<img src=\"data:image\/(png|jpg|jpeg|gif)\;base64\,([^\>\"\']*)[^\>]*\>/i;
const IMAGE_CONTENT_REG_GLOBAL = /\<img src=\"data:image\/(png|jpg|jpeg|gif)\;base64\,([^\>\"\']*)[^\>]*\>/ig;
const IMAGE_CONTENT_SRC_REG = /src=\"data:image\/(png|jpg|jpeg|gif)\;base64\,([^\>\"\']*)\"/i;
const domain = "huntress";

redisClient.zrange('posts:pid', 0, -1, (err, pids) => {
    Promise.all(
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



    function processContentItem(outerHTML, pid) {
        return new Promise((resolve) => {
            var match = outerHTML.match(IMAGE_CONTENT_REG),
                src = outerHTML.match(IMAGE_CONTENT_SRC_REG)[0],
                postFix = match[1],
                data = match[2],
                dataBuf = Buffer.from(data),
                fileName = `${md5(dataBuf)}.${postFix}`;
            
            //console.log(outerHTML);
            //console.log(src);
            //console.log(postFix);
            //console.log(data);
            //console.log(fileName);
            //content.replace(outerHTML, '//static.fuck.com/upload/b569c5602d15120751120af5a3691375.png');

            content = content.replace(src, `src="//static.${domain}.com/upload/${fileName}"`);

            fs.writeFile(`/Users/lithium/upload/${fileName}`, Buffer.from(data, 'base64'), err => {
                if (err) {
                    //console.log(err);
                    console.warn(`[Warning] writeFile failed for post ${pid}`);
                }
                console.log(`[Succ] writeFile sccessed for post ${pid}, imag src: src="//static.${domain}.com/upload/${fileName}"`);
                resolve();
            });
        });
    }
}