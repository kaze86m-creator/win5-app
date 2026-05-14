"use client";

import React, { useState, useEffect } from 'react';
import styles from './page.module.css';
import { db } from '@/lib/firebase';
import { doc, setDoc, collection, getDocs, getDoc } from 'firebase/firestore';
import Link from 'next/link';

type Horse = { id: string; number: number; name: string; odds?: string; popularity?: number };
type Race = { id: string; raceNumber: number; raceName: string; eventId?: string; horses: Horse[] };

export default function AdminPage() {
  const [scrapeUrl, setScrapeUrl] = useState('https://race.netkeiba.com/win5/');
  const [eventId, setEventId] = useState<'saturday' | 'sunday'>('sunday');
  const [selectedRaceIndex, setSelectedRaceIndex] = useState<number | 'all'>('all');
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
    const rawLines = manualText.split('\n').map(l => l.trim());
    const skipWords = ['編集', '◎', '◯', '▲', '△', '☆', '✓', '消', '--'];
    const lines = rawLines.filter(l => l && !skipWords.includes(l) && !/^[◎◯▲△☆✓消]+$/.test(l));

    let currentRace: Race | null = null;
    let raceCount = selectedRaceIndex === 'all' ? 0 : selectedRaceIndex - 1;
    let horseCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. 旧フォーマット (馬番 馬名)
      const oldMatch = line.match(/^(\d+)\s+(.+)$/);
      if (oldMatch) {
        if (!currentRace) {
          raceCount++;
          horseCount = 0;
          currentRace = { id: `${eventId}_race${raceCount}`, eventId, raceNumber: raceCount, raceName: `WIN${raceCount}`, horses: [] };
        }
        currentRace.horses.push({
          id: `${eventId}_h${raceCount}-${oldMatch[1]}`,
          number: parseInt(oldMatch[1], 10),
          name: oldMatch[2].trim()
        });
        continue;
      }

      // 2. 新フォーマット (馬名の次の行がオッズ・人気の連結)
      const nextLine = lines[i + 1];
      let newMatch = false;
      if (nextLine) {
        const infoMatch = nextLine.match(/([\d]+\.\d)\s*(\d{1,2})\s*$/);
        // 現在の行が情報行ではなく、次の行が情報行である場合
        if (infoMatch && !line.match(/([\d]+\.\d)\s*(\d{1,2})\s*$/)) {
          newMatch = true;
          if (!currentRace) {
            raceCount++;
            horseCount = 0;
            currentRace = { id: `${eventId}_race${raceCount}`, eventId, raceNumber: raceCount, raceName: `WIN${raceCount}`, horses: [] };
          }
          horseCount++;
          currentRace.horses.push({
            id: `${eventId}_h${raceCount}-${horseCount}`,
            number: horseCount,
            name: line,
            odds: infoMatch[1],
            popularity: parseInt(infoMatch[2], 10)
          });
          i++; // 次の行(情報行)は消費したのでスキップ
          continue;
        }
      }

      // 3. どちらでもない場合はレース名とみなす
      if (!newMatch) {
        if (currentRace && currentRace.horses.length > 0) {
          races.push(currentRace);
        }
        raceCount++;
        horseCount = 0;
        currentRace = {
          id: `${eventId}_race${raceCount}`,
          eventId: eventId,
          raceNumber: raceCount,
          raceName: line,
          horses: []
        };
      }
    }
    
    if (currentRace && currentRace.horses.length > 0) {
      races.push(currentRace);
    }

    if (races.length === 0) {
      setError('テキストから出馬表を解析できませんでした。形式を確認してください。');
      setPreviewRaces(null);
    } else {
      setPreviewRaces(races);
    }
  };

  // 3. Firestoreへの保存
  const handleSaveToFirestore = async () => {
    if (!previewRaces) return;

    if (selectedRaceIndex === 'all' && previewRaces.length !== 5) {
      if (!confirm(`レース数が5ではありません（現在${previewRaces.length}レース）。本当に保存しますか？`)) {
        return;
      }
    }

    setLoading(true);
    try {
      for (const race of previewRaces) {
        const raceRef = doc(db, 'races', race.id);
        
        if (selectedRaceIndex !== 'all') {
          // 単一レース更新: 既存データを取得してオッズと人気をマージ
          const existingSnap = await getDoc(raceRef);
          if (existingSnap.exists()) {
            const existingRace = existingSnap.data() as Race;
            const newHorses = existingRace.horses.map(existingHorse => {
              // 抽出された馬の中から、名前が部分一致するものを探す（空白などが混じる可能性があるため）
              const updatedHorse = race.horses.find(h => 
                existingHorse.name.includes(h.name) || h.name.includes(existingHorse.name)
              );
              if (updatedHorse) {
                return {
                  ...existingHorse,
                  odds: updatedHorse.odds || existingHorse.odds,
                  popularity: updatedHorse.popularity || existingHorse.popularity
                };
              }
              return existingHorse;
            });
            
            await setDoc(raceRef, {
              ...existingRace,
              horses: newHorses,
              oddsUpdatedAt: new Date().toISOString()
            });
          } else {
            // 既存データがない場合はそのまま保存
            await setDoc(raceRef, {
              ...race,
              updatedAt: new Date().toISOString()
            });
          }
        } else {
          // 全レース上書き
          await setDoc(raceRef, {
            ...race,
            updatedAt: new Date().toISOString()
          });
        }
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
          自動取得が失敗した場合の予備機能です。「レース名」の次の行から「馬番 半角スペース 馬名」の形式で入力してください。<br/>
          または、スマホサイト等からコピーした「馬名＋オッズ・人気」のテキストを貼り付け、レースを選択して「オッズのみ更新」することもできます。
        </p>
        <div className={styles.inputGroup} style={{ marginBottom: '8px' }}>
          <select 
            value={selectedRaceIndex} 
            onChange={e => setSelectedRaceIndex(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className={styles.input}
          >
            <option value="all">すべてのレース (1~5) を解析・出馬表を上書き</option>
            <option value="1">WIN1 のみを解析・オッズと人気をマージ更新</option>
            <option value="2">WIN2 のみを解析・オッズと人気をマージ更新</option>
            <option value="3">WIN3 のみを解析・オッズと人気をマージ更新</option>
            <option value="4">WIN4 のみを解析・オッズと人気をマージ更新</option>
            <option value="5">WIN5 のみを解析・オッズと人気をマージ更新</option>
          </select>
        </div>
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
                    <span>
                      {h.name}
                      {h.odds && h.popularity && <span style={{ color: '#aaa', fontSize: '12px', marginLeft: '8px' }}>({h.odds}倍 / {h.popularity}人気)</span>}
                    </span>
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
