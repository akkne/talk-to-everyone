import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Npc } from '../scene/Npc';
import type { AvatarAssetItem, PlayerAvatar } from '../shared/types';
import { useAuthStore, updateAvatar } from '../store/authStore';
import { Icon } from './Icon';

export const DEFAULT_AVATAR: PlayerAvatar = {
  bodyColor: '#dfbf63',
  hairStyle: 'short',
  hairColor: '#332b2a',
  eyes: 'dots',
  mouth: 'smile',
  skinTone: '#e9bd9e',
  accessory: 'none',
};

const LOCAL_STORAGE_KEY = 'tte_custom_avatar';

export function getLocalAvatar(): PlayerAvatar {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) return { ...DEFAULT_AVATAR, ...JSON.parse(raw) };
  } catch {
    // fallback
  }
  return DEFAULT_AVATAR;
}

export function saveLocalAvatar(avatar: PlayerAvatar) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(avatar));
  } catch {
    // ignore
  }
}

interface Props {
  onClose?: () => void;
  inline?: boolean;
}

export function AvatarCustomizer({ onClose, inline = false }: Props) {
  const { user, jwt } = useAuthStore();
  const [avatar, setAvatar] = useState<PlayerAvatar>(() => user?.avatar ?? getLocalAvatar());
  const [assets, setAssets] = useState<AvatarAssetItem[]>([]);
  const [activeTab, setActiveTab] = useState<'bodyColor' | 'hairStyle' | 'hairColor' | 'eyes' | 'mouth' | 'skinTone' | 'accessory'>('bodyColor');
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const npcRef = useRef<Npc | null>(null);
  const rotationRef = useRef<number>(0.2);
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);

  // Sync when user changes or loads
  useEffect(() => {
    if (user?.avatar) {
      setAvatar(user.avatar);
      saveLocalAvatar(user.avatar);
    }
  }, [user]);

  // Load avatar assets from database
  useEffect(() => {
    let active = true;
    fetch('/api/avatar/assets')
      .then(res => (res.ok ? res.json() : []))
      .then((data: AvatarAssetItem[]) => {
        if (active && Array.isArray(data) && data.length > 0) {
          setAssets(data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Three.js 3D character preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();

    // Soft studio lighting
    const ambientLight = new THREE.AmbientLight('#ffffff', 1.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#fff5ea', 2.6);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#a5c5e8', 1.2);
    fillLight.position.set(-3, 3, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#fed7aa', 1.0);
    rimLight.position.set(0, -2, -3);
    scene.add(rimLight);

    // Pedestal
    const pedestalGeo = new THREE.CylinderGeometry(0.7, 0.76, 0.1, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({ color: '#273129', roughness: 0.8, metalness: 0.1 });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.05;
    scene.add(pedestal);

    const ringGeo = new THREE.RingGeometry(0.71, 0.74, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#c4b382', side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    camera.position.set(0, 1.25, 3.4);
    camera.lookAt(0, 1.15, 0);

    const npc = new Npc({
      id: 'preview',
      number: 0,
      name: user?.name || 'Вы',
      color: avatar.bodyColor,
      anchorId: '',
      avatar,
    });
    npc.group.position.set(0, 0, 0);
    scene.add(npc.group);
    npcRef.current = npc;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let startAt = performance.now();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const t = (now - startAt) / 1000;

      // Gentle breathing idle & user yaw
      const idleSway = Math.sin(t * 1.5) * 0.025;
      npc.group.rotation.y = rotationRef.current + idleSway;
      npc.group.position.y = Math.sin(t * 2) * 0.015;

      npc.update(now);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      npc.dispose();
      renderer.dispose();
      npcRef.current = null;
    };
  }, []);

  // Update 3D avatar when state changes
  useEffect(() => {
    if (npcRef.current) {
      npcRef.current.updateAvatar(avatar);
      npcRef.current.setName(user?.name || 'Вы');
    }
    saveLocalAvatar(avatar);
  }, [avatar, user?.name]);

  // Drag interaction to spin character
  const onPointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastXRef.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    rotationRef.current += deltaX * 0.015;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const handleSelect = (category: keyof PlayerAvatar, value: string) => {
    setAvatar(prev => ({ ...prev, [category]: value }));
    setSavedFeedback(false);
  };

  const handleRandomize = () => {
    const pickRandom = (cat: string, fallback: string) => {
      const items = assets.filter(a => a.category === cat);
      if (items.length === 0) return fallback;
      return items[Math.floor(Math.random() * items.length)].value;
    };

    setAvatar({
      bodyColor: pickRandom('bodyColor', '#3b82f6'),
      hairStyle: pickRandom('hairStyle', 'spiky'),
      hairColor: pickRandom('hairColor', '#6a4937'),
      eyes: pickRandom('eyes', 'wide'),
      mouth: pickRandom('mouth', 'smile'),
      skinTone: pickRandom('skinTone', '#e9bd9e'),
      accessory: pickRandom('accessory', 'none'),
    });
    setSavedFeedback(false);
  };

  const handleReset = () => {
    setAvatar(DEFAULT_AVATAR);
    setSavedFeedback(false);
  };

  const handleSave = async () => {
    saveLocalAvatar(avatar);
    if (jwt) {
      setSaving(true);
      const ok = await updateAvatar(avatar);
      setSaving(false);
      if (ok) {
        setSavedFeedback(true);
        setTimeout(() => setSavedFeedback(false), 2500);
      }
    } else {
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2500);
    }
  };

  // Filter assets by active category (with fallbacks if DB not loaded yet)
  const currentAssets = assets.filter(a => a.category === activeTab);

  const fallbackCategories: Record<string, { id: string; name: string; value: string }[]> = {
    bodyColor: [
      { id: 'b1', name: 'Горчичный', value: '#dfbf63' },
      { id: 'b2', name: 'Синий', value: '#3b82f6' },
      { id: 'b3', name: 'Изумрудный', value: '#10b981' },
      { id: 'b4', name: 'Рубиновый', value: '#ef4444' },
      { id: 'b5', name: 'Фиолетовый', value: '#8b5cf6' },
      { id: 'b6', name: 'Оранжевый', value: '#f97316' },
      { id: 'b7', name: 'Розовый', value: '#ec4899' },
      { id: 'b8', name: 'Бирюзовый', value: '#06b6d4' },
      { id: 'b9', name: 'Графит', value: '#334155' },
      { id: 'b10', name: 'Белый', value: '#f1f5f9' },
    ],
    hairStyle: [
      { id: 'h1', name: 'Классика', value: 'short' },
      { id: 'h2', name: 'Ирокез', value: 'spiky' },
      { id: 'h3', name: 'Каре', value: 'bob' },
      { id: 'h4', name: 'Пучок', value: 'bun' },
      { id: 'h5', name: 'Афро', value: 'afro' },
      { id: 'h6', name: 'Без волос', value: 'bald' },
    ],
    hairColor: [
      { id: 'hc1', name: 'Брюнет', value: '#241f25' },
      { id: 'hc2', name: 'Каштановый', value: '#6a4937' },
      { id: 'hc3', name: 'Блонд', value: '#e2ba7d' },
      { id: 'hc4', name: 'Рыжий', value: '#b84c24' },
      { id: 'hc5', name: 'Синий', value: '#2563eb' },
      { id: 'hc6', name: 'Розовый', value: '#ec4899' },
      { id: 'hc7', name: 'Лаванда', value: '#8b5cf6' },
    ],
    eyes: [
      { id: 'e1', name: 'Точки', value: 'dots' },
      { id: 'e2', name: 'Большие', value: 'wide' },
      { id: 'e3', name: 'Прищур', value: 'focused' },
      { id: 'e4', name: 'Подмигивание', value: 'wink' },
      { id: 'e5', name: 'Кибер-визор', value: 'visor' },
    ],
    mouth: [
      { id: 'm1', name: 'Улыбка', value: 'smile' },
      { id: 'm2', name: 'Нейтральный', value: 'neutral' },
      { id: 'm3', name: 'Оскал', value: 'grin' },
      { id: 'm4', name: 'Удивление', value: 'surprised' },
      { id: 'm5', name: 'Ухмылка', value: 'smirk' },
    ],
    skinTone: [
      { id: 's1', name: 'Светлый', value: '#e9bd9e' },
      { id: 's2', name: 'Оливковый', value: '#c78f6c' },
      { id: 's3', name: 'Фарфор', value: '#f0cfb4' },
      { id: 's4', name: 'Бронзовый', value: '#ad7659' },
      { id: 's5', name: 'Персиковый', value: '#dca984' },
    ],
    accessory: [
      { id: 'a1', name: 'Нет', value: 'none' },
      { id: 'a2', name: 'Наушники', value: 'headphones' },
      { id: 'a3', name: 'Очки', value: 'glasses' },
      { id: 'a4', name: 'Кепка', value: 'cap' },
      { id: 'a5', name: 'Шапка-бини', value: 'beanie' },
    ],
  };

  const options = currentAssets.length > 0
    ? currentAssets
    : (fallbackCategories[activeTab] || []);

  const tabs: { key: typeof activeTab; label: string; icon: string }[] = [
    { key: 'bodyColor', label: 'Корпус', icon: '🎨' },
    { key: 'hairStyle', label: 'Причёска', icon: '💇' },
    { key: 'hairColor', label: 'Цвет волос', icon: '✨' },
    { key: 'eyes', label: 'Глаза', icon: '👀' },
    { key: 'mouth', label: 'Рот', icon: '👄' },
    { key: 'skinTone', label: 'Кожа', icon: '👤' },
    { key: 'accessory', label: 'Аксессуар', icon: '🧢' },
  ];

  return (
    <div className={`avatar-customizer ${inline ? 'inline' : 'modal'}`} role="region" aria-label="Настройка аватара">
      <div className="customizer-card">
        <header className="customizer-header">
          <div>
            <h3>Внешность вашего судьи</h3>
            <p>Выберите образ, который увидят другие игроки в студии и лобби.</p>
          </div>
          {onClose && (
            <button type="button" className="close-btn" onClick={onClose} aria-label="Закрыть">
              <Icon name="close" size={18} />
            </button>
          )}
        </header>

        <div className="customizer-body">
          {/* 3D Preview Column */}
          <div className="preview-pane">
            <div
              className="canvas-wrap"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              title="Зажмите мышь и двигайте, чтобы повернуть аватара"
            >
              <canvas ref={canvasRef} />
              <div className="drag-hint">
                <Icon name="arrow" />
                <span>Потяните для вращения</span>
              </div>
            </div>

            <div className="preview-controls">
              <button
                type="button"
                className="btn ghost small"
                onClick={() => { rotationRef.current = 0.2; }}
                title="Повернуть лицом"
              >
                Спереди
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => { rotationRef.current = Math.PI; }}
                title="Повернуть спиной"
              >
                Со спины
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={handleRandomize}
                title="Случайный образ"
              >
                🎲 Случайно
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={handleReset}
                title="Сбросить по умолчанию"
              >
                Сброс
              </button>
            </div>
          </div>

          {/* Controls Column */}
          <div className="options-pane">
            <nav className="customizer-tabs" aria-label="Категории кастомизации">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span className="tab-icon">{tab.icon}</span>
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </nav>

            <div className="options-grid">
              {['bodyColor', 'hairColor', 'skinTone'].includes(activeTab) ? (
                // Color swatches
                <div className="swatches-grid">
                  {options.map(opt => {
                    const isSelected = avatar[activeTab as keyof PlayerAvatar] === opt.value;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`color-swatch ${isSelected ? 'selected' : ''}`}
                        style={{ backgroundColor: opt.value }}
                        onClick={() => handleSelect(activeTab as keyof PlayerAvatar, opt.value)}
                        title={opt.name}
                        aria-label={opt.name}
                      >
                        {isSelected && <span className="swatch-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Item buttons (styles, eyes, mouth, accessories)
                <div className="items-list">
                  {options.map(opt => {
                    const isSelected = avatar[activeTab as keyof PlayerAvatar] === opt.value;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`item-option-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelect(activeTab as keyof PlayerAvatar, opt.value)}
                      >
                        <span className="item-name">{opt.name}</span>
                        {isSelected && <span className="item-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="customizer-actions">
              <div className="save-status">
                {savedFeedback && <span className="status-badge success">✓ Сохранено в БД</span>}
                {!user && <span className="status-note">Войдите в аккаунт для постоянного сохранения на сервере.</span>}
              </div>
              <button
                type="button"
                className="btn primary save-btn"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? 'Сохранение…' : 'Сохранить аватара'}
                <Icon name="arrow" />
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
