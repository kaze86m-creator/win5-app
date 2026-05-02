"use client";

import React from 'react';
import styles from './RaceTable.module.css';
import { PointButton } from './PointButton';

export type Horse = { id: string; number: number; name: string; odds?: string };
export type Race = { id: string; raceNumber: number; raceName: string; horses: Horse[] };

type RaceResult = {
  firstPlaceId: string;
  secondPlaceId?: string;
  thirdPlaceId?: string;
};

interface RaceTableProps {
  race: Race;
  pointsData: Record<string, number>; // horseId -> my points
  groupPointsData: Record<string, number>; // horseId -> total group points
  resultsData: Record<string, RaceResult>; // raceId -> RaceResult
  userMaxPoints: number; // ユーザー個人の持ち点上限
  onUpdatePoint: (horseId: string, currentMyPoint: number, delta: number) => void;
}

export const RaceTable: React.FC<RaceTableProps> = ({ race, pointsData, groupPointsData, resultsData, userMaxPoints, onUpdatePoint }) => {
  // このレースに割り振られた合計ポイントを計算
  const totalRacePoints = race.horses.reduce((sum, horse) => {
    return sum + (pointsData[horse.id] || 0);
  }, 0);

  const raceResult = resultsData[race.id];
  const isRaceCompleted = !!(raceResult && raceResult.firstPlaceId);

  return (
    <div className={styles.raceContainer}>
      <div className={styles.raceHeader}>
        <div className={styles.raceTitle}>
          WIN{race.raceNumber}: {race.raceName} {isRaceCompleted && <span className={styles.winnerBadge}>[結果確定]</span>}
        </div>
        <div className={`${styles.pointsInfo} ${totalRacePoints >= userMaxPoints ? styles.maxReached : ''}`}>
          残り {userMaxPoints - totalRacePoints}pt
        </div>
      </div>
      
      <div className={styles.horseList}>
        {race.horses.map(horse => {
          const myPoints = pointsData[horse.id] || 0;
          const totalPoints = groupPointsData[horse.id] || 0;
          
          let rowClasses = `${styles.horseRow} ${myPoints > 0 ? styles.hasMyPoints : ''} ${totalPoints >= 4 ? styles.highGroupPoints : ''}`;
          
          let placeBadge = null;
          if (isRaceCompleted) {
            if (horse.id === raceResult.firstPlaceId) {
              rowClasses += ` ${styles.winner}`;
              placeBadge = <span className={styles.winnerBadge} style={{ background: '#FFD700', color: '#000' }}>🥇 1着</span>;
            } else if (horse.id === raceResult.secondPlaceId) {
              placeBadge = <span className={styles.winnerBadge} style={{ background: '#C0C0C0', color: '#000' }}>🥈 2着</span>;
            } else if (horse.id === raceResult.thirdPlaceId) {
              placeBadge = <span className={styles.winnerBadge} style={{ background: '#CD7F32', color: '#fff' }}>🥉 3着</span>;
            } else {
              rowClasses += ` ${styles.loser}`;
            }
          }

          return (
            <div key={horse.id} className={rowClasses}>
              <div className={styles.horseInfo}>
                <span className={styles.horseNumber}>{horse.number}</span>
                <div className={styles.horseNameGroup}>
                  <span className={styles.horseName}>
                    {horse.name}
                    {horse.odds && <span className={styles.horseOdds}>({horse.odds})</span>}
                    {placeBadge}
                  </span>
                  {totalPoints > 0 && (
                    <span className={styles.groupPointsBadge}>
                      👑 {totalPoints}pt
                    </span>
                  )}
                </div>
              </div>
              <PointButton 
                points={myPoints}
                maxPoints={userMaxPoints}
                totalRacePoints={totalRacePoints}
                onAdd={() => onUpdatePoint(horse.id, myPoints, 1)}
                onRemove={() => onUpdatePoint(horse.id, myPoints, -1)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

