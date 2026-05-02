const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test_shutuba.html', 'utf8');
const $ = cheerio.load(html);
const oddsText = $('.Txt_R.Popular').eq(0).text().trim();
console.log('Odds:', oddsText);
