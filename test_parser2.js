const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test_shutuba.html', 'utf8');
const $ = cheerio.load(html);

console.log('Class on tr:', $('.HorseName').eq(1).parents('tr').attr('class'));
console.log('HTML of tr:', $('.HorseName').eq(1).parents('tr').html());
