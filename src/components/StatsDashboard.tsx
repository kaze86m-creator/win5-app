import React, { useState, useEffect } from 'react';
import styles from './StatsDashboard.module.css';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, getDoc, doc } from 'firebase/firestore';

interface StatsDashboardProps {
  onClose: () => void;
}

type UserStat = {
  userId: string;
  userName: string;
  totalVotes: number;
  winHits: number;
  placedHits: number;
  date: string; // YYYY-MM-DD
};

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState<UserStat[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'all' | 'month' | 'week'>('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch all users to map ID to Name
        const usersSnap = await getDocs(collection(db, 'users'));
        const uMap: Record<string, string> = {};
        usersSnap.docs.forEach(d => {
          uMap[d.id] = d.data().name || 'Unknown';
        });
        setUsersMap(uMap);

        // Fetch all stats
        const statsSnap = await getDocs(query(collection(db, 'userStats'), orderBy('date', 'desc')));
        const fetchedStats: UserStat[] = [];
        statsSnap.docs.forEach(d => {
          const data = d.data();
          fetchedStats.push({
            userId: data.userId,
            userName: uMap[data.userId] || 'Unknown',
            totalVotes: data.totalVotes,
            winHits: data.winHits,
            placedHits: data.placedHits,
            date: data.date
          });
        });

        setStatsData(fetchedStats);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter and aggregate data based on active tab
  const getAggregatedData = () => {
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // For "week", just take the latest date in the dataset (assuming it's the current week)
    const latestDate = statsData.length > 0 ? statsData[0].date : '';

    const filtered = statsData.filter(stat => {
      if (activeTab === 'month') return stat.date.startsWith(currentMonthPrefix);
      if (activeTab === 'week') return stat.date === latestDate;
      return true; // 'all'
    });

    const aggregated: Record<string, { userName: string; totalVotes: number; winHits: number; placedHits: number }> = {};
    
    filtered.forEach(stat => {
      if (!aggregated[stat.userId]) {
        aggregated[stat.userId] = { userName: stat.userName, totalVotes: 0, winHits: 0, placedHits: 0 };
      }
      aggregated[stat.userId].totalVotes += stat.totalVotes;
      aggregated[stat.userId].winHits += stat.winHits;
      aggregated[stat.userId].placedHits += stat.placedHits;
    });

    // Calculate rates and sort
    const resultList = Object.values(aggregated).map(agg => {
      const winRate = agg.totalVotes > 0 ? (agg.winHits / agg.totalVotes) * 100 : 0;
      const placedRate = agg.totalVotes > 0 ? (agg.placedHits / agg.totalVotes) * 100 : 0;
      return { ...agg, winRate, placedRate };
    });

    // Sort by winRate, then placedRate, then totalVotes
    resultList.sort((a, b) => b.winRate - a.winRate || b.placedRate - a.placedRate || b.totalVotes - a.totalVotes);

    return resultList;
  };

  const displayData = getAggregatedData();

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>📊 メンバー成績・統計ダッシュボード</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'all' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('all')}
          >
            累計 (すべて)
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'month' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('month')}
          >
            今月
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'week' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('week')}
          >
            最新の週
          </button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '20px' }}>データ読み込み中...</p>
          ) : displayData.length === 0 ? (
            <div className={styles.emptyState}>
              <p>表示できる成績データがありません。</p>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>※全レース終了後、管理者画面から「成績をアーカイブ保存」を実行するとデータが蓄積されます。</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center', width: '50px' }}>順位</th>
                  <th style={{ textAlign: 'left' }}>メンバー</th>
                  <th style={{ textAlign: 'center' }}>単勝的中率</th>
                  <th style={{ textAlign: 'center' }}>複勝率 (3着内)</th>
                  <th style={{ textAlign: 'center' }}>投票数</th>
                </tr>
              </thead>
              <tbody>
                {displayData.map((data, index) => (
                  <tr key={data.userName}>
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}位`}
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{data.userName}</td>
                    <td style={{ textAlign: 'center', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                      {data.winRate.toFixed(1)}% <span style={{ fontSize: '11px', color: '#888', fontWeight: 'normal' }}>({data.winHits}回)</span>
                    </td>
                    <td style={{ textAlign: 'center', color: '#2ecc71' }}>
                      {data.placedRate.toFixed(1)}% <span style={{ fontSize: '11px', color: '#888' }}>({data.placedHits}回)</span>
                    </td>
                    <td style={{ textAlign: 'center', color: '#aaa' }}>{data.totalVotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
