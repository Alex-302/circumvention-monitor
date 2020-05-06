/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const consola = require('consola');
const puppeteer = require('puppeteer');
const Matcher = require('./matcher');
const { Report, reasons } = require('./report');

function createMatchers(system) {
    const matchers = [];

    // Go through system criteria and check
    for (const criteria of system.criteria) {
        matchers.push(new Matcher(criteria));
    }

    return matchers;
}

/**
 * Monitors ad systems specified in the configuration.
 * See conf/configuration.json for the configuration example.
 *
 * @param {*} configuration - monitor configuration.
 * @returns {Report} monitor report
 */
async function monitor(configuration) {
    const report = new Report();

    for (const system of configuration.observe) {
        consola.info(`Evaluating ${system.name}`);

        const matchers = createMatchers(system);

        const browser = await puppeteer.launch();

        for (const pageUrl of system.pages) {
            const page = await browser.newPage();
            let foundMatches = false;

            page.on('response', async (res) => {
                try {
                    const request = await res.request();
                    const url = await res.url();
                    const resourceType = await request.resourceType();
                    let content = null;
                    if (resourceType === 'document'
                        || resourceType === 'stylesheet'
                        || resourceType === 'script') {
                        content = await res.text();
                    }
                    consola.debug(`${url} ${resourceType} content found: ${content != null}`);

                    for (const m of matchers) {
                        if (m.test(url, pageUrl, resourceType, content)) {
                            // Register positive result and immediatey exit
                            report.addPositiveResult(system.name, pageUrl, url);
                            foundMatches = true;
                            return;
                        }
                    }
                } catch (ex) {
                    consola.warn(`${pageUrl}: ${ex}`);
                }
            });

            try {
                await page.goto(pageUrl, { waitUntil: 'networkidle0' });

                if (!foundMatches) {
                    // No matching criteria found, adding negative result
                    report.addNegativeResult(system.name, pageUrl, reasons.NotFound);
                }
            } catch (ex) {
                consola.warn(`${pageUrl} is not available: ${ex}`);
                report.addNegativeResult(system.name, pageUrl, reasons.WebsiteDown);
            } finally {
                await page.close();
            }
        }

        await browser.close();

        consola.info(`Finished evaluating ${system.name}`);
    }

    return report;
}

module.exports = monitor;