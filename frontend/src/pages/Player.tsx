import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Square, Volume2, VolumeX, RotateCw, 
  ListMusic, Tv, Disc, Film, Minimize2, Maximize2
} from 'lucide-react';
import { User, Video, Category, DisplayState, formatDuration } from '../types';
import { TourGuide, TourStep } from '../components/TourGuide';
import { TutorialButton } from '../components/TutorialButton';

const playerTourSteps: TourStep[] = [
  {
    target: '#tour-player-status',
    title: '1. Status da Conexão da Tela',
    content: 'Indica se a tela do projetor ou monitor secundário está aberta e comunicando em tempo real.',
    position: 'bottom'
  },
  {
    target: '#tour-player-banner',
    title: '2. Monitor do Telão em Tempo Real',
    content: 'Exibe a thumbnail, título e canal do vídeo que o público está assistindo agora.',
    position: 'bottom'
  },
  {
    target: '#tour-player-controls',
    title: '3. Controles de Reprodução & Linha do Tempo',
    content: 'Pause, continue ou pare a transmissão com 1 clique. Arraste a barra para avançar ou retroceder a música.',
    position: 'top'
  },
  {
    target: '#tour-player-volume',
    title: '4. Mixagem de Volume & Mudo',
    content: 'Controle o volume de saída do projetor com precisão ou silencie instantaneamente.',
    position: 'top'
  },
  {
    target: '#tour-player-playlist',
    title: '5. Fila Rápida da Biblioteca',
    content: 'Troque de categoria e clique em qualquer música para mudar a reprodução no telão instantaneamente sem sair desta tela.',
    position: 'left'
  }
];

interface PlayerProps {
  user: User;
  token: string;
  showToast: (message: string) => void;
}

export const Player: React.FC<PlayerProps> = ({ user, token, showToast }) => {
  const [displayState, setDisplayState] = useState<DisplayState>({
    ready: false,
    video: null,
    time: 0,
    duration: 0,
    playing: false,
    muted: false,
    errorCode: 0,
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const cached = sessionStorage.getItem('projyn_library_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.groups || [];
      }
    } catch (e) {}
    return [];
  });
  const [activeCategoryId, setActiveCategoryId] = useState<string>(() => {
    try {
      const cached = sessionStorage.getItem('projyn_library_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.groups && parsed.groups.length > 0) {
          return parsed.activeGroupId || parsed.groups[0].id;
        }
      }
    } catch (e) {}
    return '';
  });
  const [loadingPlaylist, setLoadingPlaylist] = useState<boolean>(false);
  const [localSeekTime, setLocalSeekTime] = useState<number>(0);
  const [isLocalSeeking, setIsLocalSeeking] = useState<boolean>(false);
  const [localVolume, setLocalVolume] = useState<number>(80);
  const [isLocalVolumeChanging, setIsLocalVolumeChanging] = useState<boolean>(false);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalSeekingRef = useRef(false);
  const isLocalVolumeChangingRef = useRef(false);
  const playSeqRef = useRef(0);

  // Fetch current Playout State from Backend
  const fetchDisplayState = async () => {
    try {
      const response = await fetch('/api/display-state', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data: DisplayState = await response.json();
        setDisplayState(prev => ({
          ...data,
          video: data.video || prev.video // Preserva o último vídeo caso esteja parado
        }));
        
        if (!isLocalSeekingRef.current) {
          setLocalSeekTime(data.time || 0);
        }
        if (!isLocalVolumeChangingRef.current) {
          setLocalVolume(data.volume !== undefined ? data.volume : 80);
        }
      }
    } catch (error) {
      console.error("Erro ao buscar estado da tela:", error);
    }
  };

  // Fetch categories for quick playlist
  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/library', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data.groups || []);
        try {
          sessionStorage.setItem('projyn_library_cache', JSON.stringify(data));
        } catch (e) {}
        if (data.groups && data.groups.length > 0 && !activeCategoryId) {
          setActiveCategoryId(data.groups[0].id);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar categorias:", error);
    }
  };

  useEffect(() => {
    fetchDisplayState();
    fetchCategories();

    // Start polling display state
    pollIntervalRef.current = setInterval(fetchDisplayState, 1500);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [token]);

  // Send Command to Display with instant optimistic UI update
  const sendCommand = async (type: string, payload: any = {}) => {
    if (!user.can_play_control && !user.is_admin) {
      showToast('Você não tem permissão para controlar a exibição.');
      return;
    }

    // Instant optimistic update
    if (type === 'play') {
      setDisplayState(prev => ({ ...prev, playing: true }));
    } else if (type === 'pause') {
      setDisplayState(prev => ({ ...prev, playing: false }));
    } else if (type === 'stop') {
      setDisplayState(prev => ({ ...prev, playing: false, time: 0 }));
      setLocalSeekTime(0);
    } else if (type === 'mute') {
      setDisplayState(prev => ({ ...prev, muted: true }));
    } else if (type === 'unmute') {
      setDisplayState(prev => ({ ...prev, muted: false }));
    }

    // Broadcast instantâneo para tela web aberta
    try {
      const bc = new BroadcastChannel('youtube-display-control');
      bc.postMessage({ type, payload });
      bc.close();
    } catch (e) {}

    try {
      const response = await fetch('/api/display-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type, payload })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        showToast(errData.error || 'Erro ao enviar comando.');
        fetchDisplayState();
      } else {
        setTimeout(fetchDisplayState, 80);
      }
    } catch (error) {
      showToast('Erro de conexão ao enviar comando.');
      fetchDisplayState();
    }
  };

  // Play Video from playlist
  const handleLoadVideo = async (video: Video) => {
    if (!user.can_play_control && !user.is_admin) {
      showToast('Você não tem permissão para carregar vídeos.');
      return;
    }

    const currentSeq = ++playSeqRef.current;
    showToast(`Iniciando "${video.title}"...`);
    const videoPayload = { ...video, groupId: activeCategoryId };

    if (user?.can_play_control || user?.is_admin) {
      fetch('/api/open-display', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => null);
      fetch('/api/display-topmost', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => null);
    }

    await sendCommand('load', { video: videoPayload });
    if (currentSeq === playSeqRef.current) {
      showToast(`Tocando "${video.title}".`);
    }
  };

  // Refresh current stream
  const handleRefreshStream = async () => {
    if (!displayState.video) return;
    
    showToast('Atualizando link de transmissão...');
    try {
      const response = await fetch(`/api/library/videos/${encodeURIComponent(displayState.video.id)}/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok && data.video) {
        showToast('Link de transmissão atualizado. Recarregando...');
        await sendCommand('load', { video: { ...data.video, groupId: data.groupId } });
      } else {
        showToast(data.error || 'Erro ao atualizar transmissão.');
      }
    } catch (error) {
      showToast('Erro de conexão ao atualizar.');
    }
  };

  // Helper formatting mm:ss or hh:mm:ss
  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isLocalSeekingRef.current = true;
    setIsLocalSeeking(true);
    setLocalSeekTime(Number(e.target.value));
  };

  const handleSeekEnd = () => {
    isLocalSeekingRef.current = false;
    setIsLocalSeeking(false);
    sendCommand('seek', { seconds: localSeekTime });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isLocalVolumeChangingRef.current = true;
    setIsLocalVolumeChanging(true);
    const val = Number(e.target.value);
    setLocalVolume(val);
    if (displayState.muted && val > 0) {
      setDisplayState(prev => ({ ...prev, muted: false }));
    }
    sendCommand('volume', { volume: val });
  };

  const handleVolumeEnd = () => {
    isLocalVolumeChangingRef.current = false;
    setIsLocalVolumeChanging(false);
  };

  // Active Category playlist
  const activeCategory = categories.find(c => c.id === activeCategoryId);
  const playlistVideos = activeCategory?.videos || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="page-header desktop-only">
        <div className="page-title">
          <h2>Controle de Playout</h2>
          <p>Monitore e controle a reprodução do vídeo na tela principal.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <TutorialButton onClick={() => setShowTutorial(true)} label="Tutorial Interativo" />

          <span 
            id="tour-player-status"
            className="user-role" 
            style={{ 
              backgroundColor: displayState.ready ? 'var(--success-glow)' : 'var(--border-color)', 
              color: displayState.ready ? 'var(--success-color)' : 'var(--text-secondary)',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Tv size={14} />
            {displayState.ready ? 'Tela Conectada' : 'Tela Desconectada'}
          </span>
        </div>
      </div>

      <div className="player-layout">
        {/* LEFT PANEL: ACTIVE VIDEO AND CONTROLS */}
        <div className="control-panel">
          {/* Active Video Banner */}
          <div className="active-video-banner glass" id="tour-player-banner">
            {displayState.video ? (
              <>
                <div className="active-video-thumb">
                  <img 
                    src={displayState.video.thumbnail || `https://i.ytimg.com/vi/${displayState.video.id}/hqdefault.jpg`} 
                    alt={displayState.video.title} 
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (displayState.video?.id && !target.src.includes('hqdefault.jpg')) {
                        target.src = `https://i.ytimg.com/vi/${displayState.video.id}/hqdefault.jpg`;
                      }
                    }}
                  />
                </div>
                <div className="active-video-info">
                  <span className="user-role" style={{ color: 'var(--accent-color)', fontSize: '11px', fontWeight: 'bold' }}>Reproduzindo Agora</span>
                  <h3>{displayState.video.title}</h3>
                  <p>{displayState.video.channel}</p>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-muted)' }}>
                <div className="active-video-thumb" style={{ backgroundColor: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Film size={36} />
                </div>
                <div>
                  <h3>Nenhum vídeo em exibição</h3>
                  <p>Selecione um vídeo na playlist rápida ou na biblioteca.</p>
                </div>
              </div>
            )}
          </div>

          {/* Playout Controls */}
          <div className="playback-controls glass" id="tour-player-controls">
            <div className="control-buttons-row">
              <button 
                className="btn-ctrl" 
                onClick={() => sendCommand('stop')} 
                title="Parar"
                disabled={!user.can_play_control || !displayState.video}
              >
                <Square size={20} fill="currentColor" />
              </button>

              {displayState.playing ? (
                <button 
                  className="btn-ctrl play" 
                  onClick={() => sendCommand('pause')} 
                  title="Pausar"
                  disabled={!user.can_play_control || !displayState.video}
                >
                  <Pause size={28} fill="white" />
                </button>
              ) : (
                <button 
                  className="btn-ctrl play" 
                  onClick={() => {
                    if (displayState.video) {
                      handleLoadVideo(displayState.video);
                    } else {
                      sendCommand('play');
                    }
                  }} 
                  title="Tocar"
                  disabled={!user.can_play_control || !displayState.video}
                >
                  <Play size={28} fill="white" style={{ marginLeft: '4px' }} />
                </button>
              )}

              <button 
                className="btn-ctrl" 
                onClick={handleRefreshStream} 
                title="Reiniciar Vídeo do Início"
                disabled={!user.can_play_control || !displayState.video}
              >
                <RotateCw size={20} />
              </button>

              <button 
                className="btn-ctrl" 
                onClick={() => sendCommand('minimize')} 
                title="Minimizar Tela (Música continua)"
                disabled={!user.can_play_control || !displayState.ready}
              >
                <Minimize2 size={20} />
              </button>

              <button 
                className="btn-ctrl" 
                onClick={() => sendCommand('restore')} 
                title="Restaurar / Abrir Tela Cheia"
                disabled={!user.can_play_control}
              >
                <Maximize2 size={20} />
              </button>
            </div>

            {/* Timeline Seek Bar */}
            <div className="timeline-container">
              <div className="timeline-slider-row">
                <span className="time-label">{formatTime(localSeekTime)}</span>
                <input
                  type="range"
                  className="range-slider"
                  min="0"
                  max={displayState.duration || 100}
                  value={localSeekTime}
                  onChange={handleSeekChange}
                  onMouseUp={handleSeekEnd}
                  onTouchEnd={handleSeekEnd}
                  disabled={!user.can_play_control || !displayState.video || !displayState.duration}
                />
                <span className="time-label">{formatTime(displayState.duration)}</span>
              </div>
            </div>

            {/* Volume Control */}
            <div className="volume-control" id="tour-player-volume">
              <button 
                className="video-action-btn" 
                onClick={() => sendCommand(displayState.muted ? 'unmute' : 'mute')}
                disabled={!user.can_play_control || !displayState.video}
                title={displayState.muted ? "Ativar Áudio" : "Desativar Áudio"}
              >
                {displayState.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                className="range-slider"
                min="0"
                max="100"
                value={displayState.muted ? 0 : localVolume}
                onChange={handleVolumeChange}
                onMouseUp={handleVolumeEnd}
                onTouchEnd={handleVolumeEnd}
                disabled={!user.can_play_control || !displayState.video}
                style={{ width: '130px' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 'bold', minWidth: '40px', color: 'var(--text-secondary)' }}>
                {displayState.muted ? 'MUDO' : `${Math.round(localVolume)}%`}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: QUICK PLAYLIST */}
        <div className="playlist-card glass" id="tour-player-playlist">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ListMusic size={18} />
              Playlist Rápida
            </h3>
            <select
              value={activeCategoryId}
              onChange={(e) => setActiveCategoryId(e.target.value)}
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none'
              }}
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          <div className="playlist-videos-list">
            {loadingPlaylist ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Carregando...
              </div>
            ) : playlistVideos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Nenhum vídeo nesta categoria.
              </div>
            ) : (
              playlistVideos.map(video => {
                const isActive = displayState.video?.id === video.id;
                return (
                  <div
                    key={video.id}
                    className={`playlist-video-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleLoadVideo(video)}
                  >
                    <img src={video.thumbnail} alt={video.title} />
                    <div className="playlist-video-info">
                      <div className="playlist-video-title" title={video.title}>{video.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{formatDuration(video.duration)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* INTERACTIVE SPOTLIGHT TOUR GUIDE */}
      <TourGuide
        isOpen={showTutorial}
        steps={playerTourSteps}
        onClose={() => setShowTutorial(false)}
        tourKey="player"
      />
    </div>
  );
};
