const { Events } = require("discord.js");

module.exports = {

    name: Events.InteractionCreate,
    async execute(interaction) {

        const command = interaction.client.aliases.get(interaction.commandName) ?? interaction.client.commands.get(interaction.commandName);
        
        if (!command) { return; }

        if (interaction.isAutocomplete()) {
        
            if (!command) { return; }

            try {
                await command.autocomplete(interaction);
            }
            catch (wERROR) {
                console.error(`>> Encountered error when executing command: /${command.data.name}`);
                console.error(wERROR);
            }
            return;
        } 

        try {

            await interaction.deferReply();
            await command.execute(interaction);
        }
        catch (error) {

            console.error(`>> Encountered error when executing command: /${command.data.name}`);
            console.error(error);
        }
        return;
    },
}
