const { SlashCommandBuilder } = require('@discordjs/builders');

const Logger = require("../../extensions/Logger.js");
const logger = new Logger();

const IDumpIt = require('../../modules/DumpItGameWrapper.js');
const dumpitClient = new IDumpIt();

/**================================================================ */
//#region :: FUNCTIONS ::



//#endregion :: FUNCTIONS ::
/**================================================================ */

/**================================================================ */
//#region :: COMMAND: DUMPIT ::

module.exports = 
{
	data: new SlashCommandBuilder()
		.setName( "dumpit" )
		.setDescription( "A competitive capital gains simulator against your friends." )
        .addSubcommand // JOIN
        (
            subcommand => 
                subcommand
                    .setName("join")
                    .setDescription("Create your account and start trading!")
                    .addStringOption(
                        option => option.setName("username")
                            .setDescription("Your username for the game.")
                            .setRequired(true)
                    )
        )
        .addSubcommand // BUY
        (
            subcommand => 
                subcommand
                    .setName("buy")
                    .setDescription("How much of the specified stock you want to buy?")
                    .addStringOption(
                        option => option.setName("symbol")
                            .setDescription("The stock symbol you want to buy.")
                            .setRequired(true)
                    )
                    .addIntegerOption(
                        option => option.setName("shares")
                            .setDescription("The number of shares you want to buy.")
                            .setRequired(true)
                    )
        )
        .addSubcommand // SELL
        (
            subcommand => 
                subcommand
                    .setName("sell")
                    .setDescription("How much of the specified stock you want to sell?")
                    .addStringOption(
                        option => option.setName("symbol")
                            .setDescription("The stock you want to sell.")
                            .setRequired(true)
                    )
                    .addIntegerOption(
                        option => option.setName("shares")
                            .setDescription("The amount of shares you want to sell.")
                            .setRequired(true)
                    )
                    .addStringOption(
                        option => option.setName("imageurl")
                            .setDescription("The image URL to include with your sell order.")
                            .setRequired(false)
                    )
        )
        .addSubcommand // ACCOUNT BALANCE
        (
            subcommand => 
                subcommand
                    .setName("balance")
                    .setDescription("Check your account balance.")
        )
        .addSubcommand // TRANSACTIONS
        (
            subcommand =>
                subcommand
                    .setName("transactions")
                    .setDescription("View your recent transactions.")
                    .addStringOption(
                        option => option.setName("timeframe")
                            .setDescription("The timeframe for transactions to view.")
                            .setRequired(true)
                            .addChoices(
                                { name: "Today", value: "D" },
                                { name: "Past Week", value: "W" },
                                { name: "Past Month", value: "M" },
                                { name: "Past Year", value: "Y" },
                                { name: "All Time", value: "ALL" }
                            )
                    )
                    .addStringOption(
                        option => option.setName("sort")
                            .setDescription("How to sort the transactions.")
                            .setRequired(false)
                            .addChoices(
                                { name: "Date", value: "date" },
                                { name: "Symbol", value: "symbol" },
                                { name: "Shares", value: "shares" },
                                { name: "Price", value: "price" }
                            )
                    )
                    .addStringOption(
                        option => option.setName("order")
                            .setDescription("The order to sort the transactions.")
                            .setRequired(false)
                            .addChoices(
                                { name: "Ascending", value: "asc" },
                                { name: "Descending", value: "desc" }
                            )
                    )
        )
        .addSubcommand // PORTFOLIO
        (
            subcommand => 
                subcommand
                    .setName("portfolio")
                    .setDescription("View your current portfolio.")
        )
        .addSubcommand // LEADERBOARD
        (
            subcommand => 
                subcommand
                    .setName("leaderboard")
                    .setDescription("View the current leaderboard.")
        )
        .addSubcommand // ANNALS
        (
            subcommand => 
                subcommand
                    .setName("annals")
                    .setDescription("View past years' winners and results.")
                    .addIntegerOption(
                        option => option.setName("year")
                            .setDescription("The year of results you wish to see.")
                            .setRequired(true)
                    )
        ),
	async execute(interaction)
    {
        try {
            await dumpitClient.parseArguments(interaction);
        } catch (ex) {
            logger.error(`>> [dumpit.js]::[execute] - ${ex.message}\n${ex.stack}`);
            await interaction.editReply(">> There was an issue executing this command - please let my creator know...");
        }
    }
};

//#endregion :: COMMAND: DUMPIT ::
/**================================================================ */