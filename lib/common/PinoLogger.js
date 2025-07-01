const LoggerAdapter =  require('./LoggerAdapter');
const pino = require('pino');

class PinoLogger extends LoggerAdapter {
    constructor(level=LoggerAdapter.LEVELS.INFO, destination, callback) {
        super(level, destination);
        this.logger = pino({
            level,
            prettyPrint: {
                ignore: 'pid,hostname',
                translateTime: 'SYS:dd-mm-yyyy HH:MM:ss.l',
                colorize: destination? false : true
            }
        }, destination);
        this.callback = callback;
    }

    _this(message) {
        if (this.callback) {
            this.callback(message);
        }
    }

    debug (message) {
        this.logger.debug(message);
        this._callback(`🔬 ${message}`)
    }

    info (message) {
        this.logger.info (message);
        this._callback(`ℹ️ ${message}`)
    }

    warn (message) {
        this.logger.warn (message);
        this._callback(`⚠️ ${message}`)
    }

    error (message) {
        this.logger.error(message);
        this._callback(`❌ ${message}`)
    }

    success (message) {
        this.logger.info(message);
        this._callback(`✅ ${message}`)
    }
}

module.exports = PinoLogger;
