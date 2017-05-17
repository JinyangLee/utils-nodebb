'use strict';

require('../global');
const fs = require('fs');
var totalNum = 0;

fs.readFile('/Users/lithium/Downloads/resetName.txt', 'utf8', (err, data) => {
	data = data.replace(/\'/g, '\"');
	data = JSON.parse(data);
	for(var item in data) {
		redisClient.hset(`user:${item}`, ['username', data[item], 'fullname', data[item]], (err) => {
			if (!err) {
				console.log(`success reset name: user:${item}, total: ${++totalNum}`);
			}
		});
	}
});