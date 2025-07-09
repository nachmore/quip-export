const colors = require('colors');
const fetch = require('node-fetch');
const LoggerAdapter = require('./common/LoggerAdapter');

const TIMES_LIMIT_503 = 1000;
const DEFAULT_SLEEP_ON_THROTTLE = 60000;

class QuipService {

    static _throttledUntil = 0;

    constructor(accessToken, baseURL = "quip") {
        this.accessToken = accessToken;
        this.apiURL = `https://platform.${baseURL}:443/1`;
        this.logger = new LoggerAdapter();
        this.queryRetryCounter = new Map();
        this.waitingMs = DEFAULT_SLEEP_ON_THROTTLE;
        this.stats = {
            query_count: 0,
            getThread_count: 0,
            updateThread_count: 0,
            getThreads_count: 0,
            getFolder_count: 0,
            getFolders_count: 0,
            getBlob_count: 0,
            getPdf_count: 0,
            getXlsx_count: 0,
            getDocx_count: 0,
            getCurrentUser_count: 0,
            getThreadMessages_count: 0,
            getUser_count: 0
        };
    }

    setLogger(logger) {
        this.logger = logger;
    }

    async checkUser() {
        this.stats.getCurrentUser_count++;

        const res = await fetch(`${this.apiURL}/users/current`, this._getOptions('GET'));

        if (res.ok) return true;

        if (res.status === 429) {
            console.log(colors.red('Your user token is being throttled due to too many requests.'));
            console.log(colors.red('    Sleeping for 1 minute before checking again (Quip does not indicate when your rate will reset)'));

            return new Promise(resolve => setTimeout(() => {
                resolve(this.checkUser());
            }, DEFAULT_SLEEP_ON_THROTTLE));

        } else {
            console.log('Response headers:', Object.fromEntries(res.headers));
            console.log(colors.red(`Error validating user. HTTP ${res.status} - ${res.statusText}`));
        }

        return false;
    }

    async getUser(userIds) {
        this.stats.getUser_count++;
        return this._apiCallJson(`/users/${userIds}`);
    }

    async getCurrentUser() {
        this.stats.getCurrentUser_count++;
        return this._apiCallJson('/users/current');
    }

    async getFolder(folderId) {
        this.stats.getFolder_count++;
        return this._apiCallJson(`/folders/${folderId}`);
    }

    async getThread(threadId) {
        this.stats.getThread_count++;
        return this._apiCallJson(`/threads/${threadId}`);
    }

    // https://quip.com/dev/automation/documentation/current#tag/Threads/operation/editDocument
    async updateThreadSection(threadId, sectionId, content) {
        this.stats.updateThread_count++;
        const data = {
            thread_id: threadId,
            content: content,
            section_id: sectionId,
            location: 4 // 4: REPLACE_SECTION
        };
        return this._apiCallJson(`/threads/edit-document`, 'POST', data);
    }

    async lockThread(threadId) {
        this.stats.query_count++;
        const data = {
            thread_id: threadId,
            edits_disabled: true
        };
        return this._apiCallJson(`/threads/lock-edits`, 'POST', data);
    }

    async getThreadMessages(threadId) {
        this.stats.getThreadMessages_count++;
        return this._apiCallJson(`/messages/${threadId}`);
    }

    async getThreads(threadIds) {
        this.stats.getThreads_count++;
        return this._apiCallJson(`/threads/?ids=${threadIds}`);
    }

    async getFolders(threadIds) {
        this.stats.getFolders_count++;
        return this._apiCallJson(`/folders/?ids=${threadIds}`);
    }

    async getBlob(threadId, blobId) {
        //const random = (Math.random() > 0.8) ? 'random' : '';
        this.stats.getBlob_count++;
        return this._apiCallBlob(`/blob/${threadId}/${blobId}`);
    }

    async getPdf(threadId) {
        this.stats.getPdf_count++;
        return this._apiCallBlob(`/threads/${threadId}/export/pdf`);
    }

    async getDocx(threadId) {
        this.stats.getDocx_count++;
        return this._apiCallBlob(`/threads/${threadId}/export/docx`);
    }

    async getXlsx(threadId) {
        this.stats.getXlsx_count++;
        return this._apiCallBlob(`/threads/${threadId}/export/xlsx`);
    }

    async _apiCallBlob(url, method = 'GET') {
        return this._apiCall(url, method, true);
    }

    async _apiCallJson(url, method = 'GET', data = null) {
        return this._apiCall(url, method, false, data);
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async _apiCall(url, method, blob, data = null) {
        this.stats.query_count++;

        try {
            const res = await fetch(`${this.apiURL}${url}`, this._getOptions(method, data));
            if (!res.ok) {
                if (res.status === 503 || res.status === 429 || res.status == 504) {
                    const currentTime = new Date().getTime();
                    let rateLimitReset = +res.headers.get('x-ratelimit-reset') * 1000;
                    const rateLimitRemaining = res.headers.get('x-ratelimit-remaining');
                    let waitingInMs = this.waitingMs;

                    // if we're rate throttled we need to sleep across all threads. Unfortunately Quip
                    // starts randomly returning 429 responses after the initial 503 throttle response
                    // without the right headers, so we need to share the reset time across threads.
                    if (rateLimitReset < QuipService._throttledUntil) {
                        rateLimitReset = QuipService._throttledUntil;
                    }

                    if (rateLimitReset > currentTime) {
                        if (rateLimitReset > QuipService._throttledUntil) {
                            QuipService._throttledUntil = rateLimitReset;
                        }
                        waitingInMs = rateLimitReset - currentTime;
                    }

                    if (this._checkIfShouldRetryQuery(url, method)) {

                        const waitingInMin = Math.round((waitingInMs/60000) * 100) / 100;

                        this.logger.debug(`HTTP ${res.status}: for ${url}, rate limit remaining: ${rateLimitRemaining} (rate limit reset: ${rateLimitReset}). Sleeping ${waitingInMin}min`);
                        return new Promise(resolve => setTimeout(() => {
                            resolve(this._apiCall(url, method, blob, data));
                        }, waitingInMs));
                    } else {
                        this.logger.error(`Couldn't fetch ${url} (HTTP ${res.status}), tried to get it ${TIMES_LIMIT_503} times. Rate limit remaining: ${rateLimitRemaining}`);
                        return;
                    }
                } else {

                    const apiError = await res.text();
                    this.logger.debug(`Couldn't fetch ${url}, received ${res.status}: ${apiError}`);

                    return;
                }
            }

            if (blob) {
                return res.blob();
            } else {
                return res.json();
            }
        } catch (e) {
            this.logger.error(`Couldn't fetch ${url}. Exception:`);
            this.logger(e);
        }
    }

    _checkIfShouldRetryQuery(url, method = 'GET') {
        const key = `${method}:${url}`;
        let count = this.queryRetryCounter.get(key);
        if (!count) {
            count = 0;
        }

        this.queryRetryCounter.set(key, ++count);
        if (count > TIMES_LIMIT_503) {
            return false;
        }

        return true;
    }

    _getOptions(method, data = null) {
        const options = {
            method: method,
            headers: {
                'Authorization': 'Bearer ' + this.accessToken
            }
        };

        if (method === 'GET') {
            options.headers['Content-Type'] = 'application/json';
        } else if (data) {
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            options.body = new URLSearchParams(data).toString();
        }

        return options;
    }
}

module.exports = QuipService;
