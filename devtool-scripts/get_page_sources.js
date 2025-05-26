// devtools_scripts/get_page_sources.js
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
        
        // Set user agent to avoid bot detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });
        
        // Wait a bit for dynamic content
        await page.waitForTimeout(2000);
        
        const loadedScripts = await page.evaluate(() => {
            try {
                return Array.from(document.scripts).map(script => ({
                    src: script.src || null,
                    type: script.type || 'text/javascript',
                    async: script.async,
                    defer: script.defer,
                    hasInlineCode: !script.src && script.innerHTML.length > 0,
                    inlineLength: script.innerHTML.length
                }));
            } catch (e) {
                return [];
            }
        });
        
        const content = await page.content();
        const mainDocumentHTML = content.substring(0, 5000);
        
        console.log(JSON.stringify({
            sources: {
                mainDocumentHTMLPreview: mainDocumentHTML + (content.length > 5000 ? '...' : ''),
                scripts: loadedScripts.slice(0, 50),
                totalScripts: loadedScripts.length
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