import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Level, ContainerState } from '../types';
import { withBase } from '../constants';
import Container from './Container';
import Modal from './Modal';
import { RotateCcw, Info, Droplets, Undo2, LogOut, Lightbulb, Lock, ChevronRight, Trash2, Music, Volume2, VolumeX, Plus, Minus } from 'lucide-react';

interface GameLevelProps {
  level: Level;
  onLevelComplete: () => void;
  onExit: () => void;
  audioSettings: { music: boolean; sfx: boolean };
  toggleMusic: () => void;
  toggleSfx: () => void;
  playRandomSfx: (type: 'transfer' | 'sink' | 'tap') => void;
  isMobile?: boolean;
  stageAspectRatio: number;
  showFullscreenAd: () => Promise<boolean>;
  showRewardedVideo: () => Promise<boolean>;
}

interface ViewportSize {
  width: number;
  height: number;
}

const GameLevel: React.FC<GameLevelProps> = ({
  level,
  onLevelComplete,
  onExit,
  audioSettings,
  toggleMusic,
  toggleSfx,
  playRandomSfx,
  isMobile = false,
  showFullscreenAd,
  showRewardedVideo
}) => {
  const [containers, setContainers] = useState<ContainerState[]>([]);
  const [history, setHistory] = useState<ContainerState[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGoalModal, setShowGoalModal] = useState(true);
  const [showWinModal, setShowWinModal] = useState(false);
  const [showHintModal, setShowHintModal] = useState(false);
  const [revealedHintsCount, setRevealedHintsCount] = useState(0);
  const [isPouring, setIsPouring] = useState(false);

  // Real-time viewport tracking
  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 });
  const gameAreaRef = useRef<HTMLDivElement | null>(null);

  // Track viewport size in real-time using ResizeObserver
  useEffect(() => {
    const updateViewport = () => {
      if (gameAreaRef.current) {
        const rect = gameAreaRef.current.getBoundingClientRect();
        setViewport({ width: rect.width, height: rect.height });
      } else {
        setViewport({ width: window.innerWidth, height: window.innerHeight });
      }
    };

    updateViewport();

    // Use ResizeObserver for real-time tracking
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateViewport);
    });

    if (gameAreaRef.current) {
      resizeObserver.observe(gameAreaRef.current);
    }

    // Also listen to window resize as fallback
    window.addEventListener('resize', updateViewport);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  // Calculate dynamic sizing based on viewport
  const sizing = useMemo(() => {
    const { width, height } = viewport;
    if (width === 0 || height === 0) {
      return { containerScale: 1, headerHeight: 56, toolsHeight: 80 };
    }

    const containerCount = level.containers.length;
    const hasSink = level.hasSinkAndTap;

    // Calculate available space for game elements
    const headerHeight = isMobile ? 48 : 64;
    // Account for BOTH tap and sink sections when hasSinkAndTap is true
    const toolsHeight = hasSink ? (isMobile ? 120 : 160) : 0;
    const padding = isMobile ? 16 : 32;

    const availableHeight = height - headerHeight - toolsHeight - padding * 2;
    const availableWidth = width - padding * 2;

    // Calculate optimal container size
    const maxContainerWidth = availableWidth / Math.min(containerCount, 4);
    const maxContainerHeight = availableHeight * (hasSink ? 0.7 : 0.85);

    // Base container size
    const baseWidth = isMobile ? 70 : 140;
    const baseHeight = isMobile ? 110 : 220;

    // Calculate scale to fit within available space
    const scaleByWidth = maxContainerWidth / (baseWidth * 1.5);
    const scaleByHeight = maxContainerHeight / (baseHeight * 1.5);
    const containerScale = Math.min(scaleByWidth, scaleByHeight, isMobile ? 1.2 : 1.5);

    return {
      containerScale: Math.max(0.5, containerScale),
      headerHeight,
      toolsHeight,
      availableHeight,
      availableWidth
    };
  }, [viewport, level.containers.length, level.hasSinkAndTap, isMobile]);

  useEffect(() => {
    const initialStates = level.containers.map(c => ({
      id: c.id,
      currentAmount: c.initialAmount
    }));
    setContainers(initialStates);
    setHistory([]);
    setSelectedId(null);
    setShowGoalModal(true);
    setShowWinModal(false);
    setRevealedHintsCount(0);
  }, [level]);

  useEffect(() => {
    if (isPouring) return;
    const isWin = level.targets.every(target => {
      if (target.containerId === 'ANY') {
        return containers.some(c => c.currentAmount === target.amount);
      }
      const container = containers.find(c => c.id === target.containerId);
      return container && container.currentAmount === target.amount;
    });
    if (isWin && containers.length > 0) {
      setTimeout(() => {
        setShowWinModal(true);
      }, 600);
    }
  }, [containers, level.targets, isPouring]);

  const handleContainerClick = (id: string) => {
    if (isPouring) return;

    if (selectedId === 'TAP') {
      fillFromTap(id);
      setSelectedId(null);
    } else if (selectedId === 'SINK') {
      emptyToSink(id);
      setSelectedId(null);
    } else if (selectedId === null) {
      setSelectedId(id);
    } else if (selectedId === id) {
      setSelectedId(null);
    } else if (selectedId !== 'TAP' && selectedId !== 'SINK') {
      pourLiquid(selectedId, id);
    }
  };

  const handleTapButtonClick = () => {
    if (isPouring) return;
    if (selectedId === 'TAP') {
      setSelectedId(null);
    } else if (selectedId !== null && selectedId !== 'SINK') {
      fillFromTap(selectedId);
      setSelectedId(null);
    } else {
      setSelectedId('TAP');
    }
  };

  const handleSinkButtonClick = () => {
    if (isPouring) return;
    if (selectedId === 'SINK') {
      setSelectedId(null);
    } else if (selectedId !== null && selectedId !== 'TAP') {
      emptyToSink(selectedId);
      setSelectedId(null);
    } else {
      setSelectedId('SINK');
    }
  };

  const pourLiquid = (fromId: string, toId: string) => {
    const fromContainer = containers.find(c => c.id === fromId);
    const toContainer = containers.find(c => c.id === toId);
    const toDef = level.containers.find(c => c.id === toId);
    if (!fromContainer || !toContainer || !toDef) return;

    const availableSpace = toDef.capacity - toContainer.currentAmount;
    if (availableSpace <= 0 || fromContainer.currentAmount === 0) {
      setSelectedId(null);
      return;
    }

    const amountToPour = Math.min(fromContainer.currentAmount, availableSpace);
    if (amountToPour > 0) {
      performAction(() => {
        return containers.map(c => {
          if (c.id === fromId) return { ...c, currentAmount: c.currentAmount - amountToPour };
          if (c.id === toId) return { ...c, currentAmount: c.currentAmount + amountToPour };
          return c;
        });
      }, 'transfer');
    }
    setSelectedId(null);
  };

  const fillFromTap = (toId: string) => {
    const toDef = level.containers.find(c => c.id === toId);
    const toContainer = containers.find(c => c.id === toId);
    if (!toDef || !toContainer || toContainer.currentAmount === toDef.capacity) return;

    performAction(() => containers.map(c => c.id === toId ? { ...c, currentAmount: toDef.capacity } : c), 'tap');
  };

  const emptyToSink = (fromId: string) => {
    const fromContainer = containers.find(c => c.id === fromId);
    if (!fromContainer || fromContainer.currentAmount === 0) return;

    performAction(() => containers.map(c => c.id === fromId ? { ...c, currentAmount: 0 } : c), 'sink');
  };

  const performAction = (getNewState: () => ContainerState[], soundType: 'transfer' | 'sink' | 'tap') => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(containers))]);
    setIsPouring(true);
    playRandomSfx(soundType);
    setContainers(getNewState());
    setTimeout(() => {
      setIsPouring(false);
    }, 600);
  };

  const handleUndo = () => {
    if (history.length === 0 || isPouring) return;
    setContainers(history[history.length - 1]);
    setHistory(prev => prev.slice(0, -1));
    setSelectedId(null);
  };

  const handleReset = () => {
    if (isPouring) return;
    setContainers(level.containers.map(c => ({ id: c.id, currentAmount: c.initialAmount })));
    setHistory([]);
    setSelectedId(null);
  };

  const selectedContainer = selectedId ? containers.find(c => c.id === selectedId) : null;
  const selectedDef = selectedId ? level.containers.find(c => c.id === selectedId) : null;
  const isTapSuggested = selectedContainer && selectedDef && selectedContainer.currentAmount < selectedDef.capacity;
  const isSinkSuggested = selectedContainer && selectedDef && selectedContainer.currentAmount > 0;

  return (
    <div className="game-level-root">
      {/* Header */}
      <header className="game-level-header">
        <div className="game-level-header-left">
          <button onClick={onExit} className="game-level-btn game-level-btn-exit">
            <LogOut size={isMobile ? 18 : 22} />
          </button>
          <div className="game-level-title">
            <h1>Уровень {level.id}</h1>
            {!isMobile && <span>{level.title}</span>}
          </div>
        </div>

        <div className="game-level-header-right">
          <button onClick={toggleMusic} className={`game-level-btn ${audioSettings.music ? 'game-level-btn-music-on' : 'game-level-btn-music-off'}`}>
            <Music size={isMobile ? 16 : 20} className={audioSettings.music ? '' : 'opacity-40'} />
          </button>
          <button onClick={toggleSfx} className={`game-level-btn ${audioSettings.sfx ? 'game-level-btn-sfx-on' : 'game-level-btn-sfx-off'}`}>
            {audioSettings.sfx ? <Volume2 size={isMobile ? 16 : 20} /> : <VolumeX size={isMobile ? 16 : 20} />}
          </button>

          {!isMobile && <div className="game-level-divider"></div>}

          <button
            onClick={async () => {
              await showFullscreenAd();
              setShowHintModal(true);
              if (revealedHintsCount === 0) setRevealedHintsCount(1);
            }}
            className="game-level-btn game-level-btn-hint"
          >
            <Lightbulb size={isMobile ? 16 : 20} />
            {!isMobile && <span>Подсказка</span>}
          </button>

          <button onClick={() => setShowGoalModal(true)} className="game-level-btn game-level-btn-info">
            <Info size={isMobile ? 16 : 20} />
          </button>

          <button onClick={handleUndo} disabled={history.length === 0} className={`game-level-btn ${history.length === 0 ? 'game-level-btn-disabled' : 'game-level-btn-undo'}`}>
            <Undo2 size={isMobile ? 16 : 20} />
          </button>

          <button onClick={handleReset} className="game-level-btn game-level-btn-reset">
            <RotateCcw size={isMobile ? 16 : 20} />
          </button>
        </div>
      </header>

      {/* Main Game Area - portrait layout for mobile */}
      <main className="game-level-main game-level-main-portrait" ref={gameAreaRef}>
        {/* Faucet and Controls Section - sprite with buttons to the right */}
        {level.hasSinkAndTap && (
          <div className="game-level-faucet-container">
            {/* Faucet Sprite */}
            <div className="game-level-faucet-sprite">
              <img src={withBase('images/faucetandsink.png')} alt="Кран с раковиной" />
            </div>

            {/* Control Buttons - to the right of sprite */}
            <div className="game-level-faucet-controls">
              <button
                onClick={handleTapButtonClick}
                className={`game-level-control-btn game-level-control-fill ${selectedId === 'TAP' ? 'active' : ''} ${isTapSuggested ? 'suggested' : ''}`}
              >
                <Plus size={isMobile ? 24 : 32} strokeWidth={3} />
                <span>{selectedId === 'TAP' ? 'ВЫБЕРИТЕ' : isTapSuggested ? 'НАЛИТЬ?' : 'НАЛИТЬ'}</span>
              </button>

              <button
                onClick={handleSinkButtonClick}
                className={`game-level-control-btn game-level-control-drain ${selectedId === 'SINK' ? 'active' : ''} ${isSinkSuggested ? 'suggested' : ''}`}
              >
                <Minus size={isMobile ? 24 : 32} strokeWidth={3} />
                <span>{selectedId === 'SINK' ? 'ВЫБЕРИТЕ' : isSinkSuggested ? 'СЛИТЬ?' : 'СЛИТЬ'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Containers Section */}
        <div className="game-level-containers-section">
          <div
            className="game-level-containers-grid"
            style={{
              '--container-scale': sizing.containerScale
            } as React.CSSProperties}
          >
            {level.containers.map(def => {
              const state = containers.find(c => c.id === def.id);
              return (
                <Container
                  key={def.id}
                  def={def}
                  currentAmount={state?.currentAmount || 0}
                  isSelected={selectedId === def.id}
                  isSource={selectedId === def.id}
                  activeTool={selectedId === 'TAP' ? 'TAP' : selectedId === 'SINK' ? 'SINK' : 'NONE'}
                  onClick={() => handleContainerClick(def.id)}
                  isMobile={isMobile}
                  scale={sizing.containerScale}
                />
              );
            })}
          </div>
        </div>
      </main>

      {/* Modals */}
      <Modal title={`Уровень ${level.id}`} isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} isMobile={isMobile}>
        <p className={isMobile ? 'mb-2 text-sm' : 'mb-4'}>{level.description}</p>
        <div className={`bg-blue-50 rounded-xl border border-blue-100 text-left ${isMobile ? 'p-2' : 'p-4'}`}>
          <h3 className={`font-bold text-blue-800 text-center ${isMobile ? 'text-sm mb-1' : 'mb-2'}`}>Цель:</h3>
          <ul className={`list-disc list-inside text-blue-900 ${isMobile ? 'space-y-0.5 text-xs' : 'space-y-1'}`}>
            {level.targets.map((t, idx) => (
              <li key={idx}>{t.containerId === 'ANY' ? `Любая тара: ${t.amount} мл` : `${level.containers.find(c=>c.id===t.containerId)?.name}: ${t.amount} мл`}</li>
            ))}
          </ul>
        </div>
      </Modal>

      <Modal title="Победа!" isOpen={showWinModal} isMobile={isMobile} actions={
        <button onClick={async () => {
          await showFullscreenAd();
          onLevelComplete();
        }} className={`bg-green-500 hover:bg-green-600 text-white font-bold rounded-full shadow-lg ${isMobile ? 'px-5 py-2 text-sm' : 'px-8 py-3 text-lg'}`}>
          Далее
        </button>
      }>
        <div className="text-center">
          <div className={isMobile ? 'text-4xl mb-2' : 'text-6xl mb-4'}>✨</div>
          <p className={isMobile ? 'text-sm' : ''}>Великолепно! Вы нашли решение.</p>
        </div>
      </Modal>

      {showHintModal && (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md overflow-y-auto ${isMobile ? 'p-2' : 'p-4'}`}>
          <div className={`bg-white shadow-2xl w-full flex flex-col overflow-hidden ${isMobile ? 'rounded-xl max-w-[95vw] max-h-[85vh]' : 'rounded-3xl max-w-2xl max-h-[90vh]'}`}>
            <div className={`bg-gradient-to-r from-amber-500 to-orange-500 flex justify-between items-center ${isMobile ? 'p-3' : 'p-6'}`}>
              <h2 className={`font-bold text-white flex items-center ${isMobile ? 'text-base gap-1.5' : 'text-2xl gap-2'}`}><Lightbulb size={isMobile ? 18 : 24} /> Подсказки</h2>
              <button onClick={() => setShowHintModal(false)} className={`text-white hover:bg-white/20 rounded-full transition-colors ${isMobile ? 'p-1.5' : 'p-2'}`}><LogOut size={isMobile ? 18 : 24} /></button>
            </div>
            <div className={`flex-1 overflow-y-auto bg-slate-50 ${isMobile ? 'p-3 space-y-3' : 'p-6 space-y-6'}`}>
              {level.solutionSteps.map((step, idx) => (
                <div key={idx} className={`relative border-2 transition-all duration-500 ${isMobile ? 'p-2 rounded-xl' : 'p-4 rounded-2xl'} ${idx < revealedHintsCount ? 'bg-white border-amber-200 shadow-sm' : 'bg-slate-100 border-slate-200 opacity-60'}`}>
                  <div className={`flex items-center ${isMobile ? 'gap-2 mb-2' : 'gap-4 mb-3'}`}>
                    <span className={`flex-shrink-0 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold ${isMobile ? 'w-6 h-6 text-xs' : 'w-8 h-8'}`}>{idx + 1}</span>
                    <h3 className={`font-semibold text-slate-800 ${isMobile ? 'text-xs' : ''}`}>{idx < revealedHintsCount ? step.description : "Шаг скрыт"}</h3>
                  </div>
                  {idx < revealedHintsCount ? (
                    <div className={`flex justify-center pt-2 ${isMobile ? 'gap-2' : 'gap-4'}`}>
                      {level.containers.map(cDef => {
                        const amt = step.amounts[cDef.id] || 0;
                        const pct = (amt / cDef.capacity) * 100;
                        return (
                          <div key={cDef.id} className="flex flex-col items-center">
                            <div className={`relative border-2 border-slate-400 rounded-b-lg overflow-hidden bg-slate-200/30 ${isMobile ? 'w-8 h-12' : 'w-12 h-20'}`}>
                              <div className="absolute bottom-0 w-full bg-blue-500/80 transition-all duration-1000" style={{ height: `${pct}%` }}></div>
                            </div>
                            <span className={`mt-1 font-bold text-slate-600 ${isMobile ? 'text-[8px]' : 'text-[10px]'}`}>{amt} мл</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className={`flex justify-center ${isMobile ? 'py-2' : 'py-4'}`}><Lock className="text-slate-400" size={isMobile ? 16 : 24} /></div>}
                </div>
              ))}
            </div>
            <div className={`bg-white border-t flex justify-center ${isMobile ? 'p-3 gap-2' : 'p-6 gap-4'}`}>
              <button disabled={revealedHintsCount >= level.solutionSteps.length} onClick={async () => {
                const rewarded = await showRewardedVideo();
                if (rewarded) {
                  setRevealedHintsCount(prev => prev + 1);
                }
              }} className={`flex items-center rounded-full font-bold transition-all ${isMobile ? 'gap-1 px-3 py-2 text-xs' : 'gap-2 px-6 py-3 text-lg'} ${revealedHintsCount >= level.solutionSteps.length ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg active:scale-95'}`}>
                {isMobile ? '🎥 Ещё шаг' : '🎥 Открыть еще один шаг'} <ChevronRight size={isMobile ? 14 : 20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameLevel;
