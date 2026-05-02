"use client";

import React, { useState } from 'react';
import styles from './AuthUI.module.css';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export const AuthUI: React.FC = () => {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pin.length !== 4) {
      setError("名前と4桁のPINを入力してください");
      return;
    }

    setLoading(true);
    setError('');

    // ダミーのメールアドレスとパスワードを生成
    // 日本語名なども使えるようにBase64エンコード（シンプル化のため簡易実装）
    const safeNameName = btoa(encodeURIComponent(name.trim())).replace(/=/g, '');
    const dummyEmail = `${safeNameName}@win5.local`;
    const dummyPassword = `${pin}000`; // Firebaseはパスワード6文字以上必須のため

    try {
      // まずログインを試みる
      await signInWithEmailAndPassword(auth, dummyEmail, dummyPassword);
      // 成功すれば何もしない（onAuthStateChangedが検知する）
    } catch (err: any) {
      // ユーザーが存在しない場合、新規登録
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
        try {
          const userCred = await createUserWithEmailAndPassword(auth, dummyEmail, dummyPassword);
          const userId = userCred.user.uid;
          
          // 新規ユーザーデータをFirestoreの users コレクションに保存
          await setDoc(doc(db, 'users', userId), {
            name: name.trim(),
            maxPoints: 3, // 仕様書通り、基本持ち点は3ポイント
            createdAt: new Date().toISOString()
          });
        } catch (signupErr: any) {
          setError("登録に失敗しました。別の名前をお試しください。");
          console.error(signupErr);
        }
      } else {
        setError("ログインに失敗しました。PINが間違っている可能性があります。");
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.loginCard}>
        <h2 className={styles.title}>WIN5 予想シェア</h2>
        <p className={styles.subtitle}>名前と4桁のPINで入室してください</p>

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>ニックネーム</label>
            <input 
              type="text" 
              className={styles.input} 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例: たろう"
              maxLength={15}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>PINコード (4桁の数字)</label>
            <input 
              type="password" 
              inputMode="numeric"
              pattern="[0-9]*"
              className={styles.input} 
              value={pin}
              onChange={e => setPin(e.target.value.slice(0, 4))}
              placeholder="例: 1234"
              maxLength={4}
            />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading || !name || pin.length !== 4}>
            {loading ? '入室中...' : '入室する'}
          </button>

          {error && <div className={styles.error}>{error}</div>}
        </form>
      </div>
    </div>
  );
};
