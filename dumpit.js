// NEW INVITE LINK [24-06-2024] :: https://discord.com/oauth2/authorize?client_id=1387182996422922330

/**================================================================ */
//#region :: REQUIRES ::

//https://discordjs.guide/additional-info/changes-in-v14.html#before-you-start

const { Configuration } = require( './app-config.json');

const fs = require('node:fs');
const path = require('node:path');

// Initialize Logger
const Logger = require("./extensions/Logger.js");
let logger = new Logger();
logger = null;

const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');

const client = new Client({ 
	intents: [GatewayIntentBits.Guilds],
	partials: [Partials.Channel, Partials.Message, Partials.Reaction] 
});

// const QueueManager = require("./extensions/QueueManager");
// var interactionQueue = new QueueManager();

//#endregion :: REQUIRES ::
/**================================================================ */


/**================================================================ */
//#region :: BUILD COMMANDS ::

client.commands = new Collection();
client.aliases = new Collection();

const commandsPath = path.join(__dirname, 'commands\\deployed');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);

        // Build map of aliases
        if(command.aliases) {
            for(const alias of command.aliases) {
                client.aliases.set(alias, command);
            }
        }
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

//#endregion :: BUILD COMMANDS ::
/**================================================================ */


/**================================================================ */
//#region :: EVENTS ::

const servers = {};

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

//#endregion :: EVENTS ::
/**================================================================ */


/**================================================================ */
//#region :: LOGIN ::

client.login( Configuration.clientSecret );

//#endregion :: LOGIN ::
/**================================================================ */