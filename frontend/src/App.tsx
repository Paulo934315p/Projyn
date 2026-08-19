import React, { useState, useEffect, useRef } from 'react';
import { Library } from './pages/Library';
import { Player } from './pages/Player';
import { Config } from './pages/Config';
import { Display } from './pages/Display';
import { Login } from './pages/Login';
import { User, Video, DisplayState } from './types';
import { 
  FolderHeart, Tv, Settings as SettingsIcon, LogOut, Sun, Moon, Sparkles, User as UserIcon, Menu, X,
  Minimize2, Maximize2, RotateCw, Check, Clock, BookOpen, HelpCircle
} from 'lucide-react';
import { TourGuide, TourStep } from './components/TourGuide';

type Tab = 'library' | 'player' | 'config';

const appTourSteps: Record<Tab, TourStep[]> = {
  library: [
    {
      target: '#tour-library-search',
      title: '1. Pesquisa Rápida',
      content: 'Digite o título da música ou artista para filtrar instantaneamente as mídias da categoria atual.',
      position: 'bottom'
    },
    {
      target: '#tour-library-category',
      title: '2. Seletor de Categorias',
      content: 'Alterne entre suas categorias (ex: Louvores, Abertura) ou crie novas pastas com cores personalizadas.',
      position: 'bottom'
    },
    {
      target: '#tour-library-add',
      title: '3. Adicionar Novas Músicas',
      content: 'Busque músicas diretamente no YouTube ou cole links de vídeos para extração direta em alta qualidade sem anúncios.',
      position: 'bottom'
    },
    {
      target: '#tour-library-video-first',
      title: '4. Disparo em 1 Clique',
      content: 'Passe o mouse sobre qualquer vídeo e clique em "Tocar na Tela" para enviar instantaneamente ao telão do projetor.',
      position: 'top'
    }
  ],
  player: [
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
  ],
  config: [
    {
      target: '#tour-config-tabs',
      title: '1. Abas de Configuração',
      content: 'Navegue facilmente entre Monitores & Kiosk, Áudio & Playout, Manutenção do Sistema, Gestão de Usuários e Diagnóstico de Rede.',
      position: 'bottom'
    },
    {
      target: '#tour-config-monitor',
      title: '2. Seleção de Telão / Projetor (Kiosk)',
      content: 'Selecione qual monitor ou saída HDMI conectada ao computador receberá o sinal do telão em tela cheia.',
      position: 'bottom',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(1)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    },
    {
      target: '#tour-config-kiosk-actions',
      title: '3. Comandos da Janela do Telão',
      content: 'Abra a tela Kiosk em tela cheia, minimize para a barra de tarefas, restaure ou traga para frente a qualquer momento.',
      position: 'top',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(1)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    },
    {
      target: '#tour-config-behaviors',
      title: '4. Comportamentos de Minimização',
      content: 'Defina se a tela do projetor deve minimizar automaticamente ao disparar músicas ou ao clicar no centro do vídeo.',
      position: 'left',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(1)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    },
    {
      target: '#tour-config-presets',
      title: '5. Presets Rápidos de Resolução',
      content: 'Aplique resoluções prontas com 1 clique (Full HD 1080p, Janela, etc.) ou salve suas próprias configurações de tela.',
      position: 'top',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(1)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    },
    {
      target: '#tour-config-volume',
      title: '6. Volume Inicial & Mudo Padrão',
      content: 'Defina o volume inicial padrão (0% a 100%) e se os vídeos devem começar silenciados por segurança.',
      position: 'bottom',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(2)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    },
    {
      target: '#tour-config-playback-modes',
      title: '7. Modos de Reprodução (Autoplay & Loop)',
      content: 'Configure a Reprodução Automática (Autoplay), repetição contínua em Loop e exibição da barra de controles nativos.',
      position: 'left',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(2)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    },
    {
      target: '#tour-config-maintenance-stats',
      title: '8. Status da Biblioteca & Mídias',
      content: 'Acompanhe o total de categorias, vídeos cadastrados e a auto-renovação silenciosa a cada 2 horas.',
      position: 'bottom',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(3)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    },
    {
      target: '#tour-config-maintenance-refresh',
      title: '9. Manutenção Geral de Links',
      content: 'Clique em "Atualizar Todos os Links da Biblioteca" para revalidar todos os vídeos do YouTube em lote com barra de progresso.',
      position: 'left',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(3)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    },
    {
      target: '#tour-config-users-header',
      title: '10. Gestão de Operadores',
      content: 'Filtre usuários existentes ou cadastre novos operadores com credenciais e níveis de acesso.',
      position: 'bottom',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(4)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    },
    {
      target: '#tour-config-users-card',
      title: '11. Permissões e Categorias',
      content: 'Controle quem pode criar categorias, adicionar músicas, operar o playout ou restringir o acesso a pastas específicas.',
      position: 'top',
      action: () => {
        const btn = document.querySelector('.config-tab-btn:nth-child(4)') as HTMLButtonElement;
        if (btn) btn.click();
      }
    }
  ]
};

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('projyn_token'));
  const [user, setUser] = useState<User | null>(
    localStorage.getItem('projyn_user') ? JSON.parse(localStorage.getItem('projyn_user')!) : null
  );

  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [globalTutorialOpen, setGlobalTutorialOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTimeout, setToastTimeout] = useState<NodeJS.Timeout | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const playRequestSeqRef = useRef<number>(0);

  // Real-time Display/Kiosk connection status
  const [displayState, setDisplayState] = useState<DisplayState>({
    ready: false,
    video: null,
    time: 0,
    duration: 0,
    playing: false,
    muted: false,
    errorCode: 0,
  });

  useEffect(() => {
    if (!token) return;
    const fetchState = async () => {
      try {
        const res = await fetch('/api/display-state', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data: DisplayState = await res.json();
          setDisplayState(data);
        }
      } catch (e) {}
    };
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, [token]);

  // Global Refresh Progress & Auto-refresh timer state
  const [refreshProgress, setRefreshProgress] = useState<{
    in_progress: boolean;
    is_auto?: boolean;
    current: number;
    total: number;
    percent: number;
    current_title: string;
    current_id: string;
    updated: number;
    errors: number;
    done: boolean;
    next_auto_refresh_at?: number;
    seconds_remaining?: number;
  } | null>(null);
  const [showDoneBadge, setShowDoneBadge] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(7200);
  const wasInProgressRef = useRef(false);

  // Path routing for /display kiosk screen
  const pathname = window.location.pathname;

  // Poll refresh progress only periodically or when active
  useEffect(() => {
    if (!token) return;

    const checkProgress = async () => {
      try {
        const res = await fetch('/api/library/refresh-progress', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const p = data.progress;
          setRefreshProgress(p);
          if (p && p.seconds_remaining !== undefined) {
            setCountdownSeconds(p.seconds_remaining);
          }

          if (p && p.in_progress) {
            wasInProgressRef.current = true;
          } else if (wasInProgressRef.current && p && p.done) {
            wasInProgressRef.current = false;
            setShowDoneBadge(true);
            showToast(`Atualização concluída! ${p.updated} vídeos atualizados.`);
            setTimeout(() => {
              setShowDoneBadge(false);
            }, 5000);
          }
        }
      } catch (e) {}
    };

    checkProgress();
    const interval = setInterval(checkProgress, refreshProgress?.in_progress ? 2000 : 25000);
    return () => clearInterval(interval);
  }, [token, refreshProgress?.in_progress]);

  // Smooth local 1s countdown decrement
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdownSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (totalSecs: number) => {
    if (totalSecs <= 0) return 'Atualizando agora...';
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Lock body scroll when mobile drawer is open to prevent jumping/glitches
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [mobileMenuOpen]);

  // Initialize theme and global fetch interceptor
  useEffect(() => {
    const savedTheme = localStorage.getItem('projyn_theme') as 'dark' | 'light' | null;
    const initialTheme = savedTheme || 'dark';
    setTheme(initialTheme);
    document.body.className = `${initialTheme}-theme`;

    // Intercept 401/403 status codes globally to handle expired/invalid sessions
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        if (response.status === 401 || response.status === 403) {
          const urlStr = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url || '';
          // Ignore the login endpoint itself so login failures show the normal user/pass errors
          if (!urlStr.includes('/api/auth/login')) {
            localStorage.removeItem('projyn_token');
            localStorage.removeItem('projyn_user');
            setToken(null);
            setUser(null);
            showToast('Sessão expirada. Por favor, faça login novamente.');
          }
        }
        return response;
      } catch (error) {
        throw error;
      }
    };

    // Global keyboard shortcut for Help / Tutorial (F1 or ?)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1' || (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName))) {
        e.preventDefault();
        setGlobalTutorialOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Show floating feedback Toast
  const showToast = (message: string) => {
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    setToastMessage(message);
    const timeout = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
    setToastTimeout(timeout);
  };

  const handleLoginSuccess = (newToken: string, userData: User) => {
    localStorage.setItem('projyn_token', newToken);
    localStorage.setItem('projyn_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    showToast(`Bem-vindo, ${userData.username}!`);
  };

  const handleLogout = () => {
    localStorage.removeItem('projyn_token');
    localStorage.removeItem('projyn_user');
    setToken(null);
    setUser(null);
    showToast('Sessão encerrada.');
  };

  const [clickToMinimize, setClickToMinimize] = useState<boolean>(true);
  const [autoMinimizeOnPlay, setAutoMinimizeOnPlay] = useState<boolean>(false);

  // Fetch settings on start
  useEffect(() => {
    if (!token) return;
    fetch('/api/settings', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.player) {
          if (data.player.clickToMinimize !== undefined) {
            setClickToMinimize(data.player.clickToMinimize);
          }
          if (data.player.autoMinimizeOnPlay !== undefined) {
            setAutoMinimizeOnPlay(data.player.autoMinimizeOnPlay);
          }
        }
      })
      .catch(() => {});
  }, [token]);

  const handleToggleClickToMinimize = async () => {
    if (!token) return;
    const newVal = !clickToMinimize;
    setClickToMinimize(newVal);
    try {
      const getRes = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const current = await getRes.json();
      const updated = {
        ...current,
        player: {
          ...(current.player || {}),
          clickToMinimize: newVal
        }
      };
      await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updated)
      });
      showToast(newVal ? 'Minimizar ao clicar no vídeo: ATIVADO' : 'Minimizar ao clicar no vídeo: DESATIVADO');
    } catch (e) {
      showToast('Erro ao atualizar configuração.');
    }
  };

  const handleToggleAutoMinimizeOnPlay = async () => {
    if (!token) return;
    const newVal = !autoMinimizeOnPlay;
    setAutoMinimizeOnPlay(newVal);
    try {
      const getRes = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const current = await getRes.json();
      const updated = {
        ...current,
        player: {
          ...(current.player || {}),
          autoMinimizeOnPlay: newVal
        }
      };
      await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updated)
      });
      if (newVal) {
        await fetch('/api/display-minimize', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        showToast('Minimizar ao tocar vídeo: ATIVADO (Tela minimizada)');
      } else {
        await fetch('/api/display-restore', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        showToast('Minimizar ao tocar vídeo: DESATIVADO (Tela cheia restaurada)');
      }
    } catch (e) {
      showToast('Erro ao atualizar configuração.');
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('projyn_theme', nextTheme);
    document.body.className = `${nextTheme}-theme`;
  };

  const handleToggleDisplay = async (action: 'restore' | 'minimize' | 'open') => {
    if (!token) return;
    try {
      if (action === 'open' || action === 'restore') {
        await fetch('/api/display-restore', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        showToast('Restaurando / Abrindo Tela Cheia...');
      } else if (action === 'minimize') {
        await fetch('/api/display-minimize', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        showToast('Minimizando tela (Música continua tocando)...');
      }
    } catch (e) {
      showToast('Erro ao controlar tela.');
    }
  };

  // Play Video immediately with instant playout dispatch and optimistic feedback
  const handlePlayVideo = (video: Video) => {
    if (!token) return;
    if (!user?.can_play_control && !user?.is_admin) {
      showToast('Você não tem permissão para carregar vídeos.');
      return;
    }

    showToast(`Tocando: "${video.title}"`);
    const videoPayload = { ...video, groupId: video.categoryId || '' };

    // Broadcast instantâneo para telas web abertas (0ms)
    try {
      const bc = new BroadcastChannel('youtube-display-control');
      bc.postMessage({ type: 'load', payload: { video: videoPayload } });
      bc.close();
    } catch (e) {}

    // Garante que o display kiosk esteja aberto e em primeiro plano
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

    // Envia o comando para o servidor em background imediatamente
    fetch('/api/display-command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        type: 'load',
        payload: { video: videoPayload }
      })
    }).catch(() => {
      showToast('Erro de conexão ao enviar comando.');
    });
  };

  // 1. KIOSK DISPLAY VIEW: Render ONLY the video display without headers/sidebars
  if (pathname === '/display') {
    return <Display token={token || ''} />;
  }

  // 2. UNAUTHENTICATED: Render Login Page
  if (!token || !user) {
    return <Login onLoginSuccess={handleLoginSuccess} theme={theme} />;
  }

  // 3. MAIN DASHBOARD APPLICATION
  return (
    <div className="app-layout">
      {/* MOBILE TOP NAVBAR */}
      <header className="mobile-navbar">
        <div className="mobile-navbar-logo" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          {refreshProgress && refreshProgress.in_progress ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '100%', maxWidth: '210px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-primary)' }}>
                  <RotateCw size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-color)' }} />
                  Atualizando ({refreshProgress.current}/{refreshProgress.total})
                </span>
                <span style={{ color: 'var(--accent-color)' }}>{refreshProgress.percent}%</span>
              </div>
              <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.max(4, refreshProgress.percent)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #e73c55, #f43f5e)',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease-out'
                }} />
              </div>
            </div>
          ) : showDoneBadge ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#10b981' }}>
              <Check size={15} /> Mídias Atualizadas 100%
            </div>
          ) : (
            <img 
              src={theme === 'dark' ? '/logo-projyn-clara.png' : '/logo-projyn-escura.png'} 
              alt="Projyn" 
              style={{ height: '28px', objectFit: 'contain' }} 
            />
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* TV Screen Status Indicator: Green when active, Gray when inactive */}
          <div 
            className="mobile-screen-indicator"
            title={displayState.ready ? "Tela do Telão Ativada" : "Tela do Telão Desconectada"}
          >
            <Tv size={17} color={displayState.ready ? "#10b981" : "#94a3b8"} />
            <div className={`status-dot ${displayState.ready ? 'online' : 'offline'}`} />
          </div>

          {/* Help / Tutorial Button with "?" icon only */}
          <button 
            className="mobile-tutorial-btn"
            onClick={() => setGlobalTutorialOpen(true)}
            title="Tutorial Interativo"
          >
            <HelpCircle size={18} />
          </button>

          {/* Theme Toggle */}
          <button className="mobile-theme-toggle" onClick={toggleTheme} title="Mudar tema">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          {/* Retractable Menu Button */}
          <button className="mobile-menu-trigger" onClick={() => setMobileMenuOpen(true)}>
            <Menu size={22} />
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER SIDEBAR */}
      <div className={`mobile-drawer-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}>
        <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-drawer-header">
            <div className="sidebar-logo">
              <img 
                src={theme === 'dark' ? '/logo-projyn-clara.png' : '/logo-projyn-escura.png'} 
                alt="Projyn" 
                style={{ height: '28px', objectFit: 'contain' }} 
              />
            </div>
            <button className="close-drawer-btn" onClick={() => setMobileMenuOpen(false)}>
              <X size={24} />
            </button>
          </div>

          <nav style={{ flex: 1, marginTop: '20px' }}>
            <ul className="sidebar-menu">
              <li>
                <div 
                  className={`sidebar-link ${activeTab === 'library' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('library');
                    setMobileMenuOpen(false);
                  }}
                >
                  <FolderHeart size={20} />
                  Biblioteca
                </div>
              </li>
              <li>
                <div 
                  className={`sidebar-link ${activeTab === 'player' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('player');
                    setMobileMenuOpen(false);
                  }}
                >
                  <Tv size={20} />
                  Controle Playout
                </div>
              </li>
              <li>
                <div 
                  className={`sidebar-link ${activeTab === 'config' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('config');
                    setMobileMenuOpen(false);
                  }}
                >
                  <SettingsIcon size={20} />
                  Configurações
                </div>
              </li>
              <li>
                <div 
                  className="sidebar-link"
                  onClick={() => {
                    setGlobalTutorialOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  style={{ color: 'var(--accent-color)' }}
                >
                  <BookOpen size={20} />
                  Guia & Tutorial
                </div>
              </li>
            </ul>

            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Minimizar ao tocar vídeo</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Minimiza a tela automaticamente</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={autoMinimizeOnPlay}
                    onChange={handleToggleAutoMinimizeOnPlay}
                  />
                  <span className="slider-toggle" />
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Minimizar ao clicar</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Ao clicar no centro da tela</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={clickToMinimize}
                    onChange={handleToggleClickToMinimize}
                  />
                  <span className="slider-toggle" />
                </label>
              </div>
            </div>
          </nav>

          <div className="sidebar-footer">
            <div className="user-profile-badge">
              <div className="user-avatar">
                {user.username.substring(0, 2).toUpperCase()}
              </div>
              <div className="user-info" style={{ flex: 1 }}>
                <span className="user-name">{user.username}</span>
                <span className="user-role">{user.is_admin ? 'Admin' : 'Operador'}</span>
              </div>
              <button className="logout-btn" onClick={() => {
                handleLogout();
                setMobileMenuOpen(false);
              }} title="Sair do sistema">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DESKTOP SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-logo">
            <img 
              src={theme === 'dark' ? '/logo-projyn-clara.png' : '/logo-projyn-escura.png'} 
              alt="Projyn" 
              style={{ height: '32px', objectFit: 'contain' }} 
            />
          </div>

          <nav>
            <ul className="sidebar-menu">
              <li>
                <div 
                  className={`sidebar-link ${activeTab === 'library' ? 'active' : ''}`}
                  onClick={() => setActiveTab('library')}
                >
                  <FolderHeart size={20} />
                  Biblioteca
                </div>
              </li>
              <li>
                <div 
                  className={`sidebar-link ${activeTab === 'player' ? 'active' : ''}`}
                  onClick={() => setActiveTab('player')}
                >
                  <Tv size={20} />
                  Controle Playout
                </div>
              </li>
              <li>
                <div 
                  className={`sidebar-link ${activeTab === 'config' ? 'active' : ''}`}
                  onClick={() => setActiveTab('config')}
                >
                  <SettingsIcon size={20} />
                  Configurações
                </div>
              </li>
              <li>
                <div 
                  className="sidebar-link"
                  onClick={() => setGlobalTutorialOpen(true)}
                  style={{ color: 'var(--accent-color)' }}
                >
                  <BookOpen size={20} />
                  Guia & Tutorial
                </div>
              </li>
            </ul>
          </nav>
        </div>

        <div className="sidebar-footer">
          {/* Toggles de Minimizar Tela */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Minimizar ao tocar</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={autoMinimizeOnPlay}
                  onChange={handleToggleAutoMinimizeOnPlay}
                />
                <span className="slider-toggle" />
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Minimizar ao clicar</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={clickToMinimize}
                  onChange={handleToggleClickToMinimize}
                />
                <span className="slider-toggle" />
              </label>
            </div>
          </div>

          {/* WIDGET DE PROGRESSO / TIMER DE AUTO-RENOVAÇÃO (EM CIMA DO MODO CLARO/ESCURO) */}
          {refreshProgress && (refreshProgress.in_progress || showDoneBadge) ? (
            <div className="sidebar-progress-widget" style={{
              padding: '10px 12px',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '12px',
              marginBottom: '10px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: showDoneBadge ? '#10b981' : 'var(--text-primary)' }}>
                  {showDoneBadge ? (
                    <>
                      <Check size={13} style={{ color: '#10b981' }} />
                      Atualizado!
                    </>
                  ) : (
                    <>
                      <RotateCw size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-color)' }} />
                      {refreshProgress.is_auto ? 'Auto-renovando' : 'Atualizando Links'}
                    </>
                  )}
                </span>
                <span style={{ color: showDoneBadge ? '#10b981' : 'var(--accent-color)', fontWeight: 700 }}>
                  {refreshProgress.percent}%
                </span>
              </div>

              {/* Barra de Progresso */}
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.max(4, refreshProgress.percent)}%`,
                  height: '100%',
                  background: showDoneBadge 
                    ? 'linear-gradient(90deg, #10b981, #059669)' 
                    : 'linear-gradient(90deg, #e73c55, #f43f5e)',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease-out'
                }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: 'var(--text-secondary)' }}>
                <span>{refreshProgress.current} de {refreshProgress.total}</span>
                {refreshProgress.in_progress && refreshProgress.current_title && (
                  <span 
                    style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} 
                    title={refreshProgress.current_title}
                  >
                    {refreshProgress.current_title}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="sidebar-countdown-widget" style={{
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '10px',
              marginBottom: '10px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px'
            }} title="Auto-renovação de todos os links a cada 2 horas">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Clock size={13} style={{ color: 'var(--accent-color)' }} />
                Auto-renovação (2h)
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.5px' }}>
                {formatCountdown(countdownSeconds)}
              </span>
            </div>
          )}

          {/* Theme switcher */}
          <button className="theme-toggle-btn" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            Modo {theme === 'dark' ? 'Claro' : 'Escuro'}
          </button>

          {/* User profile */}
          <div className="user-profile-badge">
            <div className="user-avatar">
              {user.username.substring(0, 2).toUpperCase()}
            </div>
            <div className="user-info" style={{ flex: 1 }}>
              <span className="user-name">{user.username}</span>
              <span className="user-role">{user.is_admin ? 'Admin' : 'Operador'}</span>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Sair do sistema">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        {activeTab === 'library' && (
          <Library 
            user={user} 
            token={token} 
            onPlayVideo={handlePlayVideo} 
            showToast={showToast} 
          />
        )}
        {activeTab === 'player' && (
          <Player 
            user={user} 
            token={token} 
            showToast={showToast} 
          />
        )}
        {activeTab === 'config' && (
          <Config 
            user={user} 
            token={token} 
            showToast={showToast} 
          />
        )}
      </main>

      {/* FLOATING TOAST FEEDBACK */}
      {toastMessage && (
        <div className="toast">
          <Sparkles size={16} color="var(--accent-color)" />
          {toastMessage}
        </div>
      )}

      {/* GLOBAL INTERACTIVE SPOTLIGHT TOUR GUIDE */}
      <TourGuide
        isOpen={globalTutorialOpen}
        steps={appTourSteps[activeTab] || []}
        onClose={() => setGlobalTutorialOpen(false)}
        tourKey={activeTab}
      />
    </div>
  );
};

export default App;
