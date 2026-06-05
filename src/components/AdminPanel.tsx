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
      alert("1逹鬥ｬ縺ｯ蠢・医〒縺吶・);
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
      alert('邨先棡繧剃ｿ晏ｭ倥＠縺ｾ縺励◆・・);
    } catch (error) {
      console.error(error);
      alert('繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearResult = async (raceId: string) => {
    if (!confirm('縺薙・繝ｬ繝ｼ繧ｹ縺ｮ邨先棡繧呈悴遒ｺ螳壹↓謌ｻ縺励∪縺吶°・・)) return;
    
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
      alert('繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm('莉企ｱ縺ｮ謌千ｸｾ繧帝寔險医＠縺ｦ繧｢繝ｼ繧ｫ繧､繝厄ｼ井ｿ晏ｭ假ｼ峨＠縺ｾ縺吶ゅｈ繧阪＠縺・〒縺吶°・歃n窶ｻ蜈ｨ繝ｬ繝ｼ繧ｹ縺ｮ邨先棡縺檎｢ｺ螳壹＠縺ｦ縺・ｋ蠢・ｦ√′縺ゅｊ縺ｾ縺吶・)) return;

    const isAllCompleted = races.every(race => resultsData[race.id] && resultsData[race.id].firstPlaceId);
    if (!isAllCompleted) {
      alert('蜈ｨ繝ｬ繝ｼ繧ｹ縺ｮ邨先棡縺檎｢ｺ螳壹＠縺ｦ縺・∪縺帙ｓ縲・);
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

        // 迴ｾ蝨ｨ陦ｨ遉ｺ縺輔ｌ縺ｦ縺・ｋ繧､繝吶Φ繝茨ｼ域屆譌･・峨・謚慕･ｨ縺ｮ縺ｿ繧帝寔險亥ｯｾ雎｡縺ｨ縺吶ｋ
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

      // 3. 谺｡騾ｱ縺ｫ蜷代￠縺溘ョ繝ｼ繧ｿ縺ｮ繝ｪ繧ｻ繝・ヨ (蟇ｾ雎｡譖懈律縺ｮ縺ｿ)
      
      // 3-1. 謚慕･ｨ繝・・繧ｿ縺ｮ蜑企勁
      for (const docSnap of votesSnap.docs) {
        const vote = docSnap.data();
        if (currentRaceIds.has(vote.raceId)) {
          await deleteDoc(doc(db, 'votes', docSnap.id));
        }
      }

      // 3-2. 繝ｬ繝ｼ繧ｹ邨先棡縺ｮ蜑企勁
      for (const raceId of currentRaceIds) {
        await deleteDoc(doc(db, 'results', raceId));
      }

      // 3-3. 蜃ｺ鬥ｬ陦ｨ縺ｮ繝ｪ繧ｻ繝・ヨ
      for (const race of races) {
        const raceRef = doc(db, 'races', race.id);
        await setDoc(raceRef, {
          ...race,
          raceName: `WIN${race.raceNumber}`,
          horses: [],
          updatedAt: new Date().toISOString()
        });
      }

      const dayName = currentEventId === 'saturday' ? '蝨滓屆譌･' : '譌･譖懈律';
      alert(`縲・{dayName}縲代・謌千ｸｾ繧｢繝ｼ繧ｫ繧､繝悶→谺｡騾ｱ蜷代￠縺ｮ繝ｪ繧ｻ繝・ヨ縺悟ｮ御ｺ・＠縺ｾ縺励◆・～);
    } catch (error) {
      console.error(error);
      alert('繧｢繝ｼ繧ｫ繧､繝紋ｸｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleForceReset = async () => {
    if (!confirm('譛ｬ蠖薙↓謌千ｸｾ繧剃ｿ晏ｭ倥○縺壹↓繝・・繧ｿ繧貞ｼｷ蛻ｶ繝ｪ繧ｻ繝・ヨ縺励∪縺吶°・溘％縺ｮ謫堺ｽ懊・蜿悶ｊ豸医○縺ｾ縺帙ｓ縲・)) return;

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

      // 1. 謚慕･ｨ繝・・繧ｿ縺ｮ蜑企勁・医ざ繝ｼ繧ｹ繝医ョ繝ｼ繧ｿ蛻・ｂ蜷ｫ繧・・      for (const docSnap of votesSnap.docs) {
        const vote = docSnap.data();
        if (allTargetRaceIds.has(vote.raceId)) {
          await deleteDoc(doc(db, 'votes', docSnap.id));
        }
      }

      // 2. 繝ｬ繝ｼ繧ｹ邨先棡縺ｮ蜑企勁・医ざ繝ｼ繧ｹ繝医ョ繝ｼ繧ｿ蛻・ｂ蜷ｫ繧・・      for (const raceId of allTargetRaceIds) {
        await deleteDoc(doc(db, 'results', raceId));
      }

      // 3. 蜃ｺ鬥ｬ陦ｨ縺ｮ螳悟・繧ｯ繝ｪ繝ｼ繝ｳ繧｢繝・・縺ｨ蜀咲函謌・      // 縺ｾ縺壽里蟄倥・蟇ｾ雎｡譖懈律縺ｮ蜈ｨ繝ｬ繝ｼ繧ｹ繝峨く繝･繝｡繝ｳ繝茨ｼ医ざ繝ｼ繧ｹ繝医ョ繝ｼ繧ｿ蜷ｫ繧・峨ｒ蜑企勁
      for (const docSnap of eventRaceDocs) {
        await deleteDoc(doc(db, 'races', docSnap.id));
      }

      // 遒ｺ螳溘↓繧､繝ｳ繝・ャ繧ｯ繧ｹ1縲・縺ｮ5縺､縺ｮ繝峨く繝･繝｡繝ｳ繝医□縺代ｒ蛻晄悄迥ｶ諷九→縺励※蜀咲函謌・      for (let i = 1; i <= 5; i++) {
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

      const dayName = currentEventId === 'saturday' ? '蝨滓屆譌･' : '譌･譖懈律';
      alert(`縲・{dayName}縲代・繝・・繧ｿ繧貞ｼｷ蛻ｶ繝ｪ繧ｻ繝・ヨ縺励∪縺励◆・～);
    } catch (error) {
      console.error(error);
      alert('繝ｪ繧ｻ繝・ヨ荳ｭ縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆');
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
        笞呻ｸ・繝ｬ繝ｼ繧ｹ邨先棡蜈･蜉帙・繧｢繝ｼ繧ｫ繧､繝悶ヱ繝阪Ν繧帝幕縺・      </button>
    );
  }

  return (
    <div className={styles.adminPanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div className={styles.adminTitle}>
          笞呻ｸ・繝ｬ繝ｼ繧ｹ邨先棡蜈･蜉・(1逹縲・逹)
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          style={{ background: 'transparent', color: '#ccc', border: 'none', cursor: 'pointer', fontSize: '12px' }}
        >
          髢峨§繧・笨・        </button>
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
                  <option value="">-- 1逹 --</option>
                  {race.horses.map(h => <option key={h.id} value={h.id}>{h.number}逡ｪ {h.name}</option>)}
                </select>

                <select 
                  className={styles.horseSelect}
                  value={sSecond}
                  onChange={(e) => handleSelect(race.id, 'secondPlaceId', e.target.value)}
                  disabled={isSaving}
                  style={{ flex: 1, minWidth: '120px' }}
                >
                  <option value="">-- 2逹 --</option>
                  {race.horses.map(h => <option key={h.id} value={h.id}>{h.number}逡ｪ {h.name}</option>)}
                </select>

                <select 
                  className={styles.horseSelect}
                  value={sThird}
                  onChange={(e) => handleSelect(race.id, 'thirdPlaceId', e.target.value)}
                  disabled={isSaving}
                  style={{ flex: 1, minWidth: '120px' }}
                >
                  <option value="">-- 3逹 --</option>
                  {race.horses.map(h => <option key={h.id} value={h.id}>{h.number}逡ｪ {h.name}</option>)}
                </select>

                <button 
                  className={styles.saveBtn}
                  disabled={isSaving || !sFirst}
                  onClick={() => handleSaveResult(race.id)}
                >
                  菫晏ｭ・                </button>

                {currentWinner && (
                  <button 
                    className={styles.clearBtn}
                    disabled={isSaving}
                    onClick={() => handleClearResult(race.id)}
                  >
                    蜿匁ｶ・                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #555', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
          蜈ｨ繝ｬ繝ｼ繧ｹ邨ゆｺ・ｾ後√％縺ｮ繝懊ち繝ｳ繧呈款縺励※蜿ょ刈繝｡繝ｳ繝舌・縺ｮ謌千ｸｾ繧剃ｿ晏ｭ倥＠縺ｦ縺上□縺輔＞縲・        </p>
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
          {isArchiving ? '蜃ｦ逅・ｸｭ...' : '潤 莉企ｱ縺ｮ謌千ｸｾ繧帝寔險医＠縺ｦ繧｢繝ｼ繧ｫ繧､繝紋ｿ晏ｭ・}
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
          卵・・謌千ｸｾ繧剃ｿ晏ｭ倥○縺壹↓繝・・繧ｿ繧貞ｼｷ蛻ｶ繝ｪ繧ｻ繝・ヨ・域ｬ｡騾ｱ貅門ｙ逕ｨ・・        </button>
      </div>
    </div>
  );
};



