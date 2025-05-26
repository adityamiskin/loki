// devtools_scripts/get_application_storage.js
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
        
        await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });
        
        // Wait for page to fully load
        await page.waitForTimeout(2000);
        
        const cookies = await page.cookies();
        
        const storageData = await page.evaluate(() => {
            const local = {};
            const session = {};
            
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    local[key] = localStorage.getItem(key);
                }
            } catch (e) {
                // localStorage might not be available
            }
            
            try {
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    session[key] = sessionStorage.getItem(key);
                }
            } catch (e) {
                // sessionStorage might not be available
            }
            
            return { local, session };
        });
        
        console.log(JSON.stringify({
            application: {
                cookies: cookies.slice(0, 50),
                localStorage: storageData.local,
                sessionStorage: storageData.session,
                cookieCount: cookies.length,
                localStorageKeys: Object.keys(storageData.local).length,
                sessionStorageKeys: Object.keys(storageData.session).length
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