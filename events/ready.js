const { Events } = require('discord.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
        console.log("\n#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%");
		console.log(`>> DumpIt is ready! @ ${new Date(client.readyTimestamp).toISOString()}\n\tLogged in as: ${client.user.tag}`);
        console.log(`\n>> Session Date: ${new Date().toISOString()}`);
        console.log("#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%\n");
	},
};