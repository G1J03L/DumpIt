const { EmbedBuilder } = require('@discordjs/builders');
const { AttachmentBuilder, userMention } = require("discord.js");
const DumpIt = require('./DumpItGameHelper.js');

module.exports = class DumpItGameWrapper {

    // At least a title and description should be set for each subcommand
    #COMMAND_EMBED_OPTS = {
        "join": {
            title: "Join",
            description: "DumpIt claims another soul...",
            isDM: false
        },
        "sell": {
            title: "Sell",
            description: "Market order result",
            isDM: false
        },
        "buy": {
            title: "Buy",
            description: "Stock purchase result",
            isDM: true
        },
        "balance": {
            title: "Balance",
            description: "Your current balance",
            isDM: true
        },
        "portfolio": {
            title: "Portfolio",
            description: "Your current holdings",
            isDM: true
        },
        "transactions": {
            title: "Transactions",
            description: "Your requested transactions",
            isDM: true,
            skipFormatting: true
        },
        "annals": {
            title: "Annals",
            description: "Let's see who the winner is...",
            isDM: false
        },
        "leaderboard": {
            title: "Leaderboard",
            description: "Leaderboard of current holdings",
            isDM: false
        },
        "ceremony": {
            title: "Award Ceremony",
            description: "Time to see whose bets have paid off",
            isDM: false
        }
    }

    constructor() {
        this.dumpItHelper = new DumpIt();
    }

    async parseArguments( interaction ) {

        let subcommand;
        // Check if the user has an account
        const userId = interaction.user.id;
        const hasAccount = await this.dumpItHelper.playerExists(userId);

        if (!hasAccount && interaction.options.getSubcommand() !== "join") {
            await interaction.followUp(">> No account found. Run the command: **/dumpit join** and provide a username to begin trading!");
            return;
        } else {
            subcommand = interaction.options.getSubcommand();
        }

        let result, processed, imageUrl = null;
        switch (subcommand) {

            case "join": {
                await interaction.followUp("Please wait while we prepare your account...");
                const username = interaction.options.getString("username", true);
                result = await this.dumpItHelper.createAccount(userId, username);
                processed = this.#processJoinResult(result, username);
                break;
            }

            case "sell": {
                await interaction.followUp("Please hold for sell confirmation...");
                const sellSymbol = interaction.options.getString("symbol", true);
                const sellShares = interaction.options.getInteger("shares", true);
                imageUrl = interaction.options.getString("imageurl", false);
                result = await this.dumpItHelper.sellStock(userId, sellSymbol, sellShares);
                processed = this.#processSellResult(result);
                break;
            }

            case "buy": {
                await interaction.followUp("Please hold for buy confirmation...");
                const buySymbol = interaction.options.getString("symbol", true);
                const buyShares = interaction.options.getInteger("shares", true);
                result = await this.dumpItHelper.buyStock(userId, buySymbol, buyShares);
                processed = this.#processBuyResult(result);
                break;
            }
                
            case "balance": {
                await interaction.followUp("Please wait while we fetch your balance...");
                result = await this.dumpItHelper.getAccountBalance(userId);
                processed = this.#processBalanceResult(result);
                break;
            }

            case "portfolio": {
                await interaction.followUp("Please wait while we fetch your portfolio...");
                result = await this.dumpItHelper.getUserPortfolio(userId);
                processed = this.#processPortfolioResults(result);
                break;
            }

            case "transactions": {
                await interaction.followUp("Please wait while we fetch your transactions...");
                const timeframe = interaction.options.getString("timeframe");
                const sort = interaction.options.getString("sort");
                const order = interaction.options.getString("order");
                result = await this.dumpItHelper.getUserTransactions(userId, timeframe, sort, order);
                processed = this.#processTransactionResults(result);
                break;
            }

            case "leaderboard": {
                await interaction.followUp("Please wait while we generate the leaderboard...");
                result = await this.dumpItHelper.getYearToDateEarnings();
                processed = this.#processLeaderboardResults(result);
                break;
            }

            case "annals": {
                await interaction.followUp("Please wait while the winner is determined...");
                const year = interaction.options.getInteger("year", true);
                result = await this.dumpItHelper.getResultsFromAnnals(year);
                processed = this.#processAnnalsResults(result);
                break;
            }

            case "ceremony": {
                await interaction.followUp("Please hold while the winner is determined...");
                const type = interaction.options.getString("type", true);
                result = type === "M" 
                    ? await this.dumpItHelper.executeMonthlyAwardsCeremony()
                    : await this.dumpItHelper.executeYearEndAwardsCeremony(); // Other option is "Y"
                processed = this.#processCeremonyResults(result);
                break;
            }

            default:
                return await interaction.followUp(">> Unknown subcommand.", {ephemeral: true });
        }
        
        await this.#formatEmbed(interaction, subcommand, processed, imageUrl);
        result, processed = null;

        return;
    }

    //====================================================================================================================================
    //#region :: RESULT PROCESSORS

    #processJoinResult(result, username) {

        return `[ ${username} ] :: ${result.message}`;
    }

    #processSellResult(result) {
        
        if (result.success) {
            return `Success - your transaction was approved!\nTotal Gains :: ${this.#formatCurrency(result.gains)}`;
        } else {
            return `Insufficient shares - check your portfolio!\n| Market Order :: ${result.reqShares} @ ${this.#formatCurrency(result.price)}\n| Shares Available: ${result.availShares}`;
        }
    }

    #processBuyResult(result) {
        
        if (result.success) {
            return `Success - your transaction was approved!\n| Total Cost :: ${this.#formatCurrency(result.cost)} (${result.shares} shares @ ${this.#formatCurrency(result.price)})\n| Remaining Balance: ${this.#formatCurrency(result.balance)}`;
        } else if (!result.success && Object.hasOwn(result, "symbol")) {
            return `Symbol: ${result.symbol} does not exist...`;
        } else if (!result.success) {
            return `Insufficient funds! Check your account balance!\nTotal Cost :: ${this.#formatCurrency(result.cost)}`;
        }
    }

    #processBalanceResult(result) {
        
        return `Account Balance :: ${this.#formatCurrency(result)}`;
    }

    #processPortfolioResults(result) {

        if (result.success && Object.keys(result.portfolio).length !== 0) {
            
            const portfolio = result.portfolio;

            let field = {};
            let fields = [];
            const spacer = {name: "\u200B", value: "\u200B", inline: false};

            // Add a spacer at the beginning
            fields.push(spacer);
            // Add a field for the total balance and gains
            const totalBalance = Object.values(portfolio).reduce((acc, item) => acc + (item.currentPrice * item.shares), 0);
            const totalGains = Object.values(portfolio).reduce((acc, item) => acc + ((item.currentPrice - item.avgPrice) * item.shares), 0);
            const summaryField = {
                name: "**Portfolio Summary**",
                value: 
                `**Total Value** :: ${this.#formatCurrency(totalBalance)}\n` +
                `**Total Gains** :: ${this.#formatCurrency(totalGains)} (${((totalGains / (totalBalance - totalGains)) * 100).toFixed(2)}%)`,
                inline: false
            };
            fields.push(summaryField);
            // Add a spacer before the portfolio details
            fields.push(spacer);

            const MAX_COLUMNS = 3;
            let col = 0;
            for (const symbol of Object.keys(portfolio)) {

                const heading = `**${symbol} :: Details**\n`;
                const body = 
                `
                **CPS** :: ${this.#formatCurrency(portfolio[symbol].avgPrice)}
                **Shares** :: ${portfolio[symbol].shares} ${portfolio[symbol].shares <= 1 ? "share" : "shares"}
                **Value** :: ${this.#formatCurrency(portfolio[symbol].avgPrice * portfolio[symbol].shares)}
                **Change** :: ${this.#formatCurrency(portfolio[symbol].currentPrice * portfolio[symbol].shares - portfolio[symbol].avgPrice * portfolio[symbol].shares)} (${((portfolio[symbol].currentPrice - portfolio[symbol].avgPrice) / portfolio[symbol].avgPrice * 100).toFixed(2)}%)
                `;

                field.name = heading;
                field.value = body;
                field.inline = true;

                if (col == MAX_COLUMNS) {
                    fields.push(spacer);
                    col = 0;
                }
                fields.push(field);
                field = {};
                col += 1;
            }
            fields.push(spacer);
            
            return fields;

        } else {
            return { success: false, message: "You have no holdings - go and buy some stock!" };
        }
    }

    /**
     * 
     * @param {String} result A transactions list of formatted fields.
     * @constructs Field<EmbedBuilder>
     */
    #processTransactionResults(result) {

        if (result.success) {
            
            // const searchCriteria = result.criteria;
            const transactionDetails = result.transactions;

            const spacer = {name: "\u200B", value: "\u200B"};
            const transactionFields = [];
            const ROW_MAX_FIELDS = 3;
            
            let col = 0;
            transactionFields.push(spacer);
            for (const item of transactionDetails) {
                
                const fieldTitle = `**[${item.type.toUpperCase()}] :: ${item.symbol}**`;
                const fieldMessage = ` **Date** :: ${new Date(item.timestamp).toLocaleDateString()}\n **Price** :: ${this.#formatCurrency(item.price)}\n **Shares** :: ${item.shares}\n **Cost** :: ${this.#formatCurrency(item.price * item.shares)}\n`;
                
                const field = {};
                field.name = fieldTitle;
                field.value = fieldMessage;
                field.inline = true;

                if (col == ROW_MAX_FIELDS) {
                    
                    spacer.inline = false;
                    transactionFields.push(spacer);
                    col = 0;
                }
                transactionFields.push(field);
                col += 1;
            }

            transactionFields.push(spacer);
            return transactionFields;
        } else {

            return { success: false, message: "No transactions found - check your balance\nand start buying and selling TODAY!" };
        }
    }

    #processLeaderboardResults(result) {

        if (result.success) {
            const leaderboard = result.leaderboard;

            let field = {};
            let fields = [];
            const spacer = {name: "\u200B", value: "\u200B", inline: false};
            
            fields.push(spacer);
            for (const item of Object.values(leaderboard)) {

                const heading = `**#${item.rank} :: ${item.player}**\n`;
                const body = 
                `
                **Total Value** :: ${this.#formatCurrency(item.totalValue)}
                **Total Gains** :: ${this.#formatCurrency(item.gains)} (${item.percentageGains})
                `;

                field.name = heading;
                field.value = body;
                field.inline = false;

                fields.push(field);
                field = {};
            }
            fields.push(spacer);

            return fields;

        } else {
            return { success: false, message: "No leaderboard data found - check your balance\nand start buying and selling TODAY!" };
        }
    }

    #processAnnalsResults(result) {

        if (result.success) {
            // TODO SOON TM
        } else {

            return { success: false, message: "No transactions found - check your balance\nand start buying and selling TODAY!" }
        }

        if (Array.isArray(result)) {
            return result;
        } else {
            return;
        }
    }

    #processCeremonyResults(result) {

        if (result.success) {

            const winner = result.user;

            let field = {};
            let fields = [];
            const spacer = {name: "\u200B", value: "\u200B", inline: false};
            
            fields.push(spacer);
            const heading = `**Your winner!! :: [${winner}]**\n`;
            const body = `Congratulations! You've been awarded $${result.prize} for having the largest gains (${result.ceremony.winner.gain}%) for the month!`;
            
            field.name = heading;
            field.value = body;
            field.inline = false;

            fields.push(field);
            field = {};
            fields.push(spacer);

            return fields;
        } else {
            return { success: false, message: result.message };
        }
    }

    //#endregion
    //====================================================================================================================================
    

    //====================================================================================================================================
    //#region :: FORMATTERS
    #formatCurrency(amount) {

        return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }

    #formatFields(result, skipFormatting = false) {

        // Formatting checks
        if (Array.isArray(result) && typeof result[0] === "object") {
            // Field(s) already formatted
            return result;

        } else if (!result.success && Object.hasOwn(result, "message")) {
            // In error / has message other than result
            return [{ name: "Results:", value: result.message }];

        } else if (skipFormatting) {
            // Manually skip formatting
            return result;

        } else {

            // Create generic field surrounded by padding spacer
            let splitResult = [];
            let spacing = { name: "\u200B", value: "\u200B" };
            if (typeof result === "string" && result.length > 1024) {
                // Split on \r\n or \n, fallback to splitting every 1024 chars if no newlines
                splitResult = result.split(/\r?\n/);
                // If splitting didn't reduce length, chunk by 1024 chars
                if (splitResult.length === 1 && result.length > 1024) {
                    splitResult = [];
                    for (let i = 0; i < result.length; i += 1024) {
                        splitResult.push(spacing);
                        splitResult.push({ name: "Results:", value: result.slice(i, i + 1024) });
                    }
                }
            } else {
                splitResult.push(spacing);
                splitResult.push({ name: "Results:", value: result });
            }
            splitResult.push(spacing);
    
            return splitResult;
        }
    }

    async #formatEmbed(interaction, subcommand, result, imageUrl = null) {
        
        const options = this.#COMMAND_EMBED_OPTS[subcommand];

        const isDM = Object.hasOwn(options, "isDM") ? options.isDM : false;
        const skipFormatting = Object.hasOwn(options, "skipFormatting") ? options.skipFormatting : false;

        const commandTitle = options.title;
        const commandDescription = options.description;

        const dumpitLogo = new AttachmentBuilder("./assets/dumpit.png");
        const LOGO_EMBED_PATH = "attachment://dumpit.png";

        let embedFiles = [];
        if (dumpitLogo) embedFiles.push(dumpitLogo);

        const embedResponse = new EmbedBuilder()
            .setColor(0x001626)
            .setTitle(`>> ${commandTitle} :: DumpIt`)
            .setAuthor({name: "DumpIt™ Portfolio Management Simulator", description: "Embed Author" })
            .setDescription(commandDescription)
            .setThumbnail(LOGO_EMBED_PATH)
            .setFields(this.#formatFields(result, skipFormatting))
            .setImage(imageUrl ?? null)
            .setFooter({ text: "DumpIt™", iconURL: LOGO_EMBED_PATH, description: "DumpIt Logo" })
            .setTimestamp();

        if (isDM) {
            await interaction.user.send({ content: `${userMention(interaction.user.id)}`, embeds: [embedResponse], files: embedFiles });
            await interaction.editReply(">> Check your inbox!");
        } else {
            await interaction.channel.send({ content: `${userMention(interaction.user.id)}`, embeds: [embedResponse], files: embedFiles });
        }
    }
}

//#endregion
//====================================================================================================================================