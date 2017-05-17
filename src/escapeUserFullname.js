'use strict';
require('./global');
var encoder = require('escape-html');

redisClient.hgetallAsync('email:uid')
	.then(res => {
		var tasks = [];
		for(var email in res) {
			tasks.push(escapeName(res[email]));
		}
		return Promise.all(tasks);
	})
	.then(() => console.log('DONE'))

function escapeName(uid) {
	return redisClient.hgetAsync(`user:${uid}`, 'fullname')
		.then(name => {
			name = encoder(name);
			redisClient.hmset(`user:${uid}`, ['username', name, 'fullname', name]);
		})
}