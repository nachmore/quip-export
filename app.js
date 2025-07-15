const path = require('path');
const Spinner = require('cli-spinner').Spinner;
const colors = require('colors');
const cliProgress = require('cli-progress');
const JSZip = require('jszip');
const fs = require('fs');
const moment = require('moment');
const readline = require('readline');

//PinoLogger implements LoggerAdapter-Interface
//It is possible to use another logger instead of PinoLogger
const PinoLogger = require('./lib/common/PinoLogger');
const QuipProcessor = require('./lib/QuipProcessor');
const QuipService = require('./lib/QuipService');
const utils = require('./lib/common/utils');
const CliArguments = require('./lib/cli/CliArguments');

//EJS template for html documents
const documentTemplate = utils.readTextFile(path.join(__dirname, './lib/templates/document.ejs'));
//CSS style for html documents
const documentCSS = utils.readTextFile(path.join(__dirname, './lib/templates/document.css'));

class App {
    constructor() {
        this.Logger = {};
        this.desinationFolder;
        this.cliArguments;
        this.zip;
        this.quipProcessor;
        this.spinnerIndicator = new Spinner(' %s  read 0 folder(s) | 0 thread(s)');
        this.progressIndicator = new cliProgress.Bar({
            format: '   |{bar}| {percentage}% | {value}/{total} threads | ETA: {eta_formatted}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: false
        });
        this.phase;
    }

    /*
    callback-function for file saving
    */
    fileSaver(data, fileName, type, filePath) {
        if (type === 'BLOB') {
            if (this.cliArguments.zip) {
                this.zip.folder(filePath).file(fileName, data.arrayBuffer());
            } else {
                utils.writeBlobFile(path.join(this.desinationFolder, "quip-export", filePath, fileName), data);
            }
        } else {
            if (this.cliArguments.zip) {
                this.zip.folder(filePath).file(fileName, data);
            } else {
                utils.writeTextFile(path.join(this.desinationFolder, "quip-export", filePath, fileName), data);
            }
        }
    }

    /*
    callback-function to show the last log message on the cli
    */
    printLogMessage(log) {
        this.progressFunc(null, log);
    }

    _lastLog = '';

    trunacteLog(str) {
        // -2 for a bit of margin
        const maxLength = (process.stdout.columns || 80) - 2;

        if (str.length <= maxLength)
            return str;

        const half = Math.floor((maxLength - 3) / 2);

        return str.slice(0, half) + '...' + str.slice(str.length - half);
    }

    /*
    callback-function for progress indication
    */
    progressFunc(progress, lastLog = null) {

        // only print progress if we're in a progress status (otherwise log messages
        // just get spewed everywhere)
        if (this.phase !== 'ANALYSIS' && this.phase !== 'EXPORT') {
            return;
        }

        if (!lastLog) {
            lastLog = this._lastLog;
        } else {
            const now = new Date();
            const timeHM = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            lastLog = this._lastLog = this.trunacteLog(timeHM + ' ' + lastLog);
        }

        // cli-progress and spinner don't actually support newlines in the status,
        // so instead do shenanigans to move the cursor, print the last log line
        // and then the progress bar
        readline.moveCursor(process.stdout, 0, -1);
        readline.clearLine(process.stdout, 0);
        process.stdout.write(lastLog + '\n');
        readline.moveCursor(process.stdout, 0, 1)

        if (this.phase === 'ANALYSIS' && progress) {
            this.spinnerIndicator.text = ` %s  read ${progress.readFolders} folder(s) | ${progress.readThreads} thread(s)`;
        }
        else if (this.phase === 'EXPORT') {
            this.progressIndicator.update(progress?.threadsProcessed ?? null);
        }
    }

    /*
    callback-function for export life cycle phases
    available phases:
        START - start of process
        STOP -  end of process
        ANALYSIS - folder/threads structure analysis
        EXPORT - export
     */
    phaseFunc(phase, prevPhase) {
        this.phase = phase;
        if (phase === 'START') {
            process.stdout.write(colors.gray(`Quip API: ${this.quipProcessor.quipService.apiURL}`));
            process.stdout.write('\n');
        }

        if (phase === 'ANALYSIS') {
            process.stdout.write('\n');
            process.stdout.write(colors.cyan('Analysing folders...'));
            process.stdout.write('\n\n');

            this.spinnerIndicator.setSpinnerDelay(80);
            this.spinnerIndicator.setSpinnerString("|/-\\");

            this.spinnerIndicator.start();
        }

        if (prevPhase === 'ANALYSIS') {
            this.spinnerIndicator.onTick(`    read ${this.quipProcessor.foldersTotal} folder(s) | ${this.quipProcessor.threadsTotal} thread(s)`);
            this.spinnerIndicator.stop();
            process.stdout.write('\n');
        }

        if (phase === 'EXPORT') {
            process.stdout.write('\n');
            process.stdout.write(colors.cyan('Exporting...'));
            process.stdout.write('\n\n');

            this.progressIndicator.start(this.quipProcessor.threadsTotal, 0);
        }

        if (prevPhase === 'EXPORT') {
            this.progressIndicator.stop();
            process.stdout.write('\n');
        }
    }

    //main entry point
    async main() {
        console.log();
        const versionInfo = await utils.getVersionInfo();

        //cli arguments parsing and validation
        try {
            this.cliArguments = CliArguments();
        } catch (message) {
            console.log(message);
            return;
        }

        //current folder as destination, if not set
        this.desinationFolder = (this.cliArguments.destination || process.cwd());

        if (this.cliArguments.debug) {
            this.Logger = new PinoLogger(
                PinoLogger.LEVELS.DEBUG,
                `${this.desinationFolder}/export.log`,
                this.printLogMessage.bind(this));
        } else {
            this.Logger = new PinoLogger(
                PinoLogger.LEVELS.INFO,
                `${this.desinationFolder}/export.log`,
                this.printLogMessage.bind(this));
        }

        console.log(`Quip-Export v${versionInfo.localVersion}`);

        if (versionInfo.localOutdate) {
            utils.cliBox(`!!!! A new version of Quip-Export (v${versionInfo.remoteVersion}) is available.`);
        }

        if (this.cliArguments['comments'] && this.cliArguments['docx']) {
            console.log('Docx export: comments are not supported for docx/xlsx exports');
        }

        //Token verification
        const quipService = new QuipService(this.cliArguments.token, this.cliArguments['base-url']);
        quipService.setLogger(this.Logger);

        if (!await quipService.checkUser()) {
            console.log(colors.red('ERROR: Token is wrong or expired.'));
            console.log(colors.blue(`Visit: https://${this.cliArguments['base-url']}/dev/token to generate a token.`));
            return;
        }

        console.log(`Destination folder: ${this.desinationFolder}`);

        //activate zip
        if (this.cliArguments.zip) {
            this.zip = new JSZip();
        }

        this.quipProcessor = new QuipProcessor(this.cliArguments.token, this.fileSaver.bind(this), this.progressFunc.bind(this), this.phaseFunc.bind(this),
            {
                documentTemplate,
                documentCSS: this.cliArguments['embedded-styles'] ? documentCSS : '',
                embeddedImages: this.cliArguments['embedded-images'],
                comments: this.cliArguments['comments'],
                docx: this.cliArguments['docx'],
                html: this.cliArguments['html'],
                lock: this.cliArguments['lock'],
                titlePrefix: this.cliArguments['title-prefix'],
            }, this.cliArguments['base-url']);

        this.quipProcessor.setLogger(this.Logger);

        // Create CSS file when HTML export is enabled and styles are not embedded
        const shouldExportHtml = this.cliArguments['html'] || (!this.cliArguments['docx'] && !this.cliArguments['html']);
        if (!this.cliArguments['embedded-styles'] && shouldExportHtml) {
            if (this.cliArguments.zip) {
                this.zip.file('document.css', documentCSS);
            } else {
                utils.writeTextFile(path.join(this.desinationFolder, "quip-export", 'document.css'), documentCSS);
            }
        }

        let foldersToExport = [
            //'FOLDER-1'
            //'FOLDER-2'
            //'EVZAOAW2e6U',
            //'UPWAOAAEpFn', //Test
            //'bGGAOAKTL4Y' //Test/folder1
            //'EJCAOAdY90Y', // Design patterns
            //'NBaAOAhFXJJ' //React
        ];

        if (this.cliArguments['folders']) {
            foldersToExport = this.cliArguments['folders'];
        }

        const startTime = new Date().getTime();

        await this.quipProcessor.startExport(foldersToExport);

        const durationStr = moment.utc(new Date().getTime() - startTime).format("HH:mm:ss");

        this.Logger.debug(this.quipProcessor.quipService.stats);
        this.Logger.debug(`Export duration: ${durationStr}`);

        console.log(`Export duration: ${durationStr}`);

        if (this.cliArguments.zip) {
            //save zip file
            const content = await this.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
            await fs.writeFile(path.join(this.desinationFolder, 'quip-export.zip'), content, () => {
                console.log("Zip-file has been saved: ", path.join(this.desinationFolder, 'quip-export.zip'));
            });
        }
    }
}

module.exports = { App, documentTemplate, documentCSS };