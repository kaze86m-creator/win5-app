"use client";

import React, { useState, useEffect } from 'react';
import styles from './page.module.css';
import { db } from '@/lib/firebase';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import Link from 'next/link';

type Horse = { id: string; number: number; name: string; odds?: string };
type Race = { id: string; raceNumber: number; raceName: string; eventId?: string; horses: Horse[] };

export default function AdminPage() {
  const [scrapeUrl, setScrapeUrl] = useState('https://race.netkeiba.com/win5/');
  const [eventId, setEventId] = useState<'saturday' | 'sunday'>('sunday');
  const [manualText, setManualText] = useState('');
  const [manualOddsText, setManualOddsText] = useState('');
  const [manualOddsRaceId, setManualOddsRaceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // DBのレース情報
  const [dbRaces, setDbRaces] = useState<Race[]>([]);
  
  useEffect(() => {
    const fetchRaces = async () => {
      const snap = await getDocs(collection(db, 'races'));
      const fetched = snap.docs.map(d => d.data() as Race);
      fetched.sort((a, b) => a.raceNumber - b.raceNumber);
      setDbRaces(fetched);
    };
    fetchRaces();
  }, []);
  
  // 抽出または解析されたレース情報
  const [previewRaces, setPreviewRaces] = useState<Race[] | null>(null);

  // 1. 自動取得 (Scrape)
  const handleAutoFetch = async () => {
    setLoading(true);
    setError(null);
    setPreviewRaces(null);

    try {
      const res = await fetch('/api/scrape-win5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'スクレイピングに失敗しました。');
      }

      const mappedRaces = data.races.map((r: any) => ({
        ...r,
        id: `${eventId}_${r.id}`,
        eventId: eventId,
        horses: r.horses.map((h: any) => ({
          ...h,
          id: `${eventId}_${h.id}`
        }))
      }));
      setPreviewRaces(mappedRaces);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. 手動パース (コピペ用フェイルセーフ)
  // フォーマット例: 
  // [レース名]
  // 1 サトノレーヴ
  // 2 オメガウインク
  const handleManualParse = () => {
    setError(null);
    const races: Race[] = [];
    const lines = manualText.split('\n').map(l => l.trim()).filter(l => l);

    let currentRace: Race | null = null;
    let raceCount = 0;

    for (const line of lines) {
      // レース名らしき行（数字で始まらない行、または「WIN」などの文字を含む行）
      // 簡易的に「数字＋スペース＋文字」に一致しなければレース名として扱う
      const horseMatch = line.match(/^(\d+)\s+(.+)$/);
      
      if (!horseMatch) {
        // レース区切り
        if (currentRace && currentRace.horses.length > 0) {
          races.push(currentRace);
        }
        raceCount++;
        currentRace = {
          id: `${eventId}_race${raceCount}`,
          eventId: eventId,
          raceNumber: raceCount,
          raceName: line,
          horses: []
        };
      } else {
        if (!currentRace) {
          raceCount = 1;
          currentRace = {
            id: `${eventId}_race1`,
            eventId: eventId,
            raceNumber: 1,
            raceName: "WIN1",
            horses: []
          };
        }
        currentRace.horses.push({
          id: `${eventId}_h${raceCount}-${horseMatch[1]}`,
          number: parseInt(horseMatch[1], 10),
          name: horseMatch[2].trim()
        });
      }
    }
    
    if (currentRace && currentRace.horses.length > 0) {
      races.push(currentRace);
    }

    if (races.length === 0) {
      setError('テキストから出馬表を解析できませんでした。フォーマット（馬番 馬名）を確認してください。');
      setPreviewRaces(null);
    } else {
      setPreviewRaces(races);
    }
  };

  // 3. Firestoreへの保存
  const handleSaveToFirestore = async () => {
    if (!previewRaces) return;

    if (previewRaces.length !== 5) {
      if (!confirm(`レース数が5ではありません（現在${previewRaces.length}レース）。本当に保存しますか？`)) {
        return;
      }
    }

    setLoading(true);
    try {
      for (const race of previewRaces) {
        const raceRef = doc(db, 'races', race.id);
        await setDoc(raceRef, {
          ...race,
          updatedAt: new Date().toISOString()
        });
      }
      alert('Firestoreに保存しました！メイン画面で確認してください。');
      setPreviewRaces(null);
      setManualText('');
    } catch (err: any) {
      setError('保存に失敗しました: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 4. 最新オッズの自動取得・更新
  const handleUpdateOdds = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scrape-odds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'オッズ取得に失敗しました。');
      
      const { racesUpdates } = data; 

      const racesSnap = await getDocs(collection(db, 'races'));
      if (racesSnap.empty) {
        throw new Error('Firestoreにレースデータがありません。先に出馬表を保存してください。');
      }

      let updatedCount = 0;
      for (const docSnap of racesSnap.docs) {
        const raceData = docSnap.data() as Race;
        const updateData = racesUpdates.find((u: any) => u.id === raceData.id.replace(`${eventId}_`, ''));
        if (updateData) {
          const newHorses = raceData.horses.map(h => {
            const shortHorseId = h.id.replace(`${eventId}_`, '');
            if (updateData.oddsMap[shortHorseId] !== undefined) {
              return { ...h, odds: updateData.oddsMap[shortHorseId] };
            }
            return h;
          });
          
          await setDoc(doc(db, 'races', raceData.id), {
            ...raceData,
            horses: newHorses,
            oddsUpdatedAt: new Date().toISOString()
          });
          updatedCount++;
        }
      }
      
      alert(`${updatedCount}レースのオッズ情報を更新しました！メイン画面で確認してください。`);
      // dbRacesを更新
      const newSnap = await getDocs(collection(db, 'races'));
      const newFetched = newSnap.docs.map(d => d.data() as Race);
      newFetched.sort((a, b) => a.raceNumber - b.raceNumber);
      setDbRaces(newFetched);
    } catch (err: any) {
      setError('オッズ更新エラー: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 5. オッズ手動更新 (フェイルセーフ)
  const handleManualOddsUpdate = async () => {
    if (!manualOddsRaceId) {
      setError('更新するレースを選択してください。');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const targetRace = dbRaces.find(r => r.id === manualOddsRaceId);
      if (!targetRace) throw new Error('指定されたレースが見つかりません。');
      
      const lines = manualOddsText.split('\n').map(l => l.trim()).filter(l => l);
      const oddsMap: Record<string, string> = {};
      
      for (const line of lines) {
        // 例: "1 サトノレーヴ 2.4" または "1番 12.3倍" など
        // 最初に見つかった整数を馬番とし、最後に見つかった数値をオッズとみなす
        const tokens = line.split(/\s+/);
        if (tokens.length >= 2) {
          // 数字だけを抽出
          const numbers = line.match(/\d+(\.\d+)?/g);
          if (numbers && numbers.length >= 2) {
             const umabanStr = numbers[0];
             const oddsStr = numbers[numbers.length - 1]; // 行の最後の数字をオッズとする
             
             const umaban = parseInt(umabanStr, 10);
             if (!isNaN(umaban)) {
               const horseId = targetRace.horses.find(h => h.number === umaban)?.id;
               if (horseId) {
                 oddsMap[horseId] = oddsStr;
               }
             }
          }
        }
      }
      
      if (Object.keys(oddsMap).length === 0) {
        throw new Error('馬番とオッズのペアを解析できませんでした。テキストのフォーマットを確認してください。');
      }
      
      // 更新
      const newHorses = targetRace.horses.map(h => {
        if (oddsMap[h.id] !== undefined) {
          return { ...h, odds: oddsMap[h.id] };
        }
        return h;
      });
      
      await setDoc(doc(db, 'races', targetRace.id), {
        ...targetRace,
        horses: newHorses,
        oddsUpdatedAt: new Date().toISOString()
      });
      
      alert(`レース「${targetRace.raceName}」のオッズを手動更新しました！`);
      setManualOddsText('');
      
      // dbRacesを更新
      const newSnap = await getDocs(collection(db, 'races'));
      const newFetched = newSnap.docs.map(d => d.data() as Race);
      newFetched.sort((a, b) => a.raceNumber - b.raceNumber);
      setDbRaces(newFetched);
    } catch (err: any) {
      setError('オッズ手動更新エラー: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className={styles.title}>WIN5 管理者画面</h1>
        <Link href="/" style={{ color: '#ccc', textDecoration: 'underline' }}>メイン画面に戻る</Link>
      </div>

      <div className={styles.card} style={{ marginBottom: '16px', background: 'var(--card-bg-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontWeight: 'bold' }}>📅 対象曜日:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type="radio" name="eventId" value="saturday" checked={eventId === 'saturday'} onChange={() => setEventId('saturday')} />
            土曜日
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type="radio" name="eventId" value="sunday" checked={eventId === 'sunday'} onChange={() => setEventId('sunday')} />
            日曜日
          </label>
        </div>
        <p style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>※ここで選択した曜日に紐づけてデータが保存されます。</p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>🌐 自動取得 (APIスクレイピング)</h2>
        <p style={{ fontSize: '14px', color: '#aaa', marginBottom: '16px' }}>
          NetkeibaなどのWIN5出馬表ページURLを指定して自動抽出します。
        </p>
        <div className={styles.inputGroup}>
          <input 
            type="text" 
            value={scrapeUrl}
            onChange={e => setScrapeUrl(e.target.value)}
            className={styles.input}
            placeholder="https://race.netkeiba.com/win5/..."
          />
          <button 
            onClick={handleAutoFetch}
            disabled={loading || !scrapeUrl}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            {loading ? '処理中...' : '出馬表を自動取得'}
          </button>
          <button 
            onClick={handleUpdateOdds}
            disabled={loading || !scrapeUrl}
            className={`${styles.btn} ${styles.btnOdds}`}
          >
            {loading ? '処理中...' : '最新オッズを取得・更新'}
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>✍️ 手動コピペ (フェイルセーフ用)</h2>
        <p style={{ fontSize: '14px', color: '#aaa', marginBottom: '16px' }}>
          自動取得が失敗した場合の予備機能です。「レース名」の次の行から「馬番 半角スペース 馬名」の形式で入力してください。
        </p>
        <div className={styles.inputGroup}>
          <textarea 
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            className={styles.textarea}
            placeholder={`東京10R 晩春ステークス\n1 サトノレーヴ\n2 オメガウインク\n...\n京都10R 橘ステークス\n1 エポックヴィーナス\n...`}
          />
          <button 
            onClick={handleManualParse}
            disabled={loading || !manualText}
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            テキストを解析してプレビュー
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>✍️ オッズ手動更新 (フェイルセーフ用)</h2>
        <p style={{ fontSize: '14px', color: '#aaa', marginBottom: '16px' }}>
          自動取得が失敗した場合の予備機能です。対象レースを選択し、「馬番」と「オッズ」が含まれるテキストを貼り付けてください。<br/>
          (例: 「1 サトノレーヴ 2.4」や「1枠 1番 12.3倍」など。行の最初の数字を馬番、最後の数字をオッズとして解析します)
        </p>
        <div className={styles.inputGroup}>
          <select
            value={manualOddsRaceId}
            onChange={e => setManualOddsRaceId(e.target.value)}
            className={styles.input}
          >
            <option value="">-- 更新するレースを選択 --</option>
            {dbRaces.map(race => (
              <option key={race.id} value={race.id}>
                WIN{race.raceNumber} ({race.id.includes('saturday') ? '土' : '日'}) : {race.raceName}
              </option>
            ))}
          </select>
          <textarea 
            value={manualOddsText}
            onChange={e => setManualOddsText(e.target.value)}
            className={styles.textarea}
            placeholder={`1 サトノレーヴ 2.4\n2 オメガウインク 10.5\n3 ドゥラモンド 100.1\n...`}
          />
          <button 
            onClick={handleManualOddsUpdate}
            disabled={loading || !manualOddsText || !manualOddsRaceId}
            className={`${styles.btn} ${styles.btnOdds}`}
          >
            テキストを解析してオッズを更新
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBox}>
          <strong>エラー:</strong> {error}
        </div>
      )}

      {previewRaces && (
        <div className={styles.card} style={{ borderColor: 'var(--accent-gold)' }}>
          <h2 className={styles.cardTitle}>👀 プレビュー</h2>
          <p style={{ fontSize: '14px', color: '#aaa' }}>内容を確認し、問題なければFirestoreに保存してください。</p>
          
          <div className={styles.previewGrid}>
            {previewRaces.map((race) => (
              <div key={race.id} className={styles.previewRace}>
                <div className={styles.previewRaceTitle}>WIN{race.raceNumber} : {race.raceName}</div>
                {race.horses.map((h) => (
                  <div key={h.id} className={styles.previewHorse}>
                    <span style={{ width: '20px', fontWeight: 'bold' }}>{h.number}</span>
                    <span>{h.name}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className={styles.previewActions}>
            <button 
              onClick={handleSaveToFirestore}
              disabled={loading}
              className={`${styles.btn} ${styles.btnDanger}`}
              style={{ padding: '16px 32px', fontSize: '18px' }}
            >
              🔥 プレビュー内容でFirestoreに保存 (公開)
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
