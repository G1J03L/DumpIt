const fs = require("node:fs");
const path = require("node:path");
const { Logging, Options } = require("../app-config.json");
const LoggingLevel = require("./LoggingLevel.js");

module.exports = class Logger
{
    Root = Logging.root ?? "../";
    ConfigPath = "./app-config.json";

    constructor (aLOGPATH = "./logs") {
        
        this.LogsPath = aLOGPATH;
        this.init();
    }

    // If the Root directory is not defined
    init() {

        const root = path.resolve(this.Root);
        const logsPath = path.resolve(root, this.LogsPath);

        if (!fs.existsSync(logsPath))
        {
            if (!Logging.root) { Logging.root = root; }

            if (!fs.existsSync(logsPath))
            {
                fs.mkdirSync(logsPath);
            }

            for (const level in Object.values(LoggingLevel))
            {
                const filename = `${level}.log`;
                const fullPathToLog = path.join(logsPath, filename);

                this.createLogFile(fullPathToLog, level);
                Logging[LoggingLevel[level]] = fullPathToLog;
            }

            this.updateConfig();
        }

        return;
    }

    updateConfig() {

        const json = fs.readFileSync(this.ConfigPath);
        const data = JSON.parse(json);

        data.Paths = Logging;

        fs.writeFile(this.ConfigPath, JSON.stringify(data, null, 4), (err) =>
        {
            if (err) { throw err; }
        });

        return;
    }

    createLogFile(aPATH, aLEVEL) {

        const label = `${aLEVEL.toUpperCase()}`;
        const logpath = path.resolve(aPATH);

        if (!fs.existsSync(logpath))
        {
            fs.writeFile(logpath, "", { flag: "wx" }, (err) =>
            {
                if (err) { throw err; }
            });
    
            fs.appendFile(logpath, `[${label}][${new Date().toISOString()}] Logger initialized...`, "utf-8", (err) =>
            {
                if (err) { throw err; }
            });
        }

        return;
    }

    log(aLogMessage, aPriority = null) {

        if (aLogMessage === null || aLogMessage === "") { return; }

        switch(aPriority)
        {
            case LoggingLevel.error:
                this.error(aLogMessage);
                break;

            case LoggingLevel.debug:
                this.debug(aLogMessage);
                break;

            case LoggingLevel.verbose:
                this.verbose(aLogMessage);
                break;

            case LoggingLevel.info:
                this.info(aLogMessage);
                break;

            case null:
                this.info(aLogMessage);
                break;

            default:
                this.info(aLogMessage);
                break;
        }
    }

    error (aMessage) {

        if (!Options.enableError) { return; }

        const wMessage = aMessage;
        const wDT = new Date().toISOString();
        const wLabel = LoggingLevel.error.toUpperCase();

        const wFormatted = `[${wLabel}][${wDT}] ${wMessage}`;

        if (fs.existsSync(Logging.error))
        {
            fs.appendFile(Logging.error, `\n${wFormatted}`, "utf-8", (err) =>
            {
                if (err) { throw err; }
            });
        }

        return;
    }

    debug (aMessage) {

        if (!Options.enableDebug) { return; }

        const fs = require("node:fs");

        const wMessage = aMessage;
        const wDT = new Date().toISOString();
        const wLabel = LoggingLevel.debug.toUpperCase();

        const wFormatted = `[${wLabel}][${wDT}] ${wMessage}`;

        if (fs.existsSync(Logging.debug))
        {
            fs.appendFile(Logging.debug, `\n${wFormatted}`, "utf-8", (err) =>
            {
                if (err) { throw err; }
            });
        }

        return;
    }

    verbose (aMessage) {

        if (!Options.enableVerbose) { return; }

        const fs = require("node:fs");

        const wMessage = aMessage;
        const wDT = new Date().toISOString();
        const wLabel = LoggingLevel.verbose.toUpperCase();

        const wFormatted = `[${wLabel}][${wDT}] ${wMessage}`;

        if (fs.existsSync(Logging.verbose))
        {
            fs.appendFile(Logging.verbose, `\n${wFormatted}`, "utf-8", (err) =>
            {
                if (err) { throw err; }
            });
        }

        return;
    }

    info (aMessage) {

        if (!Options.enableInfo) { return; }

        const fs = require("node:fs");

        const wMessage = aMessage;
        const wDT = new Date().toISOString();
        const wLabel = LoggingLevel.info.toUpperCase();

        const wFormatted = `[${wLabel}][${wDT}] ${wMessage}`;

        if (fs.existsSync(Logging.info))
        {
            fs.appendFile(Logging.info, `\n${wFormatted}`, "utf-8", (err) =>
            {
                if (err) { throw err; }
            });
        }

        return;
    }
}