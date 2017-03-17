'use strict';

require('../global');
var MapUid = require('./mapUid');

MapUid.getJsonData();
MapUid.getUidMapping()
    .then(MapUid.getAllKeys)
    .then(res => MapUid.getKeyInfo(res))
    .then(MapUid.wash)
    .then(MapUid.overwriteDB)
    .then(MapUid.replaceUserslugWithRqsiteUid)
    .then(() => {
        console.log('finished!');
        process.exit();
    });
//MapUid.getUidMapping();
//MapUid.getAllKeys()
//      .then(res => MapUid.getKeyInfo(res))
//      .then(MapUid.wash)
//      .then(() => {
//          console.log('finished!');
//          process.exit();
//      });