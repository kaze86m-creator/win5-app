"use client";

import React, { useState, useEffect } from 'react';
import styles from './page.module.css';
import { RaceTable } from '@/components/RaceTable';
import { ChatPanel } from '@/components/ChatPanel';
import { AuthUI } from '@/components/AuthUI';
import { AdminPanel } from '@/components/AdminPanel';
import { StatsDashboard } from '@/components/StatsDashboard';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, query, orderBy } from 'firebase/firestore';
import Link from 'next/link';

type Horse = { id: string; number: number; name: string };
type Race = { id: string; raceNumber: number; raceName: string; eventId?: string; horses: Horse[] };

type RaceResult = {
  firstPlaceId: string;
  secondPlaceId?: string;
  thirdPlaceId?: string;
};

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userMaxPoints, setUserMaxPoints] = useState<number>(3); // 蝓ｺ譛ｬ3pt
  const [authLoading, setAuthLoading] = useState(true);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<'saturday' | 'sunday'>('sunday');

  // horseId -> my points
  const [pointsData, setPointsData] = useState<Record<string, number>>({});
  
  // horseId -> total group points
  const [groupPointsData, setGroupPointsData] = useState<Record<string, number>>({});

  // raceId -> RaceResult
  const [resultsData, setResultsData] = useState<Record<string, RaceResult>>({});

  // Firestore縺九ｉ蜿門ｾ励＠縺溘Ξ繝ｼ繧ｹ繝・・繧ｿ
  const [races, setRaces] = useState<Race[]>([]);

  // 1. 隱崎ｨｼ縺ｮ逶｣隕・  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        // users 繧ｳ繝ｬ繧ｯ繧ｷ繝ｧ繝ｳ縺九ｉ蜷榊燕縺ｨ荳企剞繝昴う繝ｳ繝医ｒ蜿門ｾ・        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserName(userDoc.data().name);
          setUserMaxPoints(userDoc.data().maxPoints || 3);
        }
      } else {
        setUserId(null);
        setUserName('');
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. votes 繧ｳ繝ｬ繧ｯ繧ｷ繝ｧ繝ｳ縺ｮ逶｣隕・(閾ｪ蛻・・謚慕･ｨ縺ｮ蠕ｩ蜈・→縲√げ繝ｫ繝ｼ繝怜粋險医・險育ｮ・
  useEffect(() => {
    if (!userId) {
      setPointsData({});
      setGroupPointsData({});
      return;
    }

    const votesRef = collection(db, 'votes');
    const unsubscribe = onSnapshot(votesRef, (snapshot) => {
      const newMyPoints: Record<string, number> = {};
      const newGroupPoints: Record<string, number> = {};

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const { horseId, userId: voteUserId, points } = data;

        // 蜈ｨ菴薙・蜷郁ｨ医ｒ險育ｮ・        newGroupPoints[horseId] = (newGroupPoints[horseId] || 0) + points;

        // 閾ｪ蛻・・謚慕･ｨ繝・・繧ｿ繧貞ｾｩ蜈・        if (voteUserId === userId) {
          newMyPoints[horseId] = points;
        }
      });

      setPointsData(newMyPoints);
      setGroupPointsData(newGroupPoints);
    }, (error) => {
      console.error("Firestore Error: ", error);
    });

    return () => unsubscribe();
  }, [userId]);

  // 3. results 繧ｳ繝ｬ繧ｯ繧ｷ繝ｧ繝ｳ縺ｮ逶｣隕・  useEffect(() => {
    const resultsRef = collection(db, 'results');
    const unsubscribe = onSnapshot(resultsRef, (snapshot) => {
      const newResults: Record<string, RaceResult> = {};
      snapshot.docs.forEach(docSnap => {
        newResults[docSnap.id] = docSnap.data() as RaceResult;
      });
      setResultsData(newResults);
    }, (error) => {
      console.error("Firestore Results Error: ", error);
    });

    return () => unsubscribe();
  }, []);

  // 4. races 繧ｳ繝ｬ繧ｯ繧ｷ繝ｧ繝ｳ縺ｮ逶｣隕・(蜈ｨ莉ｶ蜿門ｾ・
  useEffect(() => {
    const racesRef = collection(db, 'races');
    const q = query(racesRef, orderBy('raceNumber'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedRaces: Race[] = [];
      snapshot.docs.forEach(docSnap => {
        fetchedRaces.push(docSnap.data() as Race);
      });
      setRaces(fetchedRaces);
    }, (error) => {
      console.error("Firestore Races Error: ", error);
    });

    return () => unsubscribe();
  }, []);

  const handleUpdatePoint = async (horseId: string, raceId: string, currentMyPoint: number, delta: number) => {
    if (!userId) return;

    // UI縺九ｉ貂｡縺輔ｌ縺溽樟蝨ｨ縺ｮ繝昴う繝ｳ繝医ｒ繝吶・繧ｹ縺ｫ險育ｮ励＠縲√け繝ｭ繝ｼ繧ｸ繝｣縺ｫ繧医ｋ蜿､縺・､縺ｮ蜿ら・繧帝亟縺・    const nextPoint = currentMyPoint + delta;
    
    // 繝槭う繝翫せ縺ｫ縺ｪ縺｣縺ｦ縺ｯ縺・￠縺ｪ縺・    if (nextPoint < 0) return;

    // 莉雁屓縺ｯ votes 繧ｳ繝ｬ繧ｯ繧ｷ繝ｧ繝ｳ縺ｫ "horseId_userId" 縺ｮ蠖｢蠑上〒菫晏ｭ假ｼ・pdate/Set/Delete繝ｭ繧ｸ繝・け・・    const docId = `${horseId}_${userId}`;
    const docRef = doc(db, 'votes', docId);

    try {
      if (nextPoint === 0) {
        // 0縺ｫ縺ｪ縺｣縺溘ｉ繝峨く繝･繝｡繝ｳ繝医ｒ螳悟・縺ｫ蜑企勁・医く繝｣繝ｳ繧ｻ繝ｫ・・        await deleteDoc(docRef);
      } else {
        // 1莉･荳翫・蝣ｴ蜷医・Update縺ｾ縺溘・Set
        await setDoc(docRef, {
          userId: userId,
          raceId: raceId,
          horseId: horseId,
          eventId: currentEventId,
          points: nextPoint,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Error updating document: ", error);
      alert("騾壻ｿ｡繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲・irestore縺ｮ險ｭ螳壹ｒ遒ｺ隱阪＠縺ｦ縺上□縺輔＞縲・);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // 遒ｺ螳溘↑繝輔ぅ繝ｫ繧ｿ繝ｪ繝ｳ繧ｰ: 迴ｾ蝨ｨ驕ｸ謚槭＆繧後※縺・ｋ譖懈律(eventId)縺ｮ繝ｬ繝ｼ繧ｹ縺ｮ縺ｿ繧呈歓蜃ｺ
  // 窶ｻ荳・′荳縺ｮ繧ｴ繝ｼ繧ｹ繝医ョ繝ｼ繧ｿ・・race6縺ｪ縺ｩ・峨・豺ｷ蜈･繧帝亟縺舌◆繧√∝・鬆ｭ5莉ｶ縺ｮ縺ｿ縺ｫ髯仙ｮ壹☆繧九ヵ繧ｧ繧､繝ｫ繧ｻ繝ｼ繝輔ｒ霑ｽ蜉
  const displayRaces = races.filter(race => {
    if (race.id.includes('_')) {
      return race.id.startsWith(currentEventId + '_');
    }
    // 蜿､縺・ョ繝ｼ繧ｿ・・縺ｪ縺暦ｼ峨・sunday縺ｨ縺励※謇ｱ縺・    return currentEventId === 'sunday';
  }).slice(0, 5);

  // 迴ｾ蝨ｨ縺ｮ譖懈律・郁｡ｨ遉ｺ荳ｭ・峨・繝ｬ繝ｼ繧ｹ縺ｮ豸郁ｲｻ繝昴う繝ｳ繝亥粋險医ｒ險育ｮ・  const totalPointsUsed = displayRaces.reduce((sum, race) => {
    return sum + race.horses.reduce((horseSum, horse) => horseSum + (pointsData[horse.id] || 0), 0);
  }, 0);
  const maxTotalPoints = displayRaces.length * userMaxPoints;

  const favoriteHorses = [];
  for (const race of displayRaces) {
    for (const horse of race.horses) {
      const totalPoints = groupPointsData[horse.id] || 0;
      if (totalPoints >= 4) {
        favoriteHorses.push({
          raceName: race.raceName,
          horseName: horse.name,
          horseNumber: horse.number,
          points: totalPoints
        });
      }
    }
  }
  favoriteHorses.sort((a, b) => b.points - a.points);

  // 逕溷ｭ倡憾豕√・險育ｮ・  let isSurviving = true;
  let eliminatedRace = 0;
  for (const race of displayRaces) {
    const raceResult = resultsData[race.id];
    if (raceResult && raceResult.firstPlaceId) {
      // 邨先棡縺檎｢ｺ螳壹＠縺ｦ縺・ｋ繝ｬ繝ｼ繧ｹ
      const myPointsForWinner = pointsData[raceResult.firstPlaceId] || 0;
      if (myPointsForWinner === 0) {
        // 蠖薙◆縺｣縺ｦ縺・↑縺・ｴ蜷医∬┳關ｽ
        isSurviving = false;
        eliminatedRace = race.raceNumber;
        break; // 莉･髯阪・繝ｬ繝ｼ繧ｹ縺ｯ繝√ぉ繝・け縺励↑縺・      }
    }
  }

  if (authLoading) {
    return <div style={{ color: '#fff', padding: '20px', textAlign: 'center' }}>隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>;
  }

  if (!userId) {
    return <AuthUI />;
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className={styles.title}>WIN5 莠域Φ繧ｷ繧ｧ繧｢</h1>
            <p className={styles.subtitle}>繧ｰ繝ｫ繝ｼ繝励〒諢剰ｦ九ｒ蜷医ｏ縺帙※雋ｷ縺・岼繧呈ｱｺ螳夲ｼ・/p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--accent-gold)', fontWeight: 'bold', marginBottom: '8px' }}>
              側 {userName} 縺輔ｓ
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setIsStatsOpen(true)}
                style={{ background: 'var(--accent-gold)', border: 'none', color: '#000', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
              >
                投 謌千ｸｾ繝繝・す繝･繝懊・繝・              </button>
              <Link 
                href="/admin" 
                style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontSize: '12px', display: 'flex', alignItems: 'center' }}
              >
                笞呻ｸ・邂｡逅・・判髱｢
              </Link>
              <button 
                onClick={handleLogout} 
                style={{ background: 'none', border: '1px solid #555', color: '#ccc', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
              >
                繝ｭ繧ｰ繧｢繧ｦ繝・              </button>
            </div>
          </div>
        </div>
      </header>

      {isStatsOpen && <StatsDashboard onClose={() => setIsStatsOpen(false)} />}

      <div style={{ display: 'flex', gap: '8px', padding: '0 20px', maxWidth: '1200px', margin: '0 auto 0 auto' }}>
        <button 
          onClick={() => setCurrentEventId('saturday')}
          style={{ 
            padding: '12px 24px', 
            background: currentEventId === 'saturday' ? 'var(--card-bg)' : 'rgba(255,255,255,0.05)',
            color: currentEventId === 'saturday' ? 'var(--accent-gold)' : '#aaa',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            fontWeight: 'bold',
            cursor: 'pointer',
            flex: 1,
            borderBottom: currentEventId === 'saturday' ? '2px solid var(--accent-gold)' : 'none'
          }}
        >
          蝨滓屆譌･
        </button>
        <button 
          onClick={() => setCurrentEventId('sunday')}
          style={{ 
            padding: '12px 24px', 
            background: currentEventId === 'sunday' ? 'var(--card-bg)' : 'rgba(255,255,255,0.05)',
            color: currentEventId === 'sunday' ? 'var(--accent-gold)' : '#aaa',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            fontWeight: 'bold',
            cursor: 'pointer',
            flex: 1,
            borderBottom: currentEventId === 'sunday' ? '2px solid var(--accent-gold)' : 'none'
          }}
        >
          譌･譖懈律
        </button>
      </div>

      <div className={styles.layoutWrapper}>
        <div className={styles.dashboard}>
          <AdminPanel races={displayRaces} resultsData={resultsData} userId={userId} />

          {races.length === 0 ? (
            <div className={styles.summaryCard} style={{ textAlign: 'center', padding: '40px 20px', borderColor: 'var(--accent-red)' }}>
              <h2 style={{ marginBottom: '16px', color: 'var(--accent-red)' }}>笞・・繝ｬ繝ｼ繧ｹ縺檎匳骭ｲ縺輔ｌ縺ｦ縺・∪縺帙ｓ</h2>
              <p style={{ marginBottom: '24px', color: '#ccc' }}>邂｡逅・・判髱｢縺九ｉ莉企ｱ縺ｮWIN5蜃ｺ鬥ｬ陦ｨ繧貞叙繧願ｾｼ繧薙〒縺上□縺輔＞縲・/p>
              <Link href="/admin" style={{ display: 'inline-block', padding: '12px 24px', background: 'var(--accent-gold)', color: '#000', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }}>
                邂｡逅・・判髱｢縺ｸ遘ｻ蜍・              </Link>
            </div>
          ) : (
            <>
              {/* 逕溷ｭ倡憾豕√ヱ繝阪Ν */}
              <div className={styles.summaryCard} style={{ backgroundColor: isSurviving ? 'rgba(46, 204, 113, 0.1)' : 'rgba(255, 69, 58, 0.1)', borderColor: isSurviving ? '#2ecc71' : '#ff453a' }}>
                <div className={styles.summaryTitle}>迴ｾ蝨ｨ縺ｮ繧ｹ繝・・繧ｿ繧ｹ</div>
                <div className={styles.summaryValue} style={{ color: isSurviving ? '#2ecc71' : '#ff453a' }}>
                  {isSurviving ? '櫨 逕溷ｭ倅ｸｭ (WIN5 邯咏ｶ壻ｸｭ)' : `逐 邨ゆｺ・(${eliminatedRace}繝ｬ繝ｼ繧ｹ逶ｮ縺ｧ閼ｱ關ｽ)`}
                </div>
              </div>

              {favoriteHorses.length > 0 && (
                <div className={styles.favoritesCard}>
                  <div className={styles.favoritesTitle}>
                    櫨 繧ｰ繝ｫ繝ｼ繝玲ｳｨ逶ｮ鬥ｬ (4pt莉･荳・
                  </div>
                  <div className={styles.favoritesList}>
                    {favoriteHorses.map((fav, idx) => (
                      <div key={idx} className={styles.favoriteItem}>
                        <div>
                          <span className={styles.favoriteRace}>{fav.raceName}</span>
                          <span>{fav.horseNumber}逡ｪ {fav.horseName}</span>
                        </div>
                        <div className={styles.favoritePoints}>{fav.points}pt</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.summaryCard}>
                <div className={styles.summaryTitle}>縺ゅ↑縺溘・蜷郁ｨ医・繧､繝ｳ繝・(荳企剞{userMaxPoints}pt/繝ｬ繝ｼ繧ｹ)</div>
                <div className={styles.summaryValue}>
                  {totalPointsUsed} / {maxTotalPoints} pt
                </div>
              </div>

              <div className={styles.raceList}>
                {displayRaces.map(race => (
                  <RaceTable 
                    key={race.id} 
                    race={race} 
                    pointsData={pointsData} 
                    groupPointsData={groupPointsData}
                    resultsData={resultsData}
                    userMaxPoints={userMaxPoints}
                    onUpdatePoint={(horseId, currentPt, delta) => handleUpdatePoint(horseId, race.id, currentPt, delta)} 
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <aside className={styles.chatSidebar}>
          <ChatPanel userId={userId} userName={userName} />
        </aside>
      </div>
    </main>
  );
}
