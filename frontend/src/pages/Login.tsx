import React, { useState } from 'react';
import { User as UserIcon, Lock } from 'lucide-react';
import { TourGuide, TourStep } from '../components/TourGuide';
import { TutorialButton } from '../components/TutorialButton';

interface LoginProps {
  onLoginSuccess: (token: string, userData: any) => void;
  theme: 'dark' | 'light';
}

const loginTourSteps: TourStep[] = [
  {
    target: '#tour-login-username',
    title: '1. Nome de Usuário',
    content: 'Digite seu usuário cadastrado (ex: admin para Administrador ou operador).',
    position: 'bottom'
  },
  {
    target: '#tour-login-password',
    title: '2. Senha de Acesso',
    content: 'Digite sua senha criptografada para autenticar com segurança.',
    position: 'bottom'
  },
  {
    target: '#tour-login-btn',
    title: '3. Entrar no Painel',
    content: 'Clique para acessar o painel de Playout, Biblioteca e Configurações.',
    position: 'bottom'
  }
];

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, theme }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Credenciais inválidas. Tente novamente.');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Top right Help / Tutorial Button */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 10 }}>
        <TutorialButton onClick={() => setShowTutorial(true)} label="Tutorial Interativo" />
      </div>

      <div className="login-card glass" id="tour-login-card">
        <div className="login-logo">
          <img 
            src={theme === 'dark' ? '/logo-projyn-icon-clara.png' : '/logo-projyn-icon-escura.png'} 
            alt="Projyn Logo" 
            style={{ height: '64px', objectFit: 'contain', marginBottom: '8px' }} 
          />
        </div>
        <h2>Acesse o Painel</h2>
        <p>Insira suas credenciais para gerenciar a biblioteca e playout.</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" id="tour-login-username">
            <label className="form-label" htmlFor="username">
              Nome de Usuário
            </label>
            <div style={{ position: 'relative' }}>
              <UserIcon
                size={18}
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)',
                }}
              />
              <input
                id="username"
                type="text"
                className="input-text"
                style={{ paddingLeft: '44px' }}
                placeholder="Ex: admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '28px' }} id="tour-login-password">
            <label className="form-label" htmlFor="password">
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={18}
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)',
                }}
              />
              <input
                id="password"
                type="password"
                className="input-text"
                style={{ paddingLeft: '44px' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <button
            id="tour-login-btn"
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px' }}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>
      </div>

      {/* INTERACTIVE SPOTLIGHT TOUR GUIDE */}
      <TourGuide
        isOpen={showTutorial}
        steps={loginTourSteps}
        onClose={() => setShowTutorial(false)}
        tourKey="login"
      />
    </div>
  );
};
