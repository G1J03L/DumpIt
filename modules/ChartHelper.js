const puppeteer = require('puppeteer');
const chartjs = require("chart.js");
const fs = require('node:fs');
const path = require('node:path');

//https://www.google.com/search?client=opera-gx&q=nodejs+javascript+render+HTML+to+png&sourceid=opera&ie=UTF-8&oe=UTF-8
//https://www.chartjs.org/docs/latest/getting-started/usage.html
//https://github.com/chartjs/Chart.js

module.exports = class ChartHelper {
    /**
     * Renders a chart using Chart.js and Puppeteer, saves as PNG.
     * @param {Object} chartConfig - Chart.js configuration object.
     * @param {string} outputPath - Path to save the PNG image.
     * @param {Object} [options] - Optional settings (width, height, background).
     */
    static async renderChartToPNG(chartConfig, outputPath, options = {}) {

        const width = options.width || 800;
        const height = options.height || 600;
        const background = options.background || 'white';

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Chart Render</title>
                <style>
                    body { margin: 0; background: ${background}; }
                    canvas { display: block; }
                </style>
            </head>
            <body>
                <canvas id="chart" width="${width}" height="${height}"></canvas>
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                <script>
                    const config = ${JSON.stringify(chartConfig)};
                    const ctx = document.getElementById('chart').getContext('2d');
                    new Chart(ctx, config);
                </script>
            </body>
            </html>
        `;

        const tempHtmlPath = path.join(__dirname, 'temp_chart.html');
        fs.writeFileSync(tempHtmlPath, htmlContent);

        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width, height });
        await page.goto('file://' + tempHtmlPath, { waitUntil: 'networkidle0' });
        // Wait for Chart.js to render
        await page.waitForSelector('#chart');
        await page.waitForTimeout(500); // Give Chart.js time to finish rendering

        const chartElement = await page.$('#chart');
        await chartElement.screenshot({ path: outputPath });

        await browser.close();
        fs.unlinkSync(tempHtmlPath);
    }

    /**
     * Generates a Chart.js line chart configuration.
     * @param {Object} params - Parameters for the chart.
     * @param {string[]} params.labels - Labels for the x-axis.
     * @param {Array<{ label: string, data: number[], borderColor?: string, backgroundColor?: string, fill?: boolean }>} params.datasets - Datasets for the chart.
     * @param {Object} [params.options] - Additional Chart.js options.
     * @returns {Object} Chart.js configuration object for a line chart.
     */
    static createLineChartConfig({ labels, datasets, options = {} }) {
        
        return {
            type: 'line',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    title: {
                        display: false
                    }
                },
                ...options
            }
        };
    }
}