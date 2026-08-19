import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Trash2, FolderPlus, Play, 
  Sparkles, X, Folder, AlertCircle, ChevronDown, FolderHeart, RotateCw, Clock,
  MoreVertical, AlertTriangle
} from 'lucide-react';
import { User, Category, Video, formatDuration } from '../types';
import { TourGuide, TourStep } from '../components/TourGuide';
import { TutorialButton } from '../components/TutorialButton';

const libraryTourSteps: TourStep[] = [
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
    content: 'Clique em qualquer vídeo para apresentar e iniciar a reprodução instantaneamente no telão.',
    position: 'top'
  }
];

const Youtube: React.FC<{ size?: number; color?: string; style?: React.CSSProperties }> = ({ size = 24, color = "currentColor", style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={style}
  >
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <polygon points="10 15 15 12 10 9" fill={color} />
  </svg>
);

interface LibraryProps {
  user: User;
  token: string;
  onPlayVideo: (video: Video) => void;
  showToast: (message: string) => void;
}

const PRESET_COLORS = [
  '#e73c55', '#3b82f6', '#10b981', '#f59e0b', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6'
];

export const Library: React.FC<LibraryProps> = ({ user, token, onPlayVideo, showToast }) => {
  const [libraryData, setLibraryData] = useState<{ activeGroupId: string; groups: Category[] }>(() => {
    try {
      const cached = sessionStorage.getItem('projyn_library_cache');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return {
      activeGroupId: '',
      groups: [],
    };
  });
  const [loading, setLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem('projyn_library_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        return !(parsed.groups && parsed.groups.length > 0);
      }
    } catch (e) {}
    return true;
  });
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const cached = sessionStorage.getItem('projyn_library_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.activeGroupId || (parsed.groups?.[0]?.id ?? '');
      }
    } catch (e) {}
    return '';
  }); // Active category ID
  const [refreshingAll, setRefreshingAll] = useState(false);
  
  // Category management
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryTitle, setNewCategoryTitle] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(PRESET_COLORS[0]);

  // Video management & YouTube Search
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [youtubeQuery, setYoutubeQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Video[]>([]);
  const [searchingYoutube, setSearchingYoutube] = useState(false);
  const [directUrl, setDirectUrl] = useState('');
  const [addingVideo, setAddingVideo] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // 3-dots Menu & In-App Delete Confirmation Modals
  const [activeMenuVideoId, setActiveMenuVideoId] = useState<string | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<Video | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Click outside listener for 3-dots menu
  useEffect(() => {
    const handleCloseMenu = () => {
      setActiveMenuVideoId(null);
    };
    document.addEventListener('click', handleCloseMenu);
    return () => document.removeEventListener('click', handleCloseMenu);
  }, []);

  // Fetch Library
  const fetchLibrary = async () => {
    try {
      if (!libraryData.groups.length) {
        setLoading(true);
      }
      const response = await fetch('/api/library', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setLibraryData(data);
        try {
          sessionStorage.setItem('projyn_library_cache', JSON.stringify(data));
        } catch (e) {}
        if (data.groups && data.groups.length > 0) {
          // Verify if activeGroupId is accessible
          const activeExists = data.groups.some((g: Category) => g.id === activeTab);
          if (!activeExists || !activeTab) {
            setActiveTab(data.activeGroupId || data.groups[0].id);
          }
        }
      }
    } catch (error) {
      showToast('Erro ao carregar biblioteca.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [token]);

  // Active Group helper
  const activeGroup = libraryData.groups.find(g => g.id === activeTab);

  // Create Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryTitle.trim()) return;

    try {
      const response = await fetch('/api/library/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newCategoryTitle,
          color: newCategoryColor
        })
      });
      const data = await response.json();
      if (response.ok) {
        setLibraryData(data);
        showToast(`Categoria "${newCategoryTitle}" criada!`);
        setNewCategoryTitle('');
        setShowAddCategory(false);
        // Set active category to the newly created one
        if (data.activeGroupId) {
          setActiveTab(data.activeGroupId);
        }
      } else {
        showToast(data.error || 'Erro ao criar categoria.');
      }
    } catch (error) {
      showToast('Erro de conexão ao criar categoria.');
    }
  };

  // Confirm Delete Category in-app
  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const groupId = categoryToDelete.id;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/library/groups/${encodeURIComponent(groupId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setLibraryData(data);
        try {
          sessionStorage.setItem('projyn_library_cache', JSON.stringify(data));
        } catch (e) {}
        showToast('Categoria excluída com sucesso.');
        if (data.groups && data.groups.length > 0) {
          setActiveTab(data.activeGroupId || data.groups[0].id);
        } else {
          setActiveTab('');
        }
      } else {
        showToast(data.error || 'Erro ao excluir categoria.');
      }
    } catch (error) {
      showToast('Erro de conexão ao excluir categoria.');
    } finally {
      setIsDeleting(false);
      setCategoryToDelete(null);
    }
  };

  // Confirm Delete Video in-app
  const handleConfirmDeleteVideo = async () => {
    if (!videoToDelete || !activeTab) return;
    const videoId = videoToDelete.id;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/library/groups/${encodeURIComponent(activeTab)}/videos/${encodeURIComponent(videoId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setLibraryData(data);
        try {
          sessionStorage.setItem('projyn_library_cache', JSON.stringify(data));
        } catch (e) {}
        showToast('Vídeo removido da categoria.');
      } else {
        showToast(data.error || 'Erro ao remover vídeo.');
      }
    } catch (error) {
      showToast('Erro de conexão ao excluir vídeo.');
    } finally {
      setIsDeleting(false);
      setVideoToDelete(null);
    }
  };

  // Search YouTube
  const handleYoutubeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeQuery.trim()) return;

    setSearchingYoutube(true);
    setSearchResults([]);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(youtubeQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setSearchResults(data.results || []);
        if ((data.results || []).length === 0) {
          showToast('Nenhum resultado encontrado.');
        }
      } else {
        showToast(data.error || 'Erro ao pesquisar no YouTube.');
      }
    } catch (error) {
      showToast('Erro de conexão com o buscador.');
    } finally {
      setSearchingYoutube(false);
    }
  };

  // Add video (either from search or direct URL)
  const handleAddVideo = async (videoPayload: any) => {
    if (!activeTab) {
      showToast('Selecione uma categoria primeiro.');
      return;
    }

    setAddingVideo(true);
    showToast('Preparando streaming direto do YouTube (isso pode levar alguns segundos)...');
    try {
      const response = await fetch(`/api/library/groups/${encodeURIComponent(activeTab)}/videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(videoPayload)
      });
      const data = await response.json();
      if (response.ok) {
        setLibraryData(data.library);
        showToast(`Vídeo "${data.video.title}" adicionado!`);
        setDirectUrl('');
        // If it's a search result, don't close modal immediately, allow adding multiple
      } else {
        showToast(data.error || 'Erro ao preparar vídeo. Verifique se o ID ou URL está correto.');
      }
    } catch (error) {
      showToast('Erro de conexão ao salvar vídeo.');
    } finally {
      setAddingVideo(false);
    }
  };

  const handleAddDirectUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directUrl.trim()) return;
    handleAddVideo({ url: directUrl.trim() });
  };

  // Filtered and sorted videos based on local search (alphabetical order)
  const filteredVideos = (activeGroup?.videos || []).filter(video => 
    video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (video.channel && video.channel.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

  // Group videos by first letter
  const groupedVideos: { [key: string]: Video[] } = {};
  filteredVideos.forEach(video => {
    const firstChar = video.title.trim().charAt(0).toUpperCase();
    const letter = /^[A-Z]$/.test(firstChar) ? firstChar : '#';
    if (!groupedVideos[letter]) {
      groupedVideos[letter] = [];
    }
    groupedVideos[letter].push(video);
  });

  // Get sorted list of letters that have videos
  const activeLetters = Object.keys(groupedVideos).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  // Alphabet list (A-Z + #)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

  const [currentVisibleLetter, setCurrentVisibleLetter] = useState<string>('A');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalTab, setAddModalTab] = useState<'search' | 'url'>('search');

  // Click outside listener for category selector dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let closestLetter = '';
    let minDistance = Infinity;

    activeLetters.forEach(letter => {
      const el = document.getElementById(`letter-section-${letter}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const distance = Math.abs(rect.top - containerRect.top);
        if (distance < minDistance) {
          minDistance = distance;
          closestLetter = letter;
        }
      }
    });

    if (closestLetter) {
      setCurrentVisibleLetter(closestLetter);
    }
  };

  const scrollToLetter = (letter: string) => {
    const el = document.getElementById(`letter-section-${letter}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="library-view-container">
      {/* 1. EXTENDED MENU/NAVBAR FOR LIBRARY */}
      <div className="library-sub-navbar glass">
        {/* Left: Local Search */}
        <div className="sub-navbar-left">
          <div className="search-box" id="tour-library-search">
            <Search size={18} />
            <input
              type="text"
              className="input-text"
              placeholder="Pesquisar nesta categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Right: Category Selector & Plus Button */}
        <div className="sub-navbar-right">
          <div className="category-select-wrapper" id="tour-library-category" ref={categoryDropdownRef}>
            <button 
              className="category-select-trigger" 
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
            >
              <span 
                className="category-dot" 
                style={{ backgroundColor: activeGroup?.color || 'var(--accent-color)' }} 
              />
              <span className="category-select-label">
                {activeGroup?.title || 'Selecionar Categoria'}
              </span>
              <ChevronDown size={16} />
            </button>
            
            {showCategoryDropdown && (
              <div className="category-dropdown-menu glass">
                <div className="category-dropdown-items">
                  {libraryData.groups.map(group => (
                    <div 
                      key={group.id} 
                      className={`category-dropdown-item ${activeTab === group.id ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTab(group.id);
                        setShowCategoryDropdown(false);
                      }}
                    >
                      <span className="category-dot" style={{ backgroundColor: group.color }} />
                      <span className="item-title">{group.title}</span>
                      {user.can_create_category && (
                        <button
                          className="item-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCategoryDropdown(false);
                            setCategoryToDelete({ id: group.id, title: group.title });
                          }}
                          title="Excluir Categoria"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {libraryData.groups.length === 0 && (
                    <div className="empty-dropdown-text">Nenhuma categoria</div>
                  )}
                </div>
                
                {user.can_create_category && (
                  <div className="category-dropdown-footer">
                    {showAddCategory ? (
                      <form onSubmit={handleCreateCategory} className="add-category-form">
                        <input
                          type="text"
                          className="input-text sm"
                          placeholder="Nome..."
                          value={newCategoryTitle}
                          onChange={(e) => setNewCategoryTitle(e.target.value)}
                          autoFocus
                          required
                        />
                        <div className="color-palette-row">
                          {PRESET_COLORS.map(color => (
                            <button
                              key={color}
                              type="button"
                              className="color-dot-btn"
                              style={{
                                backgroundColor: color,
                                border: newCategoryColor === color ? '2px solid var(--text-primary)' : 'none',
                              }}
                              onClick={() => setNewCategoryColor(color)}
                            />
                          ))}
                        </div>
                        <div className="form-actions-row">
                          <button type="submit" className="btn btn-primary btn-xs">Salvar</button>
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setShowAddCategory(false)}>Cancelar</button>
                        </div>
                      </form>
                    ) : (
                      <button 
                        className="btn-add-category" 
                        onClick={() => setShowAddCategory(true)}
                      >
                        <Plus size={14} />
                        Criar Categoria
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {user.can_add_songs && activeTab && (
            <button 
              id="tour-library-add"
              className="btn-plus-add" 
              onClick={() => {
                setShowAddModal(true);
                setAddModalTab('search');
              }}
              title="Adicionar Vídeo"
            >
              <Plus size={20} />
            </button>
          )}

          <TutorialButton onClick={() => setShowTutorial(true)} label="Tutorial Interativo" compact={false} />
        </div>
      </div>

      {/* 2. LOADING STATE */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
          <div className="time-label" style={{ fontSize: '18px' }}>Carregando biblioteca...</div>
        </div>
      ) : (
        /* 3. MAIN CONTENT LAYOUT */
        <div className="library-layout-wrapper">
          {activeTab ? (
            <div className="library-content-container">
              {/* Scrollable list of alphabet-grouped videos */}
              <div 
                className="video-list-scrollable" 
                ref={scrollContainerRef}
                onScroll={handleScroll}
              >
                {filteredVideos.length === 0 ? (
                  <div className="glass empty-library-state">
                    <Folder size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p>Nenhum vídeo nesta categoria.</p>
                    {user.can_add_songs && (
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        Clique no botão "+" acima para buscar no YouTube ou adicionar links diretos.
                      </p>
                    )}
                  </div>
                ) : (
                  activeLetters.map(letter => (
                    <div key={letter} id={`letter-section-${letter}`} className="letter-section">
                      <div className="letter-section-header">
                        {letter}
                      </div>
                      <div className="videos-grid">
                        {groupedVideos[letter].map((video, vIdx) => (
                          <div 
                            key={video.id} 
                            id={vIdx === 0 && letter === activeLetters[0] ? 'tour-library-video-first' : undefined} 
                            className="video-card glass clickable-card"
                            onClick={() => {
                              if (user.can_play_control || user.is_admin) {
                                onPlayVideo(video);
                              } else {
                                showToast('Apenas operadores autorizados podem apresentar músicas.');
                              }
                            }}
                            title="Clique para apresentar no telão"
                          >
                            <div className="video-thumbnail">
                              <img 
                                src={video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} 
                                alt={video.title} 
                                loading="lazy" 
                                decoding="async"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  if (video.id && !target.src.includes('hqdefault.jpg')) {
                                    target.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
                                  }
                                }}
                              />
                              <div className="video-thumbnail-play-overlay">
                                <div className="play-overlay-icon">
                                  <Play size={20} fill="white" color="white" />
                                </div>
                              </div>
                              <span className="video-duration">{formatDuration(video.duration)}</span>
                              
                              {/* 3-dots menu button */}
                              {(user.can_add_songs || user.is_admin) && (
                                <div className="video-card-menu-wrapper" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className={`video-card-menu-btn ${activeMenuVideoId === video.id ? 'active' : ''}`}
                                    title="Opções da Música"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuVideoId(activeMenuVideoId === video.id ? null : video.id);
                                    }}
                                  >
                                    <MoreVertical size={16} />
                                  </button>
                                  {activeMenuVideoId === video.id && (
                                    <div className="video-card-dropdown glass" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        className="delete"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuVideoId(null);
                                          setVideoToDelete(video);
                                        }}
                                      >
                                        <Trash2 size={14} />
                                        Excluir Música
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="video-details">
                              <div>
                                <h4 className="video-title" title={video.title}>{video.title}</h4>
                                <span className="video-channel">{video.channel}</span>
                              </div>
                              <div className="video-card-actions">
                                <span className="click-to-play-badge">
                                  <Play size={11} fill="currentColor" /> Apresentar
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* A-Z Vertical Sidebar */}
              {filteredVideos.length > 0 && (
                <div className="az-sidebar">
                  {alphabet.map(letter => {
                    const hasVideos = !!groupedVideos[letter];
                    const isCurrent = currentVisibleLetter === letter;
                    return (
                      <button
                        key={letter}
                        className={`az-letter-btn ${hasVideos ? 'has-videos' : ''} ${isCurrent ? 'active' : ''}`}
                        disabled={!hasVideos}
                        onClick={() => {
                          scrollToLetter(letter);
                          setCurrentVisibleLetter(letter);
                        }}
                        title={`Ver vídeos com a letra ${letter}`}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="glass" style={{ padding: '100px', textAlign: 'center', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flex: 1, marginTop: '20px' }}>
              <Folder size={64} style={{ opacity: 0.2, marginBottom: '20px' }} />
              <h3>Nenhuma categoria selecionada</h3>
              <p style={{ marginTop: '8px', fontSize: '14px' }}>Selecione ou crie uma categoria no menu de seleção acima para ver os vídeos.</p>
            </div>
          )}
        </div>
      )}

      {/* 4. SUSPENDED CARD MODAL WITH TABS (SEARCH & DIRECT LINK) */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content glass" style={{ width: '100%', maxWidth: '600px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FolderHeart size={24} color="var(--accent-color)" />
                <h3>Adicionar Novo Vídeo</h3>
              </div>
              <button className="category-action-btn" onClick={() => { setShowAddModal(false); setSearchResults([]); setYoutubeQuery(''); setDirectUrl(''); }}>
                <X size={20} />
              </button>
            </div>

            {/* Tab selection */}
            <div className="modal-tabs">
              <button 
                type="button" 
                className={`modal-tab ${addModalTab === 'search' ? 'active' : ''}`}
                onClick={() => setAddModalTab('search')}
              >
                Buscar no YouTube
              </button>
              <button 
                type="button" 
                className={`modal-tab ${addModalTab === 'url' ? 'active' : ''}`}
                onClick={() => setAddModalTab('url')}
              >
                Link Direto / URL
              </button>
            </div>
            
            <div className="modal-body">
              {addModalTab === 'search' ? (
                /* Tab 1: YouTube Search */
                <>
                  <form onSubmit={handleYoutubeSearch} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Pesquisar título, artista ou música..."
                      value={youtubeQuery}
                      onChange={(e) => setYoutubeQuery(e.target.value)}
                      autoFocus
                      disabled={searchingYoutube}
                    />
                    <button type="submit" className="btn btn-primary" disabled={searchingYoutube || !youtubeQuery.trim()}>
                      {searchingYoutube ? 'Buscando...' : 'Buscar'}
                    </button>
                  </form>

                  {searchingYoutube && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                      <span className="time-label">Pesquisando no YouTube...</span>
                    </div>
                  )}

                  {!searchingYoutube && searchResults.length > 0 && (
                    <div className="search-results-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {searchResults.map(result => (
                        <div key={result.id} className="search-result-item">
                          <div className="search-result-thumb">
                            <img src={result.thumbnail} alt={result.title} />
                            <span className="video-duration">{formatDuration(result.duration)}</span>
                          </div>
                          <div className="search-result-details">
                            <h4>{result.title}</h4>
                            <p>{result.channel}</p>
                          </div>
                          <div>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleAddVideo(result)}
                              disabled={addingVideo}
                            >
                              <Plus size={14} />
                              Salvar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!searchingYoutube && searchResults.length === 0 && youtubeQuery && (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      Nenhum resultado encontrado. Tente pesquisar com outros termos.
                    </div>
                  )}
                </>
              ) : (
                /* Tab 2: Direct URL */
                <form onSubmit={handleAddDirectUrl} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '10px 0' }}>
                  <div className="form-group">
                    <label className="form-label">Link ou ID do Vídeo</label>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Ex: https://www.youtube.com/watch?v=dQw4w9WgXcQ ou dQw4w9WgXcQ"
                      value={directUrl}
                      onChange={(e) => setDirectUrl(e.target.value)}
                      disabled={addingVideo}
                      autoFocus
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={addingVideo || !directUrl.trim()}>
                    {addingVideo ? 'Preparando Vídeo...' : 'Salvar Vídeo'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IN-APP VIDEO DELETE CONFIRMATION MODAL */}
      {videoToDelete && (
        <div className="modal-overlay" onClick={() => setVideoToDelete(null)}>
          <div className="modal-content glass confirm-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <div className="confirm-warning-icon">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3>Excluir Música</h3>
                <p>Esta ação removerá o vídeo da categoria atual.</p>
              </div>
            </div>
            
            <div className="confirm-modal-body">
              <div className="confirm-video-preview">
                <img 
                  src={videoToDelete.thumbnail || `https://i.ytimg.com/vi/${videoToDelete.id}/hqdefault.jpg`} 
                  alt={videoToDelete.title} 
                />
                <div className="confirm-video-info">
                  <h4>{videoToDelete.title}</h4>
                  <span>{videoToDelete.channel}</span>
                </div>
              </div>
              <p className="confirm-question">Tem certeza de que deseja excluir esta música?</p>
            </div>
            
            <div className="confirm-modal-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setVideoToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={handleConfirmDeleteVideo}
                disabled={isDeleting}
              >
                <Trash2 size={16} />
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP CATEGORY DELETE CONFIRMATION MODAL */}
      {categoryToDelete && (
        <div className="modal-overlay" onClick={() => setCategoryToDelete(null)}>
          <div className="modal-content glass confirm-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <div className="confirm-warning-icon">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3>Excluir Categoria</h3>
                <p>Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            
            <div className="confirm-modal-body">
              <p className="confirm-question">
                Tem certeza de que deseja excluir a categoria <strong>"{categoryToDelete.title}"</strong> e todas as músicas cadastradas nela?
              </p>
            </div>
            
            <div className="confirm-modal-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setCategoryToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={handleConfirmDeleteCategory}
                disabled={isDeleting}
              >
                <Trash2 size={16} />
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir Categoria'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE SPOTLIGHT TOUR GUIDE */}
      <TourGuide
        isOpen={showTutorial}
        steps={libraryTourSteps}
        onClose={() => setShowTutorial(false)}
        tourKey="library"
      />
    </div>
  );
};
