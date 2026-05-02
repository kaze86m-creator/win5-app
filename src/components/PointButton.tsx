"use client";

import React, { useCallback } from 'react';
import styles from './PointButton.module.css';

interface PointButtonProps {
  points: number;
  maxPoints: number; // レース全体の残りポイントなどではなく、今回は1レース最大3ポイント
  totalRacePoints: number; // そのレースですでに割り振られた合計ポイント
  onAdd: () => void;
  onRemove: () => void;
}

export const PointButton: React.FC<PointButtonProps> = ({ 
  points, 
  maxPoints = 3,
  totalRacePoints,
  onAdd, 
  onRemove 
}) => {
  const isMaxReached = totalRacePoints >= maxPoints;

  const handleAdd = useCallback(() => {
    if (!isMaxReached) {
      // Haptic feedback if available (mobile browsers)
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      onAdd();
    }
  }, [isMaxReached, onAdd]);

  const handleRemove = useCallback(() => {
    if (points > 0) {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(30);
      }
      onRemove();
    }
  }, [points, onRemove]);

  return (
    <div className={styles.container}>
      <button 
        className={`${styles.button} ${styles.minus}`} 
        onClick={handleRemove}
        disabled={points <= 0}
        aria-label="ポイントを減らす"
      >
        −
      </button>
      <span className={`
        ${styles.pointDisplay} 
        ${points > 0 ? styles.hasPoints : ''} 
        ${points === maxPoints ? styles.maxPoints : ''}
      `}>
        {points}
      </span>
      <button 
        className={`${styles.button} ${styles.plus}`} 
        onClick={handleAdd}
        disabled={isMaxReached}
        aria-label="ポイントを増やす"
      >
        ＋
      </button>
    </div>
  );
};
