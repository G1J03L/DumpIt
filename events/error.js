const { Events } = require('discord.js');

module.exports = {
	name: Events.Error,
	once: true,
	execute(error) {
		console.log(error);
	},
};