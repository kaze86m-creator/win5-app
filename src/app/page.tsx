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
  const [userMaxPoints, setUserMaxPoints] = useState<number>(3); // 基本3pt
  const [authLoading, setAuthLoading] = useState(true);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [currentEventId, setCurrentEventId] = useState<'saturday' | 'sunday'>('sunday');

  // horseId -> my points
  const [pointsData, setPointsData] = useState<Record<string, number>>({});
  
  // horseId -> total group points
  const [groupPointsData, setGroupPointsData] = useState<Record<string, number>>({});

  // raceId -> RaceResult
  const [resultsData, setResultsData] = useState<Record<string, RaceResult>>({});

  // Firestoreから取得したレースデータ
  const [races, setRaces] = useState<Race[]>([]);

  // 1. 認証の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        // users コレクションから名前と上限ポイントを取得
        const userDoc = await getDoc(doc(db, 'users', user.uid));
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

  // 2. votes コレクションの監視 (自分の投票の復元と、グループ合計の計算)
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

        // 全体の合計を計算
        newGroupPoints[horseId] = (newGroupPoints[horseId] || 0) + points;

        // 自分の投票データを復元
        if (voteUserId === userId) {
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

  // 3. results コレクションの監視
  useEffect(() => {
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

  // 4. races コレクションの監視 (全件取得)
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

    // UIから渡された現在のポイントをベースに計算し、クロージャによる古い値の参照を防ぐ
    const nextPoint = currentMyPoint + delta;
    
    // マイナスになってはいけない
    if (nextPoint < 0) return;

    // 今回は votes コレクションに "horseId_userId" の形式で保存（Update/Set/Deleteロジック）
    const docId = `${horseId}_${userId}`;
    const docRef = doc(db, 'votes', docId);

    try {
      if (nextPoint === 0) {
        // 0になったらドキュメントを完全に削除（キャンセル）
        await deleteDoc(docRef);
      } else {
        // 1以上の場合はUpdateまたはSet
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
      alert("通信エラーが発生しました。Firestoreの設定を確認してください。");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // 確実なフィルタリング: 現在選択されている曜日(eventId)のレースのみを抽出
  const displayRaces = races.filter(race => {
    if (race.id.includes('_')) {
      return race.id.startsWith(currentEventId + '_');
    }
    // 古いデータ（_なし）はsundayとして扱う
    return currentEventId === 'sunday';
  });

  // 現在の曜日（表示中）のレースの消費ポイント合計を計算
  const totalPointsUsed = displayRaces.reduce((sum, race) => {
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

  // 生存状況の計算
  let isSurviving = true;
  let eliminatedRace = 0;
  for (const race of displayRaces) {
    const raceResult = resultsData[race.id];
    if (raceResult && raceResult.firstPlaceId) {
      // 結果が確定しているレース
      const myPointsForWinner = pointsData[raceResult.firstPlaceId] || 0;
      if (myPointsForWinner === 0) {
        // 当たっていない場合、脱落
        isSurviving = false;
        eliminatedRace = race.raceNumber;
        break; // 以降のレースはチェックしない
      }
    }
  }

  if (authLoading) {
    return <div style={{ color: '#fff', padding: '20px', textAlign: 'center' }}>読み込み中...</div>;
  }

  if (!userId) {
    return <AuthUI />;
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className={styles.title}>WIN5 予想シェア</h1>
            <p className={styles.subtitle}>グループで意見を合わせて買い目を決定！</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--accent-gold)', fontWeight: 'bold', marginBottom: '8px' }}>
              👤 {userName} さん
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setIsStatsOpen(true)}
                style={{ background: 'var(--accent-gold)', border: 'none', color: '#000', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
              >
                📊 成績ダッシュボード
              </button>
              <Link 
                href="/admin" 
                style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: '4px', textDecoration: 'none', fontSize: '12px', display: 'flex', alignItems: 'center' }}
              >
                ⚙️ 管理者画面
              </Link>
              <button 
                onClick={handleLogout} 
                style={{ background: 'none', border: '1px solid #555', color: '#ccc', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
              >
                ログアウト
              </button>
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
          土曜日
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
          日曜日
        </button>
      </div>

      <div className={styles.layoutWrapper}>
        <div className={styles.dashboard}>
          <AdminPanel races={races} resultsData={resultsData} userId={userId} />

          {races.length === 0 ? (
            <div className={styles.summaryCard} style={{ textAlign: 'center', padding: '40px 20px', borderColor: 'var(--accent-red)' }}>
              <h2 style={{ marginBottom: '16px', color: 'var(--accent-red)' }}>⚠️ レースが登録されていません</h2>
              <p style={{ marginBottom: '24px', color: '#ccc' }}>管理者画面から今週のWIN5出馬表を取り込んでください。</p>
              <Link href="/admin" style={{ display: 'inline-block', padding: '12px 24px', background: 'var(--accent-gold)', color: '#000', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }}>
                管理者画面へ移動
              </Link>
            </div>
          ) : (
            <>
              {/* 生存状況パネル */}
              <div className={styles.summaryCard} style={{ backgroundColor: isSurviving ? 'rgba(46, 204, 113, 0.1)' : 'rgba(255, 69, 58, 0.1)', borderColor: isSurviving ? '#2ecc71' : '#ff453a' }}>
                <div className={styles.summaryTitle}>現在のステータス</div>
                <div className={styles.summaryValue} style={{ color: isSurviving ? '#2ecc71' : '#ff453a' }}>
                  {isSurviving ? '🔥 生存中 (WIN5 継続中)' : `💀 終了 (${eliminatedRace}レース目で脱落)`}
                </div>
              </div>

              {favoriteHorses.length > 0 && (
                <div className={styles.favoritesCard}>
                  <div className={styles.favoritesTitle}>
                    🔥 グループ注目馬 (4pt以上)
                  </div>
                  <div className={styles.favoritesList}>
                    {favoriteHorses.map((fav, idx) => (
                      <div key={idx} className={styles.favoriteItem}>
                        <div>
                          <span className={styles.favoriteRace}>{fav.raceName}</span>
                          <span>{fav.horseNumber}番 {fav.horseName}</span>
                        </div>
                        <div className={styles.favoritePoints}>{fav.points}pt</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.summaryCard}>
                <div className={styles.summaryTitle}>あなたの合計ポイント (上限{userMaxPoints}pt/レース)</div>
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
