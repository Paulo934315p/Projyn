export interface User {
  id: number;
  username: string;
  is_admin: boolean;
  can_create_category: boolean;
  can_add_songs: boolean;
  can_play_control: boolean;
  see_all_categories: boolean;
  allowed_categories: string[]; // IDs das categorias permitidas
}

export interface Video {
  id: string;
  title: string;
  channel: string;
  duration: number | string; // Pode ser segundos (number) ou string formatada
  thumbnail: string;
  url: string;
  streamUrl?: string;
  streamExt?: string;
  streamProtocol?: string;
  streamHeight?: number;
  streamFormatId?: string;
  streamQuality?: string;
  preparedAt?: number;
  savedAt?: number;
  categoryId?: string;
}

export interface Category {
  id: string;
  title: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  videos?: Video[];
}

export interface DisplaySettings {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fullscreen: boolean;
  screenId?: string;
  screenLabel?: string;
}

export interface PlayerSettings {
  autoplay: boolean;
  muted: boolean;
  volume: number;
  loop: boolean;
  showControls: boolean;
  clickToMinimize?: boolean;
  autoMinimizeOnPlay?: boolean;
}

export interface Settings {
  display: DisplaySettings;
  player: PlayerSettings;
  presets?: Preset[];
}

export interface Preset {
  id: string;
  name: string;
  display: DisplaySettings;
  player: PlayerSettings;
}

export interface DisplayState {
  ready: boolean;
  video: Video | null;
  time: number;
  duration: number;
  playing: boolean;
  muted: boolean;
  volume?: number;
  errorCode: number;
  sessionId?: string;
}

export const formatDuration = (val: number | string | undefined | null): string => {
  if (!val && val !== 0) return '0:00';
  
  if (typeof val === 'string' && val.includes(':')) {
    return val;
  }
  
  const num = typeof val === 'string' ? parseFloat(val) : Number(val);
  if (isNaN(num) || !isFinite(num) || num <= 0) {
    return typeof val === 'string' && val.trim() ? val : '0:00';
  }
  
  const totalSeconds = Math.floor(num);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
