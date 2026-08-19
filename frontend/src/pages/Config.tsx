import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings as SettingsIcon, Monitor, Users, Shield, 
  Trash2, UserPlus, Save, RefreshCw, X, Play, LogOut, Check, ChevronDown,
  Volume2, Sliders, Layers, HardDrive, AlertCircle, Sparkles,
  Plus, Tv, Info, RotateCw, Minimize2, AlertTriangle
} from 'lucide-react';
import { User, Settings, Preset, Category, DisplayState } from '../types';
import { TourGuide, TourStep } from '../components/TourGuide';
import { TutorialButton } from '../components/TutorialButton';

const getConfigTourSteps = (
  setActiveTab: (tab: ConfigTab) => void,
  isAdmin: boolean
): TourStep[] => {
  const steps: TourStep[] = [
    {
      target: '#tour-config-tabs',
      title: '1. Abas de Configuração',
      content: 'Navegue facilmente entre Monitores & Kiosk, Áudio & Playout, Manutenção do Sistema e Gestão de Usuários.',
      position: 'bottom'
    },
    // --- ABA 1: MONITORES & KIOSK ---
    {
      target: '#tour-config-monitor',
      title: '2. Seleção de Telão / Projetor (Kiosk)',
      content: 'Selecione qual monitor ou saída HDMI conectada ao computador receberá o sinal do telão em tela cheia.',
      position: 'bottom',
      action: () => setActiveTab('display')
    },
    {
      target: '#tour-config-kiosk-actions',
      title: '3. Comandos da Janela do Telão',
      content: 'Abra a tela Kiosk em tela cheia, minimize para a barra de tarefas, restaure ou traga para frente a qualquer momento.',
      position: 'top',
      action: () => setActiveTab('display')
    },
    {
      target: '#tour-config-behaviors',
      title: '4. Comportamentos de Minimização',
      content: 'Defina se a tela do projetor deve minimizar automaticamente ao disparar músicas ou ao clicar no centro do vídeo.',
      position: 'left',
      action: () => setActiveTab('display')
    },
    {
      target: '#tour-config-presets',
      title: '5. Presets Rápidos de Resolução',
      content: 'Aplique resoluções prontas com 1 clique (Full HD 1080p, Janela, etc.) ou salve suas próprias configurações de tela.',
      position: 'top',
      action: () => setActiveTab('display')
    },

    // --- ABA 2: PLAYOUT & ÁUDIO ---
    {
      target: '#tour-config-volume',
      title: '6. Volume Inicial & Mudo Padrão',
      content: 'Defina o volume inicial padrão (0% a 100%) e se os vídeos devem começar silenciados por segurança.',
      position: 'bottom',
      action: () => setActiveTab('playout')
    },
    {
      target: '#tour-config-playback-modes',
      title: '7. Modos de Reprodução (Autoplay & Loop)',
      content: 'Configure a Reprodução Automática (Autoplay), repetição contínua em Loop e exibição da barra de controles nativos.',
      position: 'left',
      action: () => setActiveTab('playout')
    },

    // --- ABA 3: MANUTENÇÃO DO SISTEMA ---
    {
      target: '#tour-config-maintenance-stats',
      title: '8. Status da Biblioteca & Mídias',
      content: 'Acompanhe o total de categorias, vídeos cadastrados e a auto-renovação silenciosa a cada 2 horas.',
      position: 'bottom',
      action: () => setActiveTab('maintenance')
    },
    {
      target: '#tour-config-maintenance-refresh',
      title: '9. Manutenção Geral de Links',
      content: 'Clique em "Atualizar Todos os Links da Biblioteca" para revalidar todos os vídeos do YouTube em lote com barra de progresso.',
      position: 'left',
      action: () => setActiveTab('maintenance')
    }
  ];

  // --- ABA 4: GESTÃO DE USUÁRIOS (SE ADMIN) ---
  if (isAdmin) {
    steps.push(
      {
        target: '#tour-config-users-header',
        title: '10. Gestão de Operadores',
        content: 'Filtre usuários existentes ou cadastre novos operadores com credenciais e níveis de acesso.',
        position: 'bottom',
        action: () => setActiveTab('users')
      },
      {
        target: '#tour-config-users-card',
        title: '11. Permissões e Categorias',
        content: 'Controle quem pode criar categorias, adicionar músicas, operar o playout ou restringir o acesso a pastas específicas.',
        position: 'top',
        action: () => setActiveTab('users')
      }
    );
  }

  return steps;
};

interface ConfigProps {
  user: User;
  token: string;
  showToast: (message: string) => void;
}

type ConfigTab = 'display' | 'playout' | 'maintenance' | 'users';

export const Config: React.FC<ConfigProps> = ({ user, token, showToast }) => {
  const [activeConfigTab, setActiveConfigTab] = useState<ConfigTab>('display');
  const [showTutorial, setShowTutorial] = useState(false);

  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const cached = sessionStorage.getItem('projyn_settings_cache');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return {
      display: { name: 'Tela principal', left: 0, top: 0, width: 1920, height: 1080, fullscreen: true },
      player: { autoplay: true, muted: false, volume: 80, loop: false, showControls: false, clickToMinimize: true, autoMinimizeOnPlay: false }
    };
  });
  
  // Users list
  const [usersList, setUsersList] = useState<User[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
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
  
  // Monitors list
  const [monitors, setMonitors] = useState<any[]>([]);
  const [showMonitorList, setShowMonitorList] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const monitorSelectorRef = useRef<HTMLDivElement>(null);

  // Display state & Kiosk status
  const [displayState, setDisplayState] = useState<DisplayState | null>(null);

  // Preset creation modal
  const [showAddPresetModal, setShowAddPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Refresh progress state
  const [refreshProgress, setRefreshProgress] = useState<{
    in_progress: boolean;
    current: number;
    total: number;
    percent: number;
    current_title: string;
    current_id: string;
    updated: number;
    errors: number;
    done: boolean;
    seconds_remaining?: number;
  } | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // Form states for New User
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newCanCreateCat, setNewCanCreateCat] = useState(true);
  const [newCanAddSongs, setNewCanAddSongs] = useState(true);
  const [newCanPlay, setNewCanPlay] = useState(true);
  const [newSeeAllCat, setNewSeeAllCat] = useState(true);
  const [newAllowedCats, setNewAllowedCats] = useState<string[]>([]);
  
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  // In-app Delete Confirmation Modals
  const [presetToDelete, setPresetToDelete] = useState<{ id: string; name: string } | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ id: number; name: string } | null>(null);
  const [isDeletingConfig, setIsDeletingConfig] = useState(false);

  // Poll refresh progress and display state
  useEffect(() => {
    if (!token) return;

    const checkStatus = async () => {
      try {
        const [progressRes, stateRes] = await Promise.all([
          fetch('/api/library/refresh-progress', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/display-state', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (progressRes.ok) {
          const progData = await progressRes.json();
          setRefreshProgress(progData.progress);
        }
        if (stateRes.ok) {
          const sData = await stateRes.json();
          setDisplayState(sData);
        }
      } catch (e) {}
    };

    checkStatus();
    const interval = setInterval(checkStatus, refreshProgress?.in_progress ? 2000 : 8000);
    return () => clearInterval(interval);
  }, [token, refreshProgress?.in_progress]);

  const handleRefreshAll = async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    setShowProgressModal(true);
    setRefreshProgress({
      in_progress: true,
      current: 0,
      total: 1,
      percent: 0,
      current_title: 'Iniciando verificação...',
      current_id: '',
      updated: 0,
      errors: 0,
      done: false
    });

    try {
      await fetch('/api/library/refresh-all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      showToast('Erro ao iniciar atualização da biblioteca.');
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/library/refresh-progress', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const p = data.progress;
          setRefreshProgress(p);

          if (p.done) {
            clearInterval(pollInterval);
            setRefreshingAll(false);
            showToast(`Concluído! ${p.updated} vídeos foram atualizados com sucesso.`);
            setTimeout(() => {
              setShowProgressModal(false);
            }, 2500);
          }
        }
      } catch (err) {}
    }, 400);
  };

  const loadMonitors = async () => {
    try {
      const response = await fetch('/api/monitors', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setMonitors(data);
      } else {
        throw new Error("Erro ao obter monitores");
      }
    } catch (err) {
      setMonitors([
        {
          label: `Tela Atual: ${window.screen.width}x${window.screen.height} (Principal)`,
          width: window.screen.width,
          height: window.screen.height,
          left: 0,
          top: 0,
          isPrimary: true
        }
      ]);
    }
  };

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monitorSelectorRef.current && !monitorSelectorRef.current.contains(event.target as Node)) {
        setShowMonitorList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load monitors on mount
  useEffect(() => {
    loadMonitors();
  }, []);

  // Fetch all config data in parallel
  const fetchData = async () => {
    try {
      const promises: Promise<any>[] = [
        fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/library', { headers: { 'Authorization': `Bearer ${token}` } })
      ];
      if (user.is_admin) {
        promises.push(fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } }));
      }

      const results = await Promise.all(promises);
      const settingsRes = results[0];
      const categoriesRes = results[1];
      const usersRes = results[2];

      if (settingsRes && settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings(data);
        try {
          sessionStorage.setItem('projyn_settings_cache', JSON.stringify(data));
        } catch (e) {}
      }

      if (categoriesRes && categoriesRes.ok) {
        const libraryData = await categoriesRes.json();
        setCategories(libraryData.groups || []);
        try {
          sessionStorage.setItem('projyn_library_cache', JSON.stringify(libraryData));
        } catch (e) {}
      }

      if (usersRes && usersRes.ok) {
        const data = await usersRes.json();
        setUsersList(data);
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Handle Display Settings Save
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        const updated = await response.json();
        setSettings(updated);
        showToast('Configurações salvas com sucesso!');
      } else {
        showToast('Erro ao salvar configurações.');
      }
    } catch (error) {
      showToast('Erro de conexão ao salvar.');
    }
  };

  // Launch Kiosk
  const handleOpenDisplay = async () => {
    showToast('Iniciando tela em modo Kiosk...');
    try {
      const response = await fetch('/api/open-display', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        showToast('Tela Kiosk aberta com sucesso.');
      } else {
        const data = await response.json();
        showToast(data.error || 'Erro ao abrir tela.');
      }
    } catch (error) {
      showToast('Erro de conexão.');
    }
  };

  // Close Kiosk
  const handleCloseDisplay = async () => {
    showToast('Fechando telas kiosk...');
    try {
      const response = await fetch('/api/display-close', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        showToast('Telas fechadas.');
      }
    } catch (error) {
      showToast('Erro de conexão.');
    }
  };

  // Keep topmost
  const handleTopmostDisplay = async () => {
    try {
      const response = await fetch('/api/display-topmost', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        showToast('Tela trazida para o topo.');
      }
    } catch (error) {
      showToast('Erro de conexão.');
    }
  };

  // Minimize Kiosk
  const handleMinimizeDisplay = async () => {
    try {
      const response = await fetch('/api/display-minimize', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        showToast('Tela minimizada.');
      }
    } catch (error) {
      showToast('Erro de conexão.');
    }
  };

  // Restore Kiosk
  const handleRestoreDisplay = async () => {
    try {
      const response = await fetch('/api/display-restore', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        showToast('Tela restaurada em tela cheia.');
      }
    } catch (error) {
      showToast('Erro de conexão.');
    }
  };

  // Load Preset
  const handleLoadPreset = async (preset: Preset) => {
    const nextSettings = {
      ...settings,
      display: preset.display,
      player: preset.player
    };
    setSettings(nextSettings);
    
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(nextSettings)
      });
      if (response.ok) {
        showToast(`Preset "${preset.name}" carregado e aplicado!`);
      }
    } catch (error) {}
  };

  // Add New Custom Preset
  const handleCreatePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    try {
      const response = await fetch('/api/presets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newPresetName.trim(),
          display: settings.display,
          player: settings.player
        })
      });
      if (response.ok) {
        const updated = await response.json();
        setSettings(updated);
        setNewPresetName('');
        setShowAddPresetModal(false);
        showToast(`Preset "${newPresetName}" criado com sucesso!`);
      } else {
        showToast('Erro ao criar preset.');
      }
    } catch (error) {
      showToast('Erro de conexão ao criar preset.');
    }
  };

  // Delete Preset
  const handleDeletePreset = (presetId: string, presetName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPresetToDelete({ id: presetId, name: presetName });
  };

  const handleConfirmDeletePreset = async () => {
    if (!presetToDelete) return;
    setIsDeletingConfig(true);

    try {
      const response = await fetch(`/api/presets/${encodeURIComponent(presetToDelete.id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const updated = await response.json();
        setSettings(updated);
        try {
          sessionStorage.setItem('projyn_settings_cache', JSON.stringify(updated));
        } catch (e) {}
        showToast(`Preset "${presetToDelete.name}" excluído.`);
      } else {
        showToast('Erro ao excluir preset.');
      }
    } catch (error) {
      showToast('Erro de conexão ao excluir preset.');
    } finally {
      setIsDeletingConfig(false);
      setPresetToDelete(null);
    }
  };

  // Register New User
  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      showToast('Preencha nome e senha.');
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          is_admin: newIsAdmin,
          can_create_category: newCanCreateCat,
          can_add_songs: newCanAddSongs,
          can_play_control: newCanPlay,
          see_all_categories: newSeeAllCat,
          allowed_categories: newAllowedCats
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        showToast(`Usuário "${newUsername}" cadastrado!`);
        setNewUsername('');
        setNewPassword('');
        setNewIsAdmin(false);
        setNewCanCreateCat(true);
        setNewCanAddSongs(true);
        setNewCanPlay(true);
        setNewSeeAllCat(true);
        setNewAllowedCats([]);
        setShowAddUserModal(false);
        fetchUsers();
      } else {
        showToast(data.error || 'Erro ao cadastrar usuário.');
      }
    } catch (error) {
      showToast('Erro de conexão ao cadastrar.');
    }
  };

  // Toggle user permissions directly
  const handleTogglePermission = async (targetUser: User, permissionKey: keyof Omit<User, 'id' | 'username' | 'allowed_categories'>) => {
    if (targetUser.id === user.id && permissionKey === 'is_admin') {
      showToast('Você não pode remover seu próprio acesso administrativo.');
      return;
    }

    const updatedUser = {
      ...targetUser,
      [permissionKey]: !targetUser[permissionKey]
    };

    try {
      const response = await fetch(`/api/users/${targetUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedUser)
      });
      if (response.ok) {
        showToast('Permissão atualizada.');
        fetchUsers();
      } else {
        showToast('Erro ao atualizar permissão.');
      }
    } catch (error) {
      showToast('Erro de conexão.');
    }
  };

  // Toggle Category Access for specific user
  const handleToggleUserCategory = async (targetUser: User, categoryId: string) => {
    const isAllowed = targetUser.allowed_categories.includes(categoryId);
    const updatedAllowed = isAllowed
      ? targetUser.allowed_categories.filter(id => id !== categoryId)
      : [...targetUser.allowed_categories, categoryId];

    const updatedUser = {
      ...targetUser,
      allowed_categories: updatedAllowed
    };

    try {
      const response = await fetch(`/api/users/${targetUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedUser)
      });
      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {}
  };

  // Delete User
  const handleDeleteUser = (targetId: number, targetName: string) => {
    if (targetId === user.id) {
      showToast('Você não pode excluir a si mesmo.');
      return;
    }
    setUserToDelete({ id: targetId, name: targetName });
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingConfig(true);

    try {
      const response = await fetch(`/api/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        showToast(`Usuário "${userToDelete.name}" removido.`);
        fetchUsers();
      } else {
        showToast('Erro ao excluir usuário.');
      }
    } catch (error) {
      showToast('Erro de conexão.');
    } finally {
      setIsDeletingConfig(false);
      setUserToDelete(null);
    }
  };

  const handleToggleNewAllowedCat = (categoryId: string) => {
    setNewAllowedCats(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Calculate statistics
  const totalVideos = categories.reduce((acc, cat) => acc + (cat.videos?.length || 0), 0);

  // Filter users by search
  const filteredUsers = usersList.filter(u => 
    u.username.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  if (loadingSettings) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
        <RotateCw size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-color)' }} />
        <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>Carregando configurações do Projyn...</span>
      </div>
    );
  }

  return (
    <div className="config-layout">
      {/* PAGE HEADER */}
      <div className="page-header desktop-only">
        <div className="page-title">
          <h2>Painel de Configurações</h2>
          <p>Ajuste a resolução das telas, comportamento de exibição, manutenção e controle de acesso.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <TutorialButton onClick={() => setShowTutorial(true)} label="Tutorial Interativo" />
          
          {user.is_admin && (
            <button type="button" className="btn btn-primary" onClick={() => handleSaveSettings()}>
              <Save size={16} />
              Salvar Alterações
            </button>
          )}
        </div>
      </div>

      {/* SECTION TABS */}
      <div className="config-tabs-nav" id="tour-config-tabs">
        <button
          className={`config-tab-btn ${activeConfigTab === 'display' ? 'active' : ''}`}
          onClick={() => setActiveConfigTab('display')}
        >
          <Monitor size={18} />
          <span>Monitores & Tela Kiosk</span>
        </button>

        <button
          className={`config-tab-btn ${activeConfigTab === 'playout' ? 'active' : ''}`}
          onClick={() => setActiveConfigTab('playout')}
        >
          <Tv size={18} />
          <span>Playout & Áudio</span>
        </button>

        <button
          className={`config-tab-btn ${activeConfigTab === 'maintenance' ? 'active' : ''}`}
          onClick={() => setActiveConfigTab('maintenance')}
        >
          <RefreshCw size={18} />
          <span>Manutenção do Sistema</span>
          {refreshProgress?.in_progress && (
            <span className="config-tab-badge">Em Progresso</span>
          )}
        </button>

        {user.is_admin && (
          <button
            className={`config-tab-btn ${activeConfigTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveConfigTab('users')}
          >
            <Users size={18} />
            <span>Gestão de Usuários</span>
            <span className="config-tab-count">{usersList.length}</span>
          </button>
        )}
      </div>

      {/* TAB 1: MONITORES & TELA KIOSK */}
      {activeConfigTab === 'display' && (
        <div className="config-tab-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            
            {/* SELETOR DE MONITOR */}
            <div className="config-card glass" id="tour-config-monitor">
              <div className="config-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="config-card-icon">
                    <Monitor size={20} />
                  </div>
                  <div>
                    <h3>Monitor de Saída (Telão)</h3>
                    <p>Selecione a tela ou projetor para o sinal de vídeo</p>
                  </div>
                </div>

                {user.is_admin && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={loadMonitors}
                    title="Detectar novos monitores e projetores conectados"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  >
                    <RefreshCw size={13} />
                    Recarregar
                  </button>
                )}
              </div>

              <div className="config-card-body">
                {/* Visual Monitor Selector */}
                <div className="form-group" ref={monitorSelectorRef}>
                  <label className="form-label">Monitor Selecionado</label>
                  <div className="monitor-selector-container">
                    <div 
                      className="monitor-selector-trigger"
                      onClick={() => user.is_admin && setShowMonitorList(!showMonitorList)}
                      style={{ cursor: user.is_admin ? 'pointer' : 'default' }}
                    >
                      <div>
                        <strong style={{ fontSize: '15px' }}>{settings.display.name || 'Nenhum monitor selecionado'}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Resolução: {settings.display.width}x{settings.display.height} | Posição: ({settings.display.left}, {settings.display.top})
                        </div>
                      </div>
                      {user.is_admin && <ChevronDown size={18} style={{ color: 'var(--text-secondary)' }} />}
                    </div>

                    {showMonitorList && user.is_admin && (
                      <div className="monitor-dropdown-list glass">
                        {monitors.map((mon, idx) => {
                          const isSelected = settings.display.left === mon.left && 
                                            settings.display.top === mon.top && 
                                            settings.display.width === mon.width && 
                                            settings.display.height === mon.height;
                          return (
                            <div
                              key={idx}
                              className={`monitor-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                setSettings({
                                  ...settings,
                                  display: {
                                    ...settings.display,
                                    name: mon.label,
                                    width: mon.width,
                                    height: mon.height,
                                    left: mon.left,
                                    top: mon.top
                                  }
                                });
                                setShowMonitorList(false);
                                showToast(`Monitor "${mon.label}" selecionado.`);
                              }}
                            >
                              <div>
                                <strong>{mon.label}</strong>
                                <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                                  {mon.width}x{mon.height} • ({mon.left}, {mon.top})
                                </div>
                              </div>
                              {mon.isPrimary && (
                                <span className="user-role" style={{ fontSize: '9px', backgroundColor: 'var(--accent-glow)', color: 'var(--accent-color)', padding: '1px 6px', borderRadius: '8px' }}>
                                  Principal
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Manual Geometry Controls */}
                {user.is_admin && (
                  <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>Largura (px)</label>
                      <input
                        type="number"
                        className="input-text"
                        value={settings.display.width}
                        onChange={(e) => setSettings({
                          ...settings,
                          display: { ...settings.display, width: parseInt(e.target.value) || 1280 }
                        })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '11px' }}>Altura (px)</label>
                      <input
                        type="number"
                        className="input-text"
                        value={settings.display.height}
                        onChange={(e) => setSettings({
                          ...settings,
                          display: { ...settings.display, height: parseInt(e.target.value) || 720 }
                        })}
                      />
                    </div>
                  </div>
                )}

                {/* Kiosk Action Buttons */}
                {user.is_admin && (
                  <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }} id="tour-config-kiosk-actions">
                    <span className="form-label" style={{ marginBottom: 0 }}>Comandos da Janela do Projetor</span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenDisplay}>
                        <Play size={14} />
                        Abrir Tela (Kiosk)
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={handleTopmostDisplay}>
                        <RefreshCw size={14} />
                        Trazer para Frente
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={handleRestoreDisplay}>
                        <Tv size={14} />
                        Restaurar
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={handleMinimizeDisplay}>
                        <Minimize2 size={14} />
                        Minimizar
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={handleCloseDisplay} style={{ marginLeft: 'auto' }}>
                        Fechar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* COMPORTAMENTOS DE JANELA E PRESETS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Comportamentos */}
              <div className="config-card glass" id="tour-config-behaviors">
                <div className="config-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="config-card-icon">
                      <Sliders size={20} />
                    </div>
                    <div>
                      <h3>Comportamento da Tela</h3>
                      <p>Automações de janela durante a reprodução</p>
                    </div>
                  </div>
                </div>

                <div className="config-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>Minimizar tela ao tocar vídeo</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Minimiza a tela do telão automaticamente ao iniciar qualquer reprodução
                      </div>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.player.autoMinimizeOnPlay ?? false}
                        onChange={(e) => setSettings({
                          ...settings,
                          player: { ...settings.player, autoMinimizeOnPlay: e.target.checked }
                        })}
                        disabled={!user.is_admin}
                      />
                      <span className="slider-toggle" />
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>Minimizar ao clicar no vídeo</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Ao clicar na área de exibição, a janela é minimizada
                      </div>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.player.clickToMinimize ?? true}
                        onChange={(e) => setSettings({
                          ...settings,
                          player: { ...settings.player, clickToMinimize: e.target.checked }
                        })}
                        disabled={!user.is_admin}
                      />
                      <span className="slider-toggle" />
                    </label>
                  </div>
                </div>
              </div>

              {/* PRESETS DE RESOLUÇÃO */}
              <div className="config-card glass" id="tour-config-presets">
                <div className="config-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="config-card-icon">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h3>Presets Rápidos de Resolução</h3>
                      <p>Selecione ou crie perfis de exibição pré-configurados</p>
                    </div>
                  </div>

                  {user.is_admin && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowAddPresetModal(true)}
                    >
                      <Plus size={13} />
                      Novo Preset
                    </button>
                  )}
                </div>

                <div className="config-card-body">
                  <div className="presets-grid">
                    {settings.presets?.map(preset => (
                      <div key={preset.id} className="preset-card" onClick={() => handleLoadPreset(preset)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <h4 style={{ fontSize: '14px', fontWeight: 700 }}>{preset.name}</h4>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              {preset.display.width}x{preset.display.height} 
                              {preset.display.fullscreen ? ' • Kiosk' : ''}
                            </p>
                          </div>
                          {user.is_admin && preset.id.length > 5 && (
                            <button
                              type="button"
                              className="video-action-btn delete"
                              onClick={(e) => handleDeletePreset(preset.id, preset.name, e)}
                              title="Excluir preset"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--accent-color)', fontWeight: 700, marginTop: '8px', textAlign: 'right', display: 'block' }}>
                          Carregar
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {user.is_admin && (
            <div className="mobile-tab-save-container">
              <button type="button" className="btn btn-primary mobile-tab-save-btn" onClick={() => handleSaveSettings()}>
                <Save size={16} />
                Salvar Alterações
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PLAYOUT & ÁUDIO */}
      {activeConfigTab === 'playout' && (
        <div className="config-tab-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            
            {/* CONFIGURAÇÕES DE ÁUDIO E VOLUME */}
            <div className="config-card glass" id="tour-config-volume">
              <div className="config-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="config-card-icon">
                    <Volume2 size={20} />
                  </div>
                  <div>
                    <h3>Áudio e Volume Padrão</h3>
                    <p>Defina os parâmetros de inicialização de som</p>
                  </div>
                </div>
              </div>

              <div className="config-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Volume Inicial do Playout</label>
                    <span style={{ fontWeight: 700, color: 'var(--accent-color)' }}>{settings.player.volume ?? 80}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    className="volume-slider"
                    value={settings.player.volume ?? 80}
                    onChange={(e) => setSettings({
                      ...settings,
                      player: { ...settings.player, volume: parseInt(e.target.value) }
                    })}
                    disabled={!user.is_admin}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Iniciar vídeos silenciado (Mudo)</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Inicia as mídias com o áudio desativado até ser acionado
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.player.muted ?? false}
                      onChange={(e) => setSettings({
                        ...settings,
                        player: { ...settings.player, muted: e.target.checked }
                      })}
                      disabled={!user.is_admin}
                    />
                    <span className="slider-toggle" />
                  </label>
                </div>
              </div>
            </div>

            {/* REPRODUÇÃO & STREAMING */}
            <div className="config-card glass" id="tour-config-playback-modes">
              <div className="config-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="config-card-icon">
                    <Tv size={20} />
                  </div>
                  <div>
                    <h3>Modo de Reprodução</h3>
                    <p>Controles de reprodução contínua e interface</p>
                  </div>
                </div>
              </div>

              <div className="config-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Reprodução Automática (Autoplay)</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Inicia a mídia instantaneamente ao ser selecionada na biblioteca
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.player.autoplay ?? true}
                      onChange={(e) => setSettings({
                        ...settings,
                        player: { ...settings.player, autoplay: e.target.checked }
                      })}
                      disabled={!user.is_admin}
                    />
                    <span className="slider-toggle" />
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Repetir em Loop</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Ao terminar o vídeo, reinicia automaticamente
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.player.loop ?? false}
                      onChange={(e) => setSettings({
                        ...settings,
                        player: { ...settings.player, loop: e.target.checked }
                      })}
                      disabled={!user.is_admin}
                    />
                    <span className="slider-toggle" />
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Exibir Controles Nativos no Telão</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Mostra a barra do player HTML5 na saída de vídeo
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.player.showControls ?? false}
                      onChange={(e) => setSettings({
                        ...settings,
                        player: { ...settings.player, showControls: e.target.checked }
                      })}
                      disabled={!user.is_admin}
                    />
                    <span className="slider-toggle" />
                  </label>
                </div>
              </div>
            </div>

          </div>

          {user.is_admin && (
            <div className="mobile-tab-save-container">
              <button type="button" className="btn btn-primary mobile-tab-save-btn" onClick={() => handleSaveSettings()}>
                <Save size={16} />
                Salvar Alterações
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MANUTENÇÃO DO SISTEMA */}
      {activeConfigTab === 'maintenance' && (
        <div className="config-tab-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            
            {/* STATUS DA BIBLIOTECA */}
            <div className="config-card glass" id="tour-config-maintenance-stats">
              <div className="config-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="config-card-icon">
                    <HardDrive size={20} />
                  </div>
                  <div>
                    <h3>Status da Biblioteca & Mídias</h3>
                    <p>Visão geral de itens cadastrados e fluxo de streams</p>
                  </div>
                </div>
              </div>

              <div className="config-card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Categorias</span>
                    <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>
                      {categories.length}
                    </div>
                  </div>
                  <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Vídeos Totais</span>
                    <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--accent-color)' }}>
                      {totalVideos}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Info size={16} color="var(--accent-color)" />
                    <strong style={{ fontSize: '13px' }}>Auto-renovação de 2 Horas</strong>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    O YouTube expira streams a cada 6 horas. O Projyn renova todos os links silenciosamente a cada 2 horas para garantir que nenhum vídeo falhe durante a transmissão.
                  </p>
                </div>
              </div>
            </div>

            {/* RENOVAÇÃO MANUAL EM LOTE */}
            <div className="config-card glass" id="tour-config-maintenance-refresh">
              <div className="config-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="config-card-icon">
                    <RefreshCw size={20} />
                  </div>
                  <div>
                    <h3>Manutenção de Links & Títulos</h3>
                    <p>Revalide todos os links HLS e thumbnails agora</p>
                  </div>
                </div>
              </div>

              <div className="config-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Caso tenha adicionado muitas músicas recentemente ou queira forçar a atualização imediata dos formatos de vídeo, execute a manutenção completa.
                </p>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRefreshAll}
                  disabled={refreshingAll}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '14px' }}
                >
                  <RefreshCw size={18} style={{ animation: refreshingAll ? 'spin 1s linear infinite' : 'none', color: 'var(--accent-color)' }} />
                  <strong>{refreshingAll ? 'Atualizando Biblioteca...' : 'Atualizar Todos os Links da Biblioteca'}</strong>
                </button>
              </div>
            </div>

          </div>

          {user.is_admin && (
            <div className="mobile-tab-save-container">
              <button type="button" className="btn btn-primary mobile-tab-save-btn" onClick={() => handleSaveSettings()}>
                <Save size={16} />
                Salvar Alterações
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: GESTÃO DE USUÁRIOS (ADMIN ONLY) */}
      {activeConfigTab === 'users' && user.is_admin && (
        <div className="config-tab-content">
          <div className="config-card glass">
            <div className="config-card-header" id="tour-config-users-header" style={{ flexWrap: 'wrap', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="config-card-icon">
                  <Users size={20} />
                </div>
                <div>
                  <h3>Operadores e Permissões</h3>
                  <p>Controle quem pode gerenciar músicas, categorias e disparar playout</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Filtrar usuário..."
                  className="input-text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  style={{ width: '180px', padding: '6px 12px', fontSize: '13px' }}
                />
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddUserModal(true)}>
                  <UserPlus size={14} />
                  Novo Usuário
                </button>
              </div>
            </div>

            <div className="config-card-body">
              {loadingUsers ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>Carregando usuários...</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {filteredUsers.map((u, uIdx) => (
                    <div key={u.id} id={uIdx === 0 ? "tour-config-users-card" : undefined} className="user-management-card glass">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div className="user-avatar" style={{ width: '40px', height: '40px', fontSize: '15px' }}>
                            {u.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <strong style={{ fontSize: '16px' }}>{u.username}</strong>
                            <span className="user-role" style={{ 
                              display: 'inline-block',
                              marginLeft: '8px', 
                              fontSize: '10px', 
                              backgroundColor: u.is_admin ? 'var(--accent-glow)' : 'var(--border-color)',
                              color: u.is_admin ? 'var(--accent-color)' : 'var(--text-secondary)',
                              padding: '2px 8px',
                              borderRadius: '10px'
                            }}>
                              {u.is_admin ? 'Admin' : 'Operador'}
                            </span>
                          </div>
                        </div>

                        <button 
                          className="video-action-btn delete" 
                          onClick={() => handleDeleteUser(u.id, u.username)}
                          disabled={u.id === user.id}
                          title="Excluir Usuário"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {/* Permissions Toggles */}
                      <div className="user-permissions-grid" style={{ marginTop: '14px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px' }}>
                          <input
                            type="checkbox"
                            checked={u.is_admin}
                            onChange={() => handleTogglePermission(u, 'is_admin')}
                            disabled={u.id === user.id}
                          />
                          Administrador
                        </label>
                        
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px' }}>
                          <input
                            type="checkbox"
                            checked={u.can_create_category}
                            onChange={() => handleTogglePermission(u, 'can_create_category')}
                          />
                          Criar Categorias
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px' }}>
                          <input
                            type="checkbox"
                            checked={u.can_add_songs}
                            onChange={() => handleTogglePermission(u, 'can_add_songs')}
                          />
                          Adicionar Músicas
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px' }}>
                          <input
                            type="checkbox"
                            checked={u.can_play_control}
                            onChange={() => handleTogglePermission(u, 'can_play_control')}
                          />
                          Controlar Playout
                        </label>
                      </div>

                      {/* Category access config */}
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '10px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <strong>Acesso a Categorias:</strong>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={u.see_all_categories}
                              onChange={() => handleTogglePermission(u, 'see_all_categories')}
                            />
                            Ver Todas
                          </label>
                        </div>

                        {!u.see_all_categories && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {categories.map(cat => {
                              const isAllowed = u.allowed_categories.includes(cat.id);
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => handleToggleUserCategory(u, cat.id)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    border: '1px solid var(--border-color)',
                                    backgroundColor: isAllowed ? 'var(--accent-glow)' : 'var(--bg-card)',
                                    color: isAllowed ? 'var(--accent-color)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  {isAllowed && <Check size={12} />}
                                  {cat.title}
                                </button>
                              );
                            })}
                            {categories.length === 0 && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Nenhuma categoria cadastrada</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {user.is_admin && (
            <div className="mobile-tab-save-container">
              <button type="button" className="btn btn-primary mobile-tab-save-btn" onClick={() => handleSaveSettings()}>
                <Save size={16} />
                Salvar Alterações
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CRIAR NOVO PRESET */}
      {showAddPresetModal && (
        <div className="modal-backdrop">
          <div className="modal-content glass" style={{ width: '100%', maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} color="var(--accent-color)" />
                Salvar Novo Preset de Tela
              </h3>
              <button className="category-action-btn" onClick={() => setShowAddPresetModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePreset}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Nome do Preset</label>
                <input
                  type="text"
                  className="input-text"
                  placeholder="Ex: Projetor Salão 1080p, TV Hall..."
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  required
                />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Será salvo com a resolução atual ({settings.display.width}x{settings.display.height}) e monitor selecionado.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Salvar Preset
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddPresetModal(false)} style={{ flex: 1 }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CADASTRAR NOVO USUÁRIO */}
      {showAddUserModal && (
        <div className="modal-backdrop">
          <div className="modal-content glass" style={{ width: '100%', maxWidth: '460px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} color="var(--accent-color)" />
                Cadastrar Novo Usuário
              </h3>
              <button className="category-action-btn" onClick={() => setShowAddUserModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRegisterUser}>
              <div className="form-group">
                <label className="form-label">Nome de Usuário</label>
                <input
                  type="text"
                  className="input-text"
                  placeholder="Nome de login (ex: operador1)"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Senha</label>
                <input
                  type="password"
                  className="input-text"
                  placeholder="Senha segura"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <span className="form-label" style={{ marginBottom: '4px' }}>Permissões e Acessos</span>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newIsAdmin}
                    onChange={(e) => setNewIsAdmin(e.target.checked)}
                  />
                  Administrador (Acesso total)
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newCanCreateCat}
                    onChange={(e) => setNewCanCreateCat(e.target.checked)}
                  />
                  Permitir Criar/Excluir Categorias
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newCanAddSongs}
                    onChange={(e) => setNewCanAddSongs(e.target.checked)}
                  />
                  Permitir Buscar/Salvar Músicas
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newCanPlay}
                    onChange={(e) => setNewCanPlay(e.target.checked)}
                  />
                  Permitir Controlar Reprodução (Play/Pause/Volume)
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <input
                    type="checkbox"
                    checked={newSeeAllCat}
                    onChange={(e) => setNewSeeAllCat(e.target.checked)}
                  />
                  Acesso a Todas as Categorias
                </label>

                {!newSeeAllCat && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', paddingLeft: '20px' }}>
                    {categories.map(cat => {
                      const isAllowed = newAllowedCats.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleToggleNewAllowedCat(cat.id)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: isAllowed ? 'var(--accent-glow)' : 'var(--bg-card)',
                            color: isAllowed ? 'var(--accent-color)' : 'var(--text-secondary)',
                            cursor: 'pointer'
                          }}
                        >
                          {cat.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Salvar Usuário
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddUserModal(false)} style={{ flex: 1 }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PROGRESSO DE ATUALIZAÇÃO EM LOTE */}
      {showProgressModal && refreshProgress && (
        <div className="modal-backdrop" style={{ zIndex: 9999, background: 'rgba(0, 0, 0, 0.82)', backdropFilter: 'blur(8px)' }}>
          <div className="modal-content glass" style={{ maxWidth: '500px', width: '90%', padding: '28px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
              <RefreshCw 
                size={28} 
                style={{ 
                  color: refreshProgress.done ? '#10b981' : 'var(--accent-color)', 
                  animation: refreshProgress.done ? 'none' : 'spin 1s linear infinite' 
                }} 
              />
              <h3 style={{ fontSize: '18px', fontWeight: 700 }}>
                {refreshProgress.done ? 'Atualização Concluída!' : 'Atualizando Links da Biblioteca'}
              </h3>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              {refreshProgress.done 
                ? `${refreshProgress.updated} vídeos foram atualizados com sucesso e links 100% renovados.`
                : 'Renovando streams HLS/MP4 e títulos do YouTube para reprodução instantânea...'
              }
            </p>

            {/* Barra de Progresso */}
            <div style={{ 
              width: '100%', 
              height: '14px', 
              background: 'rgba(255, 255, 255, 0.08)', 
              borderRadius: '10px', 
              overflow: 'hidden',
              marginBottom: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{
                width: `${Math.max(3, refreshProgress.percent)}%`,
                height: '100%',
                background: refreshProgress.done 
                  ? 'linear-gradient(90deg, #10b981, #059669)' 
                  : 'linear-gradient(90deg, #e73c55, #f43f5e, #fb7185)',
                borderRadius: '10px',
                transition: 'width 0.3s ease-out'
              }} />
            </div>

            {/* Indicadores numéricos */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px' }}>
              <span>{refreshProgress.current} de {refreshProgress.total} vídeos</span>
              <span style={{ color: refreshProgress.done ? '#10b981' : 'var(--accent-color)', fontSize: '15px' }}>
                {refreshProgress.percent}%
              </span>
            </div>

            {/* Vídeo atual */}
            {!refreshProgress.done && refreshProgress.current_title && (
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.04)', 
                padding: '10px 14px', 
                borderRadius: '8px', 
                fontSize: '12px', 
                color: 'var(--text-primary)',
                textAlign: 'left',
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                <span style={{ color: 'var(--accent-color)', fontWeight: 600, marginRight: '6px' }}>Processando:</span>
                {refreshProgress.current_title}
              </div>
            )}

            {refreshProgress.done && (
              <button 
                className="btn btn-primary" 
                onClick={() => setShowProgressModal(false)}
                style={{ marginTop: '16px', width: '100%' }}
              >
                Concluir e Fechar
              </button>
            )}
          </div>
        </div>
      )}

      {/* IN-APP PRESET DELETE CONFIRMATION MODAL */}
      {presetToDelete && (
        <div className="modal-overlay" onClick={() => setPresetToDelete(null)}>
          <div className="modal-content glass confirm-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <div className="confirm-warning-icon">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3>Excluir Preset</h3>
                <p>Esta ação removerá o preset personalizado.</p>
              </div>
            </div>
            
            <div className="confirm-modal-body">
              <p className="confirm-question">
                Tem certeza de que deseja excluir o preset <strong>"{presetToDelete.name}"</strong>?
              </p>
            </div>
            
            <div className="confirm-modal-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setPresetToDelete(null)}
                disabled={isDeletingConfig}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={handleConfirmDeletePreset}
                disabled={isDeletingConfig}
              >
                <Trash2 size={16} />
                {isDeletingConfig ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP USER DELETE CONFIRMATION MODAL */}
      {userToDelete && (
        <div className="modal-overlay" onClick={() => setUserToDelete(null)}>
          <div className="modal-content glass confirm-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <div className="confirm-warning-icon">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3>Excluir Usuário</h3>
                <p>O acesso deste operador será revogado imediatamente.</p>
              </div>
            </div>
            
            <div className="confirm-modal-body">
              <p className="confirm-question">
                Deseja realmente excluir a conta do usuário <strong>"{userToDelete.name}"</strong>?
              </p>
            </div>
            
            <div className="confirm-modal-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setUserToDelete(null)}
                disabled={isDeletingConfig}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={handleConfirmDeleteUser}
                disabled={isDeletingConfig}
              >
                <Trash2 size={16} />
                {isDeletingConfig ? 'Excluindo...' : 'Sim, Excluir Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE SPOTLIGHT TOUR GUIDE */}
      <TourGuide
        isOpen={showTutorial}
        steps={getConfigTourSteps(setActiveConfigTab, user.is_admin)}
        onClose={() => setShowTutorial(false)}
        tourKey="config"
      />
    </div>
  );
};
