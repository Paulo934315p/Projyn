import React, { useState } from 'react';
import { 
  X, HelpCircle, BookOpen, Sparkles, FolderHeart, Tv, Settings as SettingsIcon, 
  KeyRound, Play, Search, Monitor, Shield, RefreshCw, Smartphone, CheckCircle, 
  Lightbulb, ChevronRight, ChevronLeft, Layers, Volume2, ArrowRight
} from 'lucide-react';

export type TutorialTab = 'library' | 'player' | 'config' | 'login';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TutorialTab;
}

interface TutorialStep {
  title: string;
  description: string;
  badge?: string;
  icon: React.ReactNode;
}

interface TutorialSection {
  id: TutorialTab;
  label: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  steps: TutorialStep[];
  proTips: string[];
  faqs: { q: string; a: string }[];
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose, initialTab = 'library' }) => {
  const [activeTab, setActiveTab] = useState<TutorialTab>(initialTab);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'grid' | 'stepper'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const sections: Record<TutorialTab, TutorialSection> = {
    library: {
      id: 'library',
      label: 'Biblioteca',
      title: 'Guia Completo da Biblioteca de Músicas',
      subtitle: 'Aprenda a organizar categorias, pesquisar no YouTube e gerenciar suas mídias.',
      icon: <FolderHeart size={20} />,
      steps: [
        {
          title: '1. Criar Categorias Personalizadas',
          description: 'Clique em "+ Nova Categoria" no topo da biblioteca. Escolha um nome temático (ex: Louvores, Abertura, Sertanejo, Pop) e selecione uma cor de destaque para fácil identificação.',
          badge: 'Organização',
          icon: <Layers size={22} color="var(--accent-color)" />
        },
        {
          title: '2. Pesquisa Inteligente no YouTube',
          description: 'Dentro de qualquer categoria, clique em "Adicionar Música". Digite o nome da música ou artista para buscar diretamente no YouTube com extração limpa e sem anúncios.',
          badge: 'YouTube',
          icon: <Search size={22} color="#3b82f6" />
        },
        {
          title: '3. Adição por Link Direto (URL)',
          description: 'Se já possui o link do YouTube (ex: youtube.com/watch?v=...), basta colar na aba "Adicionar por Link" e o sistema extrairá instantaneamente o título, thumbnail e fluxo HLS.',
          badge: 'Link Direto',
          icon: <Sparkles size={22} color="#10b981" />
        },
        {
          title: '4. Reprodução Imediata (1 Clique)',
          description: 'Passe o mouse sobre qualquer vídeo cadastrado e clique no botão Play central ou no card. O vídeo é enviado em 0ms para o telão/projetor configurado.',
          badge: 'Playout Instantâneo',
          icon: <Play size={22} color="#f59e0b" />
        },
        {
          title: '5. Renovação Automática de Links (2 Horas)',
          description: 'O sistema renova todos os links do YouTube automaticamente a cada 2 horas em segundo plano. Você também pode clicar no botão "Atualizar Links" para forçar uma verificação imediata.',
          badge: 'Auto-Refresh',
          icon: <RefreshCw size={22} color="#ec4899" />
        }
      ],
      proTips: [
        'Use cores contrastantes para categorias muito acessadas durante eventos ao vivo.',
        'Ao buscar músicas, palavras-chave como "playback", "ao vivo" ou "oficial" ajudam a encontrar a versão exata.',
        'Se uma música apresentar falha de carregamento no YouTube, use o botão de recarregar link no card do vídeo.'
      ],
      faqs: [
        {
          q: 'Os vídeos ocupam espaço no disco do servidor?',
          a: 'Não! O sistema faz streaming direto em alta definição e HLS a partir dos servidores do YouTube, consumindo zero de armazenamento local.'
        },
        {
          q: 'O que acontece se a internet oscilar?',
          a: 'O player nativo possui buffer inteligente e recuperação automática em caso de pequenas oscilações.'
        }
      ]
    },
    player: {
      id: 'player',
      label: 'Controle Playout',
      title: 'Guia do Painel de Controle de Playout',
      subtitle: 'Domine a exibição no telão, controle de linha do tempo e mixagem de áudio.',
      icon: <Tv size={20} />,
      steps: [
        {
          title: '1. Monitor de Exibição em Tempo Real',
          description: 'A tela de controle mostra o vídeo atual em reprodução no telão com sincronização milissegundo a milissegundo, permitindo ver exatamente o que o público está assistindo.',
          badge: 'Sincronização',
          icon: <Tv size={22} color="var(--accent-color)" />
        },
        {
          title: '2. Controles de Reprodução (Play, Pause, Stop)',
          description: 'Utilize os botões centrais para Pausar, Continuar ou Parar a exibição. O botão Parar desliga a exibição e retorna a tela preta instantânea.',
          badge: 'Transporte',
          icon: <Play size={22} color="#10b981" />
        },
        {
          title: '3. Navegação na Linha do Tempo (Seek)',
          description: 'Arraste a barra de progresso para avançar ou retroceder para qualquer ponto do vídeo instantaneamente sem recarregar a mídia.',
          badge: 'Linha do Tempo',
          icon: <ChevronRight size={22} color="#3b82f6" />
        },
        {
          title: '4. Controle de Volume e Mudo',
          description: 'Ajuste o volume geral do projetor pelo slider deslizante ou clique no ícone de alto-falante para ativar/desativar o mudo instantaneamente.',
          badge: 'Áudio',
          icon: <Volume2 size={22} color="#f59e0b" />
        },
        {
          title: '5. Troca Rápida de Músicas pela Playlist',
          description: 'A lateral direita exibe as músicas da sua biblioteca separadas por categorias. Clique em qualquer música para trocar a transmissão imediatamente sem precisar ir até a aba Biblioteca.',
          badge: 'Fila Rápida',
          icon: <Layers size={22} color="#8b5cf6" />
        },
        {
          title: '6. Gestão da Janela Kiosk (Minimizar/Restaurar)',
          description: 'Use os botões de ação para abrir o Kiosk no segundo monitor, trazer para frente ou minimizar para usar o computador enquanto a música continua tocando.',
          badge: 'Janela Kiosk',
          icon: <Monitor size={22} color="#ec4899" />
        }
      ],
      proTips: [
        'A barra de espaço ou os controles do teclado podem ser usados para play/pause rápido.',
        'Ative a opção "Minimizar ao tocar" para continuar operando outros programas sem que o telão cubra suas janelas no monitor principal.',
        'A tela nativa de Playout é mantida no modo Sempre no Topo (Topmost) no projetor para evitar popups indesejados.'
      ],
      faqs: [
        {
          q: 'O áudio para quando a janela é minimizada?',
          a: 'Não! O áudio continua tocando perfeitamente em segundo plano.'
        },
        {
          q: 'Como mover a tela para outro projetor?',
          a: 'Vá até Configurações > Monitores & Tela Kiosk e selecione o monitor secundário desejado.'
        }
      ]
    },
    config: {
      id: 'config',
      label: 'Configurações',
      title: 'Guia das Configurações do Sistema',
      subtitle: 'Configure monitores, crie presets, gerencie operadores e realize diagnósticos.',
      icon: <SettingsIcon size={20} />,
      steps: [
        {
          title: '1. Seleção de Monitor / Telão',
          description: 'O sistema detecta automaticamente todos os monitores conectados (resolução, posição X/Y e tela principal). Selecione o monitor onde o telão/projetor está conectado.',
          badge: 'Multi-Monitor',
          icon: <Monitor size={22} color="var(--accent-color)" />
        },
        {
          title: '2. Presets Rápidos de Tela',
          description: 'Carregue resoluções prontas com 1 clique (ex: Full HD 1080p Kiosk, 720p Janela) ou salve suas próprias configurações de tela como presets personalizados.',
          badge: 'Presets',
          icon: <Sparkles size={22} color="#3b82f6" />
        },
        {
          title: '3. Comportamentos de Minimização',
          description: 'Defina se a tela do telão deve minimizar automaticamente ao iniciar um vídeo ou ao clicar no centro da tela para facilitar a operação em monitores únicos.',
          badge: 'Comportamento',
          icon: <ChevronRight size={22} color="#10b981" />
        },
        {
          title: '4. Manutenção Geral da Biblioteca',
          description: 'A qualquer momento você pode executar a atualização de todos os vídeos da biblioteca para revalidar títulos, thumbnails e links de alta fidelidade.',
          badge: 'Manutenção',
          icon: <RefreshCw size={22} color="#f59e0b" />
        },
        {
          title: '5. Gestão de Usuários e Permissões (Admin)',
          description: 'Cadastre operadores e defina permissões granulares: criar categorias, adicionar músicas, controlar playout ou restringir o acesso a categorias específicas.',
          badge: 'Segurança',
          icon: <Shield size={22} color="#ec4899" />
        },
        {
          title: '6. Acesso por Celular / Rede Local',
          description: 'Utilize o endereço IP do servidor exibido na aba "Diagnóstico & Rede" para controlar o Playout a partir de qualquer smartphone, tablet ou notebook conectado ao mesmo Wi-Fi.',
          badge: 'Rede Local',
          icon: <Smartphone size={22} color="#8b5cf6" />
        }
      ],
      proTips: [
        'Após conectar um novo cabo HDMI ou projetor, clique no botão "Recarregar Monitores" para atualizar a lista instantaneamente.',
        'Operadores comuns não têm acesso à exclusão de configurações vitais do sistema.',
        'Fixe o IP do computador servidor no roteador para que o link de acesso no celular nunca mude.'
      ],
      faqs: [
        {
          q: 'Posso usar o sistema com apenas um monitor?',
          a: 'Sim! Com a função "Minimizar ao Tocar", a reprodução roda normalmente em janela minimizada ou em modo janela.'
        },
        {
          q: 'Como resetar as configurações de tela?',
          a: 'Basta carregar o Preset "Full HD 1080p (Padrão)" na tela de configurações.'
        }
      ]
    },
    login: {
      id: 'login',
      label: 'Acesso & Segurança',
      title: 'Guia de Acesso e Contas de Usuário',
      subtitle: 'Entenda como funciona o login seguro e os níveis de privilégio no sistema.',
      icon: <KeyRound size={20} />,
      steps: [
        {
          title: '1. Níveis de Privilégio',
          description: 'O sistema possui dois perfis principais: Administrador (acesso irrestrito a configurações, monitores e usuários) e Operador (acesso configurado para playout e músicas).',
          badge: 'Perfis',
          icon: <Shield size={22} color="var(--accent-color)" />
        },
        {
          title: '2. Autenticação Segura JWT',
          description: 'O login gera um token criptografado e seguro que mantém sua sessão ativa mesmo após atualizar o navegador ou fechar a aba.',
          badge: 'Segurança',
          icon: <KeyRound size={22} color="#3b82f6" />
        },
        {
          title: '3. Alternância de Temas (Escuro / Claro)',
          description: 'Alterne livremente entre o tema Escuro (ideal para ambientes escuros de eventos e igrejas) e o tema Claro (ideal para operação diurna).',
          badge: 'Interface',
          icon: <Sparkles size={22} color="#10b981" />
        }
      ],
      proTips: [
        'Nunca compartilhe a senha do usuário Administrador com operadores que necessitam apenas disparar louvores.',
        'Se a sessão expirar, o sistema avisa suavemente e permite que você faça login novamente sem perder dados.'
      ],
      faqs: [
        {
          q: 'Esqueci a senha de administrador, o que fazer?',
          a: 'O administrador principal pode redefinir senhas diretamente na aba Configurações > Gerenciar Usuários.'
        }
      ]
    }
  };

  const currentSection = sections[activeTab];

  // Search filtering
  const filteredSteps = currentSection.steps.filter(step => 
    step.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    step.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (step.badge && step.badge.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="modal-backdrop tutorial-backdrop" onClick={onClose} style={{ zIndex: 99999 }}>
      <div 
        className="modal-content glass tutorial-modal" 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '900px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: '20px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)'
        }}
      >
        {/* HEADER */}
        <div className="tutorial-header" style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.05) 100%)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--accent-color) 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 8px 20px var(--accent-glow)'
            }}>
              <BookOpen size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Central de Ajuda & Tutoriais</h2>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'var(--accent-glow)',
                  color: 'var(--accent-color)'
                }}>
                  Projyn Playout
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>
                Guia interativo passo a passo para dominar todos os recursos do sistema.
              </p>
            </div>
          </div>

          <button 
            className="category-action-btn" 
            onClick={onClose}
            title="Fechar Tutorial"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* NAVIGATION TABS */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 28px',
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(0, 0, 0, 0.15)',
          overflowX: 'auto'
        }}>
          {(Object.keys(sections) as TutorialTab[]).map(tabKey => {
            const sec = sections[tabKey];
            const isActive = activeTab === tabKey;
            return (
              <button
                key={tabKey}
                onClick={() => {
                  setActiveTab(tabKey);
                  setCurrentStepIndex(0);
                  setSearchQuery('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: isActive ? '1px solid var(--accent-color)' : '1px solid transparent',
                  background: isActive ? 'var(--accent-glow)' : 'transparent',
                  color: isActive ? 'var(--accent-color)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                {sec.icon}
                {sec.label}
              </button>
            );
          })}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Buscar no guia..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '6px 12px 6px 30px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  width: '180px'
                }}
              />
            </div>

            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'stepper' : 'grid')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Alternar entre Visualização em Grade ou Passo a Passo"
            >
              {viewMode === 'grid' ? 'Modo Passo a Passo' : 'Modo Grade'}
            </button>
          </div>
        </div>

        {/* CONTENT BODY */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {/* SECTION HERO */}
          <div style={{
            padding: '18px 22px',
            background: 'var(--bg-card)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--accent-color)' }}>{currentSection.icon}</span>
                {currentSection.title}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                {currentSection.subtitle}
              </p>
            </div>
            <span style={{
              fontSize: '12px',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap'
            }}>
              {filteredSteps.length} {filteredSteps.length === 1 ? 'Tópico' : 'Tópicos'}
            </span>
          </div>

          {/* VIEW MODE: STEPPER (PASSO A PASSO) */}
          {viewMode === 'stepper' && filteredSteps.length > 0 && (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-color)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '3px 10px',
                  borderRadius: '10px',
                  background: 'var(--accent-glow)',
                  color: 'var(--accent-color)'
                }}>
                  Passo {currentStepIndex + 1} de {filteredSteps.length} • {filteredSteps[currentStepIndex].badge}
                </span>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    disabled={currentStepIndex === 0}
                    onClick={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))}
                    className="btn btn-secondary btn-sm"
                    style={{ opacity: currentStepIndex === 0 ? 0.4 : 1 }}
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                  <button
                    disabled={currentStepIndex === filteredSteps.length - 1}
                    onClick={() => setCurrentStepIndex(prev => Math.min(filteredSteps.length - 1, prev + 1))}
                    className="btn btn-primary btn-sm"
                    style={{ opacity: currentStepIndex === filteredSteps.length - 1 ? 0.4 : 1 }}
                  >
                    Próximo <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {filteredSteps[currentStepIndex].icon}
                </div>
                <div>
                  <h4 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
                    {filteredSteps[currentStepIndex].title}
                  </h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {filteredSteps[currentStepIndex].description}
                  </p>
                </div>
              </div>

              {/* Step indicator dots */}
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '10px' }}>
                {filteredSteps.map((_, idx) => (
                  <div
                    key={idx}
                    onClick={() => setCurrentStepIndex(idx)}
                    style={{
                      width: idx === currentStepIndex ? '24px' : '8px',
                      height: '8px',
                      borderRadius: '4px',
                      background: idx === currentStepIndex ? 'var(--accent-color)' : 'var(--border-color)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* VIEW MODE: GRID (GRADE DE CARDS) */}
          {viewMode === 'grid' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: '16px'
            }}>
              {filteredSteps.map((step, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-card)',
                    borderRadius: '14px',
                    border: '1px solid var(--border-color)',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  className="tutorial-step-card"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {step.icon}
                    </div>
                    {step.badge && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '8px',
                        background: 'var(--accent-glow)',
                        color: 'var(--accent-color)'
                      }}>
                        {step.badge}
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                      {step.title}
                    </h4>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredSteps.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Nenhum tópico encontrado para "{searchQuery}".
            </div>
          )}

          {/* DICAS PROFISSIONAIS (PRO TIPS) */}
          {currentSection.proTips.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)',
              borderRadius: '14px',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              padding: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Lightbulb size={18} color="#f59e0b" />
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Dicas Profissionais de Operação
                </h4>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {currentSection.proTips.map((tip, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                    <CheckCircle size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* PERGUNTAS FREQUENTES (FAQ) */}
          {currentSection.faqs.length > 0 && (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              padding: '20px'
            }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HelpCircle size={16} color="var(--accent-color)" />
                Perguntas Frequentes (FAQ)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {currentSection.faqs.map((faq, idx) => (
                  <div key={idx} style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <strong style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      {faq.q}
                    </strong>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      {faq.a}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{
          padding: '16px 28px',
          background: 'rgba(0, 0, 0, 0.2)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <Sparkles size={14} color="var(--accent-color)" />
            Dica: Você pode acessar este guia a qualquer momento pelo botão de Ajuda.
          </div>
          <button className="btn btn-primary btn-sm" onClick={onClose} style={{ padding: '8px 20px' }}>
            Entendi, Fechar Guia
          </button>
        </div>
      </div>
    </div>
  );
};
