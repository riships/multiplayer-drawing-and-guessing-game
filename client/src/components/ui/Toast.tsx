import React from 'react';
import { Check } from 'lucide-react';
import styles from './Toast.module.css';

interface ToastProps {
  message: string;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <Check size={16} />
      <span>{message.replace('🎉 ', '')}</span>
    </div>
  );
};
