import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/modules.mjs';

function mockCanvas() {
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillRect() {},
        strokeRect() {},
        fillText() {},
        measureText: text => ({ width: text.length * 12 }),
      }),
    }),
  };
}

mockCanvas();

const { Npc } = await loadModule('src/scene/Npc.ts');
const { DEFAULT_AVATAR } = await loadModule('src/components/AvatarCustomizer.tsx');

test('avatar customizer: DEFAULT_AVATAR has valid initial properties', () => {
  assert.ok(DEFAULT_AVATAR.bodyColor);
  assert.equal(DEFAULT_AVATAR.hairStyle, 'short');
  assert.ok(DEFAULT_AVATAR.hairColor);
  assert.equal(DEFAULT_AVATAR.eyes, 'dots');
  assert.equal(DEFAULT_AVATAR.mouth, 'smile');
  assert.ok(DEFAULT_AVATAR.skinTone);
  assert.equal(DEFAULT_AVATAR.accessory, 'none');
});

test('avatar 3D rendering: Npc initializes with custom avatar and builds accessory/hair groups', () => {
  const actor = new Npc({
    id: 'player-1',
    number: 1,
    name: 'Тестовый Игрок',
    color: '#ff0000',
    anchorId: 'chair-1',
    avatar: {
      bodyColor: '#e0533c',
      hairStyle: 'spiky',
      hairColor: '#e0ac3c',
      eyes: 'wide',
      mouth: 'grin',
      skinTone: '#ffdfc4',
      accessory: 'glasses',
    },
  });

  const avatar = actor.group.getObjectByName('avatar');
  assert.ok(avatar, 'avatar object exists');

  // Verify styleGroup is attached to avatar
  const styleGroup = avatar.children.find(c => c.children && c.children.length > 0);
  assert.ok(styleGroup, 'styleGroup is present');

  actor.dispose();
});

test('avatar 3D rendering: updateAvatar dynamically updates hair and accessories', () => {
  const actor = new Npc({
    id: 'player-2',
    number: 2,
    name: 'Судья 2',
    color: '#00ff00',
    anchorId: 'chair-2',
  });

  // Test updating to headphones
  actor.updateAvatar({
    bodyColor: '#2b9348',
    hairStyle: 'bun',
    hairColor: '#5c3d2e',
    eyes: 'visor',
    mouth: 'smirk',
    skinTone: '#c68642',
    accessory: 'headphones',
  });

  // Test updating to cap
  actor.updateAvatar({
    bodyColor: '#5e548e',
    hairStyle: 'afro',
    hairColor: '#1c1c1c',
    eyes: 'wink',
    mouth: 'surprised',
    skinTone: '#8d5524',
    accessory: 'cap',
  });

  // Test updating to beanie and neutral mouth
  actor.updateAvatar({
    bodyColor: '#3d79b2',
    hairStyle: 'bald',
    hairColor: '#000000',
    eyes: 'focused',
    mouth: 'neutral',
    skinTone: '#fcd0a1',
    accessory: 'beanie',
  });

  actor.dispose();
});
