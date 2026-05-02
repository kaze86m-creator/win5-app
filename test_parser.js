const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test_shutuba.html', 'utf8');
const $ = cheerio.load(html);
const horses = [];
$('.HorseList').each((i, el) => {
  const umaban = $(el).find('.Umaban').text().trim();
  const name = $(el).find('.HorseName a, .HorseName').text().trim();
  if (umaban && name) horses.push({umaban, name: name.replace(/\\n/g, '').trim()});
});
console.log('Using .HorseList:', horses);

const horses2 = [];
$('tr').each((i, el) => {
  const text = $(el).text();
  if (text.includes('枠')) {
     const umaban = $(el).find('.Umaban, td:nth-child(2)').text().trim();
     const name = $(el).find('.HorseName a, .HorseName, td:nth-child(4)').text().trim();
     if (umaban && name && !isNaN(parseInt(umaban, 10))) horses2.push({umaban, name: name.replace(/\\n/g, '').trim()});
  }
});
console.log('Using tr with Umaban and HorseName:', horses2);

console.log($('.Umaban').length, $('.HorseName').length);
