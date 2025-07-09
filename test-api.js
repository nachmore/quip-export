#!/usr/bin/env node

'use strict';

const QuipService = require('./lib/QuipService');

// Get token and base URL from command line arguments
const ACCESS_TOKEN = process.argv[2] || 'YOUR_TOKEN_HERE';
const BASE_URL = process.argv[3] || 'quip.com';

async function test() {
    if (ACCESS_TOKEN === 'YOUR_TOKEN_HERE') {
        console.error('Usage: node test-api.js <ACCESS_TOKEN> [BASE_URL]');
        process.exit(1);
    }
    const quipService = new QuipService(ACCESS_TOKEN, BASE_URL);

    // Enable debug logging
    const logger = {
        debug: (msg) => console.log('[DEBUG]', msg),
        error: (msg) => console.error('[ERROR]', msg),
        warn: (msg) => console.warn('[WARN]', msg),
        success: (msg) => console.log('[SUCCESS]', msg)
    };
    quipService.setLogger(logger);

    try {
        // Test user check
        console.log('Checking user...');
        const userValid = await quipService.checkUser();
        console.log('User valid:', userValid);

        // Get current user
        console.log('\nGetting current user...');
        const user = await quipService.getCurrentUser();
        console.log('User:', user);

        // Example: Get a thread (replace with actual thread ID)
        const threadId = '4p3aAQMauqCW';
        console.log('\nGetting thread...');
        const thread = await quipService.getThread(threadId);
        console.log('Thread:', thread);

        // Example: Lock a thread
        console.log('\nLocking thread...');
        const lockResult = await quipService.lockThread(threadId);
        console.log('Lock result:', lockResult);

        // Example: Update thread title
        // console.log('\nUpdating thread...');
        // const updateResult = await quipService.updateThread(threadId, { title: 'New Title' });
        // console.log('Update result:', updateResult);

    } catch (error) {
        console.error('Error:', error);
    }
}

test();