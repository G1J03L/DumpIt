/**================================================================ */
//#region :: REQUIRES ::

const { Configuration, Options } = require( './app-config.json');

// const fs = require('node:fs');
// const path = require('node:path');
// const { REST } = require('@discordjs/rest');
// const { Routes } = require('discord-api-types/v9');
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath); //.filter(file => file.endsWith('.js'));

//#endregion :: REQUIRES ::
/**================================================================ */

/**================================================================ */
//#region :: PROCESS COMMAND FILES ::

// for (const file of commandFiles) 
// {
//     let filePath = path.join(commandsPath, file);
// 	let command = require(filePath);
// 	commands.push(command.data.toJSON());

//     console.log('Processed: ' + file);
// }

for (const folder of commandFolders) {
	
	// Grab all the command files from the commands directory you created earlier
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

//#endregion :: PROCESS COMMAND FILES ::
/**================================================================ */

/**================================================================ */
//#region :: SERVER SWITCHER ::

let guildId = '';

if (!Options.devmode)
{
	guildId = Configuration.secondaryGuildID;
	console.log(`>> !![Hideout commands enabled: We're doin' it live]!!\n>> devmode === ${Options.devmode.valueOf()}`);
}
else { guildId = Configuration.guildID; }

//#endregion :: SERVER SWITCHER ::
/**================================================================ */

/**================================================================ */
//#region :: PUSH COMMANDS ::

// const rest = new REST({ version: '9' }).setToken( Configuration.clientSecret ); // SECRET

// rest.put(Routes.applicationGuildCommands( Configuration.clientID, guildID ), { body: commands })
// 	.then(() => console.log('\n>> Successfully registered application commands.'))
// 	.catch(console.error);

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(Configuration.clientSecret);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(Configuration.clientID, guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();

//#endregion :: PUSH COMMANDS ::
/**================================================================ */