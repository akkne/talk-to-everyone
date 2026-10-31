import { useLayoutEffect, useState, type RefObject } from 'react';

interface Line { key: string; x1: number; y1: number; x2: number; y2: number }
/** <summary>Measure actual card pins after layout and resize; SVG never intercepts clicks.</summary> */
export function Threads({ root, pairs }: { root: RefObject<HTMLDivElement>; pairs: [string, string][] }) {
  const [lines, setLines] = useState<Line[]>([]);
  useLayoutEffect(() => {
    const element = root.current; if (!element) return;
    const measure = () => {
      const area = element.getBoundingClientRect();
      const cards = new Map(Array.from(element.querySelectorAll<HTMLElement>('[data-npc]')).map(card => [card.dataset.npc, card]));
      setLines(pairs.flatMap(([a, b]) => {
        const first = cards.get(a)?.querySelector('.pin')?.getBoundingClientRect();
        const second = cards.get(b)?.querySelector('.pin')?.getBoundingClientRect();
        if (!first || !second) return [];
        return [{ key: `${a}:${b}`, x1: first.left + first.width / 2 - area.left, y1: first.top + first.height / 2 - area.top, x2: second.left + second.width / 2 - area.left, y2: second.top + second.height / 2 - area.top }];
      }));
    };
    const observer = new ResizeObserver(measure); observer.observe(element);
    element.querySelectorAll('[data-npc]').forEach(card => observer.observe(card)); measure();
    return () => observer.disconnect();
  }, [root, pairs]);
  return <svg className="threads" aria-hidden="true">{lines.map(({ key, ...line }) => <g key={key}><line {...line} stroke="#76a1bf" strokeWidth="4" opacity="0.12" /><line {...line} stroke="#76a1bf" strokeWidth="1.5" /></g>)}</svg>;
}
