"use client";

import React, { useState } from 'react';
import styles from './AdminPanel.module.css';
import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, collection, getDocs, addDoc } from 'firebase/firestore';

type Horse = { id: string; number: number; name: string };
type Race = { id: string; raceNumber: number; raceName: string; eventId?: string; horses: Horse[] };

type RaceResult = {
  firstPlaceId: string;
  secondPlaceId?: string;
  thirdPlaceId?: string;
};

interface AdminPanelProps {
  races: Race[];
  resultsData: Record<string, RaceResult>;
  userId?: string | null;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ races, resultsData, userId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHorses, setSelectedHorses] = useState<Record<string, RaceResult>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const handleSelect = (raceId: string, place: 'firstPlaceId' | 'secondPlaceId' | 'thirdPlaceId', horseId: string) => {
    setSelectedHorses(prev => ({
      ...prev,
      [raceId]: {
        ...(prev[raceId] || {}),
        [place]: horseId
      }
    }));
  };

  const handleSaveResult = async (raceId: string) => {
    const selections = selectedHorses[raceId];
    if (!selections || !selections.firstPlaceId) {
      alert("1着馬は必須です。");
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(doc(db, 'results', raceId), {
        firstPlaceId: selections.firstPlaceId,
        secondPlaceId: selections.secondPlaceId || null,
        thirdPlaceId: selections.thirdPlaceId || null,
        updatedAt: new Date().toISOString()
      });
      alert('結果を保存しました！');
    } catch (error) {
      console.error(error);
      alert('エラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearResult = async (raceId: string) => {
    if (!confirm('このレースの結果を未確定に戻しますか？')) return;
    
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'results', raceId));
      setSelectedHorses(prev => {
        const next = { ...prev };
        delete next[raceId];
        return next;
      });
    } catch (error) {
      console.error(error);
      alert('エラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm('今週の成績を集計してアーカイブ（保存）します。よろしいですか？\n※全レースの結果が確定している必要があります。')) return;

    if (Object.keys(resultsData).length < races.length) {
      alert('全レースの結果が確定していません。');
      return;
    }

    setIsArchiving(true);
    try {
      // 1. Get all votes
      const votesSnap = await getDocs(collection(db, 'votes'));
      
      type UserTempStats = {
        totalVotes: number;
        totalRaces: Set<string>;
        winHitRaces: Set<string>;
        placedHitRaces: Set<string>;
      };

      const userStatsMap: Record<string, UserTempStats> = {};

      const currentRaceIds = new Set(races.map(r => r.id));

      votesSnap.docs.forEach(docSnap => {
        const vote = docSnap.data();
        const { userId: vUserId, raceId, horseId } = vote;

        // 現在表示されているイベント（曜日）の投票のみを集計対象とする
        if (!currentRaceIds.has(raceId)) return;

        if (!userStatsMap[vUserId]) {
          userStatsMap[vUserId] = { 
            totalVotes: 0, 
            totalRaces: new Set(), 
            winHitRaces: new Set(), 
            placedHitRaces: new Set() 
          };
        }

        userStatsMap[vUserId].totalVotes += 1;
        userStatsMap[vUserId].totalRaces.add(raceId);

        const result = resultsData[raceId];
        if (result) {
          if (horseId === result.firstPlaceId) {
            userStatsMap[vUserId].winHitRaces.add(raceId);
            userStatsMap[vUserId].placedHitRaces.add(raceId);
          } else if (horseId === result.secondPlaceId || horseId === result.thirdPlaceId) {
            userStatsMap[vUserId].placedHitRaces.add(raceId);
          }
        }
      });

      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const currentEventId = races.length > 0 ? (races[0] as any).eventId || 'sunday' : 'sunday';

      // 2. Save stats to userStats collection
      for (const [uid, stats] of Object.entries(userStatsMap)) {
        await addDoc(collection(db, 'userStats'), {
          userId: uid,
          date: dateStr,
          eventId: currentEventId,
          totalVotes: stats.totalVotes,
          totalRaces: stats.totalRaces.size,
          winHitRacesCount: stats.winHitRaces.size,
          placedHitRacesCount: stats.placedHitRaces.size,
          timestamp: new Date().toISOString()
        });
      }

      // 3. 次週に向けたデータのリセット (対象曜日のみ)
      
      // 3-1. 投票データの削除
      for (const docSnap of votesSnap.docs) {
        const vote = docSnap.data();
        if (currentRaceIds.has(vote.raceId)) {
          await deleteDoc(doc(db, 'votes', docSnap.id));
        }
      }

      // 3-2. レース結果の削除
      for (const raceId of currentRaceIds) {
        await deleteDoc(doc(db, 'results', raceId));
      }

      // 3-3. 出馬表のリセット
      for (const race of races) {
        const raceRef = doc(db, 'races', race.id);
        await setDoc(raceRef, {
          ...race,
          raceName: `WIN${race.raceNumber}`,
          horses: [],
          updatedAt: new Date().toISOString()
        });
      }

      const dayName = currentEventId === 'saturday' ? '土曜日' : '日曜日';
      alert(`【${dayName}】の成績アーカイブと次週向けのリセットが完了しました！`);
    } catch (error) {
      console.error(error);
      alert('アーカイブ中にエラーが発生しました');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleForceReset = async () => {
    if (!confirm('本当に成績を保存せずにデータを強制リセットしますか？この操作は取り消せません。')) return;

    setIsArchiving(true);
    try {
      const currentEventId = races.length > 0 ? (races[0] as any).eventId || 'sunday' : 'sunday';
      
      const racesSnap = await getDocs(collection(db, 'races'));
      const eventRaceDocs = racesSnap.docs.filter(d => {
        const docId = d.id;
        const raceEventId = docId.includes('_') ? docId.split('_')[0] : ((d.data() as any).eventId || 'sunday');
        return raceEventId === currentEventId;
      });
      const allTargetRaceIds = new Set(eventRaceDocs.map(d => d.id));

      const votesSnap = await getDocs(collection(db, 'votes'));

      // 1. 投票データの削除（ゴーストデータ分も含む）
      for (const docSnap of votesSnap.docs) {
        const vote = docSnap.data();
        if (allTargetRaceIds.has(vote.raceId)) {
          await deleteDoc(doc(db, 'votes', docSnap.id));
        }
      }

      // 2. レース結果の削除（ゴーストデータ分も含む）
      for (const raceId of allTargetRaceIds) {
        await deleteDoc(doc(db, 'results', raceId));
      }

      // 3. 出馬表の完全クリーンアップと再生成
      // まず既存の対象曜日の全レースドキュメント（ゴーストデータ含む）を削除
      for (const docSnap of eventRaceDocs) {
        await deleteDoc(doc(db, 'races', docSnap.id));
      }

      // 確実にインデックス1〜5の5つのドキュメントだけを初期状態として再生成
      for (let i = 1; i <= 5; i++) {
        const newId = `${currentEventId}_race${i}`;
        const raceRef = doc(db, 'races', newId);
        await setDoc(raceRef, {
          id: newId,
          eventId: currentEventId,
          raceNumber: i,
          raceName: `WIN${i}`,
          horses: [],
          updatedAt: new Date().toISOString()
        });
      }

      const dayName = currentEventId === 'saturday' ? '土曜日' : '日曜日';
      alert(`【${dayName}】のデータを強制リセットしました！`);
    } catch (error) {
      console.error(error);
      alert('リセット中にエラーが発生しました');
    } finally {
      setIsArchiving(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', marginBottom: '16px', fontSize: '12px' }}
      >
        ⚙️ レース結果入力・アーカイブパネルを開く
      </button>
    );
  }

  return (
    <div className={styles.adminPanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div className={styles.adminTitle}>
          ⚙️ レース結果入力 (1着〜3着)
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          style={{ background: 'transparent', color: '#ccc', border: 'none', cursor: 'pointer', fontSize: '12px' }}
        >
          閉じる ✕
        </button>
      </div>

      <div className={styles.raceSelectGroup}>
        {races.map(race => {
          const currentWinner = resultsData[race.id];
          const localSelected = selectedHorses[race.id] || {};
          
          const sFirst = localSelected.firstPlaceId !== undefined ? localSelected.firstPlaceId : (currentWinner?.firstPlaceId || "");
          const sSecond = localSelected.secondPlaceId !== undefined ? localSelected.secondPlaceId : (currentWinner?.secondPlaceId || "");
          const sThird = localSelected.thirdPlaceId !== undefined ? localSelected.thirdPlaceId : (currentWinner?.thirdPlaceId || "");

          return (
            <div key={race.id} className={styles.raceRow} style={{ flexWrap: 'wrap', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid #444' }}>
              <div className={styles.raceName} style={{ width: '100%', marginBottom: '4px' }}>WIN{race.raceNumber} {race.raceName}</div>
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%', alignItems: 'center' }}>
                <select 
                  className={styles.horseSelect}
                  value={sFirst}
                  onChange={(e) => handleSelect(race.id, 'firstPlaceId', e.target.value)}
                  disabled={isSaving}
                  style={{ flex: 1, minWidth: '120px' }}
                >
                  <option value="">-- 1着 --</option>
                  {race.horses.map(h => <option key={h.id} value={h.id}>{h.number}番 {h.name}</option>)}
                </select>

                <select 
                  className={styles.horseSelect}
                  value={sSecond}
                  onChange={(e) => handleSelect(race.id, 'secondPlaceId', e.target.value)}
                  disabled={isSaving}
                  style={{ flex: 1, minWidth: '120px' }}
                >
                  <option value="">-- 2着 --</option>
                  {race.horses.map(h => <option key={h.id} value={h.id}>{h.number}番 {h.name}</option>)}
                </select>

                <select 
                  className={styles.horseSelect}
                  value={sThird}
                  onChange={(e) => handleSelect(race.id, 'thirdPlaceId', e.target.value)}
                  disabled={isSaving}
                  style={{ flex: 1, minWidth: '120px' }}
                >
                  <option value="">-- 3着 --</option>
                  {race.horses.map(h => <option key={h.id} value={h.id}>{h.number}番 {h.name}</option>)}
                </select>

                <button 
                  className={styles.saveBtn}
                  disabled={isSaving || !sFirst}
                  onClick={() => handleSaveResult(race.id)}
                >
                  保存
                </button>

                {currentWinner && (
                  <button 
                    className={styles.clearBtn}
                    disabled={isSaving}
                    onClick={() => handleClearResult(race.id)}
                  >
                    取消
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #555', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
          全レース終了後、このボタンを押して参加メンバーの成績を保存してください。
        </p>
        <button 
          onClick={handleArchive}
          disabled={isArchiving}
          style={{ 
            background: 'var(--accent-gold)', 
            color: '#000', 
            fontWeight: 'bold', 
            padding: '12px 24px', 
            borderRadius: '8px', 
            border: 'none', 
            cursor: isArchiving ? 'not-allowed' : 'pointer',
            opacity: isArchiving ? 0.7 : 1,
            width: '100%',
            marginBottom: '12px'
          }}
        >
          {isArchiving ? '処理中...' : '🏁 今週の成績を集計してアーカイブ保存'}
        </button>

        <button 
          onClick={handleForceReset}
          disabled={isArchiving}
          style={{ 
            background: 'transparent', 
            color: '#ff4444', 
            border: '1px solid #ff4444', 
            padding: '8px 16px', 
            borderRadius: '8px', 
            cursor: isArchiving ? 'not-allowed' : 'pointer',
            opacity: isArchiving ? 0.7 : 1,
            width: '100%',
            fontSize: '12px'
          }}
        >
          🗑️ 成績を保存せずにデータを強制リセット（次週準備用）
        </button>
      </div>
    </div>
  );
};

