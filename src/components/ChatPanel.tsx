"use client";

import React, { useState, useEffect, useRef } from 'react';
import styles from './ChatPanel.module.css';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, limit } from 'firebase/firestore';

interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: any;
}

interface ChatPanelProps {
  userId: string;
  userName: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ userId, userName }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 最新の50件を取得
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(50));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      // 昇順に直す
      setMessages(msgs.reverse());
    }, (error) => {
      console.error("Chat Error: ", error);
    });

    return () => unsubscribe();
  }, []);

  // 新しいメッセージが来たら一番下へスクロール
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !userId) return;

    const textToSend = inputText.trim();
    setInputText('');

    try {
      await addDoc(collection(db, 'messages'), {
        userId,
        userName: userName || '名無しさん',
        text: textToSend,
        createdAt: serverTimestamp()
      });
      
      // Haptic feedback
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(30);
      }
    } catch (error) {
      console.error("Error sending message: ", error);
    }
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.chatHeader}>
        <div className={styles.chatTitle}>
          💬 作戦会議
        </div>
      </div>
      
      <div className={styles.messagesArea}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', marginTop: '20px', fontSize: '14px' }}>
            メッセージはまだありません。<br/>最初のメッセージを送りましょう！
          </div>
        )}
        {messages.map(msg => {
          const isOwn = msg.userId === userId;
          return (
            <div key={msg.id} className={`${styles.messageRow} ${isOwn ? styles.ownMessage : styles.otherMessage}`}>
              {!isOwn && <div className={styles.messageSender}>{msg.userName}</div>}
              <div className={styles.messageBubble}>
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form className={styles.inputArea} onSubmit={handleSend}>
        <input 
          type="text" 
          className={styles.inputField}
          placeholder="メッセージを入力..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          maxLength={100}
        />
        <button 
          type="submit" 
          className={styles.sendButton}
          disabled={!inputText.trim()}
          aria-label="送信"
        >
          ➤
        </button>
      </form>
    </div>
  );
};
