"use strict";

var mc = {};

mc.merge = (fromCids, toCid, next) => {
    var asyncQueue = [];
    fromCids.forEach(function(cid, index){
        asyncQueue.push(function(next){
            mc.mergeSingle(cid, toCid, next);
        });
    });

    async.parallel(asyncQueue, function(err, result){
        console.log("mc.merge finished !");
        next(err);
    });
};

mc.mergeSingle = (fromCid, toCid, next) => {
    console.log(fromCid, toCid);
    next(null);
};

module.exports = mc;
