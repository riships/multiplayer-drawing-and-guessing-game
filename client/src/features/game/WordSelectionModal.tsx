import React from 'react';
import { Clock, PenTool } from 'lucide-react';
import styles from './WordSelectionModal.module.css';

interface WordSelectionModalProps {
  words: string[];
  timeLeft: number;
  onSelectWord: (word: string) => void;
}

export const WordSelectionModal: React.FC<WordSelectionModalProps> = ({
  words,
  timeLeft,
  onSelectWord,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-selection-title"
      className={styles.overlay}
    >
      <div className={`panel ${styles.modal}`}>
        <div className={styles.topBadge}>
          <PenTool size={18} />
          <span className={styles.subtitle}>Your Turn to Draw</span>
        </div>

        <h2 id="word-selection-title" className={styles.title}>
          Choose a Word
        </h2>

        <div className={`tabular-nums ${styles.timer}`}>
          <Clock size={15} />
          <span>Auto-selecting in {timeLeft} seconds</span>
        </div>

        <div className={styles.wordList}>
          {words.map((word) => (
            <button
              key={word}
              type="button"
              onClick={() => onSelectWord(word)}
              className={`btn btn-secondary ${styles.wordButton}`}
            >
              <span>{word}</span>
              <span className={styles.letterCount}>{word.length} letters</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
