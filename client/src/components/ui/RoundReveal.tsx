import React from 'react';
import styles from './RoundReveal.module.css';

interface RoundRevealProps {
  word: string;
}

export const RoundReveal: React.FC<RoundRevealProps> = ({ word }) => {
  return (
    <div className={styles.banner} role="alert">
      <div className={styles.subtitle}>Round Intermission</div>
      <div className={styles.wordTitle}>
        The word was: <span className={styles.highlightWord}>{word}</span>
      </div>
    </div>
  );
};
