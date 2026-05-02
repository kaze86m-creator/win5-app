const fs = require('fs');
const cheerio = require('cheerio');
const https = require('https');

async function fetchEucJp(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error('Status: ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(new TextDecoder('euc-jp').decode(buffer));
      });
    }).on('error', reject);
  });
}

async function scrape() {
  const html = fs.readFileSync('test_shutuba.html', 'utf8');
  const $ = cheerio.load(html);
  const horses = [];
  $('.HorseList').each((i, el) => {
    const umaban = $(el).find('.Umaban').text().trim(); // Or sometimes td[class*="Umaban"] or div etc
    const name = $(el).find('.HorseName a, .HorseName').text().trim();
    if (umaban && name) {
      horses.push({umaban, name: name.replace(/\\n/g, '').trim()});
    }
  });
  console.log('Horses:', horses);
}

scrape();
