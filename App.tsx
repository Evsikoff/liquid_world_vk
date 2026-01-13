import React, { useState, useEffect, useRef, useCallback } from 'react';
import MainMenu from './components/MainMenu';
import GameLevel from './components/GameLevel';
import LevelSelect from './components/LevelSelect';
import { useDeviceDetection } from './hooks/useDeviceDetection';
import { useInterfaceLanguage } from './hooks/useInterfaceLanguage';
import { LEVELS, AUDIO_ASSETS } from './constants';
import {
  initVKBridge,
  getCloudData,
  saveCloudData,
  showFullscreenAd as showFullscreenAdBase,
  showRewardedVideo as showRewardedVideoBase,
  GameProgress
} from './services/vkBridge';

const PROGRESS_KEY = 'liquid_puzzle_v2_progress';
const MAX_LEVEL_KEY = 'liquid_puzzle_v2_max_level';
const AUDIO_SETTINGS_KEY = 'liquid_puzzle_v2_audio';

const DESKTOP_STAGE_METRICS = {
  aspectRatio: 1.7344,
  containerHeight: 698.4,
  containerWidth: 1211.3,
  observedHeight: 698.39,
  observedWidth: 1211.3,
  stageAspectRatio: 1.7344,
  stageScale: 0.9463
};

const MOBILE_STAGE_METRICS = {
  aspectRatio: 0.4621,
  containerHeight: 844,
  containerWidth: 390,
  observedHeight: 844,
  observedWidth: 390,
  stageAspectRatio: 0.4621,
  stageScale: 0.75
};

// Web Audio API manager - doesn't show in system media player
interface AudioBufferCache {
  [key: string]: AudioBuffer;
}

const App: React.FC = () => {
  const [view, setView] = useState<'menu' | 'game' | 'levelSelect'>('menu');
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [maxReachedLevelIndex, setMaxReachedLevelIndex] = useState(0);
  const [stageAspectRatio, setStageAspectRatio] = useState(16 / 9);
  const language = useInterfaceLanguage('ru');

  const stageRef = useRef<HTMLDivElement | null>(null);

  // Mobile device detection
  const { isMobile } = useDeviceDetection();

  // Audio settings
  const [audioSettings, setAudioSettings] = useState({
    music: true,
    sfx: true
  });

  // Ref to avoid callback recreation when audioSettings changes
  const audioSettingsRef = useRef(audioSettings);
  useEffect(() => {
    audioSettingsRef.current = audioSettings;
  }, [audioSettings]);

  const applyResponsiveStageMetrics = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;

    const viewportAspect = window.innerWidth / window.innerHeight;
    const responsiveAspect = Number(viewportAspect.toFixed(3));

    el.style.removeProperty('width');
    el.style.removeProperty('height');
    el.style.setProperty('--stage-scale', '1');
    el.style.setProperty('--stage-aspect', responsiveAspect.toString());
    setStageAspectRatio(responsiveAspect);
  }, []);

  const applyFixedStageMetrics = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;

    const metrics = isMobile ? MOBILE_STAGE_METRICS : DESKTOP_STAGE_METRICS;

    el.style.setProperty('--stage-scale', metrics.stageScale.toString());
    el.style.setProperty('--stage-aspect', metrics.stageAspectRatio.toString());
    el.style.width = `${metrics.containerWidth}px`;
    el.style.height = `${metrics.containerHeight}px`;
    setStageAspectRatio(metrics.stageAspectRatio);

    console.log('Изображение устоялось', {
      observedWidth: metrics.observedWidth,
      observedHeight: metrics.observedHeight,
      containerWidth: metrics.containerWidth,
      containerHeight: metrics.containerHeight,
      aspectRatio: metrics.aspectRatio,
      stageScale: metrics.stageScale,
      stageAspectRatio: metrics.stageAspectRatio
    });
  }, [isMobile]);

  // Web Audio API refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<AudioBufferCache>({});
  const currentMusicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const sfxGainRef = useRef<GainNode | null>(null);

  const updateMusicGainForVisibility = useCallback(() => {
    if (!musicGainRef.current) return;
    const shouldMute = document.visibilityState === 'hidden' || !audioSettingsRef.current.music;
    musicGainRef.current.gain.value = shouldMute ? 0 : 1;
  }, []);

  // Initialize AudioContext on first user interaction
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      masterGainRef.current = audioContextRef.current.createGain();
      musicGainRef.current = audioContextRef.current.createGain();
      sfxGainRef.current = audioContextRef.current.createGain();

      musicGainRef.current.connect(masterGainRef.current);
      sfxGainRef.current.connect(masterGainRef.current);
      masterGainRef.current.connect(audioContextRef.current.destination);
      updateMusicGainForVisibility();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, [updateMusicGainForVisibility]);

  // Load audio file into buffer
  const loadAudioBuffer = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    if (audioBuffersRef.current[url]) {
      return audioBuffersRef.current[url];
    }

    const ctx = initAudioContext();
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      audioBuffersRef.current[url] = audioBuffer;
      return audioBuffer;
    } catch (error) {
      console.log("Failed to load audio:", url);
      return null;
    }
  }, [initAudioContext]);

  // Play music with loop
  const playMusic = useCallback(async (url: string) => {
    const ctx = initAudioContext();
    const buffer = await loadAudioBuffer(url);
    if (!buffer || !musicGainRef.current) return;

    // Stop current music
    if (currentMusicSourceRef.current) {
      currentMusicSourceRef.current.stop();
      currentMusicSourceRef.current.disconnect();
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(musicGainRef.current);
    source.start(0);
    currentMusicSourceRef.current = source;
  }, [initAudioContext, loadAudioBuffer]);

  // Stop music
  const stopMusic = useCallback(() => {
    if (currentMusicSourceRef.current) {
      try {
        currentMusicSourceRef.current.stop();
        currentMusicSourceRef.current.disconnect();
      } catch (e) {
        // Already stopped
      }
      currentMusicSourceRef.current = null;
    }
  }, []);

  // Play SFX (one-shot)
  const playSfx = useCallback(async (url: string) => {
    const ctx = initAudioContext();
    const buffer = await loadAudioBuffer(url);
    if (!buffer || !sfxGainRef.current) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(sfxGainRef.current);
    source.start(0);
  }, [initAudioContext, loadAudioBuffer]);

  // Load progress and audio settings on mount
  useEffect(() => {
    const loadProgress = async () => {
      // Сначала инициализируем VK Bridge
      const bridgeInitialized = await initVKBridge();

      // Пробуем загрузить из облачных сохранений
      let cloudData: GameProgress | null = null;
      if (bridgeInitialized) {
        cloudData = await getCloudData(PROGRESS_KEY);
      }

      // Загружаем данные из localStorage
      const savedCurrent = localStorage.getItem(PROGRESS_KEY);
      const savedMax = localStorage.getItem(MAX_LEVEL_KEY);
      const savedAudio = localStorage.getItem(AUDIO_SETTINGS_KEY);

      let localCurrentLevel = 0;
      let localMaxLevel = 0;
      let localAudioSettings = { music: true, sfx: true };

      if (savedCurrent) {
        const idx = parseInt(savedCurrent, 10);
        if (!isNaN(idx) && idx < LEVELS.length) {
          localCurrentLevel = idx;
        }
      }

      if (savedMax) {
        const idx = parseInt(savedMax, 10);
        if (!isNaN(idx)) {
          localMaxLevel = idx;
        }
      }

      if (savedAudio) {
        try {
          localAudioSettings = JSON.parse(savedAudio);
        } catch (e) {
          console.error("Failed to parse audio settings");
        }
      }

      if (cloudData) {
        // Сравниваем облачные и локальные данные, используем более актуальные
        const useCloud = cloudData.maxLevel >= localMaxLevel;

        if (useCloud) {
          console.log('Using cloud data (more progress):', cloudData);
          setCurrentLevelIndex(cloudData.currentLevel);
          setMaxReachedLevelIndex(cloudData.maxLevel);
          setAudioSettings(cloudData.audioSettings);

          // Синхронизируем localStorage с облаком
          localStorage.setItem(PROGRESS_KEY, cloudData.currentLevel.toString());
          localStorage.setItem(MAX_LEVEL_KEY, cloudData.maxLevel.toString());
          localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(cloudData.audioSettings));
        } else {
          console.log('Using local data (more progress):', { localCurrentLevel, localMaxLevel });
          setCurrentLevelIndex(localCurrentLevel);
          setMaxReachedLevelIndex(localMaxLevel);
          setAudioSettings(localAudioSettings);

          // Синхронизируем облако с localStorage
          const progress: GameProgress = {
            currentLevel: localCurrentLevel,
            maxLevel: localMaxLevel,
            audioSettings: localAudioSettings
          };
          await saveCloudData(PROGRESS_KEY, progress);
        }
      } else {
        // Нет облачных данных, используем localStorage
        console.log('No cloud data, using localStorage:', { localCurrentLevel, localMaxLevel });
        setCurrentLevelIndex(localCurrentLevel);
        setMaxReachedLevelIndex(localMaxLevel);
        setAudioSettings(localAudioSettings);

        // Мигрируем localStorage в облако если есть прогресс
        if (localMaxLevel > 0 && bridgeInitialized) {
          console.log('Migrating localStorage progress to cloud');
          const progress: GameProgress = {
            currentLevel: localCurrentLevel,
            maxLevel: localMaxLevel,
            audioSettings: localAudioSettings
          };
          await saveCloudData(PROGRESS_KEY, progress);
        }
      }
    };

    loadProgress();

    // Preload audio files
    const preloadAudio = async () => {
      const urls = [
        AUDIO_ASSETS.music.menu,
        AUDIO_ASSETS.music.game,
        ...AUDIO_ASSETS.sfx.transfer,
        ...AUDIO_ASSETS.sfx.sink,
        ...AUDIO_ASSETS.sfx.tap
      ];
      for (const url of urls) {
        loadAudioBuffer(url);
      }
    };
    preloadAudio();

    // Cleanup on unmount
    return () => {
      stopMusic();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        masterGainRef.current = null;
        musicGainRef.current = null;
        sfxGainRef.current = null;
      }
    };
  }, [loadAudioBuffer, stopMusic]);

  useEffect(() => {
    const handleResize = () => {
      if (view === 'game') {
        applyResponsiveStageMetrics();
      } else {
        applyFixedStageMetrics();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [view, applyFixedStageMetrics, applyResponsiveStageMetrics]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      updateMusicGainForVisibility();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    updateMusicGainForVisibility();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updateMusicGainForVisibility]);

  // Update music gain when audio settings change
  useEffect(() => {
    updateMusicGainForVisibility();
  }, [audioSettings.music, updateMusicGainForVisibility]);

  // Track current music URL to avoid unnecessary restarts
  const currentMusicUrlRef = useRef<string | null>(null);

  // Music playback control based on view and settings
  useEffect(() => {
    const musicUrl = (view === 'menu' || view === 'levelSelect')
      ? AUDIO_ASSETS.music.menu
      : AUDIO_ASSETS.music.game;

    // Only start/change music if URL changed or music is not playing
    if (audioSettingsRef.current.music && musicUrl !== currentMusicUrlRef.current) {
      currentMusicUrlRef.current = musicUrl;
      playMusic(musicUrl);
    }
  }, [view, playMusic]);

  // Handle music toggle separately - don't restart, just control gain
  useEffect(() => {
    if (!audioSettings.music) {
      // Music is muted via gain, no need to stop the source
      // This prevents the music from restarting when re-enabled
    }
  }, [audioSettings.music]);

  // SFX playback helper
  const playRandomSfx = useCallback((type: 'transfer' | 'sink' | 'tap') => {
    if (!audioSettings.sfx) return;

    const variants = AUDIO_ASSETS.sfx[type];
    const randomUrl = variants[Math.floor(Math.random() * variants.length)];
    playSfx(randomUrl);
  }, [audioSettings.sfx, playSfx]);

  // Показ полноэкранной рекламы с автоматическим заглушением музыки
  const showFullscreenAd = useCallback(() => {
    return showFullscreenAdBase({
      onOpen: () => {
        if (musicGainRef.current) {
          musicGainRef.current.gain.value = 0;
        }
      },
      onClose: () => {
        if (musicGainRef.current) {
          musicGainRef.current.gain.value = audioSettings.music ? 1 : 0;
        }
      }
    });
  }, [audioSettings.music]);

  // Показ видео-рекламы с наградой с автоматическим заглушением музыки
  const showRewardedVideo = useCallback(() => {
    return showRewardedVideoBase({
      onOpen: () => {
        if (musicGainRef.current) {
          musicGainRef.current.gain.value = 0;
        }
      },
      onClose: () => {
        if (musicGainRef.current) {
          musicGainRef.current.gain.value = audioSettings.music ? 1 : 0;
        }
      }
    });
  }, [audioSettings.music]);

  const toggleMusic = () => {
    setAudioSettings(prev => {
      const newState = { ...prev, music: !prev.music };
      localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(newState));
      return newState;
    });
  };

  const toggleSfx = () => {
    setAudioSettings(prev => {
      const newState = { ...prev, sfx: !prev.sfx };
      localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(newState));
      return newState;
    });
  };

  const saveProgress = useCallback(async (currentIdx: number, maxIdx: number) => {
    // Сохраняем в localStorage
    localStorage.setItem(PROGRESS_KEY, currentIdx.toString());
    const newMax = Math.max(maxReachedLevelIndex, maxIdx);
    setMaxReachedLevelIndex(newMax);
    localStorage.setItem(MAX_LEVEL_KEY, newMax.toString());

    // Сохраняем в облачные сохранения VK (с ожиданием)
    const progress: GameProgress = {
      currentLevel: currentIdx,
      maxLevel: newMax,
      audioSettings: audioSettings
    };

    try {
      await saveCloudData(PROGRESS_KEY, progress);
      console.log('Progress saved to VK Cloud successfully:', progress);
    } catch (error) {
      console.error('Failed to save progress to VK Cloud:', error);
    }
  }, [maxReachedLevelIndex, audioSettings]);

  const handleStartNewGame = () => {
    initAudioContext(); // Ensure audio context is ready
    const hasProgress = localStorage.getItem(PROGRESS_KEY) !== null;

    if (hasProgress) {
      if (!window.confirm("Вы уверены, что хотите начать заново? Весь текущий прогресс будет сброшен.")) {
        return;
      }
    }

    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(MAX_LEVEL_KEY);

    setCurrentLevelIndex(0);
    setMaxReachedLevelIndex(0);
    saveProgress(0, 0);
    setView('game');
  };

  const handleContinue = () => {
    initAudioContext();
    setView('game');
  };

  const handleOpenLevelSelect = () => {
    initAudioContext();
    setView('levelSelect');
  };

  const handleSelectLevel = (index: number) => {
    setCurrentLevelIndex(index);
    saveProgress(index, index);
    setView('game');
  };

  const handleLevelComplete = () => {
    const nextIndex = currentLevelIndex + 1;
    if (nextIndex < LEVELS.length) {
      setCurrentLevelIndex(nextIndex);
      saveProgress(nextIndex, nextIndex);
    } else {
      alert("Поздравляем! Вы прошли все доступные уровни!");
      saveProgress(currentLevelIndex, currentLevelIndex);
      setView('menu');
    }
  };

  const handleExitToMenu = () => {
    saveProgress(currentLevelIndex, maxReachedLevelIndex);
    setView('menu');
  };

  return (
    <div className="app-shell" data-lang={language}>
      <div className="app-stage" ref={stageRef}>

        <div className="app-stage-scaler" style={{ aspectRatio: stageAspectRatio }}>
          <div className="app-stage-content">
            {view === 'menu' && (
              <MainMenu
                onStart={handleStartNewGame}
                canContinue={localStorage.getItem(PROGRESS_KEY) !== null}
                onContinue={handleContinue}
                onOpenLevelSelect={handleOpenLevelSelect}
                currentLevelId={LEVELS[currentLevelIndex].id}
                audioSettings={audioSettings}
                toggleMusic={toggleMusic}
                toggleSfx={toggleSfx}
                isMobile={isMobile}
              />
            )}

            {view === 'levelSelect' && (
              <LevelSelect
                levels={LEVELS}
                maxReachedIndex={maxReachedLevelIndex}
                onSelect={handleSelectLevel}
                onBack={() => setView('menu')}
                isMobile={isMobile}
              />
            )}

            {view === 'game' && (
              <GameLevel
                level={LEVELS[currentLevelIndex]}
                onLevelComplete={handleLevelComplete}
                onExit={handleExitToMenu}
                audioSettings={audioSettings}
                toggleMusic={toggleMusic}
                toggleSfx={toggleSfx}
                playRandomSfx={playRandomSfx}
                isMobile={isMobile}
                stageAspectRatio={stageAspectRatio}
                showFullscreenAd={showFullscreenAd}
                showRewardedVideo={showRewardedVideo}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;