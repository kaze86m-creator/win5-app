import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

async function fetchEucJp(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`ページの取得に失敗しました (Status: ${response.status}) - ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new TextDecoder('euc-jp').decode(arrayBuffer);
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URLが指定されていません。' }, { status: 400 });
    }

    const html = await fetchEucJp(url);
    const $ = cheerio.load(html);

    const raceUrls: { url: string, name: string }[] = [];

    // WIN5ページ構造 (.win5raceresult2) を探す
    $('table.win5raceresult2 tr:nth-child(2) td').each((i, el) => {
      const aTag = $(el).find('a[href*="shutuba.html"]');
      if (aTag.length > 0) {
        let href = aTag.attr('href');
        if (href) {
          const absoluteUrl = new URL(href, url).href;
          const rawText = aTag.html() || '';
          const cleanName = rawText.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
          raceUrls.push({ url: absoluteUrl, name: cleanName });
        }
      }
    });

    if (raceUrls.length !== 5) {
      return NextResponse.json({ 
        error: '指定されたURLから5つのレースURLを抽出できませんでした。WIN5のトップページURLを指定してください。' 
      }, { status: 404 });
    }

    const racesUpdates: any[] = [];

    // 各レースのページをフェッチしてオッズデータを抽出
    for (let i = 0; i < raceUrls.length; i++) {
      const raceData = raceUrls[i];
      const shutubaHtml = await fetchEucJp(raceData.url);
      const $race = cheerio.load(shutubaHtml);

      const horsesOdds: Record<string, string> = {};

      $race('.HorseList').each((j, tr) => {
        const umabanText = $race(tr).find('td[class^="Umaban"]').text().trim();
        const number = parseInt(umabanText, 10);
        
        // オッズ（支持率）の抽出。 .Txt_R.Popular クラスが通常オッズや人気を持っている
        // IDが "odds-X_XX" のようになっているspanを探すか、直接テキストを取る
        let oddsText = $race(tr).find('.Txt_R.Popular span[id^="odds-"]').text().trim();
        if (!oddsText) {
          // ない場合はtd自体のテキスト
          oddsText = $race(tr).find('.Txt_R.Popular').text().trim();
        }
        
        if (!isNaN(number)) {
          const horseId = `h${i + 1}-${number}`;
          // '---.-' などの場合は空文字にするかそのままにする
          horsesOdds[horseId] = oddsText === '---.-' ? '' : oddsText;
        }
      });

      racesUpdates.push({
        id: `race${i + 1}`,
        oddsMap: horsesOdds
      });
    }

    return NextResponse.json({ racesUpdates });

  } catch (error: any) {
    console.error('Scrape Odds error:', error);
    return NextResponse.json({ error: error.message || '予期せぬエラーが発生しました。' }, { status: 500 });
  }
}
