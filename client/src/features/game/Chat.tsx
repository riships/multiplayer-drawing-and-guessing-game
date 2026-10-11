import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Player } from '../../types';
import { Send, AlertCircle, MessageSquare } from 'lucide-react';
import styles from './Chat.module.css';

interface ChatProps {
  messages: ChatMessage[];
  currentPlayer: Player | undefined;
  rateLimitWarning: string | null;
  onSendMessage: (text: string) => void;
}

export const Chat: React.FC<ChatProps> = ({
  messages,
  currentPlayer,
  rateLimitWarning,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const lastSubmitTimeRef = useRef<number>(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    const now = Date.now();
    // Debounce rapid submits (prevent spam / accidental double-clicks within 250ms)
    if (now - lastSubmitTimeRef.current < 250) {
      return;
    }
    lastSubmitTimeRef.current = now;

    onSendMessage(text);
    setInputText('');
  };

  const isDrawing = currentPlayer?.isDrawing;
  const hasGuessed = currentPlayer?.hasGuessed;

  return (
    <div className={`panel ${styles.container}`}>
      {/* Panel Header */}
      <div className="panel-header">
        <div className={styles.headerTitle}>
          <MessageSquare size={16} color="var(--color-text-muted)" />
          <span>Guesses & Chat</span>
        </div>
        <span className={styles.headerRateLimit}>
          3 msgs / 2s limit
        </span>
      </div>

      {/* Messages Scroll View */}
      <div className={styles.messageList}>
        {messages.map((msg) => {
          if (msg.type === 'correct') {
            return (
              <div key={msg.id} className={styles.msgCorrect}>
                {msg.text.replace('🎉 ', '')}
              </div>
            );
          }

          if (msg.type === 'close') {
            return (
              <div key={msg.id} className={styles.msgClose}>
                {msg.text.replace('💡 ', '')}
              </div>
            );
          }

          if (msg.type === 'system') {
            return (
              <div key={msg.id} className={styles.msgSystem}>
                {msg.text}
              </div>
            );
          }

          return (
            <div key={msg.id} className={styles.msgStandard}>
              <strong className={styles.msgSender}>{msg.senderName}:</strong>
              <span className={styles.msgText}>{msg.text}</span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Warning Alert if Rate-Limited */}
      {rateLimitWarning && (
        <div className={styles.rateLimitAlert}>
          <AlertCircle size={14} />
          <span>{rateLimitWarning}</span>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className={styles.chatForm}>
        <div className={styles.inputWrapper}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value.slice(0, 100))}
            placeholder={
              isDrawing
                ? 'You are drawing this turn'
                : hasGuessed
                ? 'You guessed the word! Chat here...'
                : 'Type your guess here...'
            }
            disabled={isDrawing}
            aria-label="Guess or chat message"
            className={`form-input ${styles.chatInput}`}
          />
          <span className={`tabular-nums ${styles.charCounter}`}>
            {inputText.length}/100
          </span>
        </div>
        <button
          type="submit"
          disabled={!inputText.trim() || isDrawing}
          aria-label="Send message"
          className={`btn btn-primary ${styles.sendButton}`}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
};
