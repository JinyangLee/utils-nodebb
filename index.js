'use strict';

require('./src/global');
var Fix = require('./src/fixEmailUid');

Fix.getEmailUidFromRqstieData()
    //getUids()
    //.then(uids => Fix.getEmailUid(uids))
    .then(values => Fix.printDuplication(values))
    .then(values => Fix.setEmailUid(values))
    .then(() => {
        console.log('finished!');
        return;
    });
