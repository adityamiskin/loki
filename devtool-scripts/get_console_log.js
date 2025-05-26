// devtools_scripts/get_console_logs.js
const puppeteer = require('puppeteer');

(async () => {
    const url = process.argv[2];
    if (!url) {
        console.error(JSON.stringify({ error: "URL is required" }));
        process.exit(1);
    }
    
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const consoleMessages = [];
        const pageErrors = [];
        
        page.on('console', msg => {
            consoleMessages.push({
                type: msg.type(),
                text: msg.text(),
                location: msg.location ? msg.location() : null,
                timestamp: new Date().toISOString()
            });
        });
        
        page.on('pageerror', error => {
            pageErrors.push({
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        });
        
        await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });
        
        // Wait for potential async console messages
        await page.waitForTimeout(3000);
        
        console.log(JSON.stringify({ 
            console: {
                messages: consoleMessages.slice(0, 50),
                errors: pageErrors.slice(0, 20),
                totalMessages: consoleMessages.length,
                totalErrors: pageErrors.length
            }
        }, null, 2));
        
    } catch (e) {
        console.error(JSON.stringify({ 
            error: `Puppeteer error: ${e.message}`,
            stack: e.stack
        }));
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();