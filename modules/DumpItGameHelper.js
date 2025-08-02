// 99.9% vibe-coded

const { Configuration, Settings } = require('../app-config.json');
const { MongoClient } = require('mongodb');

const fmp = require('financialmodelingprep')(Configuration.fmpAPIKey);

const Logger = require("../extensions/Logger.js");
const logger = new Logger();

const db = require('../extensions/MongoDatabases.js');
const prodDB = db.Databases.DumpIt;
const testDB = db.Databases.DumpIt_EOYTests;

//DumpIt_EOYTests
/**
 * DumpItGame class handles the game logic for the DumpIt game.
 * It manages player creation, stock transactions, game initialization, and evaluation.
 * It uses MongoDB for data storage and FinnHub API for stock price retrieval.
 * 
 * @property {MongoClient} mdbc - MongoDB client instance for database operations.
 * @property {string} dbName - The name of the MongoDB database.
 * @property {Object} db - The MongoDB database instance.
 * @property {Object} users - MongoDB collection for user data.
 * @property {Object} transactions - MongoDB collection for transaction data.
 * @property {Object} properties - MongoDB collection for game properties.
 * @property {Object} annals - MongoDB collection for game history. 
 */
module.exports = class DumpIt {

    runRollOverBonus = false;

    /**
     * Initializes the game. 
     */
    constructor(runTests = false) {

        this.mdbc = this.#getConnection();
        this.dbName = runTests
            ? testDB.name
            : prodDB.name;

        this.#init();
    }

    /**
     * 1. Starts a heartbeat that updates the "currentDate" property every hour.
     * 2. Checks if it's the end of the month and runs end-of-month tasks.
     */
    async #startHeartbeat() {
        // Run immediately, then every hour
        await this.#updateHeartbeatDate();

        this._heartbeatInterval = setInterval(async () => {
            logger.log(`[HEARTBEAT] :: Heartbeat running at ${new Date().toISOString()}`);
            await this.#checkForMonthChange();
            await this.#checkForYearChange();
            await this.#updateHeartbeatDate();
        }, 60 * 60 * 1000); // 1 hour in ms
    }

    /**
     * Updates the "heartbeatDate" property in the properties collection.
     */
    async #updateHeartbeatDate() {

        if (!this.properties) return;

        await this.properties.updateOne(
            { key: 'heartbeatDate' },
            { $set: { value: new Date().toISOString() } },
            { upsert: true }
        );
    }

    #getConnection() {
        
        if (this.mdbc && this.mdbc.isConnected && this.mdbc.isConnected()) {
            return this.mdbc;
        }

        // Create new MongoClient if none exists or if not connected
        const client = new MongoClient(Configuration.mongoDBConnectionString, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        return client;
    }

    /**
     * Closes the MongoDB connection.
     * @return {Promise<void>}
     */
    async #close() {

        if (!this.mdbc || !this.mdbc.isConnected()) {
            logger.error('MongoDB client is not connected or already closed.');
            return;
        }        
        
        await this.mdbc.close();
    }

    /**
     * Initializes the game by connecting to the database and setting up collections.
     * It checks if the game is already initialized and creates necessary collections if not.
     */
    async #init() {

        await this.#startHeartbeat();

        if (!this.mdbc || !this.dbName) {
            logger.error('Configuration is missing required parameters: mongoClient, or dbName');
            return;
        }

        // Connect to MongoDB
        await this.mdbc.connect();
        this.db = this.mdbc.db(this.dbName);

        // Check if the game is initialized
        const gameInitialized = await this.db.collection('properties')?.findOne({ key: 'gameInitialized' });
        if (!gameInitialized) {
            
            logger.log(`[INIT] :: DumpIt is initializing...`);

            // If not initialized, create collections
            this.users = this.db.collection('users');
            this.transactions = this.db.collection('transactions');
            this.properties = this.db.collection('properties');
            this.annals = this.db.collection('annals');
            
            // Ensure indexes for faster queries
            await this.users.createIndex({ userId: 1 }, { unique: true });
            await this.transactions.createIndex({ userId: 1, timestamp: -1 });
            await this.properties.createIndex({ key: 1 }, { unique: true });
            await this.annals.createIndex({ year: 1 }, { unique: true });
            
            // Initialize properties collection if not exists
            const propertyExists = await this.properties.findOne({ key: 'gameStarted' });
            if (!propertyExists) {

                await this.properties.insertOne({ key: 'gameInitialized', value: true });
                await this.properties.insertOne({ key: 'gameStarted', value: false });
                await this.properties.insertOne({ key: 'lastDayOfYear', value: new Date().getFullYear() + '-12-31' });
            }
            
            this.createAllViews(); // Create all views for reporting and analytics

            logger.log(`[INIT] :: DumpIt initialized successfully!`);
        }
        else {
            // If already initialized, set up collections
            this.users = this.db.collection('users');
            this.transactions = this.db.collection('transactions');
            this.properties = this.db.collection('properties');
            this.annals = this.db.collection('annals');

            logger.log(`[INIT] :: DumpIt already initialized, using existing collections...`);
        }

        logger.log(`[INIT] :: Initialized, connected to MongoDB database: ${this.dbName}`);
        
        // Start the game if it hasn't started yet
        await this.#startGame();

        // Check if the year has changed and roll forward if necessary
        await this.#checkForYearChange();
    }

    /**
     * Starts the game by setting the 'gameStarted' property to true and initializing the year.
     * @return {Promise<Object>} Returns an object indicating the game has started.
     */
    async #startGame() {
        
        const gameStarted = await this.properties.findOne({ key: 'gameStarted' });
        
        if ((gameStarted === undefined || gameStarted === null) || (gameStarted && gameStarted.value === false)) {
            
            logger.log(`[START] :: Starting the game...`);
            
            const options = { upsert: true };
            // Set the game as started
            await this.properties.updateOne({ key: 'year'}, { $set: { value: new Date().getFullYear() }}, options);
            await this.properties.updateOne({ key: 'gameStarted' }, { $set: { value: true } }, options);
            await this.properties.updateOne({ key: 'startedDate' }, { $set: { value: new Date().toISOString() } }, options);
            await this.properties.updateOne({ key: 'monthFinalized' }, { $set: { value: false } }, options);
            await this.properties.updateOne({ key: 'currentYearFinalized' }, { $set: { value: false } }, options);
            
            logger.log(`[START] :: DumpIt has started successfully for ${ new Date().getFullYear() }!`);
        }
        else {
            logger.log(`[START] :: Game has already started...`);
        }

        return { started: true };
    }

    /**
     * Checks if the current year has changed and rolls forward if necessary.
     * This method is called during initialization to ensure the game is up-to-date with the current year.
     * @return {Promise<void>}
     */
    async #checkForYearChange() {

        logger.log(`[INIT] :: Checking for year change...`);

        // Check if year has changed and roll forward if necessary
        const currentYearFinalized = await this.properties.findOne({ key: 'currentYearFinalized' });

        const currentYear = await this.getCurrentGameYear();
        const year = new Date().getFullYear();

        if (currentYearFinalized && currentYearFinalized.value === true && currentYear !== year && await this.daysLeftInYear() <= 0) {

            logger.log(`[INIT] :: New year detected, rolling forward...`);
            await this.properties.updateOne({ key: 'year' }, { $set: { value: year } });
            await this.properties.updateOne({ key: 'currentYearFinalized' }, { $set: { value: false } });
            await this.properties.updateOne({ key: 'lastDayOfYear' }, { $set: { value: `${year}-12-31` } });
            await this.properties.updateOne({ key: 'gameStarted'}, { $set: { value: false }});
            logger.log(`[INIT] :: Year rolled forward to ${year}.`);
        }
        else {
            logger.log(`[INIT] :: Year is already set to ${currentYear}. No changes made.`);
        }
    }

    /**
     * Retrieves the current year from the properties collection.
     * @return {Promise<number>} - The current year.
     */
    async getCurrentGameYear() {

        // Try to get the current year from the properties collection and if not, update the collection and return the current year.
        const year = await this.properties.findOne({ key: 'year' });
        if (!year) {
            logger.error(`[getCurrentGameYear] :: Year not set in properties, initializing to current year...`);
            const currentYear = new Date().getFullYear();
            await this.properties.insertOne({ key: 'year', value: currentYear });
            return currentYear;
        }
        return year.value;
    }

    /**
     * Calculates the number of days left in the current year.
     * @return {Promise<number>} - The number of days left in the year.
     */
    async daysLeftInYear() {

        const year = await this.properties.findOne({ key: 'year' });
        if (!year) {
            logger.error(`[daysLeftInYear] :: Year not set in properties...`);
        }

        const currentDate = new Date();
        const endOfYear = new Date(year.value, 11, 31); // December 31st of the current year
        const timeDiff = endOfYear - currentDate;
        const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)); // Convert milliseconds to days

        return daysLeft > 0 ? daysLeft : 0; // Ensure non-negative days left
    }

    /**
     * Retrieves the year-to-date earnings for all players and formats them into a leaderboard.
     * @return {Promise<Object>} - A dictionary with user IDs as keys and their total values as values.
     */
    async getYearToDateEarnings() {

        // Fetch all users from the database
        const players = await this.users.find({}).toArray();
        const ytdEarnings = await Promise.all(
            players.map(async (user) => {
                let totalValue = user.balance;
                let gains = 0;
                if (user.portfolio) {
                    for (const symbol in user.portfolio) {
                        const response = await this.getStockPrice(symbol);
                        if (Object.hasOwn(response, "message")) {
                            logger.log(`[${symbol}] :: ${response.message}`);
                        }
                        const stock = user.portfolio[symbol];
                        const price = response.success ? response.price : 0;
                        totalValue += stock.shares * price;
                        gains += stock.shares * price - (stock.avgPrice * stock.shares);
                    }
                }
                return { userId: user.userId, username: user.username, totalValue, gains };
            })
        );

        // Sort players by total value in descending order
        ytdEarnings.sort((a, b) => b.totalValue - a.totalValue);

        // Format the output as a dictionary
        const leaderboard = {};
        ytdEarnings.forEach((player, index) => {
            leaderboard[index + 1] = {
                rank: index + 1,
                player: player.username,
                totalValue: player.totalValue,
                gains: player.gains,
                percentageGains: (player.gains / player.totalValue * 100).toFixed(2) + '%'
            };
        });

        return { success: true, leaderboard: leaderboard };
    }

    /**
     * Creates a new player in the game with a default balance and empty portfolio.
     * @param {string} userId - The ID of the user to create a player for.
     * @return {Promise<Object>} - Returns an object indicating success or failure.
     */
    async createAccount(userId, username) {

        const playerExists = await this.playerExists(userId);
        if (!playerExists) {

            const playerData = {
                userId,
                username,
                balance: Settings.startingBalance || 10000,
                portfolio: {}, // key: stock symbol, value: { shares, avgPrice }
                created: new Date().toISOString()
            };
            // Insert the player into the database.
            await this.users.insertOne(playerData);
            return { success: true, message: 'Player created successfully.' };
        } else {

            const player = { userId: userId };
            const playerData = {
                $set: {
                    username: username, 
                    updated: new Date().toISOString()
                },
            };
            const options = { upsert: true };
            
            // Insert the player into the database.
            await this.users.updateOne(player, playerData, options);

            const usernameChanged = playerExists.username !== username;
            return { 
                success: false, 
                message: usernameChanged ? 'Player already exists! Updating username.' : 'Player already exists!', 
                username: playerExists.username !== username ? username : null 
            };
        }
    }

    /**
     * Checks if a player exists in the game.
     * @param {string} userId - The ID of the user to check.
     * @return {Promise<boolean>} - Returns true if the player exists, false otherwise.
     */
    async playerExists(userId) {

        if (this.users) {

            const user = await this.users?.findOne({ userId });
            return user ?? null;
        }

        return null;
    }

    /**
     * Purchases stock for a user.
     * @param {string} userId - The ID of the user.
     * @param {string} symbol - The stock symbol to purchase.
     * @param {number} shares - The number of shares to purchase.
     */
    async buyStock(userId, symbol, shares) {
        
        const response = await this.getStockPrice(symbol);
        if (response === undefined || (!response.success && Object.hasOwn(response, "message"))) 
            return { success: false, message: response.message, symbol: symbol };
        
        const cost = this.roundUpCents(response.price * shares);
        const user = await this.users.findOne({ userId });

        if (user.balance < cost) {
            logger.error(`[TRANSACTION CANCELLED] :: UserId: ${userId}, Balance: ${user.balance}, Transaction Amount: ${cost} :: Insufficient funds!`);
            
            return { 
                success: false, 
                cost: cost
            };
        }

        // Update portfolio details.
        let updatePortfolio;
        if (user.portfolio && user.portfolio[symbol]) {

            const current = user.portfolio[symbol];
            updatePortfolio = {
                shares: current.shares + shares,
                avgPrice: this.roundUpCents(((current.avgPrice * current.shares) + cost) / (current.shares + shares))
            };
        } else {
            updatePortfolio = { shares, avgPrice: this.roundUpCents(response.price) };
        }

        await this.users.updateOne(
            { userId },
            {
                $set: { [`portfolio.${symbol}`]: updatePortfolio },
                $inc: { balance: -cost }
            }
        );

        await this.transactions.insertOne({
            userId,
            symbol,
            shares,
            price: response.price,
            type: 'buy',
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            balance: user.balance - cost,
            cost: cost,
            shares: shares,
            price: response.price
        }
    }

    /**
     * Round up to nearest 100th (e.g. 100.056 => 100.06, 100.054 => 100.05)
     * 
     * @param {int} num 
     * @returns Decimal number rounded up to nearest 100th
     */
    roundUpCents(num) { return Math.ceil(num * 100) / 100; }

    /**
     * Sells stock for a user.
     * 
     * @param {string} userId - The ID of the user.
     * @param {string} symbol - The stock symbol to sell.
     * @param {number} shares - The number of shares to sell.
     * @return {Promise<void>}
     */
    async sellStock(userId, symbol, shares) {

        const user = await this.users.findOne({ userId });
        const response = await this.getStockPrice(symbol);

        if (!response.success || Object.hasOwn(response, "message")) {
            return { 
                success: false, 
                message: response.message, 
                username: user.username,
                symbol: symbol,
                reqShares: shares,
                availShares: user.portfolio[symbol]?.shares ?? 0,
                price: 0
            };
        }

        if (!user.portfolio || !user.portfolio[symbol] || user.portfolio[symbol].shares < shares) {

            logger.error(`[TRANSACTION CANCELLED] :: Insufficient shares :: USER: ${userId} (${user.username}) || Requested: ${shares}, Available: ${user.portfolio[symbol]?.shares ?? 0}`);
            return {
                success: false,
                username: user.username,
                symbol: symbol,
                reqShares: shares,
                availShares: user.portfolio[symbol]?.shares ?? 0,
                price: response.price
            };
        }
        
        const gains = response.price * shares;
        const remainingShares = user.portfolio[symbol].shares - shares;

        if (remainingShares > 0) {
            // Update the portfolio with remaining shares and adjust balance.
            await this.users.updateOne(
                { userId },
                {
                    $set: { [`portfolio.${symbol}.shares`]: remainingShares },
                    $inc: { balance: gains }
                }
            );
        } else {
            // Remove the stock from portfolio if no shares remain.
            await this.users.updateOne(
                { userId },
                {
                    $unset: { [`portfolio.${symbol}`]: "" },
                    $inc: { balance: gains }
                }
            );
        }

        await this.transactions.insertOne({
            userId,
            symbol,
            shares,
            price: response.price,
            type: 'sell',
            timestamp: new Date().toISOString()
        });

        return {
                success: true,
                username: user.username,
                symbol: symbol,
                sharesLeft: remainingShares,
                gains: gains,
                sellPrice: response.price
            };
    }

    /**
     * Retrieves the current stock price for a given symbol using FinnHub API.
     * @param {string} symbol - The stock symbol to retrieve the price for.
     * @return {Promise<number>} - The current stock price.
     */
    async getStockPrice(symbol) {

        return new Promise(async (resolve, reject) => {
            await fmp.stock(symbol).quote().then(data => {
                if (data.length > 0) {
                    resolve({ success: true, price: data[0].price });
                } else if (data.error) {
                    resolve({ success: false, message: "Stock symbol not tracked by this service ." });
                } else {
                    this.#setAPILimitExceededFlag();
                    resolve({ success: false, message: "API limit exceeded. Please try again later." });
                }
            });
        });
    }

    /**
     * Checks if the API limit has been exceeded.
     * This method checks the properties collection for a flag indicating API limit status.
     * @return {Promise<boolean>} - Returns true if the API limit has been exceeded, false otherwise.
     * */
    async isAPILimitExceeded() {
        const apiLimitExceeded = await this.properties.findOne({ key: 'apiLimitExceeded' });
        if (!apiLimitExceeded || apiLimitExceeded?.value !== true) {
            // Start a timer to reset the API limit exceeded flag after the day rolls over.
            const resetTime = new Date().getDate() + 1; // Reset at the start of the next day
            setTimeout(async () => {
                await this.properties.updateOne({ key: 'apiLimitExceeded' }, { $set: { value: false } }, { upsert: true });
                logger.log(`[API LIMIT] :: API limit reset at ${new Date().toISOString()}`);
            }, resetTime - new Date().getDate());
        }
        return apiLimitExceeded && apiLimitExceeded.value === true;
    }

    /**
     * Sets a flag in the properties collection to indicate that the API limit has been exceeded.
     * This method is called when the API limit is reached to prevent further API calls.
     * @return {Promise<void>}
     * @private
     * */
    async #setAPILimitExceededFlag() {
        // Set a flag in the properties collection to indicate API limit exceeded
        await this.properties.updateOne(
            { key: 'apiLimitExceeded' },
            { $set: { value: true } },
            { upsert: true }
        ).then(() => {
            logger.error(`[API LIMIT] :: API limit exceeded. Please try again later.`);
        }).catch(error => {
            logger.error(`[API LIMIT] :: Error setting API limit exceeded flag:`, error);
        });
    }

    // Auto-sell stocks at the end of the year
    /**
     * Automatically sells all stocks for each player at the end of the year.
     * This method is called when finalizing the year to ensure all players' portfolios are liquidated.
     * @return {Promise<void>}
     */
    async autoSellStocks() {

        const players = await this.users.find({}).toArray();

        for (const player of players) {
            if (player.portfolio) {
                for (const symbol in player.portfolio) {
                    const stock = player.portfolio[symbol];
                    if (stock.shares > 0) {
                        try {
                            await this.sellStock(player.userId, symbol, stock.shares);
                        } catch (error) {
                            logger.error(`Error selling stock ${symbol} for user ${player.userId}:`, error);
                        }
                    }
                }
            }
        }

        logger.log(`[AUTO-SELL] :: All stock inventory sold for all players during finalize step...`);

        // Query the allUserBalances view to get the final balances of all players.
        const finalBalances = await this.users.find({}).project({ userId: 1, balance: 1 }).toArray();
        const playerGains = finalBalances.map(player => ({
            name: `**User** :: ${player.name || player.userId}`,
            value: `**Final Balance** :: ||${player.balance - (player.initialBalance || 0)}||`
        }));

        // Log the final balances for debugging purposes
        logger.log(`[AUTO-SELL] :: Final balances after auto-selling stocks:`);
        playerGains.forEach(player => {
            logger.log(`[AUTO-SELL] :: ${player.name} - ${player.value}`);
        });
        return playerGains;
    }

    /**
     * Checks various conditions before finalizing the year.
     * This includes checking if the game has started, if the current year is already finalized, and if there are players in the game.
     * @return {boolean} - Returns true if all checks pass, otherwise logs errors and returns false.
     */
    finalizeYearChecks() {
        
        let message = "";
        let error = false;

        // Check if the game is started
        const gameStarted = this.properties.findOne({ key: 'gameStarted' });
        if (!gameStarted || !gameStarted.value) {
            message += `[FINALIZE] :: Game has not started yet.\n`;
            error = true;
        }

        // Check if the current year is already finalized
        const currentYearFinalized = this.properties.findOne({ key: 'currentYearFinalized' });
        if (currentYearFinalized && currentYearFinalized.value) {
            message += `[FINALIZE] :: Current year is already finalized.\n`;
            error = true;
        }

        // Check if there are players in the game
        const playersCount = this.users.countDocuments({});
        if (playersCount === 0) {
            message += `[FINALIZE] :: No players found in the game.\n`;
            error = true;
        }

        // Check if the last day of the year is set and that it is actually 12-31-YYYY
        const lastDayOfYear = this.properties.findOne({ key: 'lastDayOfYear' });
        if (!lastDayOfYear || lastDayOfYear.value !== `${currentYear}-12-31`) {
            message += `[FINALIZE] :: Last day of the year is not set to 12-31-${currentYear}.\n`;
            error = true;
        }

        return !error ? true : (logger.error(message), false);
    }

    /**
     * Finds the user with the largest account balance.
     * This method is used to determine the player with the highest balance at the end of the year after all stocks have been sold.
     * 
     * @return {Promise<Object>} - An object containing the userId and balance of the player with the largest balance.
     */
    async findLargestAccountBalance() {

        try {

            const rankings = this.users.find({}).sort({ balance: -1 });
            const result = await rankings.limit(1).toArray();

            if (result && result.length > 0) {
                logger.log(`[BALANCE] :: Largest balance found for user ${result[0].userId}: $${result[0].balance}`);
                return { userId: result[0].userId, balance: result[0].balance, leaderboard: result };

            } else {
                logger.log(`[BALANCE] :: No players found.`);
                return null;
            }

        } catch (error) {

            logger.error(`[BALANCE] :: Error finding largest account balance:`, error);
        }
    }

    /**
     * Evaluates the game by calculating each player's total value and determining the winner.
     * The winner is awarded a bonus of $5000 to carry forward into the following year.
     * @return {Promise<Object>} - The winning player's details.
     */
    async finalizeYear() {

        // FINALIZE YEAR CHECKS
        if(!this.finalizeYearChecks()) {
            return [{ name: "Finalize Year Error", value:'Finalize year checks failed. Check the logs for more details.' }];
        }

        logger.log(`[FINALIZE] :: Finalizing the year...`);

        await this.autoSellStocks(); // Ensure all stocks are sold before finalizing

        // Find the largest final balance between all players
        const result = await this.findLargestAccountBalance();

        // Award bonus ${Settings.endOfYearAward} to the winning player.
        logger.log(`[FINALIZE] :: Awarding $${Settings.endOfYearAward} to ${result.userId}!`);
        await this.users.updateOne({ userId: result.userId }, { $inc: { balance: Settings.endOfYearAward } });

        // Record the results to the annals.
        const currentYear = await this.getCurrentGameYear();
        await this.recordResultsToAnnals(currentYear, playerGains);
        
        // Set game as finalized for the current year.
        await this.properties.updateOne({ key: 'currentYearFinalized' }, { $set: { value: true } });
        await this.properties.updateOne({ key: 'gameStarted' }, { $set: { value: false } });
        await this.properties.updateOne({ key: 'lastDayOfYear' }, { $set: { value: `${currentYear}-12-31` } });

        // For users with a balance less than the starting balance, add the difference between their balance and the starting balance to their balance.
        for (const user of await this.users.find({}).toArray()) {

            if (user.balance < Settings.startingBalance) {
                const difference = Settings.startingBalance - user.balance;
                await this.users.updateOne({ userId: user.userId }, { $inc: { balance: difference } });
                logger.log(`[FINALIZE] :: Added $${difference} to user ${user.userId}'s balance to ensure minimum balance of $${Settings.startingBalance}.`);
            }
        }
        
        logger.log(`[FINALIZE] :: Year ${currentYear} finalized. Winner: ${result.userId} with total value: $${result.balance}.`);

        return {
            winner: { userId: result.userId, balance: result.balance },
            leaderboard: result.leaderboard || [],
            message: `Year ${currentYear} has been finalized. The winner is ${result.userId} with a total balance of $${result.balance}.`
        };
    }

    /**
     * Retrieves the current balance for a given user.
     * @param {string} userId - The ID of the user.
     * @return {Promise<number>} - The user's balance.
     */
    async getAccountBalance(userId) {

        const user = await this.users.findOne({ userId });
        if (!user) {
            logger.error(`>> User ${userId} not found`);
        }
        return user.balance;
    }

    /**
     * Retrieves the current portfolio for a given user.
     * @param {string} userId - The ID of the user.
     * @return {Promise<Object>} - The user's portfolio.
     */
    async getUserPortfolio(userId) {

        const user = await this.users.findOne({ userId });
        if (!user) {
            logger.error(`User ${userId} not found`);
            return { success: false };
        }

        // If the 'portfolio' field is not empty, loop through and get the current price of each symbol.
        if (user.portfolio && Object.keys(user.portfolio).length !== 0) {
            
            let avgPriceTotal = 0;
            let gainsTotal = 0;
            
            for (const symbol of Object.keys(user.portfolio)) {
                
                const result = await this.getStockPrice(symbol)
                
                if (!result.success) {
                    
                    logger.error(`Error retrieving stock price for ${symbol}: ${result.message}`);
                    user.portfolio[symbol].currentPrice = 0; // Set current price to 0 if error
                } else {
                    
                    // Calculate average price and gains for each stock in the portfolio.
                    const stock = user.portfolio[symbol];
                    const currentPrice = result.price;
                    user.portfolio[symbol].currentPrice = currentPrice;
                    user.portfolio[symbol].gains = this.roundUpCents((currentPrice - stock.avgPrice) * stock.shares);
                    avgPriceTotal += stock.avgPrice * stock.shares;
                    gainsTotal += user.portfolio[symbol].gains;
                }
            }
            
            return { success: true, portfolio: user.portfolio || {} };
        }
    }

    /**
     * Retrieves the transaction history for a given user.
     * @param {string} userId - The ID of the user.
     * @return {Promise<Array>} - An array of transactions for the user.
     */
    async getUserTransactions(userId, timeframe = "W", sort = "date", order = "asc") {

        let date;
        let timeTitle = "";
        const now = new Date();
        // Timestamp date selector
        switch (timeframe) {
            
            case "D":
                timeTitle = "Today";
                date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
                break;
            
            case "W":
                timeTitle = "Past Week";
                date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
                break;
            
            case "M":
                timeTitle = "Past Month";
                date = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
                break;
            
            case "Y":
                timeTitle = "Past Year";
                date = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();
                break;
            
            case "ALL":
                timeTitle = "All Time";
                date = new Date("1900-01-01").toISOString();
                break;
            
            default: // Shouldn't be possible as string options are validated
                date = new Date().toISOString();
                break;
        }

        let sorter = {};
        let sortDirection = order === "asc" ? 1 : -1;
        // Sort selector
        switch (sort) {
            
            case "date":
                sorter = { timestamp: sortDirection };
                break;

            case "symbol":
                sorter = { symbol: sortDirection };
                break;

            case "shares":
                sorter = { shares: sortDirection };
                break;

            case "price":
                sorter = { price: sortDirection };
                break;
        }

        const transactions = 
            await this.transactions.find({ 
                userId, 
                timestamp: { $gte: date }
            })
            .project({_id: 0, userId: 0})
            .sort(sorter).toArray();
        
        if (transactions?.length == 0) {
            // FAILURE
            return {
                success: false,
                criteria: {
                    timeframe: timeTitle, 
                    sort: `${Object.keys(sorter)}, ${Object.values(sorter) === 1 ? "ASC" : "DESC"}`
                }
            }
        } else {
            // SUCCESS
            return {
                success: true,
                transactions: transactions, 
                criteria: {
                    timeframe: timeTitle, 
                    sort: `${Object.keys(sorter)}, ${Object.values(sorter) === 1 ? "ASC" : "DESC"}`
            }};
        }

    }

    /**
     * Retrieves the game properties from the properties collection.
     * @return {Promise<Object>} - An object containing all game properties.
     */
    async getGameProperties() {

        const properties = await this.properties.find({}).toArray();
        return properties.reduce((acc, prop) => {
            acc[prop.key] = prop.value;
            return acc;
        }, {});
    }

    /**
     * Records the results for a given year in the annals collection.
     * @param {number} year - The year to record results for.
     * @param {Array} results - The results to record.
     * @return {Promise<Object>} - Confirmation of the recorded results.
     */
    async recordResultsToAnnals(year, results) {

        if (!year || !results || !Array.isArray(results)) {
            logger.error('Invalid year or results data');
        }
        const annals = await this.annals.findOne({ year });
        if (annals) {
            // If the year already exists, update it with new results.
            await this.annals.updateOne({ year }, { $set: { results } });
        } else {
            // If the year does not exist, create a new entry.
            await this.annals.insertOne({ year, results });
        }
        logger.log(`[ANNALS] :: Recorded results for year ${year}`);
        return { success: true, message: `[ANNALS] :: Results for year ${year} recorded successfully.` };
    }

    /**
     * Retrieves the results for a given year from the annals collection.
     * @param {number} year - The year to retrieve results for.
     * @return {Promise<Array>} - The results for the specified year.
     */
    async getResultsFromAnnals(year) {
        if (!year) {
            logger.error('Year is required to retrieve results');
            return { success: false}
        }
        const annals = await this.annals.findOne({ year });
        if (!annals) {
            logger.error(`No results found for year ${year}`);
            return { success: false, message: `No results found for the year ${year}` };
        }
        return annals.results;
    }

    /**
     * Retrieves the transaction history for a specific user by their userId.
     * @param {string} userId - The ID of the user.
     * @return {Promise<Array>} - An array of transactions for the user.
     */
    async getUserTransactionHistory(userId) {

        const transactions = await this.transactions.find({ userId }).sort({ timestamp: -1 }).toArray();
        if (!transactions) {
            logger.error(`[getUserTransactionHistory] :: No transactions found for this user`);
        }
        return transactions;
    }

    //====================================================================================================================================
    //#region :: MONTHLY GAINS ::

    /**
     * Calculate the portfolio which has gained the most value over a month-long period and award the user with a $250 bonus.
     * This method is called at the end of each month to determine the top performer.
     * @return {Promise<Object>} - The userId and gain of the top performer.
     */

    async executeMonthlyAwardsCeremony() {

        logger.log(`[MONTHLY GAINS] :: Executing monthly ceremony checks and awards...`);

        const eom = await this.#isEndOfTheMonth();
        if (eom === true) {
           return await this.#EOMTasks(); // EOM tasks
        } else {
            const today = new Date();
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            const daysLeft = Math.ceil((endOfMonth - today) / (1000 * 60 * 60 * 24));

            const resultMessage = daysLeft === 0 
                ? `The ceremony will be held tomorrow! Tell yo' friends.` 
                : `It is not the end of the month yet - only **${daysLeft}** more sleeps!`;
            return { success: false, message: resultMessage };
        }
}

    async #calculateAndAwardTopMonthlyGains() {

        logger.log(`[MONTHLY GAINS] :: Calculating monthly portfolio gains...`);

        // Determine the start of the current month to isolate recent transactions
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Retrieve all transactions since the start of the month to capture opening prices.
        const transactions = await this.transactions.find({ timestamp: { $gte: startOfMonth } }).toArray();
        const userOpenPrices = {}; // { userId: { symbol: openingPrice } }

        // For each buy transaction, record the first observed price as the opening price for that stock.
        for (const tx of transactions) {
            if (tx.type === 'buy') {
                if (!userOpenPrices[tx.userId]) userOpenPrices[tx.userId] = {};
                if (!userOpenPrices[tx.userId][tx.symbol]) {
                    userOpenPrices[tx.userId][tx.symbol] = tx.price;
                }
            }
        }

        // For every user, calculate the largest percentage gain for stocks in their portfolio.
        const userPctGains = {};
        const users = await this.users.find({}).toArray();

        for (const user of users) {
            let maxPctGain = -Infinity;
            if (user.portfolio) {
                for (const symbol in user.portfolio) {
                    // Use the opening price if available; otherwise fall back to the average cost.
                    const openPrice = (userOpenPrices[user.userId] && userOpenPrices[user.userId][symbol]) || user.portfolio[symbol].avgPrice;
                    
                    const response = await this.getStockPrice(symbol);
                    if (!response.success && Object.hasOwn(response, "message")) {
                        return {
                            success: false,
                            message: response.message,
                        }
                    }

                    if (openPrice > 0) {
                        const pctGain = ((response.price - openPrice) / openPrice) * 100;
                        if (pctGain > maxPctGain) {
                            maxPctGain = pctGain;
                        }
                    }
                }
            }

            // If no stocks exist, default to 0% gain.
            userPctGains[user.userId] = maxPctGain === -Infinity ? 0 : maxPctGain;
            logger.log(`[MONTHLY GAINS] :: User ${user.userId} largest percentage gain: ${userPctGains[user.userId].toFixed(2)}%`);
        }

        // Find the user or users with the highest percentage gain.
        let bestGain = -Infinity;
        // let bestUser = null;
        let bestUsers = [];

        for (const userId in userPctGains) {

            const pctGain = userPctGains[userId];
            if (pctGain > 0 && bestGain < 0) {
                // INITIAL CASE
                bestGain = pctGain;
                bestUsers.push({ userId, pctGain });
                logger.log(`[MONTHLY GAINS] :: User ${userId} now has the largest gain (${pctGain.toFixed(2)}%)!`);

            } else if (pctGain > 0 && pctGain === bestGain) {
                // TIE CASE
                bestUsers.push({ userId, pctGain }); // Add current user to the list of best users
                logger.log(`[MONTHLY GAINS] :: User ${userId} has tied for the largest gain!`);

            } else if (pctGain > 0 && pctGain > bestGain) {
                // NEW-BEST CASE
                bestGain = pctGain;
                const bestUser = { userId, pctGain };
                bestUsers = [bestUser]; // Reset best users to only the new best user
                logger.log(`[MONTHLY GAINS] :: New best user found: ${userId} with a gain of ${bestGain.toFixed(2)}%`);
            } else {
                // DEFAULT CASE
                logger.log(`[MONTHLY GAINS] :: Gain does not meet or exceed threshold (${bestGain.toFixed(2) ?? 0}%): ${userId} with a gain of ${pctGain.toFixed(2)}%`);
            }
        }

        if (bestGain === 0) {
            logger.log(`[MONTHLY GAINS] :: No gains found for any user this month.`);
            this.runRollOverBonus = true; // Set flag to roll over the bonus
            return {
                success: false,
                message: `It appears that it was a rough month; no gains were made, folks.\nThe $${Settings.monthlyAward} bonus will roll over into the next month.`
            };
        }
        
        // If multiple users have the same best gain, log them and return a combined userId
        if (bestUsers.length > 1) {

            logger.log(`[MONTHLY GAINS] :: Multiple users with the same gain: ${bestUsers.map(u => u.userId).join(', ')}`);
            // Award all bestUsers with the same gain
            for (const user of bestUsers) {
                await this.users.updateOne({ userId: user.userId }, { $inc: { balance: Settings.monthlyAward } });
                logger.log(`[MONTHLY GAINS] :: Awarded $${Settings.monthlyAward} bonus to user ${user.userId} with a gain of ${bestGain.toFixed(2)}%`);
            }

            return {
                success: true,
                userId: bestUsers.map(u => u.userId).join(', '), // Join userIds if multiple users have the same gain
                gain: bestGain
            };
        } else if (bestUsers.length === 1) {

            // If only one user has the best gain, award them
            await this.users.updateOne({ userId: bestUsers[0].userId }, { $inc: { balance: Settings.monthlyAward } });
            logger.log(`[MONTHLY GAINS] :: Awarded $${Settings.monthlyAward} bonus to user ${bestUsers[0].userId} with a gain of ${bestGain.toFixed(2)}%`);

            return {
                success: true,
                userId: bestUsers.userId,
                gain: bestGain
            };
        } else {

            logger.log(`[MONTHLY GAINS] :: No users have best gains; check the error logs.`);
            return {
                success: false,
                message: "No winner could be determined at this time; please try again later."
            };
        }
    }

    // Roll over the $250 bonus to the next month by increasing the property 
    // "monthlyBonusPool" in the "properties" collection.
    async rollOverBonus() {

        await this.properties.updateOne(
            { key: "prizePool" },
            { $inc: { value: 250 } },
            { upsert: true }
        );

        logger.log(`[MONTHLY GAINS] :: Rolled over the $250 bonus prize to the next month.`);
    }

    async transferMonthlyPrizePool(userId) {
        
        logger.log(`[PRIZE POOL] :: Transferring monthly prize pool to user ${userId}...`);
        const user = await this.users.findOne({ userId });
        
        const prizePool = await this.properties.findOne({ key: 'prizePool' });
        
        if (!prizePool) {
            // If the prize pool is not found in properties, log and return a message.
            logger.error(`[PRIZE POOL] :: Prize pool not found in properties.`);
            return { success: false, message: 'Prize pool not found in properties.' };
        } else if (prizePool.value <= 0) {
            // If the prize pool is empty, log and return a message.
            logger.log(`[PRIZE POOL] :: No prize pool available to transfer.`);
            return { success: false, message: 'No bonus prize pool available to transfer.' };
        } else if (prizePool.value > 0) {
            // If the prize pool has a value, transfer it to the user's balance.
            logger.log(`[PRIZE POOL] :: Transferring prize pool amount of $${prizePool.value.toFixed(2)} to ${user.username}.`);
            await this.users.updateOne(
                { userId },
                { $inc: { balance: prizePool.value } }
            );
            return { success: true, award: prizePool.value, user: user.username };
        }
    }

    /**
     * Calculates the top monthly gains and awards the winner or rolls over the prize to the next month.
     */
    async #EOMTasks() {

        logger.log("[CEREMONY] :: Running end of the month tasks...");
        const ceremony = await this.#calculateAndAwardTopMonthlyGains();

        if (ceremony && ceremony.success) {
            
            logger.log(`[CEREMONY] :: End of the month ceremony completed successfully! Winner: ${ceremony.winner.userId} with gains of $${ceremony.winner.gain}`);
            // If the ceremony was successful, transfer the monthly prize pool to the winner.
            const transferResult = await this.transferMonthlyPrizePool(ceremony.winner.userId);
            if (transferResult.success) {
                logger.log(`[CEREMONY] :: Transferred monthly prize pool of $${transferResult.award} to user ${transferResult.user}.`);
            } else {
                logger.error(`[CEREMONY] :: Failed to transfer monthly prize pool: ${transferResult.message}`);
            }

            return {
                success: ceremony.success && transferResult.success, 
                ceremony: ceremony, 
                prize: transferResult.award, 
                user: transferResult.user
            };

        } else if (this.runRollOverBonus && !ceremony.success) {
            
            await this.rollOverBonus();
            logger.log(`[CEREMONY] :: Rolled $250 bonus over to the next month.`);
            this.runRollOverBonus = false; // Reset the rollover bonus flag
            return { success: false, message: "No winners this month! The prize money has been added to the pool and will be awarded at next month's ceremony!"};

        } else {
            
            logger.error(`[CEREMONY] :: End of the month ceremony failed...`);
            return { success: false, message: "The ceremony failed for some reason - please alert an adult..." };
        }
    }

    /**
     * Checks current date for the last day of the month, and updates a property
     */
    async #checkForMonthChange() {

        const now = new Date();
        let lastDayProp = await this.properties.findOne({ key: 'lastDayOfCurrentMonth' });

        if (!lastDayProp?.value) {
            // If not set, calculate last day of current month and upsert
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            await this.properties.updateOne(
                { key: 'lastDayOfCurrentMonth' },
                { $set: { value: lastDay.toISOString() } },
                { upsert: true }
            );
            lastDayProp = { value: lastDay.toISOString() };

        }  else {
            // Recalculate new end of month if the month rolled over
            const lastDayDate = new Date(lastDayProp.value);
            if (lastDayDate.getMonth() !== now.getMonth() || lastDayDate.getFullYear() !== now.getFullYear()) {
                const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                await this.properties.updateOne(
                    { key: 'lastDayOfCurrentMonth' },
                    { $set: { value: lastDay.toISOString() } },
                    { upsert: true }
                );
                lastDayProp.value = lastDay.toISOString();
            }
        }

        const lastDayDate = new Date(lastDayProp.value);
        if (now >= lastDayDate) {
            await this.properties.updateOne(
                { key: 'endOfMonthFlag' },
                { $set: { value: true } },
                { upsert: true }
            );
            logger.log(`[MONTH CHECK] :: End of month detected, 'endOfMonthFlag' flag set.`);
        } else {
            await this.properties.updateOne(
                { key: 'endOfMonthFlag' },
                { $set: { value: false } },
                { upsert: true }
            );
            logger.log(`[MONTH CHECK] :: Not end of month, 'endOfMonthFlag' flag cleared.`);
        }
    }

    async #FOMTasks() {
        // Reset monthFinalized property to false for the next month.
        logger.log("[HEARTBEAT] :: Running first of the month tasks...");
        await this.properties.updateOne({ key: 'monthFinalized' }, { $set: { value: false } }, { upsert: true });
    }

    /**
     * Checks if the current date is the last day of the month.
     * @returns {boolean} - True if it's the last day of the month, false otherwise.
     */
    async #isEndOfTheMonth() {

        return new Promise( async (resolve, reject) => {
        
            if (!this.properties) return false;

            logger.log(`[EOM CHECK] :: Checking if today is the last day of the month...`);

            const currentDate = new Date();
            const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

            const isEndOfMonth = await this.properties.findOne({key: "endOfMonthFlag"});

            if (isEndOfMonth.value && currentDate.getDate() < lastDayOfMonth.getDate()) {
                logger.log(`[EOM CHECK] :: Today is the last day of the month - preparing for end of month tasks!`);
                resolve(true);
            } else {
                logger.log(`[EOM CHECK] :: Today is NOT the last day of the month - no end of month tasks to run.`);
                resolve(false);
            }
        });
    }

    // Checks to see if today is the first day of the month.
    async #isFirstDayOfTheMonth() {

        return new Promise( async (resolve, reject) => {
            if (!this.properties) return false;

            logger.log(`[EOM CHECK] :: Checking if today is the first day of the month...`);

            const currentDate = new Date();
            const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

            const heartbeat = await this.properties.findOne({ key: 'heartbeatDate' });
            if (
                heartbeat 
                && heartbeat.value 
                && new Date(heartbeat.value).getTime() === firstDayOfMonth.getTime()
            ) {
                resolve(true);
            } else {
                resolve(false);
            }
        })
    }


    //#endregion :: MONTHLY GAINS COMPETITION ::
    //====================================================================================================================================

    //====================================================================================================================================
    //#region :: VIEWS ::

    // Create all views below in one convenient method.
    /**
     * Creates all necessary views for the DumpIt game.
     * This method is called during initialization to set up views for reporting and analytics.
     * @return {Promise<void>}
     */
    async createAllViews() {
        
        logger.log(`[VIEW] :: Creating views...`);

        await this.createUserTransactionsView();
        await this.createUserBalancesView();

        logger.log(`[VIEW] :: All views created successfully.`);
    }

    /**
     * Creates a view for user transactions to facilitate reporting.
     * This view joins the transactions with user data to provide a comprehensive view of each user's transactions.
     * @return {Promise<void>}
     */
    async createUserTransactionsView() {
        
        const viewName = prodDB.views.allUserTransactions.viewName;
        const pipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'user'
                }
            },
            {
                $unwind: '$user'
            },
            {
                $project: {
                    _id: 0,
                    userId: '$user.userId',
                    username: '$user.username',
                    symbol: 1,
                    shares: 1,
                    price: 1,
                    type: 1,
                    timestamp: 1
                }
            }
        ];

        await this.db.createCollection(viewName, { viewOn: 'transactions', pipeline });
        logger.log(`[VIEW] :: Created user transactions view.`);
    }

    /**
     * Creates a view for user balances to facilitate reporting.
     * This view provides a snapshot of each user's current balance and portfolio.
     * @return {Promise<void>}
     */
    async createUserBalancesView() {
        
        const viewName = prodDB.views.userBalances.viewName;
        const pipeline = [
            {
                $project: {
                    _id: 0,
                    userId: 1,
                    username: 1,
                    balance: 1
                }
            }
        ];

        await this.db.createCollection(viewName, { viewOn: 'users', pipeline });
        logger.log(`[VIEW] :: Created user balances view.`);
    }
    
    //#endregion :: Views ::
    //====================================================================================================================================

    //====================================================================================================================================
    //#region :: REPORTS ::

    //

    //#endregion :: REPORTS ::
    //====================================================================================================================================
}