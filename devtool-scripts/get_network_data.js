// devtools_scripts/get_network_data.js
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
        
        const requests = [];
        const responses = [];
        
        page.on('request', request => {
            requests.push({
                url: request.url(),
                method: request.method(),
                resourceType: request.resourceType(),
                headers: request.headers()
            });
        });
        
        page.on('response', response => {
            responses.push({
                url: response.url(),
                status: response.status(),
                statusText: response.statusText(),
                headers: response.headers(),
                fromCache: response.fromCache(),
                fromServiceWorker: response.fromServiceWorker()
            });
        });
        
        await page.goto(url, { 
            waitUntil: 'networkidle0', 
            timeout: 30000 
        });
        
        console.log(JSON.stringify({ 
            network: {
                requests: requests.slice(0, 50),
                responses: responses.slice(0, 50),
                totalRequests: requests.length,
                totalResponses: responses.length
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