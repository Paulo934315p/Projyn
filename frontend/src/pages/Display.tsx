import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Video, Settings, DisplayState } from '../types';

interface DisplayProps {
  token: string;
}

export const Display: React.FC<DisplayProps> = ({ token }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const [settings, setSettings] = useState<Settings>({
    display: { name: 'Tela principal', left: 0, top: 0, width: 1280, height: 720, fullscreen: true },
    player: { autoplay: true, muted: false, volume: 80, loop: false, showControls: false }
  });
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [isReady, setIsReady] = useState(true);

  // Refs that mirror state so callbacks (publishState, intervals) always see fresh values
  const currentVideoRef = useRef<Video | null>(null);
  const settingsRef = useRef<Settings>(settings);
  const isReadyRef = useRef(true);
  
  const lastCommandSeqRef = useRef<number>(0);
  const pendingSeekSecondsRef = useRef<number | null>(null);
  const refreshingAfterErrorRef = useRef<boolean>(false);
  const retriedVideoIdRef = useRef<string>('');
  const hlsPlayerRef = useRef<Hls | null>(null);
  const hlsFallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string>(Math.random().toString(36).substring(2, 11));

  const controlChannelRef = useRef<BroadcastChannel | null>(null);
  const stateChannelRef = useRef<BroadcastChannel | null>(null);

  // Helper: check if video is HLS
  const isHlsVideo = (video: Video) => {
    const protocol = String(video.streamProtocol || '').toLowerCase();
    const url = String(video.streamUrl || '').toLowerCase();
    return protocol.includes('m3u8') || url.includes('.m3u8');
  };

  // Synchronized state+ref setters
  const updateCurrentVideo = (video: Video | null) => {
    currentVideoRef.current = video;
    setCurrentVideo(video);
  };

  const updateSettings = (s: Settings | ((prev: Settings) => Settings)) => {
    if (typeof s === 'function') {
      setSettings(prev => {
        const next = s(prev);
        settingsRef.current = next;
        return next;
      });
    } else {
      settingsRef.current = s;
      setSettings(s);
    }
  };

  const updateIsReady = (ready: boolean) => {
    isReadyRef.current = ready;
    setIsReady(ready);
  };

  // Helper: publish state to API and BroadcastChannel (uses REFS, not state)
  const publishState = () => {
    const player = videoRef.current;
    if (!player) return;

    const error = player.error;
    const payload: DisplayState = {
      ready: isReadyRef.current,
      video: currentVideoRef.current,
      time: player.currentTime || 0,
      duration: Number.isFinite(player.duration) ? player.duration : 0,
      playing: !player.paused && !player.ended,
      muted: player.muted,
      errorCode: error?.code || 0,
      sessionId: sessionIdRef.current,
    };

    // Broadcast locally
    if (stateChannelRef.current) {
      stateChannelRef.current.postMessage({ type: 'state', payload });
    }

    // POST to API
    fetch('/api/display-state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
  };

  const applyPlayerSettings = (currentSettings: Settings) => {
    const player = videoRef.current;
    if (!player) return;
    player.volume = Math.max(0, Math.min(1, (currentSettings.player.volume || 0) / 100));
    player.loop = Boolean(currentSettings.player.loop);
    
    if (currentSettings.display?.fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const startPlayback = async () => {
    const player = videoRef.current;
    if (!player) return;

    applyPlayerSettings(settingsRef.current);
    const shouldBeMuted = Boolean(settingsRef.current.player.muted);
    player.muted = true;

    try {
      await player.play();
      if (!shouldBeMuted) {
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.muted = false;
            applyPlayerSettings(settingsRef.current);
            publishState();
          }
        }, 250);
      }
    } catch (error) {
      player.muted = shouldBeMuted;
      publishState();
      if (currentVideoRef.current && isHlsVideo(currentVideoRef.current)) {
        refreshCurrentVideoAfterError();
      }
    }
  };

  const clearHlsFallbackTimer = () => {
    if (hlsFallbackTimerRef.current) {
      clearTimeout(hlsFallbackTimerRef.current);
      hlsFallbackTimerRef.current = null;
    }
  };

  const clearPlayerSource = () => {
    clearHlsFallbackTimer();
    if (hlsPlayerRef.current) {
      hlsPlayerRef.current.destroy();
      hlsPlayerRef.current = null;
    }
    const player = videoRef.current;
    if (player) {
      player.pause();
      player.removeAttribute('src');
      player.load();
    }
  };

  const applyPendingSeek = () => {
    const player = videoRef.current;
    if (!player || pendingSeekSecondsRef.current === null || !Number.isFinite(player.duration)) return;
    
    player.currentTime = Math.max(0, Math.min(Number(pendingSeekSecondsRef.current) || 0, player.duration || 0));
    pendingSeekSecondsRef.current = null;
    publishState();
  };

  const startLoadedVideo = () => {
    const player = videoRef.current;
    if (!player) return;
    clearHlsFallbackTimer();
    player.currentTime = 0;
    player.controls = false;
    player.muted = Boolean(settingsRef.current.player.muted);
    applyPlayerSettings(settingsRef.current);
    
    if (settingsRef.current.player.autoplay) {
      startPlayback();
    }
    publishState();
  };

  const loadVideo = (video: Video, startAt: number | null = null, useProxy: boolean = false) => {
    updateCurrentVideo(video);
    pendingSeekSecondsRef.current = startAt;
    clearPlayerSource();

    const player = videoRef.current;
    if (!player || !video.streamUrl) return;

    if (isHlsVideo(video) && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 60,
        maxMaxBufferLength: 600,
        lowLatencyMode: false,
        backBufferLength: 90,
      });
      hlsPlayerRef.current = hls;
      
      const sourceUrl = useProxy
        ? `/api/hls-manifest?url=${encodeURIComponent(video.streamUrl)}`
        : video.streamUrl;

      hls.loadSource(sourceUrl);
      hls.attachMedia(player);
      hls.on(Hls.Events.MANIFEST_PARSED, startLoadedVideo);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) {
          clearHlsFallbackTimer();
          publishState();
          if (!useProxy) {
            console.warn("HLS direto falhou. Tentando via HLS proxy interno...");
            loadVideo(video, player.currentTime || 0, true);
          } else {
            refreshCurrentVideoAfterError();
          }
        }
      });

      // Schedule fallback
      clearHlsFallbackTimer();
      hlsFallbackTimerRef.current = setTimeout(() => {
        if (isHlsVideo(video) && !player.duration && player.paused) {
          if (!useProxy) {
            loadVideo(video, 0, true);
          } else {
            refreshCurrentVideoAfterError();
          }
        }
      }, 7000);

      publishState();
      return;
    }

    player.src = video.streamUrl;
    startLoadedVideo();
  };

  const refreshCurrentVideoAfterError = async () => {
    const vid = currentVideoRef.current;
    if (!vid?.id || refreshingAfterErrorRef.current || retriedVideoIdRef.current === vid.id) {
      return;
    }
    refreshingAfterErrorRef.current = true;
    retriedVideoIdRef.current = vid.id;

    try {
      let refreshed: Video | null = null;
      
      // Try refresh with categoryId
      if (vid.categoryId) {
        const response = await fetch(`/api/library/groups/${encodeURIComponent(vid.categoryId)}/videos/${encodeURIComponent(vid.id)}/refresh`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const payload = await response.json();
        if (response.ok && payload.video?.streamUrl) {
          refreshed = { ...payload.video, categoryId: vid.categoryId };
        }
      }

      // Try refresh by ID only
      if (!refreshed) {
        const response = await fetch(`/api/library/videos/${encodeURIComponent(vid.id)}/refresh`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const payload = await response.json();
        if (response.ok && payload.video?.streamUrl) {
          refreshed = { ...payload.video, categoryId: payload.groupId || vid.categoryId };
        }
      }

      // Fallback: direct stream request
      if (!refreshed) {
        const response = await fetch(`/api/stream?id=${encodeURIComponent(vid.id)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const payload = await response.json();
        if (response.ok && payload.streamUrl) {
          refreshed = { ...vid, ...payload };
        }
      }

      if (refreshed?.streamUrl) {
        const player = videoRef.current;
        loadVideo(refreshed, player ? player.currentTime : 0, true);
      }
    } catch (error) {
      publishState();
    } finally {
      refreshingAfterErrorRef.current = false;
    }
  };

  const resetDisplay = () => {
    updateCurrentVideo(null);
    retriedVideoIdRef.current = '';
    clearPlayerSource();
    publishState();
  };

  const handleVideoEnded = async () => {
    try {
      resetDisplay();
      await fetch('/api/display-close', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      console.error("Erro ao fechar o display:", e);
    }
  };

  const handleCommand = (message: any) => {
    const payload = message.payload || {};
    const player = videoRef.current;
    
    if (message.type === 'settings') {
      updateSettings(payload);
      if (player) {
        applyPlayerSettings(payload);
      }
      return;
    }

    if (message.type === 'reset') {
      resetDisplay();
      return;
    }

    if (message.type === 'load') {
      if (payload.settings) {
        updateSettings(payload.settings);
      }
      loadVideo(payload.video, payload.startAt || null);
      return;
    }

    if (player) {
      if (message.type === 'play') startPlayback();
      if (message.type === 'pause') player.pause();
      if (message.type === 'stop') {
        player.pause();
        player.currentTime = 0;
      }
      if (message.type === 'mute') player.muted = true;
      if (message.type === 'unmute') player.muted = false;
      if (message.type === 'volume') {
        updateSettings(prev => {
          const next = {
            ...prev,
            player: { ...prev.player, volume: Math.max(0, Math.min(100, Number(payload.volume) || 0)) }
          };
          applyPlayerSettings(next);
          return next;
        });
      }
      if (message.type === 'seek') {
        player.currentTime = Math.max(0, Number(payload.seconds) || 0);
      }
    }

    publishState();
  };

  // Poll Commands from API
  const pollCommands = async () => {
    try {
      const response = await fetch(`/api/display-command?after=${lastCommandSeqRef.current}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const payload = await response.json();
      for (const command of payload.commands || []) {
        lastCommandSeqRef.current = Math.max(lastCommandSeqRef.current, command.seq || 0);
        handleCommand(command);
      }
    } catch (error) {
      // Ignore errors
    }
  };

  // Initialize
  const initializeDisplay = async () => {
    try {
      // Fetch initial settings
      const settingsRes = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (settingsRes.ok) {
        const initialSettings = await settingsRes.json();
        updateSettings(initialSettings);
        applyPlayerSettings(initialSettings);
      }

      // Fetch sequence and execute pending commands (like load)
      const commandRes = await fetch('/api/display-command?after=0', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (commandRes.ok) {
        const payload = await commandRes.json();
        const commands = payload.commands || [];
        let startIndex = 0;
        for (let i = 0; i < commands.length; i++) {
          if (commands[i].type === 'reset' || commands[i].type === 'stop') {
            startIndex = i + 1;
          }
        }
        for (let i = startIndex; i < commands.length; i++) {
          lastCommandSeqRef.current = Math.max(lastCommandSeqRef.current, commands[i].seq || 0);
          handleCommand(commands[i]);
        }
        if (commands.length === 0) {
          lastCommandSeqRef.current = payload.seq || 0;
        }
      }

      // Check if server display state has active video to play
      try {
        const stateRes = await fetch('/api/display-state', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (stateRes.ok) {
          const st = await stateRes.json();
          if (st.video && st.playing && !currentVideoRef.current) {
            handleCommand({ type: 'load', payload: { video: st.video, startAt: st.time || 0 } });
          }
        }
      } catch (e) {}

      publishState();
    } catch (error) {
      publishState();
    }
  };

  useEffect(() => {
    // Salva o título anterior e atualiza para a Tela YouTube
    const prevTitle = document.title;
    document.title = 'Tela YouTube';

    // Setup Broadcast Channels
    controlChannelRef.current = new BroadcastChannel('youtube-display-control');
    stateChannelRef.current = new BroadcastChannel('youtube-display-state');

    controlChannelRef.current.onmessage = (event) => {
      handleCommand(event.data || {});
    };

    initializeDisplay();

    // Start intervals
    const stateInterval = setInterval(publishState, 1000);
    const commandInterval = setInterval(pollCommands, 300);

    // Unload cleanup
    const handleBeforeUnload = () => {
      updateIsReady(false);
      if (stateChannelRef.current) {
        stateChannelRef.current.postMessage({ type: 'state', payload: { ready: false } });
      }
      fetch('/api/display-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ready: false, sessionId: sessionIdRef.current }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.title = prevTitle;
      clearInterval(stateInterval);
      clearInterval(commandInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      clearPlayerSource();
      
      if (controlChannelRef.current) controlChannelRef.current.close();
      if (stateChannelRef.current) stateChannelRef.current.close();
    };
  }, [token]);

  return (
    <div className="display-wrapper" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      cursor: 'none',
    }}>
      <video
        ref={videoRef}
        className="display-video"
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
        disablePictureInPicture={true}
        disableRemotePlayback={true}
        controls={false}
        onLoadedMetadata={() => {
          clearHlsFallbackTimer();
          applyPendingSeek();
          publishState();
        }}
        onPlay={() => {
          clearHlsFallbackTimer();
          publishState();
        }}
        onPause={publishState}
        onVolumeChange={publishState}
        onEnded={handleVideoEnded}
        onError={() => {
          publishState();
          refreshCurrentVideoAfterError();
        }}
      />
      {!currentVideo && (
        <div className="no-video-placeholder">
          <img 
            src="/logo-projyn-icon-clara.png" 
            alt="Projyn Playout" 
            style={{ maxWidth: '280px', maxHeight: '280px', objectFit: 'contain', opacity: 0.25 }} 
          />
        </div>
      )}
    </div>
  );
};
