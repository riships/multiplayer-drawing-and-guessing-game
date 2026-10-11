import React, { useState } from 'react';
import { useGameSocket } from './hooks/useGameSocket';
import { Lobby } from './features/lobby';
import {
  Header,
  Canvas,
  Chat,
  PlayerList,
  WordSelectionModal,
} from './features/game';
import { GameOver } from './features/game-over';
import { ReplayViewer } from './features/replay';
import { Toast, RoundReveal } from './components/ui';

export const App: React.FC = () => {
  const {
    playerId,
    roomState,
    messages,
    canvasHistory,
    toastMessage,
    rateLimitWarning,
    roundReveal,
    gameOverData,
    joinRoom,
    updateSettings,
    startGame,
    selectWord,
    drawStroke,
    drawFill,
    undoStroke,
    clearCanvas,
    sendMessage,
    setGameOverData,
    leaveRoom,
    returnToLobby,
  } = useGameSocket();

  const [showReplay, setShowReplay] = useState(false);

  // If not joined or in lobby state, show Lobby
  if (!roomState || roomState.state === 'LOBBY') {
    return (
      <Lobby
        roomState={roomState}
        myPlayerId={playerId}
        onJoinRoom={joinRoom}
        onLeaveRoom={leaveRoom}
        onUpdateSettings={updateSettings}
        onStartGame={startGame}
      />
    );
  }

  const currentPlayer = roomState.players.find((p) => p.id === playerId);
  const isDrawer = roomState.currentDrawerId === playerId;
  const currentDrawer = roomState.players.find((p) => p.id === roomState.currentDrawerId);
  const isHost = !!currentPlayer?.isHost;

  return (
    <div className="game-container">
      {/* Toast Notification */}
      {toastMessage && <Toast message={toastMessage} />}

      {/* Game Header */}
      <Header roomState={roomState} myPlayerId={playerId} />

      {/* Main 3-Column Game Grid */}
      <div className="game-main-grid">
        {/* Left Column: Player Scoreboard */}
        <PlayerList players={roomState.players} myPlayerId={playerId} />

        {/* Center Column: Drawing Canvas */}
        <Canvas
          isDrawer={isDrawer && roomState.state === 'DRAWING'}
          drawerName={currentDrawer?.name}
          canvasHistory={canvasHistory}
          onDrawStroke={drawStroke}
          onDrawFill={drawFill}
          onUndo={undoStroke}
          onClear={clearCanvas}
        />

        {/* Right Column: Chat & Guesses */}
        <Chat
          messages={messages}
          currentPlayer={currentPlayer}
          rateLimitWarning={rateLimitWarning}
          onSendMessage={sendMessage}
        />
      </div>

      {/* Round Reveal Intermission Banner */}
      {roundReveal && roomState.state === 'ROUND_REVEAL' && (
        <RoundReveal word={roundReveal.word} />
      )}

      {/* Drawer Word Selection Modal */}
      {roomState.state === 'SELECTING_WORD' && isDrawer && roomState.wordOptions && (
        <WordSelectionModal
          words={roomState.wordOptions}
          timeLeft={roomState.timeLeft}
          onSelectWord={(word) => selectWord(roomState.roomId, word)}
        />
      )}

      {/* Game Over Screen */}
      {gameOverData && roomState.state === 'GAME_OVER' && !showReplay && (
        <GameOver
          podium={gameOverData.podium}
          replays={gameOverData.replays}
          isHost={isHost}
          onOpenReplay={() => setShowReplay(true)}
          onPlayAgain={() => {
            setGameOverData(null);
            startGame(roomState.roomId);
          }}
          onReturnToLobby={() => {
            setGameOverData(null);
            returnToLobby(roomState.roomId);
          }}
          onExit={() => {
            setGameOverData(null);
            leaveRoom();
          }}
        />
      )}

      {/* Drawing Replay Studio */}
      {showReplay && gameOverData && (
        <ReplayViewer
          replays={gameOverData.replays}
          onClose={() => setShowReplay(false)}
        />
      )}
    </div>
  );
};
